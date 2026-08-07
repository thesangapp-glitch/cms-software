import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Download,
  Eye,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Papa from 'papaparse'
import QRCode from 'qrcode'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type Query,
  type Timestamp,
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { auth, db, functions, storage } from './lib/firebase'

type RouteKey = 'dashboard' | 'events' | 'programs' | 'roles' | 'team' | 'people' | 'checkin' | 'analytics'
type PersonKind = 'attendee' | 'participant' | 'speaker' | 'staff'
type ProgramMode = 'standalone' | 'multiEvent'
type TeamScope = 'organization' | 'program' | 'event'

type PeUser = {
  uid: string
  displayName: string
  email: string
  activeOrgId?: string
  organizationIds: string[]
}

type Organization = {
  id: string
  name: string
  industry?: string
  website?: string
  ownerUid: string
}

type Role = {
  id: string
  name: string
  description?: string
  permissions: string[]
  isDefault?: boolean
}

type TeamMember = {
  id: string
  orgId: string
  email: string
  displayName: string
  roleId: string
  scope: TeamScope
  programId?: string
  eventId?: string
  status: 'invited' | 'active' | 'disabled'
  uid?: string
}

type Program = {
  id: string
  orgId: string
  name: string
  mode: ProgramMode
  status: 'draft' | 'live' | 'archived'
  startDate: string
  endDate: string
  venueName: string
  city: string
  bannerUrl?: string
  posterUrl?: string
  latitude?: number
  longitude?: number
  address?: string
  timezone: string
  description?: string
}

type ProgramEvent = {
  id: string
  orgId: string
  programId: string
  name: string
  startDateTime: string
  endDateTime: string
  venueName: string
  locationNote?: string
  posterUrl?: string
  latitude?: number
  longitude?: number
  address?: string
  status: 'draft' | 'live' | 'completed'
}

type ProgramPerson = {
  id: string
  orgId: string
  programId: string
  email: string
  phone?: string
  fullName: string
  kind: PersonKind
  company?: string
  designation?: string
  sangUid?: string
  passId?: string
  passStatus?: 'notIssued' | 'issued' | 'checkedIn'
}

type PassRecord = {
  id: string
  orgId: string
  programId: string
  programPersonId: string
  qrPayload: string
  status: 'issued' | 'checkedIn' | 'revoked'
}

type CheckIn = {
  id: string
  orgId: string
  programId: string
  eventId?: string
  programPersonId: string
  passId: string
  result: 'approved' | 'duplicate' | 'denied'
  createdAt?: Timestamp
}

const permissions = [
  'program.read',
  'program.write',
  'event.write',
  'roles.write',
  'team.write',
  'people.import',
  'passes.issue',
  'checkin.scan',
  'analytics.read',
  'exports.create',
]

const routeLabels: Record<RouteKey, string> = {
  dashboard: 'Dashboard',
  events: 'Events',
  programs: 'Programs',
  roles: 'Roles',
  team: 'Team',
  people: 'People',
  checkin: 'Check-in',
  analytics: 'Analytics',
}

const navItems = [
  { key: 'dashboard' as const, icon: LayoutDashboard },
  { key: 'events' as const, icon: CalendarDays },
  { key: 'programs' as const, icon: CalendarDays },
  { key: 'roles' as const, icon: ShieldCheck },
  { key: 'team' as const, icon: Users },
  { key: 'people' as const, icon: ClipboardList },
  { key: 'checkin' as const, icon: ScanLine },
  { key: 'analytics' as const, icon: BarChart3 },
]

function nowDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function formatCount(value: number) {
  return new Intl.NumberFormat('en-IN').format(value)
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function uploadEventImage(uid: string, file: File, folder: string) {
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '')
  const path = `event-crm/users/${uid}/${folder}/${Date.now()}-${safeName || 'image.jpg'}`
  const fileRef = storageRef(storage, path)
  await uploadBytes(fileRef, file, { contentType: file.type })
  return getDownloadURL(fileRef)
}

function readHashRoute(): RouteKey {
  const key = window.location.hash.replace('#/', '') as RouteKey
  return routeLabels[key] ? key : 'dashboard'
}

function toRows<T extends { id: string }>(snapshotDocs: DocumentData[]) {
  return snapshotDocs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() }) as T)
}

function useCollection<T extends { id: string }>(dataQuery: Query | null) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(Boolean(dataQuery))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dataQuery) {
      setRows([])
      setLoading(false)
      return
    }

    setLoading(true)
    return onSnapshot(
      dataQuery,
      (snapshot) => {
        setRows(toRows<T>(snapshot.docs))
        setLoading(false)
      },
      (snapshotError) => {
        setError(snapshotError.message)
        setLoading(false)
      },
    )
  }, [dataQuery])

  return { rows, loading, error }
}

function useAuthProfile() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<PeUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let finished = false
    const fallbackTimer = window.setTimeout(() => {
      if (!finished) {
        setLoading(false)
      }
    }, 7000)

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setFirebaseUser(currentUser)
      if (!currentUser) {
        setProfile(null)
        finished = true
        window.clearTimeout(fallbackTimer)
        setLoading(false)
        return
      }

      try {
        await Promise.race([
          claimTeamAccessCallable(),
          new Promise((resolve) => window.setTimeout(resolve, 3500)),
        ])
      } catch {
        // A missing/deployed-later function should not block first-owner onboarding.
      }

      try {
        const userSnapshot = await getDoc(doc(db, 'peUsers', currentUser.uid))
        setProfile(userSnapshot.exists() ? (userSnapshot.data() as PeUser) : null)
      } finally {
        finished = true
        window.clearTimeout(fallbackTimer)
        setLoading(false)
      }
    })

    return () => {
      window.clearTimeout(fallbackTimer)
      unsubscribe()
    }
  }, [])

  return { firebaseUser, profile, setProfile, loading }
}

const createOrganizationCallable = httpsCallable<{ displayName: string; orgName: string; industry: string; website: string; email: string }, { orgId: string }>(functions, 'createOrganization')
const claimTeamAccessCallable = httpsCallable<void, { claimedOrgIds: string[] }>(functions, 'claimTeamAccess')
const createRoleCallable = httpsCallable<{ orgId: string; roleId: string; name: string; description: string; permissions: string[] }, { roleId: string }>(functions, 'createRole')
const inviteTeamMemberCallable = httpsCallable<{ orgId: string; email: string; displayName: string; roleId: string; scope: TeamScope; programId?: string; eventId?: string }, { teamMemberId: string }>(functions, 'inviteTeamMember')
const createProgramCallable = httpsCallable<Omit<Program, 'id' | 'status'>, { programId: string }>(functions, 'createProgram')
const createEventCallable = httpsCallable<Omit<ProgramEvent, 'id' | 'status'>, { eventId: string }>(functions, 'createEvent')
const updateEventCallable = httpsCallable<Partial<Omit<ProgramEvent, 'id'>> & { eventId: string }, { eventId: string }>(functions, 'updateEvent')
const deleteEventCallable = httpsCallable<{ orgId: string; eventId: string }, { eventId: string }>(functions, 'deleteEvent')
const createProgramPersonAndPassCallable = httpsCallable<Omit<ProgramPerson, 'id' | 'passId' | 'passStatus' | 'sangUid'> & { eventIds?: string[] }, { programPersonId: string; passId: string; qrPayload: string }>(functions, 'createProgramPersonAndPass')
const createScannerSession = httpsCallable<{ orgId: string; programId: string; eventId?: string; gateName?: string }, { scannerSessionId: string; scannerToken: string }>(functions, 'createScannerSession')
const scanPassToken = httpsCallable<{ scannerSessionId: string; scannerToken: string; payload: string; deviceScanId: string }, { result: string; passId: string; programPersonId: string }>(functions, 'scanPassToken')

