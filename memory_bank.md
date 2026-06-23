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
| **Automation** | TBD — asyncssh/Paramiko vs Ansible Runner |

---

## 📁 Project Root

```
/home/umer/Desktop/HPC-Cluster-Script/HPC Cluster Management System/
├── frontend/          ← React + TypeScript + Vite (ACTIVE)
├── scripts/           ← Legacy Python scripts (src/, ansible/, docs/)
├── docs/              ← Architecture & design docs (01–08)
└── Goal.txt           ← Master spec document
```

---

## ✅ Completed Work

### Session 1 — 2026-06-22
**Goal:** Read all docs and Goal.txt. Scaffold frontend. Build basic homepage and Compute Nodes provisioning UI.

**What was done:**
- Read all 8 docs in `docs/`, all 4 phase scripts in `scripts/src/`, `Goal.txt`
- Scaffolded **React + TypeScript + Vite** project inside `frontend/` using `create-vite@4`
- Installed `react-router-dom@6` (v7 requires Node ≥20, system has Node 18)
- Pinned development server hostname to `192.168.10.100` inside `vite.config.ts` for clean admin network routing
- Built the **complete file structure**:
  - `src/main.tsx` — entry point with BrowserRouter
  - `src/App.tsx` — route definitions
  - `src/index.css` — full dark-mode design system (CSS variables, tokens)
  - `src/components/Layout/` — shell + sticky glassmorphism navbar with connection status pill
  - `src/components/Navbar/` — brand, nav links, "Not Connected" badge
  - `src/pages/HomePage/` — hero section + two provision cards (Master + Compute Nodes)
  - `src/pages/MasterSetupPage/` — placeholder page (Phase 1–3)
  - `src/pages/SlaveSetupPage/` — Modularized Phase 4 setup
    - `SlaveSetupPage.tsx` — Container layout (Main Col + Sticky Sidebar)
    - `NodeRegistryStep/` — Step 1: Registry Grid and CSV import
    - `ImageAssignStep/` — Step 2: Image Allocation & Image Config Builder
    - `PipelinePanel/` — Sticky execution checklist & action launcher
    - `types.ts`, `constants.ts` — Extracted states and interfaces
  - `src/pages/NotFoundPage.tsx` — 404 fallback
  - `public/favicon.svg` — hexagon HPC icon
- Verified: `npm run build` passes (46 modules, no errors)
- Dev server running: `http://192.168.10.100:5173`

**Homepage features built:**
- Ambient radial glow background
- "HPC Cluster Management System" badge with pulsing dot
- Large gradient headline ("Provision Your HPC Cluster")
- Tech stack badges: AlmaLinux 9 / Warewulf 4 / OpenHPC 3.4 / Slurm / MariaDB
- Two large provision cards (Master Node, Compute Nodes)
- Prerequisites status bar at bottom

**Compute Nodes provisioning page features built:**
- **Interactive Node Registry Grid**: Real-time table supporting inline edit, save, cancel, and removal of nodes.
- **Form Validations**: Built-in regex format checking for hostnames (DNS compliant), MAC addresses (`XX:XX:XX:XX:XX:XX`), and IPv4 addresses.
- **ARP Network Discovery**: Integrated a quick-fill scanner UI that displays discovered network devices (MAC/IP) allowing for rapid node registration with a single click.
- **CSV Data Import**: Drag-and-drop/file input selector that parses `hostname,mac,ip` formats, validation-checks each line, skips duplicates, and appends to the table context.
- **Multi-step Stepper Navigation**: Integrated a progress layout separating "Step 1: Hostname Registration" from "Step 2: Provisioning Image Allocation".
- **Stateless Image Management**:
  - Pre-seeded default templates (`almalinux-9` and `rockylinux-9`).
  - Option to select existing/old templates or construct a **New Image**.
  - Dual modes for New Image configuration: **Clone settings from an existing template** or **Create from scratch**.
  - Full-featured **Image Configuration Wizard** displaying all previously hardcoded settings (DNF mirror speeds, client packages to inject, chrony time servers, pam_slurm limits restrictions, memory locks, syslog forwarding, and initramfs compilation configurations).
  - Newly created/compiled images are automatically registered in the list and become selectable in the dropdown node assignment columns.
