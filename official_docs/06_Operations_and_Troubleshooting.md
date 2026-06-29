# HPC Cluster Management System — Operations & Troubleshooting

This document is the definitive guide for Day-2 operations. If the web UI cannot solve a problem, or if the cluster experiences a catastrophic failure, these are the commands and log paths you need to diagnose and fix the infrastructure from the command line.

---

## 1. The Master Log Directory Reference

When an element of the HPC cluster breaks, the first step is always to check the corresponding log file. Use `tail -f <log_path>` to watch the logs in real-time while trying to reproduce the error.

### Slurm Logs (Workload & Scheduling)
- `/var/log/slurm/slurmctld.log` — The Master controller log. Look here if jobs aren't scheduling or nodes show "DOWN" or "DRAIN".
- `/var/log/slurm/slurmd.log` — The Compute worker log (check on the compute nodes). Look here if a node refuses to connect to the Master.
- `/var/log/slurm/slurmdbd.log` — The database log. Look here if accounting or historical data fails to save.

### Open OnDemand Logs (User Portal)
- `/var/log/httpd/error_log` — General Apache errors, OIDC token failures, proxy issues, and Dex IDP errors.
- `/var/log/ondemand-nginx/<USERNAME>/error.log` — User-specific dashboard crashes (e.g., Ruby Passenger crashes, EEXIST mapping errors).

### Warewulf Logs (Provisioning)
- `/var/log/warewulf/warewulfd.log` — Look here if compute nodes fail to PXE boot or grab their OS image.
- `journalctl -u tftp` — Look here if nodes cannot find the initial bootloader over the network.

### Security / SELinux Logs
- `/var/log/audit/audit.log` — Look here for `type=AVC msg=audit... denied` to see if SELinux is silently blocking a process (like OOD or Slurm).

---

## 2. Common Failures & Resolutions

### Problem 1: Compute Nodes are in DOWN+NOT_RESPONDING, DRAIN, or INVALID_REG state
When you run `sinfo`, your compute nodes show as `DOWN*` or `DRAIN` instead of `IDLE`.
- **Cause A (Munge/Time Skew):** Slurm relies on Munge for authentication, and Munge relies on exact time synchronization. If a compute node's clock is off by more than 5 minutes from the Master Node, Munge rejects the connection. This almost always happens on first boot if `chrony` fails to step the clock.
  - **Resolution:** SSH into the compute node and force a clock sync: `chronyc makestep`. To fix it permanently, ensure `makestep 1 -1` is present in the Master Node's Warewulf overlay template `/srv/warewulf/overlays/nodeconfig/rootfs/etc/chrony.conf.ww` and run `wwctl overlay build`.
- **Cause B (Memory Mismatch):** The `slurm.conf` says the node has 16GB of RAM, but the node actually has 15.5GB available. Slurm will drain the node to prevent OOM errors.
  - **Resolution:** Edit `slurm.conf` on the Master, lower the `RealMemory` value slightly, run `scontrol reconfigure`, and then run `scontrol update NodeName=<node> State=RESUME`.

### Problem 2: Open OnDemand Job Composer throws CSRF "Invalid Authenticity Token" Error
When a user tries to submit a job via the web UI, they get a red `422 Unprocessable Entity` error.
- **Cause:** A reverse proxy is stripping the host headers, making the Ruby on Rails app think it's a Cross-Site Request Forgery attack.
- **Resolution:** Ensure the Apache `ood_portal.yml` contains the `X-Forwarded` header directives and run the `update_ood_portal` script. (Refer to the Open OnDemand & SSO documentation).

### Problem 3: Passenger or PUN crashes with EEXIST (SELinux Denial)
A user logs in, but the dashboard is entirely broken or throws a Ruby error.
- **Cause:** The system automatically created the user's home directory, but SELinux is preventing the unprivileged Nginx process from writing socket files inside it.
- **Resolution:** Ensure the `ood_custom.te` SELinux module is compiled and installed:
  ```bash
  semodule -i ood_custom.pp
  sudo /opt/ood/nginx_stage/sbin/nginx_stage pun -u <username> -a restart
  ```

### Problem 4: Slurm Jobs Fail with "No such file or directory" for Spack/Python
When running a batch job via `srun`, it fails on some nodes because it cannot find the executable, even though the same path works on the Master Node or head node.
- **Cause:** The NFS network drive (e.g., `/export/apps`) failed to mount on the compute node. Systemd `.mount` and `.automount` units require the physical mount point directory (the empty folder) to exist in the node's filesystem *before* they can attach the network drive. If the OS image was built without that empty directory, the mount silently fails.
- **Resolution:** Inject the empty directory directly into the Warewulf `nodeconfig` overlay so it is dynamically created on boot for all images:
  ```bash
  mkdir -p /srv/warewulf/overlays/nodeconfig/rootfs/export/apps
  wwctl overlay build
  ```
  Then reboot the node or manually create the folder and run `mount -a`.

---

## 3. General Administrator Cheatsheet

### Docker & Web App Orchestration (Run from Bastion Host)
```bash
docker-compose up -d --build       # Start the whole stack
docker-compose down                # Stop the stack
docker-compose logs -f backend     # View real-time backend API logs
docker ps                          # Check container health
```

### Warewulf 4 Administration (Run from Master Node)
```bash
wwctl node list -a                    # View all compute nodes and their image assignments
wwctl overlay build                   # CRITICAL: Run this after changing ANY file in /var/warewulf/overlays
wwctl server restart                  # Restart the provisioning daemon
```

### Time Synchronization (Chrony)
```bash
chronyc tracking                      # Check sync status (Stratum should be < 16)
chronyc sources                       # View connected NTP servers
chronyc makestep                      # Force an immediate hard sync of the system clock
```

### The Magic SELinux Fixer
If you suspect SELinux is blocking something, you can automatically generate a policy to allow it based on the recent audit logs:
```bash
cat /var/log/audit/audit.log | grep denied | audit2allow -a -M my_custom_fix
semodule -i my_custom_fix.pp
```
