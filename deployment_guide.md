# 5-Node Cluster Deployment Guide

Now that the codebase is completely refactored to support the **5-Node IP Aliased Architecture**, here is the step-by-step operational guide you need to follow to bring the cluster to life.

## Overview of the New Topology

Your setup multiplexes three logical networks across a single physical switch:
- **Admin Network (10.x):** Your building/office LAN.
- **Provisioning Network (20.x):** Used exclusively for Warewulf and Slurm.
- **Data Network (30.x):** Used for NFS.

| Role | Hostname | Hardware | Primary IPs (Aliased) |
| :--- | :--- | :--- | :--- |
| **Bastion Host** | `bastion` | Pentium (8GB) | `192.168.10.200` |
| **Master Node** | `master` | Core i3 (16GB) | `192.168.10.2` (Admin) <br> `192.168.20.1` (Prov) <br> `192.168.30.1` (Data) |
| **Dev Node** | `dev-node` | Pentium (8GB) | `192.168.20.10` |
| **Compute Nodes**| `pc1`, `pc2` | Pentium (8GB) | `192.168.20.11`, `192.168.20.12` |

---

## Step 1: Physical Setup & Initial OS Installation

1. **Master Node (Core i3):**
   - Connect it to your switch.
   - Install AlmaLinux 9 (Minimal).
   - Configure its network interface with static IP `192.168.10.2/24` and your building's gateway/DNS.
   - Set the root password to `hpc` (or whatever you prefer, you will enter this in the Web App later).
   - Enable SSH (`systemctl enable --now sshd`).

2. **Bastion Host (Pentium):**
   - Connect it to your switch.
   - Install AlmaLinux 9 (Minimal).
   - Configure its network interface with static IP `192.168.10.200/24`.
   - Install Docker (`dnf install docker-ce ...`) and Git.

## Step 2: Deploy the Web App (Bastion)

1. SSH into the Bastion Host (`192.168.10.200`) from your laptop.
2. Clone your updated repository:
   ```bash
   git clone https://github.com/Umer-Farooq-CS/HPC-Cluster-Management-System.git
   cd "HPC Cluster Management System"
   ```
3. Boot the Web Application stack:
   ```bash
   docker compose up -d --build
   ```
4. On your laptop, open a web browser and navigate to `https://192.168.10.200` to access the Management Dashboard.

## Step 3: Automated Provisioning via Web App

Once you log into the Web App, you will use the new dropdown menu under **Administration** to automatically deploy the rest of the cluster.

### A. Bastion Setup (Hardening & Teleport)
1. Go to **Administration -> Bastion Setup**.
2. Enter your laptop's IP address (e.g., `192.168.10.100`) and your Teleport domain info.
3. Click **Deploy**.
> [!IMPORTANT]
> The backend will execute `scripts/ansible/bastion_setup.yml`. This will install Teleport and immediately **lock down SSH on the Bastion Host** so that only your laptop can access it.

### B. Master Setup (IAM, Slurm, Warewulf, OOD)
1. Go to **Administration -> Master Setup**.
2. Enter `192.168.10.2` as the Admin IP, and provide the root password (`hpc`).
3. Click **Deploy**.
> [!NOTE]
> Behind the scenes, the Web App will SSH into the Master Node. It will first install Docker and deploy `docker-compose-master.yml` (Keycloak & MariaDB). Then, it will run the rest of the Ansible/Shell scripts to install Warewulf, Slurm, and Open OnDemand.
> It will also bind `192.168.20.1` and `192.168.30.1` to the Master Node's physical port via NetworkManager aliasing.
> Finally, it will lock down SSH on the Master Node so that **only the Bastion Host** can SSH into it.

### C. Compute / Dev Nodes (The Physical DHCP Toggle)
Because Warewulf's DHCP server on the Master Node is now active, you must perform your physical toggle workflow to PXE boot the diskless clients safely.

1. Go to **Administration -> Compute Setup** and build your Golden Image (if you haven't already).
2. Assign the Dev and Compute nodes (MAC addresses and IPs: `20.10`, `20.11`, `20.12`) to the image and click Deploy.
3. **Physical Workflow:**
   - Unplug the building's internet cable from your local switch.
   - Start DHCP on Master: `ssh root@192.168.10.2 "systemctl start dhcpd"` (Do this from the Bastion Host terminal, since your laptop's SSH is now blocked by the firewall).
   - Power on the Dev Node and Compute Nodes. Wait for them to boot into the OS completely.
   - Stop DHCP on Master: `ssh root@192.168.10.2 "systemctl stop dhcpd"`
   - Plug the building's internet cable back in.

## Step 4: Verification

1. Access the **Cluster Info** page on the dashboard to ensure all nodes are reporting telemetry via Slurm.
2. Navigate to `https://192.168.10.2:8443` (or whatever domain you set) to access **Open OnDemand**. Login using Keycloak.
3. Open a shell or VS Code session in OOD to verify that jobs are successfully dispatched to `pc1` and `pc2`.
