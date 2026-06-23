# HPC Cluster Deployment Overview

## 1. Goal
The primary objective is to build a High-Performance Computing (HPC) cluster from scratch using a set of unprovisioned hardware. You are starting with one laptop running Ubuntu and three bare-metal PCs that have no Operating System installed. 

The goal is to use the laptop as the initial "host" or "bastion" to orchestrate the deployment. This orchestration will convert one of the bare-metal PCs into a **Head Node** (also known as the Master Node or Thick Client) and the remaining two PCs into **Compute Nodes** (Thin Clients).

## 2. Architecture and Scenario
This scenario describes a tiered bootstrap deployment, going from a single administrative laptop to a fully functioning, multi-node compute cluster.

### Hardware Roles
*   **Bastion Host (Ubuntu Laptop):** Connected to the internet and used by the administrator to orchestrate the configuration of the cluster via SSH (using Python scripts). This is the recommended approach as it centralizes management, keeps provisioning scripts safe and separate from the cluster hardware, and scales efficiently.
*   **Master Node (PC 1 - Thick Client):** The first bare-metal PC to be provisioned. It acts as the "brain" of the cluster. It will have a persistent Operating System (AlmaLinux 9) installed manually via a bootable USB drive on its physical drive (taking up around 6 GB). It runs the scheduling software and acts as the provisioning server for the compute nodes.
*   **Compute Nodes (PC 2 & PC 3 - Thin Clients):** The remaining two bare-metal PCs. They are "thin" because they do not have a persistent Operating System installed on their local hard drives. Instead, they boot statelessly over the network (PXE boot) directly into RAM using an image provided by the Master Node.

### Network Design
Based on the design, the cluster is segmented into three distinct networks to separate traffic types for security and performance:
1.  **Admin Network (`192.168.10.0/24`):** Used by the Bastion Host to communicate with the Master Node and other components, as well as for initial SSH configuration.
2.  **Data Network (`192.168.30.0/24`):** A dedicated, high-bandwidth network for data transfers and shared file systems (NFS) between the Master and Compute nodes.
3.  **Compute / Provisioning Network (`192.168.20.0/24`):** Used specifically for PXE-booting the thin clients and internal cluster communication. The Master Node acts as a DHCP/TFTP server on this network to assign IPs (e.g., `192.168.20.10`) and serve the OS images.

### Deployment Workflow (Orchestrated via Python)

The deployment relies heavily on **Python scripts** (run from the Bastion Host) to automate and orchestrate the configuration process. While manual intervention is required to power on the hardware, these Python scripts act as the central controller over SSH to configure the OS, set up OpenHPC/Slurm, and configure Warewulf (for stateless thin-client provisioning).

*   **Phase 1: Bootstrapping the Master Node (Manual OS Install)**
    *   The Operating System (AlmaLinux 9) is installed manually on the Master Node using a bootable USB drive (created via Rufus).
    *   During installation, the user only needs to ensure the **Admin Network** interface receives an IP address so the Bastion Host can establish an initial SSH connection.

*   **Phase 2: Configuring the Master Node**
    *   Once the Master Node has booted into its new OS, the Python orchestration scripts use **SSH** to securely connect and take over configuration.
    *   **Network Setup:** The scripts first configure the remaining network interfaces (Data Network and Provisioning Network) on the Master Node. Running this remotely via Python from the Bastion Host is the better option compared to running a local script on the Master Node, as it centralizes all infrastructure-as-code on the admin laptop and ensures consistency.
    *   The scripts install and configure **OpenHPC** (cluster utilities) and **Slurm** (the job scheduler that handles scattering, gathering, and reducing computational tasks).
    *   The scripts then install and configure **Warewulf**. This turns the Master Node into a secondary deployment server meant specifically for the rest of the cluster.

*   **Phase 3: Provisioning the Thin Clients**
    *   Through the Python orchestration scripts, the Master Node is instructed to build a "Golden Image"—a containerized, stateless version of the OS loaded with compute tools.
    *   The administrator **manually powers on** the remaining two bare-metal PCs (Compute Nodes).
    *   Because they are empty and configured to PXE boot, they attempt a network boot. The Master Node intercepts this request over the Provisioning Network and serves them the Golden Image directly into their memory.
    *   These thin clients register with the Slurm scheduler, completing the cluster setup.

### Summary
In essence, the scenario creates a sophisticated compute cluster with a mix of manual and automated steps. The Master Node is initially provisioned manually via a bootable USB drive. Following that, Python scripts (running on the Bastion Host) orchestrate the remaining configuration over SSH, setting up the Master Node and instructing it to dynamically provision the worker nodes. The administrator manually handles the physical power states of the hardware, while the Python orchestration handles all software and cluster configuration.
