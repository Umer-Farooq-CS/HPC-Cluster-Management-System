import asyncio
import redis
import json
from celery import shared_task
from core.celery_app import celery_app
from core.ssh_executor import SSHExecutor
from core.config import settings

# Redis client for streaming logs and caching Slurm state
redis_client = redis.Redis(host="redis", port=6379, db=0, decode_responses=True)

def _stream_cmd_sync(task_id: str, executor: SSHExecutor, cmd: str):
    """
    Runs the SSH command synchronously within the Celery worker and
    pushes each line of output to a Redis List so the WebSocket can tail it.
    """
    redis_key = f"task_logs:{task_id}"
    
    # We use a synchronous wrapper around the async SSH execution
    async def _run():
        try:
            async for line in executor.run_command_stream(cmd):
                # Push log line to Redis list
                redis_client.rpush(redis_key, line)
                # Keep logs for 24 hours
                redis_client.expire(redis_key, 86400)
            redis_client.rpush(redis_key, "__EOF__")
        except Exception as e:
            redis_client.rpush(redis_key, f"ERROR: {str(e)}")
            redis_client.rpush(redis_key, "__EOF__")
            
    asyncio.run(_run())

@shared_task(bind=True)
def build_image_task(self, build_config: dict):
    """Background task to build an OS image."""
    import shlex
    task_id = self.request.id
    redis_key = f"task_logs:{task_id}"
    
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    async def _run():
        try:
            class Cfg:
                pass
            cfg = Cfg()
            for k, v in build_config.items():
                setattr(cfg, k, v)
                
            cfg.name = shlex.quote(cfg.name)
            cfg.source = shlex.quote(cfg.source)
            cfg.ntpServer = shlex.quote(cfg.ntpServer)
            cfg.syslogTarget = shlex.quote(cfg.syslogTarget)
            cfg.packages = " ".join([shlex.quote(p.strip()) for p in cfg.packages.replace(',', ' ').split() if p.strip()])
            cfg.enabledServices = " ".join([shlex.quote(p.strip()) for p in cfg.enabledServices.replace(',', ' ').split() if p.strip()])

            async def run_and_check(cmd: str, step_name: str):
                async for line in executor.run_command_stream(cmd):
                    redis_client.rpush(redis_key, line)
                    redis_client.expire(redis_key, 86400)
                    if "[ERROR]" in line or "[SSH ERROR]" in line or "[SYSTEM ERROR]" in line:
                        raise Exception(f"{step_name} failed. Halting build.")

            redis_client.rpush(redis_key, f"[SYSTEM] Starting build for image: {cfg.name}\n")
            redis_client.rpush(redis_key, f"[SYSTEM] Source: {cfg.source}\n")

            redis_client.rpush(redis_key, "[STEP 1] Importing base OS container from registry...\n")
            cmd = (
                f"wwctl image import {cfg.source} {cfg.name} --syncuser --update 2>&1 || "
                f"wwctl image import {cfg.source} {cfg.name} --syncuser --force 2>&1"
            )
            await run_and_check(cmd, "Step 1A (Import)")

            redis_client.rpush(redis_key, "[STEP 2] Optimizing DNF and installing repositories...\n")
            pkgs_to_install = "epel-release dnf-plugins-core"
            if getattr(cfg, 'installOhpc', True):
                pkgs_to_install += " http://repos.openhpc.community/OpenHPC/3/EL_9/x86_64/ohpc-release-3-1.el9.x86_64.rpm"

            repo_script = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
