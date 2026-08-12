import { randomBytes, createHash } from 'crypto'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'

initializeApp()

const db = getFirestore()
const region = 'us-central1'
const callableOptions = { region, invoker: 'public' as const }
const scheduleDashboardCollection = 'peEventScheduleDashboard'
const scheduleSnapshotCollection = 'peEventSchedule'
const programVenueCollection = 'peProgramVenues'

const permissions = {
  rolesWrite: 'roles.write',
  teamWrite: 'team.write',
  programWrite: 'program.write',
  eventWrite: 'event.write',
  peopleImport: 'people.import',
  passesIssue: 'passes.issue',
  checkinScan: 'checkin.scan',
}

const defaultRoles = [
  {
    id: 'owner',
    name: 'Owner',
    category: 'team',
    description: 'Full organization control',
    permissions: Object.values(permissions).concat(['program.read', 'analytics.read', 'exports.create']),
    isDefault: true,
  },
  {
    id: 'event-lead',
    name: 'Event Lead',
    category: 'team',
    description: 'Manage programs, events, people, passes, and analytics',
    permissions: ['program.read', permissions.programWrite, permissions.eventWrite, permissions.teamWrite, permissions.peopleImport, permissions.passesIssue, 'exports.create'],
    isDefault: true,
  },
  // 'gate-staff' (scan-only) is not seeded while check-in is out of scope. Existing
  // organizations keep their gate-staff role; it simply has no route to open.
  {
    id: 'analyst',
    name: 'Analyst',
    category: 'team',
    description: 'View programs and export reports',
    permissions: ['program.read', 'analytics.read', 'exports.create'],
    isDefault: true,
  },
]

const defaultAudienceRoles = [
  { id: 'attendee', name: 'Attendee' },
  { id: 'participant', name: 'Participant' },
  { id: 'startup', name: 'Startup' },
  { id: 'company', name: 'Company' },
  { id: 'delegate', name: 'Delegate' },
  { id: 'speaker', name: 'Speaker' },
  { id: 'judge', name: 'Judge' },
  { id: 'vip', name: 'VIP' },
  { id: 'sponsor', name: 'Sponsor' },
  { id: 'exhibitor', name: 'Exhibitor' },
]

const eventProfileSchema = z.object({
  id: z.string().optional().default(''),
  name: z.string().min(1),
  role: z.string().optional().default('Profile'),
  organization: z.string().optional().default(''),
  bio: z.string().optional().default(''),
  photoUrl: z.string().optional().default(''),
})

const programPartnerSchema = z.object({
  orgId: z.string().min(1),
  programId: z.string().min(1),
  partnerId: z.string().optional().default(''),
  name: z.string().min(1),
  tier: z.string().optional().default('Partner'),
  category: z.string().optional().default(''),
  booth: z.string().optional().default(''),
  description: z.string().optional().default(''),
  websiteUrl: z.string().optional().default(''),
  logoUrl: z.string().optional().default(''),
  sortOrder: z.number().optional().default(0),
  status: z.enum(['active', 'hidden']).optional().default('active'),
})

const eventAccessSchema = z.object({
  eventId: z.string().min(1),
  roleId: z.string().min(1),
  roleName: z.string().optional().default(''),
  status: z.enum(['allowed', 'registered', 'blocked', 'cancelled', 'rejected', 'revoked']).optional().default('allowed'),
})

const scheduleInputSchema = z.object({
  orgId: z.string().min(1),
  programId: z.string().min(1),
  eventId: z.string().optional().default(''),
  title: z.string().min(2),
  type: z.enum(['session', 'round', 'break', 'checkin', 'performance', 'result', 'ceremony', 'custom']).optional().default('session'),
  customTypeLabel: z.string().optional().default(''),
  description: z.string().optional().default(''),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().default(''),
  timezone: z.string().optional().default('Asia/Kolkata'),
  venueId: z.string().optional().default(''),
  roomId: z.string().optional().default(''),
  venueName: z.string().optional().default(''),
  roomName: z.string().optional().default(''),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  visibility: z.enum(['public', 'staffOnly', 'participantsOnly']).optional().default('public'),
  status: z.enum(['draft', 'scheduled', 'delayed', 'cancelled', 'completed']).optional().default('scheduled'),
  sortOrder: z.number().optional().default(0),
})

const nullableStringInput = z.preprocess((value) => value === null || value === undefined ? '' : value, z.string())
const nullableNumberInput = z.preprocess((value) => value === null || value === undefined || value === '' ? undefined : value, z.number().optional())

const venueRoomInputSchema = z.object({
  id: nullableStringInput.default(''),
  name: z.string().min(1),
  floor: nullableStringInput.default(''),
  capacity: z.number().int().nonnegative().optional(),
})

const programVenueInputSchema = z.object({
  orgId: z.string().min(1),
  programId: z.string().min(1),
  venueId: z.string().optional().default(''),
  name: z.string().min(2),
  address: z.string().optional().default(''),
  directionsNote: z.string().optional().default(''),
  latitude: nullableNumberInput,
  longitude: nullableNumberInput,
  rooms: z.array(venueRoomInputSchema).optional().default([]),
})

const programVenueDraftSchema = z.object({
  id: nullableStringInput.default(''),
  name: z.string().min(2),
  address: nullableStringInput.default(''),
  directionsNote: nullableStringInput.default(''),
  latitude: nullableNumberInput,
  longitude: nullableNumberInput,
  rooms: z.array(venueRoomInputSchema).optional().default([]),
})

function normalizeRoleId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'attendee'
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function isDefaultAudienceRole(roleId: string) {
  return defaultAudienceRoles.some((role) => role.id === roleId)
}

