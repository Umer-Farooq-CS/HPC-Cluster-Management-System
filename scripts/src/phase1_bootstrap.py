"""
Phase 1: Bootstrapping the Master Node (Manual OS Install)

Since the automated PXE installation via the Bastion Host was removed in favor of 
a manual Rufus USB install, this script now serves as an interactive checklist 
to guide the administrator and wait for the Master Node to come online.
"""
import time
import subprocess
import config

def deploy_master_os():
    print("\n" + "="*60)
    print("=== PHASE 1: BOOTSTRAP MASTER NODE (MANUAL OS INSTALL) ===")
    print("="*60)
    
    print("\n[!] The automated PXE deployment has been replaced with a manual USB installation.")
    print(">>> ACTION REQUIRED:")
    print("    1. Create a bootable USB using Rufus with the AlmaLinux-9.8-x86_64-minimal.iso.")
    print("    2. Boot the Master Node from the USB.")
    print("    3. Install AlmaLinux 9 manually.")
    print(f"    4. During network setup, configure the primary interface to have IP: {config.MASTER_IP}")
    print(f"    5. Ensure the root password is set to: {config.MASTER_PASS}")
    print("    6. Reboot the Master Node and ensure it is connected to the network.\n")
    
    print(f"[*] Waiting for SSH to become available on {config.MASTER_IP}...")
    
    # Poll until the Master Node is online and SSH is open
    while True:
        # We use strict host key checking disabled so it doesn't prompt for fingerprints
        ssh_check_cmd = f"sshpass -p {config.MASTER_PASS} ssh -o StrictHostKeyChecking=no -o ConnectTimeout=2 root@{config.MASTER_IP} 'echo up'"
        result = subprocess.run(ssh_check_cmd, shell=True, capture_output=True)
        
        if result.returncode == 0:
            break
            
        time.sleep(10)
        print(".", end="", flush=True)
        
    print(f"\n\n[+] Master Node ({config.MASTER_IP}) is UP and accessible via SSH!")
    print("[+] Phase 1 Complete. You can now proceed to Phase 2.")

if __name__ == "__main__":
    deploy_master_os()