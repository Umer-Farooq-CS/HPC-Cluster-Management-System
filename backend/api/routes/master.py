import asyncio
import yaml
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from typing import Optional

from core.ssh_executor import SSHExecutor
from core.config import settings
from core.security import get_current_user, SECRET_KEY, ALGORITHM
import jwt

router = APIRouter()

def _make_executor(ip: str, pass_: str) -> SSHExecutor:
    return SSHExecutor(
        host=ip,
        username=settings.MASTER_USER,
        password=pass_
    )

class MasterDeployPayload(BaseModel):
    # Network Configuration
    masterIp: str
    masterPass: str
    dataIp: str
    dataIpCidr: int
    provIp: str
    provIpCidr: int
    gateway: str
    dnsServers: str

    # Services
    disableFirewall: bool = True
    enableCrb: bool = True
    installEpel: bool = True

    # NTP
    ntpLocalStratum: int = 10
    ntpAllowRange: str = "all"

    # OpenHPC & Slurm
    openHpcRepoUrl: str = "http://repos.openhpc.community/OpenHPC/3/EL_9/x86_64/ohpc-release-3-1.el9.x86_64.rpm"
    installOhpcBase: bool = True
    installSlurmServer: bool = True

    # Warewulf
    wwProvNetwork: str = "192.168.20.0"
    wwNetmask: str = "255.255.255.0"
    wwDhcpStart: str = "192.168.20.10"
    wwDhcpEnd: str = "192.168.20.100"
    wwDhcpTemplate: str = "static"

    # Limits
    memlockSoft: str = "unlimited"
    memlockHard: str = "unlimited"

