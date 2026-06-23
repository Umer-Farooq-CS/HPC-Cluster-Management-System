"""
Configuration settings for the HPC Cluster Deployment.
"""

# --- Master Node SSH Configuration ---
MASTER_IP = "192.168.10.2"      # Admin Network IP (Assigned manually during OS install)
MASTER_PASS = "hpc" # Root password set during OS install

# --- Cluster Network Configuration ---
# Data Network: Dedicated high-bandwidth network for NFS and data transfers
DATA_IP = "192.168.30.1"       

# Provisioning Network: Used for PXE booting thin clients and cluster communication
PROV_NETWORK = "192.168.20.0"
PROV_IP = "192.168.20.1"