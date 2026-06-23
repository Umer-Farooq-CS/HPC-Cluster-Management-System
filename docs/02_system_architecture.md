# HPC Cluster Management System — System Architecture

This document explains the technical architecture of the local full-stack web application.

---

## 1. Technological Stack

- **Frontend:** Single Page Application (SPA) using HTML5, Vanilla JavaScript (ES6 modules), and Custom CSS. Includes components for live terminal output rendering and form validations.
- **Backend:** Flask (Python 3) server with `Flask-SocketIO` to support real-time WebSocket communication.
- **Communication:** HTTP REST APIs for configuration management, profile switching, and node editing; WebSockets for long-running task console log streams.
- **Client Execution:** Command execution is performed from the Bastion host targeting the Master Node via password-authenticated SSH channels (`sshpass` wrapper + pseudo-terminal allocation).

---

## 2. Command Execution Workflow

Because installation tasks (like downloading RPMs or building the VNFS container) take a substantial amount of time, standard HTTP requests would timeout. The application handles this using a WebSocket-based task runner.

```
+------------+             +-------------+             +-------------+             +-------------+
| Web Browser|             | Backend API |             | SSH Wrapper |             | Master Node |
+-----+------+             +------+------+             +------+------+             +------+------+
      |                           |                           |                           |
      | 1. HTTP POST /run-phase   |                           |                           |
      +-------------------------->+                           |                           |
      |                           | 2. Spawn execution thread |                           |
      |                           +-------------------------->+                           |
      | 3. HTTP 202 Accepted      |                           | 3. sshpass -tt -q ...     |
      +<--------------------------+                           +-------------------------->+
      |                           |                           |                           |
      |                           |                           | 4. Return stdout stream   |
      |                           | 5. Parse log line         |<--------------------------+
      |                           |<--------------------------+                           |
      | 6. WS Emit "log_line"     |                           |                           |
      |<--------------------------+                           |                           |
      |                           |                           | 5. Process ends (Exit 0)  |
      | 7. WS Emit "complete"     |                           |<--------------------------+
      |<--------------------------+                           |                           |
```

---

## 3. Profiles Data Storage

Rather than using a singular `config.py` module, configurations are stored as independent JSON documents in the `backend/profiles/` directory:

- Files are named `<slug>.json` (e.g. `engineering_lab.json`, `testbed_cluster.json`).
- An active marker is maintained in a metadata file (`active_profile.json`), which stores the filename of the currently selected cluster.
- When the backend starts, it reads the active profile configuration and uses it as the configuration context for all shell interactions.

---

## 4. API Endpoints Reference

### Configuration Management
- `GET /api/profiles` — List all stored profiles.
- `POST /api/profiles` — Create a new profile.
- `PUT /api/profiles/:name/activate` — Select active profile.
- `GET /api/config` — Retrieve the active configuration schema.
- `PUT /api/config` — Save configuration updates.
- `POST /api/config/test-ssh` — Validate credentials against the Master Node.

### Orchestration
- `POST /api/phase/:id/execute` — Trigger execution of a phase (1, 2, 3, or 4).
- `POST /api/phase/cancel` — Cancel currently running phase processes.
- `GET /api/phase/status` — Get execution state (idle, running, step ID, percentage).

### Node Operations
- `GET /api/nodes` — List all registered nodes in the active profile.
- `POST /api/nodes` — Register a new node.
- `PUT /api/nodes/:hostname` — Edit IP or MAC of a node.
- `DELETE /api/nodes/:hostname` — Remove node registration.
- `POST /api/nodes/import` — CSV parsing and import helper.

### Health Diagnostics
- `POST /api/health/test` — Trigger the Ansible verification playbooks.
- `GET /api/health/history` — Fetch results of previous verification tasks.
