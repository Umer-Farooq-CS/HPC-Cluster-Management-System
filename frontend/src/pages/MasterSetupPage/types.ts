export interface MasterConfig {
  // Phase 1 / Network
  masterIp: string;
  masterPass: string;
  dataIp: string;
  dataIpCidr: number;
  provIp: string;
  provIpCidr: number;
  gateway: string;
  dnsServers: string;
  
  // Phase 2 / Services
  disableFirewall: boolean;
  enableCrb: boolean;
  installEpel: boolean;
  
  // NTP (Chrony)
  ntpLocalStratum: number;
  ntpAllowRange: string;
  
  // Slurm & OpenHPC
  openHpcRepoUrl: string;
  installOhpcBase: boolean;
  installSlurmServer: boolean;
  
  // Warewulf
  wwProvNetwork: string;
  wwNetmask: string;
  wwDhcpStart: string;
  wwDhcpEnd: string;
  wwDhcpTemplate: string;
  
  // System Limits
  memlockSoft: string;
  memlockHard: string;
}

export type WizardStep = 'network' | 'services' | 'warewulf' | 'deploy'
