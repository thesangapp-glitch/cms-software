import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  ClipboardList,
  Copy,
  Download,
  Eye,
  LayoutDashboard,
  Link2,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  Save,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
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
import { LandingPage } from './landing/LandingPage'

type RouteKey = 'dashboard' | 'events' | 'programs' | 'settings' | 'roles' | 'team' | 'people' | 'checkin' | 'analytics'
type PersonKind = 'attendee' | 'participant' | 'speaker' | 'staff'
type ProgramMode = 'standalone' | 'multiEvent'
type TeamScope = 'organization' | 'program' | 'event'
type EntryScope = 'program' | 'event' | 'both'
type JoinMode = 'direct_join' | 'request_approval' | 'invite_only'
type ScheduleType = 'session' | 'round' | 'break' | 'checkin' | 'performance' | 'result' | 'ceremony' | 'custom'
type ScheduleStatus = 'draft' | 'scheduled' | 'delayed' | 'cancelled' | 'completed'
type ScheduleVisibility = 'public' | 'staffOnly' | 'participantsOnly'

type EventProfile = {
  id: string
  name: string
  role: string
  organization?: string
  bio?: string
  photoUrl?: string
}

const programTypeOptions = [
  { value: 'college_fest', label: 'College fest' },
  { value: 'conference', label: 'Conference' },
  { value: 'corporate_event', label: 'Corporate event' },
  { value: 'competition', label: 'Competition' },
  { value: 'workshop_series', label: 'Workshop series' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'community_event', label: 'Community event' },
  { value: 'custom', label: 'Custom' },
]

const orgCategoryOptions = [
  { value: 'College fest', label: 'College fest' },
  { value: 'Conference', label: 'Conference' },
  { value: 'Corporate event', label: 'Corporate event' },
  { value: 'Event management agency', label: 'Event management agency' },
  { value: 'College / university', label: 'College / university' },
  { value: 'Startup event', label: 'Startup event' },
  { value: 'Community event', label: 'Community event' },
]

const eventTypeOptions = [
  { value: 'session', label: 'Session / talk' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'competition', label: 'Competition' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'poster_session', label: 'Poster session' },
  { value: 'performance', label: 'Performance' },
  { value: 'exhibition', label: 'Exhibition / booth' },
  { value: 'gate_zone', label: 'Gate / entry zone' },
  { value: 'custom', label: 'Custom' },
]

const scheduleTypeOptions: Array<{ value: ScheduleType; label: string }> = [
  { value: 'session', label: 'Session' },
  { value: 'round', label: 'Competition round' },
  { value: 'break', label: 'Break' },
  { value: 'checkin', label: 'Check-in window' },
  { value: 'performance', label: 'Performance' },
  { value: 'result', label: 'Result announcement' },
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'custom', label: 'Custom' },
]

function isKnownOption(options: Array<{ value: string }>, value?: string) {
  return Boolean(value && options.some((option) => option.value === value))
}

function optionLabel(options: Array<{ value: string; label: string }>, value?: string, fallback = 'Custom') {
  if (!value) return fallback
  return options.find((option) => option.value === value)?.label || value
}

function selectValueOrCustom(options: Array<{ value: string }>, value: string | undefined, fallback: string) {
  if (!value) return fallback
  return isKnownOption(options, value) ? value : 'custom'
}

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
  logoUrl?: string
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
  programType?: string
  status: 'draft' | 'live' | 'archived'
  startDate: string
  endDate: string
  venueName: string
  city: string
  logoUrl?: string
  bannerUrl?: string
  posterUrl?: string
  latitude?: number
  longitude?: number
  address?: string
  timezone: string
  description?: string
  entryScope?: EntryScope
  competitive?: boolean
  resultsEnabled?: boolean
  joinQrEnabled?: boolean
}

type ProgramEvent = {
  id: string
  orgId: string
  programId: string
  name: string
  eventType?: string
  startDateTime: string
  endDateTime: string
  multiDate?: boolean
  venueName: string
  locationNote?: string
  posterUrl?: string
  latitude?: number
  longitude?: number
  address?: string
  entryScope?: EntryScope
  competitive?: boolean
  resultsEnabled?: boolean
  scheduleItemCount?: number
  nextScheduleTitle?: string
  nextScheduleAt?: string
  profiles?: EventProfile[]
  status: 'draft' | 'live' | 'completed'
}

type ScheduleItem = {
  id: string
  orgId: string
  programId: string
  eventId?: string
  title: string
  type: ScheduleType
  customTypeLabel?: string
  description?: string
  startsAt: string
  endsAt?: string
  timezone: string
  venueName?: string
  roomName?: string
  latitude?: number
  longitude?: number
  visibility: ScheduleVisibility
  status: ScheduleStatus
  sortOrder?: number
}

type ProgramJoinLink = {
  id: string
  orgId: string
  programId: string
  mode: JoinMode
  allowedCategory: PersonKind | 'custom'
  customAllowedCategory?: string
  maxUses: number
  usedCount: number
  status: 'active' | 'revoked' | 'expired'
  qrPayload?: string
  campaignName?: string
  expiresAt?: string
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
  settings: 'Settings',
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
  { key: 'settings' as const, icon: Settings },
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

// Errors Firestore emits while auth is transitioning (sign-out / sign-in) or the
// client is tearing down. These are transient, not real failures, so we don't
// surface them in the UI.
function isTransientListenerError(error: { code?: string; message?: string }): boolean {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  return (
    code === 'cancelled' ||
    /database connection is closing|client has already been terminated|the client has been terminated/i.test(message)
  )
}

function useCollection<T extends { id: string }>(dataQuery: Query | null) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(Boolean(dataQuery))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!dataQuery) {
      setRows([])
      setLoading(false)
      setError('')
      return
    }

    let active = true
    setLoading(true)
    setError('')
    const unsubscribe = onSnapshot(
      dataQuery,
      (snapshot) => {
        if (!active) return
        setRows(toRows<T>(snapshot.docs))
        setLoading(false)
      },
      (snapshotError) => {
        if (!active) return
        setLoading(false)
        if (isTransientListenerError(snapshotError)) return
        setError(snapshotError.message)
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [dataQuery])

  return { rows, loading, error }
}

function useAuthProfile() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<PeUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let finished = false
    const fallbackTimer = window.setTimeout(() => {
      if (!finished && mounted) {
        setLoading(false)
      }
    }, 7000)

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!mounted) return
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
        if (mounted) {
          setProfile(userSnapshot.exists() ? (userSnapshot.data() as PeUser) : null)
        }
      } catch (profileError) {
        // Transient read failures during an auth transition shouldn't crash the app.
        console.warn('Could not load user profile:', profileError)
      } finally {
        finished = true
        window.clearTimeout(fallbackTimer)
        if (mounted) setLoading(false)
      }
    })

    return () => {
      mounted = false
      window.clearTimeout(fallbackTimer)
      unsubscribe()
    }
  }, [])

  return { firebaseUser, profile, setProfile, loading }
}

