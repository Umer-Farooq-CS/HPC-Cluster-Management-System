import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import styles from '../MasterSetupPage/MasterSetupPage.module.css'

export default function BastionSetupPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [teleportDomain, setTeleportDomain] = useState('hpc.local')
  const [teleportEmail, setTeleportEmail] = useState('admin@hpc.local')
  const [adminIp, setAdminIp] = useState('192.168.10.100')
  
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const handleLaunch = () => {
    setIsRunning(true)
    setIsFinished(false)
    setLogs(['[SYSTEM] Opening WebSocket to Bastion deployment engine...'])

    const ws = new WebSocket(`wss://${window.location.hostname}/api/v1/bastion/deploy/ws?token=${token}`)

    ws.onopen = () => {
      setLogs(prev => [...prev, '[SYSTEM] Connected — sending provisioning configurations...'])
      ws.send(JSON.stringify({ teleportDomain, teleportEmail, adminIp }))
    }

    ws.onerror = () => {
      setLogs(prev => [...prev, '[SYSTEM ERROR] WebSocket connection failed. Please ensure the backend is running.'])
      setIsRunning(false)
    }

    ws.onmessage = (event) => {
      const message = event.data
      setLogs(prev => [...prev, message])
    }

    ws.onclose = () => {
      setIsRunning(false)
      setIsFinished(true)
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Bastion Host Setup</h1>
        <p className={styles.subtitle}>
          Automate the installation of Teleport and secure the firewall on this server.
        </p>
      </header>

      <div className={styles.grid}>
        <main>
          <div className={styles.formSection}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Configuration</h2>
              
              <div className={styles.inputGroup}>
                <label className={styles.label}>Teleport Domain Name</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  value={teleportDomain} 
                  onChange={(e) => setTeleportDomain(e.target.value)} 
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Admin Email for Let's Encrypt</label>
                <input 
                  type="email" 
                  className={styles.input} 
                  value={teleportEmail} 
                  onChange={(e) => setTeleportEmail(e.target.value)} 
                />
              </div>
              
              <div className={styles.inputGroup}>
                <label className={styles.label}>Admin Laptop IP (For SSH Access)</label>
                <input 
                  type="text" 
                  className={styles.input} 
                  value={adminIp} 
                  onChange={(e) => setAdminIp(e.target.value)} 
                />
              </div>
            </div>

            <div className={styles.card} style={{ marginTop: '2rem' }}>
              <h2 className={styles.cardTitle}>Execution Logs</h2>
              <div className={styles.terminal}>
                {logs.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>Waiting to start...</span>
                ) : (
                  logs.map((line, idx) => (
                    <div key={idx} className={styles.logLine}>{line}</div>
                  ))
                )}
                {isRunning && <div className={styles.blinkingCursor}>_</div>}
              </div>
            </div>
          </div>
        </main>

        <aside className={styles.pipelinePanel}>
          <h3 className={styles.cardTitle}>Provisioning Actions</h3>
          <div style={{ marginTop: '2rem' }}>
            {!isRunning && !isFinished && (
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`} 
                style={{ width: '100%' }}
                onClick={handleLaunch}
              >
                🚀 Deploy Bastion Settings
              </button>
            )}
            {isRunning && (
              <button 
                className={`${styles.btn} ${styles.btnSecondary}`} 
                style={{ width: '100%' }}
                disabled
              >
                Deploying...
              </button>
            )}
             {isFinished && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                <button 
                  className={`${styles.btn} ${styles.btnPrimary}`} 
                  style={{ width: '100%', background: '#10b981', borderColor: '#10b981' }}
                  onClick={() => navigate('/provision/master')}
                >
                  🚀 Proceed to Master Node
                </button>
                <button 
                  className={`${styles.btn} ${styles.btnSecondary}`} 
                  style={{ width: '100%' }}
                  onClick={() => setIsFinished(false)}
                >
                  Start Over
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
