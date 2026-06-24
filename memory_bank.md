# HPC Cluster Management System — Memory Bank

> **HOW TO USE:** At the start of every new session, reference this file.
> At the end of every session, ask: _"Update the memory bank with what we did today."_

---

## ⚡ Quick Context

A production-grade web app for managing an HPC cluster running on a laptop bastion host.
The cluster consists of:
- **Master Node** (AlmaLinux 9, head node — Slurm controller, Warewulf 4, MariaDB)
- **Compute Nodes** (`pc2`, `pc3`) — PXE-booted stateless AlmaLinux 9 over D-Link switch (192.168.20.x)

The web app provisions, monitors, and manages the cluster from a browser.

---

## 🏗️ Full Tech Stack (from Goal.txt — follow exactly)

| Layer | Technology |
|---|---|
| **Frontend** | React + TypeScript (Vite) |
| **Backend** | FastAPI (Gunicorn + Uvicorn) |
| **Reverse Proxy** | Nginx (TLS, static file serving) |
| **Auth / IAM** | Keycloak (MFA, RBAC, JWT tokens) |
| **App Database** | PostgreSQL (user accounts, audit trails, saved configs) |
| **Cache** | Redis (shields slurmctld from repeated UI queries) |
| **Automation** | SSHExecutor (asyncssh) & Ansible Runner |

---

## 📁 Project Root

```
/home/umer/Desktop/HPC-Cluster-Script/HPC Cluster Management System/
├── frontend/          ← React + TypeScript + Vite (ACTIVE)
├── backend/           ← FastAPI Backend with PostgreSQL + SQLAlchemy models (ACTIVE)
├── scripts/           ← Ansible playbooks & legacy helper scripts
├── docs/              ← Architecture & design docs (01–08, plus fixes)
└── Goal.txt           ← Master spec document
```

---

## ✅ Completed Work

### Session 1 — 2026-06-22
**Goal:** Read all docs and Goal.txt. Scaffold frontend. Build basic homepage and Compute Nodes provisioning UI.
- Scaffolded **React + TypeScript + Vite** project inside `frontend/` using `create-vite@4`
- Built interactive Node Registry Grid, form validations, ARP network scanner discovery UI, and CSV import.
- Integrated multi-step wizard for compute node image selection and compilation.

### Session 2 — 2026-06-22
**Goal:** Refine HPC provisioning pipeline, debug frontend dashboard, and containerize services.
- Cleaned up frontend network configurations, subnet selectors, and transitions.
- Scaffolded backend directory with Dockerfile, and integrated Docker Compose configuration for the full stack.

### Session 3 — 2026-06-22
**Goal:** Automate Slurm Web deployment and elevate UX/UI with premium styling.
- Styled dashboard pages with glassmorphism and modern dark mode typography.
- Implemented real-time cluster telemetry panels showing active jobs, node health, and queue times.

### Session 4 — 2026-06-23
**Goal:** Fix Warewulf image import processes and handle node state synchronization.
- Resolved target compute node Slurm `DRAIN` and `INVALID_REG` errors.
- Added Chrony time synchronization configurations directly in the stateless container images using `makestep` (stratum-1 sync over master node).
- Implemented a systemd drop-in `wait-for-clock.conf` to force `slurmd` to wait for clock synchronization on boot to avoid token authentication skews.

### Session 5 — 2026-06-23
**Goal:** Simplify dashboard modules by removing unused/incomplete features.
- Surgically removed outdated Phase 2 (Jobs Scheduling) and Phase 3 (Accounting) sub-modules to focus on clean, stable provisioning and core monitoring.

### Session 6 — 2026-06-23
**Goal:** Integrate Open OnDemand SSO and build the Ansible play runner.
- Handled Keycloak-to-Apache OIDC token authentication flow mapping.
- Created the **Ansible Automation Runner Page** in the frontend, allowing admins to run Ansible playbooks (e.g., `ood_install.yml`) with real-time streaming console logs via WebSockets.

### Session 7 — 2026-06-23
**Goal:** Add Golden Images Configuration support.
- Extended image creation forms to support Rocky Linux and Ubuntu OCI container bases.
- Designed template configurations in the database for modular template assignments.

### Session 8 — 2026-06-23
**Goal:** Fix Open OnDemand Passenger spawn and Home Directory permissions.
- Created `/etc/ood/config/create_user_home.sh` pre-hook command to automatically create home directories for basic auth/OIDC users when they log in.
- Wrote and compiled a custom SELinux policy module (`ood_custom.te`) to allow the `ood_pun_t` domain to manage `config_home_t` directories (resolving Rails Passenger `EEXIST` and SQLite WAL/SHM map errors).

