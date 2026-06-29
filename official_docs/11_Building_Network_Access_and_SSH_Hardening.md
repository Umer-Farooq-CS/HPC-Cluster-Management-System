# Building Network Access & SSH Hardening Guide

**Goal 1:** Allow anyone connected to the building's `192.168.10.x` network to access the HPC frontend dashboard via a browser (ports 80 and 443).

**Goal 2:** Block SSH access (port 22) on the Master Node for everyone on the building network — except for your specific whitelisted machines (e.g., your laptop and your boss's computer).

---

## Understanding the Problem

Your current state:
- The Master Node (`192.168.10.2`) is connected to a D-Link switch on the building LAN.
- The Docker stack (Nginx, Frontend, Backend) is already running and accessible **to machines directly on the same switch segment**.
- People in other parts of the building (different offices, WiFi users, etc.) who are also on `192.168.10.x` **may or may not** be able to reach `192.168.10.2` depending on two things:
  1. Whether the Master Node has a **stable, predictable IP address** (vs. a DHCP lease that changes).
  2. Whether `firewalld` is **blocking or permitting** traffic on ports 80 and 443.
- SSH (port 22) is currently wide open to **everyone** on the network — this is the default AlmaLinux firewalld state and needs to be fixed.

### What We Are NOT Doing
- We are **not** exposing anything to the public internet.
- We are **not** changing router port-forwarding rules.
- We are **not** getting new SSL certificates.
- We are **not** modifying the Docker Compose stack or Nginx config.

Everything is solved at the **OS and firewall layer** on the Master Node itself.

---

## Pre-Flight Checklist

Before running any commands, gather these two pieces of information from the building network:

| What you need | How to get it |
|---|---|
| **Your laptop's IP** on the building LAN | Run `ip a` or `hostname -I` on your Ubuntu laptop |
| **Your boss's machine IP** on the building LAN | Run `ip a` or check their network settings |

These IPs will be used to forge the SSH whitelist. Write them down — you will need them in Step 2.

Example for this guide:
- Your laptop: `192.168.10.50`
- Boss's machine: `192.168.10.75`

---

## Step 1 — Establish a Stable IP (Avoiding IP Conflicts)

### The IP Conflict / ARP Collision Risk

> [!WARNING]
> **Yes, this is a major risk!** If you simply hardcode `192.168.10.2` on the Master Node, you risk an **IP Address Conflict (ARP Collision)** if:
> 1. The building router's DHCP server assigns `192.168.10.2` to another machine (like a colleague's laptop or phone).
> 2. Another machine has already been configured statically with `192.168.10.2`.
>
> If two devices share the same IP, network packets will randomly go to one or the other. This causes connection drops, lag, and complete access failures for both machines.

---

### Three Ways to Assign a Stable IP Safely

To prevent IP conflicts, choose one of the three strategies below depending on your level of access to the building network:

#### Strategy A: DHCP MAC Reservation (Recommended / Gold Standard)
If you have admin access to the building's main router (e.g., at `192.168.10.1`):
1. Keep the Master Node's connection set to **Automatic (DHCP)**.
2. Find the Master Node's MAC address by running:
   ```bash
   ip link show
   ```
3. Log into the router admin dashboard and look for **DHCP Static Leases**, **IP Reservation**, or **MAC Binding**.
4. Add a rule mapping the Master Node's MAC address to `192.168.10.2` (or another desired IP).
5. The router will ensure **no other machine is ever given this IP**, and the Master Node will always receive the same IP automatically without static OS changes.

#### Strategy B: Choose a Static IP Outside the DHCP Pool Range
Usually, building routers do not use the entire `192.168.10.2` to `192.168.10.254` range for dynamic DHCP leases. They might only assign `.100` to `.254` dynamically, leaving `.2` to `.99` free for static infrastructure like printers and servers.
1. Check the router configuration to find the **DHCP Pool Range**.
2. Pick an unused IP address outside that pool (for example, `192.168.10.15` if the pool starts at `.100`).
3. Follow the static IP configuration instructions below using that chosen IP.

#### Strategy C: Verify the IP is Vacant Before Assigning It
If you do not have router access and must assign a static IP:
1. Choose an IP (like `192.168.10.2` or a high IP like `192.168.10.250` which is less likely to be assigned).
2. Ping the IP from your laptop to see if it responds:
   ```bash
   ping -c 3 192.168.10.2
   ```
3. Run an ARP ping to detect silent hosts that ignore ICMP ping requests:
   ```bash
   sudo arping -c 3 -I eth0 192.168.10.2
   ```
4. If there is no response to either command, the IP is currently vacant. You can proceed to assign it, but note there is still a future risk if the DHCP server isn't aware of this assignment.

