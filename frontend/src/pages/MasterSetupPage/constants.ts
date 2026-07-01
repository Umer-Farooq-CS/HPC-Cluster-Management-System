import type { MasterConfig } from './types'

export const DEFAULT_MASTER_CONFIG: MasterConfig = {
  masterIp: '192.168.10.2',
  masterPass: 'hpc',
  dataIp: '192.168.30.1',
  dataIpCidr: 24,
  provIp: '192.168.20.1',
  provIpCidr: 24,
  gateway: '192.168.10.1',
  dnsServers: '8.8.8.8 192.168.18.8',
  
  disableFirewall: true,
  enableCrb: true,
  installEpel: true,
  
  ntpLocalStratum: 10,
  ntpAllowRange: 'all',
  
  openHpcRepoUrl: 'http://repos.openhpc.community/OpenHPC/3/EL_9/x86_64/ohpc-release-3-1.el9.x86_64.rpm',
  installOhpcBase: true,
  installSlurmServer: true,
  
  wwProvNetwork: '192.168.20.0',
  wwNetmask: '255.255.255.0',
  wwDhcpStart: '192.168.20.10',
  wwDhcpEnd: '192.168.20.100',
  wwDhcpTemplate: 'static',
  
  memlockSoft: 'unlimited',
  memlockHard: 'unlimited',
}

export const MOCK_DEPLOY_LOGS = [
  '[SYSTEM] Opening WebSocket to deployment engine...',
  '[SYSTEM] Connected — starting Master Bootstrapping (MOCK)...',
  '====================================================',
  '=== PHASE 1: BOOTSTRAP MASTER NODE (MANUAL OS) ===',
  '====================================================',
  '[!] The automated PXE deployment has been replaced with a manual USB installation.',
  '[*] Waiting for SSH to become available on 192.168.10.2...',
  '[+] Master Node (192.168.10.2) is UP and accessible via SSH!',
  '====================================================',
  '=== PHASE 2: CONFIGURE MASTER NODE (OpenHPC) ===',
  '====================================================',
  '[*] Configuring Data and Provisioning Networks...',
  '  -> Modifying NetworkManager connection for data and provisioning IPs.',
  '  -> Gateway set. DNS updated.',
  '[*] Setting up Repositories, Firewall and NTP...',
  '  -> Disabling firewalld...',
  '  -> Installing EPEL and enabling CRB repository...',
  '  -> Configuring Chrony (local stratum 10, allow all)...',
  '[*] Installing OpenHPC and Slurm Controller...',
  '  -> Adding OpenHPC repo...',
  '  -> Installing ohpc-base and ohpc-slurm-server...',
  '  -> Bootstrapping slurm.conf with Master hostname...',
  '[*] Installing and Configuring Warewulf Provisioning Server...',
  '  -> Installing warewulf-ohpc, hwloc-ohpc, yq...',
  '  -> Updating warewulf.conf (DHCP: 192.168.20.10 - 192.168.20.100)...',
  '  -> Creating "nodes" profile with default gateway...',
  '  -> Setting memlock unlimited in limits.conf...',
  '[+] Master Node configuration complete.',
  '[SYSTEM] MOCK Deployment finished successfully!',
]
