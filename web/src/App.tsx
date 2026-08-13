import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import {
  Activity,
  BadgeCheck,
  Bold,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  ClipboardList,
  Download,
  Eye,
  Heading2,
  Heading3,
  Italic,
  LayoutDashboard,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Lock,
  LogOut,
  GitBranch,
  MapPin,
  Pencil,
  Pilcrow,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Underline,
  Unlock,
  Upload,
  UploadCloud,
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
  documentId,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentData,
  type Query,
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { auth, db, functions, storage } from './lib/firebase'
import { LandingPage } from './landing/LandingPage'

// Check-in and analytics routes are intentionally out of scope for this release.
// Backend scanPassToken/createScannerSession remain live; only the CRM surface is hidden.
type RouteKey = 'dashboard' | 'events' | 'venues' | 'patrons' | 'programs' | 'settings' | 'roles' | 'team' | 'people'
type PersonKind = string
type ProgramMode = 'standalone' | 'multiEvent'
type TeamScope = 'organization' | 'program' | 'event'
type EntryScope = 'program' | 'event' | 'both'
type ScheduleType = 'session' | 'round' | 'break' | 'checkin' | 'performance' | 'result' | 'ceremony' | 'custom'
type ScheduleStatus = 'draft' | 'scheduled' | 'delayed' | 'cancelled' | 'completed'
type ScheduleVisibility = 'public' | 'rolesOnly' | 'staffOnly' | 'participantsOnly'
type RoleCategory = 'team' | 'audience'

type AudienceRoleOption = {
  id: string
  name: string
}

type EventAccess = {
  eventId?: string
  eventNameSnapshot?: string
  roleId: string
  roleName: string
  status: 'allowed' | 'registered' | 'blocked' | 'cancelled' | 'rejected' | 'revoked'
}

type VenueRoom = {
  id: string
  name: string
  floor?: string
  capacity?: number
}

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

const audienceRolePresets: AudienceRoleOption[] = [
  { id: 'visitor', name: 'Visitor' },
  { id: 'participants', name: 'Participants' },
  { id: 'delegates', name: 'Delegates' },
  { id: 'speakers', name: 'Speakers' },
  { id: 'media', name: 'Media' },
  { id: 'mentor', name: 'Mentor' },
  { id: 'patrons', name: 'Patrons' },
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

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'custom'
}

function firestoreDate(value: unknown) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  if (
    typeof value === 'object' &&
    typeof (value as { seconds?: unknown }).seconds === 'number' &&
    typeof (value as { nanoseconds?: unknown }).nanoseconds === 'number'
  ) {
    const timestamp = value as { seconds: number; nanoseconds: number }
    return new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000))
  }
  return null
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function dateInputValue(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = firestoreDate(value)
  if (!date) return typeof value === 'string' ? value : ''
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

function dateTimeInputValue(value: unknown) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return value.slice(0, 16)
  }
  const date = firestoreDate(value)
  if (!date) return typeof value === 'string' ? value : ''
  return `${dateInputValue(date)}T${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`
}

const dateOnlyFieldNames = new Set(['startDate', 'endDate'])
const dateTimeFieldNames = new Set(['startDateTime', 'endDateTime', 'startsAt', 'endsAt', 'nextScheduleAt', 'expiresAt'])

function normalizeFirestoreDateFields(value: unknown, key = ''): unknown {
  if (dateOnlyFieldNames.has(key)) return dateInputValue(value)
  if (dateTimeFieldNames.has(key)) return dateTimeInputValue(value)
  if (Array.isArray(value)) return value.map((item) => normalizeFirestoreDateFields(item))
  if (!value || typeof value !== 'object' || value instanceof Date || typeof (value as { toDate?: unknown }).toDate === 'function') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      normalizeFirestoreDateFields(entryValue, entryKey),
    ]),
  )
}

function roleCategory(role: Role): RoleCategory {
  return role.category || 'team'
}

function isDeletedRole(role: Role) {
  return role.status === 'deleted'
}

function getAudienceRoles(roles: Role[]): AudienceRoleOption[] {
  const deletedIds = new Set(roles.filter((role) => roleCategory(role) === 'audience' && isDeletedRole(role)).map((role) => slugify(role.id)))
  const savedRoles = roles
    .filter((role) => roleCategory(role) === 'audience' && !isDeletedRole(role))
    .map((role) => ({ id: slugify(role.id), name: role.name }))
  const existingIds = new Set(savedRoles.map((role) => role.id))
  return [
    ...savedRoles,
    ...audienceRolePresets.filter((role) => !existingIds.has(role.id) && !deletedIds.has(role.id)),
  ]
}

function resolveAudienceRole(value: string | undefined, audienceRoles: AudienceRoleOption[], fallbackId = 'visitor') {
  const fallback = audienceRoles.find((role) => role.id === fallbackId) || audienceRoles[0] || audienceRolePresets[0]
  const normalized = (value || '').trim()
  if (!normalized) return fallback
  const byId = audienceRoles.find((role) => role.id === slugify(normalized))
  if (byId) return byId
  const byName = audienceRoles.find((role) => role.name.toLowerCase() === normalized.toLowerCase())
  if (byName) return byName
  return { id: slugify(normalized), name: normalized }
}

function formatDateTime(value?: string) {
  if (!value) return 'Time pending'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function timestampMs(value: unknown) {
  const date = firestoreDate(value)
  return date ? date.getTime() : 0
}

function newestTimestamp(items: Array<{ updatedAt?: unknown }>) {
  return items.reduce((latest, item) => Math.max(latest, timestampMs(item.updatedAt)), 0)
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
  category?: RoleCategory
  description?: string
  permissions: string[]
  status?: 'active' | 'deleted'
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
  status: 'invited' | 'active' | 'disabled' | 'deleted' | 'claimed'
  uid?: string
}

type Program = {
  id: string
  orgId: string
  name: string
  mode: ProgramMode
  tagline?: string
  programType?: string
  status: 'draft' | 'live' | 'archived'
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  venueName: string
  city: string
  logoUrl?: string
  bannerUrl?: string
  posterUrl?: string
  latitude?: number
  longitude?: number
  address?: string
  directionsNote?: string
  timezone: string
  description?: string
  schedule?: unknown[]
  infoSections?: unknown[]
  fieldDefinitions?: unknown[]
  entryScope?: EntryScope
  competitive?: boolean
  resultsEnabled?: boolean
  eventsLastPublishedAt?: unknown
  peopleLastPublishedAt?: unknown
  scheduleLastPublishedAt?: unknown
  updatedAt?: unknown
}

type ProgramEvent = {
  id: string
  orgId: string
  programId: string
  name: string
  eventType?: string
  description?: string
  startDateTime: string
  endDateTime: string
  multiDate?: boolean
  venueName: string
  locationNote?: string
  directionsNote?: string
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
  allowedAudienceRoleIds?: string[]
  allowedAudienceRoleNames?: string[]
  mobileVisible?: boolean
  status: 'draft' | 'live' | 'completed'
  updatedAt?: unknown
}

type ProgramVenueCatalog = {
  id: string
  orgId: string
  programId: string
  venues?: ProgramVenue[]
}

type ProgramVenue = {
  id: string
  name: string
  address?: string
  directionsNote?: string
  latitude?: number
  longitude?: number
  rooms?: VenueRoom[]
}

type ProgramVenueInput = {
  id?: string
  name: string
  address?: string
  directionsNote?: string
  latitude?: number
  longitude?: number
  rooms?: Array<{
    id?: string
    name: string
    floor?: string
    capacity?: number
  }>
}

type ProgramPartner = {
  id: string
  orgId: string
  programId: string
  name: string
  tier?: string
  category?: string
  booth?: string
  description?: string
  websiteUrl?: string
  logoUrl?: string
  sortOrder?: number
  status?: 'active' | 'hidden'
}

type CreateProgramPayload = Omit<Program, 'id' | 'status'> & {
  primaryVenue?: ProgramVenueInput
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
  venueId?: string
  roomId?: string
  venueName?: string
  roomName?: string
  address?: string
  locationNote?: string
  directionsNote?: string
  latitude?: number
  longitude?: number
  visibility: ScheduleVisibility
  allowedRoleIds?: string[]
  allowedRoleNames?: string[]
  parentScheduleItemId?: string
  groupLabel?: string
  status: ScheduleStatus
  sortOrder?: number
  updatedAt?: unknown
}

type ScheduleDraftRow = {
  id: string
  title: string
  type: ScheduleType
  customTypeLabel: string
  startsAt: string
  endsAt: string
  venueId: string
  venueName: string
  roomId: string
  roomName: string
  address: string
  locationNote: string
  directionsNote: string
  latitude?: number
  longitude?: number
  visibility: ScheduleVisibility
  allowedRoleIds: string[]
  parentScheduleItemId: string
  groupLabel: string
  status: ScheduleStatus
  description: string
  eventId: string
}

type ProgramPerson = {
  id: string
  orgId: string
  programId: string
  email: string
  phone?: string
  fullName: string
  kind: PersonKind
  programRoleId?: string
  programRoleName?: string
  company?: string
  organization?: string
  designation?: string
  eventAccessIds?: string[]
  eventAccess?: Record<string, EventAccess>
  eventAccessList?: Array<EventAccess & { eventId: string }>
  eventRoleKeys?: string[]
  sangUid?: string
  sangUserId?: string
  linkStatus?: 'linked' | 'pending' | 'manual_review'
  linkConflictReason?: string
  sangAppStatus?: 'linked' | 'not_found' | 'missing_identity' | 'manual_review'
  sangAppLinked?: boolean
  sangAppUserId?: string
  sangAppMatchMethod?: 'verified_email' | 'verified_phone' | 'manual' | ''
  sangAppConflictReason?: string
  passId?: string
  passStatus?: 'notIssued' | 'issued' | 'checkedIn' | 'blocked' | 'revoked'
  passCode?: string
  rosterStatus?: 'active' | 'blocked' | 'removed'
  accessStatus?: 'active' | 'blocked' | 'removed'
  blockedReason?: string
  removedReason?: string
  updatedAt?: unknown
}

type ProgramPersonInput = Omit<ProgramPerson, 'id' | 'passId' | 'passStatus' | 'passCode' | 'sangUid' | 'eventAccess' | 'eventAccessIds'> & {
  eventIds?: string[]
  eventAccess?: Array<EventAccess & { eventId: string }>
}

type ProgramPersonAccessUpdateInput = Pick<ProgramPersonInput, 'orgId' | 'fullName' | 'email' | 'phone' | 'kind' | 'programRoleId' | 'programRoleName' | 'company' | 'organization' | 'designation' | 'eventAccess'> & {
  programPersonId: string
}

function sangAppStatusLabel(person: ProgramPerson) {
  if (person.sangAppStatus === 'linked' || person.linkStatus === 'linked') return 'Linked'
  if (person.sangAppStatus === 'manual_review' || person.linkStatus === 'manual_review') return 'Review'
  if (person.sangAppStatus === 'missing_identity') return 'No email/phone'
  if (person.sangAppStatus === 'not_found') return 'Not on Sang'
  return 'Pending'
}

function sangAppStatusClass(person: ProgramPerson) {
  if (person.sangAppStatus === 'linked' || person.linkStatus === 'linked') return 'active'
  if (person.sangAppStatus === 'manual_review' || person.linkStatus === 'manual_review') return 'cancelled'
  return 'draft'
}

function personAccessState(person: ProgramPerson) {
  return person.accessStatus || person.rosterStatus || 'active'
}

function passStatusClass(person: ProgramPerson) {
  const status = person.passStatus || 'notIssued'
  if (status === 'issued' || status === 'checkedIn') return status
  if (status === 'blocked' || status === 'revoked') return 'cancelled'
  return 'notIssued'
}

type PassRecord = {
  id: string
  orgId: string
  programId: string
  programPersonId: string
  qrPayload: string
  passCode?: string
  status: 'issued' | 'checkedIn' | 'blocked' | 'revoked'
}

const permissions = [
  'program.read',
  'program.write',
  'event.write',
  'roles.write',
  'team.write',
  'people.import',
  'passes.issue',
  'exports.create',
  // 'checkin.scan' and 'analytics.read' are omitted while check-in and analytics
  // are out of scope. Existing roles that still carry them are harmless: no route
  // reads them. Re-add here when those features are switched back on.
]

const routeLabels: Record<RouteKey, string> = {
  dashboard: 'Dashboard',
  events: 'Events',
  venues: 'Venues',
  patrons: 'Patrons',
  programs: 'Programs',
  settings: 'Settings',
  roles: 'Roles',
  team: 'Team',
  people: 'People',
}

const navItems = [
  { key: 'dashboard' as const, icon: LayoutDashboard },
  { key: 'events' as const, icon: CalendarDays },
  { key: 'venues' as const, icon: MapPin },
  { key: 'patrons' as const, icon: BadgeCheck },
  { key: 'programs' as const, icon: CalendarDays },
  { key: 'settings' as const, icon: Settings },
  { key: 'roles' as const, icon: ShieldCheck },
  { key: 'team' as const, icon: Users },
  { key: 'people' as const, icon: ClipboardList },
]

function hasPermission(role: Role | undefined, permission: string) {
  const rolePermissions = Array.isArray(role?.permissions) ? role.permissions : []
  return rolePermissions.includes('*') || rolePermissions.includes(permission)
}

function canOpenRoute(route: RouteKey, role: Role | undefined, member: TeamMember | null) {
  if (!member || member.status !== 'active') return false
  switch (route) {
    case 'dashboard':
      return hasPermission(role, 'program.read')
    case 'events':
      return hasPermission(role, 'program.read') || hasPermission(role, 'event.write')
    case 'venues':
      return (hasPermission(role, 'program.write') || hasPermission(role, 'event.write')) && member.scope !== 'event'
    case 'patrons':
      return hasPermission(role, 'program.write') && member.scope !== 'event'
    case 'programs':
      return hasPermission(role, 'program.write') && member.scope !== 'event'
    case 'settings':
      return (hasPermission(role, 'program.write') && member.scope !== 'event') || (hasPermission(role, 'team.write') && member.scope === 'organization')
    case 'roles':
      return hasPermission(role, 'roles.write') && member.scope === 'organization'
    case 'team':
      return hasPermission(role, 'team.write') && member.scope === 'organization'
    case 'people':
      return hasPermission(role, 'people.import') || hasPermission(role, 'passes.issue')
    default:
      return false
  }
}

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
  return snapshotDocs.map((snapshotDoc) => normalizeFirestoreDateFields({ id: snapshotDoc.id, ...snapshotDoc.data() }) as T)
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

function useCollection<T extends { id: string }>(dataQuery: Query | null, label = 'Data') {
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
        setError(`${label}: ${snapshotError.message}`)
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [dataQuery, label])

  return { rows, loading, error }
}

function useAuthProfile() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<PeUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let profileUnsubscribe: (() => void) | null = null
    let finished = false
    const fallbackTimer = window.setTimeout(() => {
      if (!finished && mounted) {
        setLoading(false)
      }
    }, 7000)

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!mounted) return
      profileUnsubscribe?.()
      profileUnsubscribe = null
      setFirebaseUser(currentUser)
      setLoading(true)
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
        profileUnsubscribe = onSnapshot(
          doc(db, 'peUsers', currentUser.uid),
          (userSnapshot) => {
            if (!mounted) return
            setProfile(userSnapshot.exists() ? (userSnapshot.data() as PeUser) : null)
            finished = true
            window.clearTimeout(fallbackTimer)
            setLoading(false)
          },
          (profileError) => {
            if (!mounted) return
            // A deleted/stale CRM profile should move the user back to setup instead
            // of leaving an old in-memory activeOrgId to trigger permission errors.
            console.warn('Could not load user profile:', profileError)
            setProfile(null)
            finished = true
            window.clearTimeout(fallbackTimer)
            setLoading(false)
          },
        )
      } catch (profileError) {
        // Transient read failures during an auth transition shouldn't crash the app.
        console.warn('Could not load user profile:', profileError)
        if (mounted) setProfile(null)
        finished = true
        window.clearTimeout(fallbackTimer)
        if (mounted) setLoading(false)
      }
    })

    return () => {
      mounted = false
      window.clearTimeout(fallbackTimer)
      profileUnsubscribe?.()
      unsubscribe()
    }
  }, [])

  return { firebaseUser, profile, setProfile, loading }
}

