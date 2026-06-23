import type { PipelineStep } from '../types'
import styles from './PipelinePanel.module.css'

interface Props {
  steps: PipelineStep[]
  isRunning: boolean
  nodeCount: number
  onLaunch: () => void
}

const STATUS_ICON: Record<PipelineStep['status'], string> = {
  idle:    '○',
  running: '◉',
  success: '✓',
  failed:  '✕',
}

export default function PipelinePanel({ steps, isRunning, nodeCount, onLaunch }: Props) {
  const allDone = steps.every(s => s.status === 'success')

  return (
    <aside className={styles.panel}>

      {/* ── Launch Button ──────────────────────────────── */}
      <div className={styles.launchBlock}>
        <p className={styles.launchTitle}>Execute Phase 4 Pipeline</p>
        <p className={styles.launchDesc}>
          Registers {nodeCount} node{nodeCount !== 1 ? 's' : ''} in Warewulf, rebuilds overlays, and syncs Slurm.
        </p>
        <button
          className={`${styles.launchBtn} ${isRunning ? styles.launchBtnBusy : ''} ${allDone ? styles.launchBtnDone : ''}`}
          onClick={onLaunch}
          disabled={isRunning}
        >
          {isRunning ? (
            <><span className={styles.spinner} /> Running…</>
          ) : allDone ? (
            '✓ Completed'
          ) : (
            '🚀 Register & Configure Cluster'
          )}
        </button>
      </div>

      {/* ── Divider ───────────────────────────────────── */}
      <hr className={styles.divider} />

      {/* ── Pipeline Steps ────────────────────────────── */}
      <div className={styles.stepsBlock}>
        <p className={styles.stepsLabel}>Execution Checklist</p>
        <ol className={styles.stepList}>
          {steps.map((step, idx) => (
            <li
              key={step.id}
              className={`${styles.stepItem} ${styles[`status_${step.status}`]}`}
            >
              <div className={styles.stepLeft}>
                <span className={styles.stepNum}>{String(idx + 1).padStart(2, '0')}</span>
                <span className={`${styles.statusIcon} ${styles[`icon_${step.status}`]}`}>
                  {STATUS_ICON[step.status]}
                </span>
              </div>
              <div className={styles.stepRight}>
                <span className={styles.stepLabel}>{step.label}</span>
                {step.message
                  ? <span className={styles.stepMessage}>{step.message}</span>
                  : <span className={styles.stepDetail}>{step.detail}</span>
                }
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Post-launch guidance ──────────────────────── */}
      <div className={styles.guide}>
        <p className={styles.guideTitle}>After execution</p>
        <ol className={styles.guideList}>
          <li>Power on all compute nodes manually.</li>
          <li>Configure BIOS to boot from the provisioning NIC first.</li>
          <li>Nodes will PXE boot, pull the stateless image, and join the cluster automatically.</li>
        </ol>
      </div>

    </aside>
  )
}
