# 15. Open OnDemand Interactive Apps Integration

## Overview

Open OnDemand (OOD) provides a seamless way to deploy interactive applications (like Jupyter Lab and VS Code) directly through a web browser. 

Setting up OOD Interactive Apps means you do **not** need to deploy separate, complex services like JupyterHub or manage standalone reverse proxies. You are essentially just writing a web form and a batch script template. Once these files are in place, Open OnDemand automatically handles:
- **Authentication:** Verifying the user (via SSO/Keycloak).
- **Job Submission:** Translating the web form into an `sbatch` job.
- **Routing & Proxying:** Utilizing the Per-User Nginx (PUN) to route traffic from the browser to the exact compute node running the job.
- **UI Generation:** Creating the "Connect to Jupyter" or "Connect to VS Code" buttons dynamically.

## Architecture: How It Works & Where It Lives

### Component Placement
- **Master Node (16GB Core i3):** This is where all the configuration files, forms, and submission templates reside (`/var/www/ood/apps/sys/`). OOD runs on the Master Node, rendering the portal UI and submitting jobs directly to the local Slurm controller.
- **Dev Node (8GB Pentium):** This node acts as the lightweight `interactive` partition where the VS Code or Jupyter backends (`code-server`) run. Due to the 8GB RAM limit, it is scaled for a maximum of 2 concurrent users.
- **Compute Nodes (8GB Pentiums):** These nodes handle pure execution. Developers can open a terminal inside their VS Code session on the Dev Node to submit heavy processing jobs to these Compute Nodes via `sbatch`.
- **Shared Storage (NFS from Master Node):** Binaries like `code-server` or Conda environments are placed on the `/export/apps/` NFS share so they are visible to all nodes that might execute the job.

### The Connection Flow
1. **User Request:** A user logs into the OOD Dashboard (hosted on the Master Node) and clicks on an app (e.g., Jupyter). They fill out the resource request form (`form.yml`).
2. **Submission:** OOD takes the form inputs, populates the variables in `submit.yml.erb` and `template/script.sh.erb`, and submits it to the Slurm controller (also on the Master node) via `sbatch`.
3. **Execution:** Slurm schedules the job onto a node (e.g., a Compute node or the lightweight Interactive node). 
4. **Initialization:** The script starts running on the allocated node. It binds `jupyter` or `code-server` to a random, unused port and exports a password/token.
5. **Proxy Configuration:** OOD detects that the job has started, captures the node hostname and the random port, and instructs the user's PUN (Per-User Nginx) process on the Master Node to create a reverse proxy to that specific node and port.
6. **Connection:** A "Connect" button appears in the user's browser. Clicking it tunnels their web traffic through the Master Node directly to the application running on the backend compute node.

---

## App Structure

Each interactive app lives in `/var/www/ood/apps/sys/<app_name>/` and requires four key files:

1. **`manifest.yml`** — Defines the app's name, category, and icon for the OOD dashboard menu.
2. **`form.yml`** — The UI web form for users to request resources (partition, hours, environment, project folder, etc.).
3. **`submit.yml.erb`** — Tells OOD how to submit the job to Slurm (partition flags, wall time, and the proxy template to use).
4. **`template/script.sh.erb`** — The actual script handed to `sbatch`. It starts the application and binds it to a port.

---

## App 1: Jupyter Lab

Create the app directory: `/var/www/ood/apps/sys/jupyter/`

### 1. `manifest.yml`
```yaml
---
name: Jupyter
category: Interactive Apps
subcategory: Servers
icon: fas://book
```

### 2. `form.yml`
```yaml
cluster: "hpc-cluster"
attributes:
  bc_queue: "compute"
  bc_num_hours:
    widget: number_field
    value: 2
  conda_env:
    widget: select
    label: "Environment"
    options:
      - ["Base Data Science", "datasci"]
      - ["My Project Env", "myproject"]
form:
  - bc_queue
  - bc_num_hours
  - conda_env
```

### 3. `submit.yml.erb`
```yaml
---
batch_connect:
  template: "basic"
script:
  native:
    - "--partition=<%= bc_queue %>"
  job_name: "ood-jupyter"
  wall_time: <%= bc_num_hours.to_i * 3600 %>
```
*(Note: `batch_connect: template: "basic"` tells OOD to auto-generate a random password, write a connection file, and create the "Connect" button—replacing the need for a separate Jupyter proxy).*

