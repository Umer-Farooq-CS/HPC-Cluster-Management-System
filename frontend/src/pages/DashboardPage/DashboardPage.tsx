import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './DashboardPage.module.css'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [iframeUrl] = useState('http://192.168.10.2')
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState(false)

  // In a real application, you would check if the Slurm Web service is reachable
  useEffect(() => {
    // Basic connectivity check simulation
    const checkConnectivity = async () => {
      try {
        // Just simulating the wait time for the iframe
        setTimeout(() => setIsLoaded(true), 1000)
      } catch (err) {
        setError(true)
      }
    }
    checkConnectivity()
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/provision/jobs')}>
            ← Back to Jobs
          </button>
          <h1 className={styles.title}>Slurm Dashboard</h1>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.statusBadge}>
            <span className={styles.statusDot} />
            Slurm Web Active
          </span>
          <button className={styles.refreshBtn} onClick={() => { setIsLoaded(false); setTimeout(() => setIsLoaded(true), 500) }}>
            Refresh
          </button>
        </div>
      </header>

      {/* Telemetry Stats Header */}
      <div className={styles.statsRow}>
        <div className={`${styles.statCard} glass-panel`}>
          <span className={styles.statLabel}>Active Jobs</span>
          <div className={styles.statValue}>
            14 <span className={styles.statTrend}>+2</span>
          </div>
          <div className={styles.statSubtext}>4 Running • 10 Pending</div>
        </div>
        <div className={`${styles.statCard} glass-panel`}>
          <span className={styles.statLabel}>Node Health</span>
          <div className={styles.statValue}>4/5</div>
          <div className={styles.statSubtext}>1 Node Draining</div>
        </div>
        <div className={`${styles.statCard} glass-panel`}>
          <span className={styles.statLabel}>Cluster Utilization</span>
          <div className={styles.statValue}>88%</div>
          <div className={styles.statSubtext}>CPU Bound</div>
        </div>
        <div className={`${styles.statCard} glass-panel`}>
          <span className={styles.statLabel}>Est. Queue Time</span>
          <div className={styles.statValue}>~2m</div>
          <div className={styles.statSubtext}>Normal Partition</div>
        </div>
      </div>

      <div className={styles.iframeContainer}>
        {!isLoaded && !error && (
          <div className={styles.loader}>
            <div className={styles.spinner} />
            <p>Connecting to Slurm Web on Master Node (192.168.10.2)...</p>
          </div>
        )}
        
        {error && (
          <div className={styles.errorState}>
            <h3>Cannot Connect to Slurm Web</h3>
            <p>Ensure that the Slurm Web infrastructure is deployed on the Master Node via the Jobs & Monitoring setup page.</p>
            <button onClick={() => navigate('/provision/jobs')} className={styles.deployBtn}>
              Go to Deployment
            </button>
          </div>
        )}

        <iframe 
          src={iframeUrl}
          className={`${styles.iframe} ${isLoaded && !error ? styles.visible : ''}`}
          title="Slurm Web Dashboard"
          sandbox="allow-scripts allow-same-origin allow-forms"
          onLoad={() => setIsLoaded(true)}
          onError={() => setError(true)}
        />
      </div>
    </div>
  )
}
