# Host Machine Network Setup Guide

Since you are deploying onto **bare-metal PCs** rather than virtual machines, you do **not** need to create a software network bridge (like `virbr0`). 

Instead, your Ubuntu laptop (the Bastion host) must be physically connected to the same network switch as the Master Node and logically configured to be on the same subnet.

Here is a step-by-step explanation of how the communication works and how to set it up.

## 1. The Physical Connection
All machines (the Ubuntu laptop, the Master Node, and the Compute Nodes) should be plugged into the same physical network switch using standard Ethernet cables. 

Because they are on the same switch, they are on the same Layer 2 physical network.

## 2. The Logical Connection (IP Subnet)
In `src/config.py` and during the manual OS installation, you assigned the Master Node the IP address:
**`192.168.0.2`** (with a subnet mask of `255.255.255.0` or `/24`).

For your Ubuntu laptop to SSH into `192.168.0.2`, your laptop's Ethernet adapter must also have an IP address in the `192.168.0.x` range. It cannot be `192.168.0.2` (since the Master is using that). 

You should assign your laptop a static IP like **`192.168.0.100`**.

## 3. Configuration Steps (Ubuntu Host)

You can set this static IP on your Ubuntu laptop either through the Graphical Interface or the Terminal.

### Method A: Graphical Interface (Recommended for Desktop)
1. Open your Ubuntu **Settings** and go to **Network**.
2. Find your **Wired** connection (Ethernet) and click the **Gear (⚙️)** icon to edit it.
3. Go to the **IPv4** tab.
4. Change the IPv4 Method from **Automatic (DHCP)** to **Manual**.
5. Add the following details:
   - **Address:** `192.168.0.100`
   - **Netmask:** `255.255.255.0`
   - **Gateway:** Leave blank (or set to `192.168.0.1` if you have a router on this switch providing internet).
6. Click **Apply** and then toggle the connection Off and On to apply the changes.

### Method B: Command Line (Using `nmcli`)
If you prefer the terminal, you can use NetworkManager's CLI to set the static IP.

1. Find your ethernet connection name (usually something like `Wired connection 1` or `enp3s0`):
   ```bash
   nmcli connection show
   ```
2. Modify the connection to use the static IP `192.168.0.100/24`:
   ```bash
   sudo nmcli con mod "Wired connection 1" ipv4.addresses 192.168.0.100/24
   sudo nmcli con mod "Wired connection 1" ipv4.method manual
   ```
3. Restart the connection:
   ```bash
   sudo nmcli con up "Wired connection 1"
   ```

## 4. Verification

Once your laptop has the IP `192.168.0.100` and the Master Node is booted with the IP `192.168.0.2`, you can test the connection by pinging the Master Node from your laptop's terminal:

```bash
ping 192.168.0.2
```

If you receive replies, the physical and logical networking is successful! You can now run the Python deployment scripts, and they will be able to SSH into the Master Node to orchestrate the cluster.
