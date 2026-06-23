
import type { MasterConfig } from '../types'
import styles from '../MasterSetupPage.module.css'

interface Props {
  config: MasterConfig
  updateConfig: (updates: Partial<MasterConfig>) => void
}

export default function ServiceConfigStep({ config, updateConfig }: Props) {
  return (
    <div className={styles.stepContainer}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>System Security & Repositories</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleLabel}>Disable Firewalld</p>
              <p className={styles.toggleDesc}>Required for MPI and Slurm RPC communication across the cluster.</p>
            </div>
            <label className={styles.switch}>
              <input type="checkbox" checked={config.disableFirewall} onChange={e => updateConfig({ disableFirewall: e.target.checked })} />
              <span className={styles.slider}></span>
            </label>
          </div>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleLabel}>Enable CRB & Install EPEL</p>
              <p className={styles.toggleDesc}>Provides required development packages not included in minimal AlmaLinux.</p>
            </div>
            <label className={styles.switch}>
              <input type="checkbox" checked={config.enableCrb} onChange={e => updateConfig({ enableCrb: e.target.checked, installEpel: e.target.checked })} />
              <span className={styles.slider}></span>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>NTP (Chrony) Configuration</h2>
          <p className={styles.cardDesc}>Master Node must act as the primary time server for all compute nodes to prevent Munge auth errors.</p>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Local Stratum</label>
            <input 
              className={styles.input}
              type="number"
              value={config.ntpLocalStratum}
              onChange={e => updateConfig({ ntpLocalStratum: Number(e.target.value) })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Allow Range</label>
            <input 
              className={styles.input}
              value={config.ntpAllowRange}
              onChange={e => updateConfig({ ntpAllowRange: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>OpenHPC & Slurm Controller</h2>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
            <label className={styles.label}>OpenHPC Repository RPM URL</label>
            <input 
              className={styles.input}
              value={config.openHpcRepoUrl}
              onChange={e => updateConfig({ openHpcRepoUrl: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleLabel}>Install ohpc-base</p>
              <p className={styles.toggleDesc}>Provides core OpenHPC directory structures (/opt/ohpc).</p>
            </div>
            <label className={styles.switch}>
              <input type="checkbox" checked={config.installOhpcBase} onChange={e => updateConfig({ installOhpcBase: e.target.checked })} />
              <span className={styles.slider}></span>
            </label>
          </div>
          <div className={styles.toggleRow}>
            <div>
              <p className={styles.toggleLabel}>Install Slurm Controller</p>
              <p className={styles.toggleDesc}>Installs ohpc-slurm-server and sets SlurmctldHost to master node.</p>
            </div>
            <label className={styles.switch}>
              <input type="checkbox" checked={config.installSlurmServer} onChange={e => updateConfig({ installSlurmServer: e.target.checked })} />
              <span className={styles.slider}></span>
            </label>
          </div>
        </div>
      </section>
    </div>
  )
}