function requireUid(context: { auth?: { uid: string } }) {
  const uid = context.auth?.uid
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.')
  }
  return uid
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizePhone(phone: string) {
  const raw = phone.trim()
  if (!raw) return ''
  const compact = raw.replace(/[^\d+]/g, '')
  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '')
    return digits ? `+${digits}` : ''
  }
  const digits = compact.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+91${digits}`
  return `+${digits}`
}

function makeToken() {
  return randomBytes(24).toString('hex')
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function dateFromFirestore(value: unknown) {
  if (value instanceof Date) return value
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  return null
}

function timezoneOffsetMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  const zonedAsUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  )
  return (zonedAsUtc - date.getTime()) / 60000
}

function zonedLocalDateTimeToDate(value: string, timezone: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/)
  if (!match) return null
  const [, year, month, day, hour = '00', minute = '00', second = '00', millisecond = '0'] = match
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond.padEnd(3, '0')),
  )
  const firstGuess = new Date(utcGuess)
  const firstOffset = timezoneOffsetMinutes(firstGuess, timezone)
  const secondGuess = new Date(utcGuess - firstOffset * 60000)
  const secondOffset = timezoneOffsetMinutes(secondGuess, timezone)
  return new Date(utcGuess - secondOffset * 60000)
}

function timestampFromInput(value: unknown, options: { timezone?: string; dateOnly?: 'start' | 'end'; required?: boolean } = {}) {
  if (value === null || value === undefined || value === '') {
    if (options.required) throw new HttpsError('invalid-argument', 'A valid date/time is required.')
    return null
  }
  if (value instanceof Timestamp) return value
  const existingDate = dateFromFirestore(value)
  if (existingDate) return Timestamp.fromDate(existingDate)
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Date/time must be a string or Firestore timestamp.')
  }

  const trimmed = value.trim()
  const timezone = options.timezone || 'Asia/Kolkata'
  const normalizedValue = options.dateOnly === 'start'
    ? `${trimmed.slice(0, 10)}T00:00:00.000`
    : options.dateOnly === 'end'
      ? `${trimmed.slice(0, 10)}T23:59:59.999`
      : trimmed

  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalizedValue)
  const parsedDate = hasExplicitOffset
    ? new Date(normalizedValue)
    : zonedLocalDateTimeToDate(normalizedValue, timezone) || new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpsError('invalid-argument', `Invalid date/time value: ${trimmed}`)
  }
  return Timestamp.fromDate(parsedDate)
}

function timestampMillis(value: unknown) {
  const existingDate = dateFromFirestore(value) || (typeof value === 'string' && value ? new Date(value) : null)
  return existingDate && !Number.isNaN(existingDate.getTime()) ? existingDate.getTime() : 0
}

async function assertProgram(input: { orgId: string; programId: string }) {
  const programRef = db.collection('pePrograms').doc(input.programId)
  const programSnapshot = await programRef.get()
  if (!programSnapshot.exists) {
    throw new HttpsError('not-found', 'Program not found.')
  }
  if (programSnapshot.data()?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Program does not belong to this organization.')
  }
  return { programRef, program: programSnapshot.data() || {} }
}

async function assertEvent(input: { orgId: string; programId: string; eventId: string }) {
  const eventRef = db.collection('peEvents').doc(input.eventId)
  const eventSnapshot = await eventRef.get()
  if (!eventSnapshot.exists) {
    throw new HttpsError('not-found', 'Event not found.')
  }
  const event = eventSnapshot.data()
  if (event?.orgId !== input.orgId || event?.programId !== input.programId) {
    throw new HttpsError('permission-denied', 'Event does not belong to this program.')
  }
  return { eventRef, event: event || {} }
}

async function assertTeamRole(input: { orgId: string; roleId: string }) {
  const roleId = normalizeRoleId(input.roleId)
  const roleSnapshot = await db.doc(`peOrganizations/${input.orgId}/roles/${roleId}`).get()
  const role = roleSnapshot.data()
  if (!roleSnapshot.exists || role?.category === 'audience' || role?.status === 'deleted') {
    throw new HttpsError('failed-precondition', 'Team members must be assigned an active team role.')
  }
  return roleId
}

async function assertTeamScope(input: { orgId: string; scope: 'organization' | 'program' | 'event'; programId?: string; eventId?: string }) {
  if (input.scope === 'organization') return
  if (!input.programId) {
    throw new HttpsError('failed-precondition', 'Program is required for this team scope.')
  }
  await assertProgram({ orgId: input.orgId, programId: input.programId })
  if (input.scope === 'event') {
    if (!input.eventId) {
      throw new HttpsError('failed-precondition', 'Event is required for event-scoped access.')
    }
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId: input.eventId })
  }
}

type PermissionScope = {
  organizationOnly?: boolean
  programId?: string
  eventId?: string
  eventIds?: string[]
}

function memberCoversScope(member: Record<string, unknown>, scope: PermissionScope) {
  if (!scope.organizationOnly && !scope.programId && !scope.eventId && !scope.eventIds?.length) return true
  const memberScope = String(member.scope || '')
  if (memberScope === 'organization') return true
  if (scope.organizationOnly) return false
  const memberProgramId = String(member.programId || '')
  if (!scope.programId || memberProgramId !== scope.programId) return false
  if (memberScope === 'program') return true
  const requestedEventIds = scope.eventIds?.filter(Boolean) || (scope.eventId ? [scope.eventId] : [])
  const memberEventId = String(member.eventId || '')
  return requestedEventIds.length > 0 && requestedEventIds.every((eventId) => eventId === memberEventId)
}

async function assertPermission(uid: string, orgId: string, requiredPermission: string, scope: PermissionScope = { organizationOnly: true }) {
  const memberSnapshot = await db
    .collection('peTeamMembers')
    .where('orgId', '==', orgId)
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .limit(1)
    .get()

  if (memberSnapshot.empty) {
    throw new HttpsError('permission-denied', 'You do not have access to this organization.')
  }

  const member = memberSnapshot.docs[0].data()
  const roleSnapshot = await db.doc(`peOrganizations/${orgId}/roles/${member.roleId}`).get()
  const role = roleSnapshot.data()
  const rolePermissions = Array.isArray(role?.permissions) ? role.permissions : []

  if (!rolePermissions.includes(requiredPermission) && !rolePermissions.includes('*')) {
    throw new HttpsError('permission-denied', `Missing permission: ${requiredPermission}`)
  }
  if (!memberCoversScope(member, scope)) {
    throw new HttpsError('permission-denied', 'This role is not allowed for this program or event scope.')
  }

  return { memberId: memberSnapshot.docs[0].id, member }
}

async function assertAnyPermission(uid: string, orgId: string, checks: Array<{ permission: string; scope?: PermissionScope }>) {
  const errors: HttpsError[] = []
  for (const check of checks) {
    try {
      return await assertPermission(uid, orgId, check.permission, check.scope)
    } catch (error) {
      if (error instanceof HttpsError && (error.code === 'permission-denied' || error.code === 'failed-precondition')) {
        errors.push(error)
        continue
      }
      throw error
    }
  }
  throw errors[0] || new HttpsError('permission-denied', 'You do not have access for this action.')
}

async function writeAudit(input: {
  orgId: string
  actorUid: string
  action: string
  entityPath: string
  metadata?: Record<string, unknown>
}) {
  await db.collection('peAuditLogs').add({
    ...input,
    createdAt: FieldValue.serverTimestamp(),
  })
}

function stableHashId(prefix: string, value: string) {
  return `${prefix}_${createHash('sha1').update(value).digest('hex').slice(0, 12)}`
}

type SangLinkResult = {
  linkStatus: 'linked' | 'pending' | 'manual_review'
  sangUserId: string
  linkMethod: 'verified_email' | 'verified_phone' | 'manual' | ''
  linkConflictReason: string
}

type SangAppStatus = 'linked' | 'not_found' | 'missing_identity' | 'manual_review'

function emptySangLinkResult(linkConflictReason = ''): SangLinkResult {
  return {
    linkStatus: linkConflictReason ? 'manual_review' : 'pending',
    sangUserId: '',
    linkMethod: '',
    linkConflictReason,
  }
}

function sangAppFieldsFromLinkResult(linkResult: SangLinkResult, hasLookupIdentity: boolean) {
  const sangAppStatus: SangAppStatus = linkResult.linkStatus === 'linked'
    ? 'linked'
    : linkResult.linkStatus === 'manual_review'
      ? 'manual_review'
      : hasLookupIdentity
        ? 'not_found'
        : 'missing_identity'

  return {
    sangAppStatus,
    sangAppLinked: sangAppStatus === 'linked',
    sangAppUserId: linkResult.sangUserId,
    sangAppMatchMethod: linkResult.linkMethod,
    sangAppConflictReason: linkResult.linkConflictReason,
    sangAppCheckedAt: FieldValue.serverTimestamp(),
  }
}

async function findVerifiedSangUser(input: { normalizedEmail: string; normalizedPhone: string }): Promise<SangLinkResult> {
  const candidates = new Map<string, { uid: string; method: 'verified_email' | 'verified_phone' }>()

  if (input.normalizedEmail) {
    const emailMatches = await db
      .collection('users')
      .where('verifiedEmail', '==', input.normalizedEmail)
      .limit(2)
      .get()
    for (const userDoc of emailMatches.docs) {
      candidates.set(userDoc.id, { uid: userDoc.id, method: 'verified_email' })
    }
  }

  if (input.normalizedPhone) {
    const phoneMatches = await db
      .collection('users')
      .where('verifiedPhone', '==', input.normalizedPhone)
      .limit(2)
      .get()
    for (const userDoc of phoneMatches.docs) {
      if (!candidates.has(userDoc.id)) {
        candidates.set(userDoc.id, { uid: userDoc.id, method: 'verified_phone' })
      }
    }
  }

  if (candidates.size === 0) return emptySangLinkResult()
  if (candidates.size > 1) return emptySangLinkResult('Multiple verified Sang users matched this email/phone.')

  const candidate = Array.from(candidates.values())[0]
  return {
    linkStatus: 'linked',
    sangUserId: candidate.uid,
    linkMethod: candidate.method,
    linkConflictReason: '',
  }
}

function eventAccessListFromMap(eventAccess: unknown) {
  const accessMap = eventAccess && typeof eventAccess === 'object' && !Array.isArray(eventAccess)
    ? eventAccess as Record<string, Record<string, unknown>>
    : {}
  return Object.entries(accessMap).map(([eventId, access]) => ({
    eventId: String(access.eventId || eventId),
    eventNameSnapshot: String(access.eventNameSnapshot || ''),
    eventTypeSnapshot: String(access.eventTypeSnapshot || ''),
    eventDescription: String(access.eventDescription || ''),
    eventPosterUrl: String(access.eventPosterUrl || ''),
    eventVenueName: String(access.eventVenueName || ''),
    eventLocationNote: String(access.eventLocationNote || ''),
    eventDirectionsNote: String(access.eventDirectionsNote || ''),
    eventAddress: String(access.eventAddress || ''),
    eventStartDateTime: access.eventStartDateTime || null,
    eventEndDateTime: access.eventEndDateTime || null,
    roleId: String(access.roleId || ''),
    roleName: String(access.roleName || ''),
    status: String(access.status || 'allowed'),
  }))
}

function personAccessLifecycle(person: Record<string, unknown>) {
  const accessStatus = String(person.accessStatus || person.rosterStatus || 'active')
  return ['blocked', 'removed'].includes(accessStatus) ? accessStatus : 'active'
}

function eventAccessMapWithStatus(eventAccess: unknown, status: 'blocked' | 'revoked') {
  const accessMap = eventAccess && typeof eventAccess === 'object' && !Array.isArray(eventAccess)
    ? eventAccess as Record<string, Record<string, unknown>>
    : {}
  return Object.entries(accessMap).reduce<Record<string, Record<string, unknown>>>((current, [eventId, access]) => {
    current[eventId] = {
      ...access,
      eventId: String(access.eventId || eventId),
      eventNameSnapshot: String(access.eventNameSnapshot || ''),
      roleId: String(access.roleId || ''),
      roleName: String(access.roleName || ''),
      status,
    }
    return current
  }, {})
}

function restoredEventAccessMap(eventAccess: unknown) {
  const accessMap = eventAccess && typeof eventAccess === 'object' && !Array.isArray(eventAccess)
    ? eventAccess as Record<string, Record<string, unknown>>
    : {}
  return Object.entries(accessMap).reduce<Record<string, Record<string, unknown>>>((current, [eventId, access]) => {
    const currentStatus = String(access.status || 'allowed')
    current[eventId] = {
      ...access,
      eventId: String(access.eventId || eventId),
      eventNameSnapshot: String(access.eventNameSnapshot || ''),
      roleId: String(access.roleId || ''),
      roleName: String(access.roleName || ''),
      status: ['blocked', 'revoked'].includes(currentStatus) ? 'allowed' : currentStatus,
    }
    return current
  }, {})
}

function buildSangEventAccessMirror(input: {
  uid: string
  programPersonId: string
  person: Record<string, unknown>
  program: Record<string, unknown>
  passId: string
  passQrPayload?: string
  linkStatus: string
  linkMethod: string
}) {
  const lifecycleStatus = personAccessLifecycle(input.person)
  const rawEventAccess = lifecycleStatus === 'active'
    ? input.person.eventAccess
    : eventAccessMapWithStatus(input.person.eventAccess, lifecycleStatus === 'blocked' ? 'blocked' : 'revoked')
  const eventAccessList = eventAccessListFromMap(rawEventAccess)
  const latitude = typeof input.program.latitude === 'number' ? input.program.latitude : undefined
  const longitude = typeof input.program.longitude === 'number' ? input.program.longitude : undefined
  const passStatus = String(input.person.passStatus || 'issued')
  const timezone = String(input.program.timezone || 'Asia/Kolkata')
  return {
    uid: input.uid,
    orgId: String(input.person.orgId || ''),
    programId: String(input.person.programId || ''),
    programPersonId: input.programPersonId,
    passId: input.passId,
    passQrPayload: String(input.passQrPayload || ''),
    programName: String(input.program.name || ''),
    programTagline: String(input.program.tagline || input.program.subtitle || ''),
    programType: String(input.program.programType || ''),
    mode: String(input.program.mode || ''),
    status: String(input.program.status || 'draft'),
    startDate: timestampFromInput(input.program.startDate, { timezone, dateOnly: 'start' }),
    endDate: timestampFromInput(input.program.endDate, { timezone, dateOnly: 'end' }),
    timezone,
    venueName: String(input.program.venueName || ''),
    city: String(input.program.city || ''),
    address: String(input.program.address || ''),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    logoUrl: String(input.program.logoUrl || ''),
    bannerUrl: String(input.program.bannerUrl || ''),
    posterUrl: String(input.program.posterUrl || ''),
    description: String(input.program.description || ''),
    directionsNote: String(input.program.directionsNote || ''),
    personName: String(input.person.fullName || ''),
    personOrganization: String(input.person.organization || input.person.company || ''),
    personCompany: String(input.person.company || input.person.organization || ''),
    personDesignation: String(input.person.designation || ''),
    personKind: String(input.person.kind || ''),
    programRoleId: String(input.person.programRoleId || input.person.kind || ''),
    programRoleName: String(input.person.programRoleName || input.person.kind || ''),
    passStatus,
    accessStatus: lifecycleStatus,
    rosterStatus: String(input.person.rosterStatus || lifecycleStatus),
    linkStatus: input.linkStatus,
    linkMethod: input.linkMethod,
    allowedEventIds: lifecycleStatus === 'active'
      ? Array.isArray(input.person.eventAccessIds) ? input.person.eventAccessIds : eventAccessList.map((access) => access.eventId)
      : [],
    eventAccess: rawEventAccess || {},
    eventAccessList,
    eventRoleKeys: Array.isArray(input.person.eventRoleKeys) ? input.person.eventRoleKeys : [],
    eventCount: eventAccessList.length,
    nextScheduleTitle: String(input.program.nextScheduleTitle || ''),
    nextScheduleAt: timestampFromInput(input.program.nextScheduleAt, { timezone }),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

async function ensureIssuedPassForPerson(batch: FirebaseFirestore.WriteBatch, input: {
  orgId: string
  programId: string
  programPersonId: string
  person: Record<string, unknown>
}) {
  const existingPassId = String(input.person.passId || '')
  if (existingPassId) {
    const existingPassSnapshot = await db.collection('pePasses').doc(existingPassId).get()
    const existingPass = existingPassSnapshot.data() || {}
    const status = String(existingPass.status || '')
    if (existingPassSnapshot.exists && !['revoked', 'expired', 'cancelled', 'blocked'].includes(status)) {
      return {
        passId: existingPassId,
        qrPayload: String(existingPass.qrPayload || ''),
        writesAdded: 0,
      }
    }
  }

  const token = makeToken()
  const passQrPayload = `SANGPASS1:${token}`
  const passRef = db.collection('pePasses').doc()
  batch.set(passRef, {
    orgId: input.orgId,
    programId: input.programId,
    programPersonId: input.programPersonId,
    tokenHash: tokenHash(token),
    qrPayload: passQrPayload,
    status: 'issued',
    delivery: { channel: 'manual', status: 'notSent' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return {
    passId: passRef.id,
    qrPayload: passQrPayload,
    writesAdded: 1,
  }
}

function mirrorProgramAccess(batch: FirebaseFirestore.WriteBatch, input: {
  uid: string
  programId: string
  programPersonId: string
  person: Record<string, unknown>
  program: Record<string, unknown>
  passId: string
  passQrPayload?: string
  linkStatus: string
  linkMethod: string
}) {
  batch.set(
    db.collection('users').doc(input.uid).collection('eventAccess').doc(input.programId),
    buildSangEventAccessMirror(input),
    { merge: true },
  )
}

async function activeDeviceTokens(uid: string) {
  const tokens = new Set<string>()
  const snapshot = await db
    .collection('devices')
    .where('uid', '==', uid)
    .where('active', '==', true)
    .limit(20)
    .get()
    .catch(() => null)
  for (const deviceDoc of snapshot?.docs || []) {
    const device = deviceDoc.data()
    if (device.notificationPermission === 'granted' && typeof device.fcmToken === 'string' && device.fcmToken.trim()) {
      tokens.add(device.fcmToken.trim())
    }
  }
  return Array.from(tokens)
}

async function notifyProgramAccess(input: { uid: string; orgId: string; programId: string; programName: string }) {
  try {
    const tokens = await activeDeviceTokens(input.uid)
    if (!tokens.length) return { attempted: 0, sent: 0 }
    const response = await getMessaging()
      .sendEachForMulticast({
        tokens: tokens.slice(0, 500),
        notification: {
          title: 'Program added on Sang',
          body: `${input.programName || 'Your program'} is ready in the Sang app.`,
        },
        data: {
          type: 'event_program_access',
          orgId: input.orgId,
          programId: input.programId,
          url: `sang://events/${input.programId}`,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'events',
            color: '#3A5068',
          },
        },
      })
      .catch((error) => {
        console.warn('Program access push failed.', error)
        return null
      })
    return { attempted: tokens.length, sent: response?.successCount || 0 }
  } catch (error) {
    console.warn('Program access notification skipped.', error)
    return { attempted: 0, sent: 0 }
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function venueMatchKey(input: { name?: string; latitude?: number; longitude?: number }) {
  const latitude = typeof input.latitude === 'number' ? input.latitude.toFixed(5) : ''
  const longitude = typeof input.longitude === 'number' ? input.longitude.toFixed(5) : ''
  return `${normalizeKey(input.name || '')}|${latitude}|${longitude}`
}

type ProgramVenueRoom = {
  id: string
  name: string
  floor?: string
  capacity?: number
  createdAt?: FirebaseFirestore.Timestamp | string
  updatedAt?: FirebaseFirestore.Timestamp | string
  lastUsedAt?: FirebaseFirestore.Timestamp | string
}

type ProgramVenueRecord = {
  id: string
  name: string
  address?: string
  directionsNote?: string
  latitude?: number
  longitude?: number
  rooms?: ProgramVenueRoom[]
  createdAt?: FirebaseFirestore.Timestamp | string
  updatedAt?: FirebaseFirestore.Timestamp | string
  lastUsedAt?: FirebaseFirestore.Timestamp | string
}

function publicScheduleItem(item: Record<string, unknown>) {
  const latitude = typeof item.latitude === 'number' ? item.latitude : undefined
  const longitude = typeof item.longitude === 'number' ? item.longitude : undefined
  const timezone = String(item.timezone || 'Asia/Kolkata')
  return {
    id: String(item.id || ''),
    title: String(item.title || ''),
    type: String(item.type || 'session'),
    customTypeLabel: String(item.customTypeLabel || ''),
    description: String(item.description || ''),
    startsAt: timestampFromInput(item.startsAt, { timezone }),
    endsAt: timestampFromInput(item.endsAt, { timezone }),
    timezone,
    venueId: String(item.venueId || ''),
    roomId: String(item.roomId || ''),
    venueName: String(item.venueName || ''),
    roomName: String(item.roomName || ''),
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    visibility: String(item.visibility || 'public'),
    status: String(item.status || 'scheduled'),
    sortOrder: Number(item.sortOrder || 0),
  }
}

async function upsertProgramVenue(input: {
  orgId: string
  programId: string
  venueId?: string
  venueName?: string
  roomId?: string
  roomName?: string
  latitude?: number
  longitude?: number
}) {
  const venueName = input.venueName?.trim() || ''
  const roomName = input.roomName?.trim() || ''
  if (!venueName) {
    return {
      venueId: input.venueId || '',
      roomId: roomName ? input.roomId || stableHashId('room', `${input.programId}|${roomName}`) : input.roomId || '',
    }
  }

  const now = Timestamp.now()
  const catalogRef = db.collection(programVenueCollection).doc(input.programId)

  return db.runTransaction(async (transaction) => {
    const catalogSnapshot = await transaction.get(catalogRef)
    const rawVenues = catalogSnapshot.data()?.venues
    const venues: ProgramVenueRecord[] = Array.isArray(rawVenues)
      ? rawVenues
        .filter((venue): venue is ProgramVenueRecord => Boolean(venue && typeof venue === 'object'))
        .map((venue) => ({
          ...venue,
        id: String(venue.id || ''),
        name: String(venue.name || ''),
        address: String(venue.address || ''),
        directionsNote: String(venue.directionsNote || ''),
        rooms: Array.isArray(venue.rooms)
            ? venue.rooms
              .filter((room): room is ProgramVenueRoom => Boolean(room && typeof room === 'object'))
              .map((room) => ({
                ...room,
                id: String(room.id || ''),
                name: String(room.name || ''),
              }))
            : [],
        }))
      : []

    const requestedVenueId = input.venueId?.trim() || ''
    const nextVenueKey = venueMatchKey({ name: venueName, latitude: input.latitude, longitude: input.longitude })
    let venueIndex = venues.findIndex((venue) => requestedVenueId && venue.id === requestedVenueId)
    if (venueIndex === -1) {
      venueIndex = venues.findIndex((venue) => venueMatchKey(venue) === nextVenueKey)
    }

    const venueId = venueIndex >= 0
      ? venues[venueIndex].id
      : stableHashId('venue', `${input.programId}|${nextVenueKey}`)

    const currentVenue: ProgramVenueRecord = venueIndex >= 0
      ? venues[venueIndex]
      : {
        id: venueId,
        name: venueName,
        rooms: [],
        createdAt: now,
      }

    const rooms = Array.isArray(currentVenue.rooms) ? [...currentVenue.rooms] : []
    let roomId = input.roomId?.trim() || ''
    if (roomName) {
      let roomIndex = rooms.findIndex((room) => roomId && room.id === roomId)
      if (roomIndex === -1) {
        const roomKey = normalizeKey(roomName)
        roomIndex = rooms.findIndex((room) => normalizeKey(room.name) === roomKey)
      }
      if (roomIndex >= 0) {
        roomId = rooms[roomIndex].id
        rooms[roomIndex] = {
          ...rooms[roomIndex],
          name: roomName,
          updatedAt: now,
          lastUsedAt: now,
        }
      } else {
        roomId = roomId || stableHashId('room', `${venueId}|${roomName}`)
        rooms.push({
          id: roomId,
          name: roomName,
          createdAt: now,
          updatedAt: now,
          lastUsedAt: now,
        })
      }
    }

    const nextVenue: ProgramVenueRecord = {
      ...currentVenue,
      id: venueId,
      name: venueName,
      ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
      ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
      rooms,
      updatedAt: now,
      lastUsedAt: now,
    }

    if (venueIndex >= 0) {
      venues[venueIndex] = nextVenue
    } else {
      venues.push(nextVenue)
    }

    transaction.set(
      catalogRef,
      {
        orgId: input.orgId,
        programId: input.programId,
        venues: venues.sort((a, b) => a.name.localeCompare(b.name)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return { venueId, roomId }
  })
}

function normalizeProgramVenues(rawVenues: unknown): ProgramVenueRecord[] {
  return Array.isArray(rawVenues)
    ? rawVenues
      .filter((venue): venue is ProgramVenueRecord => Boolean(venue && typeof venue === 'object'))
      .map((venue) => ({
        ...venue,
        id: String(venue.id || ''),
        name: String(venue.name || ''),
        address: String(venue.address || ''),
        rooms: Array.isArray(venue.rooms)
          ? venue.rooms
            .filter((room): room is ProgramVenueRoom => Boolean(room && typeof room === 'object'))
            .map((room) => ({
              ...room,
              id: String(room.id || ''),
              name: String(room.name || ''),
              floor: String(room.floor || ''),
              ...(typeof room.capacity === 'number' ? { capacity: room.capacity } : {}),
            }))
          : [],
      }))
    : []
}

type ProgramVenueDraftInput = z.infer<typeof programVenueDraftSchema>

function programVenueRecordFromInput(input: ProgramVenueDraftInput, programId: string, now: FirebaseFirestore.Timestamp): ProgramVenueRecord {
  const venueName = input.name.trim()
  const venueKey = venueMatchKey({ name: venueName, latitude: input.latitude, longitude: input.longitude })
  const venueId = input.id.trim() || stableHashId('venue', `${programId}|${venueKey}`)
  const rooms = input.rooms
    .filter((room) => room.name.trim())
    .map((room) => {
      const roomName = room.name.trim()
      return {
        id: room.id.trim() || stableHashId('room', `${venueId}|${roomName}`),
        name: roomName,
        floor: room.floor.trim(),
        ...(room.capacity === undefined ? {} : { capacity: room.capacity }),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      }
    })

  return {
    id: venueId,
    name: venueName,
    address: input.address.trim(),
    directionsNote: input.directionsNote.trim(),
    ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
    ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
    rooms,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  }
}

async function rebuildEventScheduleSnapshot(input: { orgId: string; programId: string; eventId?: string }) {
  if (!input.eventId) return

  const scheduleSnapshot = await db
    .collection(scheduleDashboardCollection)
    .where('orgId', '==', input.orgId)
    .where('eventId', '==', input.eventId)
    .get()

  const crmItems = scheduleSnapshot.docs.map((scheduleDoc) => ({
    id: scheduleDoc.id,
    ...(scheduleDoc.data() as Record<string, unknown>),
  })) as Array<Record<string, unknown> & { id: string }>
  crmItems.sort((first, second) => {
    const sortDelta = Number(first.sortOrder || 0) - Number(second.sortOrder || 0)
    if (sortDelta !== 0) return sortDelta
    return timestampMillis(first.startsAt) - timestampMillis(second.startsAt)
  })

  const audienceItems = crmItems
    .filter((item) => item.visibility !== 'staffOnly')
    .map(publicScheduleItem)

  const nowMillis = Date.now()
  const nextItem = audienceItems.find((item) => item.status !== 'cancelled' && timestampMillis(item.startsAt) >= nowMillis)
    || audienceItems.find((item) => item.status !== 'cancelled')
    || audienceItems[0]

  const batch = db.batch()
  batch.set(
    db.collection(scheduleSnapshotCollection).doc(input.eventId),
    {
      orgId: input.orgId,
      programId: input.programId,
      eventId: input.eventId,
      itemCount: audienceItems.length,
      items: audienceItems,
      version: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  batch.set(
    db.collection('peEvents').doc(input.eventId),
    {
      scheduleItemCount: crmItems.length,
      nextScheduleTitle: nextItem?.title || '',
      nextScheduleAt: nextItem?.startsAt || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await batch.commit()
}

export const createOrganization = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      displayName: z.string().min(2),
      orgName: z.string().min(2),
      industry: z.string().optional().default(''),
      website: z.string().optional().default(''),
      logoUrl: z.string().optional().default(''),
      email: z.string().email(),
    })
    .parse(request.data)

  const orgRef = db.collection('peOrganizations').doc()
  const batch = db.batch()

  batch.set(orgRef, {
    name: input.orgName.trim(),
    industry: input.industry.trim(),
    website: input.website.trim(),
    logoUrl: input.logoUrl.trim(),
    ownerUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  for (const role of defaultRoles) {
    batch.set(orgRef.collection('roles').doc(role.id), {
      ...role,
      orgId: orgRef.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  for (const role of defaultAudienceRoles) {
    batch.set(orgRef.collection('roles').doc(role.id), {
      ...role,
      orgId: orgRef.id,
      category: 'audience',
      description: `${role.name} audience category`,
      permissions: [],
      isDefault: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  batch.set(db.collection('peTeamMembers').doc(`${orgRef.id}_${uid}`), {
    orgId: orgRef.id,
    email: normalizeEmail(input.email),
    displayName: input.displayName.trim(),
    roleId: 'owner',
    scope: 'organization',
    status: 'active',
    uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  batch.set(db.collection('peUsers').doc(uid), {
    uid,
    displayName: input.displayName.trim(),
    email: normalizeEmail(input.email),
    activeOrgId: orgRef.id,
    organizationIds: [orgRef.id],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await batch.commit()
  await writeAudit({ orgId: orgRef.id, actorUid: uid, action: 'organization.create', entityPath: orgRef.path })
  return { orgId: orgRef.id }
})

export const updateOrganization = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      name: z.string().min(2),
      industry: z.string().optional().default(''),
      website: z.string().optional().default(''),
      logoUrl: z.string().optional().default(''),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.teamWrite)
  const orgRef = db.collection('peOrganizations').doc(input.orgId)
  await orgRef.set(
    {
      name: input.name.trim(),
      industry: input.industry.trim(),
      website: input.website.trim(),
      logoUrl: input.logoUrl.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'organization.update', entityPath: orgRef.path })
  return { orgId: input.orgId }
})

export const setActiveOrganization = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z.object({ orgId: z.string().min(1) }).parse(request.data)
  await assertPermission(uid, input.orgId, 'program.read', {})
  await db.collection('peUsers').doc(uid).set(
    {
      activeOrgId: input.orgId,
      organizationIds: FieldValue.arrayUnion(input.orgId),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return { orgId: input.orgId }
})

export const createRole = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      roleId: z.string().min(2),
      name: z.string().min(2),
      category: z.enum(['team', 'audience']).optional().default('team'),
      description: z.string().optional().default(''),
      permissions: z.array(z.string()).optional().default([]),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.rolesWrite)
  if (input.category === 'team' && input.permissions.length === 0) {
    throw new HttpsError('failed-precondition', 'Team roles need at least one permission.')
  }
  const roleId = normalizeRoleId(input.roleId)
  const rolePath = `peOrganizations/${input.orgId}/roles/${roleId}`
  await db.doc(rolePath).set(
    {
      orgId: input.orgId,
      name: input.name.trim(),
      category: input.category,
      description: input.description.trim(),
      permissions: input.category === 'team' ? input.permissions : [],
      isDefault: false,
      status: 'active',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'role.upsert', entityPath: rolePath })
  return { roleId }
})

export const deleteRole = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      roleId: z.string().min(1),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.rolesWrite)
  const roleId = normalizeRoleId(input.roleId)
  const roleRef = db.doc(`peOrganizations/${input.orgId}/roles/${roleId}`)
  const roleSnapshot = await roleRef.get()
  const role = roleSnapshot.data()
  const category = role?.category === 'audience' || isDefaultAudienceRole(roleId) ? 'audience' : 'team'

  if (category === 'team') {
    const teamUsage = await db
      .collection('peTeamMembers')
      .where('orgId', '==', input.orgId)
      .where('roleId', '==', roleId)
      .where('status', 'in', ['active', 'invited'])
      .limit(1)
      .get()
    if (!teamUsage.empty) {
      throw new HttpsError('failed-precondition', 'This team role is assigned to a member. Change those members before deleting the role.')
    }
  } else {
    const eventUsage = await db.collection('peEvents').where('orgId', '==', input.orgId).where('allowedAudienceRoleIds', 'array-contains', roleId).get()
    let batch = db.batch()
    let batchWrites = 0
    async function flushRoleDeleteBatch(force = false) {
      if (batchWrites === 0 || (!force && batchWrites < 450)) return
      await batch.commit()
      batch = db.batch()
      batchWrites = 0
    }
    const roleName = String(role?.name || defaultAudienceRoles.find((item) => item.id === roleId)?.name || roleId)
    for (const eventDoc of eventUsage.docs) {
      const event = eventDoc.data()
      batch.update(eventDoc.ref, {
        allowedAudienceRoleIds: Array.isArray(event.allowedAudienceRoleIds)
          ? event.allowedAudienceRoleIds.filter((allowedRoleId: string) => normalizeRoleId(String(allowedRoleId)) !== roleId)
          : [],
        allowedAudienceRoleNames: Array.isArray(event.allowedAudienceRoleNames)
          ? event.allowedAudienceRoleNames.filter((allowedRoleName: string) => String(allowedRoleName).toLowerCase() !== roleName.toLowerCase())
          : [],
        updatedAt: FieldValue.serverTimestamp(),
      })
      batchWrites += 1
      await flushRoleDeleteBatch()
    }
    await flushRoleDeleteBatch(true)
  }

  await roleRef.set(
    {
      orgId: input.orgId,
      name: role?.name || defaultAudienceRoles.find((item) => item.id === roleId)?.name || roleId,
      category,
      description: role?.description || '',
      permissions: [],
      isDefault: Boolean(role?.isDefault || isDefaultAudienceRole(roleId)),
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: role?.createdAt || FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'role.delete', entityPath: roleRef.path })
  return { roleId }
})

export const claimTeamAccess = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const email = normalizeEmail(request.auth?.token.email || '')
  if (!email) {
    throw new HttpsError('failed-precondition', 'Email is required to claim CRM access.')
  }

  const inviteSnapshot = await db
    .collection('peTeamMembers')
    .where('email', '==', email)
    .where('status', '==', 'invited')
    .limit(20)
    .get()

  if (inviteSnapshot.empty) {
    return { claimedOrgIds: [] }
  }

  const userRef = db.collection('peUsers').doc(uid)
  const userSnapshot = await userRef.get()
  const batch = db.batch()
  const claimedOrgIds: string[] = []

  for (const inviteDoc of inviteSnapshot.docs) {
    const invite = inviteDoc.data()
    const activeMemberRef = db.collection('peTeamMembers').doc(`${invite.orgId}_${uid}`)
    claimedOrgIds.push(invite.orgId)
    batch.set(activeMemberRef, {
      ...invite,
      uid,
      status: 'active',
      claimedFromTeamMemberId: inviteDoc.id,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })
    batch.update(inviteDoc.ref, {
      status: 'claimed',
      claimedUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  if (userSnapshot.exists) {
    batch.set(
      userRef,
      {
        email,
        organizationIds: FieldValue.arrayUnion(...claimedOrgIds),
        activeOrgId: userSnapshot.data()?.activeOrgId || claimedOrgIds[0],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  } else {
    batch.set(userRef, {
      uid,
      displayName: request.auth?.token.name || email,
      email,
      activeOrgId: claimedOrgIds[0],
      organizationIds: claimedOrgIds,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  return { claimedOrgIds }
})

export const inviteTeamMember = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      email: z.string().email(),
      displayName: z.string().min(1),
      roleId: z.string().min(1),
      scope: z.enum(['organization', 'program', 'event']),
      programId: z.string().optional().default(''),
      eventId: z.string().optional().default(''),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.teamWrite)
  const roleId = await assertTeamRole({ orgId: input.orgId, roleId: input.roleId })
  await assertTeamScope(input)
  const memberRef = db.collection('peTeamMembers').doc()
  await memberRef.set({
    ...input,
    email: normalizeEmail(input.email),
    roleId,
    programId: input.scope !== 'organization' ? input.programId : '',
    eventId: input.scope === 'event' ? input.eventId : '',
    status: 'invited',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'team.invite', entityPath: memberRef.path, metadata: { email: input.email } })
  return { teamMemberId: memberRef.id }
})

export const updateTeamMember = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      teamMemberId: z.string().min(1),
      displayName: z.string().min(1),
      roleId: z.string().min(1),
      scope: z.enum(['organization', 'program', 'event']),
      programId: z.string().optional().default(''),
      eventId: z.string().optional().default(''),
      status: z.enum(['active', 'invited', 'disabled']).optional().default('active'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.teamWrite)
  const memberRef = db.collection('peTeamMembers').doc(input.teamMemberId)
  const memberSnapshot = await memberRef.get()
  if (!memberSnapshot.exists) {
    throw new HttpsError('not-found', 'Team member not found.')
  }
  const member = memberSnapshot.data() || {}
  if (member.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Team member belongs to another organization.')
  }
  if (member.status === 'deleted' || member.status === 'claimed') {
    throw new HttpsError('failed-precondition', 'This team member record cannot be edited.')
  }
  const currentRoleId = normalizeRoleId(String(member.roleId || ''))
  const nextRoleId = await assertTeamRole({ orgId: input.orgId, roleId: input.roleId })
  await assertTeamScope(input)
  if (currentRoleId === 'owner' && (nextRoleId !== 'owner' || input.scope !== 'organization' || input.status !== 'active')) {
    throw new HttpsError('failed-precondition', 'Owner access cannot be downgraded from this screen.')
  }
  if (member.uid === uid && input.status !== 'active') {
    throw new HttpsError('failed-precondition', 'You cannot disable your own active CRM access.')
  }
  if (member.uid && input.status === 'invited') {
    throw new HttpsError('failed-precondition', 'Claimed members cannot be moved back to invited status.')
  }

  await memberRef.set(
    {
      displayName: input.displayName.trim(),
      roleId: nextRoleId,
      scope: input.scope,
      programId: input.scope !== 'organization' ? input.programId : '',
      eventId: input.scope === 'event' ? input.eventId : '',
      status: input.status,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'team.update', entityPath: memberRef.path })
  return { teamMemberId: input.teamMemberId }
})

export const deleteTeamMember = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      teamMemberId: z.string().min(1),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.teamWrite)
  const memberRef = db.collection('peTeamMembers').doc(input.teamMemberId)
  const memberSnapshot = await memberRef.get()
  if (!memberSnapshot.exists) {
    return { teamMemberId: input.teamMemberId }
  }
  const member = memberSnapshot.data() || {}
  if (member.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Team member belongs to another organization.')
  }
  if (normalizeRoleId(String(member.roleId || '')) === 'owner') {
    throw new HttpsError('failed-precondition', 'Owner access cannot be deleted from this screen.')
  }
  if (member.uid === uid) {
    throw new HttpsError('failed-precondition', 'You cannot delete your own active CRM access.')
  }

  const batch = db.batch()
  batch.set(
    memberRef,
    {
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  if (member.uid) {
    const userRef = db.collection('peUsers').doc(member.uid)
    const userSnapshot = await userRef.get()
    const user = userSnapshot.data() || {}
    const userUpdate: Record<string, unknown> = {
      organizationIds: FieldValue.arrayRemove(input.orgId),
      updatedAt: FieldValue.serverTimestamp(),
    }
    if (user.activeOrgId === input.orgId) {
      userUpdate.activeOrgId = ''
    }
    batch.set(
      userRef,
      userUpdate,
      { merge: true },
    )
  }
  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'team.delete', entityPath: memberRef.path })
  return { teamMemberId: input.teamMemberId }
})

export const createProgram = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      name: z.string().min(2),
      mode: z.enum(['standalone', 'multiEvent']),
      tagline: z.string().optional().default(''),
      programType: z.string().optional().default('college_fest'),
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      venueName: z.string().optional().default(''),
      city: z.string().optional().default(''),
      logoUrl: z.string().optional().default(''),
      bannerUrl: z.string().optional().default(''),
      posterUrl: z.string().optional().default(''),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional().default(''),
      directionsNote: z.string().optional().default(''),
      timezone: z.string().optional().default('Asia/Kolkata'),
      description: z.string().optional().default(''),
      entryScope: z.enum(['program', 'event', 'both']).optional().default('program'),
      competitive: z.boolean().optional().default(false),
      resultsEnabled: z.boolean().optional().default(false),
      primaryVenue: programVenueDraftSchema.optional(),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite)
  const programRef = db.collection('pePrograms').doc()
  const { primaryVenue, ...programInput } = input
  const now = Timestamp.now()
  const selectedVenue = primaryVenue?.name.trim() ? programVenueRecordFromInput(primaryVenue, programRef.id, now) : null
  const programVenuePatch = selectedVenue
    ? {
      venueName: selectedVenue.name,
      address: selectedVenue.address || selectedVenue.name,
      directionsNote: selectedVenue.directionsNote || input.directionsNote,
      ...(selectedVenue.latitude === undefined ? {} : { latitude: selectedVenue.latitude }),
      ...(selectedVenue.longitude === undefined ? {} : { longitude: selectedVenue.longitude }),
    }
    : {}

  const batch = db.batch()
  batch.set(programRef, {
    ...programInput,
    ...programVenuePatch,
    startDate: timestampFromInput(input.startDate, { timezone: input.timezone, dateOnly: 'start', required: true }),
    endDate: timestampFromInput(input.endDate, { timezone: input.timezone, dateOnly: 'end', required: true }),
    schedule: [],
    infoSections: [],
    fieldDefinitions: [],
    status: 'draft',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  if (selectedVenue) {
    batch.set(
      db.collection(programVenueCollection).doc(programRef.id),
      {
        orgId: input.orgId,
        programId: programRef.id,
        venues: [selectedVenue],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }
  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'program.create', entityPath: programRef.path })
  return { programId: programRef.id }
})

export const updateProgram = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      name: z.string().min(2),
      mode: z.enum(['standalone', 'multiEvent']),
      tagline: z.string().optional().default(''),
      programType: z.string().optional().default('college_fest'),
      startDate: z.string().min(1),
      endDate: z.string().min(1),
      venueName: z.string().optional().default(''),
      city: z.string().optional().default(''),
      logoUrl: z.string().optional().default(''),
      bannerUrl: z.string().optional().default(''),
      posterUrl: z.string().optional().default(''),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional().default(''),
      directionsNote: z.string().optional().default(''),
      timezone: z.string().optional().default('Asia/Kolkata'),
      description: z.string().optional().default(''),
      entryScope: z.enum(['program', 'event', 'both']).optional().default('program'),
      competitive: z.boolean().optional().default(false),
      resultsEnabled: z.boolean().optional().default(false),
      status: z.enum(['draft', 'live', 'archived']).optional().default('draft'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite, { programId: input.programId })
  const { programRef } = await assertProgram(input)
  await programRef.set(
    {
      ...input,
      startDate: timestampFromInput(input.startDate, { timezone: input.timezone, dateOnly: 'start', required: true }),
      endDate: timestampFromInput(input.endDate, { timezone: input.timezone, dateOnly: 'end', required: true }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'program.update', entityPath: programRef.path })
  return { programId: input.programId }
})

export const deleteProgram = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite, {
    programId: input.programId,
  })
  const { programRef } = await assertProgram(input)
  await programRef.set(
    {
      status: 'archived',
      archivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'program.archive', entityPath: programRef.path })
  return { programId: input.programId }
})