---

### How to Apply a Static IP via Command Line

If you choose **Strategy B or C** and need to hardcode the IP:

1. **Find your exact connection name:**
   ```bash
   nmcli con show
   ```

2. **Apply static configuration (example using 192.168.10.2):**
   ```bash
   # Replace 'Wired connection 1' with your actual connection name
   nmcli con mod "Wired connection 1" \
     ipv4.addresses 192.168.10.2/24 \
     ipv4.gateway 192.168.10.1 \
     ipv4.dns "8.8.8.8 8.8.4.4" \
     ipv4.method manual
   ```

3. **Bring the connection up with the new settings:**
   ```bash
   nmcli con up "Wired connection 1"
   ```

> **⚠️ WARNING:** The moment you run `nmcli con up`, your current SSH session to the Master Node **will freeze and disconnect.** This is normal. The network interface is restarting. Close the dead terminal and open a new one, then reconnect:
>
> ```bash
> ssh root@192.168.10.2
> ```

### Verify the static IP took effect

```bash
ip addr show
```

You should see the IP (e.g., `192.168.10.2/24`) listed under your ethernet interface. Also confirm internet still works (needed for package installs):

```bash
ping -c 3 8.8.8.8
```

---

## Step 2 — Configure Firewalld (The Core Fix)

This is the most important step. We will:
1. Ensure firewalld is active.
2. Open ports 80 and 443 for **everyone** on the building network.
3. **Remove** the blanket SSH rule that currently allows anyone to SSH in.
4. **Add back** SSH access only for your specific whitelisted IPs.
5. Reload the firewall to apply everything atomically.

### Step 2.1 — Ensure firewalld is running

```bash
systemctl enable --now firewalld
firewall-cmd --state
```

Expected output: `running`

### Step 2.2 — Open web ports universally

These rules allow any machine on the `192.168.10.x` network to reach the frontend:

```bash
firewall-cmd --permanent --zone=public --add-service=http
firewall-cmd --permanent --zone=public --add-service=https
```

### Step 2.3 — Remove the global SSH rule

This is the door-slamming step. After this rule is removed, **no one** can SSH in — until we add the whitelist rules in the next step.

```bash
firewall-cmd --permanent --zone=public --remove-service=ssh
```

> **⚠️ CRITICAL:** Do NOT run `firewall-cmd --reload` yet. If you reload now, you will lock yourself out before adding your whitelist. Complete Steps 2.4 and 2.5 first in the same session.

### Step 2.4 — Whitelist your laptop for SSH

Replace `192.168.10.50` with your actual laptop IP from the pre-flight checklist:

```bash
firewall-cmd --permanent --zone=public --add-rich-rule="
  rule family='ipv4'
  source address='192.168.10.50/32'
  service name='ssh'
  accept"
```

### Step 2.5 — Whitelist your boss's machine for SSH (optional)

Replace `192.168.10.75` with the boss's actual IP:

```bash
firewall-cmd --permanent --zone=public --add-rich-rule="
  rule family='ipv4'
  source address='192.168.10.75/32'
  service name='ssh'
  accept"
```

> **Tip:** If you or your boss are on a dynamic IP within the building (e.g., always in the range `.40` to `.60`), you can whitelist a small subnet range instead of a single host:
> ```bash
> source address='192.168.10.40/28'
> ```
> A `/28` covers 16 addresses (`.40` to `.55`). Less precise but more forgiving.

### Step 2.6 — Reload the firewall

This atomically applies all the permanent rules you have staged above. All changes go live simultaneously:

```bash
firewall-cmd --reload
```

### Step 2.7 — Verify the final ruleset

```bash
firewall-cmd --list-all --zone=public
```

The output should look like this:

```
public (active)
  target: default
  icmp-block-inversion: no
  interfaces: ens3
  sources:
  services: cockpit dhcpv6-client http https
  ports:
  protocols:
  forward: yes
  masquerade: no
  forward-ports:
  source-ports:
  icmp-blocks:
  rich rules:
        rule family="ipv4" source address="192.168.10.50/32" service name="ssh" accept
        rule family="ipv4" source address="192.168.10.75/32" service name="ssh" accept
```

**Key things to confirm:**
- `services:` line contains `http` and `https` but **NOT** `ssh`
- `rich rules:` section shows exactly your two whitelisted IPs

---

## Step 3 — Test Everything

### Test 1: Web access from a building machine

