# HPC Cluster Management System — Technology Stack

This document serves as an exhaustive inventory of the technologies powering the HPC Cluster Management System. It explains not just *what* is used, but *why* it was chosen over alternatives to meet the specific demands of bare-metal High-Performance Computing.

---

## 1. Web Application & Orchestration (The Bastion)

This stack runs isolated on the Bastion Host, containerized via Docker Compose.

### Frontend
- **React 18**: The core UI library. Chosen for its component-based architecture, making complex, stateful dashboards manageable.
- **TypeScript**: Adds static typing to JavaScript. Critical for preventing runtime errors when dealing with complex JSON payloads and cluster API responses.
- **Vite**: The build tool and development server. Replaced Webpack/Create-React-App for its near-instant Hot Module Replacement (HMR) and extremely fast build times.
- **TailwindCSS**: The styling framework. Chosen to rapidly implement the "Premium Glassmorphism" UI aesthetic without writing thousands of lines of custom CSS.

### Backend API
- **FastAPI (Python 3)**: The backend framework. Chosen specifically over Flask or Django because of its native support for asynchronous programming (`async/await`), which is strictly required for handling concurrent connections without blocking.
- **Celery**: Asynchronous task queue used to run resource-heavy or long-running operations (such as compiling system images, running playbooks, and deploying nodes) out-of-process.
- **Uvicorn / Gunicorn**: The ASGI server handling concurrent HTTP and WebSocket connections.
- **asyncssh**: The Python library used to establish non-blocking SSH tunnels into the Master Node to execute bootstrapping and configuration commands.

### Databases & State
- **PostgreSQL**: The primary relational database. Stores the state of the web application (saved subnets, node MAC addresses, OCI image URLs, and Keycloak user metadata).
- **Redis**: The in-memory data store. Acts as the Celery task broker, a log storage list for WebSocket log streaming, and a high-speed telemetry cache for Slurm state. A periodic Celery beat task polls Slurm, saves the state to Redis, and the frontend reads from it instantly to prevent connection storms.

### Monitoring & Telemetry
- **Prometheus**: Time-series database that pulls hardware metrics every 15 seconds from Node Exporters running on the Master Node and compute nodes, as well as Slurm status via Slurm Exporter.
- **Grafana**: Graphical dashboard generator that queries Prometheus to render zoomable, historical resource metrics. Integrated with Keycloak SSO and proxied via Nginx.

### Identity & Security
- **Keycloak**: Open Source Identity and Access Management (IAM). Provides robust SSO, MFA, and RBAC via JSON Web Tokens (JWT) for both the administration dashboard and Grafana.
- **Nginx**: The reverse proxy. Handles TLS termination (HTTPS) and routing traffic between the React frontend, FastAPI backend, Keycloak authentication, and Grafana endpoints.

---

## 2. Master Node Infrastructure (The Brain)

These technologies are installed and managed automatically on the Master Node (`192.168.10.2`) by the Bastion's deployment scripts.

### Operating System
- **AlmaLinux 9**: The base OS for the Master Node. Chosen as a 1:1 binary compatible, production-grade successor to CentOS.

### Provisioning & Bootstrapping
- **Warewulf 4**: The stateless bare-metal provisioner. Chosen over xCAT or legacy PXE tools because WW4 utilizes modern OCI (Docker) containers to build compute node images, making OS image management incredibly clean.
- **iPXE / TFTP**: Network boot protocols. iPXE handles pulling the massive, compressed OS payloads over HTTP instead of slow TFTP.

### Workload Management
- **Slurm (Simple Linux Utility for Resource Management)**: The de facto standard open-source job scheduler used by the world's top supercomputers. Manages job queues and node allocations.
- **Munge**: The authentication service for Slurm. Cryptographically signs all Slurm payloads to prevent unauthorized commands.
- **MariaDB**: The relational database dedicated exclusively to `slurmdbd` for tracking historical job accounting and fair-share usage.

### Storage & Time
- **NFS (Network File System)**: Used to share the `/export/apps` directory from the Master Node to all compute nodes.
- **Chrony**: The NTP daemon. Configured as a Stratum 1 timeserver on the Master Node to ensure compute nodes are synchronized to the millisecond (required by Munge).

---

## 3. User Portal (The Gateway)

### Open OnDemand (OOD)
- **Apache HTTP Server (`httpd`)**: Serves the OOD portal. Configured with `mod_auth_openidc` to interact with Keycloak.
- **Dex**: An Identity Provider acting as the OIDC bridge connecting Apache to Keycloak.
- **Ruby on Rails / Node.js**: The languages powering the individual OOD applications (Job Composer, Dashboard, File Explorer, Terminal).
- **Phusion Passenger**: The application server that spawns the Per-User Nginx (PUN) processes to serve the Ruby/Node apps securely as the authenticated user.