export const saveProgramPartner = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = programPartnerSchema.parse(request.data)

  await assertProgram(input)
  await assertPermission(uid, input.orgId, permissions.programWrite, { programId: input.programId })

  const partnerRef = input.partnerId
    ? db.collection('peProgramPartners').doc(input.partnerId)
    : db.collection('peProgramPartners').doc()
  const existingSnapshot = input.partnerId ? await partnerRef.get() : null
  if (existingSnapshot?.exists) {
    const existing = existingSnapshot.data() || {}
    if (existing.orgId !== input.orgId || existing.programId !== input.programId) {
      throw new HttpsError('permission-denied', 'Partner belongs to another program.')
    }
  }

  await partnerRef.set(
    {
      orgId: input.orgId,
      programId: input.programId,
      name: input.name.trim(),
      tier: input.tier.trim() || 'Partner',
      category: input.category.trim(),
      booth: input.booth.trim(),
      description: input.description.trim(),
      websiteUrl: input.websiteUrl.trim(),
      logoUrl: input.logoUrl.trim(),
      sortOrder: Number(input.sortOrder || 0),
      status: input.status,
      ...(existingSnapshot?.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: existingSnapshot?.exists ? 'programPartner.update' : 'programPartner.create', entityPath: partnerRef.path })
  return { partnerId: partnerRef.id }
})

