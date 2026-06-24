# 🛠️ HPC Cluster System: Master Command & Debugging Cheatsheet

This document serves as your offline survival guide. If the internet is down, or you need to manually debug the HPC infrastructure, use these commands to inspect, manage, and fix the system.

---

## 1. 🐳 Docker & Web App Orchestration
*Managing the React Frontend, FastAPI Backend, Keycloak, and Databases.*

All commands must be run from the directory containing `docker-compose.yml`:
```bash
# Start the entire web management stack in the background
docker-compose up -d --build

# Stop the entire stack safely
docker-compose down

# View live logs for a specific service (e.g., backend, frontend, keycloak)
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart a specific service without affecting others
docker-compose restart keycloak

# Check the status of all running containers
docker ps
```

---

## 2. 🐺 Warewulf 4 (Stateless Provisioning)
*Managing node OS images, configurations, and PXE boot overlays.*

```bash
# --- Node Management ---
wwctl node list -a                    # List all compute nodes and their current status
wwctl node add pc2 --ipaddr 192.168.20.10 --hwaddr <MAC>  # Register a new node
wwctl node set pc2 --discoverable=yes # Allow a node to PXE boot and be discovered
wwctl node delete pc2                 # Remove a node from the cluster

# --- Image / Container Management ---
wwctl container list                  # List all downloaded OS base images
wwctl container import docker://almalinux:9 alma-base  # Pull a fresh OS image
wwctl container exec alma-base /bin/bash               # Shell into the image to install packages (e.g., slurmd, chrony)

# --- Configuration & Overlays (CRITICAL) ---
# RUN THIS COMMAND every time you change a file in /var/warewulf/overlays!
wwctl overlay build                   # Rebuilds the system configuration files for the nodes
wwctl server restart                  # Restarts the Warewulf daemon
```

---

## 3. 🚀 Slurm Workload Manager
*Managing job queues, compute node states, and the Slurm controller.*

```bash
# --- Cluster Status ---
sinfo                                 # View cluster state (IDLE, ALLOCATED, DRAIN, DOWN)
squeue                                # View the list of currently running or pending jobs
scontrol show node pc2                # Get detailed diagnostic info on a specific node

# --- Fixing "DRAIN" or "DOWN" Nodes ---
# If a node crashes or has a configuration error, Slurm drains it. Once fixed, run:
scontrol update NodeName=pc2 State=RESUME

# --- Job Management ---
srun -N 1 -n 1 hostname               # Submit a quick interactive test job
scancel <job_id>                      # Cancel a running or stuck job
sacct                                 # View historical job data and accounting

# --- Slurm Daemon Management ---
scontrol reconfigure                  # Reload slurm.conf without killing running jobs
systemctl restart slurmctld           # Restart the Master controller (Run on Master)
systemctl restart slurmd              # Restart the compute daemon (Run on Compute Nodes)
```

---

## 4. ⚙️ Ansible Automation
*Running playbooks manually from the CLI.*

```bash
# Run a playbook (e.g., Open OnDemand installation) using an inventory file
ansible-playbook -i inventory.ini playbooks/ood_install.yml

# Check connectivity to all nodes in the inventory
ansible all -m ping -i inventory.ini

# Syntax check a playbook before running it to catch errors early
ansible-playbook --syntax-check playbooks/ood_install.yml
```

---

## 5. 🌐 Open OnDemand & Apache (User Portal)
*Managing the web portal, user sessions, and OIDC Auth.*

```bash
# --- Applying Configurations ---
# If you edit /etc/ood/config/ood_portal.yml, you MUST run this to apply changes:
sudo /opt/ood/ood-portal-generator/sbin/update_ood_portal
systemctl restart httpd               # Restart Apache to pick up the new portal config
systemctl restart ondemand-dex        # Restart the Dex Identity Provider (OIDC)

# --- Per-User Nginx (PUN) Management ---
# If a user's dashboard crashes (e.g., EEXIST error, Ruby Passenger crash):
sudo /opt/ood/nginx_stage/sbin/nginx_stage pun -u <username> -a restart
sudo /opt/ood/nginx_stage/sbin/nginx_stage nginx_clean  # Clean up orphaned PUN sessions
```

---

## 6. 🔒 SELinux & Security Administration
*Fixing "Permission Denied" errors that happen even as root.*

```bash
sestatus                              # Check if SELinux is Enforcing or Permissive

# --- The Magic SELinux Fixer ---
# If a service (like OOD or Slurm) is failing due to silent permission denials:
# 1. Search the audit log for recent blocks and generate a custom policy:
cat /var/log/audit/audit.log | grep denied | audit2allow -a -M my_custom_fix

# 2. Install the newly generated policy:
semodule -i my_custom_fix.pp
```

---

## 7. ⏱️ Time Synchronization (Munge / Chrony)
*CRITICAL: If clocks are out of sync by > 5 minutes, Munge Auth fails, and Slurm nodes will go to DRAIN/INVALID_REG.*

```bash
chronyc tracking                      # Check if the clock is synchronized (Stratum should be < 16)
chronyc sources                       # View what NTP servers you are connected to
chronyc makestep                      # Force an immediate clock synchronization
```

---

## 8. 📂 THE MASTER LOG DIRECTORY (Where to look when things break)

If the web UI isn't giving you enough information, jump into the terminal and check these exact files:

### Slurm Logs
* `tail -f /var/log/slurm/slurmctld.log` — Look here if jobs aren't scheduling or nodes show "DOWN".
* `tail -f /var/log/slurm/slurmd.log` — (On Compute Nodes) Look here if a node refuses to connect to the Master.
* `tail -f /var/log/slurm/slurmdbd.log` — Look here if accounting/database connections fail.

### Open OnDemand Logs
* `tail -f /var/log/httpd/error_log` — General Apache errors, OIDC token failures, proxy issues.
* `tail -f /var/log/ondemand-nginx/<USERNAME>/error.log` — User-specific dashboard crashes (e.g., Passenger, Ruby on Rails errors).

### Warewulf Logs
* `tail -f /var/log/warewulf/warewulfd.log` — Look here if compute nodes fail to PXE boot or grab their OS image.
* `journalctl -u tftp` — Look here if nodes can't find the bootloader over the network.

### Security / SELinux Logs
* `tail -f /var/log/audit/audit.log` — Look here for `type=AVC msg=audit... denied` to see if SELinux is secretly blocking a process.

### System General Logs
* `journalctl -xe` — The master system journal for debugging service crashes (e.g., `systemctl start ...` failed).
* `journalctl -u <service_name>` — e.g., `journalctl -u ondemand-dex` to see why Dex OIDC isn't starting.
