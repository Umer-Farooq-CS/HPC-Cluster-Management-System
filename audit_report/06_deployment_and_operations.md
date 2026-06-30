# Audit Report: Deployment & Operational Risks

This document focuses on the fragility of system operations, network discovery logic, error handling, and deployment strategies.

---

## 1. Brittle Network Discovery (ARP Cache Reliance)

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/slaves.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/slaves.py#L62-L97) (`get_arp_table`)
*   **Detailed Analysis:**
    To auto-discover physical compute nodes to provision, the API runs `ip neighbor show` on the Master Node. 
    - **Incomplete Discovery:** This command only reads the kernel's local ARP cache. If a compute node is powered on but hasn't communicated with the Master Node within the ARP timeout window (usually a few minutes), it will be completely invisible to the API.
    - **Dangerous Inclusions:** The ARP table includes the Master Node's default gateway (upstream building router) and any other management devices. If an admin clicks "Deploy All", the system will attempt to provision the building's core router via Warewulf, which could cause catastrophic network outages.

### The Best Fix
- Implement an active discovery scan (e.g., `nmap -sn 192.168.20.0/24`) to actively ping the subnet before reading the ARP table.
- Filter out known gateway IPs (like `192.168.20.1`) and known management MAC addresses from the returned list so they cannot be accidentally provisioned.

---

## 2. Fragile In-Place Configuration Editing (Sed & Echo)

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/slaves.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/slaves.py#L269-L282)
*   **Detailed Analysis:**
    The system modifies critical system files (like `/etc/slurm/slurm.conf`) by deleting and appending lines via Bash:
    ```bash
    sed -i '/^NodeName=/d' /etc/slurm/slurm.conf
    echo 'NodeName=compute1 Sockets=1 ...' >> /etc/slurm/slurm.conf
    ```
    If an administrator adds comments to `slurm.conf` (e.g., `# NodeName=...`), or if formatting changes, `sed` may delete unintended lines or miss lines entirely. Line-by-line bash editing of complex config files is highly error-prone and untraceable.

### The Best Fix
- Move to a **templating approach**. Use Python's `Jinja2` to render the entire `slurm.conf` file locally within the FastAPI container using the current state of the database.
- Once rendered, use `asyncssh`'s SFTP capabilities (`conn.start_sftp()`) to upload the complete, cleanly formatted file to the Master Node and overwrite the old one, followed by a systemctl restart.

---

## 3. Deployment Self-Disconnect Risk

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/master.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/master.py#L95-L103)
*   **Detailed Analysis:**
    During the Master Node provisioning phase, the backend uses `nmcli` to reconfigure the IP addresses of the Master Node's network interfaces.
    If the interface being modified is the same one the backend is currently using to execute the SSH commands, modifying the IP or restarting the connection (`nmcli connection up "$CONN"`) will immediately sever the active SSH session. The WebSocket will hang, and the remaining 90% of the provisioning script will never run.

### The Best Fix
- Ensure that the Admin/Management interface (the IP FastAPI uses to connect) is distinct from the Provisioning/Data interfaces being modified.
- Alternatively, generate a standalone bash script for the entire network configuration, upload it via SFTP, and execute it asynchronously via `nohup` or `at`, so that it completes even if the SSH connection momentarily drops.

---

## 4. Substandard Logging and Silent Error Swallowing

### The Problem
*   **Vulnerability Location:** 
    - [`backend/main.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/main.py#L48-L50)
    - System-wide WebSocket handlers
*   **Detailed Analysis:**
    1. **Print Statements:** The application uses `print()` for logging errors. In a production Docker environment, `print()` output is hard to parse, lacks timestamps, and does not differentiate between INFO, WARN, and ERROR levels.
    2. **Silent Swallowing:** In almost all WebSocket endpoints, the `finally` cleanup block contains an anti-pattern:
       ```python
       except Exception as e:
           try:
               await websocket.send_text(f"[CRITICAL ERROR] {str(e)}")
           except:
               pass
       ```
       If the socket has dropped, this outer exception block swallows the error silently. Tracebacks are lost, making it impossible for a developer to debug *why* a deployment failed in production.

### The Best Fix
- Replace `print()` with Python's standard `logging` module. Configure it to output structured JSON so it can be ingested by centralized logging stacks (like Loki or ELK).
- Use `logger.exception("Deployment failed")` inside `except` blocks to properly capture and output the stack trace to the container logs before attempting to notify the client.

---

## 5. Insecure CORS Configuration

### The Problem
*   **Vulnerability Location:** [`backend/main.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/main.py#L39)
*   **Detailed Analysis:**
    The `FRONTEND_URLS` dynamically loaded from config includes local development URLs:
    ```python
    "http://localhost:5173",
    "http://localhost"
    ```
    Leaving `localhost` origins permitted in a production CORS configuration allows a malicious website running locally on an administrator's machine to bypass CORS policies and perform cross-origin requests against the cluster API.

### The Best Fix
- Use an environment variable to strictly control `CORS_ORIGINS`. In production mode, remove all `localhost` exceptions and only allow the exact production domain (e.g., `https://hpc-portal.local`).
