"""
Phase 4: Client Provisioning
Registers physical compute nodes into Warewulf and configures PXE DHCP.
Guides the user to manually power on the compute nodes.
"""
import sys
import config
from utils import run_remote

def register_clients():
    print("\n" + "="*50)
    print("=== PHASE 4: REGISTER COMPUTE NODES ===")
    print("="*50)
    
    # 1. Hardware Registration via nodes.txt
    # Here we read the physical MAC addresses of the compute nodes provided by the user.
    print("\n[*] Registering Compute Nodes from nodes.txt...")
    
    # [Step 1A] Install Node Management Tools:
    # ClusterShell allows parallel command execution. Genders allows grouping nodes by hardware types.
    run_remote("dnf -y install clustershell genders-ohpc", "Installing ClusterShell & Genders", config.MASTER_IP, config.MASTER_PASS)
    
    registered_nodes = []
    try:
        with open("nodes.txt", "r") as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            # Skip empty lines and comments
            if not line or line.startswith("#"):
                continue
                
            # Expected format: hostname,mac_address,ip_address
            # Example: pc2,00:11:22:33:44:55,192.168.20.10
            parts = line.split(',')
            if len(parts) != 3:
                print(f"    [!] Skipping invalid line in nodes.txt: {line}")
                continue
                
            hostname, mac_addr, ip_addr = parts[0].strip(), parts[1].strip(), parts[2].strip()
            
            # [Step 1B] Bind Hardware to the OS:
            # We tell Warewulf about the new node. We assign its IP and MAC, and bind it to the 
            # 'nodes' profile (which assigns the network subnet/gateway) and the 'almalinux-9' container.
            cmd = f"wwctl node add {hostname} --image almalinux-9 --profile nodes --netname default --ipaddr={ip_addr} --hwaddr={mac_addr}"
            run_remote(cmd, f"Registering {hostname} ({mac_addr} -> {ip_addr})", config.MASTER_IP, config.MASTER_PASS)
            registered_nodes.append(hostname)
            
    except FileNotFoundError:
        print("    [-] ERROR: 'nodes.txt' not found!")
        print("    Please create a file named 'nodes.txt' in this directory.")
        print("    Format each line as: hostname,mac_address,ip_address")
        print("    Example: pc2,00:11:22:33:44:55,192.168.20.10")
        sys.exit(1)
        
    # 2. Update Warewulf Configuration
    # [Step 2A] Rebuild Node-Specific Overlays and DHCP:
    # Now that new nodes are added, we must rebuild the overlays (so the nodes get their specific hostnames)
    # and configure Warewulf's internal DHCP server so it knows about their MAC addresses.
    print("\n[*] Updating Warewulf DHCP and Overlays for new nodes...")
    run_remote("wwctl overlay build && wwctl configure --all", "Rebuilding DHCP and Overlays", config.MASTER_IP, config.MASTER_PASS)
    
    if registered_nodes:
        # [Step 2B] Update Slurm Configuration:
        # Slurm needs to know the exact hostnames of the compute nodes to accept their connections.
        print("\n[*] Updating Slurm Configuration with Compute Node Names...")
        nodes_csv = ",".join(registered_nodes)
        slurm_update_cmd = (
            f"sed -i 's/^NodeName=.*$/NodeName={nodes_csv} Sockets=1 CoresPerSocket=4 ThreadsPerCore=1 State=UNKNOWN/' /etc/slurm/slurm.conf && "
            f"sed -i 's/^PartitionName=.*$/PartitionName=normal Nodes={nodes_csv} Default=YES MaxTime=24:00:00 State=UP/' /etc/slurm/slurm.conf && "
            f"systemctl restart slurmctld"
        )
        run_remote(slurm_update_cmd, "Configuring Slurm Nodes & Partitions", config.MASTER_IP, config.MASTER_PASS)
        
        # [Step 2C] Configure ClusterShell & Genders:
        # We group the registered nodes together so the admin can easily run commands across all nodes at once.
        print("\n[*] Configuring Cluster Groups...")
        nodes_list = ",".join(registered_nodes)
        c_shell_cmd = f"echo 'adm: master' > /etc/clustershell/groups.d/local.cfg && echo 'compute: {nodes_list}' >> /etc/clustershell/groups.d/local.cfg && echo 'all: @adm,@compute' >> /etc/clustershell/groups.d/local.cfg"
        run_remote(c_shell_cmd, "Configuring ClusterShell Groups", config.MASTER_IP, config.MASTER_PASS)
        
        genders_cmd = f"echo -e 'master\tsms' > /etc/genders"
        for node in registered_nodes:
            genders_cmd += f" && echo -e '{node}\tcompute' >> /etc/genders"
        run_remote(genders_cmd, "Configuring Genders Database", config.MASTER_IP, config.MASTER_PASS)
    
    print("\n" + "="*60)
    print(">>> ACTION REQUIRED: Power on all Compute Nodes MANUALLY.")
    print(f">>> Because they have no OS, they will attempt a PXE boot.")
    print(f">>> Ensure they boot over the Provisioning Network ({config.PROV_NETWORK}).")
    print(">>> The Master Node will serve the stateless image directly into their RAM.")
    print("="*60 + "\n")

if __name__ == "__main__":
    register_clients()