- **Live Deployment Terminal**: When triggering Phase 4 execution, the UI seamlessly transitions to a new "3. Deployment" tab. A styled Mac-like terminal window appears, displaying a real-time stream of stdout logs (simulated currently with `setTimeout`) alongside the animated pipeline checklist.
- **Architecture & Execution Status**:
  - **Backend Setup**: Successfully scaffolded the **FastAPI Backend** inside `/backend`.
  - **Async Execution Engine**: Implemented `SSHExecutor` utilizing `asyncssh` to connect to the Master Node (`192.168.10.2`) and yield stdout line-by-line asynchronously.
  - **WebSocket Streaming**: Created the `/api/v1/slaves/deploy/ws` WebSocket endpoint that runs Phase 4 `wwctl` and `slurm` commands and pushes the real terminal output to the React Frontend's Live Deployment Terminal.
  - **Phase 3 Completions**: Missing items from `phase3_image.py` (EPEL, CRB, OpenHPC Repositories, Enabled Services) were added to the frontend Image Configuration Wizard to give full control to the user.
- **Post-configuration Guidance card**: Manual instructions checklist for thin-client booting.

---

## 🔲 What Is Left To Build

### Frontend (Priority Order)

#### Next Up: Master Node Setup Page
- [ ] SSH credentials form (IP, password, port, gateway interface)
- [ ] Networking config form (data IP, prov IP, prov subnet, DHCP range)
- [ ] Warewulf config section (image name, image source)
- [ ] Slurm config section (cluster name, partition, max time, CPU topology)
- [ ] "Test SSH Connection" button with live status
- [ ] "Run Provisioning" button → triggers phase 1–3 pipeline
- [ ] Live terminal log panel (WebSocket stream from backend)
- [ ] Step checklist (steps 1.1–1.9 from docs/04_phase1_provisioning.md)
- [ ] Profile save/load system

#### Navbar / Global
- [ ] Live connection status (polling /api/health/ping)
- [ ] Profile switcher dropdown

### Backend (Not started yet)
- [ ] FastAPI app scaffolding (backend/main.py)
- [ ] requirements.txt
- [ ] Profile JSON system (backend/profiles/)
- [ ] core/config_manager.py
- [ ] core/executor.py (async SSH streaming)
- [ ] core/script_builder.py (generates commands from profile)
- [ ] REST APIs: config, profiles, nodes, phases, health
- [ ] WebSocket endpoint /ws/logs

### Infrastructure (Future)
- [ ] PostgreSQL schema & connection
- [ ] Redis cache layer
- [ ] Nginx reverse proxy config
- [ ] Keycloak IAM integration (MFA + RBAC)
- [ ] Docker Compose for full stack

---

## 🔑 Open Decisions (from Goal.txt)

| Decision | Options |
|---|---|
| **Single Ethernet Port** | A: USB-to-Ethernet adapter (recommended) / B: Wi-Fi for campus / C: Consumer router as firewall |
| **Bootstrapping Environment** | A: Run on laptop, SSH to master / B: Self-bootstrap on target machine |
| **Automation Engine** | A: asyncssh / Paramiko / B: Ansible Runner |

---

## 🌐 Network Map

```
Bastion Host (laptop)  192.168.10.100  ← Web app runs here (for now)
Master Node            192.168.10.2    ← Admin IP
Master (Data)          192.168.30.1    ← Data network
Master (Prov)          192.168.20.1    ← Provisioning / PXE
Compute Node pc2       192.168.20.10
Compute Node pc3       192.168.20.11
```

---

## 📝 Dev Commands

```bash
# Start frontend dev server
cd "HPC Cluster Management System/frontend"
npm run dev

# Build frontend (verify no errors)
npm run build

# Dev server URL
http://192.168.10.100:5173
```

---

## 📌 Important Notes

- Node.js version on system: **v18.19.1** — use react-router-dom@6, create-vite@4
- React Router v7 requires Node >= 20 — DO NOT use it
- Legacy frontend/ (old plain HTML files) was replaced by the Vite project
- scripts/src/ Python files are reference only — NOT modified
- scripts/src/config.py hardcoded values must become editable UI fields
