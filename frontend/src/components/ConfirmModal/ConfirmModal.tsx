import React from 'react'
import styles from './ConfirmModal.module.css'

interface Props {
  isOpen: boolean
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Confirm', 
  cancelText = 'Cancel', 
  onConfirm, 
  onCancel 
}: Props) {
  if (!isOpen) return null

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
        <div className={styles.modalHeader}>
          <span className={styles.warningIcon}>⚠️</span>
          <h3 className={styles.modalTitle}>{title}</h3>
        </div>
        <div className={styles.modalBody}>
          {message}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.btnCancel} onClick={onCancel}>
            {cancelText}
          </button>
          <button className={styles.btnConfirm} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
