import { randomBytes, createHash } from 'crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { z } from 'zod'

initializeApp()

const db = getFirestore()
const region = 'us-central1'
const callableOptions = { region, invoker: 'public' as const }

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
    description: 'Full organization control',
    permissions: Object.values(permissions).concat(['program.read', 'analytics.read', 'exports.create']),
    isDefault: true,
  },
  {
    id: 'event-lead',
    name: 'Event Lead',
    description: 'Manage programs, events, people, passes, and analytics',
    permissions: ['program.read', permissions.programWrite, permissions.eventWrite, permissions.teamWrite, permissions.peopleImport, permissions.passesIssue, permissions.checkinScan, 'analytics.read', 'exports.create'],
    isDefault: true,
  },
  {
    id: 'gate-staff',
    name: 'Gate Staff',
    description: 'Scan passes and view limited attendee context',
    permissions: ['program.read', permissions.checkinScan],
    isDefault: true,
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: 'View dashboards and export reports',
    permissions: ['program.read', 'analytics.read', 'exports.create'],
    isDefault: true,
  },
]

const eventProfileSchema = z.object({
  id: z.string().optional().default(''),
  name: z.string().min(1),
  role: z.string().optional().default('Profile'),
  organization: z.string().optional().default(''),
  bio: z.string().optional().default(''),
  photoUrl: z.string().optional().default(''),
})

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

async function assertPermission(uid: string, orgId: string, requiredPermission: string) {
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

  return { memberId: memberSnapshot.docs[0].id, member }
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
  await assertPermission(uid, input.orgId, 'program.read')
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
      description: z.string().optional().default(''),
      permissions: z.array(z.string()).min(1),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.rolesWrite)
  const rolePath = `peOrganizations/${input.orgId}/roles/${input.roleId}`
  await db.doc(rolePath).set(
    {
      orgId: input.orgId,
      name: input.name.trim(),
      description: input.description.trim(),
      permissions: input.permissions,
      isDefault: false,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'role.upsert', entityPath: rolePath })
  return { roleId: input.roleId }
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
  const memberRef = db.collection('peTeamMembers').doc()
  await memberRef.set({
    ...input,
    email: normalizeEmail(input.email),
    status: 'invited',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'team.invite', entityPath: memberRef.path, metadata: { email: input.email } })
  return { teamMemberId: memberRef.id }
})

