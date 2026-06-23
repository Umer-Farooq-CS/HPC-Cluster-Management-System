import { useNavigate } from 'react-router-dom'
import styles from './NotFoundPage.module.css'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className={styles.page}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>Page Not Found</h1>
      <p className={styles.subtitle}>The route you're looking for doesn't exist.</p>
      <button className={styles.btn} onClick={() => navigate('/')}>
        ← Return Home
      </button>
    </div>
  )
}