export const deleteProgramPartner = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      partnerId: z.string().min(1),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite, { programId: input.programId })
  const partnerRef = db.collection('peProgramPartners').doc(input.partnerId)
  const partnerSnapshot = await partnerRef.get()
  if (!partnerSnapshot.exists) return { partnerId: input.partnerId }
  const partner = partnerSnapshot.data() || {}
  if (partner.orgId !== input.orgId || partner.programId !== input.programId) {
    throw new HttpsError('permission-denied', 'Partner belongs to another program.')
  }
  await partnerRef.delete()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'programPartner.delete', entityPath: partnerRef.path })
  return { partnerId: input.partnerId }
})

export const saveProgramVenue = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = programVenueInputSchema.parse(request.data)

  await assertProgram(input)
  await assertAnyPermission(uid, input.orgId, [
    { permission: permissions.programWrite, scope: { programId: input.programId } },
    { permission: permissions.eventWrite, scope: { programId: input.programId } },
  ])

  const now = Timestamp.now()
  const catalogRef = db.collection(programVenueCollection).doc(input.programId)
  const venueId = await db.runTransaction(async (transaction) => {
    const catalogSnapshot = await transaction.get(catalogRef)
    const venues = normalizeProgramVenues(catalogSnapshot.data()?.venues)
    const requestedVenueId = input.venueId.trim()
    const nextVenueKey = venueMatchKey({ name: input.name, latitude: input.latitude, longitude: input.longitude })
    let venueIndex = venues.findIndex((venue) => requestedVenueId && venue.id === requestedVenueId)
    if (venueIndex === -1) {
      venueIndex = venues.findIndex((venue) => venueMatchKey(venue) === nextVenueKey)
    }
    const nextVenueId = venueIndex >= 0 ? venues[venueIndex].id : stableHashId('venue', `${input.programId}|${nextVenueKey}`)
    const existingVenue = venueIndex >= 0 ? venues[venueIndex] : { id: nextVenueId, name: input.name.trim(), rooms: [], createdAt: now }
    const existingRooms = Array.isArray(existingVenue.rooms) ? existingVenue.rooms : []
    const rooms = input.rooms
      .filter((room) => room.name.trim())
      .map((room) => {
        const roomName = room.name.trim()
        const matchedRoom = existingRooms.find((existingRoom) => (room.id && existingRoom.id === room.id) || normalizeKey(existingRoom.name) === normalizeKey(roomName))
        return {
          ...matchedRoom,
          id: matchedRoom?.id || room.id.trim() || stableHashId('room', `${nextVenueId}|${roomName}`),
          name: roomName,
          floor: room.floor.trim(),
          ...(room.capacity === undefined ? {} : { capacity: room.capacity }),
          createdAt: matchedRoom?.createdAt || now,
          updatedAt: now,
          lastUsedAt: matchedRoom?.lastUsedAt || now,
        }
      })

    const nextVenue: ProgramVenueRecord = {
      ...existingVenue,
      id: nextVenueId,
      name: input.name.trim(),
      address: input.address.trim(),
      directionsNote: input.directionsNote.trim(),
      ...(input.latitude === undefined ? {} : { latitude: input.latitude }),
      ...(input.longitude === undefined ? {} : { longitude: input.longitude }),
      rooms,
      updatedAt: now,
      lastUsedAt: existingVenue.lastUsedAt || now,
    }

    if (venueIndex >= 0) {
      venues[venueIndex] = nextVenue
    } else {
      venues.push(nextVenue)
    }

    transaction.set(
      catalogRef,
      {
        orgId: input.orgId,
        programId: input.programId,
        venues: venues.sort((a, b) => a.name.localeCompare(b.name)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return nextVenueId
  })

  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'programVenue.save', entityPath: `${programVenueCollection}/${input.programId}`, metadata: { venueId } })
  return { venueId }
})

