import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from pydantic import BaseModel
from typing import Optional

from core.ssh_executor import SSHExecutor
from core.config import settings
from core.security import get_current_user, verify_ws_token
from core.locks import deployment_lock
import shlex

router = APIRouter()

def _make_executor() -> SSHExecutor:
    return SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )

# ─── Models ────────────────────────────────────────────────────────────────────

class ImageBuildPayload(BaseModel):
    name: str
    source: str
    fastestMirror: bool = True
    maxDownloads: int = 10
    dnfTimeout: int = 300
    minRate: int = 1000
    excludePkgs: str = "linux-firmware*"
    installEpel: bool = True
    enableCrb: bool = True
    installOhpc: bool = True
    packages: str = "ohpc-base-compute, ohpc-slurm-client, chrony, lmod-ohpc, nhc-ohpc, ncurses"
    enabledServices: str = "munge, slurmd, chronyd"
    ntpServer: str = "192.168.20.1"
    makeStep: str = "1 -1"
    forceSync: bool = True
    memlockUnlimited: bool = True
    pamSlurmRestrict: bool = True
    syslogTarget: str = "192.168.10.2"
    syslogPort: int = 514
    forceDracut: bool = True

# ─── List Images ───────────────────────────────────────────────────────────────

@router.get("/")
async def list_images(user: dict = Depends(get_current_user)):
    """
    Runs `wwctl image list` on the Master Node and returns structured image data.
    """
    executor = _make_executor()
    images = []
    raw_lines = []

    try:
        async for line in executor.run_command_stream("wwctl image list"):
            raw_lines.append(line)

        # Parse the output:
        # IMAGE NAME
        # ----------
        # alma9-dev
        # almalinux-9
        past_separator = False
        for line in raw_lines:
            line = line.strip()
            if not line or "ERROR" in line or "FAILED" in line:
                continue
            if line.startswith("---"):
                past_separator = True
                continue
            if not past_separator:
                continue  # skip header lines
            # Each remaining line is an image name
            images.append({
                "name": line,
                "nodes": "—",
                "built": "unknown",
                "size": "—",
            })

        return {"status": "success", "images": images, "rawOutput": raw_lines}

    except Exception as e:
        return {"status": "error", "message": str(e), "images": [], "rawOutput": [str(e)]}


# ─── Delete Image ──────────────────────────────────────────────────────────────

@router.delete("/{image_name}")
async def delete_image(image_name: str, user: dict = Depends(get_current_user)):
    """
    Deletes a Warewulf image from the Master Node.
    """
    safe_image_name = shlex.quote(image_name)
    executor = _make_executor()
    output = []
    try:
        async with deployment_lock:
            async for line in executor.run_command_stream(
                f"wwctl image delete {safe_image_name} --yes 2>&1"
            ):
                output.append(line)
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─── Build Image via WebSocket ─────────────────────────────────────────────────

@router.websocket("/build/ws")
async def build_image_ws(websocket: WebSocket, token: str = Query(None)):
    """
    Streams Phase 3 image build process to the client.
    Accepts a JSON payload with image configuration via the first WS message.
    """
    await websocket.accept()

    try:
        if not token:
            await websocket.send_text("[ERROR] Unauthorized: Missing token")
            await websocket.close(code=1008)
            return

        try:
            verify_ws_token(token)
        except Exception as e:
            await websocket.send_text(f"[ERROR] Unauthorized: {str(e)}")
            await websocket.close(code=1008)
            return

        # Receive the build config as JSON from the first message
        data = await websocket.receive_json()
        cfg = ImageBuildPayload(**data)
        
        # Sanitize fields for RCE prevention
        cfg.name = shlex.quote(cfg.name)
        cfg.source = shlex.quote(cfg.source)
        cfg.ntpServer = shlex.quote(cfg.ntpServer)
        cfg.syslogTarget = shlex.quote(cfg.syslogTarget)
        cfg.packages = " ".join([shlex.quote(p.strip()) for p in cfg.packages.replace(',', ' ').split() if p.strip()])
        cfg.enabledServices = " ".join([shlex.quote(p.strip()) for p in cfg.enabledServices.replace(',', ' ').split() if p.strip()])

        await deployment_lock.acquire()
        lock_acquired = True

        executor = _make_executor()

        async def run_and_check(cmd: str, step_name: str):
            async for line in executor.run_command_stream(cmd):
                await websocket.send_text(line)
                if "[ERROR]" in line or "[SSH ERROR]" in line or "[SYSTEM ERROR]" in line:
                    raise Exception(f"{step_name} failed. Halting build.")

        await websocket.send_text(f"[SYSTEM] Starting build for image: {cfg.name}")
        await websocket.send_text(f"[SYSTEM] Source: {cfg.source}")

        # ── Step 1A: Import base container ────────────────────────────────────
        await websocket.send_text("[STEP 1] Importing base OS container from registry...")
        cmd = (
            f"wwctl image import {cfg.source} {cfg.name} --syncuser --update 2>&1 || "
            f"wwctl image import {cfg.source} {cfg.name} --syncuser --force 2>&1"
        )
        await run_and_check(cmd, "Step 1A (Import)")

        # ── Step 1B: DNF optimizations + Repos ────────────────────────────────
        await websocket.send_text("[STEP 2] Optimizing DNF and installing repositories...")
        pkgs_to_install = "epel-release dnf-plugins-core"
        if cfg.installOhpc:
            pkgs_to_install += " http://repos.openhpc.community/OpenHPC/3/EL_9/x86_64/ohpc-release-3-1.el9.x86_64.rpm"

        repo_script = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
