import React, { useRef } from 'react'
import type { ComputeNode, ClusterGroup } from '../types'
import ConfirmModal from '../../../components/ConfirmModal/ConfirmModal'
import styles from './NodeRegistryStep.module.css'

// Validation regex
const HOSTNAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]$/
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/
const IP_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/

interface Props {
  nodes: ComputeNode[]
  setNodes: React.Dispatch<React.SetStateAction<ComputeNode[]>>
  groups: ClusterGroup[]
  setGroups: React.Dispatch<React.SetStateAction<ClusterGroup[]>>
  defaultImageName: string
  onNext: () => void
}

import { useKeycloak } from '@react-keycloak/web'

export default function NodeRegistryStep({ nodes, setNodes, groups, setGroups, defaultImageName, onNext }: Props) {
  const { keycloak } = useKeycloak()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newHostname, setNewHostname] = React.useState('')
  const [newMac, setNewMac] = React.useState('')
  const [newIp, setNewIp] = React.useState('')
  const [formError, setFormError] = React.useState('')

  const [conflictModalOpen, setConflictModalOpen] = React.useState(false)
  const [conflictData, setConflictData] = React.useState<any>(null)

  React.useEffect(() => {
    const fetchRegisteredNodes = async () => {
      try {
        const headers: Record<string, string> = {}
        if (keycloak.token) headers['Authorization'] = `Bearer ${keycloak.token}`

        const res = await fetch(`https://${window.location.hostname}/api/v1/slaves/registered`, { headers })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'success' && data.nodes?.length > 0) {
            setNodes(prev => {
              const existingMacs = new Set(prev.map(n => n.mac.toUpperCase()))
              const newNodes = data.nodes.filter((n: ComputeNode) => !existingMacs.has(n.mac.toUpperCase()))
              return [...prev, ...newNodes]
            })
          }
        }
      } catch (e) {
        console.error("Failed to fetch registered nodes", e)
      }
    }
    
    if (keycloak.token) {
      fetchRegisteredNodes()
    }
  }, [keycloak.token, setNodes])

  // ARP Discovery Mock State
  const [isScanning, setIsScanning] = React.useState(false)
  const [discoveredDevices, setDiscoveredDevices] = React.useState<{mac: string, ip: string}[]>([])
  const [rawArpOutput, setRawArpOutput] = React.useState<string[]>([])

  const scanNetwork = async () => {
    setIsScanning(true)
    try {
      const headers: Record<string, string> = {}
      if (keycloak.token) headers['Authorization'] = `Bearer ${keycloak.token}`

      const res = await fetch(`https://${window.location.hostname}/api/v1/slaves/arp`, { headers })
      if (!res.ok) throw new Error('Failed to fetch ARP data')
      const data = await res.json()
      if (data.status === 'success') {
        setDiscoveredDevices(data.devices)
        setRawArpOutput(data.rawOutput || [])
      } else {
        console.error("ARP fetch error:", data.message)
        setRawArpOutput(data.rawOutput || [data.message])
      }
    } catch (err) {
      console.error(err)
      alert('Could not connect to the backend scanner.')
    } finally {
      setIsScanning(false)
    }
  }

  // Inline edit buffers
  const [editHostname, setEditHostname] = React.useState('')
  const [editMac, setEditMac] = React.useState('')
  const [editIp, setEditIp] = React.useState('')

  const validate = (host: string, mac: string, ip: string): string => {
    if (!host.trim()) return 'Hostname is required.'
    if (!HOSTNAME_REGEX.test(host)) return 'Invalid hostname — use alphanumeric and hyphens only.'
    if (!mac.trim()) return 'MAC Address is required.'
    if (!MAC_REGEX.test(mac)) return 'Invalid MAC (e.g. D4:C9:EF:DB:19:3D).'
    if (!ip.trim()) return 'IP Address is required.'
    if (!IP_REGEX.test(ip)) return 'Invalid IP (e.g. 192.168.20.10).'
    return ''
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    const host = newHostname.trim()
    const mac = newMac.trim().toUpperCase()
    const ip = newIp.trim()

    const err = validate(host, mac, ip)
    if (err) { setFormError(err); return }

    const conflictingNode = nodes.find(n => 
      n.hostname.toLowerCase() === host.toLowerCase() || 
      n.mac === mac || 
      n.ip === ip
    )

    if (conflictingNode) {
      if (conflictingNode.isRegistered) {
        setConflictData({ conflictingNode, host, mac, ip })
        setConflictModalOpen(true)
      } else {
        setFormError(`Conflict with an existing entry in the table. Please edit it directly.`)
      }
      return
    }

    setNodes(prev => [...prev, { id: Date.now().toString(), hostname: host, mac, ip, assignedImage: defaultImageName }])
    setNewHostname(''); setNewMac(''); setNewIp('')
  }

  const handleDelete = (id: string) => setNodes(prev => prev.filter(n => n.id !== id))

  const startEdit = (node: ComputeNode) => {
    setNodes(prev => prev.map(n => ({ ...n, isEditing: n.id === node.id })))
    setEditHostname(node.hostname)
    setEditMac(node.mac)
    setEditIp(node.ip)
  }

  const cancelEdit = (id: string) => setNodes(prev => prev.map(n => n.id === id ? { ...n, isEditing: false } : n))

  const saveEdit = (id: string) => {
    const host = editHostname.trim()
    const mac = editMac.trim().toUpperCase()
    const ip = editIp.trim()
    const err = validate(host, mac, ip)
    if (err) { alert(err); return }
    if (nodes.some(n => n.id !== id && n.hostname.toLowerCase() === host.toLowerCase())) { alert(`Hostname "${host}" is taken.`); return }
    if (nodes.some(n => n.id !== id && n.ip === ip)) { alert(`IP "${ip}" is taken.`); return }
    setNodes(prev => prev.map(n => n.id === id ? { ...n, hostname: host, mac, ip, isEditing: false } : n))
  }

  // Import CSV Summary State
  interface ImportSummary {
    successCount: number
    duplicateCount: number
    invalidCount: number
    errorMsg?: string
  }
  const [importSummary, setImportSummary] = React.useState<ImportSummary | null>(null)

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (!text) return
      const parsed: ComputeNode[] = []
      let skipped = 0
      text.split('\n').forEach(line => {
        const l = line.trim()
        if (!l || l.startsWith('#')) return
        const [h, m, i] = l.split(',').map(s => s.trim())
        if (h && m && i && HOSTNAME_REGEX.test(h) && MAC_REGEX.test(m.toUpperCase()) && IP_REGEX.test(i)) {
          parsed.push({ id: Math.random().toString(), hostname: h, mac: m.toUpperCase(), ip: i, assignedImage: defaultImageName })
        } else skipped++
      })

      if (!parsed.length) {
        setImportSummary({
          successCount: 0,
          duplicateCount: 0,
          invalidCount: skipped,
          errorMsg: 'No valid rows found. File must contain comma-separated: hostname,mac,ip'
        })
        return
      }

      setNodes(prev => {
        const filtered = parsed.filter(p => !prev.some(e => e.hostname.toLowerCase() === p.hostname.toLowerCase() || e.ip === p.ip))
        const duplicateCount = parsed.length - filtered.length
        setImportSummary({
          successCount: filtered.length,
          duplicateCount,
          invalidCount: skipped
        })
        return [...prev, ...filtered]
      })
    }
    reader.readAsText(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }

  const handleConfirmConflict = () => {
    if (!conflictData) return
    const { conflictingNode, host, mac, ip } = conflictData
    setNodes(prev => prev.map(n => 
      n.id === conflictingNode.id 
        ? { ...n, hostname: host, mac, ip, assignedImage: defaultImageName }
        : n
    ))
    setNewHostname(''); setNewMac(''); setNewIp('')
    setConflictModalOpen(false)
    setConflictData(null)
  }

  const handleCancelConflict = () => {
    setConflictModalOpen(false)
    setConflictData(null)
  }

  return (
    <div className={styles.step}>
      <ConfirmModal
        isOpen={conflictModalOpen}
        title="Overwrite Existing Node?"
        message={`A node with Hostname, MAC, or IP is already registered in Warewulf (${conflictData?.conflictingNode?.hostname}). Do you want to overwrite it with these new settings?`}
        confirmText="Overwrite"
        onConfirm={handleConfirmConflict}
        onCancel={handleCancelConflict}
      />
      {/* ── Node Table ─────────────────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Compute Node Registry</h2>
            <p className={styles.cardDesc}>Enter the hostname, MAC address, and provisioning IP for each bare-metal node.</p>
          </div>
          <div className={styles.headerActions}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".csv,.txt" onChange={handleCSV} />
            <button className={styles.ghostBtn} onClick={() => fileInputRef.current?.click()}>
              📥 Import CSV
            </button>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Hostname</th>
                <th>MAC Address</th>
                <th>Provisioning IP</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {nodes.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No nodes registered yet. Use the form below or import a CSV.
                  </td>
                </tr>
              )}
              {nodes.map((node, idx) => (
                <tr key={node.id} className={node.isEditing ? styles.editRow : ''}>
                  <td className={styles.rowNum}>{idx + 1}</td>
                  <td>
                    {node.isEditing
                      ? <input className={styles.inlineInput} value={editHostname} onChange={e => setEditHostname(e.target.value)} />
                      : <span className={styles.hostnameChip}>{node.hostname}</span>}
                    {node.isRegistered && !node.isEditing && (
                      <span style={{ fontSize: '0.65rem', marginLeft: '6px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                        Registered
                      </span>
                    )}
                  </td>
                  <td>
                    {node.isEditing
                      ? <input className={styles.inlineInput} value={editMac} onChange={e => setEditMac(e.target.value)} />
                      : <code className={styles.mono}>{node.mac}</code>}
                  </td>
                  <td>
                    {node.isEditing
                      ? <input className={styles.inlineInput} value={editIp} onChange={e => setEditIp(e.target.value)} />
                      : <code className={styles.mono}>{node.ip}</code>}
                  </td>
                  <td>
                    {node.isEditing ? (
                      <div className={styles.actions}>
                        <button className={styles.saveBtn} onClick={() => saveEdit(node.id)}>Save</button>
                        <button className={styles.cancelBtn} onClick={() => cancelEdit(node.id)}>Cancel</button>
                      </div>
                    ) : (
                      <div className={styles.actions}>
                        <button className={styles.editBtn} onClick={() => startEdit(node)}>Edit</button>
                        <button className={styles.deleteBtn} onClick={() => handleDelete(node.id)}>Remove</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Add Form ────────────────────────────────────────── */}
      <section className={styles.card}>
        <h3 className={styles.formTitle}>Register New Node</h3>
        <form onSubmit={handleAdd}>
          <div className={styles.formGrid}>
            <div className={styles.fieldGroup}>
              <label htmlFor="new-hostname">Hostname</label>
              <input id="new-hostname" type="text" placeholder="pc4" value={newHostname} onChange={e => setNewHostname(e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="new-mac">MAC Address</label>
              <input id="new-mac" type="text" placeholder="D4:C9:EF:00:00:00" value={newMac} onChange={e => setNewMac(e.target.value)} />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="new-ip">IP Address</label>
              <input id="new-ip" type="text" placeholder="192.168.20.12" value={newIp} onChange={e => setNewIp(e.target.value)} />
            </div>
            <div className={styles.fieldGroup} style={{ alignSelf: 'flex-end' }}>
              <button type="submit" className={styles.addBtn}>+ Add Node</button>
            </div>
          </div>
          {formError && <p className={styles.error} role="alert">{formError}</p>}
        </form>
      </section>

      {/* ── ARP Discovery Section ───────────────────────────── */}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h3 className={styles.cardTitle}>Network Discovery (ARP)</h3>
            <p className={styles.cardDesc}>Select a discovered device to auto-fill the registration form.</p>
          </div>
          <button className={styles.ghostBtn} onClick={scanNetwork} disabled={isScanning}>
            {isScanning ? 'Scanning...' : '🔄 Refresh Scan'}
          </button>
        </div>
        <div className={styles.arpGrid}>
          {discoveredDevices.length === 0 && !isScanning && (
            <div className={styles.emptyArp}>No devices found.</div>
          )}
          {discoveredDevices.map((dev, idx) => (
            <button 
              key={idx} 
              className={styles.arpCard}
              onClick={() => {
                setNewMac(dev.mac)
                setNewIp(dev.ip)
              }}
              title="Click to use these values"
            >
              <div className={styles.arpInfo}>
                <span className={styles.arpLabel}>MAC:</span>
                <code className={styles.mono}>{dev.mac}</code>
              </div>
              <div className={styles.arpInfo}>
                <span className={styles.arpLabel}>IP:</span>
                <code className={styles.mono}>{dev.ip}</code>
              </div>
            </button>
          ))}
        </div>

        {rawArpOutput.length > 0 && (
          <div style={{ marginTop: '1rem', background: '#0f172a', padding: '0.75rem', borderRadius: '4px', border: '1px solid #1e293b' }}>
            <h4 style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Raw Master Node Output:</h4>
            <pre style={{ fontSize: '0.75rem', color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', maxHeight: '150px', overflowY: 'auto', margin: 0 }}>
              {rawArpOutput.join('\n')}
            </pre>
          </div>
        )}
      </section>

      {/* ── Cluster Groups Editor ──────────────────────────── */}
      <section className={styles.card} style={{ marginTop: '1.5rem' }}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>ClusterShell Groups</h2>
            <p className={styles.cardDesc}>
              Define node groups for parallel command execution. The <strong>compute</strong> group auto-updates when nodes are added.
            </p>
          </div>
          <button
            className={styles.addBtn}
            onClick={() => {
              const name = window.prompt('New group name (e.g. gpu):')
              const trimmed = name ? name.trim() : ''
              if (!trimmed) return
              if (groups.some(g => g.name === trimmed)) { alert(`Group "${trimmed}" already exists.`); return }
              setGroups(prev => [...prev, { id: Math.random().toString(), name: trimmed, members: '' }])
            }}
          >
            + Add Group
          </button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: '18%' }}>Group Name</th>
              <th className={styles.th}>Members</th>
              <th className={styles.th} style={{ width: '14%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <GroupRow
                key={g.id}
                group={g}
                onSave={(updated) => setGroups(prev => prev.map(x => x.id === g.id ? updated : x))}
                onDelete={() => setGroups(prev => prev.filter(x => x.id !== g.id))}
              />
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '1.5rem', opacity: 0.5 }}>No groups defined</td></tr>
            )}
          </tbody>
        </table>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          Use <code>@groupname</code> to reference other groups as members (e.g. <code>@adm,@compute</code>).
        </p>
      </section>

      {/* ── Info + Next ──────────────────────────────────────── */}
      <div className={styles.footer}>
        <div className={styles.tip}>
          <span className={styles.tipIcon}>💡</span>
          <span>Tip: MAC addresses can be found in your BIOS/UEFI or from DHCP leases on the switch.</span>
        </div>
        {nodes.length > 0 && (
          <button className={styles.nextBtn} onClick={onNext}>
            Next: Assign Boot Images →
          </button>
        )}
      </div>
      {/* ── CSV Import Summary Modal ─────────────────────────── */}
      {importSummary && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>CSV Import Summary</h3>
            
            {importSummary.errorMsg ? (
              <p className={styles.error} style={{ margin: '12px 0' }}>{importSummary.errorMsg}</p>
            ) : (
              <div className={styles.modalStats}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Successfully Imported:</span>
                  <span className={styles.statValue} style={{ color: 'var(--accent-secondary)' }}>
                    {importSummary.successCount} nodes
                  </span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Skipped (Duplicates):</span>
                  <span className={styles.statValue}>
                    {importSummary.duplicateCount} nodes
                  </span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Skipped (Invalid Format):</span>
                  <span className={styles.statValue} style={{ color: importSummary.invalidCount > 0 ? 'var(--accent-danger)' : 'inherit' }}>
                    {importSummary.invalidCount} lines
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button 
                className={styles.addBtn} 
                onClick={() => setImportSummary(null)}
                style={{ padding: '8px 24px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GroupRow sub-component ───────────────────────────────────
interface GroupRowProps {
  group: ClusterGroup
  onSave: (updated: ClusterGroup) => void
  onDelete: () => void
}

function GroupRow({ group, onSave, onDelete }: GroupRowProps) {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(group.name)
  const [members, setMembers] = React.useState(group.members)

  // Keep local state in sync when parent updates (e.g. autoSync compute group)
  React.useEffect(() => {
    if (!editing) {
      setName(group.name)
      setMembers(group.members)
    }
  }, [group.name, group.members, editing])

  if (editing) {
    return (
      <tr>
        <td className={styles.td}>
          <input
            className={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
            disabled={group.autoSync}
          />
        </td>
        <td className={styles.td}>
          <input
            className={styles.input}
            value={members}
            onChange={e => setMembers(e.target.value)}
            style={{ width: '100%' }}
            disabled={group.autoSync}
            placeholder={group.autoSync ? 'Auto-updated from node list' : 'pc2,pc3 or @compute'}
          />
        </td>
        <td className={styles.td}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className={styles.addBtn}
              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              onClick={() => { onSave({ ...group, name: name.trim(), members: members.trim() }); setEditing(false) }}
            >
              Save
            </button>
            <button
              className={styles.cancelBtn}
              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
              onClick={() => { setName(group.name); setMembers(group.members); setEditing(false) }}
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td className={styles.td}>
        <code style={{ fontSize: '0.85rem', color: 'var(--accent-primary)' }}>{group.name}</code>
        {group.autoSync && (
          <span style={{
            marginLeft: '6px', fontSize: '0.65rem', background: 'rgba(99,102,241,0.15)',
            color: 'var(--accent-primary)', borderRadius: '4px', padding: '1px 5px',
            verticalAlign: 'middle'
          }}>AUTO</span>
        )}
      </td>
      <td className={styles.td}>
        <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
          {group.members || <em style={{ opacity: 0.5 }}>empty — add nodes first</em>}
        </span>
      </td>
      <td className={styles.td}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={styles.addBtn}
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            className={styles.deleteBtn}
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
            onClick={() => { if (window.confirm(`Delete group "${group.name}"?`)) onDelete() }}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  )
}
