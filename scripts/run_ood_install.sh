#!/bin/bash
# =============================================================================
# HPC Cluster - Open OnDemand Installation
# 
# This script is executed from the BASTION HOST.
# It copies the Ansible playbook to the Master Node and runs the OOD installer.
# =============================================================================

# Define Master Node connection details
MASTER_IP="192.168.10.2"
MASTER_PASS="hpc"

echo "==========================================================="
echo "   Initiating Open OnDemand Installation (via Ansible)     "
echo "==========================================================="

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
ANSIBLE_DIR="${SCRIPT_DIR}/ansible"

# 1. Ensure sshpass is installed locally
if ! command -v sshpass &> /dev/null; then
    echo "[*] Installing 'sshpass' on Bastion Host..."
    sudo apt-get update && sudo apt-get install -y sshpass
fi

# 2. Copy the ansible folder to the Master Node
echo "[*] Pushing Ansible playbooks to the Master Node ($MASTER_IP)..."
sshpass -p "$MASTER_PASS" scp -o StrictHostKeyChecking=no -r "$ANSIBLE_DIR" root@$MASTER_IP:/root/

# 3. Execute Ansible remotely on the Master Node
echo "[*] Executing playbooks on the Master Node..."
sshpass -p "$MASTER_PASS" ssh -o StrictHostKeyChecking=no root@$MASTER_IP << 'EOF'
    # Navigate to the ansible directory
    cd /root/ansible
    
    echo "[Remote] Running ood_install.yml..."
    ansible-playbook ood_install.yml
EOF

echo "==========================================================="
echo "                 OOD Installation Complete                 "
echo "==========================================================="
