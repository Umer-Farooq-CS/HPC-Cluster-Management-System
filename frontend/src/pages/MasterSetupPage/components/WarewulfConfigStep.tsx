
import type { MasterConfig } from '../types'
import styles from '../MasterSetupPage.module.css'

interface Props {
  config: MasterConfig
  updateConfig: (updates: Partial<MasterConfig>) => void
}

export default function WarewulfConfigStep({ config, updateConfig }: Props) {
  return (
    <div className={styles.stepContainer}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Warewulf Provisioning Server</h2>
          <p className={styles.cardDesc}>
            Warewulf acts as the PXE boot server, DHCP server, and image manager for the compute nodes.
          </p>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Provisioning Network (CIDR)</label>
            <input 
              className={styles.input}
              value={config.wwProvNetwork}
              onChange={e => updateConfig({ wwProvNetwork: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Netmask</label>
            <input 
              className={styles.input}
              value={config.wwNetmask}
              onChange={e => updateConfig({ wwNetmask: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>DHCP Range Start</label>
            <input 
              className={styles.input}
              value={config.wwDhcpStart}
              onChange={e => updateConfig({ wwDhcpStart: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>DHCP Range End</label>
            <input 
              className={styles.input}
              value={config.wwDhcpEnd}
              onChange={e => updateConfig({ wwDhcpEnd: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>DHCP Template</label>
            <input 
              className={styles.input}
              value={config.wwDhcpTemplate}
              onChange={e => updateConfig({ wwDhcpTemplate: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>System Limits</h2>
          <p className={styles.cardDesc}>
            Required for MPI fast RDMA operations without hitting OS memory lock limits.
          </p>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Soft Memlock Limit</label>
            <input 
              className={styles.input}
              value={config.memlockSoft}
              onChange={e => updateConfig({ memlockSoft: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Hard Memlock Limit</label>
            <input 
              className={styles.input}
              value={config.memlockHard}
              onChange={e => updateConfig({ memlockHard: e.target.value })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
