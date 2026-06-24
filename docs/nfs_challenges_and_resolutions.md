# Understanding Our NFS Architecture: Challenges & Resolutions

When designing a diskless, stateless High-Performance Computing (HPC) cluster, storage access is one of the most critical elements. Compute nodes boot entirely into RAM, meaning any persistent storage (user data, software installations) must be mounted over the network via NFS. 

This document outlines the architectural failures we encountered while attempting to manually enforce NFS mounts and how we resolved them by embracing native infrastructure-as-code patterns.

---

## 1. The Core Challenge: Configuration Collisions

### The Initial Approach
Initially, we attempted to enforce NFS mappings by manually modifying the `/etc/fstab` file inside the compute node's boot image (or via a Warewulf system overlay). Concurrently, on the Master Node, we used simple `echo` commands to append directories like `/export/apps` into `/etc/exports`.

### The Catastrophic Failure
This approach resulted in compute nodes dropping into an **Emergency Shell** during boot, completely halting the cluster. The failures stemmed from two distinct collisions:

1.  **The Fstab Overwrite Conflict**:
    Warewulf has a built-in mechanism that dynamically generates its own `/etc/fstab` during the node boot process to ensure critical paths like `/home` and `/opt` are mounted correctly from the Master. By pushing our own static `/etc/fstab` through a Warewulf overlay, we clobbered Warewulf's dynamically generated file. This caused duplicate mount entries, race conditions, and an unbootable kernel state.
2.  **The Warewulf Configuration Drift**:
    Warewulf manages the Master Node's NFS server state. Whenever `wwctl configure -a` or `wwctl configure nfs` runs, Warewulf overwrites `/etc/exports` with the configurations defined in its primary YAML file. Our manual `echo` scripts were being erased, causing compute nodes to hang indefinitely while searching for missing NFS shares.

---

## 2. The Architectural Resolution

To achieve production-grade stability, we removed all "hacky" overrides and aligned our cluster with native systemd and Warewulf architectures.

### Solution A: Centralizing NFS Exports in Warewulf
Instead of manually appending to `/etc/exports`, we shifted to treating **Warewulf as the ultimate source of truth**. 
In our Master Node automation script, we use Python to inject the `/export/apps` path natively into `/etc/warewulf/warewulf.conf`:

```yaml
nfs:
  export paths:
  - export options: rw,sync,no_root_squash
    path: /home
  - export options: ro,sync,no_root_squash
    path: /opt
  - export options: rw,sync,no_root_squash
    path: /export/apps
```
By doing this, Warewulf's internal templating engine permanently manages the NFS server, ensuring our custom software drives survive cluster reconfigurations.

### Solution B: Systemd Native Automounts
To bypass the `/etc/fstab` collision entirely, we transitioned to native **systemd mount units**. Systemd allows defining mount points cleanly without touching `fstab`.

We inject two files into the Warewulf `nodeconfig` overlay:
1.  **`export-apps.mount`**: Defines *what* to mount (`192.168.20.1:/export/apps`) and *where* to mount it.
2.  **`export-apps.automount`**: Configures the system to only mount the NFS drive *when it is actually requested/accessed*, drastically speeding up the boot sequence and preventing network race conditions during startup.

```ini
# /etc/systemd/system/export-apps.automount
[Unit]
Description=Automount for Shared Applications
After=network.target

[Automount]
Where=/export/apps
TimeoutIdleSec=600

[Install]
WantedBy=multi-user.target
```

### Conclusion
By relying on **Warewulf's internal YAML definitions** for server-side exports and **systemd automounts** for client-side mounting, the cluster is now completely stable. Compute nodes boot in seconds without error, and storage configuration drift has been permanently eliminated.
