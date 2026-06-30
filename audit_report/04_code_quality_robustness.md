# Audit Report: Code Quality & Robustness Issues

This document highlights code architecture concerns, fragility in data parsing, hardcoding practices, and lack of transaction integrity.

---

## 1. Lack of Transactional Integrity (Database vs. System State Drift)

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/users.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/users.py#L72-L86) (`create_user`)
*   **Detailed Analysis:**
    The code executes system-level provisioning steps over SSH and then attempts to commit records to the database:
    ```python
    try:
        await execute_ssh_commands(commands)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to provision user on OS...")

    # Add user to local DB
    db_user = User(...)
    db.add(db_user)
    await db.commit()
    ```
    If user provisioning succeeds on the Master Node (user is added to Linux, Slurm, OOD, and Warewulf), but the database commit fails (due to database connection loss, disk full, or SQLAlchemy exception):
    - The database has no record of the user.
    - The Master Node, Slurm system, and Open OnDemand now contain an orphaned user account that cannot be modified, deleted, or listed through the management interface.
    - If the admin tries to create the user again, the command `useradd` will fail or throw errors, and the system state becomes inconsistent.

### The Best Fix
1. **Pre-validate Data:** Validate database constraints (username unique check, schema format validation) before performing system operations.
2. **Implement Rollback Mechanisms:** If an operation fails mid-execution, implement clean-up steps to remove system resources created before the crash:
   ```python
   # Inside create_user route
   try:
       await execute_ssh_commands(commands)
   except Exception as e:
       # Run cleanup command: userdel -r username
       await execute_cleanup_ssh(username)
       raise HTTPException(status_code=500, detail="OS Provisioning failed. Changes rolled back.")
   ```

---

## 2. Insecure Administrative Privileges (SSH Root Execution)

### The Problem
*   **Vulnerability Location:** [`.env`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/.env), [`core/config.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/core/config.py#L15)
*   **Detailed Analysis:**
    The backend container communicates with the Master Node by establishing an SSH connection as the `root` user using a password (`hpc`).
    - Storing the root password in cleartext in the `.env` file of a dockerized web app is a security risk.
    - Compromise of the backend container gives an attacker root access on the Master Node.

### The Best Fix
1. **Restrict SSH User Access:** Create a dedicated, unprivileged system account (e.g. `hpcmanager`) on the Master Node.
2. **Key-based Authentication:** Authenticate using an SSH key pair instead of passwords. Mount the private key file securely inside the backend container and restrict its file permissions (`chmod 600`).
3. **Restricted sudo Permissions:** Add strict rules to `/etc/sudoers` on the Master Node to restrict `hpcmanager` to running only the specific commands needed (e.g. `wwctl`, `systemctl restart slurmctld`, `sacctmgr`) without password prompt:
   ```sudoers
   hpcmanager ALL=(ALL) NOPASSWD: /usr/bin/wwctl *, /usr/bin/systemctl restart slurmctld, /usr/bin/sacctmgr *
   ```

---

## 3. Fragile CLI Output Scraping (Brittle Parsing)

### The Problem
*   **Vulnerability Location:** [`backend/api/routes/cluster_info.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/cluster_info.py#L25-L228) (`_parse_sinfo`, `_parse_squeue`, `_parse_uptime`, `_parse_df`, `_parse_free`, `_parse_scontrol_nodes`)
*   **Detailed Analysis:**
    The dashboard parses CLI command output using text splits and simple regular expressions.
    - *Example (Scontrol parsing):*
      ```python
      for kv in re.findall(r'(\w+)=(\S+)', line):
          key, val = kv
          current[key] = val
      ```
      This assumes Slurm outputs data strictly as `Key=Value` format without spaces in values. If a node's reason field contains spaces (e.g. `Reason=Scheduled maintenance for upgrade`), the regex will fail to parse the value correctly.
    - *Example (Squeue parsing):*
      ```python
      parts = line.split(None, 7)
      if len(parts) < 7:
          continue
      ```
      If the formatting output of the command changes due to Slurm updates or environmental locale changes, the parsed index positions will shift, causing data corruption or silent failures.

### The Best Fix
- Wherever possible, use structured outputs (JSON or XML format parameters) from CLI utilities:
  - For Slurm: Slurm 20.11+ supports JSON output formatting (e.g., `squeue --json`).
  - For disk information: Use python library libraries (like `psutil`) if running locally, or pass parameters to output structured formats.
  - If output formats cannot be changed, write unit tests with static mock data to check parsing stability across different command outputs.

---

## 4. Hardcoded Environment Variables & System Parameters

### The Problem
*   **Vulnerability Location:** 
    - [`backend/api/routes/users.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/users.py#L59) (Hardcoded `linux-almalinux9-x86_64`)
    - [`backend/api/routes/master.py`](file:///home/umer/Desktop/HPC-Cluster-Script/HPC%20Cluster%20Management%20System/backend/api/routes/master.py#L13) (Hardcoded `/opt/hpc-cluster-system/scripts/ansible`)
*   **Detailed Analysis:**
    - The user route configures Spack Lmod module paths using a hardcoded OS version: `linux-almalinux9-x86_64`. If the Master Node is upgraded to AlmaLinux 10 or migrated to a different CPU architecture (like ARM64), the user profiles will fail to load on login.
    - The remote Ansible script path is hardcoded as `/opt/hpc-cluster-system/scripts/ansible`. If the deployment folder is moved, the playbook execution routes will fail.

### The Best Fix
- Load directory configurations, paths, and platform versions from configuration settings (`core/config.py`) or discover them dynamically:
  ```python
  # Discover OS / CPU architecture dynamically on the Master Node
  arch_cmd = "uname -m"
  os_cmd = "cat /etc/os-release | grep ID= | head -n1"
  ```
