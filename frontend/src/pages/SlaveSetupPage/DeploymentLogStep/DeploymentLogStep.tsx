import { useEffect, useRef } from 'react'
import styles from './DeploymentLogStep.module.css'

interface Props {
  logs: string[]
  isRunning: boolean
  isFinished: boolean
}

export default function DeploymentLogStep({ logs, isRunning, isFinished }: Props) {
  const terminalEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'auto' })
    }
  }, [logs])

  return (
    <div className={styles.step}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.macButtons}>
              <span className={styles.macRed}></span>
              <span className={styles.macYellow}></span>
              <span className={styles.macGreen}></span>
            </div>
            <h2 className={styles.cardTitle}>Live Deployment Terminal</h2>
          </div>
          <div className={styles.headerRight}>
            {isRunning && <span className={styles.badgeRunning}>Executing Phase 4...</span>}
            {isFinished && <span className={styles.badgeFinished}>Deployment Complete</span>}
          </div>
        </div>

        <div className={styles.terminalContainer}>
          <div className={styles.terminal}>
            {logs.length === 0 ? (
              <div className={styles.emptyLog}>Waiting for deployment to start...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className={styles.logLine}>
                  {log}
                </div>
              ))
            )}
            {isRunning && (
              <div className={styles.logLine}>
                <span className={styles.cursor}>█</span>
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </section>
    </div>
  )
}
