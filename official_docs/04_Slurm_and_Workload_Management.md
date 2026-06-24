# HPC Cluster Management System — Slurm & Workload Management

This document details the configuration, architecture, and operation of Slurm (Simple Linux Utility for Resource Management) within the cluster. Slurm is the brain that decides when and where computational jobs run.

---

## 1. The Slurm Architecture

The Slurm ecosystem in this cluster is composed of three primary daemons and a cryptographic authenticator.

### 1. `slurmctld` (The Controller)
- **Location:** Runs on the Master Node.
- **Purpose:** The central manager. It monitors the state of all compute nodes, manages the job queues, and allocates resources. It reads its configuration from `/etc/slurm/slurm.conf`.

### 2. `slurmd` (The Worker)
- **Location:** Runs on every Compute Node.
- **Purpose:** The execution agent. It awaits commands from the controller, launches the user's batch scripts, monitors resource usage (RAM/CPU) of the job, and reports back.

### 3. `slurmdbd` (The Database Daemon)
- **Location:** Runs on the Master Node, connected to **MariaDB**.
- **Purpose:** Handles job accounting. Every time a job finishes, `slurmdbd` logs exactly how much CPU time and memory was used by which user, allowing for fair-share scheduling and historical analysis.

### 4. `munge` (The Authenticator)
- **Location:** Runs everywhere (Master and Compute nodes).
- **Purpose:** Cryptographic payload signing. Slurm relies entirely on Munge to verify that a command coming from the Master Node is legitimate. Munge requires a shared secret key (`/etc/munge/munge.key`) to be identical across all nodes.

---

## 2. Configuration & `slurm.conf`

The primary configuration file is `/etc/slurm/slurm.conf` on the Master Node. Through the web dashboard's setup wizard, this file is generated dynamically based on the cluster's network parameters.

Key components of the configuration:
- **ClusterName:** Usually set to `linux` or the user-defined name.
- **ControlMachine:** The hostname of the Master Node.
- **AuthType:** Set to `auth/munge`.
- **AccountingStorageType:** Set to `accounting_storage/slurmdbd`.
- **Node Definitions:** This tells the controller how many CPUs and how much RAM each node has.
  - Example: `NodeName=pc[2-3] CPUs=8 RealMemory=16000 State=UNKNOWN`
- **Partition Definitions:** A partition is a queue.
  - Example: `PartitionName=normal Nodes=pc[2-3] Default=YES MaxTime=24:00:00 State=UP`

---

## 3. The Lifecycle of a Job

When a user submits a job via Open OnDemand or the command line (`sbatch my_script.sh`):

1. **Submission:** The user runs `sbatch`. The command is cryptographically signed by Munge and sent to `slurmctld`.
2. **Queuing:** The controller evaluates the requested resources (e.g., 4 CPUs, 8GB RAM). If the resources are available, the job is allocated; otherwise, it sits in the `PENDING` state.
3. **Dispatch:** The controller contacts the `slurmd` daemon on the chosen compute node(s) and sends the script.
4. **Execution:** The node executes the script. Output is piped back to the user's specified log file.
5. **Accounting:** Upon completion, the controller notifies `slurmdbd`, which writes the final usage statistics to the MariaDB database.

---

## 4. Common Administrator Commands

While the web dashboard provides visual telemetry of the cluster state, administering Slurm often requires terminal access to the Master Node.

### Viewing Cluster Status
```bash
# View the state of all nodes (IDLE, ALLOCATED, DRAIN, DOWN)
sinfo

# View the detailed configuration and current state of a specific node
scontrol show node pc2
```

### Managing Jobs
```bash
# View the active job queue
squeue

# Cancel a specific job by its ID
scancel 1045

# View historical accounting data for jobs run since midnight
sacct
```

### Managing Daemons
```bash
# Reload slurm.conf without restarting the daemon (useful after adding nodes)
scontrol reconfigure

# Restart the central controller
systemctl restart slurmctld
```

---

## 5. Understanding Node States (The "DRAIN" Problem)

In HPC, a compute node is extremely sensitive to errors. If a node fails to report in, or if its configuration does not match what the Master Node expects, Slurm will place it in a `DRAIN` or `DOWN` state.

- **DOWN:** The node is completely unreachable or `slurmd` has crashed.
- **DRAIN:** The node is reachable, but an error occurred (e.g., insufficient memory, unexpected reboot). Slurm will refuse to schedule new jobs here until an administrator clears the state.

**To fix a DRAINed node:**
1. Fix the underlying issue (e.g., reboot the node, fix the network).
2. Tell Slurm the node is healthy again:
```bash
scontrol update NodeName=pc2 State=RESUME
```