async function createOrganizationWithOwner(user: User, input: { displayName: string; orgName: string; industry: string; website: string }) {
  const response = await createOrganizationCallable({
    displayName: input.displayName.trim(),
    orgName: input.orgName.trim(),
    industry: input.industry.trim(),
    website: input.website.trim(),
    email: user.email || '',
  })
  await updateProfile(user, { displayName: input.displayName.trim() })

  return {
    uid: user.uid,
    displayName: input.displayName.trim(),
    email: user.email || '',
    activeOrgId: response.data.orgId,
    organizationIds: [response.data.orgId],
  }
}

function Shell({
  children,
  route,
  setRoute,
  organization,
  selectedProgram,
  onSwitchProgram,
  user,
}: {
  children: React.ReactNode
  route: RouteKey
  setRoute: (route: RouteKey) => void
  organization: Organization | null
  selectedProgram: Program | null
  onSwitchProgram: () => void
  user: User
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">S</div>
          <div>
            <strong>Sang CRM</strong>
            <span>{selectedProgram?.name || organization?.name || 'Event OS'}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={route === item.key ? 'nav-item active' : 'nav-item'}
                key={item.key}
                onClick={() => setRoute(item.key)}
                type="button"
                title={routeLabels[item.key]}
              >
                <Icon size={18} />
                <span>{routeLabels[item.key]}</span>
              </button>
            )
          })}
        </nav>

        <button className="secondary-button sidebar-signout" onClick={() => signOut(auth)} type="button">
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      <main className="main-surface">
        <header className="topbar">
          <div>
            <span className="eyebrow">{organization?.name || 'Event operations'}</span>
            <h1>{routeLabels[route]}</h1>
          </div>
          <div className="topbar-actions">
            {selectedProgram && (
              <button className="program-context-button" onClick={onSwitchProgram} type="button">
                <span>{selectedProgram.name}</span>
                <small>Switch program</small>
              </button>
            )}
            <div className="user-pill">
              <span>{user.displayName || user.email}</span>
            </div>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        if (displayName.trim()) {
          await updateProfile(credential.user, { displayName: displayName.trim() })
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  async function continueWithGoogle() {
    setError('')
    setLoading(true)

    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Google sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="auth-copy">
          <div className="brand-lockup large">
            <div className="brand-mark">S</div>
            <div>
              <strong>Sang Event CRM</strong>
              <span>Premium event operations for real venues</span>
            </div>
          </div>
          <h1>Run every event from one polished CRM.</h1>
          <p>
            One CRM for festivals, conferences, corporate events, competitions, workshops, and standalone events.
          </p>
          <div className="event-type-grid" aria-label="Supported event types">
            <span>Festivals</span>
            <span>Conferences</span>
            <span>Corporate</span>
            <span>Competitions</span>
            <span>Exhibitions</span>
            <span>Workshops</span>
          </div>
        </div>

        <form className="auth-card" onSubmit={submit}>
          <div className="segmented">
            <button className={mode === 'signin' ? 'selected' : ''} onClick={() => setMode('signin')} type="button">
              Sign in
            </button>
            <button className={mode === 'signup' ? 'selected' : ''} onClick={() => setMode('signup')} type="button">
              Create account
            </button>
          </div>

          {mode === 'signup' && (
            <label>
              Full name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>
          )}
          <label>
            Email
            <input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button className="secondary-button full-width" disabled={loading} onClick={continueWithGoogle} type="button">
            <ShieldCheck size={17} />
            Continue with Google
          </button>

          <div className="divider"><span>or</span></div>

          <button className="primary-button" disabled={loading} type="submit">
            {loading ? <Loader2 className="spin" size={17} /> : <Lock size={17} />}
            {mode === 'signin' ? 'Open CRM' : 'Create CRM account'}
          </button>
        </form>
      </section>
    </main>
  )
}

function OnboardingPage({ user, onComplete }: { user: User; onComplete: (profile: PeUser) => void }) {
  const [displayName, setDisplayName] = useState(user.displayName || '')
  const [orgName, setOrgName] = useState('')
  const [industry, setIndustry] = useState('College fest')
  const [website, setWebsite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const profile = await createOrganizationWithOwner(user, { displayName, orgName, industry, website })
      onComplete(profile)
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Could not complete setup')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-screen">
      <form className="onboarding-card" onSubmit={submit}>
        <span className="eyebrow">First setup</span>
        <h1>Create your organization workspace</h1>
        <p>Ye top-level account hai. Iske andar programs, roles, team access, attendees, passes aur analytics manage honge.</p>

        <div className="form-grid two">
          <label>
            Your name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label>
            Organization name
            <input placeholder="Your organization or event company" value={orgName} onChange={(event) => setOrgName(event.target.value)} required />
          </label>
          <label>
            Event category
            <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
              <option>College fest</option>
              <option>Conference</option>
              <option>Corporate event</option>
              <option>Startup event</option>
              <option>Community event</option>
            </select>
          </label>
          <label>
            Website
            <input placeholder="https://..." value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" disabled={loading} type="submit">
          {loading ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}
          Create workspace
        </button>
      </form>
    </main>
  )
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return (
    <article className="stat-card">
      <div className="stat-icon">
        <Icon size={19} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <Sparkles size={24} />
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  )
}