const createOrganizationCallable = httpsCallable<{ displayName: string; orgName: string; industry: string; website: string; logoUrl: string; email: string }, { orgId: string }>(functions, 'createOrganization')
const updateOrganizationCallable = httpsCallable<{ orgId: string; name: string; industry: string; website: string; logoUrl: string }, { orgId: string }>(functions, 'updateOrganization')
const setActiveOrganizationCallable = httpsCallable<{ orgId: string }, { orgId: string }>(functions, 'setActiveOrganization')
const claimTeamAccessCallable = httpsCallable<void, { claimedOrgIds: string[] }>(functions, 'claimTeamAccess')
const createRoleCallable = httpsCallable<{ orgId: string; roleId: string; name: string; description: string; permissions: string[] }, { roleId: string }>(functions, 'createRole')
const inviteTeamMemberCallable = httpsCallable<{ orgId: string; email: string; displayName: string; roleId: string; scope: TeamScope; programId?: string; eventId?: string }, { teamMemberId: string }>(functions, 'inviteTeamMember')
const createProgramCallable = httpsCallable<Omit<Program, 'id' | 'status'>, { programId: string }>(functions, 'createProgram')
const updateProgramCallable = httpsCallable<Omit<Program, 'id'> & { programId: string }, { programId: string }>(functions, 'updateProgram')
const deleteProgramCallable = httpsCallable<{ orgId: string; programId: string }, { programId: string }>(functions, 'deleteProgram')
const createEventCallable = httpsCallable<Omit<ProgramEvent, 'id' | 'status'>, { eventId: string }>(functions, 'createEvent')
const updateEventCallable = httpsCallable<Partial<Omit<ProgramEvent, 'id'>> & { eventId: string }, { eventId: string }>(functions, 'updateEvent')
const deleteEventCallable = httpsCallable<{ orgId: string; eventId: string }, { eventId: string }>(functions, 'deleteEvent')
const createScheduleItemCallable = httpsCallable<Omit<ScheduleItem, 'id'>, { scheduleItemId: string }>(functions, 'createScheduleItem')
const deleteScheduleItemCallable = httpsCallable<{ orgId: string; scheduleItemId: string }, { scheduleItemId: string }>(functions, 'deleteScheduleItem')
const createProgramJoinLinkCallable = httpsCallable<{ orgId: string; programId: string; mode: JoinMode; allowedCategory: PersonKind | 'custom'; customAllowedCategory?: string; allowedEventIds: string[]; maxUses: number; expiresAt: string; campaignName: string }, { joinLinkId: string; qrPayload: string }>(functions, 'createProgramJoinLink')
const createProgramPersonAndPassCallable = httpsCallable<Omit<ProgramPerson, 'id' | 'passId' | 'passStatus' | 'sangUid'> & { eventIds?: string[] }, { programPersonId: string; passId: string; qrPayload: string }>(functions, 'createProgramPersonAndPass')
const createScannerSession = httpsCallable<{ orgId: string; programId: string; eventId?: string; gateName?: string }, { scannerSessionId: string; scannerToken: string }>(functions, 'createScannerSession')
const scanPassToken = httpsCallable<{ scannerSessionId: string; scannerToken: string; payload: string; deviceScanId: string }, { result: string; passId: string; programPersonId: string }>(functions, 'scanPassToken')

