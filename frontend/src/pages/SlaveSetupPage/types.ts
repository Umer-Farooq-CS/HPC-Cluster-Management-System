/**
 * SlaveSetupPage — Shared Types
 * All interfaces used across the Compute Nodes provisioning sub-components.
 */

export interface ComputeNode {
  id: string
  hostname: string
  mac: string
  ip: string
  assignedImage: string
  // Slurm hardware topology (used to write slurm.conf NodeName line)
  sockets?: number
  coresPerSocket?: number
  threadsPerCore?: number
  isEditing?: boolean
  isRegistered?: boolean
  originalMac?: string
}

export interface PipelineStep {
  id: string
  label: string
  detail: string
  status: 'idle' | 'running' | 'success' | 'failed'
  message?: string
}

export interface ImageConfig {
  name: string
  source: string
  // DNF & Repositories
  fastestMirror: boolean
  maxDownloads: number
  dnfTimeout: number
  minRate: number
  excludePkgs: string
  installEpel: boolean
  enableCrb: boolean
  installOhpc: boolean
  // Packages & Services
  packages: string
  enabledServices: string
  // NTP
  ntpServer: string
  makeStep: string
  forceSync: boolean
  // Security
  memlockUnlimited: boolean
  pamSlurmRestrict: boolean
  // Logging
  syslogTarget: string
  syslogPort: number
  // Build
  buildOverlays: boolean
  forceDracut: boolean
}

export interface ClusterGroup {
  id: string
  name: string     // e.g. "compute" or "gpu"
  members: string  // e.g. "pc2,pc3" or "@adm,@compute"
  autoSync?: boolean // if true, members auto-update from nodes list
}

export type WizardStep = 'nodes' | 'assign-images' | 'create-image' | 'deploy'
