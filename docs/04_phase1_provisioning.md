# Phase 1 — Cluster Provisioning Technical Reference

This document explains the steps performed during Phase 1 (Provisioning), which prepares the Master Node and boots the stateless compute nodes.

---

## 1. Steps Checklist

The provisioning UI displays progress through a step-by-step checklist. When the user clicks "Run Provisioning Pipeline", the backend sequentially executes:

```
[ Step 1.1: Local NAT Routing ]
       │  (Enables IP forwarding and masquerading on Bastion interface)
       ▼
[ Step 1.2: Poll Master SSH ]
       │  (Pings the Master Admin IP; waits until root SSH connection is live)
       ▼
[ Step 1.3: Configure Master Networks ]
       │  (Detects active interface, injects Data & Prov network aliases)
       ▼
[ Step 1.4: Install Base Repos & NTP ]
       │  (Enables CRB, EPEL, OpenHPC Repos; configures local Chrony stratum)
       ▼
[ Step 1.5: Install & Configure Warewulf ]
       │  (Installs wwctl; writes IP subnets and DHCP parameters)
       ▼
[ Step 1.6: Build Stateless OS Image ]
       │  (Imports OCI container, optimizes DNF inside image, installs client packages)
       ▼
[ Step 1.7: Apply Node Overlays ]
       │  (Configures clock-sync drop-ins, Munge keys, pam_slurm permissions)
       ▼
[ Step 1.8: Compile VNFS Image ]
       │  (Runs dracut inside image chroot; builds final bootable kernel tarball)
       ▼
[ Step 1.9: Register Compute Nodes ]
       │  (Reads registered nodes from profile; binds MAC/IP to DHCP configurations)
```

---

## 2. Dynamic Script Generation

Instead of using hardcoded scripts, the backend reads configuration values from the active profile and generates shell command strings dynamically:

### Example: Warewulf Configuration Generator
The backend reads values from `networking` and constructs the following execution block:
```bash
# Configure warewulf.conf variables dynamically
yq -i '.ipaddr = "192.168.20.1"' /etc/warewulf/warewulf.conf
yq -i '.network = "192.168.20.0"' /etc/warewulf/warewulf.conf
yq -i '.dhcp["range start"] = "192.168.20.10"' /etc/warewulf/warewulf.conf
yq -i '.dhcp["range end"] = "192.168.20.100"' /etc/warewulf/warewulf.conf
```

---

## 3. Node Registration Grid

Instead of editing `nodes.txt`, the web interface provides a dynamic node registry:

- **Interactive Input:** Admins can insert, update, or remove nodes dynamically using inline edit fields.
- **Hardware Bindings:** Each row defines the Hostname, MAC Address, and IP address.
- **CSV Import:** Admin can upload a `.csv` file containing the nodes list, which the backend reads, validates, and appends to the active JSON profile.
- **DHCP Generation:** Upon execution, the backend writes these node declarations directly into Warewulf:
  ```bash
  wwctl node add {hostname} --image {image_name} --profile nodes --netname default --ipaddr={ip_addr} --hwaddr={mac_addr}
  ```

---

## 4. Diagnostics & Health Validation

Once provisioning completes, the interface highlights the **"Run Diagnostic Check"** button. This leverages the local Ansible engine to execute `cluster_health.yml`:

- **Master Services:** Checks if `mariadb`, `slurmdbd`, `warewulfd`, `slurmctld`, `munge`, and `chronyd` are active.
- **Munge Security:** Verifies shared secret keys exist and match.
- **Compute Connectivity:** Pings compute nodes; checks if their local `slurmd` services are registered.
- **Memory lock constraints:** Ensures unlimited locking parameters are applied to the compute nodes (`ulimit -l`).
- **NTP Time Drift:** Checks time synchronization to prevent communication protocols errors.
