import type { ClusterGroup } from './types'

export const DEFAULT_PIPELINE_STEPS = [
  {
    id: 'genders',
    label: 'Install utilities',
    detail: 'Genders & ClusterShell packages',
    status: 'idle' as const,
  },
  {
    id: 'ww_add',
    label: 'Register in Warewulf',
    detail: 'Add nodes with assigned image profiles',
    status: 'idle' as const,
  },
  {
    id: 'ww_overlay',
    label: 'Rebuild overlays',
    detail: 'Network & DNSMASQ lease configurations',
    status: 'idle' as const,
  },
  {
    id: 'slurm',
    label: 'Update Slurm config',
    detail: 'Write node entries to slurm.conf, restart daemon',
    status: 'idle' as const,
  },
  {
    id: 'clustershell',
    label: 'ClusterShell groups',
    detail: 'Map admin & compute groups',
    status: 'idle' as const,
  },
]

export const DEFAULT_IMAGES: Record<string, import('./types').ImageConfig> = {}

export const DEFAULT_NODES: import('./types').ComputeNode[] = []

export const DEFAULT_GROUPS: ClusterGroup[] = [
  { id: 'adm',     name: 'adm',     members: 'master',           autoSync: false },
  { id: 'compute', name: 'compute', members: '',                 autoSync: true  },
  { id: 'all',     name: 'all',     members: '@adm,@compute',   autoSync: false },
]

export const BLANK_IMAGE_CONFIG: import('./types').ImageConfig = {
  name: '',
  source: 'docker://ghcr.io/warewulf/warewulf-almalinux:9',
  fastestMirror: true,
  maxDownloads: 10,
  dnfTimeout: 5,
  minRate: 10000,
  excludePkgs: 'linux-firmware*',
  installEpel: true,
  enableCrb: true,
  installOhpc: true,
  packages: 'ohpc-base-compute, ohpc-slurm-client, chrony, lmod-ohpc, nhc-ohpc',
  enabledServices: 'munge, slurmd, chronyd',
  ntpServer: '192.168.20.1',
  makeStep: '1 -1',
  forceSync: true,
  memlockUnlimited: true,
  pamSlurmRestrict: true,
  syslogTarget: '192.168.10.2',
  syslogPort: 514,
  buildOverlays: true,
  forceDracut: true,
}
