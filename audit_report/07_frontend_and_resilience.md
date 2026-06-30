# Audit Report: Frontend Architecture & System Resilience

This document outlines structural flaws within the React frontend containerization, API input validation gaps (Defense in Depth), and database connection resilience.

---

## 1. Build-Time Environment Variable Anti-Pattern (SPA Containerization)

### The Problem
*   **Vulnerability Location:** 
    - [`docker-compose.yml`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/docker-compose.yml#L76-L78)
    - [`frontend/Dockerfile`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/frontend/Dockerfile#L12-L16)
    - [`frontend/src/pages/LoginPage/LoginPage.tsx`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/frontend/src/pages/LoginPage/LoginPage.tsx#L25)
*   **Detailed Analysis:**
    The React application is built via a multi-stage Dockerfile that injects `VITE_API_URL` and `VITE_WS_URL` as build arguments (`ARG`) populated from the `.env` file's `DOMAIN` variable:
    ```yaml
    args:
      - VITE_API_URL=https://${DOMAIN}/api/v1
    ```
    In a Single Page Application (SPA) built with Vite (or Webpack), environment variables prefixed with `VITE_` are statically replaced and baked into the minified Javascript/HTML bundles *at build time*. 
    
    If an administrator changes the `DOMAIN` in the `.env` file and runs `docker compose up -d` (without `--build`), the frontend container will restart, but the JavaScript will still make API calls to the *old* hardcoded domain. This forces a complete image rebuild every time the networking environment changes.

### The Best Fix
1. **Use Relative Paths:** Since the main `nginx.conf` acts as a reverse proxy routing `/api/` to the backend and `/` to the frontend, the frontend does not need absolute URLs. 
   Modify the frontend to simply fetch from `/api/v1/...`. The browser will automatically resolve this against the current window origin (e.g., `https://192.168.10.100/api/v1/...`).
2. **Remove Build Args:** Strip `VITE_API_URL` and `VITE_WS_URL` from the Dockerfile and `docker-compose.yml`.

---

## 2. Missing Input Validation (Pydantic Defense in Depth)

### The Problem
*   **Vulnerability Location:** 
    - [`backend/api/routes/images.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/images.py#L22-L42) (`ImageBuildPayload`)
    - [`backend/api/routes/master.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/master.py#L21-L55) (`MasterDeployPayload`)
*   **Detailed Analysis:**
    The API relies on Pydantic models for request bodies, but only defines basic python types (`str`, `int`, `bool`).
    ```python
    wwProvNetwork: str = "192.168.20.0"
    openHpcRepoUrl: str = "http://repos.openhpc.community..."
    syslogTarget: str = "192.168.10.2"
    ```
    While the RCE vulnerability highlighted in Document 01 needs escaping, the Pydantic models themselves fail to validate the *semantic correctness* of the inputs. If a user inputs `192.168.20.0` as the `openHpcRepoUrl` or `not_an_ip` as `syslogTarget`, Pydantic will accept it, pass it to the SSH executor, and cause the Master Node configuration commands to fail halfway through the deployment.

### The Best Fix
Utilize Pydantic's rich validation ecosystem:
- Use `pydantic.networks.IPv4Address` instead of `str` for IP fields.
- Use `pydantic.networks.AnyHttpUrl` for repository links.
- Use `@field_validator` or `Field(pattern=r'^[a-zA-Z0-9_\-\.]+$')` for usernames, playbooks, and image names to stop injection attempts at the API gateway layer before they even reach the logic blocks.

---

## 3. Database Connection Pooling Limits

### The Problem
*   **Vulnerability Location:** [`backend/core/database.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/database.py#L18)
*   **Detailed Analysis:**
    The SQLAlchemy async engine is created with default settings:
    ```python
    engine = create_async_engine(DATABASE_URL, echo=False)
    ```
    SQLAlchemy's default `pool_size` is 5, with a `max_overflow` of 10. In a highly concurrent environment where WebSockets hold open connections, or where an SSH Storm (as detailed in Document 03) occurs, the FastAPI application can quickly exhaust the connection pool. When the pool is exhausted, new API requests will block waiting for a connection, eventually timing out and returning `500 Internal Server Error`.

### The Best Fix
Explicitly configure the connection pool parameters to handle a production load, especially when dealing with WebSocket endpoints that may keep sessions alive:
```python
engine = create_async_engine(
    DATABASE_URL, 
    echo=False,
    pool_size=20,
    max_overflow=30,
    pool_timeout=30,
    pool_recycle=1800  # Recycle connections every 30 mins to prevent stale drops
)
```

---

## 4. Unhandled WebSocket Disconnects (Process Orphans)

### The Problem
*   **Vulnerability Location:** [`backend/core/ssh_executor.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/ssh_executor.py#L38-L53)
*   **Detailed Analysis:**
    When an API client disconnects from a WebSocket (e.g., closing the tab during a Master Node deployment), the `async for` loop reading from the WebSocket throws a `WebSocketDisconnect`.
    This cancels the generator `executor.run_command_stream(cmd)`. The `async with conn.create_process()` block closes. 
    However, the underlying shell process on the Master Node receives a SIGHUP or EOF, but it may not terminate cleanly if it's running a background-resistant task (like `yum update` or `wwctl build`). This leads to orphaned processes continuing to consume CPU/RAM on the Master Node with no way for the admin to observe their completion.

### The Best Fix
As recommended in the Performance audit, move these executions to a Celery/Redis task queue. If WebSockets must be used, implement explicit SSH process termination handling inside the generator's `finally` block or ensure commands are run with `nohup` and output redirected to a log file, so the stream can be safely detached and reattached.