@router.websocket("/deploy/ws")
async def deploy_master_ws(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket to stream the live execution of Master Node provisioning (Phase 2).
    """
    await websocket.accept()

    try:
        if not token:
            await websocket.send_text("[ERROR] Unauthorized: Missing token")
            await websocket.close(code=1008)
            return

        try:
            jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except Exception as e:
            await websocket.send_text(f"[ERROR] Unauthorized: {str(e)}")
            await websocket.close(code=1008)
            return

        # Receive config payload
        data = await websocket.receive_json()
        cfg = MasterDeployPayload(**data)
        
        # We connect to the target Master IP provided in the form
        executor = _make_executor(cfg.masterIp, cfg.masterPass)

        async def run_and_check(cmd: str, step_name: str):
            async for line in executor.run_command_stream(cmd):
                await websocket.send_text(line)
                if "[ERROR]" in line or "[SSH ERROR]" in line or "[SYSTEM ERROR]" in line:
                    raise Exception(f"{step_name} failed. Halting build.")

        await websocket.send_text(f"[SYSTEM] Connecting to Master Node at {cfg.masterIp}...")
        
        # ── Step 1: Network Configurations ─────────────────────────────────────
        await websocket.send_text("[STEP 1] Configuring Data and Provisioning interfaces...")
        # Since NM connections might lock out on modification, we apply them safely
        net_cmd = f"""
        nmcli connection modify eno1 +ipv4.addresses {cfg.dataIp}/{cfg.dataIpCidr} 2>&1
        nmcli connection modify eno1 +ipv4.addresses {cfg.provIp}/{cfg.provIpCidr} 2>&1
        nmcli connection modify eno1 ipv4.gateway {cfg.gateway} 2>&1
        nmcli connection modify eno1 ipv4.dns "{cfg.dnsServers}" 2>&1
        nmcli connection up eno1 2>&1 || true
        """
        await run_and_check(net_cmd, "Step 1 (Network Config)")

        # ── Step 2: Firewall and Base Repos ───────────────────────────────────
        await websocket.send_text("[STEP 2] Setting up repositories and basic services...")
        repo_cmd = ""
        if cfg.disableFirewall:
            repo_cmd += "systemctl disable --now firewalld 2>&1\n"
        if cfg.installEpel:
            repo_cmd += "dnf -y install epel-release 2>&1\n"
        if cfg.enableCrb:
            repo_cmd += "dnf config-manager --set-enabled crb 2>&1\n"
        repo_cmd += "dnf -y update 2>&1"
        await run_and_check(repo_cmd, "Step 2 (Repos & Firewall)")

        # ── Step 3: NTP Configuration ──────────────────────────────────────────
        await websocket.send_text("[STEP 3] Configuring Chrony NTP Server...")
        ntp_cmd = f"""
        cat > /etc/chrony.conf << 'NTP_CONF'
server 0.pool.ntp.org iburst
server 1.pool.ntp.org iburst
driftfile /var/lib/chrony/drift
makestep 1.0 3
rtcsync
allow {cfg.wwProvNetwork}/{cfg.provIpCidr}
local stratum {cfg.ntpLocalStratum}
NTP_CONF
        systemctl enable --now chronyd 2>&1
        chronyc tracking 2>&1
        """
        await run_and_check(ntp_cmd, "Step 3 (NTP / Chrony)")

        # ── Step 4: OpenHPC and Slurm ──────────────────────────────────────────
        await websocket.send_text("[STEP 4] Installing OpenHPC and Slurm Server...")
        ohpc_cmd = ""
        if cfg.openHpcRepoUrl:
            ohpc_cmd += f"dnf -y install {cfg.openHpcRepoUrl} 2>&1\n"
        if cfg.installOhpcBase:
            ohpc_cmd += "dnf -y install ohpc-base 2>&1\n"
        if cfg.installSlurmServer:
            ohpc_cmd += "dnf -y install ohpc-slurm-server 2>&1\n"
        
        # Configure slurmctld
        ohpc_cmd += """
        MASTER_HOSTNAME=$(hostname -s)
        cp -f /etc/slurm/slurm.conf.example /etc/slurm/slurm.conf
        sed -i "s/SlurmctldHost=localhost/SlurmctldHost=$MASTER_HOSTNAME/" /etc/slurm/slurm.conf
        systemctl enable --now munge 2>&1
        """
        await run_and_check(ohpc_cmd, "Step 4 (OpenHPC & Slurm)")

        # ── Step 5: Warewulf Provisioning ──────────────────────────────────────
        await websocket.send_text("[STEP 5] Installing and configuring Warewulf...")
        ww_cmd = f"""
        dnf -y install warewulf-ohpc hwloc-ohpc yq 2>&1
        
        # Write clean warewulf.conf using inline python yaml editor
        python3 -c '
import yaml
with open("/etc/warewulf/warewulf.conf", "r") as f:
    conf = yaml.safe_load(f)

conf["ipaddr"] = "{cfg.provIp}"
conf["netmask"] = "{cfg.wwNetmask}"
conf["warewulf"]["port"] = 9873
conf["dhcp"]["enabled"] = True
conf["dhcp"]["range start"] = "{cfg.wwDhcpStart}"
conf["dhcp"]["range end"] = "{cfg.wwDhcpEnd}"
conf["dhcp"]["systemd name"] = "dhcpd"

with open("/etc/warewulf/warewulf.conf", "w") as f:
    yaml.dump(conf, f, default_flow_style=False)
'
        # Create base profile
        wwctl profile set --yes nodes --image almalinux-9 --netname default --netmask {cfg.wwNetmask} --gateway {cfg.provIp} 2>&1
        systemctl enable --now warewulfd 2>&1
        """
        await run_and_check(ww_cmd, "Step 5 (Warewulf Install)")

        # ── Step 6: NFS, Spack, and OOD Sync ──────────────────────────────────
        await websocket.send_text("[STEP 6] Configuring NFS Exports and installing Spack...")
        nfs_cmd = f"""
        mkdir -p /export/apps
        dnf -y install nfs-utils python3-pip 2>&1
        pip3 install pyyaml --quiet || true
        
        python3 -c '\''
import yaml
try:
    with open("/etc/warewulf/warewulf.conf", "r") as f:
        conf = yaml.safe_load(f)
    
    exports = conf.get("nfs", {{}}).get("export paths", [])
    paths = [e["path"] for e in exports]
    
    if "/export/apps" not in paths:
        exports.append({{"path": "/export/apps", "export options": "rw,sync,no_root_squash"}})
        conf["nfs"]["export paths"] = exports
        with open("/etc/warewulf/warewulf.conf", "w") as f:
            yaml.dump(conf, f, default_flow_style=False)
except Exception as e:
    print("Error updating warewulf.conf:", e)
'\''
        systemctl enable --now rpcbind nfs-server 2>&1
        wwctl configure -a 2>&1

        if [ ! -d "/export/apps/spack" ]; then
            git clone -c feature.manyFiles=true https://github.com/spack/spack.git /export/apps/spack 2>&1
        fi

        cat << '\''SPACK_ENV'\'' > /etc/profile.d/spack_setup.sh
if [ -f /export/apps/spack/share/spack/setup-env.sh ]; then
    . /export/apps/spack/share/spack/setup-env.sh
fi
SPACK_ENV
        chmod +x /etc/profile.d/spack_setup.sh

        # Open OnDemand Indexing cache
        mkdir -p /etc/ood/config/ondemand.d
        mkdir -p /etc/ood/config/modules
        grep -q "module_file_dir" /etc/ood/config/ondemand.d/ondemand.yml || echo "module_file_dir: \\"/etc/ood/config/modules\\"" >> /etc/ood/config/ondemand.d/ondemand.yml

        cat << '\''CRON'\'' > /etc/cron.hourly/sync_ood_modules
#!/bin/bash
export MODULEPATH=/export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core
/opt/ohpc/admin/lmod/lmod/libexec/spider -o spider-json \$MODULEPATH > /etc/ood/config/modules/hpc-cluster.json
CRON
        chmod +x /etc/cron.hourly/sync_ood_modules
        /etc/cron.hourly/sync_ood_modules || true
        """
        await run_and_check(nfs_cmd, "Step 6 (NFS, Spack & OOD Setup)")

        await websocket.send_text("\n[SYSTEM] ✅ Master Node configuration complete!")
        await websocket.send_text("[SYSTEM] Cluster control plane is fully active.")

    except WebSocketDisconnect:
        print("Client disconnected during master deployment")
    except Exception as e:
        try:
            await websocket.send_text(f"[CRITICAL ERROR] {str(e)}")
        except:
            pass
    finally:
        try:
            await websocket.close()
        except:
            pass
