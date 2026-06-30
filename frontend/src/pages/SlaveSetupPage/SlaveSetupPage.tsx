import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ComputeNode, PipelineStep, ImageConfig, WizardStep, ClusterGroup } from './types'
import { DEFAULT_PIPELINE_STEPS, DEFAULT_IMAGES, DEFAULT_NODES, DEFAULT_GROUPS } from './constants'
import NodeRegistryStep from './NodeRegistryStep/NodeRegistryStep'
import ImageAssignStep from './ImageAssignStep/ImageAssignStep'
import DeploymentLogStep from './DeploymentLogStep/DeploymentLogStep'
import PipelinePanel from './PipelinePanel/PipelinePanel'
import ConfirmModal from '../../components/ConfirmModal/ConfirmModal'
import styles from './SlaveSetupPage.module.css'

import { useAuth } from '../../context/AuthContext'

export default function SlaveSetupPage() {
  const navigate = useNavigate()
  const { token } = useAuth()

  // App State
  const [activeStep, setActiveStep] = useState<WizardStep>('nodes')
  const [nodes, setNodes] = useState<ComputeNode[]>(DEFAULT_NODES)
  const [images, setImages] = useState<Record<string, ImageConfig>>(DEFAULT_IMAGES)
  const [groups, setGroups] = useState<ClusterGroup[]>(DEFAULT_GROUPS)

  // Auto-sync the 'compute' group whenever the node list changes
  useEffect(() => {
    const nodeList = nodes.map(n => n.hostname).join(',')
    setGroups(prev => prev.map(g => g.autoSync ? { ...g, members: nodeList } : g))
  }, [nodes])

  // Pipeline & Terminal State
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [steps, setSteps] = useState<PipelineStep[]>(DEFAULT_PIPELINE_STEPS)
  const [logs, setLogs] = useState<string[]>([])

  const [showDeployModal, setShowDeployModal] = useState(false)

  const handleLaunch = async () => {
    if (nodes.length === 0) {
      alert('Register at least one compute node before running deployment.')
      return
    }

    const hasRegistered = nodes.some(n => n.isRegistered)
    if (hasRegistered) {
      setShowDeployModal(true)
      return
    }

    executeDeployment(false)
  }

  const executeDeployment = async (overwrite: boolean) => {
    setShowDeployModal(false)
    setActiveStep('deploy')
    setIsRunning(true)
    setIsFinished(false)
    setSteps(prev => prev.map(s => ({ ...s, status: 'idle', message: undefined })))
    setLogs(['[SYSTEM] Triggering backend deployment task...'])

    const payload = {
      nodes: nodes.map(n => ({
        id: n.id,
        hostname: n.hostname,
        mac: n.mac,
        ip: n.ip,
        assignedImage: n.assignedImage,
        sockets: n.sockets,
        coresPerSocket: n.coresPerSocket,
        threadsPerCore: n.threadsPerCore,
      })),
      groups: groups.map(g => ({ name: g.name, members: g.members })),
      overwrite
    }

    try {
      const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1'
      const res = await fetch(`${API}/slaves/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      
      if (data.status !== 'success') {
        setLogs(prev => [...prev, `[ERROR] Deployment request failed: ${data.message}`])
        setIsRunning(false)
        return
      }

      setLogs(prev => [...prev, `[SYSTEM] Deployment task accepted. Task ID: ${data.task_id}`])

      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/api/v1'
      const ws = new WebSocket(`${wsUrl}/logs/${data.task_id}?token=${token}`)

      ws.onmessage = (event) => {
        const message = event.data
        setLogs(prev => [...prev, message])

        if (message.includes('[ERROR]') || message.includes('[CRITICAL ERROR]')) {
          setSteps(prev => {
            const runningIdx = prev.findIndex(s => s.status === 'running')
            if (runningIdx !== -1) {
              const next = [...prev]
              next[runningIdx] = { ...next[runningIdx], status: 'failed' }
              return next
            }
            return prev
          })
          setIsRunning(false)
          ws.close()
          return
        }

        if (message.includes('[STEP 1]')) {
          setSteps(prev => prev.map((s, idx) => idx === 0 ? { ...s, status: 'running' } : s))
        } else if (message.includes('[STEP 2]')) {
          setSteps(prev => prev.map((s, idx) => {
            if (idx === 0) return { ...s, status: 'success' }
            if (idx === 1) return { ...s, status: 'running' }
            return s
          }))
        } else if (message.includes('[STEP 3]')) {
          setSteps(prev => prev.map((s, idx) => {
            if (idx === 1) return { ...s, status: 'success', message: `Registered: ${nodes.map(n => n.hostname).join(', ')}` }
            if (idx === 2) return { ...s, status: 'running' }
            return s
          }))
        } else if (message.includes('[STEP 4]')) {
          setSteps(prev => prev.map((s, idx) => {
            if (idx === 2) return { ...s, status: 'success' }
            if (idx === 3) return { ...s, status: 'running' }
            return s
          }))
        } else if (message.includes('[STEP 5]')) {
          setSteps(prev => prev.map((s, idx) => {
            if (idx === 3) return { ...s, status: 'success', message: 'Injected node map into Slurm daemon' }
            if (idx === 4) return { ...s, status: 'running' }
            return s
          }))
        }
      }

      ws.onclose = () => {
        setSteps(prev => {
          const hasFailure = prev.some(s => s.status === 'failed')
          if (!hasFailure) {
             return prev.map((s, idx) => idx === 4 ? { ...s, status: 'success' } : s)
          }
          return prev
        })
        setIsRunning(false)
        setIsFinished(true)
      }
      
      ws.onerror = () => {
        setLogs(prev => [...prev, '[SYSTEM ERROR] WebSocket log stream error.'])
        setIsRunning(false)
      }
    } catch (err) {
      setLogs(prev => [...prev, `[ERROR] Failed to start deployment: ${err}`])
      setIsRunning(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        
        {/* ── Header & Stepper ───────────────────────────── */}
        <header className={styles.header}>
          <button className={styles.back} onClick={() => navigate('/')}>
            ← Back to dashboard
          </button>
          <div className={styles.badge}>Phase 4</div>
          <h1 className={styles.title}>Compute Nodes Setup</h1>
          <p className={styles.subtitle}>
            Register hardware nodes, assign stateless boot images, and provision the cluster.
          </p>

          <div className={styles.stepper}>
            <button 
              className={`${styles.stepIndicator} ${activeStep === 'nodes' ? styles.stepActive : ''}`}
              onClick={() => setActiveStep('nodes')}
              disabled={isRunning}
            >
              1. Hostnames & IPs
            </button>
            <span className={styles.stepChevron}>➔</span>
            <button 
              className={`${styles.stepIndicator} ${activeStep === 'assign-images' || activeStep === 'create-image' ? styles.stepActive : ''}`}
              onClick={() => {
                if (nodes.length === 0) { alert('Register a node first.'); return }
                setActiveStep('assign-images')
              }}
              disabled={isRunning || nodes.length === 0}
            >
              2. Boot Images & Build
            </button>
            <span className={styles.stepChevron}>➔</span>
            <button 
              className={`${styles.stepIndicator} ${activeStep === 'deploy' ? styles.stepActive : ''}`}
              onClick={() => {
                if (nodes.length === 0) { alert('Register a node first.'); return }
                setActiveStep('deploy')
              }}
              disabled={isRunning || nodes.length === 0}
            >
              3. Deployment
            </button>
          </div>
        </header>

        {/* ── Main Layout Grid ───────────────────────────── */}
        <div className={styles.layoutGrid}>
          
          {/* Left Column: Active Step Wizard */}
          <div className={styles.mainCol}>
            {activeStep === 'nodes' && (
              <NodeRegistryStep 
                nodes={nodes} 
                setNodes={setNodes}
                groups={groups}
                setGroups={setGroups}
                defaultImageName={Object.keys(images)[0]}
                onNext={() => setActiveStep('assign-images')}
              />
            )}
            
            {(activeStep === 'assign-images' || activeStep === 'create-image') && (
              <ImageAssignStep 
                nodes={nodes}
                setNodes={setNodes}
                images={images}
                setImages={setImages}
                onBack={() => setActiveStep('nodes')}
              />
            )}

            {activeStep === 'deploy' && (
              <DeploymentLogStep 
                logs={logs}
                isRunning={isRunning}
                isFinished={isFinished}
              />
            )}
          </div>

          {/* Right Column: Execution Pipeline */}
          <div className={styles.sideCol}>
            <PipelinePanel 
              steps={steps}
              isRunning={isRunning}
              nodeCount={nodes.length}
              onLaunch={handleLaunch}
            />
          </div>

        </div>
      </div>

      <ConfirmModal
        isOpen={showDeployModal}
        title="Existing Nodes Detected"
        message={
          <>
            <p>Some nodes in your list are already registered in Warewulf.</p>
            <p style={{ marginTop: '8px' }}>Do you want to cleanly overwrite (recreate) these existing nodes to apply the latest configurations?</p>
          </>
        }
        confirmText="Overwrite & Deploy"
        cancelText="Cancel"
        onConfirm={() => executeDeployment(true)}
        onCancel={() => setShowDeployModal(false)}
      />
    </div>
  )
}
