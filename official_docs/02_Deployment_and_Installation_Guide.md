# HPC Cluster Management System — Deployment & Installation Guide

This guide provides the complete, step-by-step instructions to take this software repository and deploy the full HPC cluster environment from scratch.

> [!WARNING]
> This guide assumes you have a clean, network-isolated physical environment. Do not plug the internal cluster switch into a campus network, as the Master node will run a rogue DHCP server via Warewulf, which could lead to an IT security block.

---

## 1. Physical Hardware & Networking Requirements

Before running any code, ensure your physical infrastructure is wired correctly.

### Required Hardware
- **1x Bastion Host**: A laptop or server (Linux/macOS) with Docker installed. This will run the React frontend and FastAPI backend.
- **1x Master Node**: A server with **two physical network interfaces**.
  - `Interface 1 (eth0)`: Connected to the Bastion host (or campus network) for administrative access.
  - `Interface 2 (eth1)`: Connected exclusively to the internal cluster switch.
- **Nx Compute Nodes**: Diskless (or disk-ignored) machines connected to the internal switch. They must have PXE booting enabled in their BIOS/UEFI.
- **1x Unmanaged Switch**: (e.g., D-Link DGS-1016D) isolated from the rest of the world.

### IP Address Mapping (Example)

- Bastion Host: `192.168.10.100`
- Master Node (Admin Interface): `192.168.10.2`
- Master Node (Provisioning Interface): `192.168.20.1` (Configured automatically during setup)

---

## 2. Deploying the Web Orchestrator

The entire cluster management web application is containerized using Docker Compose. It encapsulates the React UI, FastAPI control plane, PostgreSQL database, Redis cache, Keycloak IAM, and Nginx proxy.

### Step 1: Clone and Configure
Clone the repository to your **Bastion Host**.

```bash
git clone https://github.com/your-org/hpc-cluster-management-system.git
cd hpc-cluster-management-system
```

Open the `.env` file in the root directory and ensure the database passwords and secret keys are set. For local testing, the defaults are sufficient.

### Step 2: Build and Run

Bring up the entire stack in the background.

```bash
docker-compose up -d --build
```

You can verify that all 6 containers are running:
```bash
docker ps
```
You should see: `nginx`, `frontend`, `backend`, `keycloak`, `postgres`, and `redis`.

### Step 3: Access the Dashboard

Open your web browser and navigate to the Nginx reverse proxy endpoint on the Bastion Host:
- **URL**: `http://localhost` (or `http://192.168.10.100` if accessing from another machine).

You will be presented with the glassmorphism HPC Cluster Dashboard.

---

## 3. Provisioning the Master Node via the UI

The Master Node is initially a blank slate (running a fresh install of AlmaLinux 9). The web application will SSH into it and build the entire HPC infrastructure.

1. Navigate to the **Master Setup** tab in the React Dashboard.
2. Enter the IP address of the Master Node's admin interface (e.g., `192.168.10.2`) and the root SSH credentials.
3. Fill out the **Network Configuration** section:
   - Provide the exact name of the internal network interface (e.g., `eth1` or `enp3s0`).
   - The system will automatically default the cluster network to `192.168.20.1/24`.
4. Click **Start Automated Deployment**.

> [!NOTE]
> **What happens in the background?**
> The FastAPI backend initiates an asynchronous SSH connection (`asyncssh`). It locks down the network, configures the internal interface with a static IP, installs the EPEL and OpenHPC repositories, installs Slurm (`slurmctld`, `slurmd`, `slurmdbd`), MariaDB, Warewulf 4, and Open OnDemand. The execution logs are streamed back to your browser in real-time via WebSockets.

---

## 4. Compiling the Golden Images

Once the Master Node is fully provisioned, you must create the OS image that will be pushed to the compute nodes.

1. Navigate to the **Golden Images** tab in the Dashboard.
2. Select your desired base image (e.g., `AlmaLinux 9 OCI` or `Rocky Linux 9`).
3. Click **Compile Image**.
   - The backend will command Warewulf to pull the docker container (`docker://almalinux:9`), build the `vnfs` image, and inject the default node overlays.

---

## 5. Booting the Compute Nodes

1. Power on your physical compute nodes.
2. Ensure their BIOS is set to **Boot from Network (PXE)** as the first priority.
3. The compute nodes will broadcast a DHCP request over the isolated switch. The Master Node (running Warewulf's DHCP daemon) will respond, assign an IP in the `192.168.20.x` range, and stream the compiled Golden Image directly into the node's RAM.
4. Once booted, the node will appear in the dashboard's **Telemetry & Health** panel. Slurm will register the node, and it will be ready to accept jobs.
