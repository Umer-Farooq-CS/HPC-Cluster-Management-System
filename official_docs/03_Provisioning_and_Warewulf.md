# HPC Cluster Management System — Provisioning & Warewulf 4

This document explains the stateless bare-metal provisioning mechanics of the HPC cluster. It details how the Master Node uses Warewulf 4 to inject operating systems entirely into the RAM of diskless compute nodes over the network.

---

## 1. The Concept of Stateless Compute

In a traditional cluster, every compute node has a physical hard drive containing a localized Linux installation. This creates massive administrative overhead—updating software requires pushing changes to 50 individual hard drives, leading to configuration drift.

**Stateless Provisioning** completely eliminates this.
Compute nodes have no hard drives (or they are ignored). When a node powers on, it broadcasts a network request. The Master Node intercepts this request and squirts a highly compressed Linux Operating System directly into the compute node's RAM. 
- **Advantage:** To update 50 nodes, the administrator updates a single "Golden Image" on the Master Node and simply reboots the cluster. Every node instantly boots with the exact same updated configuration.

---

## 2. Warewulf 4 Architecture

Warewulf 4 is the daemon running on the Master Node (`warewulfd`) responsible for this process. It combines several critical network protocols:
- **DHCP**: Assigns IP addresses to the compute nodes dynamically.
- **TFTP / iPXE**: Serves the initial bootloader over the network.
- **HTTP**: Streams the large, compressed Virtual Node File System (VNFS) containing the operating system.

### Boot Sequence
1. The compute node powers on and executes a PXE request via its network card.
2. The Master Node's `warewulfd` responds with an IP address (e.g., `192.168.20.10`).
3. The node downloads the `iPXE` bootloader via TFTP.
4. `iPXE` initializes and downloads the compressed Golden Image (VNFS) over HTTP.
5. The image is expanded into the node's RAM.
6. The node boots Linux.

---

## 3. Golden Images and OCI Containers

Warewulf 4 modernized image management by utilizing OCI (Open Container Initiative) standards. Instead of building monolithic images from ISOs, Warewulf pulls standard Docker containers and converts them into bootable environments.

### Compiling an Image (CLI equivalent of the Dashboard)

If you needed to do this manually without the React GUI, the commands are:

```bash
# 1. Pull a base image from Docker Hub
wwctl container import docker://almalinux:9 alma-base

# 2. Enter the image to install custom software (like Slurmd or Chrony)
wwctl container exec alma-base /bin/bash
# (Inside the container)
dnf install -y epel-release slurm-slurmd chrony
exit

# 3. Compile the Virtual Node File System (VNFS)
wwctl container build alma-base
```

The Web Application automates this entirely via the `/api/v1/images` endpoints.

---

## 4. The Overlay System (How to inject configurations)

If every compute node boots from the exact same read-only image, how do they get unique hostnames, IP addresses, or secret keys? Warewulf solves this using **Overlays**.

An overlay is a set of files that are dynamically injected into the node's RAM *after* the OS image boots, overwriting whatever was there.

### System Overlays
These are applied to all nodes. 
- Example: `/etc/munge/munge.key`. Munge requires every node to have the exact same cryptographic key to authenticate Slurm jobs.
- The web app modifies the master system overlay using `wwctl overlay edit system ...`.

### Node-Specific Overlays
These are applied only to a specific MAC address.
- Example: `/etc/sysconfig/network-scripts/ifcfg-eth0`.
- Gives each node its specific `192.168.20.x` IP address.

> [!IMPORTANT]
> **The Overlay Rebuild Rule:**
> If you manually alter a file inside `/var/warewulf/overlays/`, the nodes will **not** see the change upon reboot until you compile the overlay. You must run:
> `wwctl overlay build`
> The React backend handles this automatically when making changes via the GUI.

---

## 5. Node Management Commands

While the web dashboard handles node discovery (via ARP scanning) and registration, you can interact with the node registry manually:

```bash
# List all nodes registered in the cluster
wwctl node list -a

# Add a node manually
wwctl node add pc2 --ipaddr 192.168.20.10 --hwaddr 00:1A:2B:3C:4D:5E

# Set the node to use the AlmaLinux Golden Image
wwctl node set pc2 --container alma-base

# Allow the node to PXE boot (discoverable)
wwctl node set pc2 --discoverable=yes
```