cat > $CHROOT/tmp/setup_repo.sh << 'EOF'
#!/bin/bash
set -e
{"echo 'fastestmirror=True' >> /etc/dnf/dnf.conf" if getattr(cfg, 'fastestMirror', True) else ""}
echo "max_parallel_downloads={getattr(cfg, 'maxDownloads', 10)}" >> /etc/dnf/dnf.conf
echo "ip_resolve=4" >> /etc/dnf/dnf.conf
echo "excludepkgs={getattr(cfg, 'excludePkgs', 'linux-firmware*')}" >> /etc/dnf/dnf.conf
echo "timeout={getattr(cfg, 'dnfTimeout', 300)}" >> /etc/dnf/dnf.conf
echo "minrate={getattr(cfg, 'minRate', 1000)}" >> /etc/dnf/dnf.conf
{"dnf -y install " + pkgs_to_install if getattr(cfg, 'installEpel', True) or getattr(cfg, 'installOhpc', True) else ""}
{"dnf config-manager --set-enabled crb" if getattr(cfg, 'enableCrb', True) else ""}
EOF
chmod +x $CHROOT/tmp/setup_repo.sh && \\
wwctl image exec --build=false {cfg.name} /tmp/setup_repo.sh 2>&1 && \\
rm -f $CHROOT/tmp/setup_repo.sh"""

            await run_and_check(repo_script, "Step 1B (Repos)")

            redis_client.rpush(redis_key, "[STEP 3] Injecting compute packages into image...\n")
            services = " ".join(getattr(cfg, 'enabledServices', "").replace(",", " ").split())
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

            redis_client.rpush(redis_key, "[STEP 4] Configuring system overlays (Munge, Slurm, NTP, Mounts)...\n")
            overlay_cmd = f"""mkdir -p /srv/warewulf/overlays/nodeconfig/rootfs/export/apps && \\
wwctl overlay import -o --parents nodeconfig /etc/munge/munge.key && \\
wwctl overlay chown nodeconfig /etc/munge/munge.key "$(id -u munge):$(id -g munge)" && \\
wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/slurm/slurmd.ww /etc/sysconfig/slurmd.ww && \\
wwctl profile set --yes nodes --tagadd slurmctld="{settings.PROV_IP}" && \\
wwctl overlay import -o --parents nodeconfig /etc/subuid && \\
wwctl overlay import -o --parents nodeconfig /etc/subgid && \\
wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/chrony.conf.ww /etc/chrony.conf.ww && \\
wwctl profile set --yes nodes --tagadd ntpserver="{settings.PROV_IP}" && \\
echo "makestep {getattr(cfg, 'makeStep', '1 -1')}" >> /srv/warewulf/overlays/nodeconfig/rootfs/etc/chrony.conf.ww && \\
wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/network/NetworkManager-wait-online.service.d/override.conf /etc/systemd/system/NetworkManager-wait-online.service.d/override.conf && \\
OVERLAY_DIR="/srv/warewulf/overlays/nodeconfig/rootfs" && \\
mkdir -p $OVERLAY_DIR/etc/systemd/system/remote-fs.target.wants && \\
cat << 'UNIT' > $OVERLAY_DIR/etc/systemd/system/export-apps.mount
[Unit]
Description=NFS Mount for Shared Applications
DefaultDependencies=no
Conflicts=umount.target
Before=remote-fs.target umount.target
After=network-online.target
Wants=network-online.target

[Mount]
What={settings.PROV_IP}:/export/apps
Where=/export/apps
Type=nfs
Options=nfsvers=4,nodev,nosuid,nofail,_netdev

[Install]
WantedBy=remote-fs.target
UNIT
cat << 'AUTO' > $OVERLAY_DIR/etc/systemd/system/export-apps.automount
[Unit]
Description=Automount for Shared Applications
DefaultDependencies=no
Conflicts=umount.target
Before=remote-fs.target umount.target
After=network-online.target
Wants=network-online.target

[Automount]
Where=/export/apps
TimeoutIdleSec=600

[Install]
WantedBy=remote-fs.target
AUTO
ln -sf ../export-apps.automount $OVERLAY_DIR/etc/systemd/system/remote-fs.target.wants/export-apps.automount 2>&1"""
            await run_and_check(overlay_cmd, "Step 1D (Overlays)")

            if getattr(cfg, 'memlockUnlimited', True):
                redis_client.rpush(redis_key, "[STEP 5] Setting unlimited memlock limits...\n")
                limits_cmd = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
echo "* soft memlock unlimited" >> $CHROOT/etc/security/limits.d/40-ohpc-limits.conf && \\
echo "* hard memlock unlimited" >> $CHROOT/etc/security/limits.d/40-ohpc-limits.conf 2>&1"""
                await run_and_check(limits_cmd, "Step 1E (Memlock limits)")

            if getattr(cfg, 'pamSlurmRestrict', True):
                redis_client.rpush(redis_key, "[STEP 5b] Restricting SSH via pam_slurm...\n")
                pam_cmd = f'CHROOT=$(wwctl image show {cfg.name}) && echo "account required pam_slurm.so" >> $CHROOT/etc/pam.d/sshd 2>&1'
                await run_and_check(pam_cmd, "Step 1E (PAM Slurm)")

            redis_client.rpush(redis_key, "[STEP 6] Baking clock sync fix (prevents Munge auth failures on boot)...\n")
            clock_cmd = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
