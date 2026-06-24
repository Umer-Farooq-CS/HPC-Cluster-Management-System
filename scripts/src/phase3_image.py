"""
Phase 3: Golden Image & Master Finalization
Builds the Warewulf stateless image, applies overlays, and starts Master services.
"""
import sys
import config
from utils import run_remote

def build_golden_image():
    print("\n" + "="*50)
    print("=== PHASE 3: BUILD GOLDEN IMAGE & FINALIZE MASTER ===")
    print("="*50)
    
    # 1. Build the OS Image
    print("\n[*] Building and Injecting the Stateless OS Image...")
    
    # [Step 1A] Import Base OS Container:
    # Warewulf uses standard Docker/OCI containers as the base for the compute node OS.
    # This downloads a tiny AlmaLinux 9 container directly into Warewulf's image registry.
    run_remote("wwctl image import docker://ghcr.io/warewulf/warewulf-almalinux:9 almalinux-9 --syncuser --update || wwctl image import docker://ghcr.io/warewulf/warewulf-almalinux:9 almalinux-9 --syncuser --force", "Importing AlmaLinux 9 Base Container", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 1B] Optimize DNF & Install Repositories Inside the Image:
    # 'wwctl image exec' acts like a 'chroot', running commands INSIDE the isolated container image.
    # We optimize DNF for speed, then add the CRB, EPEL, and OpenHPC repositories.
    repo_cmd = """CHROOT=$(wwctl image show almalinux-9) && \\
cat << 'EOF' > $CHROOT/tmp/setup_repo.sh
#!/bin/bash
echo "fastestmirror=True" >> /etc/dnf/dnf.conf
echo "max_parallel_downloads=10" >> /etc/dnf/dnf.conf
echo "ip_resolve=4" >> /etc/dnf/dnf.conf
echo "excludepkgs=linux-firmware*" >> /etc/dnf/dnf.conf
echo "timeout=5" >> /etc/dnf/dnf.conf
echo "minrate=10000" >> /etc/dnf/dnf.conf
dnf -y install epel-release dnf-plugins-core http://repos.openhpc.community/OpenHPC/3/EL_9/x86_64/ohpc-release-3-1.el9.x86_64.rpm
dnf config-manager --set-enabled crb
dnf -y update
EOF
chmod +x $CHROOT/tmp/setup_repo.sh && \\
wwctl image exec --build=false almalinux-9 /tmp/setup_repo.sh && \\
rm -f $CHROOT/tmp/setup_repo.sh"""
    run_remote(repo_cmd, "Installing OpenHPC Repo in Image", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 1C] Inject Slurm & Compute Tools:
    # We install the Slurm compute daemon (slurmd), Munge (authentication), Chrony (NTP), and Lmod 
    # (Environment Modules, used by scientists to load different software versions).
    # We also include NHC (Node Health Check) to automatically detect hardware failures.
    inject_cmd = """CHROOT=$(wwctl image show almalinux-9) && \\
cat << 'EOF' > $CHROOT/tmp/setup_inject.sh
#!/bin/bash
dnf -y install ohpc-base-compute ohpc-slurm-client chrony lmod-ohpc nhc-ohpc
systemctl enable munge slurmd chronyd
EOF
chmod +x $CHROOT/tmp/setup_inject.sh && \\
wwctl image exec --build=false almalinux-9 /tmp/setup_inject.sh && \\
rm -f $CHROOT/tmp/setup_inject.sh"""
    run_remote(inject_cmd, "Injecting Compute & Slurm Packages into Image", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 1D] Configure System Overlays:
    # Overlays are files that Warewulf dynamically places into the OS image right before the node boots.
    # This prevents us from having to rebuild the entire OS container just to change a configuration file.
    overlay_cmd = f"""
    # Import the Munge key from the Master Node. All nodes must share the exact same key to communicate.
    wwctl overlay import -o --parents nodeconfig /etc/munge/munge.key
    wwctl overlay chown nodeconfig /etc/munge/munge.key "$(id -u munge):$(id -g munge)"
    wwctl overlay chown nodeconfig /etc/munge "$(id -u munge):$(id -g munge)"
    wwctl overlay chmod nodeconfig /etc/munge 0700
    
    # Import the Slurm configuration and set the Slurm Controller to the Master's IP.
    wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/slurm/slurmd.ww /etc/sysconfig/slurmd.ww
    wwctl profile set --yes nodes --tagadd slurmctld="{config.PROV_IP}"
    
    # Import User/Group mapping configs
    wwctl overlay import -o --parents nodeconfig /etc/subuid
    wwctl overlay import -o --parents nodeconfig /etc/subgid
    
    # Configure NTP to point to the Master Node's IP
    wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/chrony.conf.ww /etc/chrony.conf.ww
    wwctl profile set --yes nodes --tagadd ntpserver="{config.PROV_IP}"
    
    # Fix NetworkManager timeout issues on compute nodes
    wwctl overlay import -o --parents nodeconfig /opt/ohpc/pub/examples/network/NetworkManager-wait-online.service.d/override.conf /etc/systemd/system/NetworkManager-wait-online.service.d/override.conf
    
    # Configure NFS Mounts via Native systemd Units (instead of overriding /etc/fstab)
    # This prevents overriding Warewulf's auto-generated /etc/fstab which mounts /home and /opt.
    CHROOT=$(wwctl image show almalinux-9)
    mkdir -p $CHROOT/export/apps
    
    # Global Spack modules path configuration
    mkdir -p $CHROOT/etc/profile.d
    cat << 'SPACK_MOD' > $CHROOT/etc/profile.d/spack_modules.sh
if [ -d /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core ]; then
    module use /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core
fi
SPACK_MOD
    chmod +x $CHROOT/etc/profile.d/spack_modules.sh
    
    OVERLAY_DIR="/srv/warewulf/overlays/nodeconfig/rootfs"
    mkdir -p $OVERLAY_DIR/etc/systemd/system/multi-user.target.wants
    
    # Create the mount unit
    cat << 'UNIT' > $OVERLAY_DIR/etc/systemd/system/export-apps.mount
[Unit]
Description=NFS Mount for Shared Applications
After=network.target

[Mount]
What={config.PROV_IP}:/export/apps
Where=/export/apps
Type=nfs
Options=nfsvers=4,nodev,nosuid,bg,nofail,_netdev

[Install]
WantedBy=multi-user.target
UNIT

    # Create the automount unit
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

    # Enable the automount
    ln -sf ../export-apps.automount $OVERLAY_DIR/etc/systemd/system/multi-user.target.wants/export-apps.automount
    """
    run_remote(overlay_cmd, "Configuring Munge, Slurm & Networking Overlays", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 1E] Memory Locks & Security:
    # MPI workloads require unlimited memory locking. We write these limits directly into the container OS.
    limits_cmd = """CHROOT=$(wwctl image show almalinux-9) && echo "* soft memlock unlimited" >> $CHROOT/etc/security/limits.d/40-ohpc-limits.conf && echo "* hard memlock unlimited" >> $CHROOT/etc/security/limits.d/40-ohpc-limits.conf"""
    run_remote(limits_cmd, "Increasing Locked Memory Limits in Image", config.MASTER_IP, config.MASTER_PASS)
    
    # The pam_slurm.so module prevents regular users from SSHing into compute nodes UNLESS they 
    # actively have a Slurm job running on that node. This prevents users from sneaking past the queue!
    pam_cmd = """CHROOT=$(wwctl image show almalinux-9) && echo "account required pam_slurm.so" >> $CHROOT/etc/pam.d/sshd"""
    run_remote(pam_cmd, "Restricting SSH Access to Active Slurm Jobs", config.MASTER_IP, config.MASTER_PASS)

    # [Step 1E.2] Fix Clock Synchronization & slurmd Startup Order (PERMANENT FIX):
    # ROOT CAUSE OF 'Protocol authentication error': Munge will reject tokens if clocks differ
    # by more than 300 seconds. Compute nodes boot with a stale clock (potentially hours off).
    #
    # FIX PART 1: Replace the default chrony.conf in the image so nodes ONLY sync from the
    # Master Node (192.168.20.1) and use 'makestep 1 -1' — this steps the clock immediately
    # on EVERY update where the offset is >1s, instead of gradually slewing. This permanently
    # prevents the 7-hour-skew munge auth failure regardless of how long a node was powered off.
    #
    # FIX PART 2: Create a systemd drop-in that makes slurmd wait for chronyd AND forces a
    # 'chronyc makestep' before every single slurmd start. This is the belt-AND-suspenders
    # guarantee — even if chrony hasn't finished syncing, slurmd will force it first.
    clock_fix_cmd = f"""CHROOT=$(wwctl image show almalinux-9) && \\
cat > $CHROOT/etc/chrony.conf << 'CHRONY_CONF'
# Compute node NTP -- syncs exclusively from the HPC Master Node (192.168.20.1).
# 'makestep 1 -1': step clock immediately (no slew) on every correction if offset > 1s.
# This is the permanent fix preventing munge authentication errors on node boot.
server {config.PROV_IP} iburst prefer
makestep 1 -1
driftfile /var/lib/chrony/drift
rtcsync
CHRONY_CONF
mkdir -p $CHROOT/etc/systemd/system/slurmd.service.d && \\
cat > $CHROOT/etc/systemd/system/slurmd.service.d/wait-for-clock.conf << 'DROPIN'
[Unit]
After=munge.service network-online.target chronyd.service
[Service]
# Force-wait for chrony to actually finish syncing with the master
# (waits up to 60 seconds). This guarantees the time has been stepped.
ExecStartPre=/usr/bin/chronyc waitsync 60
ExecStartPre=/usr/bin/chronyc makestep
DROPIN"""
    run_remote(clock_fix_cmd, "Baking Clock Sync Fix into Image (Permanent Munge Auth Fix)", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 1F] Enable System Log Forwarding:
    # Configures the compute nodes to send their syslogs to the Master Node over UDP port 514.
    syslog_cmd = fr'''CHROOT=$(wwctl image show almalinux-9) && \
echo '*.* action(type="omfwd" Target="{config.MASTER_IP}" Port="514" Protocol="udp")' >> $CHROOT/etc/rsyslog.conf && \
perl -pi -e 's/^\*\.info/\#\*\.info/' $CHROOT/etc/rsyslog.conf && \
perl -pi -e 's/^authpriv/\#authpriv/' $CHROOT/etc/rsyslog.conf && \
perl -pi -e 's/^mail/\#mail/' $CHROOT/etc/rsyslog.conf && \
perl -pi -e 's/^cron/\#cron/' $CHROOT/etc/rsyslog.conf && \
perl -pi -e 's/^uucp/\#uucp/' $CHROOT/etc/rsyslog.conf'''
    run_remote(syslog_cmd, "Configuring Compute Node Log Forwarding", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 1G] Configure Master Node Receivers:
    # Prepares the Master Node to receive the forwarded logs and installs NHC on the Master.
    master_cfg_cmd = "dnf -y install nhc-ohpc && echo 'module(load=\"imudp\")' >> /etc/rsyslog.d/ohpc.conf && echo 'input(type=\"imudp\" port=\"514\")' >> /etc/rsyslog.d/ohpc.conf && systemctl restart rsyslog && echo 'HealthCheckProgram=/usr/sbin/nhc' >> /etc/slurm/slurm.conf && echo 'HealthCheckInterval=300' >> /etc/slurm/slurm.conf"
    run_remote(master_cfg_cmd, "Configuring Master Log Receiver & NHC", config.MASTER_IP, config.MASTER_PASS)

    # 2. Finalize Image and Start Services
    print("\n[*] Finalizing Image and Starting Cluster Services...")
    
    # [Step 2A] Rebuild Initramfs:
    # Dracut rebuilds the initial ramdisk inside the container. We target the newly installed kernel
    # because the base image's old kernel modules were removed during the update.
    dracut_cmd = """CHROOT=$(wwctl image show almalinux-9) && \\
cat << 'EOF' > $CHROOT/tmp/setup_dracut.sh
#!/bin/bash
KVER=$(ls -1 /lib/modules | tail -n 1)
/usr/bin/dracut --force /boot/initramfs-${KVER}.img ${KVER}
EOF
chmod +x $CHROOT/tmp/setup_dracut.sh && \\
wwctl image exec --build=false almalinux-9 /tmp/setup_dracut.sh && \\
rm -f $CHROOT/tmp/setup_dracut.sh"""
    run_remote(dracut_cmd, "Regenerating Dracut Initramfs", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 2B] Compile the VNFS:
    # Compiles the container into a Virtual Node File System (VNFS) tarball, which is what 
    # actually gets sent over the network during a PXE boot.
    run_remote("wwctl image build almalinux-9 && wwctl overlay build", "Building Image & Overlays", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 2C] Start the Master Control Plane:
    # Now that the image is fully built and contains our munge keys, we can safely start 
    # the Slurm Controller and Munge authentication daemon on the Master Node.
    run_remote("systemctl enable --now munge slurmctld", "Starting Cluster Control Plane (Slurm)", config.MASTER_IP, config.MASTER_PASS)

    print("\n[+] Phase 3 Complete! The Master Node and Golden Image are fully prepared.")
    print("[+] Please proceed to Phase 4 to register and power on your Compute Nodes.")

if __name__ == "__main__":
    build_golden_image()
