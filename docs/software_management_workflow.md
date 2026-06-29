# HPC Software Management: Spack & Lmod Workflow

Managing software in a High-Performance Computing (HPC) environment requires strict isolation, optimized compilation for underlying CPU architectures, and immediate availability across hundreds of stateless compute nodes. 

This document outlines how our cluster orchestrates software packages using **Spack**, **Lmod**, and **NFS**.

---

## 1. The Core Infrastructure

The fundamental premise of our architecture is **"Build Once, Run Anywhere."**

*   **Spack (`/export/apps/spack`)**: The core package manager. It downloads source code, determines the exact dependency tree, and compiles software optimized for your specific hardware.
*   **Lmod**: An advanced environmental module system. It allows users to dynamically alter their `$PATH` and `$LD_LIBRARY_PATH` by simply running `module load <software>`.
*   **NFS (`/export/apps`)**: A shared network drive hosted on the Master Node and dynamically mounted by every compute node (`pc2`, `pc3`).

### The Global Profile (`spack_setup.sh`)
Because compute nodes boot entirely from a pristine RAM image, they do not inherently know where Spack or Lmod are located on the network drive. 

To bridge this gap, we bake a global shell profile configuration (`/etc/profile.d/spack_setup.sh`) directly into the compute node's Golden Image:

```bash
# /etc/profile.d/spack_setup.sh
if [ -f /export/apps/spack/share/spack/setup-env.sh ]; then
    . /export/apps/spack/share/spack/setup-env.sh
fi
# Override for CPU microarchitecture mismatch (e.g. nehalem vs x86_64)
module use /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core
```
This ensures that the millisecond any user or process opens a terminal on a compute node, their shell intercepts the Spack initialization script and hooks them into Lmod.

---

## 2. Example Scenario: Installing and Using Software

Let's walk through the end-to-end lifecycle of installing the `zlib` compression library.

### Phase A: Compilation (Admin Task on Master Node)
The cluster administrator logs into the Master Node, which has write-access to the NFS volume.

1.  **Initialize the Environment**:
    ```bash
    [root@master ~]# source /export/apps/spack/share/spack/setup-env.sh
    ```
2.  **Compile the Software**:
    The admin requests Spack to install the library. Spack downloads the source, identifies the optimal compiler (e.g., `gcc@11.5.0`), and compiles the binaries into the shared drive.
    ```bash
    [root@master ~]# spack install zlib
    ==> Installing zlib-1.3.2
    ==> Successfully installed zlib
    ```
3.  **Generate Lmod Module Files**:
    Spack does not make software immediately available; it must generate Lua-based Lmod files so the environment loader understands the software hierarchy.
    ```bash
    [root@master ~]# spack module lmod refresh --yes
    ==> Regenerating lmod module files
    ```

### Phase B: Execution (User Task on Compute Node)
A researcher SSHs into the `pc2` compute node (or submits a Slurm batch job).

1.  **Check Availability**:
    Thanks to our global `/etc/profile.d/spack_setup.sh` hotfix, the user runs `module avail` and instantly sees the new software without any manual configuration!
    ```bash
    [umer@pc2 ~]$ module avail
    ------ /export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core -------
       gcc/11.5.0-xwcconl    zlib/1.3.2-ycpxie7
    ```
2.  **Load the Module**:
    The user loads the module. Lmod intercepts this, updates the system `$PATH`, and points it to the NFS volume binaries.
    ```bash
    [umer@pc2 ~]$ module load zlib
    ```

### Phase C: Dashboard Synchronization (Open OnDemand)
How does the web UI know what software is installed?
Open OnDemand features a web-based Job Composer and software indexer, but it cannot actively crawl the NFS drive because it is too slow.

To solve this, we implemented an automated Hourly Cron Job (`/etc/cron.hourly/sync_ood_modules`) on the Master Node:
```bash
#!/bin/bash
export MODULEPATH=/export/apps/spack/share/spack/lmod/linux-almalinux9-x86_64/Core
/opt/ohpc/admin/lmod/lmod/libexec/spider -o spider-json $MODULEPATH > /etc/ood/config/modules/spack_stack.json
```
This cron job runs Lmod's `spider` command to build a rapid, flattened JSON representation of all installed software. Open OnDemand reads this instant-access cache, allowing researchers to select software environments directly from their web browser drop-down menus before submitting a job!