const createOrganizationCallable = httpsCallable<{ displayName: string; orgName: string; industry: string; website: string; logoUrl: string; email: string }, { orgId: string }>(functions, 'createOrganization')
const updateOrganizationCallable = httpsCallable<{ orgId: string; name: string; industry: string; website: string; logoUrl: string }, { orgId: string }>(functions, 'updateOrganization')
const setActiveOrganizationCallable = httpsCallable<{ orgId: string }, { orgId: string }>(functions, 'setActiveOrganization')
const claimTeamAccessCallable = httpsCallable<void, { claimedOrgIds: string[] }>(functions, 'claimTeamAccess')
const createRoleCallable = httpsCallable<{ orgId: string; roleId: string; name: string; category: RoleCategory; description: string; permissions: string[] }, { roleId: string }>(functions, 'createRole')
const deleteRoleCallable = httpsCallable<{ orgId: string; roleId: string }, { roleId: string }>(functions, 'deleteRole')
const inviteTeamMemberCallable = httpsCallable<{ orgId: string; email: string; displayName: string; roleId: string; scope: TeamScope; programId?: string; eventId?: string }, { teamMemberId: string }>(functions, 'inviteTeamMember')
const updateTeamMemberCallable = httpsCallable<{ orgId: string; teamMemberId: string; displayName: string; roleId: string; scope: TeamScope; programId?: string; eventId?: string; status: 'active' | 'invited' | 'disabled' }, { teamMemberId: string }>(functions, 'updateTeamMember')
const deleteTeamMemberCallable = httpsCallable<{ orgId: string; teamMemberId: string }, { teamMemberId: string }>(functions, 'deleteTeamMember')
const createProgramCallable = httpsCallable<CreateProgramPayload, { programId: string }>(functions, 'createProgram')
const updateProgramCallable = httpsCallable<Omit<Program, 'id'> & { programId: string }, { programId: string }>(functions, 'updateProgram')
const deleteProgramCallable = httpsCallable<{ orgId: string; programId: string }, { programId: string }>(functions, 'deleteProgram')
const saveProgramVenueCallable = httpsCallable<{ orgId: string; programId: string; venueId?: string; name: string; address: string; directionsNote?: string; latitude?: number; longitude?: number; rooms: Array<{ id?: string; name: string; floor?: string; capacity?: number }> }, { venueId: string }>(functions, 'saveProgramVenue')
const deleteProgramVenueCallable = httpsCallable<{ orgId: string; programId: string; venueId: string; roomId?: string }, { venueId: string; roomId?: string }>(functions, 'deleteProgramVenue')
const saveProgramPartnerCallable = httpsCallable<Omit<ProgramPartner, 'id'> & { partnerId?: string }, { partnerId: string }>(functions, 'saveProgramPartner')
const deleteProgramPartnerCallable = httpsCallable<{ orgId: string; programId: string; partnerId: string }, { partnerId: string }>(functions, 'deleteProgramPartner')
const createEventCallable = httpsCallable<Omit<ProgramEvent, 'id' | 'status'>, { eventId: string }>(functions, 'createEvent')
const updateEventCallable = httpsCallable<Partial<Omit<ProgramEvent, 'id'>> & { eventId: string }, { eventId: string }>(functions, 'updateEvent')
const deleteEventCallable = httpsCallable<{ orgId: string; eventId: string }, { eventId: string }>(functions, 'deleteEvent')
const createScheduleItemCallable = httpsCallable<Omit<ScheduleItem, 'id'>, { scheduleItemId: string }>(functions, 'createScheduleItem')
const deleteScheduleItemCallable = httpsCallable<{ orgId: string; scheduleItemId: string }, { scheduleItemId: string }>(functions, 'deleteScheduleItem')
const publishProgramScheduleCallable = httpsCallable<{ orgId: string; programId: string }, { itemCount: number; pageCount: number }>(functions, 'publishProgramSchedule')
const publishProgramEventsCallable = httpsCallable<{ orgId: string; programId: string }, { itemCount: number }>(functions, 'publishProgramEvents')
const createProgramPersonAndPassCallable = httpsCallable<ProgramPersonInput, { programPersonId: string; passId: string; qrPayload: string; passCode: string }>(functions, 'createProgramPersonAndPass')
const issuePassForProgramPersonCallable = httpsCallable<{ orgId: string; programPersonId: string }, { passId: string; qrPayload: string; passCode: string; revokedPassId?: string }>(functions, 'issuePassForProgramPerson')
const publishProgramPeopleAccessCallable = httpsCallable<{ orgId: string; programId: string; notify?: boolean; forceNotify?: boolean }, { peopleCount: number; linkedCount: number; alreadyLinkedCount: number; pendingCount: number; manualReviewCount: number; notificationSentCount: number; skippedCount?: number }>(functions, 'publishProgramPeopleAccess')
const updateProgramPersonAccessCallable = httpsCallable<ProgramPersonAccessUpdateInput, { programPersonId: string; status: string; linked: boolean }>(functions, 'updateProgramPersonAccess')
const blockProgramPersonAccessCallable = httpsCallable<{ orgId: string; programPersonId: string; reason?: string }, { programPersonId: string; status: string; passStatus: string }>(functions, 'blockProgramPersonAccess')
const removeProgramPersonAccessCallable = httpsCallable<{ orgId: string; programPersonId: string; reason?: string }, { programPersonId: string; status: string; passStatus: string }>(functions, 'removeProgramPersonAccess')
const unblockProgramPersonAccessCallable = httpsCallable<{ orgId: string; programPersonId: string; reason?: string }, { programPersonId: string; status: string; passStatus: string; passId: string; qrPayload: string; passCode: string; revokedPassId?: string }>(functions, 'unblockProgramPersonAccess')

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
  visibleNavItems,
  onSwitchProgram,
  user,
}: {
  children: React.ReactNode
  route: RouteKey
  setRoute: (route: RouteKey) => void
  organization: Organization | null
  selectedProgram: Program | null
  visibleNavItems: typeof navItems
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
          {visibleNavItems.map((item) => {
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
  const [activeMarks, setActiveMarks] = useState({ bold: false, italic: false, underline: false, unordered: false, ordered: false })
  const [activeBlock, setActiveBlock] = useState('P')

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || document.activeElement === editor) return
    const nextValue = sanitizeRichText(value)
    if (editor.innerHTML !== nextValue) editor.innerHTML = nextValue
  }, [value])

  useEffect(() => {
    const refresh = () => refreshToolbarState()
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [])

  function commit() {
    const editor = editorRef.current
    if (!editor) return
    if (!editor.textContent?.trim()) {
      editor.innerHTML = ''
      onChange('')
      refreshToolbarState()
      return
    }
    onChange(sanitizeRichText(editor.innerHTML || ''))
    refreshToolbarState()
  }

  function refreshToolbarState() {
    const editor = editorRef.current
    const selection = typeof window === 'undefined' ? null : window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return
    setActiveMarks({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unordered: document.queryCommandState('insertUnorderedList'),
      ordered: document.queryCommandState('insertOrderedList'),
    })
    setActiveBlock(String(document.queryCommandValue('formatBlock') || 'P').replace(/[<>]/g, '').toUpperCase())
  }

  function focusEditor() {
    editorRef.current?.focus()
  }

  function runCommand(command: string, commandValue?: string) {
    focusEditor()
    document.execCommand(command, false, commandValue)
    commit()
  }

  function handlePaste(event: ReactClipboardEvent<HTMLDivElement>) {
    event.preventDefault()
    const text = event.clipboardData.getData('text/plain')
    focusEditor()
    document.execCommand('insertText', false, text)
    commit()
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      runCommand('bold')
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      runCommand('italic')
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
      event.preventDefault()
      runCommand('underline')
    }
  }

  return (
    <div className="rich-text-field">
      <div className="rich-text-label-row">
        <span>{label}</span>
        <small>Rich text</small>
      </div>
      <div className="rich-text-shell">
        <div className="rich-text-toolbar" aria-label={`${label} formatting`}>
          <button aria-pressed={activeMarks.bold} className={activeMarks.bold ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('bold')} title="Bold" type="button"><Bold size={15} /></button>
          <button aria-pressed={activeMarks.italic} className={activeMarks.italic ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('italic')} title="Italic" type="button"><Italic size={15} /></button>
          <button aria-pressed={activeMarks.underline} className={activeMarks.underline ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('underline')} title="Underline" type="button"><Underline size={15} /></button>
          <span className="toolbar-separator" />
          <button aria-pressed={activeBlock === 'H2'} className={activeBlock === 'H2' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('formatBlock', 'H2')} title="Large heading" type="button"><Heading2 size={15} /></button>
          <button aria-pressed={activeBlock === 'H3'} className={activeBlock === 'H3' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('formatBlock', 'H3')} title="Small heading" type="button"><Heading3 size={15} /></button>
          <button aria-pressed={activeBlock === 'P'} className={activeBlock === 'P' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('formatBlock', 'P')} title="Paragraph" type="button"><Pilcrow size={15} /></button>
          <span className="toolbar-separator" />
          <button aria-pressed={activeMarks.unordered} className={activeMarks.unordered ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('insertUnorderedList')} title="Bullet list" type="button"><List size={15} /></button>
          <button aria-pressed={activeMarks.ordered} className={activeMarks.ordered ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('insertOrderedList')} title="Numbered list" type="button"><ListOrdered size={15} /></button>
        </div>
        <div
          aria-label={label}
          className="rich-text-editor"
          contentEditable
          data-placeholder={placeholder}
          onBlur={commit}
          onFocus={refreshToolbarState}
          onInput={commit}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
        />
      </div>
    </div>
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
  const [locating, setLocating] = useState(false)
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

    if (!lat && !lng && 'geolocation' in navigator) {
      setLocating(true)
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const point = L.latLng(position.coords.latitude, position.coords.longitude)
          commit(point)
          map.setView(point, 15)
          setLocating(false)
        },
        () => setLocating(false),
        { enableHighAccuracy: true, maximumAge: 120000, timeout: 8000 },
      )
    }
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
        {locating && <span><Loader2 className="spin" size={12} /> Current location</span>}
      </div>
    </div>
  )
}

function VenueLibraryModal({
  orgId,
  program,
  venueCatalog,
  open,
  onClose,
  seedName = '',
}: {
  orgId: string
  program: Program
  venueCatalog?: ProgramVenueCatalog | null
  open: boolean
  onClose: () => void
  seedName?: string
}) {
  const venues = venueCatalog?.venues || []
  const [editingVenueId, setEditingVenueId] = useState('')
  const [name, setName] = useState(seedName)
  const [address, setAddress] = useState(seedName)
  const [directionsNote, setDirectionsNote] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>(program.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(program.longitude)
  const [rooms, setRooms] = useState<Array<{ id?: string; name: string; floor: string; capacity: string }>>([{ name: '', floor: '', capacity: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setEditingVenueId('')
    setName(seedName)
    setAddress(seedName)
    setDirectionsNote('')
    setLatitude(program.latitude)
    setLongitude(program.longitude)
    setRooms([{ name: '', floor: '', capacity: '' }])
    setError('')
  }, [open, program.latitude, program.longitude, seedName])

  function editVenue(venue: ProgramVenue) {
    setEditingVenueId(venue.id)
    setName(venue.name)
    setAddress(venue.address || '')
    setDirectionsNote(venue.directionsNote || '')
    setLatitude(venue.latitude)
    setLongitude(venue.longitude)
    const editableRooms: VenueRoom[] = venue.rooms?.length ? venue.rooms : []
    setRooms((editableRooms.length ? editableRooms : [{ id: '', name: '', floor: '', capacity: undefined }]).map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor || '',
      capacity: room.capacity === undefined ? '' : String(room.capacity),
    })))
    setError('')
  }

  function updateRoom(index: number, key: 'name' | 'floor' | 'capacity', value: string) {
    setRooms((current) => current.map((room, roomIndex) => roomIndex === index ? { ...room, [key]: value } : room))
  }

  function removeRoom(index: number) {
    setRooms((current) => current.length === 1 ? [{ name: '', floor: '', capacity: '' }] : current.filter((_, roomIndex) => roomIndex !== index))
  }

  async function saveVenue(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Venue name is required.')
      return
    }
    setBusy(true)
    try {
      await saveProgramVenueCallable({
        orgId,
        programId: program.id,
        venueId: editingVenueId,
        name: name.trim(),
        address: address.trim(),
        directionsNote: directionsNote.trim(),
        ...(latitude === undefined ? {} : { latitude }),
        ...(longitude === undefined ? {} : { longitude }),
        rooms: rooms
          .filter((room) => room.name.trim())
          .map((room) => ({
            ...(room.id ? { id: room.id } : {}),
            name: room.name.trim(),
            floor: room.floor.trim(),
            ...(room.capacity.trim() ? { capacity: Number(room.capacity) } : {}),
          })),
      })
      setEditingVenueId('')
      setName('')
      setAddress('')
      setDirectionsNote('')
      setRooms([{ name: '', floor: '', capacity: '' }])
    } catch (venueError) {
      setError(venueError instanceof Error ? venueError.message : 'Unable to save venue.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteVenue(venue: ProgramVenue) {
    const confirmed = window.confirm(`Delete saved venue "${venue.name}"? Existing schedule rows will keep their copied venue text.`)
    if (!confirmed) return
    setError('')
    setBusy(true)
    try {
      await deleteProgramVenueCallable({ orgId, programId: program.id, venueId: venue.id })
      if (editingVenueId === venue.id) {
        setEditingVenueId('')
        setName('')
        setAddress('')
        setDirectionsNote('')
        setRooms([{ name: '', floor: '', capacity: '' }])
      }
    } catch (venueError) {
      setError(venueError instanceof Error ? venueError.message : 'Unable to delete venue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Venue library" onClose={onClose} open={open} title="Manage saved venues" wide>
      <div className="venue-library-layout">
        <section className="venue-library-list">
          {venues.length === 0 ? (
            <EmptyState title="No saved venues yet" body="Add campuses, auditoriums, halls, stages, rooms, or booth zones once, then reuse them while building schedules." />
          ) : (
            venues.map((venue) => (
              <article className={editingVenueId === venue.id ? 'venue-library-card active' : 'venue-library-card'} key={venue.id}>
                <div>
                  <strong>{venue.name}</strong>
                  <span>{venue.address || 'Address pending'}</span>
                  <small>{venue.rooms?.length ? venue.rooms.map((room) => room.name).join(', ') : 'No rooms added'}</small>
                </div>
                <div className="table-actions">
                  <button className="icon-button" onClick={() => editVenue(venue)} title="Edit venue" type="button"><Pencil size={16} /></button>
                  <button className="icon-button danger-icon" disabled={busy} onClick={() => deleteVenue(venue)} title="Delete venue" type="button"><Trash2 size={16} /></button>
                </div>
              </article>
            ))
          )}
        </section>

        <form className="venue-library-form" onSubmit={saveVenue}>
          <div className="panel-heading compact-heading">
            <div>
              <span className="eyebrow">{editingVenueId ? 'Edit saved venue' : 'Add venue'}</span>
              <h2>{editingVenueId ? 'Update venue details' : 'New venue'}</h2>
            </div>
            {editingVenueId && (
              <button className="secondary-button subtle-button" onClick={() => { setEditingVenueId(''); setName(''); setAddress(''); setDirectionsNote(''); setRooms([{ name: '', floor: '', capacity: '' }]) }} type="button">
                New
              </button>
            )}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid two">
            <label>
              Venue name
              <input placeholder="Main Auditorium, OAT, Convocation Hall" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Address / campus
              <input placeholder="IIT Roorkee, Civil Lines..." value={address} onChange={(event) => setAddress(event.target.value)} />
            </label>
          </div>
          <MapPicker
            label="Search or pin venue on map"
            lat={latitude}
            lng={longitude}
            onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
            onVenueChange={(nextVenue) => { setAddress(nextVenue); if (!name.trim()) setName(nextVenue.split(',')[0] || nextVenue) }}
            venue={address}
          />
          <RichTextEditor
            label="How to reach this venue"
            onChange={setDirectionsNote}
            placeholder="Gate instructions, parking, metro, hall route, entry desk notes..."
            value={directionsNote}
          />
          <div className="rooms-editor">
            <div className="section-mini-head">
              <span>Rooms, halls, stages</span>
              <button className="secondary-button subtle-button" onClick={() => setRooms((current) => [...current, { name: '', floor: '', capacity: '' }])} type="button">
                <Plus size={15} />
                Add room
              </button>
            </div>
            {rooms.map((room, index) => (
              <div className="room-row" key={room.id || index}>
                <input placeholder="Hall A, Stage 2, Poster Zone" value={room.name} onChange={(event) => updateRoom(index, 'name', event.target.value)} />
                <input placeholder="Floor / block" value={room.floor} onChange={(event) => updateRoom(index, 'floor', event.target.value)} />
                <input inputMode="numeric" placeholder="Capacity" value={room.capacity} onChange={(event) => updateRoom(index, 'capacity', event.target.value.replace(/\D/g, ''))} />
                <button className="icon-button danger-icon" onClick={() => removeRoom(index)} title="Remove room row" type="button"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            Save venue
          </button>
        </form>
      </div>
    </Modal>
  )
}

function cleanVenueRooms(rooms: Array<{ id?: string; name: string; floor?: string; capacity?: string | number }> = []): VenueRoom[] {
  return rooms
    .filter((room) => room.name.trim())
    .map((room) => ({
      ...(room.id ? { id: room.id } : { id: makeLocalId() }),
      name: room.name.trim(),
      floor: String(room.floor || '').trim(),
      ...(room.capacity === undefined || String(room.capacity).trim() === '' ? {} : { capacity: Number(room.capacity) }),
    }))
}

function serializeVenueForFunction(venue: ProgramVenue): ProgramVenueInput {
  return {
    ...(venue.id ? { id: venue.id } : {}),
    name: venue.name.trim(),
    address: (venue.address || '').trim(),
    directionsNote: (venue.directionsNote || '').trim(),
    ...(venue.latitude === undefined ? {} : { latitude: venue.latitude }),
    ...(venue.longitude === undefined ? {} : { longitude: venue.longitude }),
    rooms: (venue.rooms || []).map((room) => ({
      ...(room.id ? { id: room.id } : {}),
      name: room.name.trim(),
      floor: (room.floor || '').trim(),
      ...(room.capacity === undefined ? {} : { capacity: room.capacity }),
    })),
  }
}

function findVenueId(venues: ProgramVenue[], input: { name?: string; latitude?: number; longitude?: number }) {
  const normalizedName = (input.name || '').trim().toLowerCase()
  if (!normalizedName) return ''
  const matchedVenue = venues.find((venue) => {
    const nameMatches = venue.name.trim().toLowerCase() === normalizedName
    const latitudeMatches = input.latitude === undefined || venue.latitude === undefined || Math.abs((venue.latitude || 0) - input.latitude) < 0.00001
    const longitudeMatches = input.longitude === undefined || venue.longitude === undefined || Math.abs((venue.longitude || 0) - input.longitude) < 0.00001
    return nameMatches && latitudeMatches && longitudeMatches
  })
  return matchedVenue?.id || ''
}

function DraftVenueLibraryModal({
  open,
  onClose,
  venues,
  onChange,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  venues: ProgramVenue[]
  onChange: (venues: ProgramVenue[]) => void
  onSaved: (venue: ProgramVenue) => void
}) {
  const [editingVenueId, setEditingVenueId] = useState('')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [directionsNote, setDirectionsNote] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>()
  const [longitude, setLongitude] = useState<number | undefined>()
  const [rooms, setRooms] = useState<Array<{ id?: string; name: string; floor: string; capacity: string }>>([{ name: '', floor: '', capacity: '' }])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setEditingVenueId('')
    setName('')
    setAddress('')
    setDirectionsNote('')
    setLatitude(undefined)
    setLongitude(undefined)
    setRooms([{ name: '', floor: '', capacity: '' }])
    setError('')
  }, [open])

  function editVenue(venue: ProgramVenue) {
    setEditingVenueId(venue.id)
    setName(venue.name)
    setAddress(venue.address || '')
    setDirectionsNote(venue.directionsNote || '')
    setLatitude(venue.latitude)
    setLongitude(venue.longitude)
    const editableRooms = venue.rooms?.length ? venue.rooms : []
    setRooms((editableRooms.length ? editableRooms : [{ id: '', name: '', floor: '', capacity: undefined }]).map((room) => ({
      id: room.id,
      name: room.name,
      floor: room.floor || '',
      capacity: room.capacity === undefined ? '' : String(room.capacity),
    })))
    setError('')
  }

  function resetForm() {
    setEditingVenueId('')
    setName('')
    setAddress('')
    setDirectionsNote('')
    setLatitude(undefined)
    setLongitude(undefined)
    setRooms([{ name: '', floor: '', capacity: '' }])
  }

  function updateRoom(index: number, key: 'name' | 'floor' | 'capacity', value: string) {
    setRooms((current) => current.map((room, roomIndex) => roomIndex === index ? { ...room, [key]: value } : room))
  }

  function removeRoom(index: number) {
    setRooms((current) => current.length === 1 ? [{ name: '', floor: '', capacity: '' }] : current.filter((_, roomIndex) => roomIndex !== index))
  }

  function saveDraftVenue(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Venue name is required.')
      return
    }
    const venueId = editingVenueId || makeLocalId()
    const nextVenue: ProgramVenue = {
      id: venueId,
      name: name.trim(),
      address: address.trim(),
      directionsNote: directionsNote.trim(),
      ...(latitude === undefined ? {} : { latitude }),
      ...(longitude === undefined ? {} : { longitude }),
      rooms: cleanVenueRooms(rooms),
    }
    const nextVenues = editingVenueId
      ? venues.map((venue) => venue.id === editingVenueId ? nextVenue : venue)
      : [...venues, nextVenue]
    onChange(nextVenues.sort((first, second) => first.name.localeCompare(second.name)))
    onSaved(nextVenue)
    resetForm()
  }

  function deleteDraftVenue(venue: ProgramVenue) {
    onChange(venues.filter((item) => item.id !== venue.id))
    if (editingVenueId === venue.id) resetForm()
  }

  return (
    <Modal eyebrow="Program venue" onClose={onClose} open={open} title="Add or select venue" wide>
      <div className="venue-library-layout">
        <section className="venue-library-list">
          {venues.length === 0 ? (
            <EmptyState title="No draft venues yet" body="Add the main campus, auditorium, hotel, hall, or venue zone. The selected venue will be saved with this program." />
          ) : (
            venues.map((venue) => (
              <article className={editingVenueId === venue.id ? 'venue-library-card active' : 'venue-library-card'} key={venue.id}>
                <div>
                  <strong>{venue.name}</strong>
                  <span>{venue.address || 'Address pending'}</span>
                  <small>{venue.rooms?.length ? venue.rooms.map((room) => room.name).join(', ') : 'No rooms added'}</small>
                </div>
                <div className="table-actions">
                  <button className="icon-button" onClick={() => { onSaved(venue); onClose() }} title="Use this venue" type="button"><Check size={16} /></button>
                  <button className="icon-button" onClick={() => editVenue(venue)} title="Edit venue" type="button"><Pencil size={16} /></button>
                  <button className="icon-button danger-icon" onClick={() => deleteDraftVenue(venue)} title="Delete venue" type="button"><Trash2 size={16} /></button>
                </div>
              </article>
            ))
          )}
        </section>

        <form className="venue-library-form" onSubmit={saveDraftVenue}>
          <div className="panel-heading compact-heading">
            <div>
              <span className="eyebrow">{editingVenueId ? 'Edit venue' : 'Add venue'}</span>
              <h2>{editingVenueId ? 'Update draft venue' : 'New program venue'}</h2>
            </div>
            {editingVenueId && (
              <button className="secondary-button subtle-button" onClick={resetForm} type="button">
                New
              </button>
            )}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="form-grid two">
            <label>
              Venue name
              <input placeholder="Main Auditorium, Convention Center, Campus" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Address / campus
              <input placeholder="Search below or enter address" value={address} onChange={(event) => setAddress(event.target.value)} />
            </label>
          </div>
          <MapPicker
            label="Search or pin venue on map"
            lat={latitude}
            lng={longitude}
            onPick={(point) => { setLatitude(point.latitude); setLongitude(point.longitude) }}
            onVenueChange={(nextVenue) => { setAddress(nextVenue); if (!name.trim()) setName(nextVenue.split(',')[0] || nextVenue) }}
            venue={address}
          />
          <RichTextEditor
            label="How to reach this venue"
            onChange={setDirectionsNote}
            placeholder="Gate instructions, parking, metro, hall route, entry desk notes..."
            value={directionsNote}
          />
          <div className="rooms-editor">
            <div className="section-mini-head">
              <span>Optional halls, rooms, stages</span>
              <button className="secondary-button subtle-button" onClick={() => setRooms((current) => [...current, { name: '', floor: '', capacity: '' }])} type="button">
                <Plus size={15} />
                Add room
              </button>
            </div>
            {rooms.map((room, index) => (
              <div className="room-row" key={room.id || index}>
                <input placeholder="Hall A, Stage 2, Poster Zone" value={room.name} onChange={(event) => updateRoom(index, 'name', event.target.value)} />
                <input placeholder="Floor / block" value={room.floor} onChange={(event) => updateRoom(index, 'floor', event.target.value)} />
                <input inputMode="numeric" placeholder="Capacity" value={room.capacity} onChange={(event) => updateRoom(index, 'capacity', event.target.value.replace(/\D/g, ''))} />
                <button className="icon-button danger-icon" onClick={() => removeRoom(index)} title="Remove room row" type="button"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button className="primary-button" type="submit">
            <Save size={17} />
            Save venue
          </button>
        </form>
      </div>
    </Modal>
  )
}

function ProgramVenueSelector({
  label,
  helper,
  venues,
  value,
  onChoose,
  onAddVenue,
}: {
  label: string
  helper: string
  venues: ProgramVenue[]
  value: string
  onChoose: (selection: { venueId: string; venueName: string; address: string; directionsNote?: string; latitude?: number; longitude?: number }) => void
  onAddVenue: () => void
}) {
  function selectVenue(nextValue: string) {
    if (nextValue === '__add_venue__') {
      onAddVenue()
      return
    }
    const venue = venues.find((item) => item.id === nextValue)
    if (!venue) {
      onChoose({ venueId: '', venueName: '', address: '', directionsNote: '', latitude: undefined, longitude: undefined })
      return
    }
    onChoose({
      venueId: venue.id,
      venueName: venue.name,
      address: venue.address || venue.name,
      directionsNote: venue.directionsNote || '',
      latitude: venue.latitude,
      longitude: venue.longitude,
    })
  }

  return (
    <section className="event-venue-selector">
      <label>
        <span>{label}</span>
        <select value={value} onChange={(event) => selectVenue(event.target.value)}>
          <option value="">{venues.length ? 'Choose saved venue' : 'Add venue first'}</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}{venue.address ? ` - ${venue.address}` : ''}
            </option>
          ))}
          <option value="__add_venue__">+ Add venue</option>
        </select>
      </label>
      <p>{helper}</p>
    </section>
  )
}

function ScheduleVenueSelector({
  venues,
  row,
  onChange,
  onAddVenue,
}: {
  venues: ProgramVenue[]
  row: ScheduleDraftRow
  onChange: (changes: Partial<ScheduleDraftRow>) => void
  onAddVenue: () => void
}) {
  const selectedVenue = venues.find((venue) => venue.id === row.venueId)
  const rooms = selectedVenue?.rooms || []

  function chooseVenue(value: string) {
    if (value === '__add_venue__') {
      onAddVenue()
      return
    }
    const venue = venues.find((item) => item.id === value)
    if (!venue) {
      onChange({
        venueId: '',
        venueName: '',
        roomId: '',
        roomName: '',
        address: '',
        directionsNote: '',
        latitude: undefined,
        longitude: undefined,
      })
      return
    }
    onChange({
      venueId: venue.id,
      venueName: venue.name,
      roomId: '',
      roomName: '',
      address: venue.address || venue.name,
      directionsNote: venue.directionsNote || '',
      latitude: venue.latitude,
      longitude: venue.longitude,
    })
  }

  function chooseRoom(value: string) {
    if (value === '__custom_room__') {
      onChange({ roomId: '', roomName: '' })
      return
    }
    const room = rooms.find((item) => item.id === value)
    onChange({
      roomId: room?.id || '',
      roomName: room?.name || '',
    })
  }

  return (
    <div className="schedule-venue-selector">
      <label>
        <span>Venue</span>
        <select value={row.venueId || ''} onChange={(event) => chooseVenue(event.target.value)}>
          <option value="">{venues.length ? 'Choose venue' : 'No venues saved yet'}</option>
          {venues.map((venue) => (
            <option key={venue.id} value={venue.id}>
              {venue.name}{venue.address ? ` - ${venue.address}` : ''}
            </option>
          ))}
          <option value="__add_venue__">+ Add venue</option>
        </select>
      </label>

      <label>
        <span>Hall / room</span>
        <select disabled={!selectedVenue} value={row.roomId || ''} onChange={(event) => chooseRoom(event.target.value)}>
          <option value="">{selectedVenue ? 'Choose hall / room' : 'Choose venue first'}</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}{room.floor ? ` - ${room.floor}` : ''}{room.capacity ? ` (${room.capacity})` : ''}
            </option>
          ))}
          {selectedVenue && <option value="__custom_room__">Custom / not listed</option>}
        </select>
      </label>

      {selectedVenue && (!rooms.length || !row.roomId) && (
        <input placeholder={rooms.length ? 'Custom hall / room' : 'Hall / room name'} value={row.roomName} onChange={(event) => onChange({ roomId: '', roomName: event.target.value })} />
      )}
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
  canCreate,
}: {
  programs: Program[]
  events: ProgramEvent[]
  onChoose: (programId: string) => void
  onCreate: () => void
  canCreate: boolean
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
          {canCreate && (
            <button className="primary-button" onClick={onCreate} type="button">
              <Plus size={17} />
              Create program
            </button>
          )}
        </div>

        {programs.length === 0 ? (
          <section className="panel">
            <EmptyState title="No programs available" body={canCreate ? 'Create your first conference, college fest, corporate event, competition, workshop, or standalone event.' : 'No program has been assigned to this CRM account yet.'} />
            {canCreate && (
              <button className="primary-button" onClick={onCreate} type="button">
                <Plus size={17} />
                Create first program
              </button>
            )}
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
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    async function loadOrganizations() {
      setError('')
      const snapshots = await Promise.all(profile.organizationIds.map(async (orgId) => {
        try {
          return await getDoc(doc(db, 'peOrganizations', orgId))
        } catch {
          return null
        }
      }))
      if (!mounted) return
      const visibleOrganizations = snapshots
        .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot?.exists()))
        .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Organization)
      setOrganizations(visibleOrganizations)
      if (visibleOrganizations.length < profile.organizationIds.length) {
        setError('Some saved workspaces are no longer available for this account.')
      }
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
        {error && <p className="form-error">{error}</p>}
      </section>
    </main>
  )
}

