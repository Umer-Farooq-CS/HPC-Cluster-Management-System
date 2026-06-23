# Phase 2: Master Node Configuration Explained (Deep Dive)

This document breaks down the deep technical details of what exactly happens during Phase 2 of the HPC Cluster Deployment. It covers the networking challenges we encountered, how we resolved them, and provides a thorough explanation of the OpenHPC and Warewulf components installed on the Master Node.

---

## 1. The Internet Access Problem & NAT Solution

### The Core Problem
Your Master Node is a bare-metal machine connected directly to your Bastion Host (the Ubuntu laptop) via a physical ethernet switch (`192.168.10.x` subnet). Because it is not connected directly to a standard home router, it had no route to the internet. However, Phase 2 strictly requires the internet to download gigabytes of OpenHPC, Slurm, and Warewulf packages via the `dnf` package manager.

### The NAT Router Solution
To solve this, we created the `enable_internet_sharing.sh` script to turn your Ubuntu laptop into a **NAT (Network Address Translation) Router**. 
* **IP Forwarding:** By default, Linux kernels drop any network packets that are not explicitly addressed to them. By setting `net.ipv4.ip_forward=1`, we instruct the Ubuntu kernel to act like a router and forward packets from one network interface to another.
* **iptables MASQUERADE:** We added a firewall rule to the `POSTROUTING` chain on the Wi-Fi interface (`wlo1`). When the Master Node tries to reach `google.com`, the packet travels to your laptop via ethernet (`eno1`). The laptop "masquerades" the packet—stripping out the Master Node's internal IP (`192.168.10.2`) and replacing it with the laptop's Wi-Fi IP. To the outside internet, it looks like your laptop is making the request. When the response comes back, the laptop automatically translates it back and forwards it to the Master Node.

---

## 2. Dynamic Network Interface Configuration

### Device Names vs. Connection Profiles
Previously, the deployment script assumed the network interface device name (e.g., `eno1`) was identical to the NetworkManager Connection Profile Name. In AlmaLinux 9, default connections created during OS installation are often named arbitrarily, like `"Wired connection 1"`. Using the raw device name in the `nmcli con mod` command caused an `unknown connection` error.

### The Fix
We updated `phase2_master.py` to intelligently discover the correct interface and connection name using a two-step process:
1. **Device Discovery:** `ip -o -4 addr show | grep 192.168.10.2` queries the operating system for the exact physical device name (`$IFACE`) associated with the Master Node's known admin IP.
2. **Profile Discovery:** `nmcli -g NAME,DEVICE con show | grep ":$IFACE$"` cross-references that physical device to extract the exact NetworkManager Connection Profile Name (`$CONN`).

### Network Aliasing
Once the correct profile is found, the script injects two **secondary IP subnets** onto the same physical ethernet port. This allows one cable to securely carry three different types of traffic:
* **Admin Network (`192.168.10.x`):** Used for SSH and direct management from the laptop.
* **Data Network (`192.168.30.1/24`):** A dedicated subnet that will later be used for heavy lifting, like sharing the `/home` directory via NFS so compute nodes can access shared user files without congesting other traffic.
* **Provisioning Network (`192.168.20.1/24`):** The internal cluster network. The Master Node acts as `192.168.20.1` and will serve IP addresses and OS images to the compute nodes over this subnet.

Finally, the script injects `192.168.10.100` (the Bastion Host) as the default gateway and `8.8.8.8` as the DNS resolver, allowing the Master Node to finally reach the outside world.

---

## 3. SSH Pseudo-Terminals & Progress Bars

### The Invisible Progress Bar
When `dnf` was invoked over SSH to install the heavy OpenHPC packages, the Python script appeared to completely freeze. This happened because of how Linux handles standard output (`stdout`). 

When a program runs in a real terminal, it knows it can use special carriage return characters to constantly overwrite a single line (which is how progress bars animate). But when SSH executes a command programmatically (from a Python script), it doesn't provide a "TTY" (a virtual screen). Realizing it is not talking to a human, `dnf` falls back to a "buffered" mode. It hides the progress bar completely and waits until the entire 15MB download is finished before sending a single block of text back over the network. 

### The TTY Spoof
We modified `src/utils.py` to append the `-q -tt` flags to the `sshpass` command:
* **`-tt` (Force Pseudo-Terminal):** This forces the Master Node's SSH server to allocate a fake TTY screen in memory. It tricks `dnf` into believing a human is actively watching a monitor, forcing it to render its live, animated progress bars and stream them back to your laptop in real-time.
* **`-q` (Quiet):** Suppresses the noisy "Connection closed" messages that SSH natively emits when a forced TTY session terminates.

---

## 4. OpenHPC, Slurm, & Warewulf Installation (Deep Dive)

With the network routed and SSH behaving correctly, the script executed the core OpenHPC setup. Here is exactly what those software components do:

### A. Core OS Tweaks (Firewall & NTP)
* **Disabling Firewalld:** HPC clusters rely heavily on MPI (Message Passing Interface) for compute nodes to talk to each other during massive parallel calculations. MPI dynamically opens thousands of random network ports. Running a local firewall on cluster nodes breaks this communication, so we disable it entirely on the internal networks.
* **Chrony (NTP):** We install a Network Time Protocol server on the Master Node. Time synchronization is absolutely critical in an HPC cluster. If a compute node's clock is 5 seconds off from the Master Node, the Slurm Job Scheduler might reject jobs, and shared NFS filesystems will throw errors about "files created in the future."

### B. Third-Party Repositories (CRB & EPEL)
Enterprise Linux (AlmaLinux) ships with highly stable, but very basic packages. HPC software requires cutting-edge mathematical libraries and development tools. We enable **CRB (CodeReady Linux Builder)** and **EPEL (Extra Packages for Enterprise Linux)** to give the package manager access to the massive libraries required to build OpenHPC.

### C. Slurm Workload Manager (`slurmctld`)
Slurm is the brain of the cluster. It is the job scheduler that handles the queuing system. When you submit a simulation, Slurm looks at how many compute nodes are idle, how much RAM is available, and schedules the job to run. 
* We install `ohpc-slurm-server` which installs the central controller daemon (`slurmctld`).
* We initialize `slurm.conf` (the master rulebook for the cluster) and `cgroup.conf` (which tells Linux how to isolate and limit CPU/RAM usage so one user's job doesn't crash the entire node).

### D. Warewulf 4 Provisioning & PXE Booting
This is the magic that allows your compute nodes to operate completely "stateless" (without hard drives).
* **What is Warewulf?** Warewulf is an orchestration system designed specifically for HPC clusters. It manages IP address assignments and serves Operating Systems over the network.
* **PXE Booting:** We configure Warewulf's internal DHCP server to listen on the `192.168.20.x` network. When you turn on an empty Compute Node, its motherboard sends out a broadcast shouting "I have no OS, help!". Warewulf hears this, assigns it an IP, and pushes a lightweight Linux kernel directly into the compute node's RAM over the ethernet cable.
* **Initializing the "Nodes" Profile:** The script runs commands like `wwctl profile add nodes`. A "profile" is a master template. Instead of configuring each of your compute nodes individually, you create one master "Nodes Profile". You tell this profile: *"Use the AlmaLinux 9 OS image, mount the Master Node's NFS directory, and use these kernel parameters."* Later, when we add the physical compute nodes in Phase 3, we simply link them to this profile, and they will automatically inherit all of those settings.
