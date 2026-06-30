# Audit Report: Performance & Concurrency Bottlenecks

**Status:** ✅ COMPLETED (As of Phase 5 implementation)

This document details the performance constraints, latency issues, and concurrency risks in the HPC Cluster Management System.

---

## 1. Metric Fetching: Lack of Caching & SSH Storms

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/cluster_info.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/cluster_info.py#L231-L302) (`get_cluster_overview`)
*   **Detailed Analysis:**
    Every time a user visits or refreshes the dashboard, the backend requests a complete cluster overview. The system calls `asyncio.gather` to execute **eight distinct CLI commands** over SSH on the Master Node:
    1. `scontrol show nodes`
    2. `squeue --noheader ...`
    3. `sinfo --summarize ...`
    4. `uptime`
    5. `free -h`
    6. `df -h ...`
    7. `hostname && uname -r ...`
    8. `sinfo --noheader ...`
    
    If 50 users have the dashboard open (which likely auto-refreshes every 5–10 seconds), this triggers up to **400 separate SSH connection handshakes and command executions** on the Master Node in a minute.
    
    This creates an "SSH Connection Storm" on the Master Node, driving CPU load up, exhausting available file descriptors, and causing the dashboard to hang or time out.

### The Best Fix
1. **Implement Caching:** Use the Redis instance (defined in `docker-compose.yml`) to cache the cluster overview payload.
2. **Background Polling:** Instead of triggering SSH requests on-demand for HTTP requests, run a single background worker thread in FastAPI that polls the Master Node metrics every 10–15 seconds, formats the data, and saves it to Redis. The `/overview` API endpoint should return the cached data from Redis instantly:
   ```python
   @router.get("/overview")
   async def get_cluster_overview(db = Depends(get_db)):
       data = await redis.get("cluster_overview_cache")
       if not data:
           # Fallback or trigger immediate refresh
       return json.loads(data)
   ```

---

## 2. Long-Running Workloads in Ephemeral WebSockets

### The Problem
*   **Vulnerability Location:** 
    - [`backend/api/routes/images.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/images.py#L109-L325) (`build_image_ws`)
    - [`backend/api/routes/slaves.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/slaves.py#L146-L341) (`deploy_slaves_ws`)
    - [`backend/api/routes/ansible.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/ansible.py#L40-L83) (`run_playbook`)
*   **Detailed Analysis:**
    The system uses WebSockets to trigger and stream outputs of long-running operations like compiling operating system images, running Dracut initramfs generation, deploying physical computing nodes, and running Ansible playbooks. These tasks can take between 5 to 20 minutes to complete.
    
    If an administrator closes the browser tab, switches networks, or experiences a minor packet loss:
    1. The WebSocket connection closes.
    2. The backend catches `WebSocketDisconnect` or generic exceptions and stops streaming.
    3. However, the commands (e.g. `dnf install`, `dracut --force`, `ansible-playbook`) continue executing as orphaned processes on the Master Node.
    4. There is no state management, so the admin has no way to re-attach to the running task, check its progress, or determine if it succeeded or failed, except by logging in manually via SSH.

### The Best Fix
1. **Background Task Queue:** Offload long-running tasks to an asynchronous task queue (e.g. Celery or RQ) backed by Redis.
2. **State Tracking:** When an action is requested, generate a unique Task ID, create a DB record with state `PENDING`, and return it immediately to the client:
   ```python
   # POST /api/v1/images/build
   task = build_image_task.delay(build_config)
   return {"task_id": task.id, "status": "queued"}
   ```
3. **Task logs redirection:** Write execution outputs to log files on disk or in Redis. 
4. **WebSocket Polling/Streaming:** The WebSocket endpoint should connect to a task status stream, reading the log file from the beginning and printing live outputs. If the client disconnects, they can reconnect to the same Task ID without disrupting execution.

---

## 3. Sequential Command Processing In User Provisioning

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/users.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/users.py#L30-L42)
*   **Detailed Analysis:**
    When adding a user, the system executes 11 distinct CLI commands sequentially. For each command, the system calls `executor.run_command_stream(cmd)` which creates a fresh connection, establishes an SSH channel, runs the command, and closes the connection.
    
    Setting up and tearing down SSH channels sequentially for simple CLI tasks introduces overhead and slows down response times.

### The Best Fix
- Combine the commands into a single, clean bash script and run it in a single SSH session:
  ```python
  # Compile commands into a shell script or a chained string using "&&"
  combined_command = " && ".join(commands)
  async for line in executor.run_command_stream(combined_command):
      # Handle output
  ```

---

## 4. Redundant System Configuration Overheads

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/users.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/users.py#L66)
*   **Detailed Analysis:**
    When provisioning a user, the system runs `wwctl overlay build -A` (rebuilding all Warewulf system overlays) at the end of the user configuration block. Rebuilding all overlays is a heavy IO/CPU operation. If an administrator imports a batch of users, this operation is triggered repeatedly, impacting Master Node performance.
*   **Best Fix:**
    - Warewulf overlays should only be rebuilt when structural network or node configurations change, or batched to run at scheduled intervals (e.g. via a background worker or delayed hook). Adding a local user account to the system does not require rebuilding node images immediately unless the overlays are pushing configuration files like `htpasswd` dynamically. Even so, this should be debounced or batched.