function ImageUploader({
  label,
  value,
  onChange,
  uid,
  folder,
}: {
  label: string
  value: string
  onChange: (url: string) => void
  uid: string
  folder: string
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function chooseFile(file?: File) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.')
      return
    }
    setUploading(true)
    setError('')
    try {
      const url = await uploadEventImage(uid, file, folder)
      onChange(url)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="upload-field">
      <span>{label}</span>
      <label className={value ? 'poster-drop has-image' : 'poster-drop'}>
        {value ? <img alt="" src={value} /> : <Upload size={22} />}
        <strong>{uploading ? 'Uploading...' : value ? 'Replace image' : 'Upload image'}</strong>
        <small>Poster, banner, or event artwork</small>
        <input accept="image/*" disabled={uploading} onChange={(event) => chooseFile(event.target.files?.[0])} type="file" />
      </label>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

function MapPicker({
  label,
  venue,
  lat,
  lng,
  onVenueChange,
  onPick,
}: {
  label: string
  venue: string
  lat?: number
  lng?: number
  onVenueChange: (venue: string) => void
  onPick: (point: { latitude: number; longitude: number }) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const start: L.LatLngExpression = [lat || 28.6139, lng || 77.209]
    const map = L.map(containerRef.current, { zoomControl: false }).setView(start, lat && lng ? 14 : 5)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    const pinIcon = L.divIcon({
      className: 'map-pin-marker',
      html: '<span></span>',
      iconAnchor: [14, 28],
      iconSize: [28, 28],
    })
    const marker = L.marker(start, { draggable: true, icon: pinIcon }).addTo(map)

    function commit(point: L.LatLng) {
      marker.setLatLng(point)
      onPick({ latitude: Number(point.lat.toFixed(6)), longitude: Number(point.lng.toFixed(6)) })
    }

    map.on('click', (event: L.LeafletMouseEvent) => commit(event.latlng))
    marker.on('dragend', () => commit(marker.getLatLng()))
    mapRef.current = map
    markerRef.current = marker
  }, [lat, lng, onPick])

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || lat === undefined || lng === undefined) return
    const next: L.LatLngExpression = [lat, lng]
    markerRef.current.setLatLng(next)
    mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 13))
  }, [lat, lng])

  return (
    <div className="map-picker">
      <label>
        {label}
        <input placeholder="Search/enter venue name" value={venue} onChange={(event) => onVenueChange(event.target.value)} />
      </label>
      <div className="map-canvas" ref={containerRef} />
      <div className="coordinate-row">
        <span>Lat {lat?.toFixed(5) || '-'}</span>
        <span>Lng {lng?.toFixed(5) || '-'}</span>
      </div>
    </div>
  )
}

