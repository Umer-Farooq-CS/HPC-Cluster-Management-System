
import type { MasterConfig } from '../types'
import styles from '../MasterSetupPage.module.css'

interface Props {
  config: MasterConfig
  updateConfig: (updates: Partial<MasterConfig>) => void
}

export default function NetworkConfigStep({ config, updateConfig }: Props) {
  return (
    <div className={styles.stepContainer}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Phase 1: Admin Connectivity</h2>
          <p className={styles.cardDesc}>
            These settings correspond to the manual OS installation on the Master Node.
          </p>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Master Node IP (Admin)</label>
            <input 
              className={styles.input}
              value={config.masterIp}
              onChange={e => updateConfig({ masterIp: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Root Password</label>
            <input 
              className={styles.input}
              type="text"
              value={config.masterPass}
              onChange={e => updateConfig({ masterPass: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Phase 2: Network Aliasing</h2>
          <p className={styles.cardDesc}>
            The system will dynamically bind these networks to the same physical interface as the Admin IP.
          </p>
        </div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Data Network IP</label>
            <div className={styles.ipCidrWrapper}>
              <input 
                className={styles.ipInput}
                value={config.dataIp}
                onChange={e => updateConfig({ dataIp: e.target.value })}
                placeholder="192.168.30.1"
              />
              <span className={styles.cidrSeparator}>/</span>
              <input 
                className={styles.cidrInput}
                type="number"
                value={config.dataIpCidr}
                onChange={e => updateConfig({ dataIpCidr: Number(e.target.value) })}
                min="8" max="32"
              />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Provisioning Network IP</label>
            <div className={styles.ipCidrWrapper}>
              <input 
                className={styles.ipInput}
                value={config.provIp}
                onChange={e => updateConfig({ provIp: e.target.value })}
                placeholder="192.168.20.1"
              />
              <span className={styles.cidrSeparator}>/</span>
              <input 
                className={styles.cidrInput}
                type="number"
                value={config.provIpCidr}
                onChange={e => updateConfig({ provIpCidr: Number(e.target.value) })}
                min="8" max="32"
              />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>External Gateway (Internet)</label>
            <input 
              className={styles.input}
              value={config.gateway}
              onChange={e => updateConfig({ gateway: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>DNS Servers</label>
            <input 
              className={styles.input}
              value={config.dnsServers}
              onChange={e => updateConfig({ dnsServers: e.target.value })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