### Session 9 — 2026-06-23
**Goal:** Correct Open OnDemand URL redirection routing.
- Fixed malformed URL routing in the frontend components where OOD links pointed to invalid addresses, ensuring proper redirection to port 8008.

### Session 10 — 2026-06-23
**Goal:** Resolve Open OnDemand Job Composer CSRF token validation issues.
- Solved `422 Unprocessable Entity (Invalid Authenticity Token)` CSRF errors in OOD Job Composer (`myjobs` Rails app).
- Configured custom proxy headers (`X-Forwarded-Proto`, `X-Forwarded-Port`, `X-Forwarded-Host`) in Apache virtual host directives via `ood_portal.yml`.
- Configured Rails trusted proxies and disabled secure session cookies for development over unencrypted HTTP (port 8008).

### Session 12 — 2026-06-24
**Goal:** Stabilize HPC Cluster Infrastructure, SSH Connectivity, and NFS Mounts.
- Debugged and resolved compute node boot failures causing "Destination Host Unreachable" and SSH timeout errors.
- Discarded unstable cosmetic IP aliasing (NetworkManager dispatcher scripts) that introduced routing loops.
- Reverted cluster storage networking to flow natively over the `192.168.20.0/24` Provisioning Network.
- Removed custom `/etc/fstab` file from Warewulf site overlays, preventing it from overriding the default system `fstab` and breaking `/home` and `/opt`.
- Implemented a robust systemd-native automount architecture (`export-apps.mount` and `export-apps.automount`) inside the `nodeconfig` overlay, achieving conflict-free NFS mounts.
- Configured Warewulf's host configuration template (`/etc/warewulf/warewulf.conf`) to natively export `/export/apps` to prevent configuration drift.
- Synchronized `phase2_master.py` and `phase3_image.py` scripts with the new, clean design.

### Session 13 — 2026-06-24
**Goal:** Integrate Master Node setup with real backend APIs, verify HTTPS status, and run Spack validation tests.
- Verified that Nginx (port 443) and Apache Open OnDemand (port 8443) are already configured with SSL certificates and operational on HTTPS.
- Executed a live validation of the Spack framework on the Master Node, compiling `zlib` and generating Lmod module files.
- Confirmed that compute nodes instantly pick up the new modules via the NFS `/export/apps` share and Lmod environment variables.
- Created `backend/api/routes/master.py` containing live WebSocket provisioning sequences (network interface binding, firewall, repositories, Chrony NTP server setup, OpenHPC & Slurm installation, Warewulf, and NFS exports).
- Hooked `MasterSetupPage.tsx` directly into the live WebSocket endpoint `/api/v1/master/deploy/ws` to replace the mock provisioning logs with real execution output.

---

## 🔲 What Is Left To Build

### Frontend
- [x] Connect `MasterSetupPage.tsx` wizard to the real backend API (live streaming over WebSockets).
- [ ] Add real-time telemetry polling or event-stream connections to active cluster status indicators.

### Backend
- [ ] Integrate user feedback/alerts notifications system.

### Infrastructure & Deployment
- [x] Upgrade HTTP connections to HTTPS with SSL/TLS certificates for production-grade security (already verified/configured).
- [ ] Perform full scale-out testing with multiple physical diskless nodes booting in parallel.

---

## 🔑 Open Decisions

| Decision | Status |
|---|---|
| **HTTPS Support** | To be implemented in Nginx proxy and Apache virtual hosts to support HTTPS production logins. |
| **Telemetry Delivery** | Currently uses simulation metrics on Dashboard. To be connected to real Prometheus/Node Exporter endpoints. |

---

## 🌐 Network Map

```
Bastion Host (laptop)  192.168.10.100  ← Web app runs here
Master Node            192.168.10.2    ← Admin IP (Running Apache on 8008 for OOD)
Master (Data)          192.168.30.1    ← Data network
Master (Prov)          192.168.20.1    ← Provisioning / PXE / DHCP / NTP
Compute Node pc2       192.168.20.10
Compute Node pc3       192.168.20.11
```

---

## 📝 Dev Commands

```bash
# Start frontend dev server
cd "HPC Cluster Management System/frontend"
npm run dev

# Start backend dev server
cd "HPC Cluster Management System/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Build full stack using Docker Compose
docker-compose up --build -d
```

---

## 📌 Important Notes

- **SELinux Policies:** The compiled policy (`ood_custom`) must remain active on the Master Node to prevent Passenger spawn blocks.
- **Munge Synchronization:** Shared keys must be synced via `wwctl overlay build` whenever system user configurations are updated on the Master Node.
