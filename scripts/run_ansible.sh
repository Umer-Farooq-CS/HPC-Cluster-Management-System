#!/bin/bash
# =============================================================================
# HPC Cluster Health Check Trigger
# 
# This script is executed from the BASTION HOST.
# It copies the Ansible playbook and inventory to the Master Node (192.168.10.2),
# ensures Ansible is installed on the Master Node, and runs the playbook.
# =============================================================================

# Define Master Node connection details
MASTER_IP="192.168.10.2"
MASTER_PASS="hpc"

echo "==========================================================="
echo "   Initiating HPC Cluster Health Check (via Ansible)       "
echo "==========================================================="

# 1. Ensure sshpass is installed locally
if ! command -v sshpass &> /dev/null; then
    echo "[*] Installing 'sshpass' on Bastion Host..."
    sudo apt-get update && sudo apt-get install -y sshpass
fi

# 2. Copy the ansible folder to the Master Node
echo "[*] Pushing Ansible playbooks to the Master Node ($MASTER_IP)..."
sshpass -p "$MASTER_PASS" scp -o StrictHostKeyChecking=no -r ./ansible root@$MASTER_IP:/root/

# 3. Execute Ansible remotely on the Master Node
echo "[*] Executing playbooks on the Master Node..."
sshpass -p "$MASTER_PASS" ssh -o StrictHostKeyChecking=no root@$MASTER_IP << 'EOF'
    # Install ansible and epel-release if not already installed
    if ! command -v ansible-playbook &> /dev/null; then
        echo "[Remote] Ansible not found. Installing now..."
        dnf -y install epel-release
        dnf -y install ansible
    fi
    
    # Navigate to the ansible directory and run the health check
    cd /root/ansible
    
    echo "[Remote] Running cluster_health.yml..."
    ansible-playbook -i inventory.ini cluster_health.yml
EOF

echo "==========================================================="
echo "                 Health Check Complete                     "
echo "==========================================================="
