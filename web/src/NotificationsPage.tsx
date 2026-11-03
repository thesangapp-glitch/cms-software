import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Bell, Check, Loader2, RefreshCw, Search, Send, Smartphone, Users, X } from 'lucide-react'
import './notifications.css'
import {
  listProgramNotifications, notificationError, notificationStatusLabels, previewProgramNotification, sendProgramNotification,
  type NotificationAudience, type ProgramNotification,
} from './lib/programNotifications'

type AudiencePerson = {
  id: string; programId: string; fullName: string; email: string; phone?: string
  programRoleId?: string; programRoleName?: string; kind: string
  accessStatus?: string; rosterStatus?: string
}
type Props = {
  orgId: string
  program: { id: string; name: string }
  events: Array<{ id: string; name: string; programId: string }>
  people: AudiencePerson[]
  roles: Array<{ id: string; name: string }>
  scopedEventId?: string
}

const audienceOptions = [
  { value: 'all', label: 'All active people', description: 'Everyone in this program who can receive a push.' },
  { value: 'roles', label: 'Program roles', description: 'Choose participants, speakers, visitors, or other roles.' },
  { value: 'events', label: 'Event access', description: 'People allowed into one or more selected events.' },
  { value: 'people', label: 'Choose people manually', description: 'Search the roster and select individual people.' },
] as const
const emptyAudience = (): NotificationAudience => ({ mode: 'all', roleIds: [], eventIds: [], eventRoleIds: [], personIds: [] })
const toggleId = (ids: string[], id: string, checked: boolean) => checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id)