async function createOrganizationWithOwner(user: User, input: { displayName: string; orgName: string; industry: string; website: string; logoUrl: string }) {
  const response = await createOrganizationCallable({
    displayName: input.displayName.trim(),
    orgName: input.orgName.trim(),
    industry: input.industry.trim(),
    website: input.website.trim(),
    logoUrl: input.logoUrl.trim(),
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

function authErrorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : ''
}

function friendlyAuthMessage(error: unknown, fallback: string): string {
  switch (authErrorCode(error)) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in below, or use “Continue with Google” if you signed up with Google.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/missing-password':
      return 'Please enter your password.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.'
    case 'auth/user-not-found':
      return 'No account found with this email. Create one instead.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact support.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Sign-in was cancelled.'
    default:
      return error instanceof Error ? error.message : fallback
  }
}

function AuthPage({ onBack }: { onBack?: () => void }) {
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
      // Account already exists: move the user to sign-in so they can continue with their password.
      if (mode === 'signup' && authErrorCode(authError) === 'auth/email-already-in-use') {
        setMode('signin')
      }
      setError(friendlyAuthMessage(authError, 'Authentication failed'))
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
      setError(friendlyAuthMessage(authError, 'Google sign-in failed'))
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
          {onBack && (
            <button className="auth-back" onClick={onBack} type="button">
              <ChevronRight size={15} style={{ transform: 'rotate(180deg)' }} />
              Back to site
            </button>
          )}
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
  const [displayName, setDisplayName] = useState(user.displayName || user.email?.split('@')[0] || '')
  const [orgName, setOrgName] = useState('')
  const [industry, setIndustry] = useState('College fest')
  const [website, setWebsite] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function leaveSetup() {
    setError('')
    setLoading(true)
    try {
      await signOut(auth)
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : 'Could not sign out')
      setLoading(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const profile = await createOrganizationWithOwner(user, { displayName, orgName, industry, website, logoUrl })
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
        <div className="setup-card-head">
          <div>
            <span className="eyebrow">Workspace setup</span>
            <h1>Set up your organization</h1>
          </div>
          <button className="secondary-button setup-signout" disabled={loading} onClick={leaveSetup} type="button">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
        <p>Add the organization that will manage your programs, team, guests, passes, and event operations.</p>
        <div className="setup-account-note">
          <ShieldCheck size={16} />
          <span>
            Signed in as <strong>{user.email || user.phoneNumber || user.displayName || 'this account'}</strong>.
          </span>
        </div>

        <div className="form-grid two">
          {!user.displayName && (
            <label>
              Owner name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>
          )}
          <label>
            Organization name
            <input placeholder="Your organization or event company" value={orgName} onChange={(event) => setOrgName(event.target.value)} required />
          </label>
          <label>
            Event category
            <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
              {orgCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Website
            <input placeholder="https://..." value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
        </div>
        <ImageUploader folder="organization-logos" label="Organization logo" onChange={setLogoUrl} uid={user.uid} value={logoUrl} />

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

function sanitizeRichText(value: string) {
  if (!value) return ''
  if (typeof document === 'undefined') {
    return value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
  }

  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'H2', 'H3'])
  const template = document.createElement('template')
  template.innerHTML = value

  function cleanNode(node: Node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement
      if (!allowedTags.has(element.tagName)) {
        const parent = element.parentNode
        while (element.firstChild) parent?.insertBefore(element.firstChild, element)
        parent?.removeChild(element)
        return
      }
      for (const attribute of Array.from(element.attributes)) {
        element.removeAttribute(attribute.name)
      }
    }
    for (const child of Array.from(node.childNodes)) {
      cleanNode(child)
    }
  }

  cleanNode(template.content)
  return template.innerHTML.trim()
}

function richTextToPlainText(value?: string) {
  if (!value) return ''
  if (typeof document === 'undefined') return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const wrapper = document.createElement('div')
  wrapper.innerHTML = sanitizeRichText(value)
  return wrapper.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function RichTextPreview({ value, fallback }: { value?: string; fallback: string }) {
  const safeValue = sanitizeRichText(value || '')
  if (!safeValue) return <p>{fallback}</p>
  return <div className="rich-text-preview" dangerouslySetInnerHTML={{ __html: safeValue }} />
}

function RichTextEditor({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const editorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor) return
    const nextValue = sanitizeRichText(value)
    if (editor.innerHTML !== nextValue) editor.innerHTML = nextValue
  }, [value])

  function commit() {
    onChange(sanitizeRichText(editorRef.current?.innerHTML || ''))
  }

  function runCommand(command: string, commandValue?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    commit()
  }

  return (
    <label className="rich-text-field">
      {label}
      <div className="rich-text-shell">
        <div className="rich-text-toolbar" aria-label={`${label} formatting`}>
          <button onClick={() => runCommand('bold')} title="Bold" type="button"><strong>B</strong></button>
          <button onClick={() => runCommand('italic')} title="Italic" type="button"><em>I</em></button>
          <button onClick={() => runCommand('formatBlock', 'H2')} title="Heading" type="button">H2</button>
          <button onClick={() => runCommand('formatBlock', 'P')} title="Normal text" type="button">P</button>
          <button onClick={() => runCommand('insertUnorderedList')} title="Bullet list" type="button">•</button>
          <button onClick={() => runCommand('insertOrderedList')} title="Numbered list" type="button">1.</button>
        </div>
        <div
          aria-label={label}
          className="rich-text-editor"
          contentEditable
          data-placeholder={placeholder}
          onBlur={commit}
          onInput={commit}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />
      </div>
    </label>
  )
}

function makeLocalId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function Modal({
  title,
  eyebrow,
  open,
  onClose,
  children,
  wide = false,
}: {
  title: string
  eyebrow?: string
  open: boolean
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" className={wide ? 'modal-card wide' : 'modal-card'} role="dialog">
        <div className="modal-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="Close" type="button">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
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
      {value && (
        <button className="secondary-button subtle-button" onClick={() => onChange('')} type="button">
          <X size={15} />
          Remove {label.toLowerCase()}
        </button>
      )}
    </div>
  )
}

type LocationSuggestion = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type?: string
  address?: {
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
  }
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
  const [searching, setSearching] = useState(false)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searchError, setSearchError] = useState('')

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
    const queryText = venue.trim()
    setSearchError('')
    if (queryText.length < 3) {
      setSuggestions([])
      setSearching(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true)
      try {
        const params = new URLSearchParams({
          q: queryText,
          format: 'jsonv2',
          addressdetails: '1',
          limit: '6',
        })
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Location search failed.')
        const data = (await response.json()) as LocationSuggestion[]
        setSuggestions(data)
      } catch (locationError) {
        if ((locationError as { name?: string }).name !== 'AbortError') {
          setSearchError('Could not search locations right now.')
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 450)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [venue])

  function chooseSuggestion(suggestion: LocationSuggestion) {
    const latitude = Number(suggestion.lat)
    const longitude = Number(suggestion.lon)
    onVenueChange(suggestion.display_name)
    onPick({ latitude, longitude })
    setSuggestions([])
    const next: L.LatLngExpression = [latitude, longitude]
    markerRef.current?.setLatLng(next)
    mapRef.current?.setView(next, 15)
  }

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || lat === undefined || lng === undefined) return
    const next: L.LatLngExpression = [lat, lng]
    markerRef.current.setLatLng(next)
    mapRef.current.setView(next, Math.max(mapRef.current.getZoom(), 13))
  }, [lat, lng])

  return (
    <div className="map-picker">
      <div className="location-search">
        <label>
          {label}
          <span className="location-input-wrap">
            <Search size={16} />
            <input placeholder="Search venue, city, hotel, campus, hall..." value={venue} onChange={(event) => onVenueChange(event.target.value)} />
          </span>
        </label>
        {(suggestions.length > 0 || searching || searchError) && (
          <div className="location-results">
            {searching && <span className="location-result muted"><Loader2 className="spin" size={15} /> Searching...</span>}
            {searchError && <span className="location-result muted">{searchError}</span>}
            {suggestions.map((suggestion) => (
              <button className="location-result" key={suggestion.place_id} onClick={() => chooseSuggestion(suggestion)} type="button">
                <MapPin size={15} />
                <span>
                  <strong>{suggestion.display_name.split(',')[0]}</strong>
                  <small>{suggestion.display_name}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="map-canvas" ref={containerRef} />
      <div className="coordinate-row">
        <span>Lat {lat?.toFixed(5) || '-'}</span>
        <span>Lng {lng?.toFixed(5) || '-'}</span>
      </div>
    </div>
  )
}

function EventProfilesEditor({
  uid,
  profiles,
  onChange,
}: {
  uid: string
  profiles: EventProfile[]
  onChange: (profiles: EventProfile[]) => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('Speaker')
  const [customRole, setCustomRole] = useState('')
  const [organization, setOrganization] = useState('')
  const [bio, setBio] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')

  function addProfile() {
    if (!name.trim()) return
    onChange([
      ...profiles,
      {
        id: makeLocalId(),
        name: name.trim(),
        role: role === 'Custom profile' ? customRole.trim() || 'Custom profile' : role.trim() || 'Profile',
        organization: organization.trim(),
        bio: bio.trim(),
        photoUrl: photoUrl.trim(),
      },
    ])
    setName('')
    setRole('Speaker')
    setCustomRole('')
    setOrganization('')
    setBio('')
    setPhotoUrl('')
  }

  function removeProfile(profileId: string) {
    onChange(profiles.filter((profile) => profile.id !== profileId))
  }

  return (
    <section className="profile-editor">
      <div className="section-mini-head">
        <div>
          <span className="eyebrow">Profiles</span>
          <h3>Speakers, guests, judges, mentors</h3>
        </div>
        <span>{profiles.length} added</span>
      </div>
      <div className="profile-input-grid">
        <div className="form-grid two">
          <label>
            Name
            <input placeholder="Speaker or judge name" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Profile type
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option>Speaker</option>
              <option>Chief guest</option>
              <option>Judge</option>
              <option>Mentor</option>
              <option>Performer</option>
              <option>Organizer</option>
              <option>Custom profile</option>
            </select>
          </label>
          <label>
            Organization / title
            <input placeholder="Company, college, designation" value={organization} onChange={(event) => setOrganization(event.target.value)} />
          </label>
          {role === 'Custom profile' && (
            <label>
              Custom profile type
              <input placeholder="Anchor, curator, panelist..." value={customRole} onChange={(event) => setCustomRole(event.target.value)} />
            </label>
          )}
          <ImageUploader folder="event-profiles" label="Profile photo" onChange={setPhotoUrl} uid={uid} value={photoUrl} />
        </div>
        <label>
          Short bio
          <textarea placeholder="Optional short introduction" value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
        <button className="secondary-button" disabled={!name.trim()} onClick={addProfile} type="button">
          <UserRound size={16} />
          Add profile
        </button>
      </div>

      {profiles.length > 0 && (
        <div className="profile-list">
          {profiles.map((profile) => (
            <article className="profile-chip-card" key={profile.id}>
              {profile.photoUrl ? <img alt="" src={profile.photoUrl} /> : <div><UserRound size={18} /></div>}
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.role}{profile.organization ? ` - ${profile.organization}` : ''}</small>
              </span>
              <button className="icon-button" onClick={() => removeProfile(profile.id)} title="Remove profile" type="button">
                <X size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
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
              const aboutPreview = richTextToPlainText(program.description)
              return (
                <button className="program-choice-card" key={program.id} onClick={() => onChoose(program.id)} type="button">
                  {program.bannerUrl || program.posterUrl ? <img alt="" src={program.bannerUrl || program.posterUrl} /> : <div className="program-choice-fallback"><CalendarDays size={24} /></div>}
                  <span className={`status ${program.status}`}>{program.status}</span>
                  <strong>{program.name}</strong>
                  <p>{aboutPreview || `${programEvents.length} events ready to manage.`}</p>
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

function OrganizationChooserPage({
  profile,
  onChoose,
}: {
  profile: PeUser
  onChoose: (orgId: string) => void
}) {
  const [organizations, setOrganizations] = useState<Organization[]>([])

  useEffect(() => {
    let mounted = true
    async function loadOrganizations() {
      const snapshots = await Promise.all(profile.organizationIds.map((orgId) => getDoc(doc(db, 'peOrganizations', orgId))))
      if (!mounted) return
      setOrganizations(snapshots.filter((snapshot) => snapshot.exists()).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Organization))
    }
    loadOrganizations()
    return () => {
      mounted = false
    }
  }, [profile.organizationIds])

  return (
    <main className="main-surface chooser-surface">
      <section className="program-chooser">
        <div className="chooser-head">
          <div>
            <span className="eyebrow">Choose organization</span>
            <h1>Select the workspace to open</h1>
            <p>Your CRM dashboard opens inside one organization first, then inside one program.</p>
          </div>
        </div>
        <div className="program-choice-grid">
          {organizations.map((organization) => (
            <button className="program-choice-card org-choice-card" key={organization.id} onClick={() => onChoose(organization.id)} type="button">
              {organization.logoUrl ? <img alt="" src={organization.logoUrl} /> : <div className="program-choice-fallback"><Building2 size={24} /></div>}
              <strong>{organization.name}</strong>
              <p>{organization.industry || 'Event organization'}</p>
              <small><Link2 size={13} /> {organization.website || organization.id}</small>
              <div>
                <span>Open workspace</span>
                <ChevronRight size={18} />
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

function ProgramWorkspaceDashboard({
  program,
  events,
  people,
  checkIns,
  joinLinks,
  setRoute,
}: {
  program: Program
  events: ProgramEvent[]
  people: ProgramPerson[]
  checkIns: CheckIn[]
  joinLinks: ProgramJoinLink[]
  setRoute: (route: RouteKey) => void
}) {
  const issuedPasses = people.filter((person) => person.passStatus === 'issued' || person.passStatus === 'checkedIn').length
  const checkedIn = people.filter((person) => person.passStatus === 'checkedIn').length
  const activeJoinLink = joinLinks.find((link) => link.programId === program.id && link.status === 'active')

  return (
    <section className="page-stack">
      <section className="workspace-hero">
        {program.bannerUrl || program.posterUrl ? <img alt="" src={program.bannerUrl || program.posterUrl} /> : <div className="program-art-fallback"><CalendarDays size={28} /></div>}
        <div>
          <span className="eyebrow">{program.mode === 'standalone' ? 'Standalone program' : 'Selected program'}</span>
          <h1>{program.name}</h1>
          <RichTextPreview fallback="Program workspace is ready. Add events, import people, issue passes, and track check-ins from here." value={program.description} />
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

      <div className="quick-action-grid">
        <button className="quick-action" onClick={() => setRoute('settings')} type="button">
          <Settings size={20} />
          <span>
            <strong>Program profile</strong>
            <small>Logo, banner, dates, type, QR access</small>
          </span>
        </button>
        <button className="quick-action" onClick={() => setRoute('people')} type="button">
          <Users size={20} />
          <span>
            <strong>People and passes</strong>
            <small>Upload attendees, participants, staff</small>
          </span>
        </button>
        <button className="quick-action" onClick={() => setRoute('checkin')} type="button">
          <ScanLine size={20} />
          <span>
            <strong>Entry gates</strong>
            <small>One program pass, event access checked at scan</small>
          </span>
        </button>
        <button className="quick-action" onClick={() => setRoute('settings')} type="button">
          <QrCode size={20} />
          <span>
            <strong>Program QR</strong>
            <small>{activeJoinLink ? 'Ready for Sang Scan-to-Join' : 'Generate join/request QR'}</small>
          </span>
        </button>
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

function ProgramsPage({
  orgId,
  uid,
  programs,
  events,
  onChoose,
}: {
  orgId: string
  uid: string
  programs: Program[]
  events: ProgramEvent[]
  onChoose?: (programId: string) => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProgramMode>('multiEvent')
  const [programType, setProgramType] = useState('college_fest')
  const [customProgramType, setCustomProgramType] = useState('')
  const [startDate, setStartDate] = useState(nowDateInput())
  const [endDate, setEndDate] = useState(nowDateInput())
  const [venueName, setVenueName] = useState('')
  const [city, setCity] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>()
  const [longitude, setLongitude] = useState<number | undefined>()
  const [description, setDescription] = useState('')
  const [competitive, setCompetitive] = useState(false)
  const [resultsEnabled, setResultsEnabled] = useState(false)
  const [joinQrEnabled, setJoinQrEnabled] = useState(true)
  const [createOpen, setCreateOpen] = useState(programs.length === 0)
  const [busy, setBusy] = useState(false)
  const [deletingProgramId, setDeletingProgramId] = useState('')
  const [error, setError] = useState('')
  const visiblePrograms = programs.filter((program) => program.status !== 'archived')

  async function createProgram(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await createProgramCallable({
        orgId,
        name: name.trim(),
        mode,
        programType: programType === 'custom' ? customProgramType.trim() || 'custom' : programType,
        startDate,
        endDate,
        venueName: venueName.trim(),
        city: city.trim(),
        logoUrl: logoUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueName.trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        description: description.trim(),
        entryScope: 'program',
        competitive,
        resultsEnabled: competitive ? resultsEnabled : false,
        joinQrEnabled,
      })
      setName('')
      setMode('multiEvent')
      setProgramType('college_fest')
      setCustomProgramType('')
      setStartDate(nowDateInput())
      setEndDate(nowDateInput())
      setVenueName('')
      setCity('')
      setLogoUrl('')
      setBannerUrl('')
      setPosterUrl('')
      setLatitude(undefined)
      setLongitude(undefined)
      setDescription('')
      setCompetitive(false)
      setResultsEnabled(false)
      setJoinQrEnabled(true)
      setCreateOpen(false)
      onChoose?.(response.data.programId)
    } catch (programError) {
      setError(programError instanceof Error ? programError.message : 'Unable to create program.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteProgramFromList(program: Program) {
    const confirmed = window.confirm(`Delete "${program.name}"? It will be removed from active program screens, while past people, passes, and check-in history stay preserved.`)
    if (!confirmed) return
    setError('')
    setDeletingProgramId(program.id)
    try {
      await deleteProgramCallable({ orgId, programId: program.id })
    } catch (programError) {
      setError(programError instanceof Error ? programError.message : 'Unable to delete program.')
    } finally {
      setDeletingProgramId('')
    }
  }

  return (
    <section className="page-stack">
      <section className="events-command command-premium">
        <div>
          <span className="eyebrow">Programs</span>
          <h1>Program command center</h1>
          <p>Create conferences, college festivals, corporate events, competitions, or standalone programs. Each program owns its people, passes, events, schedule, QR, and analytics.</p>
        </div>
        <button className="primary-button" onClick={() => setCreateOpen(true)} type="button">
          <Plus size={17} />
          Create program
        </button>
      </section>

      {visiblePrograms.length === 0 ? (
        <section className="panel premium-empty-panel">
          <EmptyState title="No programs yet" body="Create the first program, upload artwork, set dates and venue, then add events and people from the workspace." />
          <button className="primary-button" onClick={() => setCreateOpen(true)} type="button">
            <Plus size={17} />
            Add first program
          </button>
        </section>
      ) : (
        <div className="program-card-grid">
          {visiblePrograms.map((program) => (
            <ProgramBlock
              deleting={deletingProgramId === program.id}
              events={events.filter((programEvent) => programEvent.programId === program.id)}
              key={program.id}
              onDelete={deleteProgramFromList}
              onOpen={onChoose}
              program={program}
            />
          ))}
        </div>
      )}

      <Modal eyebrow="Program setup" onClose={() => setCreateOpen(false)} open={createOpen} title="Create program" wide>
        <form className="modal-form" onSubmit={createProgram}>
          <div className="form-grid two">
            <label>
              Program name
              <input placeholder="Annual Tech Summit 2026" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Program type
              <select value={programType} onChange={(event) => setProgramType(event.target.value)}>
                {programTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            {programType === 'custom' && (
              <label>
                Custom program type
                <input placeholder="Symposium, hackathon, annual meet..." value={customProgramType} onChange={(event) => setCustomProgramType(event.target.value)} required />
              </label>
            )}
            <label>
              Mode
              <select value={mode} onChange={(event) => setMode(event.target.value as ProgramMode)}>
                <option value="multiEvent">Multi-event program</option>
                <option value="standalone">Standalone program/event</option>
              </select>
            </label>
            <label>
              City
              <input placeholder="Delhi" value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
            <label>
              Start date
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </label>
            <label>
              End date
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
            </label>
          </div>

          <div className="form-grid three">
            <ImageUploader folder="program-logos" label="Program logo" onChange={setLogoUrl} uid={uid} value={logoUrl} />
            <ImageUploader folder="program-banners" label="Program banner" onChange={setBannerUrl} uid={uid} value={bannerUrl} />
            <ImageUploader folder="program-posters" label="Program poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
          </div>

          <MapPicker
            label="Primary venue"
            lat={latitude}
            lng={longitude}
            onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
            onVenueChange={setVenueName}
            venue={venueName}
          />

          <div className="assignment-box">
            <span>Access and results</span>
            <div className="form-grid two">
              <label className="check-row">
                <input checked={joinQrEnabled} onChange={(event) => setJoinQrEnabled(event.target.checked)} type="checkbox" />
                <span>Enable one secure program QR/pass for Sang entry and join flow</span>
              </label>
              <label className="check-row">
                <input checked={competitive} onChange={(event) => { setCompetitive(event.target.checked); if (!event.target.checked) setResultsEnabled(false) }} type="checkbox" />
                <span>This program has competition/results</span>
              </label>
              {competitive && (
                <label className="check-row">
                  <input checked={resultsEnabled} onChange={(event) => setResultsEnabled(event.target.checked)} type="checkbox" />
                  <span>Results will be published from CRM</span>
                </label>
              )}
            </div>
          </div>

          <RichTextEditor label="About this program" onChange={setDescription} placeholder="Write a polished program overview with headings, bullets, and highlights." value={description} />

          {error && <p className="form-error">{error}</p>}

          <div className="action-row">
            <button className="secondary-button" onClick={() => setCreateOpen(false)} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
              Create program
            </button>
          </div>
        </form>
      </Modal>
    </section>
  )
}

function ProgramBlock({
  program,
  events,
  onOpen,
  onDelete,
  deleting,
}: {
  program: Program
  events: ProgramEvent[]
  onOpen?: (programId: string) => void
  onDelete?: (program: Program) => void
  deleting?: boolean
}) {
  const programTypeLabel = optionLabel(programTypeOptions, program.programType, 'Program')
  const heroImage = program.bannerUrl || program.posterUrl || program.logoUrl
  const visibleEvents = events.slice(0, 3)
  const aboutPreview = richTextToPlainText(program.description)

  return (
    <article className="program-card-premium">
      <div className="program-hero">
        {heroImage ? <img alt="" src={heroImage} /> : <div className="program-art-fallback"><CalendarDays size={26} /></div>}
        <div>
          <span className="eyebrow">{program.mode === 'standalone' ? 'Standalone event' : programTypeLabel}</span>
          <strong>{program.name}</strong>
          <p>{aboutPreview || 'No about section added yet.'}</p>
          <span><MapPin size={14} /> {program.venueName || 'Venue pending'} {program.city ? `· ${program.city}` : ''}</span>
          {program.latitude && program.longitude && <span>{program.latitude.toFixed(5)}, {program.longitude.toFixed(5)}</span>}
        </div>
        <span className={`status ${program.status}`}>{program.mode === 'standalone' ? 'standalone' : `${events.length} events`}</span>
      </div>

      {events.length > 0 && (
        <div className="event-card-grid">
          {visibleEvents.map((programEvent) => (
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
          {events.length > visibleEvents.length && <div className="event-card more-card">+{events.length - visibleEvents.length} more events</div>}
        </div>
      )}
      <div className="program-card-footer">
        <span><QrCode size={14} /> One program QR/pass</span>
        {onOpen && (
          <button className="secondary-button" onClick={() => onOpen(program.id)} type="button">
            Open workspace
            <ChevronRight size={16} />
          </button>
        )}
        {onDelete && (
          <button className="danger-button subtle-button" disabled={deleting} onClick={() => onDelete(program)} type="button">
            {deleting ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
            Delete
          </button>
        )}
      </div>
    </article>
  )
}

function EventsPage({ orgId, uid, program, events, scheduleItems }: { orgId: string; uid: string; program: Program; events: ProgramEvent[]; scheduleItems: ScheduleItem[] }) {
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id || '')
  const selectedEvent = events.find((event) => event.id === selectedEventId) || null
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('session')
  const [customEventType, setCustomEventType] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [multiDate, setMultiDate] = useState(false)
  const [venueName, setVenueName] = useState(program.venueName || '')
  const [locationNote, setLocationNote] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>(program.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(program.longitude)
  const [entryScope, setEntryScope] = useState<EntryScope>(program.entryScope === 'both' ? 'both' : 'event')
  const [profiles, setProfiles] = useState<EventProfile[]>([])
  const [competitive, setCompetitive] = useState(Boolean(program.competitive))
  const [resultsEnabled, setResultsEnabled] = useState(Boolean(program.resultsEnabled))
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
    setEventType(selectValueOrCustom(eventTypeOptions, selectedEvent.eventType, 'session'))
    setCustomEventType(isKnownOption(eventTypeOptions, selectedEvent.eventType) ? '' : selectedEvent.eventType || '')
    setStartDateTime(selectedEvent.startDateTime || '')
    setEndDateTime(selectedEvent.endDateTime || '')
    setMultiDate(Boolean(selectedEvent.multiDate))
    setVenueName(selectedEvent.venueName || program.venueName || '')
    setLocationNote(selectedEvent.locationNote || '')
    setPosterUrl(selectedEvent.posterUrl || '')
    setLatitude(selectedEvent.latitude ?? program.latitude)
    setLongitude(selectedEvent.longitude ?? program.longitude)
    setEntryScope(selectedEvent.entryScope || (program.entryScope === 'both' ? 'both' : 'event'))
    setProfiles(selectedEvent.profiles || [])
    setCompetitive(Boolean(selectedEvent.competitive ?? program.competitive))
    setResultsEnabled(Boolean(selectedEvent.resultsEnabled))
  }, [program.competitive, program.entryScope, program.latitude, program.longitude, program.venueName, selectedEvent])

  async function createEvent(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await createEventCallable({
        orgId,
        programId: program.id,
        name: eventName.trim(),
        eventType: eventType === 'custom' ? customEventType.trim() || 'custom' : eventType,
        startDateTime,
        endDateTime,
        multiDate,
        venueName: venueName.trim(),
        locationNote: locationNote.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueName.trim(),
        entryScope,
        profiles,
        competitive,
        resultsEnabled: program.competitive && competitive ? resultsEnabled : false,
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
        eventType: eventType === 'custom' ? customEventType.trim() || 'custom' : eventType,
        startDateTime,
        endDateTime,
        multiDate,
        venueName: venueName.trim(),
        locationNote: locationNote.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueName.trim(),
        entryScope,
        profiles,
        competitive,
        resultsEnabled: program.competitive && competitive ? resultsEnabled : false,
        scheduleItemCount: scheduleItems.filter((item) => item.eventId === selectedEvent.id).length,
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
    setEventType('session')
    setCustomEventType('')
    setStartDateTime('')
    setEndDateTime('')
    setMultiDate(false)
    setVenueName(program.venueName || '')
    setLocationNote('')
    setPosterUrl('')
    setLatitude(program.latitude)
    setLongitude(program.longitude)
    setEntryScope(program.entryScope === 'both' ? 'both' : 'event')
    setProfiles([])
    setCompetitive(Boolean(program.competitive))
    setResultsEnabled(Boolean(program.resultsEnabled))
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
                <>
                <div className="event-read-view">
                  {selectedEvent.posterUrl ? <img alt="" src={selectedEvent.posterUrl} /> : <div className="event-card-fallback"><CalendarDays size={22} /></div>}
                  <div>
                    <span className={`status ${selectedEvent.status}`}>{selectedEvent.status}</span>
                    <h1>{selectedEvent.name}</h1>
                    <p>{selectedEvent.locationNote || 'No location note added yet.'}</p>
                    <span><CalendarDays size={14} /> {selectedEvent.startDateTime || 'Start pending'} to {selectedEvent.endDateTime || 'End pending'}</span>
                    <span><MapPin size={14} /> {selectedEvent.venueName || program.venueName || 'Venue pending'}</span>
                    <span><Ticket size={14} /> Uses the program pass; event access is checked during scan</span>
                    <span><BadgeCheck size={14} /> Results: {selectedEvent.resultsEnabled ? 'enabled' : 'not enabled'}</span>
                    {selectedEvent.latitude && selectedEvent.longitude && <small>{selectedEvent.latitude.toFixed(5)}, {selectedEvent.longitude.toFixed(5)}</small>}
                  </div>
                </div>
                {selectedEvent.profiles && selectedEvent.profiles.length > 0 && (
                  <div className="profile-list read-profiles">
                    {selectedEvent.profiles.map((profile) => (
                      <article className="profile-chip-card" key={profile.id || profile.name}>
                        {profile.photoUrl ? <img alt="" src={profile.photoUrl} /> : <div><UserRound size={18} /></div>}
                        <span>
                          <strong>{profile.name}</strong>
                          <small>{profile.role}{profile.organization ? ` - ${profile.organization}` : ''}</small>
                        </span>
                      </article>
                    ))}
                  </div>
                )}
                </>
              ) : (
                <>
                  <div className="form-grid two">
                    <label>
                      Event name
                      <input placeholder="Opening keynote" value={eventName} onChange={(event) => setEventName(event.target.value)} required />
                    </label>
                    <label>
                      Event type
                      <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
                        {eventTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    {eventType === 'custom' && (
                      <label>
                        Custom event type
                        <input placeholder="Panel, audition, showcase..." value={customEventType} onChange={(event) => setCustomEventType(event.target.value)} />
                      </label>
                    )}
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
                  <div className="assignment-box">
                    <span>Access, dates, and results</span>
                    <div className="form-grid two">
                      <div className="info-callout">
                        <Ticket size={17} />
                        <span>People scan the same program pass. Assign event access from People before opening an event gate.</span>
                      </div>
                      <label className="check-row">
                        <input checked={multiDate} onChange={(event) => setMultiDate(event.target.checked)} type="checkbox" />
                        <span>This event has multiple dates/times. Add exact blocks in Schedule below.</span>
                      </label>
                    </div>
                    {program.competitive && (
                      <div className="form-grid two">
                        <label className="check-row">
                          <input checked={competitive} onChange={(event) => { setCompetitive(event.target.checked); if (!event.target.checked) setResultsEnabled(false) }} type="checkbox" />
                          <span>This event has judging/competition flow</span>
                        </label>
                        <label className="check-row">
                          <input checked={resultsEnabled} disabled={!competitive} onChange={(event) => setResultsEnabled(event.target.checked)} type="checkbox" />
                          <span>Results will be published for this event</span>
                        </label>
                      </div>
                    )}
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
                  <EventProfilesEditor onChange={setProfiles} profiles={profiles} uid={uid} />
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
              {selectedEvent && !editing && (
                <ScheduleManager
                  event={selectedEvent}
                  orgId={orgId}
                  program={program}
                  scheduleItems={scheduleItems.filter((item) => item.eventId === selectedEvent.id)}
                />
              )}
            </form>
          )}
        </section>
      )}
    </section>
  )
}

function ScheduleManager({ orgId, program, event, scheduleItems }: { orgId: string; program: Program; event: ProgramEvent; scheduleItems: ScheduleItem[] }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ScheduleType>('session')
  const [customTypeLabel, setCustomTypeLabel] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [venueName, setVenueName] = useState(event.venueName || program.venueName || '')
  const [roomName, setRoomName] = useState('')
  const [visibility, setVisibility] = useState<ScheduleVisibility>('public')
  const [status, setStatus] = useState<ScheduleStatus>('scheduled')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const sortedItems = [...scheduleItems].sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''))

  async function addScheduleItem(eventSubmit: FormEvent) {
    eventSubmit.preventDefault()
    setBusy(true)
    try {
      await createScheduleItemCallable({
        orgId,
        programId: program.id,
        eventId: event.id,
        title: title.trim(),
        type,
        customTypeLabel: type === 'custom' ? customTypeLabel.trim() : '',
        description: description.trim(),
        startsAt,
        endsAt,
        timezone: program.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        venueName: venueName.trim(),
        roomName: roomName.trim(),
        visibility,
        status,
        sortOrder: sortedItems.length + 1,
      })
      setTitle('')
      setCustomTypeLabel('')
      setStartsAt('')
      setEndsAt('')
      setRoomName('')
      setDescription('')
    } finally {
      setBusy(false)
    }
  }

  async function removeScheduleItem(item: ScheduleItem) {
    const confirmed = window.confirm(`Delete schedule item "${item.title}"?`)
    if (!confirmed) return
    await deleteScheduleItemCallable({ orgId, scheduleItemId: item.id })
  }

  return (
    <section className="schedule-manager">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Schedule</span>
          <h2>Time blocks for this event</h2>
        </div>
        <Clock size={20} />
      </div>

      <form className="schedule-form" onSubmit={addScheduleItem}>
        <div className="form-grid two">
          <label>
            Schedule title
            <input placeholder="Round 1, Poster Session, Tea Break" value={title} onChange={(eventChange) => setTitle(eventChange.target.value)} required />
          </label>
          <label>
            Type
            <select value={type} onChange={(eventChange) => setType(eventChange.target.value as ScheduleType)}>
              {scheduleTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {type === 'custom' && (
            <label>
              Custom schedule type
              <input placeholder="Poster viewing, networking, rehearsal..." value={customTypeLabel} onChange={(eventChange) => setCustomTypeLabel(eventChange.target.value)} />
            </label>
          )}
          <label>
            Starts
            <input type="datetime-local" value={startsAt} onChange={(eventChange) => setStartsAt(eventChange.target.value)} required />
          </label>
          <label>
            Ends
            <input type="datetime-local" value={endsAt} onChange={(eventChange) => setEndsAt(eventChange.target.value)} />
          </label>
          <label>
            Venue
            <input value={venueName} onChange={(eventChange) => setVenueName(eventChange.target.value)} />
          </label>
          <label>
            Room / stage / booth zone
            <input placeholder="Hall A, Stage 2, Poster Zone B" value={roomName} onChange={(eventChange) => setRoomName(eventChange.target.value)} />
          </label>
          <label>
            Visibility
            <select value={visibility} onChange={(eventChange) => setVisibility(eventChange.target.value as ScheduleVisibility)}>
              <option value="public">Public</option>
              <option value="staffOnly">Staff only</option>
              <option value="participantsOnly">Participants only</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(eventChange) => setStatus(eventChange.target.value as ScheduleStatus)}>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="delayed">Delayed</option>
              <option value="cancelled">Cancelled</option>
              <option value="completed">Completed</option>
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea value={description} onChange={(eventChange) => setDescription(eventChange.target.value)} />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
          Add schedule item
        </button>
      </form>

      {sortedItems.length === 0 ? (
        <EmptyState title="No schedule yet" body="Add every date/time block here: check-in, rounds, sessions, breaks, performances, judging, or result announcements." />
      ) : (
        <div className="schedule-list">
          {sortedItems.map((item) => (
            <article className="schedule-item" key={item.id}>
              <div>
                <span className={`status ${item.status}`}>{item.status}</span>
                <strong>{item.title}</strong>
                <small>{item.type === 'custom' && item.customTypeLabel ? item.customTypeLabel : optionLabel(scheduleTypeOptions, item.type)}</small>
                <p>{item.startsAt} {item.endsAt ? `to ${item.endsAt}` : ''}</p>
                <small>{item.venueName || event.venueName || program.venueName || 'Venue pending'} {item.roomName ? `- ${item.roomName}` : ''}</small>
              </div>
              <button className="icon-button" onClick={() => removeScheduleItem(item)} title="Delete schedule item" type="button">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function SettingsPage({
  orgId,
  uid,
  organization,
  program,
  programs,
  joinLinks,
  onProgramSelect,
}: {
  orgId: string
  uid: string
  organization: Organization | null
  program: Program | null
  programs: Program[]
  joinLinks: ProgramJoinLink[]
  onProgramSelect: (programId: string) => void
}) {
  const [orgName, setOrgName] = useState(organization?.name || '')
  const [industry, setIndustry] = useState(organization?.industry || 'College fest')
  const [website, setWebsite] = useState(organization?.website || '')
  const [logoUrl, setLogoUrl] = useState(organization?.logoUrl || '')
  const [orgBusy, setOrgBusy] = useState(false)

  useEffect(() => {
    setOrgName(organization?.name || '')
    setIndustry(organization?.industry || 'College fest')
    setWebsite(organization?.website || '')
    setLogoUrl(organization?.logoUrl || '')
  }, [organization])

  async function saveOrganization(event: FormEvent) {
    event.preventDefault()
    setOrgBusy(true)
    try {
      await updateOrganizationCallable({ orgId, name: orgName.trim(), industry, website: website.trim(), logoUrl: logoUrl.trim() })
    } finally {
      setOrgBusy(false)
    }
  }

  return (
    <section className="page-stack">
      <section className="settings-hero">
        <div>
          <span className="eyebrow">Workspace profile</span>
          <h1>Organization and program settings</h1>
          <p>Manage public identity, program artwork, QR access, result settings, and Sang Scan-to-Join from one place.</p>
        </div>
      </section>

      <div className="page-grid settings-grid">
        <form className="panel form-panel" onSubmit={saveOrganization}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Organization</span>
              <h2>Profile details</h2>
            </div>
            <Building2 size={20} />
          </div>
          <ImageUploader folder="organization-logos" label="Organization logo" onChange={setLogoUrl} uid={uid} value={logoUrl} />
          <label>
            Organization name
            <input value={orgName} onChange={(event) => setOrgName(event.target.value)} required />
          </label>
          <label>
            Organization category
            <select value={industry} onChange={(event) => setIndustry(event.target.value)}>
              {orgCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Website
            <input placeholder="https://..." value={website} onChange={(event) => setWebsite(event.target.value)} />
          </label>
          <button className="primary-button" disabled={orgBusy} type="submit">
            {orgBusy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            Save organization
          </button>
        </form>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Program</span>
              <h2>Program profile and rules</h2>
            </div>
            <Settings size={20} />
          </div>
          {programs.length > 1 && (
            <label className="settings-program-select">
              Program workspace
              <select value={program?.id || ''} onChange={(event) => onProgramSelect(event.target.value)}>
                <option value="">Select program</option>
                {programs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          {program ? (
            <ProgramSettingsForm joinLinks={joinLinks.filter((link) => link.programId === program.id)} orgId={orgId} program={program} uid={uid} />
          ) : (
            <EmptyState title="Choose a program" body="Create or select a program before editing program artwork, QR access, result settings, and join flow." />
          )}
        </section>
      </div>
    </section>
  )
}

function ProgramSettingsForm({ orgId, uid, program, joinLinks }: { orgId: string; uid: string; program: Program; joinLinks: ProgramJoinLink[] }) {
  const [name, setName] = useState(program.name)
  const [mode, setMode] = useState<ProgramMode>(program.mode)
  const [programType, setProgramType] = useState(selectValueOrCustom(programTypeOptions, program.programType, 'college_fest'))
  const [customProgramType, setCustomProgramType] = useState(isKnownOption(programTypeOptions, program.programType) ? '' : program.programType || '')
  const [status, setStatus] = useState<Program['status']>(program.status)
  const [startDate, setStartDate] = useState(program.startDate)
  const [endDate, setEndDate] = useState(program.endDate)
  const [venueName, setVenueName] = useState(program.venueName || '')
  const [city, setCity] = useState(program.city || '')
  const [logoUrl, setLogoUrl] = useState(program.logoUrl || '')
  const [bannerUrl, setBannerUrl] = useState(program.bannerUrl || '')
  const [posterUrl, setPosterUrl] = useState(program.posterUrl || '')
  const [latitude, setLatitude] = useState<number | undefined>(program.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(program.longitude)
  const [description, setDescription] = useState(program.description || '')
  const [entryScope, setEntryScope] = useState<EntryScope>(program.entryScope || 'program')
  const [competitive, setCompetitive] = useState(Boolean(program.competitive))
  const [resultsEnabled, setResultsEnabled] = useState(Boolean(program.resultsEnabled))
  const [joinQrEnabled, setJoinQrEnabled] = useState(program.joinQrEnabled !== false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(program.name)
    setMode(program.mode)
    setProgramType(selectValueOrCustom(programTypeOptions, program.programType, 'college_fest'))
    setCustomProgramType(isKnownOption(programTypeOptions, program.programType) ? '' : program.programType || '')
    setStatus(program.status)
    setStartDate(program.startDate)
    setEndDate(program.endDate)
    setVenueName(program.venueName || '')
    setCity(program.city || '')
    setLogoUrl(program.logoUrl || '')
    setBannerUrl(program.bannerUrl || '')
    setPosterUrl(program.posterUrl || '')
    setLatitude(program.latitude)
    setLongitude(program.longitude)
    setDescription(program.description || '')
    setEntryScope(program.entryScope || 'program')
    setCompetitive(Boolean(program.competitive))
    setResultsEnabled(Boolean(program.resultsEnabled))
    setJoinQrEnabled(program.joinQrEnabled !== false)
  }, [program])

  async function saveProgram(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await updateProgramCallable({
        orgId,
        programId: program.id,
        name: name.trim(),
        mode,
        programType: programType === 'custom' ? customProgramType.trim() || 'custom' : programType,
        status,
        startDate,
        endDate,
        venueName: venueName.trim(),
        city: city.trim(),
        logoUrl: logoUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueName.trim(),
        timezone: program.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        description: description.trim(),
        entryScope,
        competitive,
        resultsEnabled: competitive ? resultsEnabled : false,
        joinQrEnabled,
      })
    } finally {
      setBusy(false)
    }
  }

  async function archiveProgram() {
    const confirmed = window.confirm(`Delete "${program.name}"? It will be removed from active program screens, while people, passes, and check-in history stay preserved.`)
    if (!confirmed) return
    await deleteProgramCallable({ orgId, programId: program.id })
  }

  return (
    <div className="program-settings-stack">
      <form className="settings-form" onSubmit={saveProgram}>
        <div className="form-grid two">
          <label>
            Program name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Program type
            <select value={programType} onChange={(event) => setProgramType(event.target.value)}>
              {programTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {programType === 'custom' && (
            <label>
              Custom program type
              <input placeholder="Symposium, hackathon, annual meet..." value={customProgramType} onChange={(event) => setCustomProgramType(event.target.value)} />
            </label>
          )}
          <label>
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as ProgramMode)}>
              <option value="multiEvent">Multi-event program</option>
              <option value="standalone">Standalone program/event</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as Program['status'])}>
              <option value="draft">Draft</option>
              <option value="live">Live</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </label>
          <label>
            City
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
        </div>

        <div className="form-grid three">
          <ImageUploader folder="program-logos" label="Program logo" onChange={setLogoUrl} uid={uid} value={logoUrl} />
          <ImageUploader folder="program-banners" label="Program banner" onChange={setBannerUrl} uid={uid} value={bannerUrl} />
          <ImageUploader folder="program-posters" label="Program poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
        </div>

        <MapPicker
          label="Primary venue"
          lat={latitude}
          lng={longitude}
          onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
          onVenueChange={setVenueName}
          venue={venueName}
        />

        <div className="assignment-box">
          <span>Competition and access</span>
          <div className="form-grid two">
            <label className="check-row">
              <input checked={joinQrEnabled} onChange={(event) => setJoinQrEnabled(event.target.checked)} type="checkbox" />
              <span>Program QR can be generated for Sang Scan-to-Join</span>
            </label>
            <label className="check-row">
              <input checked={competitive} onChange={(event) => { setCompetitive(event.target.checked); if (!event.target.checked) setResultsEnabled(false) }} type="checkbox" />
              <span>This program has competition/results</span>
            </label>
            {competitive && (
              <label className="check-row">
                <input checked={resultsEnabled} onChange={(event) => setResultsEnabled(event.target.checked)} type="checkbox" />
                <span>Results will be published from CRM</span>
              </label>
            )}
          </div>
        </div>

        <RichTextEditor label="About this program" onChange={setDescription} placeholder="Write a polished program overview with headings, bullets, and highlights." value={description} />

        <div className="action-row">
          <button className="danger-button" onClick={archiveProgram} type="button">
            <Trash2 size={16} />
            Delete program
          </button>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            Save program
          </button>
        </div>
      </form>

      <ProgramJoinQrPanel joinLinks={joinLinks} orgId={orgId} program={program} />
    </div>
  )
}

function ProgramJoinQrPanel({ orgId, program, joinLinks }: { orgId: string; program: Program; joinLinks: ProgramJoinLink[] }) {
  const [mode, setMode] = useState<JoinMode>('request_approval')
  const [allowedCategory, setAllowedCategory] = useState<PersonKind | 'custom'>('attendee')
  const [customAllowedCategory, setCustomAllowedCategory] = useState('')
  const [maxUses, setMaxUses] = useState(5000)
  const [campaignName, setCampaignName] = useState('Main program QR')
  const [qrPayload, setQrPayload] = useState(joinLinks.find((link) => link.qrPayload)?.qrPayload || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setQrPayload(joinLinks.find((link) => link.qrPayload)?.qrPayload || '')
  }, [joinLinks])

  async function generateQr() {
    setBusy(true)
    try {
      const response = await createProgramJoinLinkCallable({
        orgId,
        programId: program.id,
        mode,
        allowedCategory,
        customAllowedCategory: allowedCategory === 'custom' ? customAllowedCategory.trim() : '',
        allowedEventIds: [],
        maxUses,
        expiresAt: '',
        campaignName: campaignName.trim() || 'Main program QR',
      })
      setQrPayload(response.data.qrPayload)
    } finally {
      setBusy(false)
    }
  }

  async function copyPayload() {
    if (!qrPayload) return
    await navigator.clipboard?.writeText(qrPayload)
  }

  return (
    <section className="join-qr-panel">
      <div>
        <span className="eyebrow">Sang app adoption</span>
        <h2>Program Scan-to-Join QR</h2>
        <p>Use this on posters, entry desks, emails, or venue standees. Sang users scan it to join/request access to this program.</p>
      </div>
      <div className="join-qr-grid">
        <div className="assignment-box">
          <span>QR controls</span>
          <label>
            Join mode
            <select value={mode} onChange={(event) => setMode(event.target.value as JoinMode)}>
              <option value="direct_join">Direct join</option>
              <option value="request_approval">Request approval</option>
              <option value="invite_only">Invite only</option>
            </select>
          </label>
          <label>
            Default category
            <select value={allowedCategory} onChange={(event) => setAllowedCategory(event.target.value as PersonKind | 'custom')}>
              <option value="attendee">Attendee</option>
              <option value="participant">Participant</option>
              <option value="speaker">Speaker</option>
              <option value="staff">Staff</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {allowedCategory === 'custom' && (
            <label>
              Custom category
              <input placeholder="VIP guest, exhibitor, alumni..." value={customAllowedCategory} onChange={(event) => setCustomAllowedCategory(event.target.value)} />
            </label>
          )}
          <label>
            Max uses
            <input min={1} type="number" value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value) || 1)} />
          </label>
          <label>
            Campaign name
            <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
          </label>
          <button className="primary-button" disabled={busy || program.joinQrEnabled === false} onClick={generateQr} type="button">
            {busy ? <Loader2 className="spin" size={17} /> : <QrCode size={17} />}
            Generate QR
          </button>
        </div>
        <div className="qr-display">
          {qrPayload ? <PassPreview payload={qrPayload} /> : <QrCode size={48} />}
          <strong>{qrPayload ? 'QR ready' : 'No QR generated yet'}</strong>
          <p>{qrPayload || 'Generate a secure Sang program join token.'}</p>
          <button className="secondary-button" disabled={!qrPayload} onClick={copyPayload} type="button">
            <Copy size={16} />
            Copy payload
          </button>
        </div>
      </div>
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
  const [needsOrgChoice, setNeedsOrgChoice] = useState(() => profile.organizationIds.length > 1 && window.localStorage.getItem('sang-crm-org-choice-confirmed') !== profile.activeOrgId)
  const orgId = profile.activeOrgId || ''
  const orgQuery = useMemo(() => (orgId ? doc(db, 'peOrganizations', orgId) : null), [orgId])
  const programsQuery = useMemo(() => (orgId ? query(collection(db, 'pePrograms'), where('orgId', '==', orgId)) : null), [orgId])
  const eventsQuery = useMemo(() => (orgId ? query(collection(db, 'peEvents'), where('orgId', '==', orgId)) : null), [orgId])
  const scheduleItemsQuery = useMemo(() => (orgId ? query(collection(db, 'peEventScheduleItems'), where('orgId', '==', orgId)) : null), [orgId])
  const joinLinksQuery = useMemo(() => (orgId ? query(collection(db, 'peProgramJoinLinks'), where('orgId', '==', orgId)) : null), [orgId])
  const peopleQuery = useMemo(() => (orgId ? query(collection(db, 'peProgramPeople'), where('orgId', '==', orgId)) : null), [orgId])
  const passesQuery = useMemo(() => (orgId ? query(collection(db, 'pePasses'), where('orgId', '==', orgId)) : null), [orgId])
  const checkInsQuery = useMemo(() => (orgId ? query(collection(db, 'peCheckIns'), where('orgId', '==', orgId)) : null), [orgId])
  const membersQuery = useMemo(() => (orgId ? query(collection(db, 'peTeamMembers'), where('orgId', '==', orgId)) : null), [orgId])
  const rolesQuery = useMemo(() => (orgId ? collection(db, 'peOrganizations', orgId, 'roles') : null), [orgId])
  const programs = useCollection<Program>(programsQuery)
  const events = useCollection<ProgramEvent>(eventsQuery)
  const scheduleItems = useCollection<ScheduleItem>(scheduleItemsQuery)
  const joinLinks = useCollection<ProgramJoinLink>(joinLinksQuery)
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
  const activeScheduleItems = activeProgram ? scheduleItems.rows.filter((item) => item.programId === activeProgram.id) : []
  const activeJoinLinks = activeProgram ? joinLinks.rows.filter((link) => link.programId === activeProgram.id) : []
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

  async function chooseOrganization(nextOrgId: string) {
    await setActiveOrganizationCallable({ orgId: nextOrgId })
    window.localStorage.setItem('sang-crm-org-choice-confirmed', nextOrgId)
    window.localStorage.removeItem('sang-crm-selected-program')
    setSelectedProgramId('')
    setProfile({ ...profile, activeOrgId: nextOrgId, organizationIds: Array.from(new Set([...profile.organizationIds, nextOrgId])) })
    setNeedsOrgChoice(false)
  }

  if (!orgId && profile.organizationIds.length > 0) {
    return <OrganizationChooserPage onChoose={chooseOrganization} profile={profile} />
  }

  if (!orgId) {
    return <OnboardingPage user={firebaseUser} onComplete={setProfile} />
  }

  if (needsOrgChoice) {
    return <OrganizationChooserPage onChoose={chooseOrganization} profile={profile} />
  }

  function chooseProgram(programId: string) {
    setSelectedProgramId(programId)
    window.localStorage.setItem('sang-crm-selected-program', programId)
    setRoute('dashboard')
  }

  function chooseProgramInSettings(programId: string) {
    setSelectedProgramId(programId)
    window.localStorage.setItem('sang-crm-selected-program', programId)
    setRoute('settings')
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
      {programs.error || roles.error || people.error || scheduleItems.error ? <p className="form-error">{programs.error || roles.error || people.error || scheduleItems.error}</p> : null}
      {route === 'dashboard' && activeProgram && <ProgramWorkspaceDashboard checkIns={activeCheckIns} events={activeEvents} joinLinks={activeJoinLinks} people={activePeople} program={activeProgram} setRoute={setRoute} />}
      {route === 'dashboard' && !activeProgram && <DashboardPage checkIns={checkIns.rows} people={people.rows} programs={sortedPrograms} setRoute={setRoute} />}
      {route === 'events' && activeProgram && <EventsPage events={activeEvents} orgId={orgId} program={activeProgram} scheduleItems={activeScheduleItems} uid={firebaseUser.uid} />}
      {route === 'events' && !activeProgram && <ProgramsPage events={events.rows} onChoose={chooseProgram} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} />}
      {route === 'programs' && <ProgramsPage events={events.rows} onChoose={chooseProgram} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} />}
      {route === 'settings' && <SettingsPage joinLinks={joinLinks.rows} onProgramSelect={chooseProgramInSettings} orgId={orgId} organization={organization} program={activeProgram} programs={sortedPrograms} uid={firebaseUser.uid} />}
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
  const [showAuth, setShowAuth] = useState(() => window.location.hash === '#/signin')

  useEffect(() => {
    const sync = () => setShowAuth(window.location.hash === '#/signin')
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  function goToSignIn() {
    window.location.hash = '/signin'
    setShowAuth(true)
    window.scrollTo({ top: 0 })
  }

  function goToLanding() {
    if (window.location.hash) window.location.hash = ''
    setShowAuth(false)
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" size={28} />
        <span>Opening Sang Event CRM</span>
      </main>
    )
  }

  if (!firebaseUser) {
    return showAuth
      ? <AuthPage onBack={goToLanding} />
      : <LandingPage onSignIn={goToSignIn} />
  }

  if (!profile) {
    return <OnboardingPage user={firebaseUser} onComplete={setProfile} />
  }

  return <CrmApp firebaseUser={firebaseUser} profile={profile} setProfile={setProfile} />
}

export default App
