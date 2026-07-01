import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { MasterConfig, WizardStep } from './types'
import { DEFAULT_MASTER_CONFIG } from './constants'
import NetworkConfigStep from './components/NetworkConfigStep'
import ServiceConfigStep from './components/ServiceConfigStep'
import WarewulfConfigStep from './components/WarewulfConfigStep'
import MasterDeployStep from './components/MasterDeployStep'
import styles from './MasterSetupPage.module.css'
import { useAuth } from '../../context/AuthContext'

export default function MasterSetupPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [activeStep, setActiveStep] = useState<WizardStep>('network')
  const [config, setConfig] = useState<MasterConfig>(DEFAULT_MASTER_CONFIG)
  
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const updateConfig = (updates: Partial<MasterConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }))
  }

  const handleLaunch = () => {
    setActiveStep('deploy')
    setIsRunning(true)
    setIsFinished(false)
    setLogs(['[SYSTEM] Opening WebSocket to Master deployment engine...'])

    const ws = new WebSocket(`wss://${window.location.hostname}/api/v1/master/deploy/ws?token=${token}`)

    ws.onopen = () => {
      setLogs(prev => [...prev, '[SYSTEM] Connected — sending provisioning configurations...'])
      ws.send(JSON.stringify(config))
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

  const getStepClass = (step: WizardStep, current: WizardStep) => {
    const order = ['network', 'services', 'warewulf', 'deploy']
    const stepIdx = order.indexOf(step)
    const currentIdx = order.indexOf(current)
    if (stepIdx < currentIdx) return `${styles.stepItem} ${styles.completed}`
    if (stepIdx === currentIdx) return `${styles.stepItem} ${styles.active}`
    return styles.stepItem
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Master Node Provisioning</h1>
        <p className={styles.subtitle}>
          Configure the primary orchestration server for the HPC cluster.
        </p>
      </header>

      <div className={styles.grid}>
        {/* Main Content Area */}
        <main>
          {activeStep === 'network' && (
            <NetworkConfigStep config={config} updateConfig={updateConfig} />
          )}
          {activeStep === 'services' && (
            <ServiceConfigStep config={config} updateConfig={updateConfig} />
          )}
          {activeStep === 'warewulf' && (
            <WarewulfConfigStep config={config} updateConfig={updateConfig} />
          )}
          {activeStep === 'deploy' && (
            <MasterDeployStep logs={logs} isRunning={isRunning} isFinished={isFinished} />
          )}

          {/* Navigation Footer */}
          <div className={styles.footer}>
            {activeStep !== 'network' && activeStep !== 'deploy' && (
              <button 
                className={styles.btnSecondary} 
                onClick={() => {
                  if (activeStep === 'services') setActiveStep('network')
                  if (activeStep === 'warewulf') setActiveStep('services')
                }}
              >
                ← Back
              </button>
            )}
            
            {activeStep === 'network' && (
              <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginLeft: 'auto' }} onClick={() => setActiveStep('services')}>
                Next: Services & Repositories →
              </button>
            )}
            {activeStep === 'services' && (
              <button className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginLeft: 'auto' }} onClick={() => setActiveStep('warewulf')}>
                Next: Warewulf Configuration →
              </button>
            )}
          </div>
        </main>

        {/* Sidebar Pipeline */}
        <aside className={styles.pipelinePanel}>
          <h3 className={styles.cardTitle}>Provisioning Pipeline</h3>
          
          <div className={styles.stepList}>
            <div className={getStepClass('network', activeStep)} onClick={() => {if(activeStep !== 'deploy') setActiveStep('network')}} style={{cursor: activeStep !== 'deploy' ? 'pointer' : 'default'}}>
              <div className={styles.stepIcon}>1</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Network & Aliases</div>
              </div>
            </div>
            
            <div className={getStepClass('services', activeStep)} onClick={() => {if(activeStep !== 'deploy') setActiveStep('services')}} style={{cursor: activeStep !== 'deploy' ? 'pointer' : 'default'}}>
              <div className={styles.stepIcon}>2</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Services & Repos</div>
              </div>
            </div>

            <div className={getStepClass('warewulf', activeStep)} onClick={() => {if(activeStep !== 'deploy') setActiveStep('warewulf')}} style={{cursor: activeStep !== 'deploy' ? 'pointer' : 'default'}}>
              <div className={styles.stepIcon}>3</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Warewulf Server</div>
              </div>
            </div>

            <div className={getStepClass('deploy', activeStep)}>
              <div className={styles.stepIcon}>4</div>
              <div className={styles.stepContent}>
                <div className={styles.stepLabel}>Execution</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            {activeStep === 'warewulf' && (
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`} 
                style={{ width: '100%' }}
                onClick={handleLaunch}
              >
                🚀 Launch Provisioning
              </button>
            )}
            {activeStep === 'deploy' && !isRunning && !isFinished && (
              <button 
                className={`${styles.btn} ${styles.btnPrimary}`} 
                style={{ width: '100%' }}
                onClick={handleLaunch}
              >
                🚀 Run Provisioning
              </button>
            )}
            {activeStep === 'deploy' && isRunning && (
              <button 
                className={`${styles.btn} ${styles.btnSecondary}`} 
                style={{ width: '100%' }}
                disabled
              >
                Deploying...
              </button>
            )}
             {activeStep === 'deploy' && isFinished && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                <button 
                  className={`${styles.btn} ${styles.btnPrimary}`} 
                  style={{ width: '100%', background: '#10b981', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)' }}
                  onClick={() => navigate('/provision/slave')}
                >
                  Proceed to Slave Nodes ➔
                </button>
                <button 
                  className={`${styles.btn} ${styles.btnSecondary}`} 
                  style={{ width: '100%' }}
                  onClick={() => setActiveStep('network')}
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