export const deleteProgramVenue = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      venueId: z.string().min(1),
      roomId: z.string().optional().default(''),
    })
    .parse(request.data)

  await assertProgram(input)
  await assertAnyPermission(uid, input.orgId, [
    { permission: permissions.programWrite, scope: { programId: input.programId } },
    { permission: permissions.eventWrite, scope: { programId: input.programId } },
  ])

  const catalogRef = db.collection(programVenueCollection).doc(input.programId)
  await db.runTransaction(async (transaction) => {
    const catalogSnapshot = await transaction.get(catalogRef)
    const venues = normalizeProgramVenues(catalogSnapshot.data()?.venues)
    const nextVenues = input.roomId
      ? venues.map((venue) => venue.id === input.venueId
        ? { ...venue, rooms: (venue.rooms || []).filter((room) => room.id !== input.roomId), updatedAt: Timestamp.now() }
        : venue)
      : venues.filter((venue) => venue.id !== input.venueId)

    transaction.set(
      catalogRef,
      {
        orgId: input.orgId,
        programId: input.programId,
        venues: nextVenues,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  })

  await writeAudit({ orgId: input.orgId, actorUid: uid, action: input.roomId ? 'programVenue.room.delete' : 'programVenue.delete', entityPath: `${programVenueCollection}/${input.programId}`, metadata: { venueId: input.venueId, roomId: input.roomId } })
  return { venueId: input.venueId, roomId: input.roomId }
})

export const createEvent = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      name: z.string().min(2),
      eventType: z.string().optional().default('session'),
      description: z.string().optional().default(''),
      startDateTime: z.string().optional().default(''),
      endDateTime: z.string().optional().default(''),
      multiDate: z.boolean().optional().default(false),
      venueName: z.string().optional().default(''),
      locationNote: z.string().optional().default(''),
      directionsNote: z.string().optional().default(''),
      posterUrl: z.string().optional().default(''),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional().default(''),
      entryScope: z.enum(['program', 'event', 'both']).optional().default('event'),
      competitive: z.boolean().optional().default(false),
      resultsEnabled: z.boolean().optional().default(false),
      scheduleItemCount: z.number().optional().default(0),
      nextScheduleTitle: z.string().optional().default(''),
      nextScheduleAt: z.string().optional().default(''),
      profiles: z.array(eventProfileSchema).optional().default([]),
      allowedAudienceRoleIds: z.array(z.string()).optional().default([]),
      allowedAudienceRoleNames: z.array(z.string()).optional().default([]),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite, { programId: input.programId })
  const { program } = await assertProgram(input)
  const timezone = String(program.timezone || 'Asia/Kolkata')
  const eventRef = db.collection('peEvents').doc()
  await eventRef.set({
    ...input,
    startDateTime: timestampFromInput(input.startDateTime, { timezone }),
    endDateTime: timestampFromInput(input.endDateTime, { timezone }),
    nextScheduleAt: timestampFromInput(input.nextScheduleAt, { timezone }),
    allowedAudienceRoleIds: uniqueStrings(input.allowedAudienceRoleIds.map(normalizeRoleId)),
    allowedAudienceRoleNames: uniqueStrings(input.allowedAudienceRoleNames),
    status: 'draft',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'event.create', entityPath: eventRef.path })
  return { eventId: eventRef.id }
})

export const updateEvent = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      eventId: z.string().min(1),
      programId: z.string().min(1),
      name: z.string().min(2),
      eventType: z.string().optional().default('session'),
      description: z.string().optional().default(''),
      startDateTime: z.string().optional().default(''),
      endDateTime: z.string().optional().default(''),
      multiDate: z.boolean().optional().default(false),
      venueName: z.string().optional().default(''),
      locationNote: z.string().optional().default(''),
      directionsNote: z.string().optional().default(''),
      posterUrl: z.string().optional().default(''),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      address: z.string().optional().default(''),
      entryScope: z.enum(['program', 'event', 'both']).optional().default('event'),
      competitive: z.boolean().optional().default(false),
      resultsEnabled: z.boolean().optional().default(false),
      scheduleItemCount: z.number().optional().default(0),
      nextScheduleTitle: z.string().optional().default(''),
      nextScheduleAt: z.string().optional().default(''),
      profiles: z.array(eventProfileSchema).optional().default([]),
      allowedAudienceRoleIds: z.array(z.string()).optional().default([]),
      allowedAudienceRoleNames: z.array(z.string()).optional().default([]),
      status: z.enum(['draft', 'live', 'completed']).optional().default('draft'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite, { programId: input.programId, eventId: input.eventId })
  const { program } = await assertProgram(input)
  const timezone = String(program.timezone || 'Asia/Kolkata')
  const { eventRef } = await assertEvent(input)

  await eventRef.set(
    {
      ...input,
      startDateTime: timestampFromInput(input.startDateTime, { timezone }),
      endDateTime: timestampFromInput(input.endDateTime, { timezone }),
      nextScheduleAt: timestampFromInput(input.nextScheduleAt, { timezone }),
      allowedAudienceRoleIds: uniqueStrings(input.allowedAudienceRoleIds.map(normalizeRoleId)),
      allowedAudienceRoleNames: uniqueStrings(input.allowedAudienceRoleNames),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'event.update', entityPath: eventRef.path })
  return { eventId: eventRef.id }
})

export const deleteEvent = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      eventId: z.string().min(1),
    })
    .parse(request.data)

  const eventRef = db.collection('peEvents').doc(input.eventId)
  const eventSnapshot = await eventRef.get()
  if (!eventSnapshot.exists) {
    return { eventId: input.eventId }
  }
  if (eventSnapshot.data()?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Event does not belong to this organization.')
  }
  await assertPermission(uid, input.orgId, permissions.eventWrite, {
    programId: String(eventSnapshot.data()?.programId || ''),
    eventId: input.eventId,
  })

  const batch = db.batch()
  batch.delete(eventRef)
  batch.delete(db.collection(scheduleSnapshotCollection).doc(input.eventId))
  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'event.delete', entityPath: eventRef.path })
  return { eventId: input.eventId }
})

export const createScheduleItem = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = scheduleInputSchema.parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite, {
    programId: input.programId,
    eventId: input.eventId || undefined,
  })
  const { program } = await assertProgram(input)
  const timezone = input.timezone || String(program.timezone || 'Asia/Kolkata')
  if (input.eventId) {
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId: input.eventId })
  }

  const venueSelection = await upsertProgramVenue(input)
  const scheduleRef = db.collection(scheduleDashboardCollection).doc()
  await scheduleRef.set({
    ...input,
    startsAt: timestampFromInput(input.startsAt, { timezone, required: true }),
    endsAt: timestampFromInput(input.endsAt, { timezone }),
    timezone,
    venueId: venueSelection.venueId,
    roomId: venueSelection.roomId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await rebuildEventScheduleSnapshot(input)
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'schedule.create', entityPath: scheduleRef.path })
  return { scheduleItemId: scheduleRef.id }
})

export const updateScheduleItem = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = scheduleInputSchema.extend({ scheduleItemId: z.string().min(1) }).parse(request.data)

  const scheduleRef = db.collection(scheduleDashboardCollection).doc(input.scheduleItemId)
  const scheduleSnapshot = await scheduleRef.get()
  if (!scheduleSnapshot.exists) {
    throw new HttpsError('not-found', 'Schedule item not found.')
  }
  const previousSchedule = scheduleSnapshot.data() || {}
  if (previousSchedule.orgId !== input.orgId || previousSchedule.programId !== input.programId) {
    throw new HttpsError('permission-denied', 'Schedule item does not belong to this program.')
  }
  await assertPermission(uid, input.orgId, permissions.eventWrite, {
    programId: input.programId,
    eventIds: uniqueStrings([input.eventId, String(previousSchedule.eventId || '')].filter(Boolean)),
  })
  const { program } = await assertProgram(input)
  const timezone = input.timezone || String(program.timezone || 'Asia/Kolkata')
  if (input.eventId) {
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId: input.eventId })
  }
  const venueSelection = await upsertProgramVenue(input)
  await scheduleRef.set(
    {
      ...input,
      startsAt: timestampFromInput(input.startsAt, { timezone, required: true }),
      endsAt: timestampFromInput(input.endsAt, { timezone }),
      timezone,
      venueId: venueSelection.venueId,
      roomId: venueSelection.roomId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await rebuildEventScheduleSnapshot(input)
  const previousEventId = String(previousSchedule.eventId || '')
  if (previousEventId && previousEventId !== input.eventId) {
    await rebuildEventScheduleSnapshot({ orgId: input.orgId, programId: String(previousSchedule.programId || input.programId), eventId: previousEventId })
  }
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'schedule.update', entityPath: scheduleRef.path })
  return { scheduleItemId: input.scheduleItemId }
})

export const deleteScheduleItem = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      scheduleItemId: z.string().min(1),
    })
    .parse(request.data)

  const scheduleRef = db.collection(scheduleDashboardCollection).doc(input.scheduleItemId)
  const scheduleSnapshot = await scheduleRef.get()
  if (!scheduleSnapshot.exists) {
    return { scheduleItemId: input.scheduleItemId }
  }
  if (scheduleSnapshot.data()?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Schedule item does not belong to this organization.')
  }
  await assertPermission(uid, input.orgId, permissions.eventWrite, {
    programId: String(scheduleSnapshot.data()?.programId || ''),
    eventId: String(scheduleSnapshot.data()?.eventId || '') || undefined,
  })
  await scheduleRef.delete()
  await rebuildEventScheduleSnapshot({
    orgId: input.orgId,
    programId: String(scheduleSnapshot.data()?.programId || ''),
    eventId: String(scheduleSnapshot.data()?.eventId || ''),
  })
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'schedule.delete', entityPath: scheduleRef.path })
  return { scheduleItemId: input.scheduleItemId }
})