cat > $CHROOT/etc/chrony.conf << 'CHRONY_CONF'
server {cfg.ntpServer} iburst prefer
makestep {getattr(cfg, 'makeStep', '1 -1')}
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

            redis_client.rpush(redis_key, "[STEP 6b] Baking Spack global environment setup into profile.d...\n")
            spack_mod_cmd = f"""CHROOT=$(wwctl image show {cfg.name}) && \\
mkdir -p $CHROOT/etc/profile.d && \\
cat > $CHROOT/etc/profile.d/spack_setup.sh << 'SPACK_ENV'
if [ -f /export/apps/spack/share/spack/setup-env.sh ]; then
    . /export/apps/spack/share/spack/setup-env.sh
fi
module use /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core
module use /export/apps/custom_modules
export BASH_ENV=$HOME/.bashrc
SPACK_ENV
chmod +x $CHROOT/etc/profile.d/spack_setup.sh 2>&1"""
            await run_and_check(spack_mod_cmd, "Step 1E.3 (Spack Profile)")

            redis_client.rpush(redis_key, "[STEP 7] Configuring syslog forwarding to Master Node...\n")
            syslog_cmd = fr"""CHROOT=$(wwctl image show {cfg.name}) && \
echo '*.* action(type="omfwd" Target="{cfg.syslogTarget}" Port="{getattr(cfg, 'syslogPort', 514)}" Protocol="udp")' >> $CHROOT/etc/rsyslog.conf 2>&1"""
            await run_and_check(syslog_cmd, "Step 1F (Syslog forwarding)")

            if getattr(cfg, 'forceDracut', True):
                redis_client.rpush(redis_key, "[STEP 8] Regenerating Dracut initramfs (this may take a few minutes)...\n")
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

            redis_client.rpush(redis_key, "[STEP 9] Compiling VNFS image and rebuilding overlays...\n")
            await run_and_check(f"wwctl image build {cfg.name} && wwctl overlay build && systemctl restart warewulfd 2>&1", "Step 2B (Build image)")

            redis_client.rpush(redis_key, "[STEP 10] Enabling and starting Slurm control plane...\n")
            await run_and_check("systemctl enable --now munge slurmctld 2>&1", "Step 2C (Start Slurm)")

            redis_client.rpush(redis_key, "\n[SYSTEM] ✅ Image build complete!\n")
            redis_client.rpush(redis_key, f"[SYSTEM] Image '{cfg.name}' is ready to be assigned to nodes.\n")
            redis_client.rpush(redis_key, "__EOF__")
        except Exception as e:
            redis_client.rpush(redis_key, f"[CRITICAL ERROR] {str(e)}\n")
            redis_client.rpush(redis_key, "__EOF__")
            
    asyncio.run(_run())
    return {"status": "completed"}