function ProgramWorkspaceDashboard({
  orgId,
  program,
  events,
  people,
  scheduleItems,
  venueCatalog,
  setRoute,
}: {
  orgId: string
  program: Program
  events: ProgramEvent[]
  people: ProgramPerson[]
  scheduleItems: ScheduleItem[]
  venueCatalog?: ProgramVenueCatalog | null
  setRoute: (route: RouteKey) => void
}) {
  const issuedPasses = people.filter((person) => person.passStatus === 'issued' || person.passStatus === 'checkedIn').length
  const [publishing, setPublishing] = useState<'events' | 'people' | 'schedule' | ''>('')
  const [publishNotice, setPublishNotice] = useState('')
  const [publishError, setPublishError] = useState('')
  const eventsPublishedAt = timestampMs(program.eventsLastPublishedAt)
  const peoplePublishedAt = timestampMs(program.peopleLastPublishedAt)
  const schedulePublishedAt = timestampMs(program.scheduleLastPublishedAt)
  const eventsPublishPending = Boolean(events.length && (!eventsPublishedAt || newestTimestamp(events) > eventsPublishedAt))
  const peoplePublishPending = Boolean(people.length && (!peoplePublishedAt || newestTimestamp(people) > peoplePublishedAt))
  const schedulePublishPending = Boolean(scheduleItems.length && (!schedulePublishedAt || newestTimestamp(scheduleItems) > schedulePublishedAt))
  const pendingMessages = [
    eventsPublishPending ? 'Events changed after the last mobile publish.' : '',
    peoplePublishPending ? 'People/pass access changed after the last mobile publish.' : '',
    schedulePublishPending ? 'Schedule changed after the last mobile publish.' : '',
  ].filter(Boolean)

  async function runDashboardPublish(kind: 'events' | 'people' | 'schedule') {
    setPublishing(kind)
    setPublishNotice('')
    setPublishError('')
    try {
      if (kind === 'events') {
        const response = await publishProgramEventsCallable({ orgId, programId: program.id })
        setPublishNotice(`Published ${formatCount(response.data.itemCount)} event${response.data.itemCount === 1 ? '' : 's'} to Sang app.`)
      } else if (kind === 'people') {
        const response = await publishProgramPeopleAccessCallable({ orgId, programId: program.id, notify: true })
        setPublishNotice(`Published ${formatCount(response.data.peopleCount)} people. Linked ${formatCount(response.data.linkedCount + response.data.alreadyLinkedCount)}, pending ${formatCount(response.data.pendingCount)}, review ${formatCount(response.data.manualReviewCount)}.`)
      } else {
        const response = await publishProgramScheduleCallable({ orgId, programId: program.id })
        setPublishNotice(`Published ${formatCount(response.data.itemCount)} schedule item${response.data.itemCount === 1 ? '' : 's'} in ${formatCount(response.data.pageCount)} page${response.data.pageCount === 1 ? '' : 's'}.`)
      }
    } catch (publishFailure) {
      setPublishError(publishFailure instanceof Error ? publishFailure.message : 'Unable to publish right now.')
    } finally {
      setPublishing('')
    }
  }

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

      <section className="dashboard-publish-panel">
        <div className="dashboard-publish-copy">
          <span className="eyebrow">Mobile app publishing</span>
          <h2>Keep Sang app data live</h2>
          <p>Publish after editing events, people access, or schedule so attendees see the latest version.</p>
        </div>
        <div className="dashboard-publish-actions">
          <button className={`secondary-button ${eventsPublishPending ? 'publish-button-pending' : ''}`} disabled={publishing !== '' || events.length === 0} onClick={() => runDashboardPublish('events')} type="button">
            {publishing === 'events' ? <Loader2 className="spin" size={16} /> : <UploadCloud size={16} />}
            Publish events
          </button>
          <button className={`secondary-button ${peoplePublishPending ? 'publish-button-pending' : ''}`} disabled={publishing !== '' || people.length === 0} onClick={() => runDashboardPublish('people')} type="button">
            {publishing === 'people' ? <Loader2 className="spin" size={16} /> : <BadgeCheck size={16} />}
            Publish people
          </button>
          <button className={`secondary-button ${schedulePublishPending ? 'publish-button-pending' : ''}`} disabled={publishing !== '' || scheduleItems.length === 0} onClick={() => runDashboardPublish('schedule')} type="button">
            {publishing === 'schedule' ? <Loader2 className="spin" size={16} /> : <Clock size={16} />}
            Publish schedule
          </button>
        </div>
        {pendingMessages.length ? (
          <div className="publish-reminder">
            <ShieldCheck size={17} />
            <div>
              <strong>Publish reminder</strong>
              {pendingMessages.map((message) => <span key={message}>{message}</span>)}
            </div>
          </div>
        ) : null}
        {publishNotice ? <p className="form-success">{publishNotice}</p> : null}
        {publishError ? <p className="form-error">{publishError}</p> : null}
      </section>

      <div className="stats-grid">
        <Stat icon={CalendarDays} label="Events" value={formatCount(events.length)} detail={program.mode === 'standalone' ? 'Optional sub-events' : 'Inside this program'} />
        <Stat icon={BadgeCheck} label="Passes issued" value={formatCount(issuedPasses)} detail="For selected program" />
        <Stat icon={Users} label="People" value={formatCount(people.length)} detail="Attendees, participants, staff" />
      </div>

      <div className="quick-action-grid">
        <button className="quick-action" onClick={() => setRoute('settings')} type="button">
          <Settings size={20} />
          <span>
            <strong>Program profile</strong>
            <small>Logo, banner, dates, type, entry rules</small>
          </span>
        </button>
        <button className="quick-action" onClick={() => setRoute('people')} type="button">
          <Users size={20} />
          <span>
            <strong>People and passes</strong>
            <small>Upload attendees, participants, staff</small>
          </span>
        </button>
        <button className="quick-action" onClick={() => setRoute('venues')} type="button">
          <MapPin size={20} />
          <span>
            <strong>Venues</strong>
            <small>{venueCatalog?.venues?.length ? `${venueCatalog.venues.length} saved venues and halls` : 'Save halls, rooms, stages'}</small>
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
              <span className="eyebrow">Setup readiness</span>
              <h2>Operations snapshot</h2>
            </div>
            <ClipboardList size={20} />
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

function VenuesPage({
  orgId,
  program,
  venueCatalog,
}: {
  orgId: string
  program: Program
  venueCatalog?: ProgramVenueCatalog | null
}) {
  const venues = venueCatalog?.venues || []
  const roomCount = venues.reduce((total, venue) => total + (venue.rooms?.length || 0), 0)
  const [venueLibraryOpen, setVenueLibraryOpen] = useState(false)

  return (
    <section className="page-stack">
      <section className="venue-page-hero">
        <div>
          <span className="eyebrow">Program venue library</span>
          <h1>{program.name} venues</h1>
          <p>Save campuses, auditoriums, halls, rooms, stages, zones, and booth areas once. Schedule rows can reuse these saved venues with coordinates and room details.</p>
        </div>
        <button className="primary-button" onClick={() => setVenueLibraryOpen(true)} type="button">
          <Plus size={17} />
          Add venue
        </button>
      </section>

      <div className="stats-grid">
        <Stat icon={MapPin} label="Saved venues" value={formatCount(venues.length)} detail="Reusable in event schedules" />
        <Stat icon={Building2} label="Rooms and halls" value={formatCount(roomCount)} detail="Inside saved venues" />
        <Stat icon={CalendarDays} label="Program" value={program.mode === 'standalone' ? 'Single' : 'Multi'} detail="Venue library is program scoped" />
        <Stat icon={Check} label="Schedule ready" value={venues.length ? 'Yes' : 'No'} detail={venues.length ? 'Dropdown suggestions active' : 'Add the first venue'} />
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Saved library</span>
            <h2>Venues, halls, rooms</h2>
          </div>
          <button className="secondary-button" onClick={() => setVenueLibraryOpen(true)} type="button">
            <Pencil size={16} />
            Manage venues
          </button>
        </div>

        {venues.length === 0 ? (
          <EmptyState title="No saved venues yet" body="Add the first venue with map coordinates, then add halls, rooms, stages, or zones under it." />
        ) : (
          <div className="venue-page-grid">
            {venues.map((venue) => (
              <article className="venue-page-card" key={venue.id}>
                <div className="venue-page-card-head">
                  <span><MapPin size={17} /></span>
                  <button className="icon-button" onClick={() => setVenueLibraryOpen(true)} title="Edit venue" type="button">
                    <Pencil size={16} />
                  </button>
                </div>
                <strong>{venue.name}</strong>
                <p>{venue.address || 'Address not added yet'}</p>
                <small>
                  {venue.latitude !== undefined && venue.longitude !== undefined
                    ? `${venue.latitude.toFixed(5)}, ${venue.longitude.toFixed(5)}`
                    : 'Coordinates pending'}
                </small>
                <div className="venue-card-rooms">
                  {venue.rooms?.length ? venue.rooms.slice(0, 5).map((room) => (
                    <span className="chip" key={room.id}>{room.name}{room.floor ? ` - ${room.floor}` : ''}</span>
                  )) : <span className="chip muted-chip">No rooms added</span>}
                  {(venue.rooms?.length || 0) > 5 && <span className="chip">+{(venue.rooms?.length || 0) - 5}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <VenueLibraryModal
        orgId={orgId}
        onClose={() => setVenueLibraryOpen(false)}
        open={venueLibraryOpen}
        program={program}
        venueCatalog={venueCatalog}
      />
    </section>
  )
}

function PatronsPage({
  orgId,
  uid,
  program,
  partners,
}: {
  orgId: string
  uid: string
  program: Program
  partners: ProgramPartner[]
}) {
  const sortedPartners = useMemo(
    () => [...partners].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name)),
    [partners],
  )
  const visiblePartners = sortedPartners.filter((partner) => partner.status !== 'hidden')
  const hiddenPartners = sortedPartners.length - visiblePartners.length
  const [editingPartner, setEditingPartner] = useState<ProgramPartner | null>(null)
  const [name, setName] = useState('')
  const [tier, setTier] = useState('Title Partner')
  const [category, setCategory] = useState('')
  const [booth, setBooth] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [status, setStatus] = useState<'active' | 'hidden'>('active')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function resetForm() {
    setEditingPartner(null)
    setName('')
    setTier('Title Partner')
    setCategory('')
    setBooth('')
    setWebsiteUrl('')
    setLogoUrl('')
    setDescription('')
    setSortOrder(sortedPartners.length + 1)
    setStatus('active')
  }

  useEffect(() => {
    resetForm()
  }, [program.id])

  function startEdit(partner: ProgramPartner) {
    setEditingPartner(partner)
    setName(partner.name || '')
    setTier(partner.tier || 'Partner')
    setCategory(partner.category || '')
    setBooth(partner.booth || '')
    setWebsiteUrl(partner.websiteUrl || '')
    setLogoUrl(partner.logoUrl || '')
    setDescription(partner.description || '')
    setSortOrder(Number(partner.sortOrder || 0))
    setStatus(partner.status === 'hidden' ? 'hidden' : 'active')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function savePartner(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await saveProgramPartnerCallable({
        orgId,
        programId: program.id,
        partnerId: editingPartner?.id || '',
        name: name.trim(),
        tier: tier.trim() || 'Partner',
        category: category.trim(),
        booth: booth.trim(),
        description: description.trim(),
        websiteUrl: websiteUrl.trim(),
        logoUrl: logoUrl.trim(),
        sortOrder: Number(sortOrder || 0),
        status,
      })
      resetForm()
    } catch (partnerError) {
      setError(partnerError instanceof Error ? partnerError.message : 'Unable to save patron.')
    } finally {
      setBusy(false)
    }
  }

  async function removePartner(partner: ProgramPartner) {
    const confirmed = window.confirm(`Delete "${partner.name}" from ${program.name} patrons?`)
    if (!confirmed) return
    setError('')
    setBusy(true)
    try {
      await deleteProgramPartnerCallable({ orgId, programId: program.id, partnerId: partner.id })
      if (editingPartner?.id === partner.id) resetForm()
    } catch (partnerError) {
      setError(partnerError instanceof Error ? partnerError.message : 'Unable to delete patron.')
    } finally {
      setBusy(false)
    }
  }

  function initialsFor(value: string) {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'P'
  }

  return (
    <section className="page-stack">
      <section className="venue-page-hero patrons-hero">
        <div>
          <span className="eyebrow">Patrons and sponsors</span>
          <h1>{program.name} partners</h1>
          <p>Manage sponsor logos, tiers, categories, booth locations, websites, and short descriptions shown inside the Sang mobile app.</p>
        </div>
        <span className="schedule-count"><BadgeCheck size={16} /> {formatCount(visiblePartners.length)} live</span>
      </section>

      <div className="stats-grid">
        <Stat icon={BadgeCheck} label="Visible patrons" value={formatCount(visiblePartners.length)} detail="Shown in mobile app" />
        <Stat icon={Building2} label="Hidden" value={formatCount(hiddenPartners)} detail="Saved but not visible" />
        <Stat icon={Ticket} label="Program" value={program.mode === 'standalone' ? 'Single' : 'Multi'} detail="Partners are program scoped" />
        <Stat icon={Link2} label="Websites" value={formatCount(visiblePartners.filter((partner) => partner.websiteUrl).length)} detail="External links captured" />
      </div>

      <section className="page-grid">
        <form className="panel form-panel" onSubmit={savePartner}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{editingPartner ? 'Edit patron' : 'Add patron'}</span>
              <h2>{editingPartner ? editingPartner.name : 'Partner profile'}</h2>
            </div>
            <BadgeCheck size={20} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <ImageUploader folder="program-partners" label="Logo" onChange={setLogoUrl} uid={uid} value={logoUrl} />
          <label>
            Name
            <input placeholder="Sang Labs" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <div className="form-grid two">
            <label>
              Tier
              <input placeholder="Title Partner, Gold Patron..." value={tier} onChange={(event) => setTier(event.target.value)} />
            </label>
            <label>
              Category
              <input placeholder="Fintech, hiring, community..." value={category} onChange={(event) => setCategory(event.target.value)} />
            </label>
            <label>
              Booth
              <input placeholder="A1, Hall 2, booth 18..." value={booth} onChange={(event) => setBooth(event.target.value)} />
            </label>
            <label>
              Sort order
              <input min={0} type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value || 0))} />
            </label>
          </div>
          <label>
            Website
            <input placeholder="https://..." value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} />
          </label>
          <label>
            Visibility
            <select value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'hidden')}>
              <option value="active">Visible in Sang app</option>
              <option value="hidden">Hidden for now</option>
            </select>
          </label>
          <RichTextEditor label="Description" onChange={setDescription} placeholder="Short sponsor or patron introduction for attendees." value={description} />
          <div className="action-row split-actions">
            <button className="secondary-button" onClick={resetForm} type="button">
              <X size={16} />
              Clear
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
              {editingPartner ? 'Save patron' : 'Add patron'}
            </button>
          </div>
        </form>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Mobile directory</span>
              <h2>Patrons list</h2>
            </div>
            <button
              className="icon-button"
              disabled={!sortedPartners.length}
              onClick={() => downloadCsv('sang-program-patrons.csv', sortedPartners.map((partner) => ({
                name: partner.name,
                tier: partner.tier || '',
                category: partner.category || '',
                booth: partner.booth || '',
                website: partner.websiteUrl || '',
                status: partner.status || 'active',
              })))}
              title="Download patrons CSV"
              type="button"
            >
              <Download size={18} />
            </button>
          </div>
          {sortedPartners.length === 0 ? (
            <EmptyState title="No patrons yet" body="Add title partners, sponsors, exhibitors, and community partners here. Active records appear in the Sang mobile Patrons tab." />
          ) : (
            <div className="partner-list">
              {sortedPartners.map((partner) => (
                <article className="partner-card" key={partner.id}>
                  <div className="partner-logo">
                    {partner.logoUrl ? <img alt="" src={partner.logoUrl} /> : <span>{initialsFor(partner.name)}</span>}
                  </div>
                  <div className="partner-body">
                    <div className="partner-topline">
                      <strong>{partner.name}</strong>
                      <span className={`status ${partner.status === 'hidden' ? 'draft' : 'active'}`}>{partner.status || 'active'}</span>
                    </div>
                    <p>{richTextToPlainText(partner.description) || 'No description yet.'}</p>
                    <div className="chip-row">
                      <span className="chip">{partner.tier || 'Partner'}</span>
                      {partner.category && <span className="chip">{partner.category}</span>}
                      {partner.booth && <span className="chip">Booth {partner.booth}</span>}
                      {partner.websiteUrl && <span className="chip">Website</span>}
                    </div>
                  </div>
                  <div className="table-actions">
                    <button className="icon-button" onClick={() => startEdit(partner)} title="Edit patron" type="button">
                      <Pencil size={16} />
                    </button>
                    <button className="icon-button danger-icon" disabled={busy} onClick={() => removePartner(partner)} title="Delete patron" type="button">
                      {busy ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </section>
  )
}

function DashboardPage({
  programs,
  people,
  setRoute,
}: {
  programs: Program[]
  people: ProgramPerson[]
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
              <span className="eyebrow">Setup readiness</span>
              <h2>Operations snapshot</h2>
            </div>
            <ClipboardList size={20} />
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
  venueCatalogs,
  onChoose,
  canCreateProgram,
  canDeleteProgram,
}: {
  orgId: string
  uid: string
  programs: Program[]
  events: ProgramEvent[]
  venueCatalogs: ProgramVenueCatalog[]
  onChoose?: (programId: string) => void
  canCreateProgram: boolean
  canDeleteProgram: boolean
}) {
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [mode, setMode] = useState<ProgramMode>('multiEvent')
  const [programType, setProgramType] = useState('college_fest')
  const [customProgramType, setCustomProgramType] = useState('')
  const [startDate, setStartDate] = useState(nowDateInput())
  const [endDate, setEndDate] = useState(nowDateInput())
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [draftVenues, setDraftVenues] = useState<ProgramVenue[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [description, setDescription] = useState('')
  const [competitive, setCompetitive] = useState(false)
  const [resultsEnabled, setResultsEnabled] = useState(false)
  const [createOpen, setCreateOpen] = useState(programs.length === 0 && canCreateProgram)
  const [venueDraftOpen, setVenueDraftOpen] = useState(false)
  const [editingProgramId, setEditingProgramId] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingProgramId, setDeletingProgramId] = useState('')
  const [error, setError] = useState('')
  const visiblePrograms = useMemo(() => programs.filter((program) => program.status !== 'archived'), [programs])
  const selectedDraftVenue = draftVenues.find((venue) => venue.id === selectedVenueId) || null
  const editingProgram = visiblePrograms.find((program) => program.id === editingProgramId) || null
  const editingVenueCatalog = editingProgram
    ? venueCatalogs.find((catalog) => catalog.id === editingProgram.id || catalog.programId === editingProgram.id) || null
    : null

  useEffect(() => {
    if (!canCreateProgram && createOpen) {
      setCreateOpen(false)
    }
  }, [canCreateProgram, createOpen])

  useEffect(() => {
    if (editingProgramId && !visiblePrograms.some((program) => program.id === editingProgramId)) {
      setEditingProgramId('')
    }
  }, [editingProgramId, visiblePrograms])

  async function createProgram(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!canCreateProgram) {
      setError('You do not have access to create programs.')
      return
    }
    if (!selectedDraftVenue) {
      setError('Add or choose the program venue before creating the program.')
      return
    }
    setBusy(true)
    try {
      const createPayload: CreateProgramPayload = {
        orgId,
        name: name.trim(),
        tagline: tagline.trim(),
        mode,
        programType: programType === 'custom' ? customProgramType.trim() || 'custom' : programType,
        startDate,
        endDate,
        startTime,
        endTime,
        venueName: selectedDraftVenue.name.trim(),
        city: '',
        logoUrl: logoUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        posterUrl: posterUrl.trim(),
        ...(selectedDraftVenue.latitude === undefined ? {} : { latitude: selectedDraftVenue.latitude }),
        ...(selectedDraftVenue.longitude === undefined ? {} : { longitude: selectedDraftVenue.longitude }),
        address: (selectedDraftVenue.address || selectedDraftVenue.name).trim(),
        directionsNote: (selectedDraftVenue.directionsNote || '').trim(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        description: description.trim(),
        entryScope: 'program',
        competitive,
        resultsEnabled: competitive ? resultsEnabled : false,
        primaryVenue: serializeVenueForFunction(selectedDraftVenue),
      }
      const response = await createProgramCallable(createPayload)
      const savedVenue = serializeVenueForFunction(selectedDraftVenue)
      try {
        await saveProgramVenueCallable({
          orgId,
          programId: response.data.programId,
          venueId: savedVenue.id,
          name: savedVenue.name,
          address: savedVenue.address || savedVenue.name,
          directionsNote: savedVenue.directionsNote || '',
          ...(savedVenue.latitude === undefined ? {} : { latitude: savedVenue.latitude }),
          ...(savedVenue.longitude === undefined ? {} : { longitude: savedVenue.longitude }),
          rooms: (savedVenue.rooms || []).map((room) => ({
            ...(room.id ? { id: room.id } : {}),
            name: room.name,
            floor: room.floor || '',
            ...(room.capacity === undefined ? {} : { capacity: room.capacity }),
          })),
        })
      } catch (venueError) {
        setError(`Program created, but venue library could not be saved: ${venueError instanceof Error ? venueError.message : 'Unable to save venue.'}`)
        onChoose?.(response.data.programId)
        return
      }
      setName('')
      setTagline('')
      setMode('multiEvent')
      setProgramType('college_fest')
      setCustomProgramType('')
      setStartDate(nowDateInput())
      setEndDate(nowDateInput())
      setStartTime('09:00')
      setEndTime('17:00')
      setDraftVenues([])
      setSelectedVenueId('')
      setLogoUrl('')
      setBannerUrl('')
      setPosterUrl('')
      setDescription('')
      setCompetitive(false)
      setResultsEnabled(false)
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
        {canCreateProgram && (
          <button className="primary-button" onClick={() => setCreateOpen(true)} type="button">
            <Plus size={17} />
            Create program
          </button>
        )}
      </section>

      {visiblePrograms.length === 0 ? (
        <section className="panel premium-empty-panel">
          <EmptyState title="No programs available" body={canCreateProgram ? 'Create the first program, upload artwork, set dates and venue, then add events and people from the workspace.' : 'No program has been assigned to this CRM account yet.'} />
          {canCreateProgram && (
            <button className="primary-button" onClick={() => setCreateOpen(true)} type="button">
              <Plus size={17} />
              Add first program
            </button>
          )}
        </section>
      ) : (
        <div className="program-card-grid">
          {visiblePrograms.map((program) => (
            <ProgramBlock
              deleting={deletingProgramId === program.id}
              events={events.filter((programEvent) => programEvent.programId === program.id)}
              key={program.id}
              onDelete={canDeleteProgram ? deleteProgramFromList : undefined}
              onEdit={canDeleteProgram ? setEditingProgramId : undefined}
              onOpen={onChoose}
              program={program}
            />
          ))}
        </div>
      )}

      <Modal eyebrow="Program setup" onClose={() => setCreateOpen(false)} open={createOpen && canCreateProgram} title="Create program" wide>
        <form className="modal-form" onSubmit={createProgram}>
          <div className="form-grid two">
            <label>
              Program name
              <input placeholder="Annual Tech Summit 2026" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Short subtitle
              <input maxLength={120} placeholder="One line attendees will see in the Sang app" value={tagline} onChange={(event) => setTagline(event.target.value)} />
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
              Start date
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </label>
            <label>
              Start time
              <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            </label>
            <label>
              End date
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
            </label>
            <label>
              End time
              <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </label>
          </div>

          <div className="form-grid three">
            <ImageUploader folder="program-logos" label="Program logo" onChange={setLogoUrl} uid={uid} value={logoUrl} />
            <ImageUploader folder="program-banners" label="Program banner" onChange={setBannerUrl} uid={uid} value={bannerUrl} />
            <ImageUploader folder="program-posters" label="Program poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
          </div>

          <ProgramVenueSelector
            helper="Choose the broad program venue. Halls, rooms, stages, and booths stay optional and can be refined later in the venue library and schedule."
            label="Program venue"
            onAddVenue={() => setVenueDraftOpen(true)}
            onChoose={(selection) => setSelectedVenueId(selection.venueId)}
            value={selectedVenueId}
            venues={draftVenues}
          />

          <div className="assignment-box">
            <span>Access and results</span>
            <div className="form-grid two">
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
      <DraftVenueLibraryModal
        onChange={setDraftVenues}
        onClose={() => setVenueDraftOpen(false)}
        onSaved={(venue) => {
          setSelectedVenueId(venue.id)
          setVenueDraftOpen(false)
        }}
        open={venueDraftOpen && createOpen}
        venues={draftVenues}
      />
      <Modal
        eyebrow="Program editor"
        onClose={() => setEditingProgramId('')}
        open={Boolean(editingProgram) && canDeleteProgram}
        title={editingProgram ? `Edit ${editingProgram.name}` : 'Edit program'}
        wide
      >
        {editingProgram && (
          <ProgramSettingsForm
            orgId={orgId}
            program={editingProgram}
            uid={uid}
            venueCatalog={editingVenueCatalog}
          />
        )}
      </Modal>
    </section>
  )
}

function ProgramBlock({
  program,
  events,
  onOpen,
  onEdit,
  onDelete,
  deleting,
}: {
  program: Program
  events: ProgramEvent[]
  onOpen?: (programId: string) => void
  onEdit?: (programId: string) => void
  onDelete?: (program: Program) => void
  deleting?: boolean
}) {
  const programTypeLabel = optionLabel(programTypeOptions, program.programType, 'Program')
  const heroImage = program.bannerUrl || program.posterUrl || program.logoUrl
  const visibleEvents = events.slice(0, 3)
  const aboutPreview = program.tagline || richTextToPlainText(program.description)

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
        <div className="program-card-actions">
          {onEdit && (
            <button className="secondary-button" onClick={() => onEdit(program.id)} type="button">
              <Pencil size={16} />
              Edit
            </button>
          )}
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
      </div>
    </article>
  )
}

function EventsPage({
  orgId,
  uid,
  program,
  events,
  scheduleItems,
  roles,
  venueCatalog,
}: {
  orgId: string
  uid: string
  program: Program
  events: ProgramEvent[]
  scheduleItems: ScheduleItem[]
  roles: Role[]
  venueCatalog?: ProgramVenueCatalog | null
}) {
  const [selectedEventId, setSelectedEventId] = useState('')
  const selectedEvent = events.find((event) => event.id === selectedEventId) || null
  const audienceRoles = useMemo(() => getAudienceRoles(roles), [roles])
  const savedVenues = useMemo(() => [...(venueCatalog?.venues || [])].sort((a, b) => a.name.localeCompare(b.name)), [venueCatalog])
  const [eventName, setEventName] = useState('')
  const [eventType, setEventType] = useState('session')
  const [customEventType, setCustomEventType] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [multiDate, setMultiDate] = useState(false)
  const [venueName, setVenueName] = useState(savedVenues[0]?.name || '')
  const [eventVenueId, setEventVenueId] = useState(savedVenues[0]?.id || '')
  const [eventVenueAddress, setEventVenueAddress] = useState(savedVenues[0]?.address || savedVenues[0]?.name || '')
  const [locationNote, setLocationNote] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [latitude, setLatitude] = useState<number | undefined>(savedVenues[0]?.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(savedVenues[0]?.longitude)
  const [directionsNote, setDirectionsNote] = useState(savedVenues[0]?.directionsNote || '')
  const [entryScope, setEntryScope] = useState<EntryScope>(program.entryScope === 'both' ? 'both' : 'event')
  const [mobileVisible, setMobileVisible] = useState(true)
  const [profiles, setProfiles] = useState<EventProfile[]>([])
  const [allowedAudienceRoleIds, setAllowedAudienceRoleIds] = useState<string[]>(audienceRoles.map((role) => role.id))
  const [competitive, setCompetitive] = useState(Boolean(program.competitive))
  const [resultsEnabled, setResultsEnabled] = useState(Boolean(program.resultsEnabled))
  const [busy, setBusy] = useState(false)
  const [publishingEvents, setPublishingEvents] = useState(false)
  const [editing, setEditing] = useState(false)
  const [venueModalOpen, setVenueModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [publishNotice, setPublishNotice] = useState('')

  const matchEventVenueId = useCallback((name: string, latitude?: number, longitude?: number) => findVenueId(savedVenues, { name, latitude, longitude }), [savedVenues])

  useEffect(() => {
    if (selectedEventId && !events.some((event) => event.id === selectedEventId)) {
      setSelectedEventId('')
      setEditing(false)
    }
  }, [events, selectedEventId])

  useEffect(() => {
    if (!selectedEvent) return
    setEventName(selectedEvent.name)
    setEventType(selectValueOrCustom(eventTypeOptions, selectedEvent.eventType, 'session'))
    setCustomEventType(isKnownOption(eventTypeOptions, selectedEvent.eventType) ? '' : selectedEvent.eventType || '')
    setEventDescription(selectedEvent.description || '')
    setStartDateTime(selectedEvent.startDateTime || '')
    setEndDateTime(selectedEvent.endDateTime || '')
    setMultiDate(Boolean(selectedEvent.multiDate))
    setVenueName(selectedEvent.venueName || '')
    setEventVenueId(matchEventVenueId(selectedEvent.venueName || '', selectedEvent.latitude, selectedEvent.longitude))
    setEventVenueAddress(selectedEvent.address || selectedEvent.venueName || '')
    setLocationNote(selectedEvent.locationNote || '')
    setDirectionsNote(selectedEvent.directionsNote || '')
    setPosterUrl(selectedEvent.posterUrl || '')
    setLatitude(selectedEvent.latitude)
    setLongitude(selectedEvent.longitude)
    setEntryScope(selectedEvent.entryScope || (program.entryScope === 'both' ? 'both' : 'event'))
    setMobileVisible(selectedEvent.mobileVisible !== false)
    setProfiles(selectedEvent.profiles || [])
    setAllowedAudienceRoleIds(selectedEvent.allowedAudienceRoleIds?.length ? selectedEvent.allowedAudienceRoleIds.map(slugify) : audienceRoles.map((role) => role.id))
    setCompetitive(Boolean(selectedEvent.competitive ?? program.competitive))
    setResultsEnabled(Boolean(selectedEvent.resultsEnabled))
  }, [audienceRoles, matchEventVenueId, program.competitive, program.entryScope, selectedEvent])

  function chooseEventVenue(selection: { venueId: string; venueName: string; address: string; directionsNote?: string; latitude?: number; longitude?: number }) {
    setEventVenueId(selection.venueId)
    setVenueName(selection.venueName)
    setEventVenueAddress(selection.address)
    setDirectionsNote(selection.directionsNote || '')
    setLatitude(selection.latitude)
    setLongitude(selection.longitude)
  }

  function selectedAudienceRoleNames(roleIds = allowedAudienceRoleIds) {
    return roleIds.map((roleId) => audienceRoles.find((role) => role.id === roleId)?.name || roleId)
  }

  function toggleAllowedRole(roleId: string, checked: boolean) {
    setAllowedAudienceRoleIds((current) => checked ? Array.from(new Set([...current, roleId])) : current.filter((id) => id !== roleId))
  }

  async function createEvent(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (allowedAudienceRoleIds.length === 0) {
      setError('Select at least one audience role allowed for this event.')
      return
    }
    if (!eventVenueId || !venueName.trim()) {
      setError('Choose a saved program venue for this event.')
      return
    }
    setBusy(true)
    try {
      const response = await createEventCallable({
        orgId,
        programId: program.id,
        name: eventName.trim(),
        eventType: eventType === 'custom' ? customEventType.trim() || 'custom' : eventType,
        description: eventDescription.trim(),
        startDateTime,
        endDateTime,
        multiDate,
        venueName: venueName.trim(),
        locationNote: locationNote.trim(),
        directionsNote: directionsNote.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: eventVenueAddress.trim() || venueName.trim(),
        entryScope,
        mobileVisible,
        profiles,
        allowedAudienceRoleIds,
        allowedAudienceRoleNames: selectedAudienceRoleNames(),
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
    if (allowedAudienceRoleIds.length === 0) {
      setError('Select at least one audience role allowed for this event.')
      return
    }
    if (!eventVenueId || !venueName.trim()) {
      setError('Choose a saved program venue for this event.')
      return
    }
    setBusy(true)
    try {
      await updateEventCallable({
        orgId,
        eventId: selectedEvent.id,
        programId: program.id,
        name: eventName.trim(),
        eventType: eventType === 'custom' ? customEventType.trim() || 'custom' : eventType,
        description: eventDescription.trim(),
        startDateTime,
        endDateTime,
        multiDate,
        venueName: venueName.trim(),
        locationNote: locationNote.trim(),
        directionsNote: directionsNote.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: eventVenueAddress.trim() || venueName.trim(),
        entryScope,
        mobileVisible,
        profiles,
        allowedAudienceRoleIds,
        allowedAudienceRoleNames: selectedAudienceRoleNames(),
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

  async function publishEvents() {
    setError('')
    setPublishNotice('')
    setPublishingEvents(true)
    try {
      const response = await publishProgramEventsCallable({ orgId, programId: program.id })
      setPublishNotice(`Published ${formatCount(response.data.itemCount)} event${response.data.itemCount === 1 ? '' : 's'} to Sang app.`)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish events to Sang app.')
    } finally {
      setPublishingEvents(false)
    }
  }

  function startCreate() {
    setSelectedEventId('')
    setEditing(true)
    setEventName('')
    setEventType('session')
    setCustomEventType('')
    setEventDescription('')
    setStartDateTime('')
    setEndDateTime('')
    setMultiDate(false)
    const defaultVenue = savedVenues[0]
    setVenueName(defaultVenue?.name || '')
    setEventVenueId(defaultVenue?.id || '')
    setEventVenueAddress(defaultVenue?.address || defaultVenue?.name || '')
    setLocationNote('')
    setDirectionsNote(defaultVenue?.directionsNote || '')
    setPosterUrl('')
    setLatitude(defaultVenue?.latitude)
    setLongitude(defaultVenue?.longitude)
    setEntryScope(program.entryScope === 'both' ? 'both' : 'event')
    setMobileVisible(true)
    setProfiles([])
    setAllowedAudienceRoleIds(audienceRoles.map((role) => role.id))
    setCompetitive(Boolean(program.competitive))
    setResultsEnabled(Boolean(program.resultsEnabled))
  }

  const formTitle = selectedEvent ? 'Edit event' : 'Create event'
  const submitHandler = selectedEvent ? saveEvent : createEvent

  if (selectedEvent || editing) {
    return (
      <section className="page-stack event-full-page">
        <section className="events-command">
          <div>
            <span className="eyebrow">{program.name}</span>
            <h1>{formTitle}</h1>
            <p>{selectedEvent && !editing ? 'Event workspace, schedule, speakers, access, and venue planning.' : 'Create or update event details before building the schedule.'}</p>
          </div>
          <div className="action-row">
            <button className="secondary-button" onClick={() => { setSelectedEventId(''); setEditing(false) }} type="button">
              <ChevronRight className="flip-icon" size={16} />
              Back to events
            </button>
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
        </section>

        <section className="panel event-detail-panel full-event-panel">
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
              <div className="assignment-box">
                <span>Allowed audience roles</span>
                <div className="chip-row">
                  {(selectedEvent.allowedAudienceRoleNames?.length ? selectedEvent.allowedAudienceRoleNames : selectedAudienceRoleNames(selectedEvent.allowedAudienceRoleIds || [])).map((roleName) => (
                    <span className="chip" key={roleName}>{roleName}</span>
                  ))}
                  {!Array.isArray(selectedEvent.allowedAudienceRoleIds) && <span className="chip">All audience roles</span>}
                  {Array.isArray(selectedEvent.allowedAudienceRoleIds) && selectedEvent.allowedAudienceRoleIds.length === 0 && <span className="chip">No roles allowed</span>}
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
              <ScheduleManager
                event={selectedEvent}
                events={events}
                orgId={orgId}
                program={program}
                roles={roles}
                scheduleItems={scheduleItems.filter((item) => item.eventId === selectedEvent.id)}
                venueCatalog={venueCatalog}
              />
            </>
          ) : (
            <>
              <form className="event-editor-form" onSubmit={submitHandler}>
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
                    Starts
                    <input aria-label="Start date time" type="datetime-local" value={startDateTime} onChange={(event) => setStartDateTime(event.target.value)} />
                  </label>
                  <label>
                    Ends
                    <input aria-label="End date time" type="datetime-local" value={endDateTime} onChange={(event) => setEndDateTime(event.target.value)} />
                  </label>
                </div>
                <ProgramVenueSelector
                  helper="Only venues saved in this program's venue library are shown here. Add halls or exact rooms later inside Schedule."
                  label="Event venue"
                  onAddVenue={() => setVenueModalOpen(true)}
                  onChoose={chooseEventVenue}
                  value={eventVenueId}
                  venues={savedVenues}
                />
                <RichTextEditor label="About this event/session" onChange={setEventDescription} placeholder="Write session details, audience notes, bullets, or entry guidance for this specific event." value={eventDescription} />
                <RichTextEditor label="How to reach this event" onChange={setDirectionsNote} placeholder="Gate, parking, metro, hall route, entry desk, or room-specific directions." value={directionsNote} />
                <div className="assignment-box">
                  <span>Access, dates, and results</span>
                  <div className="form-grid two">
                    <div className="info-callout">
                      <Ticket size={17} />
                      <span>People scan the same program pass. Assign event access from People before opening an event gate.</span>
                    </div>
                    <label className="check-row">
                      <input checked={multiDate} onChange={(event) => setMultiDate(event.target.checked)} type="checkbox" />
                      <span>This event has multiple dates/times. Add exact blocks in Schedule after saving.</span>
                    </label>
                    <label className="check-row">
                      <input checked={mobileVisible} onChange={(event) => setMobileVisible(event.target.checked)} type="checkbox" />
                      <span>Show this event in the Sang mobile app after publishing events.</span>
                    </label>
                  </div>
                  <div className="role-access-grid">
                    {audienceRoles.map((role) => (
                      <label className="check-row" key={role.id}>
                        <input
                          checked={allowedAudienceRoleIds.includes(role.id)}
                          onChange={(changeEvent) => toggleAllowedRole(role.id, changeEvent.target.checked)}
                          type="checkbox"
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
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
                <EventProfilesEditor onChange={setProfiles} profiles={profiles} uid={uid} />
                <div className="action-row">
                  <button className="secondary-button" onClick={() => selectedEvent ? setEditing(false) : setEditing(false)} type="button">
                    Cancel
                  </button>
                  <button className="primary-button" disabled={busy} type="submit">
                    {busy ? <Loader2 className="spin" size={17} /> : <Check size={17} />}
                    {selectedEvent ? 'Save event' : 'Create event'}
                  </button>
                </div>
              </form>
              <VenueLibraryModal
                orgId={orgId}
                onClose={() => setVenueModalOpen(false)}
                open={venueModalOpen}
                program={program}
                venueCatalog={venueCatalog}
              />
            </>
          )}
        </section>
      </section>
    )
  }

  return (
    <section className="page-stack">
      <section className="events-command">
        <div>
          <span className="eyebrow">{program.name}</span>
          <h1>Events</h1>
          <p>Manage sessions, competitions, talks, workshops, venue zones, and gate-specific activities inside this program.</p>
        </div>
        <div className="command-actions">
          <button className="secondary-button" disabled={publishingEvents || events.length === 0} onClick={publishEvents} type="button">
            {publishingEvents ? <Loader2 className="spin" size={17} /> : <UploadCloud size={17} />}
            Publish events
          </button>
          <button className="primary-button" onClick={startCreate} type="button">
            <Plus size={17} />
            Add event
          </button>
        </div>
      </section>
      {publishNotice ? <p className="form-success">{publishNotice}</p> : null}

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
                  <small>{programEvent.mobileVisible === false ? 'Hidden from Sang app' : 'Visible after publish'}</small>
                </div>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>
      )}
      <ScheduleManager
        events={events}
        orgId={orgId}
        program={program}
        roles={roles}
        scheduleItems={scheduleItems}
        venueCatalog={venueCatalog}
      />
    </section>
  )
}

function ScheduleManager({
  orgId,
  program,
  event,
  events,
  roles,
  scheduleItems,
  venueCatalog,
}: {
  orgId: string
  program: Program
  event?: ProgramEvent | null
  events?: ProgramEvent[]
  roles: Role[]
  scheduleItems: ScheduleItem[]
  venueCatalog?: ProgramVenueCatalog | null
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [venueModalOpen, setVenueModalOpen] = useState(false)
  const [venueModalSeed, setVenueModalSeed] = useState('')
  const sortedItems = [...scheduleItems].sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''))
  const savedVenues = useMemo(() => [...(venueCatalog?.venues || [])].sort((a, b) => a.name.localeCompare(b.name)), [venueCatalog])
  const audienceRoles = useMemo(() => getAudienceRoles(roles), [roles])
  const availableParentItems = sortedItems.filter((item) => !item.parentScheduleItemId && !['draft', 'cancelled'].includes(item.status))
  const programEvents = events || (event ? [event] : [])
  const fixedEventId = event?.id || ''

  const createDraftRow = useCallback((): ScheduleDraftRow => {
    const defaultVenue = savedVenues[0]
    return {
      id: makeLocalId(),
      title: '',
      type: 'session',
      customTypeLabel: '',
      startsAt: '',
      endsAt: '',
      venueId: defaultVenue?.id || '',
      venueName: defaultVenue?.name || '',
      roomId: '',
      roomName: '',
      address: defaultVenue?.address || '',
      locationNote: '',
      directionsNote: defaultVenue?.directionsNote || '',
      latitude: defaultVenue?.latitude,
      longitude: defaultVenue?.longitude,
      visibility: 'public',
      allowedRoleIds: [],
      parentScheduleItemId: '',
      groupLabel: '',
      status: 'scheduled',
      description: '',
      eventId: fixedEventId,
    }
  }, [fixedEventId, savedVenues])

  const [rows, setRows] = useState<ScheduleDraftRow[]>(() => [createDraftRow()])

  useEffect(() => {
    setRows([createDraftRow()])
  }, [createDraftRow])

  function updateRow(rowId: string, changes: Partial<ScheduleDraftRow>) {
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, ...changes } : row))
  }

  function openVenueModal(seedName = '') {
    setVenueModalSeed(seedName)
    setVenueModalOpen(true)
  }

  function addRow() {
    setRows((current) => [...current, createDraftRow()])
  }

  function removeRow(rowId: string) {
    setRows((current) => current.length === 1 ? [createDraftRow()] : current.filter((row) => row.id !== rowId))
  }

  function selectedAudienceRoleNames(roleIds: string[]) {
    return roleIds.map((roleId) => audienceRoles.find((role) => role.id === roleId)?.name || roleId)
  }

  function toggleScheduleRole(row: ScheduleDraftRow, roleId: string, checked: boolean) {
    const nextRoleIds = checked
      ? Array.from(new Set([...row.allowedRoleIds, roleId]))
      : row.allowedRoleIds.filter((id) => id !== roleId)
    updateRow(row.id, { allowedRoleIds: nextRoleIds })
  }

  async function publishSchedule() {
    const confirmed = window.confirm('Publish the current schedule to Sang mobile app? Draft, cancelled, and staff-only rows will not be shown.')
    if (!confirmed) return
    setError('')
    setPublishing(true)
    try {
      const response = await publishProgramScheduleCallable({ orgId, programId: program.id })
      window.alert(`Schedule published. ${formatCount(response.data.itemCount)} mobile items, ${formatCount(response.data.pageCount)} page${response.data.pageCount === 1 ? '' : 's'}.`)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Unable to publish schedule.')
    } finally {
      setPublishing(false)
    }
  }

  async function addScheduleItems(eventSubmit: FormEvent) {
    eventSubmit.preventDefault()
    setError('')
    const dirtyRows = rows.filter((row) => row.title.trim() || row.startsAt || row.endsAt || row.description.trim() || row.roomName.trim())
    if (dirtyRows.length === 0) {
      setError('Add at least one schedule row.')
      return
    }
    const incompleteRow = dirtyRows.find((row) => !row.title.trim() || !row.startsAt)
    if (incompleteRow) {
      setError('Every schedule row needs a title and start time.')
      return
    }
    const roleIssue = dirtyRows.find((row) => row.visibility === 'rolesOnly' && row.allowedRoleIds.length === 0)
    if (roleIssue) {
      setError('Select at least one role for role-based schedule rows.')
      return
    }
    setBusy(true)
    try {
      for (const [index, row] of dirtyRows.entries()) {
        await createScheduleItemCallable({
          orgId,
          programId: program.id,
          eventId: fixedEventId || row.eventId,
          title: row.title.trim(),
          type: row.type,
          customTypeLabel: row.type === 'custom' ? row.customTypeLabel.trim() : '',
          description: row.description.trim(),
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          timezone: program.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          venueId: row.venueId,
          venueName: row.venueName.trim(),
          roomId: row.roomId,
          roomName: row.roomName.trim(),
          address: row.address.trim(),
          locationNote: row.locationNote.trim(),
          directionsNote: row.directionsNote.trim(),
          latitude: row.latitude,
          longitude: row.longitude,
          visibility: row.visibility,
          allowedRoleIds: row.visibility === 'rolesOnly' || row.visibility === 'participantsOnly' ? row.allowedRoleIds : [],
          allowedRoleNames: row.visibility === 'rolesOnly' || row.visibility === 'participantsOnly' ? selectedAudienceRoleNames(row.allowedRoleIds) : [],
          parentScheduleItemId: row.parentScheduleItemId,
          groupLabel: row.groupLabel.trim(),
          status: row.status,
          sortOrder: sortedItems.length + index + 1,
        })
      }
      setRows([createDraftRow()])
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : 'Unable to add schedule rows.')
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
      <div className="schedule-manager-head">
        <div>
          <span className="eyebrow">Schedule</span>
          <h2>{event ? 'Time blocks for this event' : 'Program schedule'}</h2>
          <p>{sortedItems.length ? `${sortedItems.length} schedule blocks added` : 'Build the exact event timeline: sessions, rounds, breaks, check-in windows, and result slots.'}</p>
        </div>
        <div className="schedule-head-actions">
          <span className="schedule-count"><Clock size={16} /> {sortedItems.length}</span>
          <button className="primary-button" disabled={publishing} onClick={publishSchedule} type="button">
            {publishing ? <Loader2 className="spin" size={17} /> : <UploadCloud size={17} />}
            Publish schedule
          </button>
        </div>
      </div>

      <form className="schedule-form schedule-form-card" onSubmit={addScheduleItems}>
        {error && <p className="form-error">{error}</p>}
        <div className="schedule-bulk-head">
          <span>Title</span>
          <span>Type</span>
          <span>Start</span>
          <span>End</span>
          <span>Visibility</span>
          <span>{event ? 'Workshop / group' : 'Event / group'}</span>
          <span>Venue / hall</span>
          <span>Note</span>
          <span />
        </div>
        <div className="schedule-bulk-list">
          {rows.map((row, index) => (
            <div className="schedule-bulk-row" key={row.id}>
              <label>
                <span>Schedule title</span>
                <input placeholder={`Schedule ${index + 1}`} value={row.title} onChange={(eventChange) => updateRow(row.id, { title: eventChange.target.value })} />
              </label>
              <label>
                <span>Type</span>
                <select value={row.type} onChange={(eventChange) => updateRow(row.id, { type: eventChange.target.value as ScheduleType })}>
                  {scheduleTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <span>Starts</span>
                <input type="datetime-local" value={row.startsAt} onChange={(eventChange) => updateRow(row.id, { startsAt: eventChange.target.value })} />
              </label>
              <label>
                <span>Ends</span>
                <input type="datetime-local" value={row.endsAt} onChange={(eventChange) => updateRow(row.id, { endsAt: eventChange.target.value })} />
              </label>
              <label>
                <span>Visibility</span>
                <select value={row.visibility} onChange={(eventChange) => updateRow(row.id, { visibility: eventChange.target.value as ScheduleVisibility })}>
                  <option value="public">Public</option>
                  <option value="rolesOnly">Roles only</option>
                  <option value="participantsOnly">Participants</option>
                  <option value="staffOnly">Staff only</option>
                </select>
              </label>
              <div className="schedule-group-fields">
                {!fixedEventId && (
                  <label>
                    <span>Event</span>
                    <select value={row.eventId} onChange={(eventChange) => updateRow(row.id, { eventId: eventChange.target.value })}>
                      <option value="">Program-level</option>
                      {programEvents.map((programEvent) => <option key={programEvent.id} value={programEvent.id}>{programEvent.name}</option>)}
                    </select>
                  </label>
                )}
                <label>
                  <span>Workshop under</span>
                  <select value={row.parentScheduleItemId} onChange={(eventChange) => updateRow(row.id, { parentScheduleItemId: eventChange.target.value })}>
                    <option value="">Main schedule item</option>
                    {availableParentItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <input placeholder="Group label" value={row.groupLabel} onChange={(eventChange) => updateRow(row.id, { groupLabel: eventChange.target.value })} />
              </div>
              <ScheduleVenueSelector
                onAddVenue={() => openVenueModal()}
                onChange={(changes) => updateRow(row.id, changes)}
                row={row}
                venues={savedVenues}
              />
              <label>
                <span>Note</span>
                <input placeholder="Brief note" value={row.description} onChange={(eventChange) => updateRow(row.id, { description: eventChange.target.value })} />
              </label>
              <button className="icon-button danger-icon" onClick={() => removeRow(row.id)} title="Remove row" type="button">
                <Trash2 size={16} />
              </button>
              {row.type === 'custom' && (
                <label className="schedule-custom-type">
                  <span>Custom type</span>
                  <input placeholder="Poster viewing, rehearsal..." value={row.customTypeLabel} onChange={(eventChange) => updateRow(row.id, { customTypeLabel: eventChange.target.value })} />
                </label>
              )}
              {(row.visibility === 'rolesOnly' || row.visibility === 'participantsOnly') && (
                <div className="schedule-role-picker">
                  {audienceRoles.map((role) => (
                    <label className="check-chip" key={role.id}>
                      <input checked={row.allowedRoleIds.includes(role.id)} onChange={(eventChange) => toggleScheduleRole(row, role.id, eventChange.target.checked)} type="checkbox" />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="action-row split-actions">
          <button className="secondary-button" onClick={addRow} type="button">
            <Plus size={17} />
            Add new row
          </button>
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            Save schedule rows
          </button>
        </div>
      </form>

      {sortedItems.length === 0 ? (
        <EmptyState title="No schedule yet" body="Add every date/time block here: check-in, rounds, sessions, breaks, performances, judging, or result announcements." />
      ) : (
        <div className="schedule-list schedule-timeline">
          {sortedItems.map((item) => (
            <article className="schedule-item" key={item.id}>
              <span className="timeline-dot" />
              <div className="schedule-item-main">
                <div className="schedule-item-top">
                  <span className={`status ${item.status}`}>{item.status}</span>
                  <small>{item.type === 'custom' && item.customTypeLabel ? item.customTypeLabel : optionLabel(scheduleTypeOptions, item.type)}</small>
                </div>
                <strong>{item.title}</strong>
                <p>{formatDateTime(item.startsAt)} {item.endsAt ? `to ${formatDateTime(item.endsAt)}` : ''}</p>
                <small><MapPin size={13} /> {item.venueName || event?.venueName || program.venueName || 'Venue pending'} {item.roomName ? `- ${item.roomName}` : ''}</small>
                {item.eventId && !event ? <small><CalendarDays size={13} /> {programEvents.find((programEvent) => programEvent.id === item.eventId)?.name || 'Event schedule'}</small> : null}
                {item.parentScheduleItemId ? <small><GitBranch size={13} /> Workshop under {availableParentItems.find((parent) => parent.id === item.parentScheduleItemId)?.title || 'schedule group'}</small> : null}
                {item.visibility === 'rolesOnly' || item.visibility === 'participantsOnly' ? <small><ShieldCheck size={13} /> {(item.allowedRoleNames?.length ? item.allowedRoleNames : item.allowedRoleIds || []).join(', ') || 'Role-based'}</small> : null}
                {item.description && <p>{item.description}</p>}
              </div>
              <button className="icon-button" onClick={() => removeScheduleItem(item)} title="Delete schedule item" type="button">
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
      <VenueLibraryModal
        orgId={orgId}
        onClose={() => setVenueModalOpen(false)}
        open={venueModalOpen}
        program={program}
        seedName={venueModalSeed}
        venueCatalog={venueCatalog}
      />
    </section>
  )
}

function SettingsPage({
  orgId,
  uid,
  organization,
  program,
  programs,
  venueCatalog,
  onProgramSelect,
  canManageOrganization,
  canManageProgram,
}: {
  orgId: string
  uid: string
  organization: Organization | null
  program: Program | null
  programs: Program[]
  venueCatalog?: ProgramVenueCatalog | null
  onProgramSelect: (programId: string) => void
  canManageOrganization: boolean
  canManageProgram: boolean
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
          <p>Manage public identity, program artwork, entry rules, and result settings from one place.</p>
        </div>
      </section>

      <div className="page-grid settings-grid">
        {canManageOrganization && (
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
        )}

        {canManageProgram && (
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
              <ProgramSettingsForm orgId={orgId} program={program} uid={uid} venueCatalog={venueCatalog} />
            ) : (
              <EmptyState title="Choose a program" body="Create or select a program before editing program artwork, entry rules, and result settings." />
            )}
          </section>
        )}
      </div>
    </section>
  )
}

function ProgramSettingsForm({
  orgId,
  uid,
  program,
  venueCatalog,
}: {
  orgId: string
  uid: string
  program: Program
  venueCatalog?: ProgramVenueCatalog | null
}) {
  const savedVenues = useMemo(() => [...(venueCatalog?.venues || [])].sort((a, b) => a.name.localeCompare(b.name)), [venueCatalog])
  const [name, setName] = useState(program.name)
  const [tagline, setTagline] = useState(program.tagline || '')
  const [mode, setMode] = useState<ProgramMode>(program.mode)
  const [programType, setProgramType] = useState(selectValueOrCustom(programTypeOptions, program.programType, 'college_fest'))
  const [customProgramType, setCustomProgramType] = useState(isKnownOption(programTypeOptions, program.programType) ? '' : program.programType || '')
  const [status, setStatus] = useState<Program['status']>(program.status)
  const [startDate, setStartDate] = useState(program.startDate)
  const [endDate, setEndDate] = useState(program.endDate)
  const [startTime, setStartTime] = useState(program.startTime || '')
  const [endTime, setEndTime] = useState(program.endTime || '')
  const [venueName, setVenueName] = useState(program.venueName || '')
  const [venueAddress, setVenueAddress] = useState(program.address || program.venueName || '')
  const [city, setCity] = useState(program.city || '')
  const [logoUrl, setLogoUrl] = useState(program.logoUrl || '')
  const [bannerUrl, setBannerUrl] = useState(program.bannerUrl || '')
  const [posterUrl, setPosterUrl] = useState(program.posterUrl || '')
  const [latitude, setLatitude] = useState<number | undefined>(program.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(program.longitude)
  const [description, setDescription] = useState(program.description || '')
  const [directionsNote, setDirectionsNote] = useState(program.directionsNote || '')
  const [entryScope, setEntryScope] = useState<EntryScope>(program.entryScope || 'program')
  const [competitive, setCompetitive] = useState(Boolean(program.competitive))
  const [resultsEnabled, setResultsEnabled] = useState(Boolean(program.resultsEnabled))
  const [venueModalOpen, setVenueModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const selectedProgramVenueId = findVenueId(savedVenues, { name: venueName, latitude, longitude })

  useEffect(() => {
    setName(program.name)
    setTagline(program.tagline || '')
    setMode(program.mode)
    setProgramType(selectValueOrCustom(programTypeOptions, program.programType, 'college_fest'))
    setCustomProgramType(isKnownOption(programTypeOptions, program.programType) ? '' : program.programType || '')
    setStatus(program.status)
    setStartDate(program.startDate)
    setEndDate(program.endDate)
    setStartTime(program.startTime || '')
    setEndTime(program.endTime || '')
    setVenueName(program.venueName || '')
    setVenueAddress(program.address || program.venueName || '')
    setCity(program.city || '')
    setLogoUrl(program.logoUrl || '')
    setBannerUrl(program.bannerUrl || '')
    setPosterUrl(program.posterUrl || '')
    setLatitude(program.latitude)
    setLongitude(program.longitude)
    setDescription(program.description || '')
    setDirectionsNote(program.directionsNote || '')
    setEntryScope(program.entryScope || 'program')
    setCompetitive(Boolean(program.competitive))
    setResultsEnabled(Boolean(program.resultsEnabled))
  }, [program])

  async function saveProgram(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await updateProgramCallable({
        orgId,
        programId: program.id,
        name: name.trim(),
        tagline: tagline.trim(),
        mode,
        programType: programType === 'custom' ? customProgramType.trim() || 'custom' : programType,
        status,
        startDate,
        endDate,
        startTime,
        endTime,
        venueName: venueName.trim(),
        city: city.trim(),
        logoUrl: logoUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        posterUrl: posterUrl.trim(),
        latitude,
        longitude,
        address: venueAddress.trim() || venueName.trim(),
        directionsNote: directionsNote.trim(),
        timezone: program.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        description: description.trim(),
        entryScope,
        competitive,
        resultsEnabled: competitive ? resultsEnabled : false,
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
            Short subtitle
            <input maxLength={120} placeholder="One line attendees will see in the Sang app" value={tagline} onChange={(event) => setTagline(event.target.value)} />
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
            Start time
            <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </label>
          <label>
            End date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} required />
          </label>
          <label>
            End time
            <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </label>
        </div>

        <div className="form-grid three">
          <ImageUploader folder="program-logos" label="Program logo" onChange={setLogoUrl} uid={uid} value={logoUrl} />
          <ImageUploader folder="program-banners" label="Program banner" onChange={setBannerUrl} uid={uid} value={bannerUrl} />
          <ImageUploader folder="program-posters" label="Program poster" onChange={setPosterUrl} uid={uid} value={posterUrl} />
        </div>

        <ProgramVenueSelector
          helper={venueName && !selectedProgramVenueId ? 'This saved program venue is not in the venue library yet. Add it from the dropdown, then select it here.' : 'Choose the broad program venue. Halls and rooms stay optional for schedule-level planning.'}
          label="Program venue"
          onAddVenue={() => setVenueModalOpen(true)}
          onChoose={(selection) => {
            setVenueName(selection.venueName)
            setVenueAddress(selection.address)
            setDirectionsNote(selection.directionsNote || '')
            setLatitude(selection.latitude)
            setLongitude(selection.longitude)
          }}
          value={selectedProgramVenueId}
          venues={savedVenues}
        />

        <div className="assignment-box">
          <span>Competition and access</span>
          <div className="form-grid two">
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
        <RichTextEditor label="How to reach this program" onChange={setDirectionsNote} placeholder="Gate instructions, parking, metro, hall route, entry desk notes..." value={directionsNote} />

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

      <VenueLibraryModal
        orgId={orgId}
        onClose={() => setVenueModalOpen(false)}
        open={venueModalOpen}
        program={program}
        seedName={venueName}
        venueCatalog={venueCatalog}
      />
    </div>
  )
}

function RolesPage({ orgId, roles }: { orgId: string; roles: Role[] }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<RoleCategory>('audience')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<string[]>(['program.read'])
  const [deletingRoleId, setDeletingRoleId] = useState('')
  const [error, setError] = useState('')
  const teamRoles = roles.filter((role) => roleCategory(role) === 'team' && !isDeletedRole(role))
  const savedAudienceRoles = roles.filter((role) => roleCategory(role) === 'audience' && !isDeletedRole(role))
  const audienceRoles = getAudienceRoles(roles)

  async function createRole(event: FormEvent) {
    event.preventDefault()
    setError('')
    const roleId = slugify(name)
    try {
      await createRoleCallable({
        orgId,
        roleId,
        name: name.trim(),
        category,
        description: category === 'team' ? description.trim() : `${name.trim()} audience category`,
        permissions: category === 'team' ? selected : [],
      })
      setName('')
      setDescription('')
      if (category === 'team') setSelected(['program.read'])
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to save role.')
    }
  }

  async function deleteRole(roleId: string, roleName: string) {
    const confirmed = window.confirm(`Delete "${roleName}"? Team roles must be unassigned first. Audience roles will be removed from event allow-lists.`)
    if (!confirmed) return
    setError('')
    setDeletingRoleId(roleId)
    try {
      await deleteRoleCallable({ orgId, roleId })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete role.')
    } finally {
      setDeletingRoleId('')
    }
  }

  return (
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={createRole}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Access model</span>
            <h2>Create role</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        {error && <p className="form-error">{error}</p>}
        <label>
          Role category
          <select value={category} onChange={(event) => setCategory(event.target.value as RoleCategory)}>
            <option value="audience">Audience role</option>
            <option value="team">Team role</option>
          </select>
        </label>
        <label>
          Role name
          <input placeholder={category === 'team' ? 'Competition Coordinator' : 'Startup'} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        {category === 'team' && (
          <>
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
          </>
        )}
        <button className="primary-button" type="submit"><Plus size={17} />Save role</button>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Current</span>
            <h2>Team roles</h2>
          </div>
          <Eye size={20} />
        </div>
        <div className="role-grid">
          {teamRoles.map((role) => (
            <article className="role-card" key={role.id}>
              <div className="role-card-head">
                <strong>{role.name}</strong>
                <button className="icon-button danger-icon" disabled={deletingRoleId === role.id} onClick={() => deleteRole(role.id, role.name)} title="Delete role" type="button">
                  {deletingRoleId === role.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
              <p>{role.description || 'No description'}</p>
              <div className="chip-row">
                {role.permissions.slice(0, 5).map((permission) => <span className="chip" key={permission}>{permission}</span>)}
                {role.permissions.length > 5 && <span className="chip">+{role.permissions.length - 5}</span>}
              </div>
            </article>
          ))}
        </div>
        <div className="panel-heading inset-heading">
          <div>
            <span className="eyebrow">Audience</span>
            <h2>Audience roles</h2>
          </div>
          <Ticket size={20} />
        </div>
        <div className="role-grid compact-role-grid">
          {audienceRoles.map((role) => {
            const saved = savedAudienceRoles.some((savedRole) => savedRole.id === role.id)
            return (
              <article className="role-card audience-role-card" key={role.id}>
                <div className="role-card-head">
                  <strong>{role.name}</strong>
                  <button className="icon-button danger-icon" disabled={deletingRoleId === role.id} onClick={() => deleteRole(role.id, role.name)} title="Delete role" type="button">
                    {deletingRoleId === role.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                  </button>
                </div>
                <div className="chip-row">
                  <span className="chip">Audience</span>
                  <span className="chip">{saved ? 'Saved' : 'Preset'}</span>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}

function TeamPage({ orgId, roles, programs, events, members }: { orgId: string; roles: Role[]; programs: Program[]; events: ProgramEvent[]; members: TeamMember[] }) {
  const teamRoles = useMemo(() => roles.filter((role) => roleCategory(role) === 'team' && !isDeletedRole(role)), [roles])
  const visibleMembers = members.filter((member) => member.status !== 'deleted' && member.status !== 'claimed')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [roleId, setRoleId] = useState(teamRoles[0]?.id || 'gate-executive')
  const [scope, setScope] = useState<TeamScope>('organization')
  const [programId, setProgramId] = useState('')
  const [eventId, setEventId] = useState('')
  const [error, setError] = useState('')
  const [busyMemberId, setBusyMemberId] = useState('')
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRoleId, setEditRoleId] = useState(teamRoles[0]?.id || 'gate-executive')
  const [editScope, setEditScope] = useState<TeamScope>('organization')
  const [editProgramId, setEditProgramId] = useState('')
  const [editEventId, setEditEventId] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'invited' | 'disabled'>('active')

  useEffect(() => {
    if (!teamRoles.some((role) => role.id === roleId)) {
      setRoleId(teamRoles[0]?.id || 'gate-executive')
    }
  }, [roleId, teamRoles])

  useEffect(() => {
    if (!editingMember) return
    setEditDisplayName(editingMember.displayName || '')
    setEditRoleId(teamRoles.some((role) => role.id === editingMember.roleId) ? editingMember.roleId : teamRoles[0]?.id || 'gate-executive')
    setEditScope(editingMember.scope || 'organization')
    setEditProgramId(editingMember.programId || '')
    setEditEventId(editingMember.eventId || '')
    setEditStatus(editingMember.status === 'invited' ? 'invited' : editingMember.status === 'disabled' ? 'disabled' : 'active')
  }, [editingMember, teamRoles])

  function memberScopeLabel(member: TeamMember) {
    if (member.scope === 'organization') return 'Whole organization'
    const program = programs.find((item) => item.id === member.programId)
    if (member.scope === 'program') return program?.name || 'Program scope'
    const programEvent = events.find((item) => item.id === member.eventId)
    return programEvent ? `${programEvent.name}` : 'Event scope'
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
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
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Unable to add member.')
    }
  }

  async function saveMember(event: FormEvent) {
    event.preventDefault()
    if (!editingMember) return
    setError('')
    setBusyMemberId(editingMember.id)
    try {
      await updateTeamMemberCallable({
        orgId,
        teamMemberId: editingMember.id,
        displayName: editDisplayName.trim(),
        roleId: editRoleId,
        scope: editScope,
        programId: editScope !== 'organization' ? editProgramId : '',
        eventId: editScope === 'event' ? editEventId : '',
        status: editStatus,
      })
      setEditingMember(null)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update member.')
    } finally {
      setBusyMemberId('')
    }
  }

  async function removeMember(member: TeamMember) {
    const confirmed = window.confirm(`Delete ${member.displayName || member.email} from this CRM team?`)
    if (!confirmed) return
    setError('')
    setBusyMemberId(member.id)
    try {
      await deleteTeamMemberCallable({ orgId, teamMemberId: member.id })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete member.')
    } finally {
      setBusyMemberId('')
    }
  }

  return (
    <>
    <section className="page-grid">
      <form className="panel form-panel" onSubmit={inviteMember}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Team</span>
            <h2>Add member</h2>
          </div>
          <Users size={20} />
        </div>
        {error && !editingMember && <p className="form-error">{error}</p>}
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
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
            {teamRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
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
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Scope</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={member.id}>
                  <td>{member.displayName}</td>
                  <td>{member.email}</td>
                  <td>{teamRoles.find((role) => role.id === member.roleId)?.name || member.roleId}</td>
                  <td>{memberScopeLabel(member)}</td>
                  <td><span className={`status ${member.status}`}>{member.status}</span></td>
                  <td>
                    <div className="table-actions">
                      <button className="icon-button" disabled={busyMemberId === member.id} onClick={() => setEditingMember(member)} title="Edit member" type="button">
                        <Pencil size={16} />
                      </button>
                      <button className="icon-button danger-icon" disabled={busyMemberId === member.id} onClick={() => removeMember(member)} title="Delete member" type="button">
                        {busyMemberId === member.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleMembers.length === 0 && (
                <tr>
                  <td colSpan={6}>No team members yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>

    <Modal eyebrow="Team access" onClose={() => setEditingMember(null)} open={Boolean(editingMember)} title="Edit team member">
      <form className="settings-form" onSubmit={saveMember}>
        {error && editingMember && <p className="form-error">{error}</p>}
        <label>
          Name
          <input value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} required />
        </label>
        <label>
          Role
          <select value={editRoleId} onChange={(event) => setEditRoleId(event.target.value)} required>
            {teamRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        <label>
          Scope
          <select value={editScope} onChange={(event) => { setEditScope(event.target.value as TeamScope); setEditProgramId(''); setEditEventId('') }}>
            <option value="organization">Whole organization</option>
            <option value="program">Specific program</option>
            <option value="event">Specific event</option>
          </select>
        </label>
        {editScope !== 'organization' && (
          <label>
            Program
            <select value={editProgramId} onChange={(event) => { setEditProgramId(event.target.value); setEditEventId('') }} required>
              <option value="">Select program</option>
              {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>
        )}
        {editScope === 'event' && (
          <label>
            Event
            <select value={editEventId} onChange={(event) => setEditEventId(event.target.value)} required>
              <option value="">Select event</option>
              {events.filter((programEvent) => !editProgramId || programEvent.programId === editProgramId).map((programEvent) => (
                <option key={programEvent.id} value={programEvent.id}>{programEvent.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Status
          <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as 'active' | 'invited' | 'disabled')}>
            {editingMember?.uid ? <option value="active">Active</option> : <option value="invited">Invited</option>}
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <div className="action-row">
          <button className="secondary-button" onClick={() => setEditingMember(null)} type="button">Cancel</button>
          <button className="primary-button" disabled={!editingMember || busyMemberId === editingMember.id} type="submit">
            {editingMember && busyMemberId === editingMember.id ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            Save member
          </button>
        </div>
      </form>
    </Modal>
    </>
  )
}

function PeoplePage({ orgId, programs, events, people, passes, roles }: { orgId: string; programs: Program[]; events: ProgramEvent[]; people: ProgramPerson[]; passes: PassRecord[]; roles: Role[] }) {
  const [programId, setProgramId] = useState('')
  const [eventIds, setEventIds] = useState<string[]>([])
  const audienceRoles = useMemo(() => getAudienceRoles(roles), [roles])
  const [programRoleId, setProgramRoleId] = useState(audienceRoles[0]?.id || 'visitor')
  const [eventRoleById, setEventRoleById] = useState<Record<string, string>>({})
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const [manualDesignation, setManualDesignation] = useState('')
  const [editingPerson, setEditingPerson] = useState<ProgramPerson | null>(null)
  const [formBusy, setFormBusy] = useState(false)
  const [peopleError, setPeopleError] = useState('')
  const [peopleNotice, setPeopleNotice] = useState('')
  const [passBusyPersonId, setPassBusyPersonId] = useState('')
  const [personActionBusyId, setPersonActionBusyId] = useState('')
  const [publishBusy, setPublishBusy] = useState(false)
  const selectedPeople = people.filter((person) => (!programId || person.programId === programId) && personAccessState(person) !== 'removed')
  const availableEvents = events.filter((programEvent) => programEvent.programId === programId)

  useEffect(() => {
    if (!programId && programs[0]) {
      setProgramId(programs[0].id)
    }
  }, [programId, programs])

  useEffect(() => {
    if (!audienceRoles.some((role) => role.id === programRoleId)) {
      setProgramRoleId(audienceRoles[0]?.id || 'visitor')
    }
  }, [audienceRoles, programRoleId])

  function roleName(roleId: string) {
    return audienceRoles.find((role) => role.id === roleId)?.name || roleId
  }

  function rolesForEvent(programEvent: ProgramEvent) {
    const allowedIds = programEvent.allowedAudienceRoleIds?.map(slugify) || []
    if (allowedIds.length === 0) return audienceRoles
    return audienceRoles.filter((role) => allowedIds.includes(role.id))
  }

  function fitRoleToEvent(programEvent: ProgramEvent, role: AudienceRoleOption) {
    const eventRoles = rolesForEvent(programEvent)
    if (eventRoles.some((eventRole) => eventRole.id === role.id)) return role
    return eventRoles[0] || role
  }

  function toggleEventAccess(programEvent: ProgramEvent, checked: boolean) {
    setEventIds((current) => checked ? Array.from(new Set([...current, programEvent.id])) : current.filter((id) => id !== programEvent.id))
    if (checked) {
      const firstAllowedRole = rolesForEvent(programEvent)[0]?.id || programRoleId
      setEventRoleById((current) => ({ ...current, [programEvent.id]: current[programEvent.id] || firstAllowedRole }))
    } else {
      setEventRoleById((current) => {
        const next = { ...current }
        delete next[programEvent.id]
        return next
      })
    }
  }

  function buildManualEventAccess() {
    return eventIds.map((eventId) => {
      const programEvent = availableEvents.find((item) => item.id === eventId)
      const allowedRole = programEvent ? rolesForEvent(programEvent).find((role) => role.id === eventRoleById[eventId]) : null
      const role = allowedRole || resolveAudienceRole(eventRoleById[eventId] || programRoleId, audienceRoles, programRoleId)
      return {
        eventId,
        roleId: role.id,
        roleName: role.name,
        status: 'allowed' as const,
      }
    })
  }

  function personEventAccessEntries(person: ProgramPerson) {
    if (person.eventAccess && typeof person.eventAccess === 'object') {
      return Object.entries(person.eventAccess).map(([eventId, access]) => ({
        ...access,
        eventId: access.eventId || eventId,
      }))
    }
    return person.eventAccessList || []
  }

  function resetPersonForm() {
    setEditingPerson(null)
    setProgramRoleId(audienceRoles[0]?.id || 'visitor')
    setEventIds([])
    setEventRoleById({})
    setManualName('')
    setManualEmail('')
    setManualPhone('')
    setManualCompany('')
    setManualDesignation('')
  }

  function startEditPerson(person: ProgramPerson) {
    const nextProgramRole = resolveAudienceRole(person.programRoleId || person.kind, audienceRoles, programRoleId)
    const accessEntries = personEventAccessEntries(person)
      .filter((access) => !['revoked', 'cancelled', 'rejected'].includes(access.status || 'allowed'))
      .filter((access) => events.some((programEvent) => programEvent.id === access.eventId && programEvent.programId === person.programId))
    const nextEventRoleById = accessEntries.reduce<Record<string, string>>((current, access) => {
      if (access.eventId) {
        const programEvent = events.find((item) => item.id === access.eventId && item.programId === person.programId)
        const resolvedRole = resolveAudienceRole(access.roleId || nextProgramRole.id, audienceRoles, nextProgramRole.id)
        current[access.eventId] = programEvent ? fitRoleToEvent(programEvent, resolvedRole).id : resolvedRole.id
      }
      return current
    }, {})
    setPeopleError('')
    setPeopleNotice('')
    setEditingPerson(person)
    setProgramId(person.programId)
    setProgramRoleId(nextProgramRole.id)
    setEventIds(accessEntries.map((access) => access.eventId || '').filter(Boolean))
    setEventRoleById(nextEventRoleById)
    setManualName(person.fullName || '')
    setManualEmail(person.email || '')
    setManualPhone(person.phone || '')
    setManualCompany(person.organization || person.company || '')
    setManualDesignation(person.designation || '')
  }

  async function createPerson(input: ProgramPersonInput) {
    setPeopleError('')
    await createProgramPersonAndPassCallable(input)
  }

  async function rotatePass(person: ProgramPerson) {
    if (personAccessState(person) !== 'active') {
      setPeopleError('Blocked or removed people cannot receive a new pass. Add the person again to reactivate access.')
      return
    }
    const hasPass = Boolean(person.passId)
    if (hasPass) {
      const confirmed = window.confirm(`Rotate QR for ${person.fullName}? The old QR will stop working immediately.`)
      if (!confirmed) return
    }
    setPeopleError('')
    setPassBusyPersonId(person.id)
    try {
      await issuePassForProgramPersonCallable({ orgId, programPersonId: person.id })
    } catch (passError) {
      setPeopleError(passError instanceof Error ? passError.message : 'Unable to update pass.')
    } finally {
      setPassBusyPersonId('')
    }
  }

  async function blockPerson(person: ProgramPerson) {
    if (personAccessState(person) === 'blocked') return
    const confirmed = window.confirm(`Block Sang access for ${person.fullName}? Their current QR/pass will stop working.`)
    if (!confirmed) return
    setPeopleError('')
    setPeopleNotice('')
    setPersonActionBusyId(person.id)
    try {
      await blockProgramPersonAccessCallable({ orgId, programPersonId: person.id, reason: 'blocked-from-crm' })
      setPeopleNotice(`${person.fullName} has been blocked. Their Sang access and QR pass are no longer active.`)
    } catch (blockError) {
      setPeopleError(blockError instanceof Error ? blockError.message : 'Unable to block this person.')
    } finally {
      setPersonActionBusyId('')
    }
  }

  async function unblockPerson(person: ProgramPerson) {
    if (personAccessState(person) !== 'blocked') return
    const confirmed = window.confirm(`Unblock Sang access for ${person.fullName}? A fresh QR pass will be issued and the old blocked QR will stay disabled.`)
    if (!confirmed) return
    setPeopleError('')
    setPeopleNotice('')
    setPersonActionBusyId(person.id)
    try {
      await unblockProgramPersonAccessCallable({ orgId, programPersonId: person.id, reason: 'unblocked-from-crm' })
      setPeopleNotice(`${person.fullName} has been unblocked and a fresh QR pass has been issued.`)
    } catch (unblockError) {
      setPeopleError(unblockError instanceof Error ? unblockError.message : 'Unable to unblock this person.')
    } finally {
      setPersonActionBusyId('')
    }
  }

  async function removePerson(person: ProgramPerson) {
    const confirmed = window.confirm(`Remove ${person.fullName} from this program roster? Their Sang app access will be removed and the QR/pass will stop working.`)
    if (!confirmed) return
    setPeopleError('')
    setPeopleNotice('')
    setPersonActionBusyId(person.id)
    try {
      await removeProgramPersonAccessCallable({ orgId, programPersonId: person.id, reason: 'removed-from-crm' })
      setPeopleNotice(`${person.fullName} has been removed from the active roster.`)
    } catch (removeError) {
      setPeopleError(removeError instanceof Error ? removeError.message : 'Unable to remove this person.')
    } finally {
      setPersonActionBusyId('')
    }
  }

  async function publishPeopleAccess() {
    if (!programId) return
    const confirmed = window.confirm('Publish this roster to Sang app users? Matching verified users will see this program in the Sang app.')
    if (!confirmed) return
    setPeopleError('')
    setPeopleNotice('')
    setPublishBusy(true)
    try {
      const response = await publishProgramPeopleAccessCallable({ orgId, programId, notify: true })
      const result = response.data
      setPeopleNotice(`Published ${result.peopleCount} people. Linked ${result.linkedCount} new, refreshed ${result.alreadyLinkedCount}, pending ${result.pendingCount}, review ${result.manualReviewCount}, blocked/removed skipped ${result.skippedCount || 0}. Notifications sent: ${result.notificationSentCount}.`)
    } catch (publishError) {
      setPeopleError(publishError instanceof Error ? publishError.message : 'Unable to publish roster to Sang.')
    } finally {
      setPublishBusy(false)
    }
  }

  async function addManual(event: FormEvent) {
    event.preventDefault()
    setPeopleError('')
    setPeopleNotice('')
    setFormBusy(true)
    const fullName = manualName.trim()
    const payload = {
      orgId,
      programId,
      fullName,
      email: manualEmail.trim().toLowerCase(),
      phone: manualPhone.trim(),
      kind: programRoleId,
      programRoleId,
      programRoleName: roleName(programRoleId),
      company: manualCompany.trim(),
      organization: manualCompany.trim(),
      designation: manualDesignation.trim(),
      eventIds,
      eventAccess: buildManualEventAccess(),
    }
    try {
      if (editingPerson) {
        await updateProgramPersonAccessCallable({
          orgId,
          programPersonId: editingPerson.id,
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          kind: payload.kind,
          programRoleId: payload.programRoleId,
          programRoleName: payload.programRoleName,
          company: payload.company,
          organization: payload.organization,
          designation: payload.designation,
          eventAccess: payload.eventAccess,
        })
        setPeopleNotice(`${fullName} updated. Access changes are synced to Sang.`)
      } else {
        await createPerson(payload)
        setPeopleNotice(`${fullName} added and pass issued.`)
      }
      resetPersonForm()
    } catch (saveError) {
      setPeopleError(saveError instanceof Error ? saveError.message : 'Unable to save this person.')
    } finally {
      setFormBusy(false)
    }
  }

  function importCsv(file: File) {
    const normalizeColumn = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
    const eventColumnMap = new Map<string, ProgramEvent>()
    for (const programEvent of availableEvents) {
      eventColumnMap.set(normalizeColumn(programEvent.id), programEvent)
      eventColumnMap.set(normalizeColumn(programEvent.name), programEvent)
      eventColumnMap.set(normalizeColumn(`event ${programEvent.name}`), programEvent)
      eventColumnMap.set(normalizeColumn(`event:${programEvent.name}`), programEvent)
    }
    const emptyValues = new Set(['', 'no', 'n', 'false', '0', 'none', 'na', 'n/a'])
    const defaultValues = new Set(['yes', 'y', 'true', '1', 'allowed', 'registered', 'access'])

    function eventFromText(value: string) {
      return eventColumnMap.get(normalizeColumn(value))
    }

    function accessFromRow(row: Record<string, string>, fallbackRole: AudienceRoleOption) {
      const access = new Map<string, EventAccess & { eventId: string }>()
      for (const [key, value] of Object.entries(row)) {
        const programEvent = eventColumnMap.get(normalizeColumn(key))
        if (!programEvent) continue
        const cell = (value || '').trim()
        if (emptyValues.has(cell.toLowerCase())) continue
        const role = fitRoleToEvent(programEvent, defaultValues.has(cell.toLowerCase()) ? fallbackRole : resolveAudienceRole(cell, audienceRoles, fallbackRole.id))
        access.set(programEvent.id, {
          eventId: programEvent.id,
          roleId: role.id,
          roleName: role.name,
          status: 'allowed',
        })
      }

      const namedEvents = (row.eventName || row.EventName || row.event || row.Event || row.events || row.Events || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
      for (const eventName of namedEvents) {
        const programEvent = eventFromText(eventName)
        if (!programEvent) continue
        const roleText = row.eventRole || row.EventRole || row.role || row.Role || fallbackRole.name
        const role = fitRoleToEvent(programEvent, resolveAudienceRole(roleText, audienceRoles, fallbackRole.id))
        access.set(programEvent.id, {
          eventId: programEvent.id,
          roleId: role.id,
          roleName: role.name,
          status: 'allowed',
        })
      }

      if (access.size === 0) {
        for (const eventId of eventIds) {
          const programEvent = availableEvents.find((item) => item.id === eventId)
          const role = programEvent
            ? fitRoleToEvent(programEvent, resolveAudienceRole(eventRoleById[eventId] || fallbackRole.id, audienceRoles, fallbackRole.id))
            : resolveAudienceRole(eventRoleById[eventId] || fallbackRole.id, audienceRoles, fallbackRole.id)
          access.set(eventId, {
            eventId,
            roleId: role.id,
            roleName: role.name,
            status: 'allowed',
          })
        }
      }
      return access
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = result.data.filter((row) => row.email || row.Email || row.phone || row.Phone || row.name || row.Name || row.fullName || row.FullName)
        const grouped = new Map<string, {
          fullName: string
          email: string
          phone: string
          organization: string
          designation: string
          programRole: AudienceRoleOption
          eventAccess: Map<string, EventAccess & { eventId: string }>
        }>()
        rows.forEach((row, index) => {
          const fullName = (row.fullName || row.name || row.FullName || row.Name || 'Unnamed').trim()
          const email = (row.email || row.Email || '').trim().toLowerCase()
          const phone = (row.phone || row.Phone || '').trim()
          const roleText = row.programRole || row.ProgramRole || row.audienceRole || row.AudienceRole || row.kind || row.type || row.Kind || row.Type || row.role || row.Role || programRoleId
          const programRole = resolveAudienceRole(roleText, audienceRoles, programRoleId)
          const organization = (row.organization || row.Organization || row.company || row.Company || row.college || row.College || '').trim()
          const key = email || phone || `${fullName.toLowerCase()}-${index}`
          const existing = grouped.get(key)
          const rowAccess = accessFromRow(row, programRole)
          if (existing) {
            rowAccess.forEach((value, eventId) => existing.eventAccess.set(eventId, value))
            return
          }
          grouped.set(key, {
            fullName,
            email,
            phone,
            organization,
            designation: (row.designation || row.Designation || '').trim(),
            programRole,
            eventAccess: rowAccess,
          })
        })

        const importedEventIds = Array.from(new Set(Array.from(grouped.values()).flatMap((person) => Array.from(person.eventAccess.keys()))))
        for (const person of grouped.values()) {
          await createPerson({
            orgId,
            programId,
            fullName: person.fullName,
            email: person.email,
            phone: person.phone,
            kind: person.programRole.id,
            programRoleId: person.programRole.id,
            programRoleName: person.programRole.name,
            company: person.organization,
            organization: person.organization,
            designation: person.designation,
            eventIds: Array.from(person.eventAccess.keys()),
            eventAccess: Array.from(person.eventAccess.values()),
          })
        }
        await addDoc(collection(db, 'peImports'), {
          orgId,
          programId,
          eventIds: importedEventIds,
          fileName: file.name,
          rowCount: grouped.size,
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
            <h2>{editingPerson ? 'Edit person access' : 'Add or import'}</h2>
          </div>
          {editingPerson ? <Pencil size={20} /> : <Upload size={20} />}
        </div>
        <label>
          Program
          <select disabled={Boolean(editingPerson)} value={programId} onChange={(event) => { setProgramId(event.target.value); setEventIds([]); setEventRoleById({}) }} required>
            <option value="">Select program</option>
            {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
        <label>
          Program audience role
          <select value={programRoleId} onChange={(event) => setProgramRoleId(event.target.value)}>
            {audienceRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
          </select>
        </label>
        {availableEvents.length > 0 && (
          <div className="assignment-box">
            <span>Event access and role</span>
            {availableEvents.map((programEvent) => {
              const eventRoles = rolesForEvent(programEvent)
              const currentRoleId = eventRoleById[programEvent.id] || eventRoles[0]?.id || programRoleId
              return (
                <div className="event-access-row" key={programEvent.id}>
                  <label className="check-row">
                    <input
                      checked={eventIds.includes(programEvent.id)}
                      onChange={(changeEvent) => toggleEventAccess(programEvent, changeEvent.target.checked)}
                      type="checkbox"
                    />
                    <span>{programEvent.name}</span>
                  </label>
                  <select
                    disabled={!eventIds.includes(programEvent.id)}
                    value={currentRoleId}
                    onChange={(changeEvent) => setEventRoleById((current) => ({ ...current, [programEvent.id]: changeEvent.target.value }))}
                  >
                    {eventRoles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        )}
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
          Organization / college / company
          <input value={manualCompany} onChange={(event) => setManualCompany(event.target.value)} />
        </label>
        <label>
          Designation
          <input placeholder="Founder, delegate, student, manager..." value={manualDesignation} onChange={(event) => setManualDesignation(event.target.value)} />
        </label>
        <div className="person-form-actions">
          <button className="primary-button" disabled={!programId || formBusy} type="submit">
            {formBusy ? <Loader2 className="spin" size={17} /> : editingPerson ? <Save size={17} /> : <Plus size={17} />}
            {editingPerson ? 'Save changes' : 'Add and issue pass'}
          </button>
          {editingPerson && (
            <button className="secondary-button" disabled={formBusy} onClick={resetPersonForm} type="button">
              <X size={17} />
              Cancel edit
            </button>
          )}
        </div>
        <label className="file-drop">
          <Upload size={18} />
          Upload CSV
          <input accept=".csv" disabled={!programId || Boolean(editingPerson)} onChange={(event) => event.target.files?.[0] && importCsv(event.target.files[0])} type="file" />
        </label>
      </form>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Roster</span>
            <h2>Program people</h2>
          </div>
          <div className="table-actions">
            <button
              className="secondary-button compact-button"
              disabled={!programId || selectedPeople.length === 0 || publishBusy}
              onClick={publishPeopleAccess}
              type="button"
            >
              {publishBusy ? <Loader2 className="spin" size={16} /> : <BadgeCheck size={16} />}
              Publish to Sang
            </button>
            <button
              className="icon-button"
              onClick={() => downloadCsv('sang-program-people.csv', selectedPeople.map((person) => ({
                name: person.fullName,
                email: person.email,
                phone: person.phone || '',
                programRole: person.programRoleName || person.kind,
                organization: person.organization || person.company || '',
                designation: person.designation || '',
                eventAccess: Object.entries(person.eventAccess || {}).map(([eventId, access]) => `${events.find((item) => item.id === eventId)?.name || access.eventNameSnapshot || eventId}:${access.roleName || access.roleId}`).join('; '),
                accessStatus: personAccessState(person),
                passStatus: person.passStatus || 'notIssued',
              })))}
              title="Download roster CSV"
              type="button"
            >
              <Download size={18} />
            </button>
          </div>
        </div>
        <div className="table-wrap">
          {peopleError && <p className="form-error">{peopleError}</p>}
          {peopleNotice && <p className="form-success">{peopleNotice}</p>}
          <table>
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Organization</th><th>Program role</th><th>Event access</th><th>Sang link</th><th>Status</th><th>Pass</th><th>QR</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {selectedPeople.map((person) => {
                const pass = passes.find((item) => item.id === person.passId)
                const accessEntries = Object.entries(person.eventAccess || {})
                const accessState = personAccessState(person)
                return (
                  <tr key={person.id}>
                    <td>{person.fullName}</td>
                    <td>{person.email || person.phone || 'No contact'}</td>
                    <td>{person.organization || person.company || '-'}</td>
                    <td>{person.programRoleName || person.kind}</td>
                    <td>
                      <div className="chip-row">
                        {accessEntries.length === 0 && <span className="chip">Program only</span>}
                        {accessEntries.slice(0, 3).map(([eventId, access]) => (
                          <span className="chip" key={eventId}>
                            {events.find((item) => item.id === eventId)?.name || access.eventNameSnapshot || eventId}: {access.roleName || access.roleId}
                          </span>
                        ))}
                        {accessEntries.length > 3 && <span className="chip">+{accessEntries.length - 3}</span>}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status ${sangAppStatusClass(person)}`}
                        title={person.sangAppConflictReason || person.linkConflictReason || person.sangAppMatchMethod || ''}
                      >
                        {sangAppStatusLabel(person)}
                      </span>
                    </td>
                    <td><span className={`status ${accessState === 'active' ? 'active' : 'cancelled'}`}>{accessState}</span></td>
                    <td><span className={`status ${passStatusClass(person)}`}>{person.passStatus || 'notIssued'}</span></td>
                    <td>
                      <div className="pass-cell">
                        {pass ? <PassPreview payload={pass.qrPayload} passCode={pass.passCode || person.passCode || ''} /> : <span className="muted">Pending</span>}
                        <button
                          className="icon-button"
                          disabled={passBusyPersonId === person.id || accessState !== 'active'}
                          onClick={() => rotatePass(person)}
                          title={accessState === 'active' ? pass ? 'Rotate QR' : 'Issue pass' : 'Access is not active'}
                          type="button"
                        >
                          {passBusyPersonId === person.id ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="icon-button"
                          disabled={formBusy}
                          onClick={() => startEditPerson(person)}
                          title="Edit details and event access"
                          type="button"
                        >
                          {editingPerson?.id === person.id ? <Check size={16} /> : <Pencil size={16} />}
                        </button>
                        {accessState === 'blocked' ? (
                          <button
                            className="icon-button"
                            disabled={personActionBusyId === person.id}
                            onClick={() => unblockPerson(person)}
                            title="Unblock Sang access and issue a fresh QR"
                            type="button"
                          >
                            {personActionBusyId === person.id ? <Loader2 className="spin" size={16} /> : <Unlock size={16} />}
                          </button>
                        ) : (
                          <button
                            className="icon-button"
                            disabled={personActionBusyId === person.id || accessState !== 'active'}
                            onClick={() => blockPerson(person)}
                            title={accessState === 'active' ? 'Block Sang access' : 'Access is not active'}
                            type="button"
                          >
                            {personActionBusyId === person.id ? <Loader2 className="spin" size={16} /> : <Lock size={16} />}
                          </button>
                        )}
                        <button
                          className="icon-button danger-icon"
                          disabled={personActionBusyId === person.id}
                          onClick={() => removePerson(person)}
                          title="Remove from active roster"
                          type="button"
                        >
                          {personActionBusyId === person.id ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </td>
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

function PassPreview({ payload, passCode }: { payload: string; passCode?: string }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    QRCode.toDataURL(payload, { margin: 1, width: 96 }).then(setSrc)
  }, [payload])

  return (
    <span className="pass-preview">
      {src ? <img alt="Pass QR" className="qr-thumb" src={src} /> : <QrCode size={24} />}
      {passCode ? <span className="pass-code">{passCode}</span> : null}
    </span>
  )
}

function CrmApp({ firebaseUser, profile, setProfile }: { firebaseUser: User; profile: PeUser; setProfile: (profile: PeUser) => void }) {
  const [route, setRouteState] = useState<RouteKey>(readHashRoute)
  const [selectedProgramId, setSelectedProgramId] = useState(() => window.localStorage.getItem('sang-crm-selected-program') || '')
  const [needsOrgChoice, setNeedsOrgChoice] = useState(() => profile.organizationIds.length > 1 && window.localStorage.getItem('sang-crm-org-choice-confirmed') !== profile.activeOrgId)
  const orgId = profile.activeOrgId || ''
  const ownMemberQuery = useMemo(() => (orgId ? query(collection(db, 'peTeamMembers'), where('orgId', '==', orgId), where('uid', '==', firebaseUser.uid), where('status', '==', 'active')) : null), [firebaseUser.uid, orgId])
  const ownMemberships = useCollection<TeamMember>(ownMemberQuery, 'CRM access')
  const currentMember = ownMemberships.rows[0] || null
  const orgQuery = useMemo(() => (orgId && currentMember ? doc(db, 'peOrganizations', orgId) : null), [currentMember, orgId])
  const rolesQuery = useMemo(() => (orgId && currentMember ? collection(db, 'peOrganizations', orgId, 'roles') : null), [currentMember, orgId])
  const roles = useCollection<Role>(rolesQuery, 'Roles')
  const currentRole = currentMember ? roles.rows.find((role) => role.id === currentMember.roleId && !isDeletedRole(role)) : undefined
  const isOrgScoped = currentMember?.scope === 'organization'
  const scopedProgramId = currentMember?.scope === 'program' || currentMember?.scope === 'event' ? currentMember.programId || '' : ''
  const scopedEventId = currentMember?.scope === 'event' ? currentMember.eventId || '' : ''
  const visibleNavItems = navItems.filter((item) => canOpenRoute(item.key, currentRole, currentMember))
  const canManageTeam = canOpenRoute('team', currentRole, currentMember)
  const canCreateProgram = isOrgScoped && hasPermission(currentRole, 'program.write')
  const canManageProgram = hasPermission(currentRole, 'program.write') && currentMember?.scope !== 'event'
  const canManageOrganization = isOrgScoped && hasPermission(currentRole, 'team.write')
  const canReadWorkspaceCatalog = ['program.read', 'program.write', 'event.write', 'team.write', 'people.import', 'passes.issue', 'analytics.read'].some((permission) => hasPermission(currentRole, permission))
  // 'analytics.read' is still honoured here even though the Analytics route is hidden:
  // existing Analyst roles rely on it for People access, and dropping it would silently
  // revoke access for organizations created before this release.
  const canReadPeople = hasPermission(currentRole, 'people.import') || hasPermission(currentRole, 'passes.issue') || hasPermission(currentRole, 'analytics.read')
  const canReadPasses = hasPermission(currentRole, 'passes.issue')

  const programsQuery = useMemo(() => {
    if (!orgId || !currentMember || !canReadWorkspaceCatalog) return null
    if (isOrgScoped) return query(collection(db, 'pePrograms'), where('orgId', '==', orgId))
    return scopedProgramId ? query(collection(db, 'pePrograms'), where('orgId', '==', orgId), where(documentId(), '==', scopedProgramId)) : null
  }, [canReadWorkspaceCatalog, currentMember, isOrgScoped, orgId, scopedProgramId])
  const eventsQuery = useMemo(() => {
    if (!orgId || !currentMember || !canReadWorkspaceCatalog) return null
    if (isOrgScoped) return query(collection(db, 'peEvents'), where('orgId', '==', orgId))
    if (scopedEventId) return query(collection(db, 'peEvents'), where('orgId', '==', orgId), where(documentId(), '==', scopedEventId))
    return scopedProgramId ? query(collection(db, 'peEvents'), where('orgId', '==', orgId), where('programId', '==', scopedProgramId)) : null
  }, [canReadWorkspaceCatalog, currentMember, isOrgScoped, orgId, scopedEventId, scopedProgramId])
  const scheduleItemsQuery = useMemo(() => {
    if (!orgId || !currentMember || !canReadWorkspaceCatalog) return null
    if (isOrgScoped) return query(collection(db, 'peEventScheduleDashboard'), where('orgId', '==', orgId))
    if (scopedEventId) return query(collection(db, 'peEventScheduleDashboard'), where('orgId', '==', orgId), where('eventId', '==', scopedEventId))
    return scopedProgramId ? query(collection(db, 'peEventScheduleDashboard'), where('orgId', '==', orgId), where('programId', '==', scopedProgramId)) : null
  }, [canReadWorkspaceCatalog, currentMember, isOrgScoped, orgId, scopedEventId, scopedProgramId])
  const venueCatalogsQuery = useMemo(() => {
    if (!orgId || !currentMember || !canReadWorkspaceCatalog) return null
    if (isOrgScoped) return query(collection(db, 'peProgramVenues'), where('orgId', '==', orgId))
    return scopedProgramId ? query(collection(db, 'peProgramVenues'), where('orgId', '==', orgId), where(documentId(), '==', scopedProgramId)) : null
  }, [canReadWorkspaceCatalog, currentMember, isOrgScoped, orgId, scopedProgramId])
  const partnersQuery = useMemo(() => {
    if (!orgId || !currentMember || !canReadWorkspaceCatalog) return null
    if (isOrgScoped) return query(collection(db, 'peProgramPartners'), where('orgId', '==', orgId))
    return scopedProgramId ? query(collection(db, 'peProgramPartners'), where('orgId', '==', orgId), where('programId', '==', scopedProgramId)) : null
  }, [canReadWorkspaceCatalog, currentMember, isOrgScoped, orgId, scopedProgramId])
  const peopleQuery = useMemo(() => {
    if (!orgId || !currentMember || !canReadPeople) return null
    if (isOrgScoped) return query(collection(db, 'peProgramPeople'), where('orgId', '==', orgId))
    if (scopedEventId) return query(collection(db, 'peProgramPeople'), where('orgId', '==', orgId), where('eventAccessIds', 'array-contains', scopedEventId))
    return scopedProgramId ? query(collection(db, 'peProgramPeople'), where('orgId', '==', orgId), where('programId', '==', scopedProgramId)) : null
  }, [canReadPeople, currentMember, isOrgScoped, orgId, scopedEventId, scopedProgramId])
  const passesQuery = useMemo(() => {
    if (!orgId || !currentMember || scopedEventId || !canReadPasses) return null
    if (isOrgScoped) return query(collection(db, 'pePasses'), where('orgId', '==', orgId))
    return scopedProgramId ? query(collection(db, 'pePasses'), where('orgId', '==', orgId), where('programId', '==', scopedProgramId)) : null
  }, [canReadPasses, currentMember, isOrgScoped, orgId, scopedEventId, scopedProgramId])
  const membersQuery = useMemo(() => (orgId && canManageTeam ? query(collection(db, 'peTeamMembers'), where('orgId', '==', orgId)) : null), [canManageTeam, orgId])
  const programs = useCollection<Program>(programsQuery, 'Programs')
  const events = useCollection<ProgramEvent>(eventsQuery, 'Events')
  const scheduleItems = useCollection<ScheduleItem>(scheduleItemsQuery, 'Schedule')
  const venueCatalogs = useCollection<ProgramVenueCatalog>(venueCatalogsQuery, 'Venues')
  const partners = useCollection<ProgramPartner>(partnersQuery, 'Patrons')
  const people = useCollection<ProgramPerson>(peopleQuery, 'People')
  const passes = useCollection<PassRecord>(passesQuery, 'Passes')
  const members = useCollection<TeamMember>(membersQuery, 'Team')
  const [organization, setOrganization] = useState<Organization | null>(null)

  useEffect(() => {
    if (!orgQuery) {
      setOrganization(null)
      return
    }
    return onSnapshot(
      orgQuery,
      (snapshot) => {
        setOrganization(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Organization) : null)
      },
      () => {
        setOrganization(null)
      },
    )
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

  useEffect(() => {
    if (!currentMember || !currentRole || visibleNavItems.length === 0) return
    if (!canOpenRoute(route, currentRole, currentMember)) {
      setRoute(visibleNavItems[0].key)
    }
  }, [currentMember, currentRole, route, visibleNavItems])

  const sortedPrograms = [...programs.rows].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const selectedProgram = sortedPrograms.find((program) => program.id === selectedProgramId) || null
  const shouldChooseProgram = !selectedProgram && sortedPrograms.length > 1 && route !== 'programs'
  const activeProgram = selectedProgram || (sortedPrograms.length === 1 ? sortedPrograms[0] : null)
  const activeEvents = activeProgram ? events.rows.filter((event) => event.programId === activeProgram.id) : []
  const activeScheduleItems = activeProgram ? scheduleItems.rows.filter((item) => item.programId === activeProgram.id) : []
  const activePeople = activeProgram ? people.rows.filter((person) => person.programId === activeProgram.id && personAccessState(person) !== 'removed') : []
  const activePasses = activeProgram ? passes.rows.filter((pass) => pass.programId === activeProgram.id) : []
  const activeVenueCatalog = activeProgram ? venueCatalogs.rows.find((catalog) => catalog.id === activeProgram.id || catalog.programId === activeProgram.id) || null : null
  const activePartners = activeProgram ? partners.rows.filter((partner) => partner.programId === activeProgram.id) : []

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

  if (ownMemberships.loading || roles.loading) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" size={28} />
        <span>Loading CRM access</span>
      </main>
    )
  }

  if (!currentMember) {
    return <OnboardingPage user={firebaseUser} onComplete={setProfile} />
  }

  if (!currentRole || visibleNavItems.length === 0) {
    return (
      <main className="loading-screen">
        <Lock size={28} />
        <span>No active CRM access found for this account.</span>
      </main>
    )
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
    return <ProgramChooserPage canCreate={canCreateProgram} events={events.rows} onChoose={chooseProgram} onCreate={() => setRoute('programs')} programs={sortedPrograms} />
  }

  if (!canOpenRoute(route, currentRole, currentMember)) {
    return (
      <main className="loading-screen">
        <Loader2 className="spin" size={28} />
        <span>Opening allowed workspace</span>
      </main>
    )
  }

  return (
    <Shell onSwitchProgram={switchProgram} organization={organization} route={route} selectedProgram={activeProgram} setRoute={setRoute} user={firebaseUser} visibleNavItems={visibleNavItems}>
      {programs.error || roles.error || ownMemberships.error || people.error || scheduleItems.error || venueCatalogs.error || partners.error || passes.error || members.error ? <p className="form-error">{programs.error || roles.error || ownMemberships.error || people.error || scheduleItems.error || venueCatalogs.error || partners.error || passes.error || members.error}</p> : null}
      {route === 'dashboard' && activeProgram && <ProgramWorkspaceDashboard events={activeEvents} orgId={orgId} people={activePeople} program={activeProgram} scheduleItems={activeScheduleItems} setRoute={setRoute} venueCatalog={activeVenueCatalog} />}
      {route === 'dashboard' && !activeProgram && <DashboardPage people={people.rows} programs={sortedPrograms} setRoute={setRoute} />}
      {route === 'events' && activeProgram && <EventsPage events={activeEvents} orgId={orgId} program={activeProgram} roles={roles.rows} scheduleItems={activeScheduleItems} uid={firebaseUser.uid} venueCatalog={activeVenueCatalog} />}
      {route === 'events' && !activeProgram && <ProgramsPage canCreateProgram={canCreateProgram} canDeleteProgram={canManageProgram} events={events.rows} onChoose={chooseProgram} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} venueCatalogs={venueCatalogs.rows} />}
      {route === 'venues' && activeProgram && <VenuesPage orgId={orgId} program={activeProgram} venueCatalog={activeVenueCatalog} />}
      {route === 'venues' && !activeProgram && <ProgramsPage canCreateProgram={canCreateProgram} canDeleteProgram={canManageProgram} events={events.rows} onChoose={chooseProgram} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} venueCatalogs={venueCatalogs.rows} />}
      {route === 'patrons' && activeProgram && <PatronsPage orgId={orgId} partners={activePartners} program={activeProgram} uid={firebaseUser.uid} />}
      {route === 'patrons' && !activeProgram && <ProgramsPage canCreateProgram={canCreateProgram} canDeleteProgram={canManageProgram} events={events.rows} onChoose={chooseProgram} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} venueCatalogs={venueCatalogs.rows} />}
      {route === 'programs' && <ProgramsPage canCreateProgram={canCreateProgram} canDeleteProgram={canManageProgram} events={events.rows} onChoose={chooseProgram} orgId={orgId} programs={sortedPrograms} uid={firebaseUser.uid} venueCatalogs={venueCatalogs.rows} />}
      {route === 'settings' && <SettingsPage canManageOrganization={canManageOrganization} canManageProgram={canManageProgram} onProgramSelect={chooseProgramInSettings} orgId={orgId} organization={organization} program={activeProgram} programs={sortedPrograms} uid={firebaseUser.uid} venueCatalog={activeVenueCatalog} />}
      {route === 'roles' && <RolesPage orgId={orgId} roles={roles.rows} />}
      {route === 'team' && <TeamPage events={events.rows} members={members.rows} orgId={orgId} programs={sortedPrograms} roles={roles.rows} />}
      {route === 'people' && <PeoplePage events={activeProgram ? activeEvents : events.rows} orgId={orgId} passes={activeProgram ? activePasses : passes.rows} people={activeProgram ? activePeople : people.rows} programs={activeProgram ? [activeProgram] : sortedPrograms} roles={roles.rows} />}
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