export const publishProgramPeopleAccess = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      notify: z.boolean().optional().default(true),
      forceNotify: z.boolean().optional().default(false),
    })
    .parse(request.data)

  const { program } = await assertProgram(input)
  await assertPermission(uid, input.orgId, permissions.peopleImport, { programId: input.programId })

  const peopleSnapshot = await db
    .collection('peProgramPeople')
    .where('orgId', '==', input.orgId)
    .where('programId', '==', input.programId)
    .get()

  let batch = db.batch()
  let batchWrites = 0
  const notificationUids = new Set<string>()
  let linkedCount = 0
  let pendingCount = 0
  let manualReviewCount = 0
  let alreadyLinkedCount = 0
  let skippedCount = 0

  async function flushBatch(force = false) {
    if (batchWrites === 0 || (!force && batchWrites < 420)) return
    await batch.commit()
    batch = db.batch()
    batchWrites = 0
  }

  for (const personDoc of peopleSnapshot.docs) {
    const person = personDoc.data()
    const existingSangUserId = String(person.sangUserId || person.sangUid || '')
    const lifecycleStatus = personAccessLifecycle(person)
    if (lifecycleStatus !== 'active') {
      const existingPassId = String(person.passId || '')
      const inactivePassStatus = lifecycleStatus === 'blocked' ? 'blocked' : 'revoked'
      const inactiveEventAccess = eventAccessMapWithStatus(person.eventAccess, lifecycleStatus === 'blocked' ? 'blocked' : 'revoked')
      batch.set(
        personDoc.ref,
        {
          passStatus: inactivePassStatus,
          eventAccess: inactiveEventAccess,
          eventAccessList: eventAccessListFromMap(inactiveEventAccess),
          ...(lifecycleStatus === 'removed' ? { eventAccessIds: [], eventRoleKeys: [] } : {}),
          accessLastPublishedBy: uid,
          accessLastPublishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      batchWrites += 1
      if (existingPassId) {
        batch.set(
          db.collection('pePasses').doc(existingPassId),
          {
            status: inactivePassStatus,
            revokedReason: lifecycleStatus === 'blocked' ? 'access-blocked' : 'person-removed',
            revokedBy: uid,
            revokedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        batchWrites += 1
      }
      if (existingSangUserId) {
        const mirrorRef = db.collection('users').doc(existingSangUserId).collection('eventAccess').doc(input.programId)
        if (lifecycleStatus === 'removed') {
          batch.delete(mirrorRef)
        } else {
          batch.set(
            mirrorRef,
            {
              accessStatus: 'blocked',
              rosterStatus: 'blocked',
              passStatus: 'blocked',
              allowedEventIds: [],
              eventAccess: inactiveEventAccess,
              eventAccessList: eventAccessListFromMap(inactiveEventAccess),
              eventRoleKeys: [],
              eventCount: 0,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
        }
        batchWrites += 1
      }
      skippedCount += 1
      await flushBatch()
      continue
    }
    const email = normalizeEmail(String(person.normalizedEmail || person.email || ''))
    const phone = normalizePhone(String(person.normalizedPhone || person.phone || ''))
    const linkResult = existingSangUserId
      ? {
        linkStatus: 'linked' as const,
        sangUserId: existingSangUserId,
        linkMethod: String(person.linkMethod || 'manual') as SangLinkResult['linkMethod'],
        linkConflictReason: '',
      }
      : await findVerifiedSangUser({ normalizedEmail: email, normalizedPhone: phone })
    const sangAppFields = sangAppFieldsFromLinkResult(linkResult, Boolean(email || phone))

    if (linkResult.linkStatus !== 'linked') {
      batch.set(
        personDoc.ref,
        {
          linkStatus: linkResult.linkStatus,
          linkConflictReason: linkResult.linkConflictReason,
          ...sangAppFields,
          accessLastPublishedBy: uid,
          accessLastPublishedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      batchWrites += 1
      if (linkResult.linkStatus === 'manual_review') manualReviewCount += 1
      else pendingCount += 1
      await flushBatch()
      continue
    }

    const passResult = await ensureIssuedPassForPerson(batch, {
      orgId: input.orgId,
      programId: input.programId,
      programPersonId: personDoc.id,
      person,
    })
    batchWrites += passResult.writesAdded

    const nextPerson = {
      ...person,
      sangUserId: linkResult.sangUserId,
      sangUid: linkResult.sangUserId,
      linkStatus: 'linked',
      linkMethod: linkResult.linkMethod,
      linkConflictReason: '',
      ...sangAppFields,
      passId: passResult.passId,
      passStatus: 'issued',
    }
    const isAlreadyLinked = Boolean(existingSangUserId)
    batch.set(
      personDoc.ref,
      {
        sangUserId: linkResult.sangUserId,
        sangUid: linkResult.sangUserId,
        linkStatus: 'linked',
        linkMethod: linkResult.linkMethod,
        linkConflictReason: '',
        ...sangAppFields,
        linkedAt: isAlreadyLinked ? person.linkedAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        accessPublishedAt: person.accessPublishedAt || FieldValue.serverTimestamp(),
        accessLastPublishedBy: uid,
        accessLastPublishedAt: FieldValue.serverTimestamp(),
        passId: passResult.passId,
        passStatus: 'issued',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    mirrorProgramAccess(batch, {
      uid: linkResult.sangUserId,
      programId: input.programId,
      programPersonId: personDoc.id,
      person: nextPerson,
      program,
      passId: passResult.passId,
      passQrPayload: passResult.qrPayload,
      linkStatus: 'linked',
      linkMethod: linkResult.linkMethod,
    })
    batchWrites += 2
    if (isAlreadyLinked) alreadyLinkedCount += 1
    else linkedCount += 1
    if (input.notify && (input.forceNotify || !person.accessPublishedAt)) {
      notificationUids.add(linkResult.sangUserId)
    }
    await flushBatch()
  }

  await flushBatch(true)

  let notificationSentCount = 0
  if (input.notify) {
    for (const notificationUid of notificationUids) {
      const result = await notifyProgramAccess({
        uid: notificationUid,
        orgId: input.orgId,
        programId: input.programId,
        programName: String(program.name || ''),
      })
      notificationSentCount += result.sent
    }
  }

  await writeAudit({
    orgId: input.orgId,
    actorUid: uid,
    action: 'programPeople.publish',
    entityPath: `pePrograms/${input.programId}`,
    metadata: {
      peopleCount: peopleSnapshot.size,
      linkedCount,
      alreadyLinkedCount,
      pendingCount,
      manualReviewCount,
      notificationSentCount,
      skippedCount,
    },
  })

  return {
    peopleCount: peopleSnapshot.size,
    linkedCount,
    alreadyLinkedCount,
    pendingCount,
    manualReviewCount,
    notificationSentCount,
    skippedCount,
  }
})

export const createProgramPersonAndPass = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      fullName: z.string().min(1),
      email: z.string().optional().default(''),
      phone: z.string().optional().default(''),
      kind: z.string().optional().default('attendee'),
      programRoleId: z.string().optional().default('attendee'),
      programRoleName: z.string().optional().default('Attendee'),
      company: z.string().optional().default(''),
      organization: z.string().optional().default(''),
      designation: z.string().optional().default(''),
      eventIds: z.array(z.string()).optional().default([]),
      eventAccess: z.array(eventAccessSchema).optional().default([]),
    })
    .parse(request.data)

  const { program } = await assertProgram(input)
  const eventAccessById = new Map<string, z.infer<typeof eventAccessSchema>>()
  for (const access of input.eventAccess) {
    eventAccessById.set(access.eventId, {
      ...access,
      roleId: normalizeRoleId(access.roleId),
      roleName: access.roleName.trim() || access.roleId,
    })
  }
  for (const eventId of input.eventIds) {
    if (!eventAccessById.has(eventId)) {
      eventAccessById.set(eventId, {
        eventId,
        roleId: normalizeRoleId(input.programRoleId || input.kind),
        roleName: input.programRoleName || input.kind || 'Attendee',
        status: 'allowed',
      })
    }
  }
  const eventAccess = Array.from(eventAccessById.values())
  const eventAccessIds = eventAccess.map((access) => access.eventId)
  await assertPermission(uid, input.orgId, permissions.peopleImport, {
    programId: input.programId,
    eventIds: eventAccessIds,
  })
  await assertPermission(uid, input.orgId, permissions.passesIssue, {
    programId: input.programId,
    eventIds: eventAccessIds,
  })
  const eventDetailsById = new Map<string, Record<string, unknown>>()
  for (const eventId of eventAccessIds) {
    const { event } = await assertEvent({ orgId: input.orgId, programId: input.programId, eventId })
    eventDetailsById.set(eventId, event)
  }
  const eventAccessMap = eventAccess.reduce<Record<string, Record<string, unknown>>>((current, access) => {
    const eventData = eventDetailsById.get(access.eventId) || {}
    const roleId = normalizeRoleId(access.roleId)
    const roleName = access.roleName.trim() || access.roleId
    current[access.eventId] = {
      eventId: access.eventId,
      eventNameSnapshot: String(eventData.name || access.eventId),
      eventTypeSnapshot: String(eventData.eventType || ''),
      eventDescription: String(eventData.description || ''),
      eventPosterUrl: String(eventData.posterUrl || ''),
      eventVenueName: String(eventData.venueName || ''),
      eventLocationNote: String(eventData.locationNote || ''),
      eventDirectionsNote: String(eventData.directionsNote || ''),
      eventAddress: String(eventData.address || ''),
      eventStartDateTime: eventData.startDateTime || null,
      eventEndDateTime: eventData.endDateTime || null,
      roleId,
      roleName,
      status: access.status,
    }
    return current
  }, {})
  const programRoleId = normalizeRoleId(input.programRoleId || input.kind)
  const programRoleName = input.programRoleName.trim() || input.kind || 'Attendee'
  const organization = input.organization.trim() || input.company.trim()
  const email = normalizeEmail(input.email)
  const phone = input.phone.trim()
  const normalizedPhone = normalizePhone(phone)
  const personIdentity = email || normalizedPhone || phone || `${input.fullName.trim().toLowerCase()}|${organization.toLowerCase()}|${input.designation.trim().toLowerCase()}`
  const personRef = db.collection('peProgramPeople').doc(stableHashId('person', `${input.programId}|${personIdentity}`))
  const personSnapshot = await personRef.get()
  const existingPerson = personSnapshot.data() || {}
  const existingAccess = existingPerson.eventAccess && typeof existingPerson.eventAccess === 'object'
    ? existingPerson.eventAccess as Record<string, Record<string, unknown>>
    : {}
  const nextEventAccess = {
    ...existingAccess,
    ...eventAccessMap,
  } as Record<string, Record<string, unknown>>
  const nextEventAccessList: Array<Record<string, unknown> & { eventId: string }> = Object.entries(nextEventAccess).map(([eventId, access]) => ({
    ...access,
    eventId: String(access.eventId || eventId),
  }))
  const nextEventAccessIds = uniqueStrings(nextEventAccessList.map((access) => access.eventId))
  const nextEventRoleKeys = uniqueStrings(nextEventAccessList.map((access) => `${access.eventId}:${access.roleId}`))
  const existingPassId = String(existingPerson.passId || '')
  const existingPassSnapshot = existingPassId ? await db.collection('pePasses').doc(existingPassId).get() : null
  const canReusePass = Boolean(existingPassId && existingPassSnapshot?.exists && !['revoked', 'expired', 'cancelled', 'blocked'].includes(String(existingPassSnapshot.data()?.status || '')))
  const passRef = canReusePass ? db.collection('pePasses').doc(existingPassId) : db.collection('pePasses').doc()
  const token = canReusePass ? '' : makeToken()
  const passStatus = canReusePass
    ? String(existingPerson.passStatus || existingPassSnapshot?.data()?.status || 'issued')
    : 'issued'
  const passQrPayload = canReusePass
    ? String(existingPassSnapshot?.data()?.qrPayload || '')
    : `SANGPASS1:${token}`
  const existingSangUserId = String(existingPerson.sangUserId || existingPerson.sangUid || '')
  const linkResult = existingSangUserId
    ? {
      linkStatus: 'linked' as const,
      sangUserId: existingSangUserId,
      linkMethod: String(existingPerson.linkMethod || 'manual') as SangLinkResult['linkMethod'],
      linkConflictReason: '',
    }
    : await findVerifiedSangUser({ normalizedEmail: email, normalizedPhone })
  const sangAppFields = sangAppFieldsFromLinkResult(linkResult, Boolean(email || normalizedPhone))
  const personPatch = {
    orgId: input.orgId,
    programId: input.programId,
    fullName: input.fullName.trim(),
    email,
    phone,
    normalizedEmail: email,
    normalizedPhone,
    kind: programRoleId,
    programRoleId,
    programRoleName,
    company: input.company.trim(),
    organization,
    designation: input.designation.trim(),
    eventAccessIds: nextEventAccessIds,
    eventAccess: nextEventAccess,
    eventAccessList: nextEventAccessList,
    eventRoleKeys: nextEventRoleKeys,
    passId: passRef.id,
    passStatus,
    rosterStatus: 'active',
    accessStatus: 'active',
    sangUserId: linkResult.sangUserId,
    sangUid: linkResult.sangUserId,
    linkStatus: linkResult.linkStatus,
    linkMethod: linkResult.linkMethod,
    linkConflictReason: linkResult.linkConflictReason,
    ...sangAppFields,
    ...(linkResult.linkStatus === 'linked' ? { linkedAt: FieldValue.serverTimestamp() } : {}),
    ...(!personSnapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }
  const batch = db.batch()

  batch.set(personRef, personPatch, { merge: true })

  if (!canReusePass) {
    batch.set(passRef, {
      orgId: input.orgId,
      programId: input.programId,
      programPersonId: personRef.id,
      tokenHash: tokenHash(token),
      qrPayload: passQrPayload,
      status: 'issued',
      delivery: { channel: 'manual', status: 'notSent' },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }
  if (linkResult.sangUserId) {
    batch.set(
      db.collection('users').doc(linkResult.sangUserId).collection('eventAccess').doc(input.programId),
      buildSangEventAccessMirror({
        uid: linkResult.sangUserId,
        programPersonId: personRef.id,
        person: { ...existingPerson, ...personPatch },
        program,
        passId: passRef.id,
        passQrPayload,
        linkStatus: linkResult.linkStatus,
        linkMethod: linkResult.linkMethod,
      }),
      { merge: true },
    )
  }

  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'programPerson.createWithPass', entityPath: personRef.path })
  return {
    programPersonId: personRef.id,
    passId: passRef.id,
    qrPayload: passQrPayload,
  }
})

export const claimMyEventAccess = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const authUser = await getAuth().getUser(uid)
  const userSnapshot = await db.collection('users').doc(uid).get().catch(() => null)
  const userData = userSnapshot?.data() || {}
  const verifiedEmails = uniqueStrings([
    authUser.emailVerified ? normalizeEmail(authUser.email || '') : '',
    normalizeEmail(String(userData.verifiedEmail || '')),
  ])
  const verifiedPhones = uniqueStrings([
    normalizePhone(authUser.phoneNumber || ''),
    normalizePhone(String(userData.verifiedPhone || '')),
  ])

  if (!verifiedEmails.length && !verifiedPhones.length) {
    return {
      linkedCount: 0,
      pendingCount: 0,
      manualReviewCount: 0,
    }
  }

  const candidates = new Map<string, Record<string, unknown> & { id: string }>()
  const collectMatches = async (field: string, value: string) => {
    if (!value) return
    const snapshot = await db
      .collection('peProgramPeople')
      .where(field, '==', value)
      .limit(100)
      .get()
    for (const personDoc of snapshot.docs) {
      candidates.set(personDoc.id, { id: personDoc.id, ...personDoc.data() })
    }
  }

  for (const verifiedEmail of verifiedEmails) {
    await collectMatches('normalizedEmail', verifiedEmail)
    await collectMatches('email', verifiedEmail)
  }
  for (const verifiedPhone of verifiedPhones) {
    await collectMatches('normalizedPhone', verifiedPhone)
    await collectMatches('phone', verifiedPhone)
  }

  const peopleByProgram = new Map<string, Array<Record<string, unknown> & { id: string }>>()
  for (const person of candidates.values()) {
    if (personAccessLifecycle(person) !== 'active') continue
    const linkedUid = String(person.sangUserId || person.sangUid || '')
    if (linkedUid && linkedUid !== uid) continue
    const programId = String(person.programId || '')
    if (!programId) continue
    peopleByProgram.set(programId, [...(peopleByProgram.get(programId) || []), person])
  }

  const batch = db.batch()
  const programCache = new Map<string, Record<string, unknown>>()
  let linkedCount = 0
  let manualReviewCount = 0

  for (const [programId, peopleForProgram] of peopleByProgram.entries()) {
    if (peopleForProgram.length !== 1) {
      manualReviewCount += peopleForProgram.length
      for (const person of peopleForProgram) {
        const reviewLinkResult: SangLinkResult = {
          linkStatus: 'manual_review',
          sangUserId: '',
          linkMethod: '',
          linkConflictReason: 'Multiple CRM people records matched this Sang account for the same program.',
        }
        batch.set(
          db.collection('peProgramPeople').doc(person.id),
          {
            linkStatus: 'manual_review',
            linkConflictReason: reviewLinkResult.linkConflictReason,
            ...sangAppFieldsFromLinkResult(reviewLinkResult, true),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
      }
      continue
    }

    const person = peopleForProgram[0]
    let program = programCache.get(programId)
    if (!program) {
      const programSnapshot = await db.collection('pePrograms').doc(programId).get()
      program = programSnapshot.data() || {}
      programCache.set(programId, program)
    }
    const personEmail = normalizeEmail(String(person.normalizedEmail || person.email || ''))
    const personPhone = normalizePhone(String(person.normalizedPhone || person.phone || ''))
    const linkMethod = personEmail && verifiedEmails.includes(personEmail)
      ? 'verified_email'
      : personPhone && verifiedPhones.includes(personPhone)
        ? 'verified_phone'
        : 'manual'
    const linkResult: SangLinkResult = {
      linkStatus: 'linked',
      sangUserId: uid,
      linkMethod,
      linkConflictReason: '',
    }
    const passId = String(person.passId || '')
    const passSnapshot = passId ? await db.collection('pePasses').doc(passId).get() : null
    const passQrPayload = passSnapshot?.exists ? String(passSnapshot.data()?.qrPayload || '') : ''

    batch.set(
      db.collection('peProgramPeople').doc(person.id),
      {
        sangUserId: uid,
        sangUid: uid,
        linkStatus: 'linked',
        linkMethod,
        linkConflictReason: '',
        ...sangAppFieldsFromLinkResult(linkResult, true),
        linkedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    batch.set(
      db.collection('users').doc(uid).collection('eventAccess').doc(programId),
      buildSangEventAccessMirror({
        uid,
        programPersonId: person.id,
        person: {
          ...person,
          sangUserId: uid,
          sangUid: uid,
          linkStatus: 'linked',
          linkMethod,
        },
        program,
        passId,
        passQrPayload,
        linkStatus: 'linked',
        linkMethod,
      }),
      { merge: true },
    )
    linkedCount += 1
  }

  if (linkedCount || manualReviewCount) {
    await batch.commit()
  }

  return {
    linkedCount,
    pendingCount: Math.max(candidates.size - linkedCount - manualReviewCount, 0),
    manualReviewCount,
  }
})

async function updateProgramPersonLifecycle(input: {
  actorUid: string
  orgId: string
  programPersonId: string
  lifecycleStatus: 'blocked' | 'removed'
  reason: string
}) {
  const personRef = db.collection('peProgramPeople').doc(input.programPersonId)
  const personSnapshot = await personRef.get()
  if (!personSnapshot.exists) {
    throw new HttpsError('not-found', 'Program person not found.')
  }
  const person = personSnapshot.data() || {}
  if (person.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Program person belongs to another organization.')
  }

  const programId = String(person.programId || '')
  const currentEventAccessIds = Array.isArray(person.eventAccessIds)
    ? person.eventAccessIds.map((eventId) => String(eventId)).filter(Boolean)
    : []
  const currentEventRoleKeys = Array.isArray(person.eventRoleKeys)
    ? person.eventRoleKeys.map((roleKey) => String(roleKey)).filter(Boolean)
    : []
  await assertPermission(input.actorUid, input.orgId, permissions.peopleImport, {
    programId,
    eventIds: currentEventAccessIds,
  })

  const inactiveEventStatus = input.lifecycleStatus === 'blocked' ? 'blocked' : 'revoked'
  const inactivePassStatus = input.lifecycleStatus === 'blocked' ? 'blocked' : 'revoked'
  const inactiveEventAccess = eventAccessMapWithStatus(person.eventAccess, inactiveEventStatus)
  const existingPassId = String(person.passId || '')
  const existingPassSnapshot = existingPassId ? await db.collection('pePasses').doc(existingPassId).get() : null
  const passQrPayload = existingPassSnapshot?.exists ? String(existingPassSnapshot.data()?.qrPayload || '') : ''
  const sangUserId = String(person.sangUserId || person.sangUid || person.sangAppUserId || '')
  const timestampField = input.lifecycleStatus === 'blocked' ? 'blockedAt' : 'removedAt'
  const actorField = input.lifecycleStatus === 'blocked' ? 'blockedBy' : 'removedBy'
  const reasonField = input.lifecycleStatus === 'blocked' ? 'blockedReason' : 'removedReason'
  const personPatch = {
    rosterStatus: input.lifecycleStatus,
    accessStatus: input.lifecycleStatus,
    passStatus: inactivePassStatus,
    eventAccess: inactiveEventAccess,
    eventAccessList: eventAccessListFromMap(inactiveEventAccess),
    ...(input.lifecycleStatus === 'removed' ? { eventAccessIds: [], eventRoleKeys: [] } : {}),
    ...(input.lifecycleStatus === 'blocked' && personAccessLifecycle(person) === 'active'
      ? {
        eventAccessBeforeBlock: person.eventAccess || {},
        eventAccessIdsBeforeBlock: currentEventAccessIds,
        eventRoleKeysBeforeBlock: currentEventRoleKeys,
        passStatusBeforeBlock: String(person.passStatus || 'issued'),
      }
      : {}),
    [timestampField]: FieldValue.serverTimestamp(),
    [actorField]: input.actorUid,
    [reasonField]: input.reason,
    updatedAt: FieldValue.serverTimestamp(),
  }

  const batch = db.batch()
  batch.set(personRef, personPatch, { merge: true })
  if (existingPassId) {
    batch.set(
      db.collection('pePasses').doc(existingPassId),
      {
        status: inactivePassStatus,
        revokedReason: input.lifecycleStatus === 'blocked' ? 'access-blocked' : 'person-removed',
        revokedBy: input.actorUid,
        revokedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }
  if (sangUserId && programId) {
    const mirrorRef = db.collection('users').doc(sangUserId).collection('eventAccess').doc(programId)
    if (input.lifecycleStatus === 'removed') {
      batch.delete(mirrorRef)
    } else {
      const programSnapshot = await db.collection('pePrograms').doc(programId).get()
      batch.set(
        mirrorRef,
        buildSangEventAccessMirror({
          uid: sangUserId,
          programPersonId: input.programPersonId,
          person: { ...person, ...personPatch },
          program: programSnapshot.data() || {},
          passId: existingPassId,
          passQrPayload,
          linkStatus: String(person.linkStatus || 'linked'),
          linkMethod: String(person.linkMethod || 'manual'),
        }),
        { merge: true },
      )
    }
  }
  await batch.commit()
  await writeAudit({
    orgId: input.orgId,
    actorUid: input.actorUid,
    action: input.lifecycleStatus === 'blocked' ? 'programPerson.block' : 'programPerson.remove',
    entityPath: personRef.path,
    metadata: {
      programId,
      passId: existingPassId,
      reason: input.reason,
    },
  })
  return {
    programPersonId: input.programPersonId,
    status: input.lifecycleStatus,
    passStatus: inactivePassStatus,
  }
}

export const blockProgramPersonAccess = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programPersonId: z.string().min(1),
      reason: z.string().optional().default('blocked-by-organizer'),
    })
    .parse(request.data)

  return updateProgramPersonLifecycle({
    actorUid: uid,
    orgId: input.orgId,
    programPersonId: input.programPersonId,
    lifecycleStatus: 'blocked',
    reason: input.reason.trim() || 'blocked-by-organizer',
  })
})

export const removeProgramPersonAccess = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programPersonId: z.string().min(1),
      reason: z.string().optional().default('removed-by-organizer'),
    })
    .parse(request.data)

  return updateProgramPersonLifecycle({
    actorUid: uid,
    orgId: input.orgId,
    programPersonId: input.programPersonId,
    lifecycleStatus: 'removed',
    reason: input.reason.trim() || 'removed-by-organizer',
  })
})

export const unblockProgramPersonAccess = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programPersonId: z.string().min(1),
      reason: z.string().optional().default('unblocked-by-organizer'),
    })
    .parse(request.data)

  const personRef = db.collection('peProgramPeople').doc(input.programPersonId)
  const personSnapshot = await personRef.get()
  if (!personSnapshot.exists) {
    throw new HttpsError('not-found', 'Program person not found.')
  }
  const person = personSnapshot.data() || {}
  if (person.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Program person belongs to another organization.')
  }
  const lifecycleStatus = personAccessLifecycle(person)
  if (lifecycleStatus === 'removed') {
    throw new HttpsError('failed-precondition', 'Removed people must be added again before access can be restored.')
  }

  const programId = String(person.programId || '')
  const restoredAccessSource = person.eventAccessBeforeBlock || person.eventAccess || {}
  const eventAccess = restoredEventAccessMap(restoredAccessSource)
  const eventAccessList = eventAccessListFromMap(eventAccess)
  const restoredEventAccessIds = Array.isArray(person.eventAccessIdsBeforeBlock)
    ? person.eventAccessIdsBeforeBlock.map((eventId) => String(eventId)).filter(Boolean)
    : uniqueStrings(eventAccessList.map((access) => access.eventId))
  const restoredEventRoleKeys = Array.isArray(person.eventRoleKeysBeforeBlock)
    ? person.eventRoleKeysBeforeBlock.map((roleKey) => String(roleKey)).filter(Boolean)
    : uniqueStrings(eventAccessList.map((access) => `${access.eventId}:${access.roleId}`))

  await assertPermission(uid, input.orgId, permissions.peopleImport, {
    programId,
    eventIds: restoredEventAccessIds,
  })
  await assertPermission(uid, input.orgId, permissions.passesIssue, {
    programId,
    eventIds: restoredEventAccessIds,
  })

  if (lifecycleStatus === 'active') {
    return {
      programPersonId: input.programPersonId,
      status: 'active',
      passStatus: String(person.passStatus || 'issued'),
      passId: String(person.passId || ''),
      qrPayload: '',
    }
  }

  const previousPassId = String(person.passId || '')
  const token = makeToken()
  const passQrPayload = `SANGPASS1:${token}`
  const passRef = db.collection('pePasses').doc()
  const sangUserId = String(person.sangUserId || person.sangUid || person.sangAppUserId || '')
  const reason = input.reason.trim() || 'unblocked-by-organizer'
  const personPatch = {
    rosterStatus: 'active',
    accessStatus: 'active',
    passStatus: 'issued',
    passId: passRef.id,
    previousPassId,
    passRotatedAt: FieldValue.serverTimestamp(),
    eventAccess,
    eventAccessList,
    eventAccessIds: restoredEventAccessIds,
    eventRoleKeys: restoredEventRoleKeys,
    blockedAt: FieldValue.delete(),
    blockedBy: FieldValue.delete(),
    blockedReason: FieldValue.delete(),
    eventAccessBeforeBlock: FieldValue.delete(),
    eventAccessIdsBeforeBlock: FieldValue.delete(),
    eventRoleKeysBeforeBlock: FieldValue.delete(),
    passStatusBeforeBlock: FieldValue.delete(),
    unblockedAt: FieldValue.serverTimestamp(),
    unblockedBy: uid,
    unblockedReason: reason,
    updatedAt: FieldValue.serverTimestamp(),
  }

  const batch = db.batch()
  batch.set(personRef, personPatch, { merge: true })
  if (previousPassId) {
    batch.set(
      db.collection('pePasses').doc(previousPassId),
      {
        status: 'revoked',
        revokedReason: 'access-unblocked-reissued',
        revokedBy: uid,
        replacedByPassId: passRef.id,
        revokedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }
  batch.set(passRef, {
    orgId: input.orgId,
    programId,
    programPersonId: input.programPersonId,
    tokenHash: tokenHash(token),
    qrPayload: passQrPayload,
    status: 'issued',
    delivery: { channel: 'manual', status: 'notSent' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  if (sangUserId && programId) {
    const programSnapshot = await db.collection('pePrograms').doc(programId).get()
    batch.set(
      db.collection('users').doc(sangUserId).collection('eventAccess').doc(programId),
      buildSangEventAccessMirror({
        uid: sangUserId,
        programPersonId: input.programPersonId,
        person: {
          ...person,
          rosterStatus: 'active',
          accessStatus: 'active',
          passStatus: 'issued',
          passId: passRef.id,
          eventAccess,
          eventAccessList,
          eventAccessIds: restoredEventAccessIds,
          eventRoleKeys: restoredEventRoleKeys,
        },
        program: programSnapshot.data() || {},
        passId: passRef.id,
        passQrPayload,
        linkStatus: String(person.linkStatus || 'linked'),
        linkMethod: String(person.linkMethod || 'manual'),
      }),
      { merge: true },
    )
  }
  await batch.commit()
  await writeAudit({
    orgId: input.orgId,
    actorUid: uid,
    action: 'programPerson.unblock',
    entityPath: personRef.path,
    metadata: {
      programId,
      previousPassId,
      passId: passRef.id,
      reason,
    },
  })
  return {
    programPersonId: input.programPersonId,
    status: 'active',
    passStatus: 'issued',
    passId: passRef.id,
    qrPayload: passQrPayload,
    revokedPassId: previousPassId,
  }
})

export const issuePassForProgramPerson = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programPersonId: z.string().min(1),
    })
    .parse(request.data)

  const personRef = db.collection('peProgramPeople').doc(input.programPersonId)
  const personSnapshot = await personRef.get()
  if (!personSnapshot.exists) {
    throw new HttpsError('not-found', 'Program person not found.')
  }

  const person = personSnapshot.data()
  if (person?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Program person belongs to another organization.')
  }
  if (personAccessLifecycle(person as Record<string, unknown>) !== 'active') {
    throw new HttpsError('failed-precondition', 'This person is blocked or removed. Add the person again before issuing a new pass.')
  }
  await assertPermission(uid, input.orgId, permissions.passesIssue, {
    programId: String(person.programId || ''),
    eventIds: Array.isArray(person.eventAccessIds) ? person.eventAccessIds : [],
  })

  const token = makeToken()
  const passQrPayload = `SANGPASS1:${token}`
  const passRef = db.collection('pePasses').doc()
  const batch = db.batch()
  const sangUserId = String(person.sangUserId || person.sangUid || '')
  const previousPassId = String(person.passId || '')
  const previousPassRef = previousPassId ? db.collection('pePasses').doc(previousPassId) : null
  const previousPassSnapshot = previousPassRef ? await previousPassRef.get() : null
  if (previousPassSnapshot?.exists && previousPassSnapshot.data()?.status !== 'revoked') {
    batch.set(
      previousPassSnapshot.ref,
      {
        status: 'revoked',
        revokedReason: 'qr-rotated',
        revokedBy: uid,
        replacedByPassId: passRef.id,
        revokedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  batch.set(passRef, {
    orgId: input.orgId,
    programId: person.programId,
    programPersonId: input.programPersonId,
    tokenHash: tokenHash(token),
    qrPayload: passQrPayload,
    status: 'issued',
    delivery: { channel: 'manual', status: 'notSent' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.update(personRef, {
    passId: passRef.id,
    passStatus: 'issued',
    previousPassId,
    passRotatedAt: previousPassId ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  })
  if (sangUserId) {
    const programSnapshot = await db.collection('pePrograms').doc(String(person.programId || '')).get()
    batch.set(
      db.collection('users').doc(sangUserId).collection('eventAccess').doc(String(person.programId || '')),
      buildSangEventAccessMirror({
        uid: sangUserId,
        programPersonId: input.programPersonId,
        person: { ...person, passId: passRef.id, passStatus: 'issued' },
        program: programSnapshot.data() || {},
        passId: passRef.id,
        passQrPayload,
        linkStatus: String(person.linkStatus || 'linked'),
        linkMethod: String(person.linkMethod || 'manual'),
      }),
      { merge: true },
    )
  }
  await batch.commit()
  await writeAudit({
    orgId: input.orgId,
    actorUid: uid,
    action: previousPassId ? 'pass.rotate' : 'pass.issue',
    entityPath: passRef.path,
    metadata: previousPassId ? { previousPassId } : {},
  })
  return { passId: passRef.id, qrPayload: passQrPayload, revokedPassId: previousPassId }
})

export const createScannerSession = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      eventId: z.string().optional().default(''),
      gateName: z.string().optional().default('Main gate'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.checkinScan, {
    programId: input.programId,
    eventId: input.eventId || undefined,
  })
  await assertProgram(input)
  if (input.eventId) {
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId: input.eventId })
  }

  const sessionRef = db.collection('peScannerSessions').doc()
  const sessionToken = makeToken()
  await sessionRef.set({
    orgId: input.orgId,
    programId: input.programId,
    eventId: input.eventId,
    gateName: input.gateName,
    scannerUid: uid,
    sessionTokenHash: tokenHash(sessionToken),
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 12 * 60 * 60 * 1000)),
  })
  return { scannerSessionId: sessionRef.id, scannerToken: sessionToken }
})