@shared_task(bind=True)
def deploy_slaves_task(self, deploy_config: dict):
    """Background task to deploy compute nodes."""
    import shlex
    task_id = self.request.id
    redis_key = f"task_logs:{task_id}"
    
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    async def _run():
        try:
            nodes_data = deploy_config.get("nodes", [])
            groups_data = deploy_config.get("groups", [])
            overwrite_flag = deploy_config.get("overwrite", False)
            
            node_names = [n["hostname"] for n in nodes_data]
            nodes_csv = ",".join(node_names)

            redis_client.rpush(redis_key, "[SYSTEM] Connection established. Starting Phase 4 Deployment...\n")
            redis_client.rpush(redis_key, f"[SYSTEM] Target Nodes: {', '.join(node_names)}\n")

            async def run_and_check(cmd: str, step_name: str):
                async for line in executor.run_command_stream(cmd):
                    redis_client.rpush(redis_key, line)
                    redis_client.expire(redis_key, 86400)
                    if "[ERROR]" in line or "[SSH ERROR]" in line or "[SYSTEM ERROR]" in line:
                        raise Exception(f"{step_name} failed. Halting deployment.")

            redis_client.rpush(redis_key, "[STEP 1] Installing required packages (clustershell, genders)...\n")
            await run_and_check("dnf -y install clustershell genders-ohpc 2>&1", "Step 1")

            redis_client.rpush(redis_key, "[STEP 2] Registering nodes in Warewulf...\n")
            for node in nodes_data:
                safe_hostname = shlex.quote(node["hostname"])
                safe_mac = shlex.quote(node["mac"])
                safe_ip = shlex.quote(node["ip"])
                safe_image = shlex.quote(node.get("assignedImage", "almalinux-9"))
                redis_client.rpush(redis_key, f"  -> Registering {node['hostname']} ({node['mac']}) with image {node.get('assignedImage', 'almalinux-9')}\n")
                if overwrite_flag:
                    cmd_add = f"wwctl node delete {safe_hostname} --yes 2>/dev/null; wwctl node add {safe_hostname} --image {safe_image} --profile nodes --netname default --ipaddr={safe_ip} --hwaddr={safe_mac} 2>&1"
                else:
                    cmd_add = f"wwctl node add {safe_hostname} --image {safe_image} --profile nodes --netname default --ipaddr={safe_ip} --hwaddr={safe_mac} 2>&1"
                await run_and_check(cmd_add, f"Node registration ({node['hostname']})")

            redis_client.rpush(redis_key, "[STEP 3] Rebuilding Warewulf DHCP and Node Overlays...\n")
            await run_and_check("wwctl overlay build && wwctl configure --all && systemctl restart warewulfd 2>&1", "Step 3")

            redis_client.rpush(redis_key, "[STEP 4] Updating Slurm Configuration with Compute Node Names...\n")
            from collections import defaultdict
            topo_groups = defaultdict(list)
            for node in nodes_data:
                sockets = node.get("sockets", 1)
                cores   = node.get("coresPerSocket", 4)
                threads = node.get("threadsPerCore", 1)
                key = (sockets, cores, threads)
                topo_groups[key].append(node["hostname"])

            node_name_lines = []
            for (sockets, cores, threads), hostnames in topo_groups.items():
                safe_hostnames = [shlex.quote(h) for h in hostnames]
                csv = ",".join(safe_hostnames)
                node_name_lines.append(
                    f"NodeName={csv} Sockets={sockets} CoresPerSocket={cores} ThreadsPerCore={threads} State=UNKNOWN"
                )

            partition_nodes = ",".join([shlex.quote(n["hostname"]) for n in nodes_data])
            slurm_cmd_parts = [
                "sed -i '/^NodeName=/d' /etc/slurm/slurm.conf",
                "sed -i '/^PartitionName=/d' /etc/slurm/slurm.conf",
            ]
            for nl in node_name_lines:
                slurm_cmd_parts.append(f"echo '{nl}' >> /etc/slurm/slurm.conf")
            slurm_cmd_parts.append(
                f"echo 'PartitionName=normal Nodes={partition_nodes} Default=YES MaxTime=24:00:00 State=UP' >> /etc/slurm/slurm.conf"
            )
            slurm_cmd_parts.append("systemctl restart slurmctld 2>&1")
            await run_and_check(" && ".join(slurm_cmd_parts), "Step 4")

            redis_client.rpush(redis_key, "[STEP 5] Configuring ClusterShell Groups & Genders Database...\n")
            cshell_lines = [f"echo '{g['name']}: {g['members']}' >> /etc/clustershell/groups.d/local.cfg" for g in groups_data]
            if not cshell_lines:
                cshell_lines = [
                    f"echo 'adm: master' >> /etc/clustershell/groups.d/local.cfg",
                    f"echo 'compute: {nodes_csv}' >> /etc/clustershell/groups.d/local.cfg",
                    f"echo 'all: @adm,@compute' >> /etc/clustershell/groups.d/local.cfg"
                ]
            
            cmd_c_shell = f"rm -f /etc/clustershell/groups.d/local.cfg && " + " && ".join(cshell_lines) + " 2>&1"
            await run_and_check(cmd_c_shell, "Step 5 (ClusterShell)")

            genders_lines = []
            expanded_genders = []
            for g in groups_data:
                if not g['members'].startswith('@'):
                    for member in g['members'].split(','):
                        m = member.strip()
                        if m:
                            expanded_genders.append(f"echo -e '{m}\\t{g['name']}' >> /etc/genders")
            
            if not expanded_genders:
                expanded_genders = ["echo -e 'master\\tsms' >> /etc/genders"]
                for node in node_names:
                    expanded_genders.append(f"echo -e '{node}\\tcompute' >> /etc/genders")

            cmd_genders = f"rm -f /etc/genders && " + " && ".join(expanded_genders) + " 2>&1"
            await run_and_check(cmd_genders, "Step 5 (Genders)")

            redis_client.rpush(redis_key, "\n[SYSTEM] Deployment completed successfully!\n")
            redis_client.rpush(redis_key, "============================================================\n")
            redis_client.rpush(redis_key, ">>> ACTION REQUIRED: Power on all Compute Nodes MANUALLY.\n")
            redis_client.rpush(redis_key, ">>> They will PXE boot over the provisioning network.\n")
            redis_client.rpush(redis_key, "============================================================\n")
            redis_client.rpush(redis_key, "__EOF__")
        except Exception as e:
            redis_client.rpush(redis_key, f"[CRITICAL ERROR] {str(e)}\n")
            redis_client.rpush(redis_key, "__EOF__")
            
    asyncio.run(_run())
    return {"status": "completed"}

