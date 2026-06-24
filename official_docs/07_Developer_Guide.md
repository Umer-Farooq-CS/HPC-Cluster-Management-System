# HPC Cluster Management System — Developer Guide

This guide is for software engineers looking to extend or modify the web application orchestrating the HPC cluster. It covers the frontend and backend architectures, state management, and the WebSocket execution pipeline.

---

## 1. Project Structure

The project is split into two primary applications running inside Docker containers on the Bastion host.

```text
hpc-cluster-management-system/
├── frontend/          # React + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/ # Reusable UI pieces (Glassmorphism cards, buttons)
│   │   ├── pages/      # Full route views (Dashboard, MasterSetup, AnsibleRunner)
│   │   ├── services/   # Axios API wrappers
│   │   └── utils/      # WebSocket clients and helpers
├── backend/           # FastAPI application
│   ├── api/
│   │   ├── routes/     # Endpoint definitions (nodes, master, images, ansible)
│   │   └── websockets/ # Async execution handlers (streaming logs)
│   ├── core/           # Database connections and Redis cache
│   └── models/         # SQLAlchemy schemas
└── docker-compose.yml # The orchestrator
```

---

## 2. Frontend Architecture (React)

The frontend is a Single Page Application (SPA) built with React 18, TypeScript, and Vite. 

### Styling & UI
The application utilizes **TailwindCSS** to enforce a strict design system. The overarching aesthetic is "Premium Glassmorphism"—utilizing semi-transparent backgrounds, blurs, and vibrant gradients to make the dashboard feel alive and modern.
- **Key Files:** `index.css` (contains the custom `@layer utilities` for `.glass-panel`).

### State Management
State is largely managed locally within pages using React Hooks (`useState`, `useEffect`). For API calls, `axios` is used. 

---

## 3. Backend Architecture (FastAPI)

The backend is written in Python using FastAPI. It is fully asynchronous (`async def`), allowing it to handle long-running installation tasks without blocking other HTTP requests.

### Database & Caching
- **PostgreSQL:** Accessed via SQLAlchemy ORM. Used to store persistent cluster state, such as saved subnet profiles, registered compute nodes, and Golden Image definitions.
- **Redis:** Used as a fast, in-memory cache for cluster telemetry. Since querying Slurm (`sinfo`, `squeue`) takes time and CPU overhead, the backend polls Slurm in a background loop, writes the result to Redis, and the frontend instantly reads from Redis.

---

## 4. The WebSocket Execution Pipeline (CRITICAL)

The most complex part of the backend is how it executes bash commands on the Master Node. Because tasks like "Install OpenHPC" or "Compile a Warewulf container" can take 30+ minutes, standard HTTP requests would timeout.

**The Solution:** WebSockets + `asyncssh` / Ansible Runner.

### How it works:
1. The frontend initiates a WebSocket connection to a specific endpoint (e.g., `ws://backend/api/v1/master/deploy/ws`).
2. The user passes a JSON payload with credentials.
3. The FastAPI backend opens an asynchronous SSH tunnel to the Master Node.
4. The backend executes a bash script or an Ansible playbook on the remote server.
5. As the remote server produces `stdout` and `stderr` (e.g., `dnf install` output), the backend captures these lines dynamically and `await websocket.send_json({"log": line})`.
6. The frontend receives the JSON and appends it to a black terminal window component, providing real-time feedback to the user.

If you are writing a new provisioning script, you **must** use this WebSocket pattern rather than a standard REST POST endpoint.

---

## 5. Local Development Workflow

To develop without running the full Docker Compose stack:

### Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Runs on http://localhost:8000
```
