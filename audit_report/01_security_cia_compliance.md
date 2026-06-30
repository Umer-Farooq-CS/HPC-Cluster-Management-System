# Audit Report: Security & CIA Compliance (Confidentiality, Integrity, Availability)

This document covers the security postures of the HPC Cluster Management System in relation to the **CIA Triad**. Multiple high and critical severity risks have been identified.

---

## 1. Confidentiality (C)

### A. Disabled SSH Host Key Verification (MitM Risk)
*   **Vulnerability Location:** [`backend/core/ssh_executor.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/ssh_executor.py#L24-L35)
*   **Problem:** 
    The SSH executor is configured to trust any host key blindly by setting `known_hosts` to `None`:
    ```python
    connect_kwargs = {
        "host": self.host,
        "username": self.username,
        "known_hosts": None,  # Bypasses host validation
        "connect_timeout": SSH_CONNECT_TIMEOUT,
    }
    ```
    This disables SSH host identity checks. If an attacker on the management network intercepts traffic or spoofs the Master Node's IP address (`192.168.10.2`), they can execute a Man-in-the-Middle (MitM) attack. They will receive the SSH credentials (`root` and password `hpc`) in plaintext during the handshake or trick the backend into running administrative tasks on a rogue host.
*   **Best Fix:**
    1. Set up and maintain a `/root/.ssh/known_hosts` file inside the backend docker container.
    2. Configure `known_hosts` to point to a valid system path, or register the Master Node's public SSH key during the container build process.
    3. Modify `connect_kwargs` to load the known hosts file:
       ```python
       connect_kwargs["known_hosts"] = "/root/.ssh/known_hosts"
       ```

### B. Secrets Exposed in Version Control
*   **Vulnerability Location:** [`.env`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/.env), [`core/security.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/security.py#L13)
*   **Problem:**
    - The repository contains default secrets committed to version control.
    - `SECRET_KEY = "HPC_CLUSTER_SECRET_KEY_REPLACE_IN_PROD"` is hardcoded in the security configuration file.
    - Default configuration credentials like `MASTER_PASS=hpc` and `DB_PASSWORD=hpc_password` are stored directly in active env files.
*   **Best Fix:**
    - Ensure all credentials and cryptographic secrets are loaded strictly from environment variables without hardcoded fallbacks:
      ```python
      SECRET_KEY = os.getenv("JWT_SECRET_KEY")
      if not SECRET_KEY:
          raise RuntimeError("JWT_SECRET_KEY environment variable is not set!")
      ```
    - Use secret-scanning tools (like `trufflehog` or `git-secrets`) in CI/CD pipelines to prevent secrets from being pushed.

---

## 2. Integrity (I)

### A. Critical Remote Shell Command Injections (RCE)
*   **Vulnerability Location:** 
    - [`backend/api/routes/users.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/users.py#L55-L70) (`create_user`)
    - [`backend/api/routes/images.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/images.py#L98-L101) (`delete_image`)
    - [`backend/api/routes/ansible.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/ansible.py#L65) (`run_playbook`)
    - [`backend/api/routes/slaves.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/slaves.py#L239-L241) (`deploy_slaves_ws`)
*   **Problem:**
    The system makes extensive use of f-string formatting to build shell commands executed as root on the Master Node. None of the inputs are sanitized, escaped, or parameterized.
    
    *Example 1 (User Route):*
    ```python
    f"htpasswd -B -b /etc/ood/config/htpasswd {user_in.username} '{user_in.password}'"
    ```
    If the password field is set to: `' ; rm -rf /etc/slurm ; '`, the shell translates it to:
    ```bash
    htpasswd -B -b /etc/ood/config/htpasswd username '' ; rm -rf /etc/slurm ; ''
    ```
    This results in arbitrary command execution on the Master Node as root.
    
    *Example 2 (Ansible Route):*
    ```python
    command = f"cd {REMOTE_ANSIBLE_DIR} && ansible-playbook -i inventory.ini {playbook_name}"
    ```
    An attacker can request execution of a playbook named `test.yml; reboot`, causing the Master Node to restart.
    
    *Example 3 (Images Delete Route):*
    ```python
    f"wwctl image delete {image_name} --yes 2>&1"
    ```
    An attacker can request deletion of an image named `almalinux; rm -rf /`, wiping out the Master Node files.

*   **Best Fix:**
    1. **Avoid shell interpolation:** Do not use `asyncssh` shell execution with raw string formatting where possible.
    2. **Use lists/escaping for command parsing:** If commands must be run via SSH, split them into lists of arguments rather than running them in a raw shell session, or use Python's `shlex.quote()` to sanitize string inputs:
       ```python
       import shlex
       safe_username = shlex.quote(user_in.username)
       safe_password = shlex.quote(user_in.password)
       cmd = f"htpasswd -B -b /etc/ood/config/htpasswd {safe_username} {safe_password}"
       ```
    3. **Regex Sanitize Path Variables:** Enforce strict alphanumeric regex matches for inputs (e.g., matching only `^[a-zA-Z0-9_\-\.]+$` for usernames, playbooks, and image names) before processing them in logic blocks.

---

## 3. Availability (A)

### A. Broken Timeout Mechanism in SSHExecutor (Process Leaks)
*   **Vulnerability Location:** [`backend/core/ssh_executor.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/ssh_executor.py#L38-L52)
*   **Problem:**
    The idle timeout logic is misplaced. It is located *after* the `async for line in process.stdout` loop finishes:
    ```python
    async for line in process.stdout:
        stripped = line.strip()
        if stripped:
            yield stripped
    try:
        await asyncio.wait_for(process.wait(), timeout=SSH_IDLE_TIMEOUT * 60)
    except asyncio.TimeoutError:
        ...
    ```
    If an SSH command hangs *while producing output* or stays idle indefinitely (e.g. waiting for password prompt, interactive input, or DNS resolution failure), the loop `async for line in process.stdout` blocks forever. The program never reaches the `try` block containing `asyncio.wait_for`.
    
    This causes the API thread to lock up, leaks an active SSH connection, and eventually leads to backend starvation (Denial of Service).
*   **Best Fix:**
    Wrap the line-reading loop itself inside a timeout construct or apply a read timeout per line using `asyncio.wait_for`:
    ```python
    # Set a timeout for reading each line
    while True:
        try:
            line = await asyncio.wait_for(process.stdout.readline(), timeout=SSH_IDLE_TIMEOUT)
            if not line:
                break
            stripped = line.strip()
            if stripped:
                yield stripped
        except asyncio.TimeoutError:
            yield f"[WARNING] Command output timed out after {SSH_IDLE_TIMEOUT}s."
            process.close()
            break
    ```

### B. Lack of Concurrency Control and Locks (Race Conditions)
*   **Vulnerability Location:** System-wide (`routes/slaves.py`, `routes/images.py`, `routes/ansible.py`)
*   **Problem:**
    - Admin actions such as `deploy_slaves_ws` edit configuration files like `/etc/slurm/slurm.conf` and `/etc/genders` in-place on the Master Node.
    - If two administrators trigger the deployment pipeline concurrently, their write instructions will conflict, corrupting Slurm configuration files.
    - Furthermore, CPU-heavy tasks like `Dracut initramfs regeneration` and `VNFS image build` execute raw system utilities on the Master. Running multiple instances of these operations in parallel can lead to out-of-memory (OOM) crashes on the Master Node, causing a cluster outage.
*   **Best Fix:**
    1. Implement a resource lock (using Redis locks or local FastAPI locks) to prevent concurrent execution of modifying commands:
       ```python
       # Example local lock
       lock = asyncio.Lock()
       
       # Inside websocket handlers
       async with lock:
           # Execute critical deployment steps
       ```
    2. Since the cluster backend uses Redis (registered in `docker-compose.yml`), implement a distributed lock (e.g., using `redlock-py`) to protect cross-container operations.