@shared_task(bind=True)
def run_playbook_task(self, playbook_config: dict):
    """Background task to run an Ansible playbook."""
    import shlex
    task_id = self.request.id
    redis_key = f"task_logs:{task_id}"
    
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    playbook_name = playbook_config.get("playbook_name")
    safe_playbook_name = shlex.quote(playbook_name)
    cmd = f"cd /opt/hpc-cluster-system/scripts/ansible && ansible-playbook -i inventory.ini {safe_playbook_name} 2>&1"
    
    redis_client.rpush(redis_key, f"\033[1;34m[*] Executing Playbook: {playbook_name} on {settings.MASTER_IP}...\033[0m\n")
    
    async def _run():
        try:
            async for line in executor.run_command_stream(cmd):
                redis_client.rpush(redis_key, line + "\n")
                redis_client.expire(redis_key, 86400)
            redis_client.rpush(redis_key, f"\n\033[1;32m[+] Execution completed for {playbook_name}\033[0m\n")
            redis_client.rpush(redis_key, "__EOF__")
        except Exception as e:
            redis_client.rpush(redis_key, f"\n\033[1;31m[ERROR] {str(e)}\033[0m\n")
            redis_client.rpush(redis_key, "__EOF__")
            
    asyncio.run(_run())
    return {"status": "completed"}

@shared_task(bind=True)
def rebuild_warewulf_overlays_task(self):
    """Debounced task to rebuild Warewulf overlays."""
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    cmd = "wwctl overlay build -A 2>&1"
    
    async def _run():
        lines = []
        async for line in executor.run_command_stream(cmd):
            lines.append(line)
        return "".join(lines)
        
    result = asyncio.run(_run())
    return {"status": "completed", "output": result}

@celery_app.task
def poll_slurm_metadata():
    """
    Periodically fetches Slurm squeue and sinfo.
    This replaces the SSH storm on the /overview endpoint.
    """
    executor = SSHExecutor(
        host=settings.MASTER_IP,
        username=settings.MASTER_USER,
        password=settings.MASTER_PASS,
    )
    
    async def _run():
        results = await asyncio.gather(
            _get_cmd_output(executor, "scontrol show nodes 2>&1"),
            _get_cmd_output(executor, "squeue --noheader -o '%i %j %u %t %M %D %C %R' 2>&1"),
            _get_cmd_output(executor, "sinfo --summarize --noheader 2>&1"),
            _get_cmd_output(executor, "sinfo --noheader -o '%n %t %c %m %e %O %G %D' 2>&1"),
            return_exceptions=True
        )
        # Parse and save to Redis...
        # For brevity, just saving raw for now
        redis_client.set("slurm_overview_cache", json.dumps({
            "raw_nodes": results[0] if not isinstance(results[0], Exception) else "",
            "raw_squeue": results[1] if not isinstance(results[1], Exception) else "",
            "raw_summary": results[2] if not isinstance(results[2], Exception) else "",
            "raw_sinfo": results[3] if not isinstance(results[3], Exception) else ""
        }))
        
    async def _get_cmd_output(executor, cmd):
        lines = []
        async for line in executor.run_command_stream(cmd):
            lines.append(line)
        return "\n".join(lines)
        
    asyncio.run(_run())