From **any machine on the `192.168.10.x` network** (a colleague's laptop, a meeting room PC, etc.) open a browser and navigate to:

```
http://192.168.10.2
```

You should be redirected to `https://192.168.10.2` and see the HPC dashboard login page. The browser may show a certificate warning (because it's a self-signed cert) — click "Advanced" → "Proceed anyway." This is expected and harmless for LAN use.

### Test 2: SSH from your whitelisted laptop

From **your Ubuntu laptop** (`192.168.10.50`):

```bash
ssh root@192.168.10.2
```

This should connect successfully and drop you into a shell on the Master Node.

### Test 3: SSH block from a non-whitelisted machine

From **any other machine** on the network (e.g., a colleague's laptop that is NOT in your whitelist):

```bash
ssh root@192.168.10.2
```

The connection should hang briefly and then time out with:

```
ssh: connect to host 192.168.10.2 port 22: Connection timed out
```

This confirms the firewall is silently dropping the packets (not even sending back a "refused" message, which would reveal the port exists).

---

## Troubleshooting

### "I can reach the site from the same desk but not from across the building"

This usually means the building has multiple network segments or VLANs and traffic between them isn't being routed. Check with your network admin whether all machines are truly on the same `192.168.10.x` subnet.

```bash
# On the remote machine, check its IP
ip a

# Then try to ping the Master Node
ping 192.168.10.2
```

If `ping` fails, it's a routing/VLAN issue, not a firewall issue.

### "I locked myself out of SSH"

If you accidentally reloaded the firewall before adding your whitelist, you need **physical console access** to the Master Node:

1. Sit down at the Master Node's monitor and keyboard.
2. Log in locally (not via SSH).
3. Re-add your whitelist rules:
   ```bash
   firewall-cmd --permanent --zone=public --add-rich-rule="rule family='ipv4' source address='192.168.10.50/32' service name='ssh' accept"
   firewall-cmd --reload
   ```

### "My IP changes and I keep getting locked out"

Option A — Reserve a DHCP static lease on the building router for your laptop's MAC address so it always gets the same IP.

Option B — Whitelist a slightly broader subnet:
```bash
# Whitelists .48 through .63
firewall-cmd --permanent --zone=public --add-rich-rule="rule family='ipv4' source address='192.168.10.48/28' service name='ssh' accept"
firewall-cmd --reload
```

---

## End Result

After completing all steps, the access matrix for the HPC cluster looks like this:

| Who | Source IP Example | Frontend (80/443) | SSH (22) |
|---|---|---|---|
| You (your laptop) | `192.168.10.50` | ✅ Accessible | ✅ Allowed |
| Your boss | `192.168.10.75` | ✅ Accessible | ✅ Allowed |
| Any colleague in the building | `192.168.10.x` (any) | ✅ Accessible | ❌ Silently Blocked |
| Any device outside the building | External IP | ❌ Not reachable (no port-forward exists) | ❌ Not reachable |

### Network Flow Diagram

```
  Building Network (192.168.10.x)
  ─────────────────────────────────────────────────────────
  
  Colleague's PC (192.168.10.30)
      │
      │  HTTP/HTTPS request to 192.168.10.2:443
      ▼
  ┌─────────────────────────────────────────────┐
  │         MASTER NODE  192.168.10.2           │
  │                                             │
  │  firewalld:                                 │
  │    Port 443 (HTTPS) ──► ALLOW (all)  ✅     │
  │    Port 80  (HTTP)  ──► ALLOW (all)  ✅     │
  │    Port 22  (SSH)   ──► DROP  (all)  ❌     │
  │    Port 22  from .50──► ALLOW        ✅     │
  │    Port 22  from .75──► ALLOW        ✅     │
  │                                             │
  │  Docker Stack:                              │
  │    Nginx → Frontend (React)                 │
  │    Nginx → Backend  (FastAPI)               │
  │    Nginx → Keycloak (Auth)                  │
  └─────────────────────────────────────────────┘
  
  Your Laptop (192.168.10.50)
      │
      ├──► HTTPS to port 443  ✅  (sees dashboard)
      └──► SSH  to port 22    ✅  (gets shell)
  
  Random Person (192.168.10.99)
      │
      ├──► HTTPS to port 443  ✅  (sees dashboard)
      └──► SSH  to port 22    ❌  (connection times out)
```

### What Changed on the System

| Component | Before | After |
|---|---|---|
| Master Node IP | Dynamic (DHCP, could change) | Static `192.168.10.2` (permanent) |
| firewalld — HTTP/HTTPS | May or may not have been open | Explicitly open for all |
| firewalld — SSH | Open for **everyone** (default) | Open only for whitelisted IPs |
| Docker stack / Nginx | Unchanged | Unchanged |
| Building router | Unchanged | Unchanged |
| SSL certificates | Unchanged | Unchanged |
