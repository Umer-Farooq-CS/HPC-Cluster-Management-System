"""
Phase 2: Master Node Configuration
Orchestrates the configuration of the Master Node via SSH from the Bastion Host.
This sets up network aliases, OpenHPC, Slurm, and the Warewulf provisioning server.
"""
import config
from utils import run_remote

def configure_master():
    print("\n" + "="*50)
    print("=== PHASE 2: CONFIGURE MASTER NODE (OpenHPC) ===")
    print("="*50)
    
    # 1. Setup Network Aliases
    # Because bare-metal clusters often use a single physical switch for multiple types of traffic, 
    # we use "Network Aliasing" to assign multiple IPs to a single physical interface.
    print("\n[*] Configuring Data and Provisioning Networks...")
    
    # [Step 1A] Interface Discovery:
    # We query the OS (ip addr) to find the physical device name (e.g., 'eno1') that currently 
    # holds the Admin IP (192.168.10.2). This avoids hardcoding interface names which vary by motherboard.
    interface_cmd = f"ip -o -4 addr show | grep {config.MASTER_IP} | awk '{{print $2}}' | head -n 1"
    
    # [Step 1B] NetworkManager Profile Modification:
    # 1. We find the NetworkManager Connection Name ("$CONN") tied to that physical device.
    # 2. We inject the Data Network (192.168.30.1) and Provisioning Network (192.168.20.1).
    # 3. We point the default Gateway to the Bastion Host (192.168.10.100) and set Google DNS.
    # 4. We restart the connection to apply the changes so the Master Node can reach the internet.
    alias_cmd = (
        f"IFACE=$({interface_cmd}) && "
        f"CONN=$(nmcli -g NAME,DEVICE con show | grep \":$IFACE$\" | cut -d: -f1 | head -n1) && "
        f"nmcli con mod \"$CONN\" +ipv4.addresses {config.DATA_IP}/24 +ipv4.addresses {config.PROV_IP}/24 "
        f"ipv4.gateway 192.168.10.100 ipv4.dns '8.8.8.8 8.8.4.4' && "
        f"nmcli con up \"$CONN\""
    )
    run_remote(alias_cmd, "Adding Network Aliases & Gateway for Internet", config.MASTER_IP, config.MASTER_PASS)
    
    # 2. Base Repositories, Firewall & NTP
    print("\n[*] Setting up Repositories, Firewall and NTP...")
    
    # [Step 2A] Disable Firewall: 
    # HPC compute nodes require unhindered communication over thousands of dynamic ports for 
    # MPI (Message Passing Interface) and Slurm RPC calls. Local firewalls break this.
    run_remote("systemctl disable --now firewalld || true", "Disabling Firewall", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 2B] Enable CRB & EPEL Repositories:
    # HPC tools require advanced mathematical libraries and dependencies not included in the standard
    # AlmaLinux base. CRB (CodeReady Builder) and EPEL provide these missing development packages.
    run_remote("dnf -y install epel-release dnf-plugins-core && dnf config-manager --set-enabled crb", "Enabling CRB & EPEL", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 2C] Configure NTP (Chrony):
    # Time synchronization is absolutely critical. If node clocks drift, Slurm will reject job submissions, 
    # and shared NFS filesystems will encounter "file created in the future" errors.
    run_remote("dnf -y install chrony && echo 'local stratum 10' >> /etc/chrony.conf && echo 'allow all' >> /etc/chrony.conf && systemctl enable --now chronyd.service && systemctl restart chronyd", "Installing & Starting NTP", config.MASTER_IP, config.MASTER_PASS)
    
    # 3. OpenHPC & Slurm Server
    print("\n[*] Installing OpenHPC and Slurm Controller...")
    
    # [Step 3A] Install OpenHPC Release:
    # Adds the official OpenHPC v3 repository which contains pre-compiled binaries for Slurm and Warewulf.
    run_remote("dnf -y install http://repos.openhpc.community/OpenHPC/3/EL_9/x86_64/ohpc-release-3-1.el9.x86_64.rpm", "Enabling OpenHPC Repo", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 3B] Install Core Packages:
    # 'ohpc-base' provides common directory structures (/opt/ohpc).
    # 'ohpc-slurm-server' installs the Slurm Controller daemon (slurmctld) and Munge authentication.
    run_remote("dnf -y install ohpc-base ohpc-slurm-server", "Installing OpenHPC Base & Slurm", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 3C] Initialize Slurm Configs:
    # Copies the template slurm.conf and automatically injects the Master Node's current hostname 
    # as the 'SlurmctldHost' so compute nodes know who is in charge of the queue.
    run_remote("cp /etc/slurm/slurm.conf.ohpc /etc/slurm/slurm.conf && cp /etc/slurm/cgroup.conf.example /etc/slurm/cgroup.conf && sed -i 's/SlurmctldHost=\\S\\+/SlurmctldHost='\"$(hostname)\"'/' /etc/slurm/slurm.conf", "Initializing Slurm Configs", config.MASTER_IP, config.MASTER_PASS)

    # 4. Warewulf Provisioning Server
    print("\n[*] Installing and Configuring Warewulf Provisioning Server...")
    
    # [Step 4A] Install Warewulf 4:
    # Warewulf is the orchestration system that manages IP addresses and serves stateless OS images to RAM.
    run_remote("dnf -y install warewulf-ohpc hwloc-ohpc yq && install -d -m 0755 /var/lib/tftpboot", "Installing Warewulf", config.MASTER_IP, config.MASTER_PASS)
    
    # [Step 4B] Configure Warewulf Configuration (warewulf.conf):
    # We use 'yq' (a YAML parser) to safely modify /etc/warewulf/warewulf.conf.
    # We tell Warewulf's internal DHCP server to listen on the Provisioning Network (192.168.20.x)
    # and hand out IPs between .10 and .100.
    ww_config = f"""
    yq -i '.ipaddr = "{config.PROV_IP}"' /etc/warewulf/warewulf.conf
    yq -i '.netmask = "255.255.255.0"' /etc/warewulf/warewulf.conf
    yq -i '.network = "{config.PROV_NETWORK}"' /etc/warewulf/warewulf.conf
    yq -i '.dhcp["range start"] = "192.168.20.10"' /etc/warewulf/warewulf.conf
    yq -i '.dhcp["range end"] = "192.168.20.100"' /etc/warewulf/warewulf.conf
    yq -i '.dhcp.template = "static"' /etc/warewulf/warewulf.conf
    
    # Fix nodes.conf defaults to ensure mounts don't halt the boot process if missing.
    sed -i "s/defaults,noauto,nofail,ro/defaults,nofail,ro/" /etc/warewulf/nodes.conf
    yq -i '.nodeprofiles.default.kernel.args -= ["quiet"]' /etc/warewulf/nodes.conf
    echo "log-debug" >> /etc/dnsmasq.d/ww4-debug.conf || true
    
    # Start the Warewulf Daemon
    systemctl enable --now warewulfd
    
    # [Step 4C] Initialize the 'Nodes' Profile Template:
    # We create a generic template called 'nodes'. Any physical compute node we add later will inherit 
    # these exact settings (the 'nodeconfig' overlay, the subnet mask, and the gateway).
    wwctl profile add nodes --profile default --comment 'Nodes profile'
    wwctl overlay create nodeconfig
    wwctl profile set --yes nodes --system-overlays nodeconfig --runtime-overlays syncuser
    wwctl profile set --yes nodes --netname=default --netmask=255.255.255.0 --gateway={config.PROV_IP}
    
    # [Step 4D] Security & Limits (Memlock):
    # Unlimited memlock is strictly required for MPI to perform fast RDMA (Remote Direct Memory Access) 
    # operations without hitting OS limits.
    bash /etc/profile.d/ssh_setup.sh || true
    echo '* soft memlock unlimited' >> /etc/security/limits.d/40-ohpc-limits.conf
    echo '* hard memlock unlimited' >> /etc/security/limits.d/40-ohpc-limits.conf
    """
    run_remote(ww_config, "Configuring Warewulf Networking", config.MASTER_IP, config.MASTER_PASS)
    
    print("\n[+] Master Node configuration complete.")

if __name__ == "__main__":
    configure_master()