cat > $CHROOT/tmp/setup_repo.sh << 'EOF'
#!/bin/bash
set -e
{'echo "fastestmirror=True" >> /etc/dnf/dnf.conf' if cfg.fastestMirror else ''}
echo "max_parallel_downloads={cfg.maxDownloads}" >> /etc/dnf/dnf.conf
echo "ip_resolve=4" >> /etc/dnf/dnf.conf
echo "excludepkgs={cfg.excludePkgs}" >> /etc/dnf/dnf.conf
echo "timeout={cfg.dnfTimeout}" >> /etc/dnf/dnf.conf
echo "minrate={cfg.minRate}" >> /etc/dnf/dnf.conf
{'dnf -y install ' + pkgs_to_install if cfg.installEpel or cfg.installOhpc else ''}
{'dnf config-manager --set-enabled crb' if cfg.enableCrb else ''}
EOF
chmod +x $CHROOT/tmp/setup_repo.sh && \\
wwctl image exec --build=false {cfg.name} /tmp/setup_repo.sh 2>&1 && \\
rm -f $CHROOT/tmp/setup_repo.sh"""

        await run_and_check(repo_script, "Step 1B (Repos)")

        # ── Step 1C: Inject packages + enable services ─────────────────────────
        await websocket.send_text("[STEP 3] Injecting compute packages into image...")
        services = " ".join(cfg.enabledServices.replace(",", " ").split())
        inject_script = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
cat > $CHROOT/tmp/setup_inject.sh << 'EOF'
#!/bin/bash
set -e
dnf -y install {cfg.packages}
systemctl enable {services}
EOF
chmod +x $CHROOT/tmp/setup_inject.sh && \\
wwctl image exec --build=false {cfg.name} /tmp/setup_inject.sh 2>&1 && \\
rm -f $CHROOT/tmp/setup_inject.sh"""
        await run_and_check(inject_script, "Step 1C (Inject Packages)")

        # ── Step 1D: Overlays ──────────────────────────────────────────────────
        await websocket.send_text("[STEP 4] Configuring system overlays (Munge, Slurm, NTP, Mounts)...")
        overlay_cmd = f"""mkdir -p /srv/warewulf/overlays/nodeconfig/rootfs/export/apps && \\
wwctl overlay import -o --parents nodeconfig /etc/munge/munge.key && \\
wwctl overlay chown nodeconfig /etc/munge/munge.key "$(id -u munge):$(id -g munge)" && \\
wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/slurm/slurmd.ww /etc/sysconfig/slurmd.ww && \\
wwctl profile set --yes nodes --tagadd slurmctld="{settings.PROV_IP}" && \\
wwctl overlay import -o --parents nodeconfig /etc/subuid && \\
wwctl overlay import -o --parents nodeconfig /etc/subgid && \\
wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/chrony.conf.ww /etc/chrony.conf.ww && \\
wwctl profile set --yes nodes --tagadd ntpserver="{settings.PROV_IP}" && \\
echo "makestep {cfg.makeStep}" >> /srv/warewulf/overlays/nodeconfig/rootfs/etc/chrony.conf.ww && \\
wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/network/NetworkManager-wait-online.service.d/override.conf /etc/systemd/system/NetworkManager-wait-online.service.d/override.conf && \\
OVERLAY_DIR="/srv/warewulf/overlays/nodeconfig/rootfs" && \\
mkdir -p $OVERLAY_DIR/etc/systemd/system/multi-user.target.wants && \\
cat << 'UNIT' > $OVERLAY_DIR/etc/systemd/system/export-apps.mount
[Unit]
Description=NFS Mount for Shared Applications
After=network.target

[Mount]
What={settings.PROV_IP}:/export/apps
Where=/export/apps
Type=nfs
Options=nfsvers=4,nodev,nosuid,bg,nofail,_netdev

[Install]
WantedBy=multi-user.target
UNIT
cat << 'AUTO' > $OVERLAY_DIR/etc/systemd/system/export-apps.automount
[Unit]
Description=Automount for Shared Applications
After=network.target

[Automount]
Where=/export/apps
TimeoutIdleSec=600

[Install]
WantedBy=multi-user.target
AUTO
ln -sf ../export-apps.automount $OVERLAY_DIR/etc/systemd/system/multi-user.target.wants/export-apps.automount 2>&1"""
        await run_and_check(overlay_cmd, "Step 1D (Overlays)")

        # ── Step 1E: memlock + pam_slurm ──────────────────────────────────────
        if cfg.memlockUnlimited:
            await websocket.send_text("[STEP 5] Setting unlimited memlock limits...")
            limits_cmd = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
