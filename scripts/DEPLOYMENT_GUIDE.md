# HPC Cluster Deployment Guide (Baby Steps)

Welcome! This guide will walk you through building your High-Performance Computing (HPC) cluster from scratch. You will act as the "Orchestrator" using your Ubuntu laptop, while your Python scripts will automatically configure the rest of the cluster over SSH.

## 🛠️ Prerequisites
Before starting, ensure you have:
1. **Your Bastion Host:** An Ubuntu laptop (where this script lives).
2. **Your Master Node:** 1 bare-metal PC.
3. **Your Compute Nodes:** 2 (or more) bare-metal PCs (your Slaves).
4. **Networking:** A network switch and ethernet cables connecting all machines together.
5. **USB Drive:** A flash drive (8GB+).
6. **OS Image:** Download the **AlmaLinux-9.8-x86_64-minimal.iso** from the official website.

---

## 🟢 Step 1: Prepare the "Nodes" List
If you haven't already, turn on your Compute Nodes (Slaves) briefly just to find out their MAC addresses in their BIOS, then turn them off.
1. Open `src/nodes.txt` on your laptop.
2. Enter the hostname, MAC address, and IP address for each of your Compute Nodes.
3. Save the file.

---

## 🟢 Step 2: Phase 1 (Bootstrapping the Master Node)
The Master Node needs an operating system physically installed on its hard drive so it can run the cluster.

1. **Create Bootable USB:** Use a program like [Rufus](https://rufus.ie/) on another computer to flash the AlmaLinux-9.8-x86_64-minimal.iso onto your USB drive.
2. **Install OS:** Plug the USB into your **Master Node (PC 1)** and boot from it.
3. **During Installation:**
   - **Root Password:** Set the root password to exactly `hpc` (or whatever you changed it to in `src/config.py`).
   - **Network Setup:** Go to the Network configuration page. Set the primary ethernet interface to use a **Static IP**. 
     - **IP Address:** `192.168.10.2`
     - **Subnet Mask:** `255.255.255.0`
4. **Finish:** Finish the installation and reboot the Master Node. Let it boot up to the login screen.
5. **Connect Laptop:** Connect your Ubuntu laptop to the network switch. Give your laptop a static IP on the same subnet (for example, `192.168.10.100`) so it has permission to talk to the Master Node.

To verify Phase 1 is ready, open a terminal on your laptop, navigate to the `src` folder, and run:
```bash
cd ~/Desktop/HPC-Cluster-Script/src
python3 phase1_bootstrap.py
```
*It will ping the Master Node and tell you when the SSH connection is successfully established!*

---

## 🟢 Step 3: Phase 2 (Configuring the Master Node)
Now that the Master Node is awake and reachable, your laptop will take over and install all the heavy cluster software (OpenHPC, Slurm, and Warewulf).

1. In your laptop terminal, run:
```bash
python3 phase2_master.py
```
2. Wait a few minutes. The script will automatically SSH into the Master Node, configure the Data (`192.168.30.x`) and Provisioning (`192.168.20.x`) networks, and install all the necessary HPC software. 
3. When it finishes, it will print `[+] Master Node configuration complete.`

---

## 🟢 Step 4: Phase 3 (Building the Golden Image)
Now the Master Node needs to construct the "Stateless OS Image" that it will eventually serve to the compute nodes.

1. In your laptop terminal, run:
```bash
python3 phase3_image.py
```
2. The script will download an AlmaLinux 9 container, install all the Slurm tools inside it, apply security limits, and package it into a bootable format. It will also start the Slurm Control Plane on the Master Node.
3. Wait for it to print `[+] Phase 3 Complete!`

---

## 🟢 Step 5: Phase 4 (Provisioning the Compute Nodes)
Now it is time to register your physical hardware and bring the cluster online!

1. In your laptop terminal, run:
```bash
python3 phase4_clients.py
```
2. The script will read your `nodes.txt` file, register their MAC addresses into the Warewulf DHCP server, and rebuild the network configurations.
3. Once the script finishes, it will prompt you with an `>>> ACTION REQUIRED` message.
4. **Power on your Compute Nodes (Slaves).**
5. Go to the BIOS/Boot Menu on your Compute Nodes and tell them to **Boot from Network (PXE)**.

### 🎉 Success!
Because the Compute Nodes are set to network boot, they will reach out looking for an OS. The Master Node will recognize their MAC addresses and instantly stream the Golden Image directly into their RAM. They will boot up and automatically register with the Slurm Job Scheduler. 

**Your HPC Cluster is now fully operational!**
