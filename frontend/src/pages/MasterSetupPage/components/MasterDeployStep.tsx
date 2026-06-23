import { useEffect, useRef } from 'react'
import styles from '../MasterSetupPage.module.css'

interface Props {
  logs: string[]
  isRunning: boolean
  isFinished: boolean
}

export default function MasterDeployStep({ logs, isRunning, isFinished }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className={styles.stepContainer}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Execution Terminal</h2>
          <p className={styles.cardDesc}>
            {isRunning ? 'Currently bootstrapping Master Node...' : isFinished ? 'Bootstrapping complete.' : 'Ready to begin deployment.'}
          </p>
        </div>

        {isFinished && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid #10b981',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <div style={{ fontSize: '2.5rem' }}>🎉</div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981', fontSize: '1.2rem' }}>Provisioning Successful!</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                The Master Node has been successfully configured. The cluster management services (Warewulf, Slurm, Chrony) are now active and ready. You may now proceed to provision the compute nodes.
              </p>
            </div>
          </div>
        )}

        <div className={styles.terminal} ref={terminalRef}>
          {logs.length === 0 && <span style={{ opacity: 0.5 }}>Waiting to launch...</span>}
          {logs.map((log, i) => {
            let className = styles.terminalLine
            if (log.startsWith('[SYSTEM]')) className += ` ${styles.logSystem}`
            if (log.startsWith('===')) className += ` ${styles.logHeader}`
            if (log.startsWith('[*]')) className += ` ${styles.logBullet}`
            return (
              <pre key={i} className={className}>
                {log}
              </pre>
            )
          })}
        </div>
      </section>
    </div>
  )
}
