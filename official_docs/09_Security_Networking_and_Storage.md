# HPC Cluster Management System — Security, Networking & Storage

This document provides a deep dive into the complex "under-the-hood" elements that ensure the cluster remains stable, secure, and performant. It covers the systemd NFS automount architecture, the custom SELinux policies, network topology, and time synchronization.

---

## 1. Network Topology & Routing

The Master Node acts as a strict gateway between the outside world and the internal compute environment.

### The Two Interfaces
The Master node must be dual-homed:
- **`eth0` (Admin/Campus Network)**: Connects to the Bastion host (or general internet). Receives a dynamic or static IP from the external facility.
- **`eth1` (Provisioning Network - 192.168.20.0/24)**: Connects to the isolated D-Link switch. The Master Node acts as the absolute authority on this network (running DHCP, TFTP, and HTTP).

### NAT and IP Masquerading
Compute nodes do not have direct access to the internet. If they need to download software (e.g., pulling a python library via `pip` inside a job), the Master Node uses `firewalld` to route their traffic.

The automated deployment script configures the Master Node's firewall with:
```bash
firewall-cmd --permanent --zone=public --add-masquerade
```
This allows traffic originating from `192.168.20.x` to exit through `eth0`, hiding the internal IPs from the external network.

---

## 2. Storage: The systemd Automount Architecture

Compute nodes are diskless; all their software must come over the network. The Master Node exports `/export/apps` via NFS.

### The Legacy Problem
Historically, administrators would place the NFS mount in the Golden Image's `/etc/fstab` file. However, in a stateless Warewulf boot, if the network is slightly delayed, the `fstab` mount will fail during early boot, dropping the compute node into an emergency maintenance shell and halting the cluster.

### The systemd Solution
Instead of `fstab`, the deployment scripts generate two systemd drop-in files pushed via Warewulf overlays:

1. **`export-apps.mount`**: Defines *how* to mount the NFS share.
2. **`export-apps.automount`**: Defines *when* to mount the NFS share.

The `.automount` unit intercepts any process trying to read `/export/apps`. When a user runs a job that requires a module, systemd pauses the process, mounts the NFS share in the background on-demand, and then lets the process continue. This completely eliminates boot-time hangs.

---

## 3. Time Synchronization: Munge and Chrony

Slurm's authentication daemon (`munge`) relies on cryptographically signed payloads that expire quickly to prevent replay attacks. If a compute node's clock drifts more than 5 minutes from the Master Node, Munge will reject the token, causing Slurm to place the node in a `DRAIN` state.

### The Stratum 1 Architecture
To prevent this, the deployment script configures the Master Node as a local NTP Stratum 1 server using `chronyd`. 

The compute nodes are configured to strictly sync with `192.168.20.1` (The Master Node). Furthermore, the Warewulf Golden Image is modified with the `chronyc makestep` command to force a hard clock synchronization immediately upon booting, ensuring Munge never fails on startup.

---

## 4. Security: Custom SELinux Modules

Security-Enhanced Linux (SELinux) is active and in `Enforcing` mode on the Master Node. While it protects the system, it often clashes with complex web applications like Open OnDemand (OOD).

### The Passenger EEXIST Bug
When OOD spawns a Per-User Nginx (PUN) process for a new user, it attempts to write a UNIX socket file inside the user's home directory. By default, SELinux prevents the `ood_pun_t` domain from managing files in the `config_home_t` domain. This results in an `EEXIST` mapping error, and the user's dashboard completely fails to load.

### The Custom Policy Fix (`ood_custom.te`)
The Bastion host's Ansible runner compiles and injects a custom SELinux policy during the Master Node setup phase.

```te
module ood_custom 1.0;

require {
    type ood_pun_t;
    type config_home_t;
    class dir { add_name create write remove_name setattr };
    class file { create open write setattr };
}

#============= ood_pun_t ==============
allow ood_pun_t config_home_t:dir { add_name create write remove_name setattr };
allow ood_pun_t config_home_t:file { create open write setattr };
```

This policy explicitly grants the OOD application the correct permissions to manage its internal files, resolving the crashes without needing to disable SELinux.
