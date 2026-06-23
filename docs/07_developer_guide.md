# HPC Cluster Management System — Developer Guide

This document guides developers on extending, maintaining, and testing the application locally.

---

## 1. Directory Structure Details

```
HPC Cluster Management System/
├── backend/
│   ├── app.py                  # Entrypoint, CORS config, Blueprint setup
│   ├── requirements.txt        # Backend dependencies
│   ├── cluster_config.json     # Current active configuration cache
│   ├── profiles/               # Directory containing saved cluster profiles (JSON)
│   │   ├── active_profile.json # Reference to the selected profile
│   │   └── default.json        # Base profile configuration template
│   ├── core/
│   │   ├── config_manager.py   # Load, save, edit profiles configurations
│   │   ├── executor.py         # Subprocess runner piping outputs to WS rooms
│   │   └── shell_scripts.py    # Shell commands generators
│   └── api/
│       ├── config_api.py       # Profiles CRUD API endpoints
│       ├── phase_api.py        # Task executors & log streaming triggers
│       ├── nodes_api.py        # Compute node management grid endpoints
│       └── health_api.py       # Ansible diagnostic trigger
│
├── frontend/
│   ├── index.html              # Core SPA template
│   ├── css/
│   │   └── main.css            # Layout, typography, color system definitions
│   └── js/
│       ├── app.js              # Router, global application state controller
│       ├── components/
│       │   ├── terminal.js     # Live WS logs renderer component
│       │   └── status_badge.js # Pulse indicator for SSH status
│       └── views/
│           ├── dashboard.js    # Cluster resource monitors
│           ├── setup_wizard.js # Dynamic profile wizard steps
│           ├── phases.js       # Steppers and progress log consoles
│           ├── nodes.js        # Compute node data tables
│           └── health.js       # Health check results cards
│
├── docs/                       # Architectural & design references
└── scripts/                    # Archived original deployment files
```

---

## 2. Real-time Log Streaming Protocol

WebSocket communication is implemented via **Flask-SocketIO** (server) and the native browser **WebSocket API** (client).

### Channel Events

#### `join_task` (Client -> Server)
Sent when the client connects to a specific phase log view.
- Payload: `{"task_id": "phase_2"}`

#### `log_line` (Server -> Client)
Pipes terminal output lines to the active console log component.
- Payload: `{"line": "Checking DNF dependencies... Done", "stream": "stdout"}`

#### `task_status` (Server -> Client)
Pushes execution status updates.
- Payload: `{"status": "running", "step": 3, "progress": 34}`

#### `task_complete` (Server -> Client)
Emitted when the execution completes.
- Payload: `{"exit_code": 0, "message": "Phase completed successfully"}`

---

## 3. Local Installation & Launch

To run the project locally on the Bastion Host:

### Prerequisites
- Python 3.9 or higher
- Node.js (optional; only needed if serving frontend via a custom dev server, but standard browsers can load `index.html` directly)
- `sshpass` package installed on the Bastion OS (`sudo apt-get install sshpass`)

### Backend Setup
1. Create a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Launch the API & WebSocket server:
   ```bash
   python backend/app.py
   ```

### Frontend Launch
- Open `/frontend/index.html` directly in a modern web browser, or serve it using Python's static server:
  ```bash
  python -m http.server 8000 --directory frontend
  ```