export const scanPassToken = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      scannerSessionId: z.string().min(1),
      scannerToken: z.string().min(1),
      payload: z.string().min(10),
      deviceScanId: z.string().optional().default(''),
    })
    .parse(request.data)

  const sessionSnapshot = await db.collection('peScannerSessions').doc(input.scannerSessionId).get()
  const session = sessionSnapshot.data()
  if (!sessionSnapshot.exists || !session || session.status !== 'active' || session.scannerUid !== uid) {
    throw new HttpsError('permission-denied', 'Scanner session is not active.')
  }
  if (session.sessionTokenHash !== tokenHash(input.scannerToken)) {
    throw new HttpsError('permission-denied', 'Invalid scanner token.')
  }
  const expiresAt = dateFromFirestore(session.expiresAt)
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw new HttpsError('permission-denied', 'Scanner session has expired.')
  }

  const token = input.payload.replace('SANGPASS1:', '').trim()
  const passQuery = await db.collection('pePasses').where('tokenHash', '==', tokenHash(token)).limit(1).get()
  if (passQuery.empty) {
    throw new HttpsError('not-found', 'Pass not found.')
  }

  const passSnapshot = passQuery.docs[0]
  const pass = passSnapshot.data()
  if (['revoked', 'expired', 'cancelled', 'blocked'].includes(String(pass.status || ''))) {
    throw new HttpsError('permission-denied', 'This pass is no longer active.')
  }
  if (pass.orgId !== session.orgId || pass.programId !== session.programId) {
    throw new HttpsError('permission-denied', 'Pass is not valid for this scanner session.')
  }
  const personRef = db.collection('peProgramPeople').doc(pass.programPersonId)
  const personSnapshot = await personRef.get()
  const person = personSnapshot.data()
  if (!personSnapshot.exists || person?.orgId !== session.orgId || person?.programId !== session.programId) {
    throw new HttpsError('permission-denied', 'Program person is not valid for this pass.')
  }
  const personData = person as Record<string, unknown>
  if (personAccessLifecycle(personData) !== 'active') {
    throw new HttpsError('permission-denied', 'This person access is not active.')
  }
  let audienceRoleId = ''
  let audienceRoleName = ''
  if (session.eventId) {
    const eventSnapshot = await db.collection('peEvents').doc(session.eventId).get()
    const eventData = eventSnapshot.data()
    const eventAccessMap = personData.eventAccess && typeof personData.eventAccess === 'object'
      ? personData.eventAccess as Record<string, Record<string, unknown>>
      : {}
    const access = eventAccessMap[String(session.eventId)]
    if (!eventSnapshot.exists || eventData?.orgId !== session.orgId || eventData?.programId !== session.programId) {
      throw new HttpsError('permission-denied', 'Scanner event is not valid for this program.')
    }
    if (!access) {
      throw new HttpsError('permission-denied', 'This pass does not have access to this event.')
    }
    if (['blocked', 'cancelled', 'rejected', 'revoked'].includes(String(access?.status || ''))) {
      throw new HttpsError('permission-denied', 'This event access is not active.')
    }
    const roleId = normalizeRoleId(String(access?.roleId || personData.programRoleId || personData.kind || ''))
    audienceRoleId = roleId
    audienceRoleName = String(access?.roleName || personData.programRoleName || personData.kind || roleId)
    const hasAllowedRoleRule = Array.isArray(eventData?.allowedAudienceRoleIds)
    const allowedRoleIds = hasAllowedRoleRule
      ? eventData.allowedAudienceRoleIds.map((roleIdValue: string) => normalizeRoleId(String(roleIdValue)))
      : []
    if (hasAllowedRoleRule && !allowedRoleIds.includes(roleId)) {
      throw new HttpsError('permission-denied', 'This audience role is not allowed for this event gate.')
    }
  } else {
    audienceRoleId = normalizeRoleId(String(personData.programRoleId || personData.kind || ''))
    audienceRoleName = String(personData.programRoleName || personData.kind || audienceRoleId)
  }

  const scanScope = session.eventId || 'program'
  const dedupeRef = db.collection('peCheckInKeys').doc(`${pass.programPersonId}_${scanScope}`)
  const legacyDedupeRef = db.collection('peCheckInKeys').doc(`${passSnapshot.id}_${scanScope}`)
  const [dedupeSnapshot, legacyDedupeSnapshot] = await Promise.all([
    dedupeRef.get(),
    legacyDedupeRef.get(),
  ])
  const result = dedupeSnapshot.exists || legacyDedupeSnapshot.exists ? 'duplicate' : 'approved'
  const checkInRef = input.deviceScanId
    ? db.collection('peCheckIns').doc(input.deviceScanId)
    : db.collection('peCheckIns').doc()
  const existingCheckIn = input.deviceScanId ? await checkInRef.get() : null
  if (existingCheckIn?.exists) {
    const existing = existingCheckIn.data()
    return {
      result: existing?.result || 'duplicate',
      passId: existing?.passId || passSnapshot.id,
      programPersonId: existing?.programPersonId || pass.programPersonId,
    }
  }

  const batch = db.batch()
  batch.create(checkInRef, {
    orgId: pass.orgId,
    programId: pass.programId,
    eventId: session.eventId || '',
    programPersonId: pass.programPersonId,
    passId: passSnapshot.id,
    audienceRoleId,
    audienceRoleName,
    scannerSessionId: input.scannerSessionId,
    scannerUid: uid,
    result,
    createdAt: FieldValue.serverTimestamp(),
  })

  if (result === 'approved') {
    batch.create(dedupeRef, {
      orgId: pass.orgId,
      programId: pass.programId,
      eventId: session.eventId || '',
      programPersonId: pass.programPersonId,
      passId: passSnapshot.id,
      dedupeScope: 'programPerson',
      audienceRoleId,
      audienceRoleName,
      scannerSessionId: input.scannerSessionId,
      createdAt: FieldValue.serverTimestamp(),
    })
    batch.update(passSnapshot.ref, {
      status: 'checkedIn',
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.update(personRef, {
      passStatus: 'checkedIn',
      updatedAt: FieldValue.serverTimestamp(),
    })
    const sangUserId = String(personData.sangUserId || personData.sangUid || '')
    if (sangUserId) {
      batch.set(
        db.collection('users').doc(sangUserId).collection('eventAccess').doc(String(pass.programId || '')),
        {
          passStatus: 'checkedIn',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }
  }

  await batch.commit()
  return { result, passId: passSnapshot.id, programPersonId: pass.programPersonId }
})
