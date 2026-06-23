#!/bin/bash
# This script enables IP forwarding and NAT on the Bastion Host (Ubuntu laptop)
# so the Master Node can access the internet to download OpenHPC and Slurm packages.

# Find the interface connected to the internet (default route)
INTERNET_IFACE=$(ip route | grep default | awk '{print $5}')

# Find the interface connected to the cluster (192.168.10.x subnet)
CLUSTER_IFACE=$(ip -o -4 addr show | grep '192.168.10.' | awk '{print $2}' | head -n 1)

if [ -z "$INTERNET_IFACE" ]; then
    echo "[-] Could not find an active internet connection. Please connect to Wi-Fi/Ethernet."
    exit 1
fi

if [ -z "$CLUSTER_IFACE" ]; then
    echo "[-] Could not find the cluster interface. Ensure your laptop has an IP like 192.168.10.100"
    exit 1
fi

echo "[*] Enabling Internet Sharing..."
echo "    -> Internet Interface: $INTERNET_IFACE"
echo "    -> Cluster Interface:  $CLUSTER_IFACE"

# 1. Enable IP Forwarding
echo "1" | sudo tee /proc/sys/net/ipv4/ip_forward > /dev/null
sudo sysctl -w net.ipv4.ip_forward=1 > /dev/null

# 2. Configure NAT (Masquerading)
sudo iptables -t nat -A POSTROUTING -o $INTERNET_IFACE -j MASQUERADE
sudo iptables -A FORWARD -i $CLUSTER_IFACE -o $INTERNET_IFACE -j ACCEPT
sudo iptables -A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

echo "[+] Internet sharing enabled successfully!"
echo "[+] The Master Node will now be able to reach the internet through this laptop."