### 4. `template/script.sh.erb`
```bash
#!/bin/bash
module purge
source /export/apps/spack/share/spack/setup-env.sh
source activate <%= context.conda_env %>

export PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])')

jupyter lab --no-browser --ip=0.0.0.0 --port=${PORT} \
  --NotebookApp.token="${password}" \
  --NotebookApp.base_url="${OOD_CONNECT_BASE}"
```

---

## App 2: VS Code (via code-server)

First, ensure `code-server` is installed in your NFS share (`/export/apps`) and accessible via Spack/Lmod.

Create the app directory: `/var/www/ood/apps/sys/vscode/`

### 1. `manifest.yml`
*(Create a manifest similar to Jupyter, changing the name and icon)*

### 2. `form.yml`
```yaml
cluster: "hpc-cluster"
attributes:
  bc_queue: "interactive"
  bc_num_hours:
    widget: number_field
    value: 4
  project_dir:
    widget: path_selector
    label: "Project Folder"
form:
  - bc_queue
  - bc_num_hours
  - project_dir
```

### 3. `submit.yml.erb`
*(Identical structure to Jupyter's submit file)*

### 4. `template/script.sh.erb`
```bash
#!/bin/bash
module load code-server

export PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])')
export CS_PASSWORD="${password}"

code-server --bind-addr 0.0.0.0:${PORT} --auth password \
  "<%= context.project_dir %>"
```

---

## Node Allocation Strategy

To optimize resource usage across the 5-node cluster, utilize specific Slurm partitions for different types of workloads:

1. **Lightweight Interactive Work (VS Code / File Editing):**
   Create a dedicated partition scoped strictly to the 8GB Pentium Dev Node (`dev-node`). This isolates interactive users from heavy batch compute jobs.
   ```ini
   # In slurm.conf
   PartitionName=interactive Nodes=dev-node MaxTime=08:00:00 State=UP
   ```
   **App Default:** In the VS Code `form.yml`, set the default `bc_queue` to `interactive`. Because the Dev Node is 8GB, you should enforce QoS limits to a maximum of 2 concurrent users.

2. **Heavy Data Crunching (Jupyter / Machine Learning):**
   These jobs require real compute horsepower and should land on the actual Compute Nodes.
   **App Default:** In the Jupyter `form.yml`, set the default `bc_queue` to `compute`. 

By setting these defaults, you organically steer users toward the correct hardware without manual policing. Users write code on the lightweight Dev Node and send heavy execution payloads to the Compute Nodes.

---

## Deployment and Troubleshooting

### Deploying New Apps
After creating or modifying app files in `/var/www/ood/apps/sys/`, OOD usually picks them up immediately upon a page refresh. If they do not appear, restart the Apache web server on the Master node:
```bash
systemctl restart httpd
```

### Troubleshooting
- **PUN / Proxy Errors:** If a user clicks "Connect" and gets a gateway error, check the Per-User Nginx logs on the Master node: 
  `/var/log/ondemand-nginx/<username>/error.log`
- **Job Submission Failures:** If the app fails to start or queue, treat it as a standard Slurm failure. Check the Slurm controller logs on the Master node:
  `/var/log/slurm/slurmctld.log`
- **Script Errors:** The output (`stdout`/`stderr`) of the batch script is written to the user's home directory under `~/ondemand/data/sys/dashboard/batch_connect/sys/<app_name>/output/`.

### Performance & Slowness in "New Tabs"
If the Open OnDemand Dashboard navigates very quickly when clicking menus in the same tab, but takes 2 to 5 seconds to load when clicking links that open a *new tab* (such as the Shell app, Files app, or launching an Interactive session), this is expected behavior.
*   **Passenger Cold Starts:** To conserve RAM on the Master Node, Phusion Passenger (the OOD application server) does not keep all applications running constantly. When you click a link that opens a new tab (like the "Files" app), Passenger performs a "Cold Start", booting up a fresh Ruby or Node.js process specifically for that application. 
*   **Subsequent Loads:** Once that specific app is running, interacting with it or opening it again will be instantaneous until Passenger spins it down due to inactivity.

**Optimization (SSH DNS Lookups):**
If the *Shell* app specifically is taking a long time (5-10 seconds) to connect, the Master Node's SSH daemon may be attempting a reverse DNS lookup. To fix this, disable SSH DNS lookups on the Master Node:
```bash
# On the Master Node, edit /etc/ssh/sshd_config and add:
UseDNS no
# Then restart SSH:
systemctl restart sshd
```
