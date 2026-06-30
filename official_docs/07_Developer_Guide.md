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

## 4. The Background Execution Pipeline (Celery)

The most complex part of the backend is how it executes bash commands on the Master Node. Because tasks like "Install OpenHPC" or "Compile a Warewulf container" can take 30+ minutes, standard HTTP requests would timeout, and long-lived WebSockets are vulnerable to connection drops.

**The Solution:** Celery Background Workers + Redis Log Streaming.

### How it works:
1. The frontend initiates an HTTP POST request to an API endpoint (e.g., `POST /api/v1/images/build`).
2. The FastAPI backend validates the request, dispatches a Celery task (e.g., `build_image_task.delay()`), and immediately returns a JSON response containing a `task_id`.
3. The Celery Worker (running in a separate container) picks up the task, opens an asynchronous SSH tunnel to the Master Node, and executes the bash script or Ansible playbook.
4. As the remote server produces `stdout` and `stderr`, the Celery task captures these lines and pushes them to a Redis List (`rpush task_logs:{task_id}`).
5. The frontend takes the returned `task_id` and connects to the generic WebSocket endpoint: `ws://backend/api/v1/logs/{task_id}`.
6. This WebSocket simply tails the Redis List, streaming the history and live output back to the UI. If the user disconnects and reconnects, the WebSocket replays the log history from Redis without interrupting the background execution.

If you are writing a new provisioning script that takes more than a few seconds, you **must** use this Celery + Redis pattern.

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
