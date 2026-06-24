# 🚀 HPC Cluster Management System

<div align="center">
  <img src="https://img.shields.io/badge/Status-Production-brightgreen" alt="Status: Production" />
  <img src="https://img.shields.io/badge/Frontend-React%20%7C%20Vite-blue" alt="Frontend: React | Vite" />
  <img src="https://img.shields.io/badge/Backend-FastAPI-teal" alt="Backend: FastAPI" />
  <img src="https://img.shields.io/badge/Scheduler-Slurm-orange" alt="Scheduler: Slurm" />
  <img src="https://img.shields.io/badge/Provisioner-Warewulf%204-red" alt="Provisioner: Warewulf 4" />
</div>

<br />

Welcome to the **HPC Cluster Management System**. This project is a production-grade, containerized web platform designed to seamlessly orchestrate, provision, and monitor a bare-metal High-Performance Computing (HPC) cluster from a single pane of glass.

By merging modern web architecture (React, FastAPI, WebSockets) with heavy-duty Linux administration tools (Slurm, Warewulf, Ansible), this system eliminates the massive command-line overhead traditionally required to build and manage supercomputing environments.

---

## ✨ Features

- **Automated Bare-Metal Provisioning**: Turn a clean physical machine into an HPC Master Node via a multi-step web wizard powered by asynchronous SSH and Ansible Runner.
- **Stateless Compute Booting**: Manage diskless compute nodes via Warewulf 4. The system compiles OCI containers (AlmaLinux, Rocky) into RAM-bootable Virtual Node File Systems (VNFS).
- **Real-Time Telemetry**: Monitor Slurm job queues, node health (IDLE, DRAIN), and execution streams in real-time via Redis and WebSocket integrations.
- **Enterprise IAM & SSO**: Fully integrated Keycloak OIDC authentication enforcing MFA and RBAC across both the administrative dashboard and the Open OnDemand user portal.
- **Modern User Experience**: A highly polished, responsive "Premium Glassmorphism" React UI designed for administrators.

---

## 🏗️ High-Level Architecture

The system operates across three tiers:
1. **The Bastion Host**: Runs the containerized orchestration stack (React, FastAPI, PostgreSQL, Redis, Keycloak, Nginx).
2. **The Master Node**: The central HPC server running Slurmctld, Warewulfd, MariaDB, and Open OnDemand.
3. **The Compute Nodes**: Diskless physical servers booting stateless OS images entirely into RAM over an isolated provisioning network.

```mermaid
flowchart LR
    Bastion[Bastion Host\n(Docker Stack)] == "WebSockets / SSH" ==> Master[Master Node\n(Slurm + Warewulf)]
    Master == "PXE Boot / Munge" ==> Compute[Compute Nodes\n(Stateless RAM Boot)]
```

---

## 📚 Official Documentation

To fully understand, deploy, and extend this system, please consult the deep-dive documentation located in the [`official_docs`](./official_docs/) directory.

| Guide | Description |
|---|---|
| 📐 [01. Architecture & Design](./official_docs/01_Architecture_and_Design.md) | High-Level and Low-Level Design, network maps, and component interactions. |
| 🚀 [02. Deployment & Installation](./official_docs/02_Deployment_and_Installation_Guide.md) | Step-by-step instructions for deploying the Docker stack and wiring the cluster. |
| 🐺 [03. Provisioning & Warewulf](./official_docs/03_Provisioning_and_Warewulf.md) | How stateless PXE booting works, OCI container images, and system overlays. |
| ⚙️ [04. Slurm & Workload Management](./official_docs/04_Slurm_and_Workload_Management.md) | Job scheduling, MariaDB accounting, queues, and resolving node synchronization. |
| 🔐 [05. Open OnDemand & SSO](./official_docs/05_Open_OnDemand_and_SSO.md) | Integrating the OOD user portal with Keycloak OIDC, Apache proxies, and Dex. |
| 🛠️ [06. Operations & Troubleshooting](./official_docs/06_Operations_and_Troubleshooting.md) | The definitive Day-2 operations cheatsheet, log locations, and common fixes. |
| 💻 [07. Developer Guide](./official_docs/07_Developer_Guide.md) | How to extend the React and FastAPI codebase and use the WebSocket pipeline. |
| 📦 [08. Technology Stack](./official_docs/08_Technology_Stack.md) | An exhaustive inventory of every technology used and the rationale behind it. |
| 🛡️ [09. Security, Networking & Storage](./official_docs/09_Security_Networking_and_Storage.md) | Deep dive into systemd NFS automounts, NAT firewalls, and custom SELinux modules. |

---

## 🚀 Quick Start

To launch the web management dashboard locally:

1. Clone the repository.
2. Ensure Docker and Docker Compose are installed.
3. Run the orchestration stack:
```bash
docker-compose up -d --build
```
4. Access the portal at `http://localhost`.

For full setup instructions, please read the [Deployment Guide](./official_docs/02_Deployment_and_Installation_Guide.md).
