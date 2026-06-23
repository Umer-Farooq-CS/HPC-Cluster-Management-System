# HPC Cluster Management System — Project Overview

## 1. Introduction
The **HPC Cluster Management System** is a local full-stack web application designed for systems administrators. It replaces manual, error-prone configuration files and static terminal scripts with a cohesive, web-based control center. 

The application runs locally on the **Bastion Host (Ubuntu laptop)** and manages the configuration, monitoring, scheduling, and billing of a multi-node high-performance computing cluster.

---

## 2. Core Objectives
1. **Dynamic Configuration:** Eradicate static python settings by allowing administrators to configure all subnets, IPs, and credentials dynamically through interactive forms.
2. **Multiple Profiles:** Support multiple cluster environments (e.g., Development Cluster, Production Lab, testing rigs) using profile configuration switching.
3. **Task Orchestration:** Turn multi-phase terminal commands into single-click web tasks with interactive log streaming, health diagnostics, and error reporting.
4. **Usability & Visibility:** Provide a web interface for scheduling, managing, and accounting for resources that previously required command-line expertise.

---

## 3. Physical Hardware Topology

The system maintains a three-tier network architecture to separate concerns and maximize compute network throughput:

```
                  +--------------------------+
                  |  Bastion Host (Laptop)   |
                  |  Runs local Web App/API  |
                  +-------------+------------+
                                |
                   (Admin IP: 192.168.10.100)
                                |
  [================== Admin Network (192.168.10.x/24) ==================]
                                |
                   (Admin IP: 192.168.10.2)
                  +-------------+------------+
                  |  Master Node (Head Node) |
                  |  Runs Slurmctld, WW4     |
                  +------+--------------+----+
                         |              |
         (Prov IP: 192.168.20.1)  (Data IP: 192.168.30.1)
                         |              |
  [====== Provisioning Network ======]  [========== Data Network ==========]
            (192.168.20.x/24)                    (192.168.30.x/24)
            PXE boot & commands                  NFS Home & MPI traffic
             |             |                      |             |
             |             |                      |             |
     (192.168.20.10) (192.168.20.11)      (192.168.30.10) (192.168.30.11)
      +------+---+     +------+---+        +------+---+     +------+---+
      | Compute  |     | Compute  |        | Compute  |     | Compute  |
      | Node 1   |     | Node 2   |        | Node 1   |     | Node 2   |
      +----------+     +----------+        +----------+     +----------+
```

---

## 4. Lifecycle Phases

To keep execution structured and clean, the development plan is divided into three consecutive phases:

### Phase 1: Provisioning
Guides the configuration and hardware setup:
- Configures internet sharing (NAT forwarding on the Bastion).
- Installs base repositories (EPEL, CRB, OpenHPC), NTP (Chrony), and Slurm on the Master Node.
- Installs and configures Warewulf 4.
- Compiles the "Golden Image" (VNFS container) with appropriate clock-sync and security configurations.
- Handles the entry of node hostnames, IP mapping, and MAC addresses via a grid UI.
- Generates node configurations, updates Warewulf overlays, and builds local DHCP configs to boot thin compute nodes.

### Phase 2: Jobs Management
Handles compute workload operations once the cluster is online:
- Displays cluster partition lists, queue status, and node health.
- Features a **Job Submitter** allowing users to compose script files, configure parameters (nodes, tasks-per-node, time limit, memory allocation), and dispatch them.
- Monitors active jobs, showing queued (`PD`), running (`R`), completed (`CD`), and failed (`F`) jobs in real-time.
- Supports job termination (`scancel`) directly from the UI.

### Phase 3: Bills and Accounting
Implements administrative tracking, usage limits, and cost allocation:
- Automated provisioning of the SQL backend (MariaDB) and Slurm Database Daemon (SlurmDBD) on the Master Node.
- User management system mapping Unix accounts to Slurm associations.
- Account hierarchy creator (assigning CPU hour limits, memory budgets, or max job ceilings to specific research groups).
- Billing reports engine calculating total core-hours consumed by users or departments with printable/downloadable billing summaries.