export default function NotificationsPage({ orgId, program, events, people, roles, scopedEventId }: Props) {
  const [audience, setAudience] = useState<NotificationAudience>(emptyAudience)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [preview, setPreview] = useState<ProgramNotification | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'send' | 'status' | ''>('')
  const requestBusy = useRef(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [history, setHistory] = useState<ProgramNotification[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(() => sessionStorage.getItem(`sang-notification:${orgId}:${program.id}`))
  const confirmRef = useRef<HTMLDivElement>(null)
  const storageKey = `sang-notification:${orgId}:${program.id}`
  const activePeople = people.filter((person) => person.programId === program.id && !['blocked', 'removed', 'revoked', 'cancelled'].includes(person.accessStatus || person.rosterStatus || 'active'))
  const visiblePeople = activePeople.filter((person) => (roleFilter === 'all' || (person.programRoleId || person.kind) === roleFilter)
    && `${person.fullName} ${person.email} ${person.phone || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
  const allVisibleSelected = visiblePeople.length > 0 && visiblePeople.every((person) => audience.personIds.includes(person.id))
  const selectedOutsideFilter = audience.personIds.filter((id) => !visiblePeople.some((person) => person.id === id)).length
  const locked = Boolean(busy) || Boolean(pendingId)
  const selectionValid = audience.mode === 'all' || (audience.mode === 'roles' ? audience.roleIds.length > 0 : audience.mode === 'events' ? audience.eventIds.length > 0 : audience.personIds.length > 0)

  const refreshHistory = useCallback(async () => {
    setHistoryBusy(true)
    setHistoryError('')
    try { setHistory((await listProgramNotifications({ orgId, programId: program.id })).data.notifications) }
    catch (failure) { setHistoryError(notificationError(failure)) }
    finally { setHistoryBusy(false) }
  }, [orgId, program.id])
  useEffect(() => { void refreshHistory() }, [refreshHistory])

  useEffect(() => {
    if (!confirmOpen) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !requestBusy.current) setConfirmOpen(false)
      if (event.key !== 'Tab') return
      const controls = confirmRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')
      if (!controls?.length) { event.preventDefault(); return }
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === confirmRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === confirmRef.current)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus() }
  }, [confirmOpen])

  function updateAudience(next: NotificationAudience) { setAudience(next); setPreview(null); setError(''); setNotice('') }

  function audienceDescription(value: NotificationAudience) {
    if (value.mode === 'all') return scopedEventId ? 'All active people in your assigned event' : 'All active people in this program'
    if (value.mode === 'people') return `${value.personIds.length} manually selected people`
    if (value.mode === 'roles') return `Program roles: ${value.roleIds.map((id) => roles.find((role) => role.id === id)?.name || id).join(', ')}`
    return `Events: ${value.eventIds.map((id) => events.find((event) => event.id === id)?.name || id).join(', ')}${value.eventRoleIds.length ? ` · Roles: ${value.eventRoleIds.map((id) => roles.find((role) => role.id === id)?.name || id).join(', ')}` : ''}`
  }

  async function review(event: FormEvent) {
    event.preventDefault()
    if (requestBusy.current || pendingId || !selectionValid) return
    requestBusy.current = true
    setBusy('preview'); setError(''); setNotice(''); setPreview(null)
    try {
      const result = (await previewProgramNotification({ orgId, programId: program.id, title, body, audience })).data
      setPreview(result)
      setConfirmOpen(true)
    } catch (failure) { setError(notificationError(failure)) }
    finally { requestBusy.current = false; setBusy('') }
  }

  function finishAttempt(result: ProgramNotification) {
    setPreview(result)
    if (result.status === 'sending') {
      setConfirmOpen(false)
      setNotice('The send is still processing. Check its status before starting another notification.')
      return
    }
    sessionStorage.removeItem(storageKey)
    setPendingId(null)
    setConfirmOpen(false)
    const accepted = result.result?.acceptedUsers || 0
    setNotice(result.status === 'uncertain'
      ? 'Some delivery results could not be confirmed. Check history before creating another notification; people may already have received it.'
      : `${notificationStatusLabels[result.status]}. ${accepted} ${accepted === 1 ? 'person' : 'people'} accepted by the push service${result.result?.failedDevices ? `; ${result.result.failedDevices} device sends failed` : ''}.`)
    void refreshHistory()
  }

  async function send() {
    if (!preview || requestBusy.current || pendingId || preview.status !== 'draft') return
    requestBusy.current = true
    setBusy('send'); setError('')
    sessionStorage.setItem(storageKey, preview.id)
    setPendingId(preview.id)
    try { finishAttempt((await sendProgramNotification({ orgId, programId: program.id, notificationId: preview.id })).data) }
    catch (failure) {
      const code = (failure as { code?: string })?.code
      if (['functions/failed-precondition', 'functions/permission-denied', 'functions/invalid-argument', 'functions/not-found'].includes(code || '')) {
        sessionStorage.removeItem(storageKey); setPendingId(null); setPreview(null); setConfirmOpen(false)
        setError(notificationError(failure))
      } else {
        setConfirmOpen(false)
        setError('The send result could not be confirmed. Check send status before starting another notification to avoid duplicates.')
      }
    } finally { requestBusy.current = false; setBusy('') }
  }

  async function checkStatus() {
    if (!pendingId || requestBusy.current) return
    requestBusy.current = true; setBusy('status'); setError('')
    try {
      const result = (await listProgramNotifications({ orgId, programId: program.id, notificationId: pendingId })).data.notifications[0]
      if (result.status === 'draft') {
        // Keep the same immutable preview ID. A late request and a retry still
        // compete for the same server claim, so neither can cause a duplicate.
        sessionStorage.removeItem(storageKey); setPendingId(null)
        setPreview(result); setConfirmOpen(true)
      } else { finishAttempt(result) }
    } catch (failure) { setError(notificationError(failure)) }
    finally { requestBusy.current = false; setBusy('') }
  }

  return (
    <>
      <header className="page-header"><div className="page-header-text"><h1>Notifications</h1><p>Send an update to people attending {program.name}.</p></div></header>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-success" role="status">{notice}</p> : null}
      {pendingId ? <div className="notification-pending"><span>A notification send needs a status check.</span><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void checkStatus()} type="button">{busy === 'status' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}Check send status</button></div> : null}
      <form className="notification-layout" onSubmit={review}>
        <div className="notification-composer">
          <section className="card notification-section">
            <div className="notification-section-heading"><Users size={18} /><h2>Choose your audience</h2></div>
            {scopedEventId ? <p className="field-help">Your audience is limited to people with active access to your assigned event.</p> : null}
            <label>Send to<select aria-label="Audience" disabled={locked} value={audience.mode} onChange={(event) => updateAudience({ ...emptyAudience(), mode: event.target.value as NotificationAudience['mode'] })}>{audienceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <p className="field-help">{audienceOptions.find((option) => option.value === audience.mode)?.description}</p>
            {audience.mode === 'roles' ? <fieldset className="notification-choices" disabled={locked}><legend>Program roles</legend>{roles.map((role) => <label className="check-row" key={role.id}><input checked={audience.roleIds.includes(role.id)} onChange={(event) => updateAudience({ ...audience, roleIds: toggleId(audience.roleIds, role.id, event.target.checked) })} type="checkbox" /><span>{role.name}</span></label>)}</fieldset> : null}
            {audience.mode === 'events' ? <>
              <fieldset className="notification-choices" disabled={locked}><legend>Events they can enter</legend>{events.filter((event) => event.programId === program.id && (!scopedEventId || event.id === scopedEventId)).map((item) => <label className="check-row" key={item.id}><input checked={audience.eventIds.includes(item.id)} onChange={(event) => updateAudience({ ...audience, eventIds: toggleId(audience.eventIds, item.id, event.target.checked) })} type="checkbox" /><span>{item.name}</span></label>)}{events.length === 0 ? <p className="muted-note">This program has no events yet.</p> : null}</fieldset>
              <details><summary>Filter by role in these events</summary><p className="field-help">Leave all unchecked for any event role. People must match an event and a chosen role in that event.</p><fieldset className="notification-choices" disabled={locked}><legend>Event roles (optional)</legend>{roles.map((role) => <label className="check-row" key={role.id}><input checked={audience.eventRoleIds.includes(role.id)} onChange={(event) => updateAudience({ ...audience, eventRoleIds: toggleId(audience.eventRoleIds, role.id, event.target.checked) })} type="checkbox" /><span>{role.name}</span></label>)}</fieldset></details>
            </> : null}
            {audience.mode === 'people' ? <div className="notification-people-picker">
              <div className="toolbar-filters"><label className="search-field"><Search size={15} /><input aria-label="Search notification audience" disabled={locked} placeholder="Search name, email or phone" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label="Filter people by role" disabled={locked} value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
              <div className="notification-picker-actions"><span>{audience.personIds.length} selected{selectedOutsideFilter ? ` · ${selectedOutsideFilter} outside current filters` : ''}</span><button className="secondary-button" disabled={locked || !visiblePeople.length} onClick={() => updateAudience({ ...audience, personIds: allVisibleSelected ? audience.personIds.filter((id) => !visiblePeople.some((person) => person.id === id)) : [...new Set([...audience.personIds, ...visiblePeople.map((person) => person.id)])] })} type="button">{allVisibleSelected ? 'Deselect matching' : 'Select all matching'}</button><button className="secondary-button" disabled={locked || !audience.personIds.length} onClick={() => updateAudience({ ...audience, personIds: [] })} type="button">Clear</button></div>
              <fieldset className="notification-choices notification-person-list" disabled={locked}><legend>People</legend>{visiblePeople.map((person) => <label className="check-row" key={person.id}><input checked={audience.personIds.includes(person.id)} onChange={(event) => updateAudience({ ...audience, personIds: toggleId(audience.personIds, person.id, event.target.checked) })} type="checkbox" /><span><strong>{person.fullName}</strong><small>{person.email || person.phone || person.programRoleName || person.kind}</small></span></label>)}{!visiblePeople.length ? <p className="muted-note">No active people match these filters.</p> : null}</fieldset>
            </div> : null}
          </section>
          <section className="card notification-section">
            <div className="notification-section-heading"><Bell size={18} /><h2>Write your notification</h2></div>
            <label>Title<input disabled={locked} maxLength={100} required placeholder="Your event update" value={title} onChange={(event) => { setTitle(event.target.value); setPreview(null) }} /><small className="field-help">{title.length}/100</small></label>
            <label>Message<textarea disabled={locked} maxLength={500} required rows={5} placeholder="Tell your audience what they need to know…" value={body} onChange={(event) => { setBody(event.target.value); setPreview(null) }} /><small className="field-help">{body.length}/500</small></label>
            <p className="field-help">Tapping this notification opens {program.name} in Sang. Event and role choices control who receives it.</p>
            <button className="primary-button" disabled={locked || !selectionValid || !title.trim() || !body.trim()} type="submit">{busy === 'preview' ? <Loader2 className="spin" size={15} /> : <Check size={15} />}Review audience and message</button>
          </section>
        </div>
        <aside className="card notification-section notification-preview-panel">
          <div className="notification-section-heading"><Smartphone size={18} /><h2>Message preview</h2></div>
          <div className="notification-push-preview"><div><Bell size={16} /><span>Sang</span><small>now</small></div><strong>{title.trim() || 'Your notification title'}</strong><p>{body.trim() || 'Your message will appear here.'}</p></div>
          <p className="field-help">Opens: {program.name}</p><p className="field-help">Only linked Sang users with program access and an active device that allows notifications can receive a push.</p>
        </aside>
      </form>
      <section className="card notification-section notification-history">
        <div className="notification-history-heading"><div><h2>Notification history</h2><p className="field-help">Push service acceptance does not confirm that a person read the message.</p></div><button className="secondary-button" disabled={historyBusy} onClick={() => void refreshHistory()} type="button"><RefreshCw className={historyBusy ? 'spin' : ''} size={15} />Refresh history</button></div>
        {historyError ? <p className="form-error" role="alert">{historyError}</p> : null}
        {!historyBusy && !history.length && !historyError ? <p className="muted-note">No notifications have been sent for this program.</p> : null}
        {history.map((item) => <article className="notification-history-item" key={item.id}><div><strong>{item.title}</strong><span className={`status ${item.status === 'sent' ? 'active' : item.status === 'failed' || item.status === 'uncertain' ? 'cancelled' : ''}`}>{notificationStatusLabels[item.status]}</span></div><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString()} · {item.result ? `${item.result.acceptedUsers} people / ${item.result.acceptedDevices} devices accepted; ${item.result.failedDevices} failed${item.result.uncertainDevices ? `; ${item.result.uncertainDevices} uncertain` : ''}` : `${item.counts.eligibleUsers} eligible people`}</small></article>)}
      </section>
      {confirmOpen && preview ? <div className="notification-modal-backdrop"><div aria-labelledby="notification-confirm-title" aria-modal="true" className="notification-confirm card" ref={confirmRef} role="dialog" tabIndex={-1}>
        <div className="notification-history-heading"><h2 id="notification-confirm-title">Review notification</h2><button aria-label="Close notification review" className="icon-button ghost" disabled={Boolean(busy)} onClick={() => setConfirmOpen(false)} type="button"><X size={18} /></button></div>
        <div className="notification-push-preview"><div><Bell size={16} /><span>Sang</span></div><strong>{preview.title}</strong><p>{preview.body}</p></div>
        <p>Opens <strong>{preview.programName}</strong> in Sang.</p>
        <p className="field-help">Audience: {audienceDescription(preview.audience)}</p>
        <div className="notification-recipient-count"><strong>{preview.counts.eligibleUsers}</strong><span>people on {preview.counts.deviceCount} devices<br />{preview.counts.androidDevices} Android · {preview.counts.iosDevices} iPhone</span></div>
        <p className="field-help">{preview.counts.matchedPeople} matching roster records. Duplicate accounts are counted once.</p>
        <ul className="notification-exclusions">
          {preview.counts.inactivePeople > 0 ? <li>{preview.counts.inactivePeople} blocked or removed people excluded.</li> : null}
          {preview.counts.unlinkedPeople > 0 ? <li>{preview.counts.unlinkedPeople} people are not linked to Sang.</li> : null}
          {preview.counts.missingAccessUsers > 0 ? <li>{preview.counts.missingAccessUsers} users do not have current app access. Publish or refresh their access first.</li> : null}
          {preview.counts.noDeviceUsers > 0 ? <li>{preview.counts.noDeviceUsers} users have no supported device with notifications enabled.</li> : null}
          {preview.counts.iosUnavailableDevices > 0 ? <li>{preview.counts.iosUnavailableDevices} iPhone devices excluded: iPhone notification delivery is not configured.</li> : null}
          {preview.counts.unsupportedDevices > 0 ? <li>{preview.counts.unsupportedDevices} devices use an unsupported push registration.</li> : null}
        </ul>
        {preview.counts.eligibleUsers === 0 ? <p className="form-error">No selected people can currently receive this notification.</p> : null}
        <div className="notification-confirm-actions"><button className="secondary-button" disabled={Boolean(busy)} onClick={() => setConfirmOpen(false)} type="button">Back</button><button className="primary-button" disabled={Boolean(busy) || Boolean(pendingId) || preview.status !== 'draft' || preview.counts.eligibleUsers === 0} onClick={() => void send()} type="button">{busy === 'send' ? <Loader2 className="spin" size={15} /> : <Send size={15} />}{busy === 'send' ? 'Sending…' : `Send to ${preview.counts.eligibleUsers} people`}</button></div>
      </div></div> : null}
    </>
  )
}
