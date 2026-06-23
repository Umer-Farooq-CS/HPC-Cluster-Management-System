# HPC Cluster Management System — Configuration Profiles

This document defines how cluster profiles are stored, structured, and validated by the application.

---

## 1. Multiple Profiles Storage Scheme

Configurations are persisted in the `backend/profiles/` directory.

- **`active_profile.json`**: A simple lockfile pointing to the current target profile.
  ```json
  {
    "active_profile": "production_lab.json"
  }
  ```
- **Individual Profile Files**: E.g., `production_lab.json`, `testing_rig.json`. Each file contains the full cluster parameters.

---

## 2. Profile Structure (`<profile_name>.json`)

Below is the configuration structure that the UI setup wizard reads and writes:

```json
{
  "name": "Production Lab Cluster",
  "description": "Primary research cluster using stateless compute nodes",
  "connection": {
    "master_ip": "192.168.10.2",
    "master_password": "hpc",
    "master_hostname": "master",
    "ssh_port": 22
  },
  "networking": {
    "admin_subnet": "192.168.10.0/24",
    "data_subnet": "192.168.30.0/24",
    "data_master_ip": "192.168.30.1",
    "prov_subnet": "192.168.20.0/24",
    "prov_master_ip": "192.168.20.1",
    "prov_dhcp_start": "192.168.20.10",
    "prov_dhcp_end": "192.168.20.100"
  },
  "warewulf": {
    "image_name": "almalinux-9",
    "image_source": "docker://ghcr.io/warewulf/warewulf-almalinux:9"
  },
  "slurm": {
    "cluster_name": "hpc-cluster",
    "partition_name": "normal",
    "max_time": "24:00:00",
    "nodes_default_sockets": 1,
    "nodes_default_cores": 4,
    "nodes_default_threads": 1
  },
  "gateway": {
    "internet_sharing": true,
    "wifi_interface": "wlo1"
  },
  "nodes": [
    {
      "hostname": "pc2",
      "mac": "D4:C9:EF:DB:19:3D",
      "ip": "192.168.20.10"
    },
    {
      "hostname": "pc3",
      "mac": "D4:C9:EF:D7:CD:F5",
      "ip": "192.168.20.11"
    }
  ]
}
```

---

## 3. Configuration Mapping Rules

When executing a phase, the configuration fields map directly to configuration files on the Master Node:

| Profile Config Field | Target Master Config File | Modifying Script Command |
|---|---|---|
| `networking.data_master_ip` | `/etc/NetworkManager/system-connections/` | `nmcli con mod "$CONN" +ipv4.addresses {data_master_ip}/24` |
| `networking.prov_master_ip` | `/etc/warewulf/warewulf.conf` | `yq -i '.ipaddr = "{prov_master_ip}"'` |
| `networking.prov_dhcp_start` | `/etc/warewulf/warewulf.conf` | `yq -i '.dhcp["range start"] = "{prov_dhcp_start}"'` |
| `networking.prov_dhcp_end` | `/etc/warewulf/warewulf.conf` | `yq -i '.dhcp["range end"] = "{prov_dhcp_end}"'` |
| `slurm.cluster_name` | `/etc/slurm/slurm.conf` | `ClusterName={cluster_name}` |
| `slurm.partition_name` | `/etc/slurm/slurm.conf` | `PartitionName={partition_name}` |

---

## 4. UI Validation Rules

To prevent syntax errors on remote servers, the frontend UI validates all settings prior to submission:

1. **IP Addresses / Subnets:** Must match standard IPv4 formats and CIDR notations (e.g. `192.168.20.0/24`).
2. **MAC Addresses:** Must follow standard hexadecimal format, separated by colons (e.g., `^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$`).
3. **Hostnames:** Must adhere to DNS naming rules (alphanumeric characters, hyphens; no underscores, no spaces).
4. **Range overlap:** Ensures `prov_dhcp_start` and `prov_dhcp_end` fall within the `prov_subnet` CIDR block.
