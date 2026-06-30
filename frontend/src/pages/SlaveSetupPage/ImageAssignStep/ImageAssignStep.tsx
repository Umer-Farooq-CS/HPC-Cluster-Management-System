import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../../context/AuthContext'
import type { ComputeNode, ImageConfig } from '../types'
import { BLANK_IMAGE_CONFIG } from '../constants'
import styles from './ImageAssignStep.module.css'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1'

interface LiveImage {
  name: string
  nodes: string
  built: string
  size: string
}

interface Props {
  nodes: ComputeNode[]
  setNodes: React.Dispatch<React.SetStateAction<ComputeNode[]>>
  images: Record<string, ImageConfig>
  setImages: React.Dispatch<React.SetStateAction<Record<string, ImageConfig>>>
  onBack: () => void
}

export default function ImageAssignStep({ nodes, setNodes, images, setImages, onBack }: Props) {
  const { token } = useAuth()
  // ── Live images from Master Node ─────────────────────────────────────────
  const [liveImages, setLiveImages] = useState<LiveImage[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [rawListOutput, setRawListOutput] = useState<string[]>([])

  // ── Create-image UI state ────────────────────────────────────────────────
  const [isCreating, setIsCreating] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [creationMode, setCreationMode] = useState<'scratch' | 'clone'>('scratch')
  const [cloneSource, setCloneSource] = useState<string>('')
  const [imgConfig, setImgConfig] = useState<ImageConfig>({ ...BLANK_IMAGE_CONFIG })
  const [imgError, setImgError] = useState('')
  const [buildLogs, setBuildLogs] = useState<string[]>([])
  const logEndRef = useRef<HTMLDivElement>(null)

  // ── Fetch real images on mount ───────────────────────────────────────────
  const fetchImages = async () => {
    setLoadingImages(true)
    try {
      const res = await fetch(`${API}/images/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.status === 'success') {
        setLiveImages(data.images)
        setRawListOutput(data.rawOutput || [])
        // Sync into the shared images map so dropdowns work
        const synced: Record<string, ImageConfig> = {}
        for (const img of data.images) {
          synced[img.name] = images[img.name] ?? { ...BLANK_IMAGE_CONFIG, name: img.name, source: '' }
        }
        setImages(synced)
        if (!cloneSource && data.images.length > 0) {
          setCloneSource(data.images[0].name)
        }
      } else {
        setRawListOutput(data.rawOutput || [data.message])
      }
    } catch (err) {
      setRawListOutput([`[ERROR] Could not reach backend: ${err}`])
    } finally {
      setLoadingImages(false)
    }
  }

  useEffect(() => { fetchImages() }, [])

  // ── Auto-scroll build logs ───────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [buildLogs])

  // ── Node assignment ──────────────────────────────────────────────────────
  const handleAssign = (nodeId: string, imgName: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, assignedImage: imgName } : n))
  }

  // ── Delete image ─────────────────────────────────────────────────────────
  const handleDelete = async (name: string) => {
    if (!confirm(`Delete image "${name}" from the Master Node? This cannot be undone.`)) return
    try {
      const res = await fetch(`${API}/images/${name}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.status === 'success') {
        await fetchImages()
      } else {
        alert(`Failed to delete: ${data.message}`)
      }
    } catch (err) {
      alert(`Error: ${err}`)
    }
  }

  // ── Init create form ─────────────────────────────────────────────────────
  const handleInitCreate = () => {
    setImgError('')
    setBuildLogs([])
    if (creationMode === 'clone' && cloneSource && images[cloneSource]) {
      setImgConfig({ ...images[cloneSource], name: `${cloneSource}-custom` })
    } else {
      setImgConfig({ ...BLANK_IMAGE_CONFIG, name: '' })
    }
    setIsCreating(true)
  }

  // ── Launch build via Celery Task & WebSocket ─────────────────────────────
  const handleBuild = async (e: React.FormEvent) => {
    e.preventDefault()
    setImgError('')
    const cleanName = imgConfig.name.trim().toLowerCase().replace(/\s+/g, '-')
    if (!cleanName) { setImgError('Image Name is required.'); return }
    if (!imgConfig.source.trim()) { setImgError('Base container source is required.'); return }

    setIsBuilding(true)
    setBuildLogs([`[SYSTEM] Triggering backend build task...`])

    try {
      const res = await fetch(`${API}/images/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...imgConfig, name: cleanName })
      })
      const data = await res.json()
      
      if (data.status !== 'success') {
        setBuildLogs(prev => [...prev, `[ERROR] Build request failed: ${data.message}`])
        setIsBuilding(false)
        return
      }

      setBuildLogs(prev => [...prev, `[SYSTEM] Build task accepted. Task ID: ${data.task_id}`])
      
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/api/v1'
      const ws = new WebSocket(`${wsUrl}/logs/${data.task_id}?token=${token}`)

      ws.onmessage = (event) => {
        setBuildLogs(prev => [...prev, event.data])
      }

      ws.onclose = () => {
        setIsBuilding(false)
        setBuildLogs(prev => [...prev, '[SYSTEM] Build session closed.'])
        fetchImages()
      }

      ws.onerror = () => {
        setBuildLogs(prev => [...prev, '[ERROR] WebSocket log stream error. Is the backend running?'])
        setIsBuilding(false)
      }
    } catch (err) {
      setBuildLogs(prev => [...prev, `[ERROR] Failed to start build: ${err}`])
      setIsBuilding(false)
    }
  }

  // ── Create / Build view ───────────────────────────────────────────────────
  if (isCreating) {
    return (
      <div className={styles.step}>
        <form onSubmit={handleBuild} className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Configure New Boot Image</h2>
              <p className={styles.cardDesc}>
                {creationMode === 'clone' ? `Cloning settings from "${cloneSource}"` : 'Creating from scratch — all fields are the defaults from phase3_image.py'}
              </p>
            </div>
            <button type="button" className={styles.ghostBtn} onClick={() => setIsCreating(false)} disabled={isBuilding}>← Back</button>
          </div>

          {imgError && <p className={styles.error} role="alert">{imgError}</p>}

          <div className={styles.formGrid}>
            {/* Section 1 */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>1. Identification</h3>
              <div className={styles.fieldGroup}>
                <label htmlFor="img-name">Unique Image Identifier</label>
                <input id="img-name" value={imgConfig.name} onChange={e => setImgConfig({ ...imgConfig, name: e.target.value })} required disabled={isBuilding} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="img-src">Base Container Source (OCI URL)</label>
                <input id="img-src" value={imgConfig.source} onChange={e => setImgConfig({ ...imgConfig, source: e.target.value })} required disabled={isBuilding} />
              </div>
            </div>

            {/* Section 2 */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>2. DNF & Repositories</h3>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="fast-mirror" checked={imgConfig.fastestMirror} onChange={e => setImgConfig({ ...imgConfig, fastestMirror: e.target.checked })} disabled={isBuilding} />
                <label htmlFor="fast-mirror">Enable fastestmirror plugin</label>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="max-down">Max Downloads</label>
                  <input id="max-down" type="number" value={imgConfig.maxDownloads} onChange={e => setImgConfig({ ...imgConfig, maxDownloads: Number(e.target.value) })} min={1} max={20} disabled={isBuilding} />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="timeout">DNF Timeout (s)</label>
                  <input id="timeout" type="number" value={imgConfig.dnfTimeout} onChange={e => setImgConfig({ ...imgConfig, dnfTimeout: Number(e.target.value) })} min={1} disabled={isBuilding} />
                </div>
              </div>
              <div className={styles.fieldRow} style={{ marginTop: '8px' }}>
                <div className={styles.checkboxGroup}>
                  <input type="checkbox" id="epel" checked={imgConfig.installEpel} onChange={e => setImgConfig({ ...imgConfig, installEpel: e.target.checked })} disabled={isBuilding} />
                  <label htmlFor="epel">Install EPEL</label>
                </div>
                <div className={styles.checkboxGroup}>
                  <input type="checkbox" id="crb" checked={imgConfig.enableCrb} onChange={e => setImgConfig({ ...imgConfig, enableCrb: e.target.checked })} disabled={isBuilding} />
                  <label htmlFor="crb">Enable CRB</label>
                </div>
                <div className={styles.checkboxGroup}>
                  <input type="checkbox" id="ohpc" checked={imgConfig.installOhpc} onChange={e => setImgConfig({ ...imgConfig, installOhpc: e.target.checked })} disabled={isBuilding} />
                  <label htmlFor="ohpc">Install OpenHPC Repo</label>
                </div>
              </div>
            </div>

            {/* Section 3 */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>3. Packages & Services</h3>
              <div className={styles.fieldGroup}>
                <label htmlFor="packages">Injected Packages (comma-separated)</label>
                <textarea id="packages" rows={2} value={imgConfig.packages} onChange={e => setImgConfig({ ...imgConfig, packages: e.target.value })} disabled={isBuilding} />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="services">Services to Enable on Boot</label>
                <input id="services" type="text" value={imgConfig.enabledServices} onChange={e => setImgConfig({ ...imgConfig, enabledServices: e.target.value })} disabled={isBuilding} />
              </div>
              <div className={styles.checkboxGroup} style={{ marginTop: '4px' }}>
                <input type="checkbox" id="memlock" checked={imgConfig.memlockUnlimited} onChange={e => setImgConfig({ ...imgConfig, memlockUnlimited: e.target.checked })} disabled={isBuilding} />
                <label htmlFor="memlock">Unlimited memlock (required for MPI)</label>
              </div>
              <div className={styles.checkboxGroup}>
                <input type="checkbox" id="pam" checked={imgConfig.pamSlurmRestrict} onChange={e => setImgConfig({ ...imgConfig, pamSlurmRestrict: e.target.checked })} disabled={isBuilding} />
                <label htmlFor="pam">Restrict SSH to active Slurm jobs</label>
              </div>
            </div>

            {/* Section 4 */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>4. Network & Clock Services</h3>
              <div className={styles.fieldRow}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="ntp">NTP Server IP</label>
                  <input id="ntp" value={imgConfig.ntpServer} onChange={e => setImgConfig({ ...imgConfig, ntpServer: e.target.value })} disabled={isBuilding} />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="makestep">Chrony makestep</label>
                  <input id="makestep" value={imgConfig.makeStep} onChange={e => setImgConfig({ ...imgConfig, makeStep: e.target.value })} disabled={isBuilding} />
                </div>
              </div>
              <div className={styles.fieldRow} style={{ marginTop: '8px' }}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="syslog">Syslog Target IP</label>
                  <input id="syslog" value={imgConfig.syslogTarget} onChange={e => setImgConfig({ ...imgConfig, syslogTarget: e.target.value })} disabled={isBuilding} />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="syslogport">Syslog Port</label>
                  <input id="syslogport" type="number" value={imgConfig.syslogPort} onChange={e => setImgConfig({ ...imgConfig, syslogPort: Number(e.target.value) })} disabled={isBuilding} />
                </div>
              </div>
              <div className={styles.checkboxGroup} style={{ marginTop: '8px' }}>
                <input type="checkbox" id="dracut" checked={imgConfig.forceDracut} onChange={e => setImgConfig({ ...imgConfig, forceDracut: e.target.checked })} disabled={isBuilding} />
                <label htmlFor="dracut">Force Dracut initramfs rebuild</label>
              </div>
            </div>
          </div>

          <div className={styles.formFooter}>
            <button type="button" className={styles.ghostBtn} onClick={() => setIsCreating(false)} disabled={isBuilding}>Cancel</button>
            <button type="submit" className={styles.primaryBtn} disabled={isBuilding}>
              {isBuilding ? '⚙️ Building...' : '🔨 Build & Register Image'}
            </button>
          </div>
        </form>

        {/* Live build log terminal */}
        {buildLogs.length > 0 && (
          <div className={styles.card} style={{ marginTop: '1rem' }}>
            <h3 className={styles.sectionTitle} style={{ marginBottom: '0.5rem' }}>📡 Live Build Terminal</h3>
            <div style={{ background: '#0f172a', borderRadius: '6px', padding: '1rem', maxHeight: '360px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.6 }}>
              {buildLogs.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('[STEP') ? '#2dd4bf' : line.includes('ERROR') || line.includes('error') ? '#f87171' : line.startsWith('[SYSTEM]') ? '#a78bfa' : '#cbd5e1' }}>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Normal listing view ───────────────────────────────────────────────────
  return (
    <div className={styles.step}>

      {/* ── Images on Master Node ─────────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Boot Images on Master Node</h2>
            <p className={styles.cardDesc}>Images retrieved live from <code>wwctl image list</code>. Click an image to inspect it.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className={styles.ghostBtn} onClick={fetchImages} disabled={loadingImages}>
              {loadingImages ? '⏳ Fetching...' : '🔄 Refresh'}
            </button>
            <div className={styles.createTools}>
              <select className={styles.selectInput} value={creationMode} onChange={e => setCreationMode(e.target.value as any)}>
                <option value="scratch">New from Scratch</option>
                <option value="clone">Clone from...</option>
              </select>
              {creationMode === 'clone' && (
                <select className={styles.selectInput} value={cloneSource} onChange={e => setCloneSource(e.target.value)}>
                  {liveImages.map(img => <option key={img.name} value={img.name}>{img.name}</option>)}
                </select>
              )}
              <button className={styles.primaryBtn} onClick={handleInitCreate}>+ Create Image</button>
            </div>
          </div>
        </div>

        {liveImages.length === 0 && !loadingImages ? (
          <div className={styles.empty} style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>
            No images found on Master Node. Create one using the button above, or check your backend connection.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Image Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liveImages.map((img, idx) => (
                  <tr key={img.name}>
                    <td className={styles.rowNum}>{idx + 1}</td>
                    <td><span className={styles.hostnameChip}>{img.name}</span></td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(img.name)}
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rawListOutput.length > 0 && (
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ fontSize: '0.75rem', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>
              Raw output from <code>wwctl image list</code>
            </summary>
            <pre style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#94a3b8', background: '#0f172a', padding: '0.75rem', borderRadius: '4px', maxHeight: '120px', overflowY: 'auto' }}>
              {rawListOutput.join('\n')}
            </pre>
          </details>
        )}
      </section>

      {/* ── Node → Image assignment ───────────────────────────────────────── */}
      {nodes.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>Assign Images to Nodes</h2>
              <p className={styles.cardDesc}>Choose which boot image each compute node will use during PXE provisioning.</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Provisioning IP</th>
                  <th>MAC Address</th>
                  <th>Assigned Boot Image</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map(node => (
                  <tr key={node.id}>
                    <td><span className={styles.hostnameChip}>{node.hostname}</span></td>
                    <td><code className={styles.mono}>{node.ip}</code></td>
                    <td><code className={styles.mono}>{node.mac}</code></td>
                    <td>
                      {liveImages.length === 0 ? (
                        <span style={{ color: '#f87171', fontSize: '0.8rem' }}>No images available — create one above</span>
                      ) : (
                        <select
                          className={styles.selectInput}
                          value={node.assignedImage}
                          onChange={e => handleAssign(node.id, e.target.value)}
                        >
                          {liveImages.map(img => <option key={img.name} value={img.name}>{img.name}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className={styles.footer}>
        <button className={styles.ghostBtn} onClick={onBack}>← Back to Hostnames & IPs</button>
      </div>
    </div>
  )
}
