# Comprehensive Automated 5-Node Architecture Implementation Plan

This is the deeply detailed transition plan. It analyzes the current configuration and outlines the exact codebase changes required to achieve 100% automation from the Management Web App. 

---

## 1. The New IP Architecture (IP Aliasing on Single Port)

Based on your `.env` and configuration, because your PCs only have 1 Ethernet port, you are utilizing **IP Aliasing** (multiplexing multiple logical subnets onto a single physical port/switch). 
*   **Admin Network (192.168.10.x):** Used for internet, Teleport, and Web App SSH management.
*   **Provisioning/Compute Network (192.168.20.x):** Used by Warewulf and Slurm to isolate PXE and job traffic.
*   **Data Network (192.168.30.x):** Used for NFS.

Here is the exact topology the automation will use:

| Role | Hostname | Admin IP (10.x) | Provisioning IP (20.x) | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Bastion Host** (8GB) | `bastion` | **192.168.10.200** | N/A | Runs Web App & Teleport. Manages Master via 10.x. |
| **Master Node** (16GB) | `master` | **192.168.10.2** | **192.168.20.1** | Runs OOD, Keycloak. Warewulf runs on 20.1. |
| **Dev Node** (8GB) | `dev-node` | N/A | **192.168.20.10** | PXE booted via 20.x. Runs VS Code. |
| **Compute 1** (8GB) | `pc1` | N/A | **192.168.20.11** | PXE booted via 20.x. Runs slurmd. |
| **Compute 2** (8GB) | `pc2` | N/A | **192.168.20.12** | PXE booted via 20.x. Runs slurmd. |

### The "Single Port" PXE Workflow
Because you are sharing the same physical switch for the `10.x` and `20.x` traffic, Warewulf's DHCP server (running on `192.168.20.1`) could still conflict with your building's router if DHCP broadcasts leak. To safely PXE boot nodes using your specific physical method:
1.  **Isolate:** Unplug the building's internet cable from your local network switch.
2.  **Enable DHCP:** Start the Warewulf DHCP service on the Master Node (`systemctl start dhcpd`).
3.  **PXE Boot:** Power on the Dev and Compute nodes. They get `20.x` IPs from Warewulf.
4.  **Disable DHCP:** Once the nodes are fully booted, immediately stop the DHCP service (`systemctl stop dhcpd`).
5.  **Reconnect:** Plug the internet cable back into your local switch.

---

## 2. Phased Implementation Plan (Codebase Changes)

### Phase 1: Container Orchestration Split
Currently, your `docker-compose.yml` runs everything. We must split it so the Web App runs on the Bastion host, and IAM/Databases run on the Master Node.

1.  **Refactor Bastion `docker-compose.yml`:**
    *   Remove the `keycloak` service.
    *   Keep `postgres`, `redis`, `backend`, `frontend`, `nginx`, `celery_worker`, `prometheus`, and `grafana`.
    *   Update `grafana` OIDC environment variables to point to the Master Node's IP (`http://192.168.20.2:8080/realms/master...`).
2.  **Create `docker-compose-master.yml`:**
    *   Create a new file in the repository root.
    *   Add `keycloak:24.0.0` (attached to Postgres or its own internal db).
    *   Add `mariadb` (needed for Slurm Accounting `slurmdbd`).

### Phase 2: Backend API & Celery Task Enhancements
The Python backend (FastAPI/Celery) must be rewritten to handle the new "Push" model where Bastion sets up itself, and then SSH's into Master to set it up.

1.  **New Bastion Route (`backend/api/routes/bastion.py`):**
    *   Create an endpoint `POST /api/v1/bastion/deploy`.
    *   Create a Celery task that executes a local bash script / Ansible playbook on the Bastion host (setting up Teleport and firewalld).
2.  **Update Master Route (`backend/api/routes/master.py`):**
    *   Update `MasterDeployPayload` to ensure it captures the explicit Master IP (`192.168.10.2`).
    *   Modify the Celery task: Before it runs the existing Warewulf/OOD playbooks, it must first SSH into `192.168.10.2`, install Docker, copy `docker-compose-master.yml`, and run `docker-compose up -d`.

### Phase 3: Frontend UI Enhancements (React)
The frontend currently only has `MasterSetupPage` and `SlaveSetupPage`. We need to add UI for the Bastion setup and update the Master flow.

1.  **New `BastionSetupPage.tsx`:**
    *   Create a new page identical in styling to `MasterSetupPage`.
    *   Add a form asking for the external Teleport domain (e.g., `hpc.local`) and clicking "Setup Bastion" triggers the WebSocket/Celery task.
2.  **Update `MasterSetupPage.tsx`:**
    *   Add a new step: "Master Node Connection".
    *   Add form fields: `Master IP Address` (default `192.168.10.2`) and `SSH Password`.
    *   Update the WebSocket payload to pass this IP to the backend.
3.  **Update Sidebar Navigation:**
    *   Change the menu to: `Infrastructure Setup -> [Bastion Setup, Master Setup, Compute Setup]`.

### Phase 4: Ansible Playbook Generation (Firewall & Security)
The Web App relies on Ansible playbooks in the `scripts/ansible/` folder to do the heavy lifting, especially for locking down security.

1.  **Create `bastion_setup.yml` (Bastion Firewall):** 
    *   Installs Teleport.
    *   **Firewall Rules:** Opens ports `80` (HTTP) and `443` (HTTPS) to the public (the building LAN) so anyone can access the Web App and Teleport. Leaves port 22 open for your admin laptop.
2.  **Update `ood_install.yml` (Master Firewall):**
    *   Modify it to point Open OnDemand's OIDC authentication to the new Master Node Keycloak Docker container (`http://localhost:8080`).
    *   **Firewall Rules:** The Master Node will use `firewalld` rich rules to strictly control SSH access.
        *   **Allow Web/Cluster Traffic:** Open necessary ports for NFS, Slurm (6817/6818), and HTTP/HTTPS for OOD to the `192.168.10.0/24` subnet.
        *   **Restrict SSH (Port 22):** Apply a rich rule to **ONLY allow the Bastion Host (`192.168.10.200`) to SSH into the Master Node.**
        *   *Note on Dev Node:* **No**, the Dev Node does NOT need SSH access to the Master. The Dev node talks to the Master via Slurm's dedicated ports and NFS. Blocking Dev Node SSH access to the Master is a critical security best practice to prevent a compromised user session from hacking the control plane.

---

## 3. The End-to-End User Experience (How you will use it)

Once these 4 Phases are coded, your physical workflow will be incredibly simple:

1.  **Manual OS Install:** You install AlmaLinux 9 (Minimal ISO) on the Bastion and Master nodes. You plug them into the switch.
2.  **Clone & Run:** You SSH into the Bastion Host, `git clone` the repo, and type `docker-compose up -d`.
3.  **UI - Bastion Setup:** You open the Web App in your browser. You navigate to **Bastion Setup**, click "Deploy". The Web App locks down the Bastion firewall and installs Teleport.
4.  **UI - Master Setup:** You navigate to **Master Setup**. You enter `192.168.10.2` and the password. You click "Deploy". The Web App automatically SSH's into the Master Node, installs Docker, boots Keycloak, installs OOD, Slurm, and Warewulf.
5.  **UI - Compute Setup & PXE Boot:** You navigate to **Compute Setup**. You input the MAC addresses for the Dev/Compute nodes. Then, you execute your physical "Cable Unplug & DHCP Toggle" workflow to boot them safely into the `192.168.10.x` network.