export const createProgram = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      name: z.string().min(2),
      mode: z.enum(['standalone', 'multiEvent']),
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
      timezone: z.string().optional().default('Asia/Kolkata'),
      description: z.string().optional().default(''),
      entryScope: z.enum(['program', 'event', 'both']).optional().default('program'),
      competitive: z.boolean().optional().default(false),
      resultsEnabled: z.boolean().optional().default(false),
      joinQrEnabled: z.boolean().optional().default(true),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite)
  const programRef = db.collection('pePrograms').doc()
  const batch = db.batch()

  batch.set(programRef, {
    ...input,
    status: 'draft',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(db.collection('peProgramContent').doc(programRef.id), {
    orgId: input.orgId,
    programId: programRef.id,
    schedule: [],
    infoSections: [],
    fieldDefinitions: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

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
      timezone: z.string().optional().default('Asia/Kolkata'),
      description: z.string().optional().default(''),
      entryScope: z.enum(['program', 'event', 'both']).optional().default('program'),
      competitive: z.boolean().optional().default(false),
      resultsEnabled: z.boolean().optional().default(false),
      joinQrEnabled: z.boolean().optional().default(true),
      status: z.enum(['draft', 'live', 'archived']).optional().default('draft'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite)
  const { programRef } = await assertProgram(input)
  await programRef.set(
    {
      ...input,
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

  await assertPermission(uid, input.orgId, permissions.programWrite)
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

export const createEvent = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      name: z.string().min(2),
      eventType: z.string().optional().default('session'),
      startDateTime: z.string().optional().default(''),
      endDateTime: z.string().optional().default(''),
      multiDate: z.boolean().optional().default(false),
      venueName: z.string().optional().default(''),
      locationNote: z.string().optional().default(''),
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
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite)
  await assertProgram(input)
  const eventRef = db.collection('peEvents').doc()
  await eventRef.set({
    ...input,
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
      startDateTime: z.string().optional().default(''),
      endDateTime: z.string().optional().default(''),
      multiDate: z.boolean().optional().default(false),
      venueName: z.string().optional().default(''),
      locationNote: z.string().optional().default(''),
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
      status: z.enum(['draft', 'live', 'completed']).optional().default('draft'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite)
  const { eventRef } = await assertEvent(input)

  await eventRef.set(
    {
      ...input,
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

  await assertPermission(uid, input.orgId, permissions.eventWrite)
  const eventRef = db.collection('peEvents').doc(input.eventId)
  const eventSnapshot = await eventRef.get()
  if (!eventSnapshot.exists) {
    return { eventId: input.eventId }
  }
  if (eventSnapshot.data()?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Event does not belong to this organization.')
  }

  await eventRef.delete()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'event.delete', entityPath: eventRef.path })
  return { eventId: input.eventId }
})

export const createScheduleItem = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
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
      venueName: z.string().optional().default(''),
      roomName: z.string().optional().default(''),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      visibility: z.enum(['public', 'staffOnly', 'participantsOnly']).optional().default('public'),
      status: z.enum(['draft', 'scheduled', 'delayed', 'cancelled', 'completed']).optional().default('scheduled'),
      sortOrder: z.number().optional().default(0),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite)
  await assertProgram(input)
  if (input.eventId) {
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId: input.eventId })
  }

  const scheduleRef = db.collection('peEventScheduleItems').doc()
  const batch = db.batch()
  batch.set(scheduleRef, {
    ...input,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  if (input.eventId) {
    batch.set(
      db.collection('peEvents').doc(input.eventId),
      {
        scheduleItemCount: FieldValue.increment(1),
        nextScheduleTitle: input.title.trim(),
        nextScheduleAt: input.startsAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }
  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'schedule.create', entityPath: scheduleRef.path })
  return { scheduleItemId: scheduleRef.id }
})

export const updateScheduleItem = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      scheduleItemId: z.string().min(1),
      programId: z.string().min(1),
      eventId: z.string().optional().default(''),
      title: z.string().min(2),
      type: z.enum(['session', 'round', 'break', 'checkin', 'performance', 'result', 'ceremony', 'custom']).optional().default('session'),
      customTypeLabel: z.string().optional().default(''),
      description: z.string().optional().default(''),
      startsAt: z.string().min(1),
      endsAt: z.string().optional().default(''),
      timezone: z.string().optional().default('Asia/Kolkata'),
      venueName: z.string().optional().default(''),
      roomName: z.string().optional().default(''),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      visibility: z.enum(['public', 'staffOnly', 'participantsOnly']).optional().default('public'),
      status: z.enum(['draft', 'scheduled', 'delayed', 'cancelled', 'completed']).optional().default('scheduled'),
      sortOrder: z.number().optional().default(0),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.eventWrite)
  const scheduleRef = db.collection('peEventScheduleItems').doc(input.scheduleItemId)
  const scheduleSnapshot = await scheduleRef.get()
  if (!scheduleSnapshot.exists) {
    throw new HttpsError('not-found', 'Schedule item not found.')
  }
  if (scheduleSnapshot.data()?.orgId !== input.orgId || scheduleSnapshot.data()?.programId !== input.programId) {
    throw new HttpsError('permission-denied', 'Schedule item does not belong to this program.')
  }
  await scheduleRef.set(
    {
      ...input,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
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

  await assertPermission(uid, input.orgId, permissions.eventWrite)
  const scheduleRef = db.collection('peEventScheduleItems').doc(input.scheduleItemId)
  const scheduleSnapshot = await scheduleRef.get()
  if (!scheduleSnapshot.exists) {
    return { scheduleItemId: input.scheduleItemId }
  }
  if (scheduleSnapshot.data()?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Schedule item does not belong to this organization.')
  }
  await scheduleRef.delete()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'schedule.delete', entityPath: scheduleRef.path })
  return { scheduleItemId: input.scheduleItemId }
})