function ProgramChooserPage({
  programs,
  events,
  onChoose,
  onCreate,
}: {
  programs: Program[]
  events: ProgramEvent[]
  onChoose: (programId: string) => void
  onCreate: () => void
}) {
  return (
    <main className="main-surface chooser-surface">
      <section className="program-chooser">
        <div className="chooser-head">
          <div>
            <span className="eyebrow">Choose workspace</span>
            <h1>Select a program to manage</h1>
            <p>Dashboard, event list, people import, check-in, and analytics open inside the selected program.</p>
          </div>
          <button className="primary-button" onClick={onCreate} type="button">
            <Plus size={17} />
            Create program
          </button>
        </div>

        {programs.length === 0 ? (
          <section className="panel">
            <EmptyState title="No programs yet" body="Create your first conference, college fest, corporate event, competition, workshop, or standalone event." />
            <button className="primary-button" onClick={onCreate} type="button">
              <Plus size={17} />
              Create first program
            </button>
          </section>
        ) : (
          <div className="program-choice-grid">
            {programs.map((program) => {
              const programEvents = events.filter((item) => item.programId === program.id)
              return (
                <button className="program-choice-card" key={program.id} onClick={() => onChoose(program.id)} type="button">
                  {program.bannerUrl || program.posterUrl ? <img alt="" src={program.bannerUrl || program.posterUrl} /> : <div className="program-choice-fallback"><CalendarDays size={24} /></div>}
                  <span className={`status ${program.status}`}>{program.status}</span>
                  <strong>{program.name}</strong>
                  <p>{program.description || `${programEvents.length} events ready to manage.`}</p>
                  <small><MapPin size={13} /> {program.venueName || 'Venue pending'} {program.city ? `- ${program.city}` : ''}</small>
                  <div>
                    <span>{programEvents.length} events</span>
                    <ChevronRight size={18} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function ProgramWorkspaceDashboard({
  program,
  events,
  people,
  checkIns,
  setRoute,
}: {
  program: Program
  events: ProgramEvent[]
  people: ProgramPerson[]
  checkIns: CheckIn[]
  setRoute: (route: RouteKey) => void
}) {
  const issuedPasses = people.filter((person) => person.passStatus === 'issued' || person.passStatus === 'checkedIn').length
  const checkedIn = people.filter((person) => person.passStatus === 'checkedIn').length

  return (
    <section className="page-stack">
      <section className="workspace-hero">
        {program.bannerUrl || program.posterUrl ? <img alt="" src={program.bannerUrl || program.posterUrl} /> : <div className="program-art-fallback"><CalendarDays size={28} /></div>}
        <div>
          <span className="eyebrow">{program.mode === 'standalone' ? 'Standalone program' : 'Selected program'}</span>
          <h1>{program.name}</h1>
          <p>{program.description || 'Program workspace is ready. Add events, import people, issue passes, and track check-ins from here.'}</p>
          <div className="workspace-meta">
            <span><CalendarDays size={14} /> {program.startDate} to {program.endDate}</span>
            <span><MapPin size={14} /> {program.venueName || 'Venue pending'} {program.city ? `- ${program.city}` : ''}</span>
          </div>
        </div>
        <button className="primary-button" onClick={() => setRoute('events')} type="button">
          <CalendarDays size={17} />
          Open events
        </button>
      </section>

      <div className="stats-grid">
        <Stat icon={CalendarDays} label="Events" value={formatCount(events.length)} detail={program.mode === 'standalone' ? 'Optional sub-events' : 'Inside this program'} />
        <Stat icon={BadgeCheck} label="Passes issued" value={formatCount(issuedPasses)} detail="For selected program" />
        <Stat icon={Users} label="People" value={formatCount(people.length)} detail="Attendees, participants, staff" />
        <Stat icon={ScanLine} label="Checked in" value={formatCount(checkedIn || checkIns.length)} detail="Live gate signal" />
      </div>

      <div className="split-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Next work</span>
              <h2>Events</h2>
            </div>
            <button className="icon-button" onClick={() => setRoute('events')} title="Open events" type="button">
              <ChevronRight size={18} />
            </button>
          </div>

          {events.length === 0 ? (
            <EmptyState title="Add the first event" body="Create sessions, contests, talks, workshops, zones, or gates inside this selected program." />
          ) : (
            <div className="list-stack">
              {events.slice(0, 4).map((programEvent) => (
                <div className="row-item" key={programEvent.id}>
                  <div>
                    <strong>{programEvent.name}</strong>
                    <span>{programEvent.venueName || program.venueName || 'Venue pending'} {programEvent.locationNote ? `- ${programEvent.locationNote}` : ''}</span>
                  </div>
                  <span className={`status ${programEvent.status}`}>{programEvent.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Gate readiness</span>
              <h2>Operations snapshot</h2>
            </div>
            <ScanLine size={20} />
          </div>
          <div className="ops-list">
            <div><Check size={16} /> Program workspace selected</div>
            <div><Check size={16} /> Default roles available</div>
            <div><Check size={16} /> Event model active</div>
            <div className={people.length ? '' : 'muted'}><Check size={16} /> People import {people.length ? 'started' : 'pending'}</div>
          </div>
        </section>
      </div>
    </section>
  )
}

function DashboardPage({
  programs,
  people,
  checkIns,
  setRoute,
}: {
  programs: Program[]
  people: ProgramPerson[]
  checkIns: CheckIn[]
  setRoute: (route: RouteKey) => void
}) {
  const livePrograms = programs.filter((program) => program.status === 'live').length
  const issuedPasses = people.filter((person) => person.passStatus === 'issued' || person.passStatus === 'checkedIn').length
  const latestPrograms = programs.slice(0, 4)

  return (
    <section className="page-stack">
      <div className="stats-grid">
        <Stat icon={CalendarDays} label="Programs" value={formatCount(programs.length)} detail={`${livePrograms} live`} />
        <Stat icon={BadgeCheck} label="Passes issued" value={formatCount(issuedPasses)} detail="Across selected organization" />
        <Stat icon={Users} label="People" value={formatCount(people.length)} detail="Attendees, participants, staff" />
        <Stat icon={ScanLine} label="Check-ins" value={formatCount(checkIns.length)} detail="Append-only activity records" />
      </div>

      <div className="split-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Next work</span>
              <h2>Programs</h2>
            </div>
            <button className="icon-button" onClick={() => setRoute('programs')} title="Open programs" type="button">
              <ChevronRight size={18} />
            </button>
          </div>

          {latestPrograms.length === 0 ? (
            <EmptyState title="Create the first program" body="Start with the main event container. If it has sessions, contests, talks, or workshops, add them inside as events." />
          ) : (
            <div className="list-stack">
              {latestPrograms.map((program) => (
                <div className="row-item" key={program.id}>
                  <div>
                    <strong>{program.name}</strong>
                    <span>{program.venueName || 'Venue pending'} · {program.city || 'City pending'}</span>
                  </div>
                  <span className={`status ${program.status}`}>{program.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Gate readiness</span>
              <h2>Operations snapshot</h2>
            </div>
            <ScanLine size={20} />
          </div>
          <div className="ops-list">
            <div><Check size={16} /> Organization workspace ready</div>
            <div><Check size={16} /> Default roles available</div>
            <div><Check size={16} /> Program/event model active</div>
            <div className={people.length ? '' : 'muted'}><Check size={16} /> People import {people.length ? 'started' : 'pending'}</div>
          </div>
        </section>
      </div>
    </section>
  )
}

function ProgramsPage({ orgId, uid, programs, events }: { orgId: string; uid: string; programs: Program[]; events: ProgramEvent[] }) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProgramMode>('multiEvent')
  const [startDate, setStartDate] = useState(nowDateInput())
  const [endDate, setEndDate] = useState(nowDateInput())
  const [venueName, setVenueName] = useState('')
  const [city, setCity] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>()
  const [longitude, setLongitude] = useState<number | undefined>()
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function createProgram(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    await createProgramCallable({
      orgId,
      name: name.trim(),
      mode,
      startDate,
      endDate,
      venueName: venueName.trim(),
      city: city.trim(),
      bannerUrl: bannerUrl.trim(),
      posterUrl: posterUrl.trim(),
      latitude,
      longitude,
      address: venueName.trim(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      description: description.trim(),
    })
    setName('')
    setVenueName('')
    setCity('')
    setBannerUrl('')
    setPosterUrl('')
    setLatitude(undefined)
    setLongitude(undefined)
    setDescription('')
    setBusy(false)
  }

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={createProgram}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Program</span>
            <h2>Create program</h2>
          </div>
          <Plus size={20} />
        </div>
        <label>
          Program name
          <input placeholder="Annual Tech Summit 2026" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as ProgramMode)}>
            <option value="multiEvent">Multi-event program</option>
            <option value="standalone">Standalone program/event</option>
          </select>
        </label>
        <div className="form-grid two">
          <label>
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </label>
        </div>
        <div className="form-grid two">
          <label>
            Primary venue
            <input placeholder="Convention Centre, Delhi" value={venueName} onChange={(event) => setVenueName(event.target.value)} />
          </label>
          <label>
            City
            <input placeholder="Delhi" value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
        </div>
        <div className="form-grid two">
          <ImageUploader folder="program-banners" label="Program banner" onChange={setBannerUrl} uid={uid} value={bannerUrl} />
          <ImageUploader folder="program-posters" label="Program poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
        </div>
        <MapPicker
          label="Primary location"
          lat={latitude}
          lng={longitude}
          onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
          onVenueChange={setVenueName}
          venue={venueName}
        />
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
          Create program
        </button>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>Programs and events</h2>
          </div>
          <CalendarDays size={20} />
        </div>
        {programs.length === 0 ? (
          <EmptyState title="No programs yet" body="Create a program for a conference, fest, corporate event, competition, or any standalone event." />
        ) : (
          <div className="program-list">
            {programs.map((program) => (
              <ProgramBlock events={events.filter((programEvent) => programEvent.programId === program.id)} key={program.id} orgId={orgId} program={program} uid={uid} />
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

function ProgramBlock({ orgId, uid, program, events }: { orgId: string; uid: string; program: Program; events: ProgramEvent[] }) {
  const [eventName, setEventName] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [venueName, setVenueName] = useState(program.venueName || '')
  const [locationNote, setLocationNote] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>(program.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(program.longitude)
  const [busy, setBusy] = useState(false)

  async function createEvent(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    await createEventCallable({
      orgId,
      programId: program.id,
      name: eventName.trim(),
      startDateTime,
      endDateTime,
      venueName: venueName.trim(),
      locationNote: locationNote.trim(),
      posterUrl: posterUrl.trim(),
      latitude,
      longitude,
      address: venueName.trim(),
    })
    setEventName('')
    setStartDateTime('')
    setEndDateTime('')
    setLocationNote('')
    setPosterUrl('')
    setBusy(false)
  }

  return (
    <article className="program-block">
      <div className="program-hero">
        {program.bannerUrl || program.posterUrl ? <img alt="" src={program.bannerUrl || program.posterUrl} /> : <div className="program-art-fallback"><CalendarDays size={26} /></div>}
        <div>
          <span className="eyebrow">{program.mode === 'standalone' ? 'Standalone event' : 'Program'}</span>
          <strong>{program.name}</strong>
          <p>{program.description || 'No description added yet.'}</p>
          <span><MapPin size={14} /> {program.venueName || 'Venue pending'} {program.city ? `· ${program.city}` : ''}</span>
          {program.latitude && program.longitude && <span>{program.latitude.toFixed(5)}, {program.longitude.toFixed(5)}</span>}
        </div>
        <span className={`status ${program.status}`}>{program.mode === 'standalone' ? 'standalone' : `${events.length} events`}</span>
      </div>

      <form className="event-compose" onSubmit={createEvent}>
        <div className="event-compose-head">
          <div>
            <span className="eyebrow">Add event</span>
            <h2>Session, competition, workshop, talk, or gate zone</h2>
          </div>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
            Add event
          </button>
        </div>
        <div className="form-grid two">
          <label>
            Event name
            <input placeholder="Opening keynote" value={eventName} onChange={(event) => setEventName(event.target.value)} required />
          </label>
          <label>
            Location note
            <input placeholder="Hall A, first floor, gate 2" value={locationNote} onChange={(event) => setLocationNote(event.target.value)} />
          </label>
          <label>
            Starts
            <input aria-label="Start date time" type="datetime-local" value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} />
          </label>
          <label>
            Ends
            <input aria-label="End date time" type="datetime-local" value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} />
          </label>
        </div>
        <ImageUploader folder="event-posters" label="Event poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
        <MapPicker
          label="Event location"
          lat={latitude}
          lng={longitude}
          onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
          onVenueChange={setVenueName}
          venue={venueName}
        />
      </form>

      {events.length > 0 && (
        <div className="event-card-grid">
          {events.map((programEvent) => (
            <div className="event-card" key={programEvent.id}>
              {programEvent.posterUrl ? <img alt="" src={programEvent.posterUrl} /> : <div className="event-card-fallback"><CalendarDays size={20} /></div>}
              <div>
                <strong>{programEvent.name}</strong>
                <span><MapPin size={13} />{programEvent.venueName || program.venueName || 'Venue pending'}</span>
                {programEvent.locationNote && <p>{programEvent.locationNote}</p>}
                {programEvent.latitude && programEvent.longitude && <small>{programEvent.latitude.toFixed(5)}, {programEvent.longitude.toFixed(5)}</small>}
              </div>
              <span className={`status ${programEvent.status}`}>{programEvent.status}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function EventsPage({ orgId, uid, program, events }: { orgId: string; uid: string; program: Program; events: ProgramEvent[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '')
  const selectedEvent = events.find((event) => event.id === selectedEventId) || null
  const [eventName, setEventName] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [venueName, setVenueName] = useState(program.venueName || '')
  const [locationNote, setLocationNote] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>(program.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(program.longitude)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!selectedEventId && events[0]) {
      setSelectedEventId(events[0].id)
    }
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId(events[0]?.id || '')
      setEditing(false)
    }
  }, [events, selectedEventId])

  useEffect(() => {
    if (!selectedEvent) return
    setEventName(selectedEvent.name)
    setStartDateTime(selectedEvent.startDateTime || '')
    setEndDateTime(selectedEvent.endDateTime || '')
    setVenueName(selectedEvent.venueName || program.venueName || '')
    setLocationNote(selectedEvent.locationNote || '')
    setPosterUrl(selectedEvent.posterUrl || '')
    setLatitude(selectedEvent.latitude ?? program.latitude)
    setLongitude(selectedEvent.longitude ?? program.longitude)
  }, [program.latitude, program.longitude, program.venueName, selectedEvent])

  async function createEvent(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await createEventCallable({
        orgId,
        programId: program.id,
        name: eventName.trim(),
        startDateTime,
        endDateTime,
        venueName: venueName.trim(),
        locationNote: locationNote.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueName.trim(),
      })
      setSelectedEventId(response.data.eventId)
      setEditing(false)
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'Unable to create event')
    } finally {
      setBusy(false)
    }
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault()
    if (!selectedEvent) return
    setError('')
    setBusy(true)
    try {
      await updateEventCallable({
        orgId,
        eventId: selectedEvent.id,
        programId: program.id,
        name: eventName.trim(),
        startDateTime,
        endDateTime,
        venueName: venueName.trim(),
        locationNote: locationNote.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueName.trim(),
        status: selectedEvent.status,
      })
      setEditing(false)
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'Unable to save event')
    } finally {
      setBusy(false)
    }
  }

  async function deleteSelectedEvent() {
    if (!selectedEvent) return
    const confirmed = window.confirm(`Delete "${selectedEvent.name}"? This will remove the event from this program.`)
    if (!confirmed) return
    setError('')
    setBusy(true)
    try {
      await deleteEventCallable({ orgId, eventId: selectedEvent.id })
      setSelectedEventId('')
      setEditing(false)
    } catch (eventError) {
      setError(eventError instanceof Error ? eventError.message : 'Unable to delete event')
    } finally {
      setBusy(false)
    }
  }

  function startCreate() {
    setSelectedEventId('')
    setEditing(true)
    setEventName('')
    setStartDateTime('')
    setEndDateTime('')
    setVenueName(program.venueName || '')
    setLocationNote('')
    setPosterUrl('')
    setLatitude(program.latitude)
    setLongitude(program.longitude)
  }

  const formTitle = selectedEvent ? 'Edit event' : 'Create event'
  const submitHandler = selectedEvent ? saveEvent : createEvent

  return (
    <section className="page-stack">
      <section className="events-command">
        <div>
          <span className="eyebrow">{program.name}</span>
          <h1>Events</h1>
          <p>Manage sessions, competitions, talks, workshops, venue zones, and gate-specific activities inside this program.</p>
        </div>
        <button className="primary-button" onClick={startCreate} type="button">
          <Plus size={17} />
          Add event
        </button>
      </section>

      {events.length === 0 && !editing ? (
        <section className="panel">
          <EmptyState title="No events yet" body="Add events with poster, schedule, venue, and map coordinates. Standalone programs can still use this for talks, gates, zones, or agenda items." />
          <button className="primary-button" onClick={startCreate} type="button">
            <Plus size={17} />
            Add first event
          </button>
        </section>
      ) : (
        <section className="event-workspace">
          <div className="event-gallery">
            {events.map((programEvent) => (
              <button className={selectedEventId === programEvent.id ? 'event-tile active' : 'event-tile'} key={programEvent.id} onClick={() => { setSelectedEventId(programEvent.id); setEditing(false) }} type="button">
                {programEvent.posterUrl ? <img alt="" src={programEvent.posterUrl} /> : <div className="event-tile-fallback"><CalendarDays size={20} /></div>}
                <div>
                  <strong>{programEvent.name}</strong>
                  <span>{programEvent.venueName || program.venueName || 'Venue pending'}</span>
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>

          {(selectedEvent || editing) && (
            <form className="panel event-detail-panel" onSubmit={submitHandler}>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{selectedEvent ? 'Event detail' : 'New event'}</span>
                  <h2>{formTitle}</h2>
                </div>
                <div className="action-row">
                  {selectedEvent && !editing && (
                    <button className="secondary-button" onClick={() => setEditing(true)} type="button">
                      <Pencil size={16} />
                      Edit
                    </button>
                  )}
                  {selectedEvent && (
                    <button className="danger-button" disabled={busy} onClick={deleteSelectedEvent} type="button">
                      <Trash2 size={16} />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {error && <p className="form-error">{error}</p>}
              {selectedEvent && !editing ? (
                <div className="event-read-view">
                  {selectedEvent.posterUrl ? <img alt="" src={selectedEvent.posterUrl} /> : <div className="event-card-fallback"><CalendarDays size={22} /></div>}
                  <div>
                    <span className={`status ${selectedEvent.status}`}>{selectedEvent.status}</span>
                    <h1>{selectedEvent.name}</h1>
                    <p>{selectedEvent.locationNote || 'No location note added yet.'}</p>
                    <span><CalendarDays size={14} /> {selectedEvent.startDateTime || 'Start pending'} to {selectedEvent.endDateTime || 'End pending'}</span>
                    <span><MapPin size={14} /> {selectedEvent.venueName || program.venueName || 'Venue pending'}</span>
                    {selectedEvent.latitude && selectedEvent.longitude && <small>{selectedEvent.latitude.toFixed(5)}, {selectedEvent.longitude.toFixed(5)}</small>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="form-grid two">
                    <label>
                      Event name
                      <input placeholder="Opening keynote" value={eventName} onChange={(event) => setEventName(event.target.value)} required />
                    </label>
                    <label>
                      Location note
                      <input placeholder="Hall A, first floor, gate 2" value={locationNote} onChange={(event) => setLocationNote(event.target.value)} />
                    </label>
                    <label>
                      Starts
                      <input aria-label="Start date time" type="datetime-local" value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} />
                    </label>
                    <label>
                      Ends
                      <input aria-label="End date time" type="datetime-local" value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} />
                    </label>
                  </div>
                  <ImageUploader folder="event-posters" label="Event poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
                  <MapPicker
                    label="Event location"
                    lat={latitude}
                    lng={longitude}
                    onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
                    onVenueChange={setVenueName}
                    venue={venueName}
                  />
                  <div className="action-row">
                    <button className="primary-button" disabled={busy} type="submit">
                      {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
                      {selectedEvent ? 'Save event' : 'Create event'}
                    </button>
                    {selectedEvent && (
                      <button className="secondary-button" onClick={() => setEditing(false)} type="button">
                        Cancel
                      </button>
                    )}
                  </div>
                </>
              )}
            </form>
          )}
        </section>
      )}
    </section>
  )
}

function RolesPage({ orgId, roles }: { orgId: string; roles: Role[] }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>(['program.read'])

  async function createRole(event: FormEvent) {
    event.preventDefault()
    const roleId = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    await createRoleCallable({
      orgId,
      roleId,
      name: name.trim(),
      description: description.trim(),
      permissions: selected,
    })
    setName('')
    setDescription('')
    setSelected(['program.read'])
  }

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={createRole}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Access</span>
            <h2>Create role</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <label>
          Role name
          <input placeholder="Competition Coordinator" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <div className="permission-grid">
          {permissions.map((permission) => (
            <label className="check-row" key={permission}>
              <input
                checked={selected.includes(permission)}
                onChange={(event) => setSelected((current) => event.target.checked ? [...current, permission] : current.filter((item) => item !== permission))}
                type="checkbox"
              />
              <span>{permission}</span>
            </label>
          ))}
        </div>
        <button className="primary-button" type="submit"><Plus size={17} />Save role</button>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Current</span>
            <h2>Organization roles</h2>
          </div>
          <Eye size={20} />
        </div>
        <div className="role-grid">
          {roles.map((role) => (
            <article className="role-card" key={role.id}>
              <strong>{role.name}</strong>
              <p>{role.description || 'No description'}</p>
              <div className="chip-row">
                {role.permissions.slice(0, 5).map((permission) => <span className="chip" key={permission}>{permission}</span>)}
                {role.permissions.length > 5 && <span className="chip">+{role.permissions.length - 5}</span>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function TeamPage({ orgId, roles, programs, events, members }: { orgId: string; roles: Role[]; programs: Program[]; events: ProgramEvent[]; members: TeamMember[] }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [roleId, setRoleId] = useState(roles[0]?.id || 'gate-staff')
  const [scope, setScope] = useState<TeamScope>('organization')
  const [programId, setProgramId] = useState('')
  const [eventId, setEventId] = useState('')

  useEffect(() => {
    if (!roles.some((role) => role.id === roleId)) {
      setRoleId(roles[0]?.id || 'gate-staff')
    }
  }, [roleId, roles])

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    await inviteTeamMemberCallable({
      orgId,
      email: email.trim().toLowerCase(),
      displayName: displayName.trim(),
      roleId,
      scope,
      programId: scope !== 'organization' ? programId : '',
      eventId: scope === 'event' ? eventId : '',
    })
    setEmail('')
    setDisplayName('')
  }

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={inviteMember}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Team</span>
            <h2>Add member</h2>
          </div>
          <Users size={20} />
        </div>
        <label>
          Member email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Name
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        </label>
        <label>
          Role
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <label>
          Scope
          <select value={scope} onChange={(event) => setScope(event.target.value as TeamScope)}>
            <option value="organization">Whole organization</option>
            <option value="program">Specific program</option>
            <option value="event">Specific event</option>
          </select>
        </label>
        {scope !== 'organization' && (
          <label>
            Program
            <select value={programId} onChange={(event) => setProgramId(event.target.value)} required>
              <option value="">Select program</option>
              {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>
        )}
        {scope === 'event' && (
          <label>
            Event
            <select value={eventId} onChange={(event) => setEventId(event.target.value)} required>
              <option value="">Select event</option>
              {events.filter((programEvent) => !programId || programEvent.programId === programId).map((programEvent) => (
                <option key={programEvent.id} value={programEvent.id}>{programEvent.name}</option>
              ))}
            </select>
          </label>
        )}
        <button className="primary-button" type="submit"><Plus size={17} />Add member</button>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Access map</span>
            <h2>Team members</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th><th>Status</th></tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName}</td>
                  <td>{member.email}</td>
                  <td>{roles.find((role) => role.id === member.roleId)?.name || member.roleId}</td>
                  <td>{member.scope}</td>
                  <td><span className={`status ${member.status}`}>{member.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function PeoplePage({ orgId, programs, events, people, passes }: { orgId: string; programs: Program[]; events: ProgramEvent[]; people: ProgramPerson[]; passes: PassRecord[] }) {
  const [programId, setProgramId] = useState('')
  const [eventIds, setEventIds] = useState<string[]>([])
  const [kind, setKind] = useState<PersonKind>('attendee')
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const selectedPeople = people.filter((person) => !programId || person.programId === programId)
  const availableEvents = events.filter((programEvent) => programEvent.programId === programId)

  useEffect(() => {
    if (!programId && programs[0]) {
      setProgramId(programs[0].id)
    }
  }, [programId, programs])

  async function createPerson(input: Omit<ProgramPerson, 'id' | 'passId' | 'passStatus'> & { eventIds?: string[] }) {
    await createProgramPersonAndPassCallable(input)
  }

  async function addManual(event: FormEvent) {
    event.preventDefault()
    await createPerson({
      orgId,
      programId,
      fullName: manualName.trim(),
      email: manualEmail.trim().toLowerCase(),
      phone: manualPhone.trim(),
      kind,
      company: manualCompany.trim(),
      eventIds,
    })
    setManualName('')
    setManualEmail('')
    setManualPhone('')
    setManualCompany('')
  }

  function importCsv(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = result.data.filter((row) => row.email || row.phone || row.name || row.fullName)
        for (const row of rows) {
          await createPerson({
            orgId,
            programId,
            fullName: (row.fullName || row.name || row.FullName || row.Name || 'Unnamed').trim(),
            email: (row.email || row.Email || '').trim().toLowerCase(),
            phone: (row.phone || row.Phone || '').trim(),
            kind: ((row.kind || row.type || kind).trim().toLowerCase() as PersonKind) || kind,
            company: (row.company || row.Company || '').trim(),
            designation: (row.designation || row.Designation || '').trim(),
            eventIds,
          })
        }
        await addDoc(collection(db, 'peImports'), {
          orgId,
          programId,
          fileName: file.name,
          rowCount: rows.length,
          status: 'completed',
          createdAt: serverTimestamp(),
        })
      },
    })
  }

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={addManual}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">People</span>
            <h2>Add or import</h2>
          </div>
          <Upload size={20} />
        </div>
        <label>
          Program
          <select value={programId} onChange={(event) => { setProgramId(event.target.value); setEventIds([]) }} required>
            <option value="">Select program</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        {availableEvents.length > 0 && (
          <div className="assignment-box">
            <span>Event access</span>
            {availableEvents.map((programEvent) => (
              <label className="check-row" key={programEvent.id}>
                <input
                  checked={eventIds.includes(programEvent.id)}
                  onChange={(changeEvent) => setEventIds((current) => changeEvent.target.checked ? [...current, programEvent.id] : current.filter((id) => id !== programEvent.id))}
                  type="checkbox"
                />
                <span>{programEvent.name}</span>
              </label>
            ))}
          </div>
        )}
        <label>
          Type
          <select value={kind} onChange={(event) => setKind(event.target.value as PersonKind)}>
            <option value="attendee">Attendee</option>
            <option value="participant">Participant</option>
            <option value="speaker">Speaker</option>
            <option value="staff">Staff</option>
          </select>
        </label>
        <label>
          Full name
          <input value={manualName} onChange={(event) => setManualName(event.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} />
        </label>
        <label>
          Phone
          <input value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} />
        </label>
        <label>
          Company / college
          <input value={manualCompany} onChange={(event) => setManualCompany(event.target.value)} />
        </label>
        <button className="primary-button" disabled={!programId} type="submit"><Plus size={17} />Add and issue pass</button>
        <label className="file-drop">
          <Upload size={18} />
          Upload CSV
          <input accept=".csv" disabled={!programId} onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} type="file" />
        </label>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Roster</span>
            <h2>Program people</h2>
          </div>
          <button
            className="icon-button"
            onClick={() => downloadCsv('sang-program-people.csv', selectedPeople.map((person) => ({
              name: person.fullName,
              email: person.email,
              phone: person.phone || '',
              type: person.kind,
              company: person.company || '',
              passStatus: person.passStatus || 'notIssued',
            })))}
            title="Download roster CSV"
            type="button"
          >
            <Download size={18} />
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Type</th><th>Pass</th><th>QR</th></tr>
            </thead>
            <tbody>
              {selectedPeople.map((person) => {
                const pass = passes.find((item) => item.id === person.passId)
                return (
                  <tr key={person.id}>
                    <td>{person.fullName}</td>
                    <td>{person.email || person.phone || 'No contact'}</td>
                    <td>{person.kind}</td>
                    <td><span className={`status ${person.passStatus || 'draft'}`}>{person.passStatus || 'notIssued'}</span></td>
                    <td>{pass ? <PassPreview payload={pass.qrPayload} /> : 'Pending'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function PassPreview({ payload }: { payload: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    QRCode.toDataURL(payload, { margin: 1, width: 96 }).then(setSrc)
  }, [payload])

  return src ? <img alt="Pass QR" className="qr-thumb" src={src} /> : <QrCode size={24} />
}

function CheckInPage({ programs, events, orgId }: { programs: Program[]; events: ProgramEvent[]; orgId: string }) {
  const [payload, setPayload] = useState('')
  const [programId, setProgramId] = useState('')
  const [eventId, setEventId] = useState('')
  const [gateName, setGateName] = useState('Main gate')
  const [session, setSession] = useState<{ scannerSessionId: string; scannerToken: string } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!programId && programs[0]) {
      setProgramId(programs[0].id)
    }
  }, [programId, programs])

  async function startSession() {
    setBusy(true)
    setMessage('')
    try {
      const response = await createScannerSession({ orgId, programId, eventId, gateName })
      setSession(response.data)
      setMessage('Scanner session active for this gate.')
    } catch (scannerError) {
      setMessage(scannerError instanceof Error ? scannerError.message : 'Could not create scanner session.')
    } finally {
      setBusy(false)
    }
  }

  async function checkIn(event: FormEvent) {
    event.preventDefault()
    if (!session) {
      setMessage('Start a scanner session first.')
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const response = await scanPassToken({
        scannerSessionId: session.scannerSessionId,
        scannerToken: session.scannerToken,
        payload: payload.trim(),
        deviceScanId: crypto.randomUUID(),
      })
      setMessage(`${response.data.result}: ${response.data.programPersonId}`)
      setPayload('')
    } catch (scanError) {
      setMessage(scanError instanceof Error ? scanError.message : 'Pass validation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="scanner-layout">
      <form className="scanner-panel" onSubmit={checkIn}>
        <div className="scan-frame">
          <ScanLine size={64} />
        </div>
        <h2>Gate scanner</h2>
        <p>Phase 1 mobile-web scanner. Paste or scan `SANGPASS1:{'{token}'}` payload from a Sang-issued pass.</p>
        <label>
          Program
          <select value={programId} onChange={(event) => { setProgramId(event.target.value); setSession(null) }} required>
            <option value="">Select program</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label>
          Event
          <select value={eventId} onChange={(event) => { setEventId(event.target.value); setSession(null) }}>
            <option value="">Program-level gate</option>
            {events.filter((programEvent) => !programId || programEvent.programId === programId).map((programEvent) => (
              <option key={programEvent.id} value={programEvent.id}>{programEvent.name}</option>
            ))}
          </select>
        </label>
        <label>
          Gate name
          <input value={gateName} onChange={(event) => { setGateName(event.target.value); setSession(null) }} />
        </label>
        <button className="secondary-button" disabled={!programId || busy} onClick={startSession} type="button">
          {busy ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
          {session ? 'Session active' : 'Start scanner session'}
        </button>
        <input autoCapitalize="none" placeholder="SANGPASS1:..." value={payload} onChange={(event) => setPayload(event.target.value)} required />
        <button className="primary-button" disabled={!session || busy} type="submit"><ScanLine size={17} />Validate pass</button>
        {message && <div className="scan-result">{message}</div>}
      </form>
    </section>
  )
}

function AnalyticsPage({ programs, people, checkIns }: { programs: Program[]; people: ProgramPerson[]; checkIns: CheckIn[] }) {
  const summaryRows = programs.map((program) => {
    const programPeople = people.filter((person) => person.programId === program.id)
    const checked = programPeople.filter((person) => person.passStatus === 'checkedIn').length
    return {
      program: program.name,
      totalPeople: programPeople.length,
      checkedIn: checked,
      checkInRate: programPeople.length ? `${Math.round((checked / programPeople.length) * 100)}%` : '0%',
    }
  })

  return (
    <section className="page-stack">
      <div className="stats-grid">
        <Stat icon={Users} label="Total people" value={formatCount(people.length)} detail="Imported or manually added" />
        <Stat icon={BadgeCheck} label="Checked in" value={formatCount(people.filter((person) => person.passStatus === 'checkedIn').length)} detail="Unique pass status" />
        <Stat icon={Activity} label="Scan records" value={formatCount(checkIns.length)} detail="Includes duplicates and denied scans" />
        <Stat icon={CalendarDays} label="Programs" value={formatCount(programs.length)} detail="Current organization" />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Program health</span>
            <h2>Analytics summary</h2>
          </div>
          <button className="icon-button" onClick={() => downloadCsv('sang-analytics-summary.csv', summaryRows)} title="Download analytics CSV" type="button">
            <Download size={18} />
          </button>
        </div>
        <div className="analytics-bars">
          {summaryRows.map((summary) => {
            const width = Number.parseInt(summary.checkInRate, 10)
            return (
              <div className="bar-row" key={summary.program}>
                <span>{summary.program}</span>
                <div><i style={{ width: `${width}%` }} /></div>
                <strong>{width}%</strong>
              </div>
            )
          })}
        </div>
      </section>
    </section>
  )
}

function CrmApp({ firebaseUser, profile, setProfile }: { firebaseUser: User; profile: PeUser; setProfile: (profile: PeUser) => void }) {
  const [route, setRouteState] = useState<RouteKey>(readHashRoute)
  const [selectedProgramId, setSelectedProgramId] = useState(() => window.localStorage.getItem('sang-crm-selected-program') || '')
  const orgId = profile.activeOrgId || ''
  const orgQuery = useMemo(() => (orgId ? doc(db, 'peOrganizations', orgId) : null), [orgId])
  const programsQuery = useMemo(() => (orgId ? query(collection(db, 'pePrograms'), where('orgId', '==', orgId)) : null), [orgId])
  const eventsQuery = useMemo(() => (orgId ? query(collection(db, 'peEvents'), where('orgId', '==', orgId)) : null), [orgId])
  const peopleQuery = useMemo(() => (orgId ? query(collection(db, 'peProgramPeople'), where('orgId', '==', orgId)) : null), [orgId])
  const passesQuery = useMemo(() => (orgId ? query(collection(db, 'pePasses'), where('orgId', '==', orgId)) : null), [orgId])
  const checkInsQuery = useMemo(() => (orgId ? query(collection(db, 'peCheckIns'), where('orgId', '==', orgId)) : null), [orgId])
  const membersQuery = useMemo(() => (orgId ? query(collection(db, 'peTeamMembers'), where('orgId', '==', orgId)) : null), [orgId])
  const rolesQuery = useMemo(() => (orgId ? collection(db, 'peOrganizations', orgId, 'roles') : null), [orgId])
  const programs = useCollection<Program>(programsQuery)
  const events = useCollection<ProgramEvent>(eventsQuery)
  const people = useCollection<ProgramPerson>(peopleQuery)
  const passes = useCollection<PassRecord>(passesQuery)
  const checkIns = useCollection<CheckIn>(checkInsQuery)
  const members = useCollection<TeamMember>(membersQuery)
  const roles = useCollection<Role>(rolesQuery)
  const [organization, setOrganization] = useState<Organization | null>(null)

  useEffect(() => {
    if (!orgQuery) return
    return onSnapshot(orgQuery, (snapshot) => {
      setOrganization(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Organization) : null)
    })
  }, [orgQuery])

  useEffect(() => {
    const onHashChange = () => setRouteState(readHashRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  function setRoute(nextRoute: RouteKey) {
    window.location.hash = `/${nextRoute}`
    setRouteState(nextRoute)
  }

  const sortedPrograms = [...programs.rows].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const selectedProgram = sortedPrograms.find((program) => program.id === selectedProgramId) || null
  const shouldChooseProgram = !selectedProgram && sortedPrograms.length > 1 && route !== 'programs'
  const activeProgram = selectedProgram || (sortedPrograms.length === 1 ? sortedPrograms[0] : null)
  const activeEvents = activeProgram ? events.rows.filter((event) => event.programId === activeProgram.id) : []
  const activePeople = activeProgram ? people.rows.filter((person) => person.programId === activeProgram.id) : []
  const activePasses = activeProgram ? passes.rows.filter((pass) => pass.programId === activeProgram.id) : []
  const activeCheckIns = activeProgram ? checkIns.rows.filter((checkIn) => checkIn.programId === activeProgram.id) : []

  useEffect(() => {
    if (!orgId) return
    if (!selectedProgramId && sortedPrograms.length === 1) {
      setSelectedProgramId(sortedPrograms[0].id)
      window.localStorage.setItem('sang-crm-selected-program', sortedPrograms[0].id)
      return
    }
    if (selectedProgramId && sortedPrograms.length > 0 && !sortedPrograms.some((program) => program.id === selectedProgramId)) {
      setSelectedProgramId('')
      window.localStorage.removeItem('sang-crm-selected-program')
    }
  }, [orgId, selectedProgramId, sortedPrograms])

  if (!orgId) {
    return <OnboardingPage user={firebaseUser} onComplete={setProfile} />
  }

  function chooseProgram(programId: string) {
    setSelectedProgramId(programId)
    window.localStorage.setItem('sang-crm-selected-program', programId)
    setRoute('dashboard')
  }

  function switchProgram() {
    setSelectedProgramId('')
    window.localStorage.removeItem('sang-crm-selected-program')
  }

  if (shouldChooseProgram) {
    return <ProgramChooserPage events={events.rows} onChoose={chooseProgram} onCreate={() => setRoute('programs')} programs={sortedPrograms} />
  }

  return (
    <Shell onSwitchProgram={switchProgram} organization={organization} route={route} selectedProgram={activeProgram} setRoute={setRoute} user={firebaseUser}>
      {programs.error || roles.error || people.error ? <p className="form-error">{programs.error || roles.error || people.error}</p> : null}
      {route === 'dashboard' && activeProgram && <ProgramWorkspaceDashboard checkIns={activeCheckIns} events={activeEvents} people={activePeople} program={activeProgram} setRoute={setRoute} />}
      {route === 'dashboard' && !activeProgram && <DashboardPage checkIns={checkIns.rows} people={people.rows} programs={sortedPrograms} setRoute={setRoute} />}
      {route === 'events' && activeProgram && <EventsPage events={activeEvents} orgId={orgId} program={activeProgram} uid={firebaseUser.uid} />}
      {route === 'events' && !activeProgram && <ProgramsPage events={events.rows} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} />}
      {route === 'programs' && <ProgramsPage events={events.rows} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} />}
      {route === 'roles' && <RolesPage orgId={orgId} roles={roles.rows} />}
      {route === 'team' && <TeamPage events={events.rows} members={members.rows} orgId={orgId} programs={sortedPrograms} roles={roles.rows} />}
      {route === 'people' && <PeoplePage events={activeProgram ? activeEvents : events.rows} orgId={orgId} passes={activeProgram ? activePasses : passes.rows} people={activeProgram ? activePeople : people.rows} programs={activeProgram ? [activeProgram] : sortedPrograms} />}
      {route === 'checkin' && <CheckInPage events={activeProgram ? activeEvents : events.rows} orgId={orgId} programs={activeProgram ? [activeProgram] : sortedPrograms} />}
      {route === 'analytics' && <AnalyticsPage checkIns={activeProgram ? activeCheckIns : checkIns.rows} people={activeProgram ? activePeople : people.rows} programs={activeProgram ? [activeProgram] : sortedPrograms} />}
    </Shell>
  )
}

function App() {
  const { firebaseUser, profile, setProfile, loading } = useAuthProfile()

  if (loading) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" size={28} />
        <span>Opening Sang Event CRM</span>
      </main>
    )
  }

  if (!firebaseUser) {
    return <AuthPage />
  }

  if (!profile) {
    return <OnboardingPage user={firebaseUser} onComplete={setProfile} />
  }

  return <CrmApp firebaseUser={firebaseUser} profile={profile} setProfile={setProfile} />
}

export default App
