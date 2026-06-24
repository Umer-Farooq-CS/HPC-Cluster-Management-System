import { useNavigate } from 'react-router-dom'
import styles from './HomePage.module.css'

interface ProvisionCard {
  id: string
  title: string
  subtitle: string
  description: string
  icon: string
  badge: string
  route: string
  gradient: string
  glowClass: string
  steps: string[]
}

const PROVISION_CARDS: ProvisionCard[] = [
  {
    id: 'master',
    title: 'Master Node',
    subtitle: 'Head Node Setup',
    description:
      'Configure a fresh AlmaLinux 9 machine as the HPC cluster controller. Installs OpenHPC, Slurm, Warewulf 4, MariaDB, and all required services via automated SSH execution.',
    icon: '🖥️',
    badge: 'Phase 1–3',
    route: '/provision/master',
    gradient: 'master',
    glowClass: 'glowBlue',
    steps: [
      'NAT routing & internet sharing',
      'Base repos, EPEL & NTP setup',
      'Warewulf 4 provisioning server',
      'Golden Image (stateless OS)',
      'Slurm controller & Munge auth',
    ],
  },
  {
    id: 'slave',
    title: 'Compute Nodes',
    subtitle: 'Worker Node Registration',
    description:
      'Register bare-metal compute nodes into the cluster. Bind MAC addresses, assign provisioning IPs, and trigger PXE boot via Warewulf to load the stateless AlmaLinux image.',
    icon: '⚙️',
    badge: 'Phase 4',
    route: '/provision/slave',
    gradient: 'slave',
    glowClass: 'glowTeal',
    steps: [
      'Node MAC & IP registration',
      'DHCP binding via Warewulf',
      'ClusterShell group config',
      'Slurm partition assignment',
      'PXE boot & health check',
    ],
  },
  {
    id: 'ood',
    title: 'Open OnDemand',
    subtitle: 'HPC Web Portal',
    description:
      'Launch the Open OnDemand web portal to manage files, submit jobs, and access interactive desktop sessions (VNC, Jupyter) directly from your browser.',
    icon: '🌐',
    badge: 'Portal',
    route: '__ood__',
    gradient: 'master',
    glowClass: 'glowBlue',
    steps: [
      'SSO via Keycloak',
      'Slurm Job Submission',
      'Interactive VNC Sessions',
      'File Browser',
      'Shell Access',
    ],
  },
  {
    id: 'ansible',
    title: 'Ansible Runner',
    subtitle: 'Run Playbooks',
    description:
      'Dynamically discover and run infrastructure automation playbooks directly from the GUI, with real-time terminal output streaming.',
    icon: '⚙️',
    badge: 'Automation',
    route: '/ansible',
    gradient: 'slave',
    glowClass: 'glowTeal',
    steps: [
      'Discover playbooks',
      'Select script',
      'Execute via SSH',
      'Stream live logs',
      'Verify results',
    ],
  },
]

import { useAuth } from '../../context/AuthContext'

export default function HomePage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'super_admin'

  const visibleCards = PROVISION_CARDS.filter(card => {
    if (card.id === 'master' || card.id === 'slave') {
      return isAdmin;
    }
    return true;
  });

  return (
    <div className={styles.page}>
      {/* Ambient background glow */}
      <div className={styles.ambientGlow} aria-hidden="true" />

      {/* Hero section */}
      <section className={styles.hero} aria-labelledby="hero-heading">
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} aria-hidden="true" />
            HPC Cluster Management System
          </div>

          <h1 id="hero-heading" className={styles.heroTitle}>
            Provision Your
            <br />
            <span className={styles.heroTitleAccent}>HPC Cluster</span>
          </h1>

          <p className={styles.heroSubtitle}>
            Automate the full cluster bootstrap — from a blank machine to a running
            Slurm environment — with zero manual SSH commands.
          </p>

          {/* Architecture diagram (ASCII art styled) */}
          <div className={styles.archBadges}>
            {['AlmaLinux 9', 'Warewulf 4', 'OpenHPC 3.4', 'Slurm', 'MariaDB'].map(tech => (
              <span key={tech} className={styles.techBadge}>{tech}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Card section */}
      <section className={styles.cardSection} aria-labelledby="provision-heading">
        <h2 id="provision-heading" className={styles.sectionTitle}>
          {isAdmin ? "Select a Setup Mode" : "Cluster Services"}
        </h2>
        <p className={styles.sectionSubtitle}>
          {isAdmin 
            ? "Start with the Master Node, then register your Compute Nodes once the cluster controller is live."
            : "Access the Open OnDemand portal or check cluster health via Ansible automation."}
        </p>

        <div className={styles.cardGrid}>
          {visibleCards.map((card, index) => (
            <button
              key={card.id}
              id={`provision-card-${card.id}`}
              className={`${styles.card} ${styles[`card-${card.gradient}`]}`}
              onClick={() => {
                if (card.route === '__ood__') {
                  window.open(`https://192.168.10.2:8443/pun/sys/dashboard`, '_blank', 'noopener,noreferrer');
                } else {
                  navigate(card.route);
                }
              }}
              aria-label={`Set up ${card.title}: ${card.subtitle}`}
              style={{ animationDelay: `${index * 120}ms` }}
            >
              {/* Glow effect */}
              <div className={`${styles.cardGlow} ${styles[card.glowClass]}`} aria-hidden="true" />

              {/* Card header */}
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrap}>
                  <span className={styles.cardIcon} aria-hidden="true">{card.icon}</span>
                </div>
                <span className={styles.cardBadge}>{card.badge}</span>
              </div>

              {/* Card body */}
              <div className={styles.cardBody}>
                <p className={styles.cardSubtitle}>{card.subtitle}</p>
                <h3 className={styles.cardTitle}>{card.title}</h3>
                <p className={styles.cardDescription}>{card.description}</p>
              </div>

              {/* Steps preview */}
              <div className={styles.cardSteps}>
                <p className={styles.cardStepsLabel}>Automation Pipeline</p>
                <ol className={styles.stepList} role="list">
                  {card.steps.map((step, i) => (
                    <li key={i} className={styles.stepItem}>
                      <span className={styles.stepNumber}>{String(i + 1).padStart(2, '0')}</span>
                      <span className={styles.stepText}>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* CTA */}
              <div className={styles.cardFooter}>
                <span className={styles.ctaText}>Begin Setup</span>
                <span className={styles.ctaArrow} aria-hidden="true">→</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Status bar */}
      <section className={styles.statusBar} aria-label="Prerequisites">
        <div className={styles.statusBarInner}>
          <span className={styles.statusBarTitle}>Prerequisites</span>
          <div className={styles.statusItems}>
            {[
              { label: 'sshpass installed', ok: true },
              { label: 'Master Node powered on', ok: false },
              { label: 'Admin network (192.168.10.x)', ok: false },
              { label: 'Backend API running', ok: false },
            ].map(({ label, ok }) => (
              <div key={label} className={styles.statusItem}>
                <span
                  className={`${styles.statusItemDot} ${ok ? styles.statusOk : styles.statusPending}`}
                  aria-hidden="true"
                />
                <span className={styles.statusItemLabel}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