echo "* soft memlock unlimited" >> $CHROOT/etc/security/limits.d/40-ohpc-limits.conf && \\
echo "* hard memlock unlimited" >> $CHROOT/etc/security/limits.d/40-ohpc-limits.conf 2>&1"""
            await run_and_check(limits_cmd, "Step 1E (Memlock limits)")

        if cfg.pamSlurmRestrict:
            await websocket.send_text("[STEP 5b] Restricting SSH via pam_slurm...")
            pam_cmd = f'CHROOT=$(wwctl image show {cfg.name}) && echo "account required pam_slurm.so" >> $CHROOT/etc/pam.d/sshd 2>&1'
            await run_and_check(pam_cmd, "Step 1E (PAM Slurm)")

        # ── Step 1E.2: Clock sync fix ──────────────────────────────────────────
        await websocket.send_text("[STEP 6] Baking clock sync fix (prevents Munge auth failures on boot)...")
        clock_cmd = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
cat > $CHROOT/etc/chrony.conf << 'CHRONY_CONF'
server {cfg.ntpServer} iburst prefer
makestep {cfg.makeStep}
driftfile /var/lib/chrony/drift
rtcsync
CHRONY_CONF
mkdir -p $CHROOT/etc/systemd/system/slurmd.service.d && \\
cat > $CHROOT/etc/systemd/system/slurmd.service.d/wait-for-clock.conf << 'DROPIN'
[Unit]
After=munge.service network-online.target chronyd.service
[Service]
ExecStartPre=/usr/bin/chronyc waitsync 60
ExecStartPre=/usr/bin/chronyc makestep
DROPIN
 2>&1"""
        await run_and_check(clock_cmd, "Step 1E.2 (Clock sync)")

        # ── Step 1E.3: Spack Global Profile setup ──────────────────────────────
        await websocket.send_text("[STEP 6b] Baking Spack global environment setup into profile.d...")
        spack_mod_cmd = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
mkdir -p $CHROOT/etc/profile.d && \\
cat > $CHROOT/etc/profile.d/spack_setup.sh << 'SPACK_ENV'
if [ -f /export/apps/spack/share/spack/setup-env.sh ]; then
    . /export/apps/spack/share/spack/setup-env.sh
fi
# Override for CPU microarchitecture mismatch
module use /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core
SPACK_ENV
chmod +x $CHROOT/etc/profile.d/spack_setup.sh 2>&1"""
        await run_and_check(spack_mod_cmd, "Step 1E.3 (Spack Profile)")

        # ── Step 1F: Syslog forwarding ─────────────────────────────────────────
        await websocket.send_text("[STEP 7] Configuring syslog forwarding to Master Node...")
        syslog_cmd = fr"""CHROOT=$(wwctl image show {cfg.name}) && \
echo '*.* action(type="omfwd" Target="{cfg.syslogTarget}" Port="{cfg.syslogPort}" Protocol="udp")' >> $CHROOT/etc/rsyslog.conf 2>&1"""
        await run_and_check(syslog_cmd, "Step 1F (Syslog forwarding)")

        # ── Step 2A: Dracut ────────────────────────────────────────────────────
        if cfg.forceDracut:
            await websocket.send_text("[STEP 8] Regenerating Dracut initramfs (this may take a few minutes)...")
            dracut_script = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
cat > $CHROOT/tmp/setup_dracut.sh << 'EOF'
#!/bin/bash
KVER=$(ls -1 /lib/modules | tail -n 1)
/usr/bin/dracut --force /boot/initramfs-${{KVER}}.img ${{KVER}}
EOF
chmod +x $CHROOT/tmp/setup_dracut.sh && \\
wwctl image exec --build=false {cfg.name} /tmp/setup_dracut.sh 2>&1 && \\
rm -f $CHROOT/tmp/setup_dracut.sh"""
            await run_and_check(dracut_script, "Step 2A (Dracut)")

        # ── Step 2B: Build image ───────────────────────────────────────────────
        await websocket.send_text("[STEP 9] Compiling VNFS image and rebuilding overlays...")
        await run_and_check(f"wwctl image build {cfg.name} && wwctl overlay build && systemctl restart warewulfd 2>&1", "Step 2B (Build image)")

        # ── Step 2C: Start control plane ──────────────────────────────────────
        await websocket.send_text("[STEP 10] Enabling and starting Slurm control plane...")
        await run_and_check("systemctl enable --now munge slurmctld 2>&1", "Step 2C (Start Slurm)")

        await websocket.send_text("\n[SYSTEM] ✅ Image build complete!")
        await websocket.send_text(f"[SYSTEM] Image '{cfg.name}' is ready to be assigned to nodes.")

    except WebSocketDisconnect:
        print("Client disconnected during image build")
    except Exception as e:
        try:
            await websocket.send_text(f"[CRITICAL ERROR] {str(e)}")
        except:
            pass
    finally:
        if 'lock_acquired' in locals() and lock_acquired:
            deployment_lock.release()
        try:
            await websocket.close()
        except:
            pass
