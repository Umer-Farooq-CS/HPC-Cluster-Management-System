# Lmod and Spack Guide

This document provides a comprehensive guide to using Lmod and Spack for software management across the HPC Cluster.

## 1. Overview

The HPC Cluster uses **Spack** for package management and **Lmod** (Environment Modules) to dynamically configure the user environment. 
- **Spack** installs packages and automatically generates the corresponding module files.
- **Lmod** makes these software packages available to users by dynamically adjusting environment variables like `PATH`, `LD_LIBRARY_PATH`, and `MODULEPATH`.

## 2. Spack Commands

Spack is the underlying package manager used to compile and install software from source. Only administrators typically need to run Spack commands to install global software, but users can also install software in their home directories.

### Basic Usage

- **List installed packages:**
  ```bash
  spack find
  ```
- **List installed packages matching a pattern:**
  ```bash
  spack find <package_name>
  ```
- **Install a package:**
  ```bash
  spack install <package_name>
  ```
  *Example:* `spack install gcc@11.2.0`
- **Uninstall a package:**
  ```bash
  spack uninstall <package_name>
  ```
- **Find information about a package:**
  ```bash
  spack info <package_name>
  ```

### Environments
Spack environments allow you to group packages together.
- **Create an environment:** `spack env create <env_name>`
- **Activate an environment:** `spack env activate <env_name>`
- **Deactivate an environment:** `spack env deactivate`

## 3. Lmod Commands

Lmod is how users interact with the installed software. It alters environment variables so the shell can find the requested software.

### Basic Usage

- **List all available modules:**
  ```bash
  module avail
  ```
- **Load a module:**
  ```bash
  module load <module_name>
  ```
  *Example:* `module load gcc/11.2.0`
- **Unload a module:**
  ```bash
  module unload <module_name>
  ```
- **List currently loaded modules:**
  ```bash
  module list
  ```
- **Search for a module (across all module paths):**
  ```bash
  module spider <software_name>
  ```
- **Purge all loaded modules:**
  ```bash
  module purge
  ```
- **Show what a module does (without loading it):**
  ```bash
  module show <module_name>
  ```

## 4. Troubleshooting: Module Mismatch (Master vs Compute Nodes)

### Issue Description
You may notice that running `module avail` on the **Master Node** shows hundreds of packages, but running `module avail` on a compute node (e.g., **pc2**) only shows a few basic packages (like `cmake` and `hwloc`).

### Root Cause
This occurs when the `MODULEPATH` environment variable is not fully populated on the compute nodes. The compute nodes are stateless and managed by Warewulf. Although the Spack installation directory (`/export/apps/spack`) is successfully mounted via NFS on the compute nodes, the compute node shells need to know to source the Spack initialization script upon login.

### Resolution

The profile script (`/etc/profile.d/spack_setup.sh`) must be present on all compute nodes. This file sources the Spack environment and sets up Lmod.

**Step 1: Ensure the script is in the Warewulf Node Overlay on the Master Node**
The file has already been added to the master node's Warewulf overlay at:
`/var/lib/warewulf/overlays/nodeconfig/etc/profile.d/spack_setup.sh`

It contains the following:
```bash
if [ -f /export/apps/spack/share/spack/setup-env.sh ]; then
    . /export/apps/spack/share/spack/setup-env.sh
fi
```

**Step 2: Apply the overlay to the compute nodes**
Because Warewulf nodes are stateless, you have two options to apply this change to your active compute nodes:

- **Option A (Persistent): Reboot the Compute Nodes**
  The simplest method is to restart the compute node (`pc2`). When it boots, it will pull the latest `nodeconfig` overlay from Warewulf, which now includes the `spack_setup.sh` profile script.
  ```bash
  # Run on master node
  wwctl power reset pc2
  ```

- **Option B (Temporary Fix for Current Session): Manually Source the Script**
  If you need immediate access without rebooting, you can run this manually on the compute node:
  ```bash
  # Run directly on pc2
  source /export/apps/spack/share/spack/setup-env.sh
  ```
  After running this command, `module avail` on `pc2` will display all 200+ packages.

---
**Note:** For the permanent fix, rebooting the compute nodes is required to securely propagate the Warewulf configuration updates.