export const createProgramJoinLink = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programId: z.string().min(1),
      mode: z.enum(['direct_join', 'request_approval', 'invite_only']).optional().default('request_approval'),
      allowedCategory: z.enum(['attendee', 'participant', 'speaker', 'staff', 'custom']).optional().default('attendee'),
      customAllowedCategory: z.string().optional().default(''),
      allowedEventIds: z.array(z.string()).optional().default([]),
      maxUses: z.number().int().positive().optional().default(5000),
      expiresAt: z.string().optional().default(''),
      campaignName: z.string().optional().default('Main program QR'),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.programWrite)
  await assertProgram(input)
  for (const eventId of input.allowedEventIds) {
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId })
  }
  const token = makeToken()
  const joinRef = db.collection('peProgramJoinLinks').doc()
  await joinRef.set({
    ...input,
    tokenHash: tokenHash(token),
    usedCount: 0,
    status: 'active',
    qrPayload: `SANGPROGRAM1:${token}`,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'programJoinLink.create', entityPath: joinRef.path })
  return { joinLinkId: joinRef.id, qrPayload: `SANGPROGRAM1:${token}` }
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
      kind: z.enum(['attendee', 'participant', 'speaker', 'staff']),
      company: z.string().optional().default(''),
      designation: z.string().optional().default(''),
      eventIds: z.array(z.string()).optional().default([]),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.peopleImport)
  await assertPermission(uid, input.orgId, permissions.passesIssue)
  await assertProgram(input)
  for (const eventId of input.eventIds) {
    await assertEvent({ orgId: input.orgId, programId: input.programId, eventId })
  }

  const personRef = db.collection('peProgramPeople').doc()
  const passRef = db.collection('pePasses').doc()
  const token = makeToken()
  const batch = db.batch()

  batch.set(personRef, {
    orgId: input.orgId,
    programId: input.programId,
    fullName: input.fullName.trim(),
    email: normalizeEmail(input.email),
    phone: input.phone.trim(),
    kind: input.kind,
    company: input.company.trim(),
    designation: input.designation.trim(),
    passId: passRef.id,
    passStatus: 'issued',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  for (const eventId of input.eventIds) {
    batch.set(personRef.collection('events').doc(eventId), {
      orgId: input.orgId,
      programId: input.programId,
      eventId,
      status: 'registered',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  batch.set(passRef, {
    orgId: input.orgId,
    programId: input.programId,
    programPersonId: personRef.id,
    tokenHash: tokenHash(token),
    qrPayload: `SANGPASS1:${token}`,
    status: 'issued',
    delivery: { channel: 'manual', status: 'notSent' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'programPerson.createWithPass', entityPath: personRef.path })
  return { programPersonId: personRef.id, passId: passRef.id, qrPayload: `SANGPASS1:${token}` }
})

export const issuePassForProgramPerson = onCall(callableOptions, async (request) => {
  const uid = requireUid(request)
  const input = z
    .object({
      orgId: z.string().min(1),
      programPersonId: z.string().min(1),
    })
    .parse(request.data)

  await assertPermission(uid, input.orgId, permissions.passesIssue)
  const personRef = db.collection('peProgramPeople').doc(input.programPersonId)
  const personSnapshot = await personRef.get()
  if (!personSnapshot.exists) {
    throw new HttpsError('not-found', 'Program person not found.')
  }

  const person = personSnapshot.data()
  if (person?.orgId !== input.orgId) {
    throw new HttpsError('permission-denied', 'Program person belongs to another organization.')
  }

  const token = makeToken()
  const passRef = db.collection('pePasses').doc()
  const batch = db.batch()

  batch.set(passRef, {
    orgId: input.orgId,
    programId: person.programId,
    programPersonId: input.programPersonId,
    tokenHash: tokenHash(token),
    qrPayload: `SANGPASS1:${token}`,
    status: 'issued',
    delivery: { channel: 'manual', status: 'notSent' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.update(personRef, {
    passId: passRef.id,
    passStatus: 'issued',
    updatedAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()
  await writeAudit({ orgId: input.orgId, actorUid: uid, action: 'pass.issue', entityPath: passRef.path })
  return { passId: passRef.id, qrPayload: `SANGPASS1:${token}` }
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

  await assertPermission(uid, input.orgId, permissions.checkinScan)
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
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
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
  if (pass.orgId !== session.orgId || pass.programId !== session.programId) {
    throw new HttpsError('permission-denied', 'Pass is not valid for this scanner session.')
  }
  if (session.eventId) {
    const accessSnapshot = await db
      .collection('peProgramPeople')
      .doc(pass.programPersonId)
      .collection('events')
      .doc(session.eventId)
      .get()
    const access = accessSnapshot.data()
    if (!accessSnapshot.exists || access?.orgId !== session.orgId || access?.programId !== session.programId) {
      throw new HttpsError('permission-denied', 'This pass does not have access to this event.')
    }
    if (['blocked', 'cancelled', 'rejected', 'revoked'].includes(String(access?.status || ''))) {
      throw new HttpsError('permission-denied', 'This event access is not active.')
    }
  }

  const scanScope = session.eventId || 'program'
  const dedupeRef = db.collection('peCheckInKeys').doc(`${passSnapshot.id}_${scanScope}`)
  const dedupeSnapshot = await dedupeRef.get()
  const result = dedupeSnapshot.exists ? 'duplicate' : 'approved'
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
      scannerSessionId: input.scannerSessionId,
      createdAt: FieldValue.serverTimestamp(),
    })
    batch.update(passSnapshot.ref, {
      status: 'checkedIn',
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.update(db.collection('peProgramPeople').doc(pass.programPersonId), {
      passStatus: 'checkedIn',
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
  return { result, passId: passSnapshot.id, programPersonId: pass.programPersonId }
})
