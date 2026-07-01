# Fully Automated 5-Node Architecture Implementation Plan

This document outlines the strategy for migrating to the 5-node architecture (Bastion, Master, Dev, 2x Compute) where **100% of the infrastructure setup is automated via the Management Web App**. 

## 1. Operating System Recommendations
For both the **Bastion Host** and the **Master Node**, you must manually install:
*   **OS:** AlmaLinux 9
*   **Version:** Minimal ISO (Do not install the GUI/Server with GUI. Minimal ensures a lightweight, secure footprint).

*Note: You do not need to install the OS on the Dev or Compute nodes; they will boot dynamically over the network via Warewulf once the Master Node is set up.*

## 2. The Automated Workflow (How it will work)

You will perform only three manual steps:
1. Install AlmaLinux 9 Minimal on Bastion and Master.
2. `git clone` this repository on the Bastion Host.
3. Run `docker-compose up -d` on the Bastion Host to start the Web App.

Everything else will be driven by buttons in the Web App UI.

### Step A: "Setup Bastion Host" (Automated via Web App)
You click a button in the Web App dashboard. The FastAPI backend triggers a local Celery task that executes an Ansible playbook directly on the Bastion Host to:
*   Install and configure the **Teleport Gateway** for secure external access.
*   Configure the local `firewalld` (opening port 443 for Teleport/Nginx and blocking direct SSH).
*   Set up Nginx reverse proxy routing.

### Step B: "Setup Master Node" (Automated via Web App)
You enter the Master Node's IP and password in the Web App and click "Provision Master". The Bastion Host uses SSH (via Celery) to execute the following on the Master Node:
*   **Docker Setup:** Installs Docker on the Master Node.
*   **Deploy Master Containers:** Transfers a new `docker-compose-master.yml` to the Master Node and spins up **Keycloak** (IAM) and **MariaDB** (SlurmDBD).
*   **Deploy Bare-Metal Services:** Executes Ansible to install Open OnDemand, Slurmctld, Warewulf 4, and the NFS server.
*   **Network Config:** Configures the private cluster network switch routing.

### Step C: "Provision Compute/Dev Nodes" (Automated via Web App)
You use the existing Web App UI to add the Dev Node (Core i3) and Compute Nodes (Pentiums) to Warewulf. You turn them on, and they PXE boot automatically.

---

## 3. Codebase Changes Required to Achieve This

To support this full automation, I need to make the following modifications to your repository:

### A. Refactoring `docker-compose.yml`
*   **Bastion `docker-compose.yml`:** Remove `keycloak` and move it to a new file. Ensure `postgres`, `redis`, `backend`, `frontend`, `grafana`, and `prometheus` run here.
*   **Master `docker-compose-master.yml`:** Create this new file to host `keycloak` and `mariadb` (for Slurm).

### B. New API Routes & Celery Tasks
*   **`backend/api/routes/bastion.py`:** Create a new API endpoint to trigger the Bastion Host setup.
*   **`backend/core/tasks.py`:** Create a new asynchronous Celery task `provision_bastion_host` that runs local bash/Ansible commands.
*   **Update `provision_master_node` task:** Modify the existing Celery task so that before it installs Slurm/Warewulf, it installs Docker and runs the new `docker-compose-master.yml` stack on the Master Node.

### C. Ansible Playbooks
*   Create `scripts/ansible/bastion_setup.yml` to automate Teleport and Firewall setup on the Bastion host.
*   Update `scripts/ansible/ood_install.yml` to point Keycloak authentication to the new Master Node Docker stack.
