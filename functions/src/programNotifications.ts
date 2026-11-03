import { createHash } from 'node:crypto'
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  activeNotificationPerson, hasNotificationEventAccess, linkedNotificationUid, mapNotificationItems,
  matchesNotificationAudience, notificationHistorySchema, notificationInputSchema, notificationReferenceSchema,
  type NotificationInput, type NotificationPerson,
} from './notificationAudience'
import { type ApplePushConfig, type PushDevice, type PushMessage, type PushResult } from './notificationTransport'

type Dependencies = {
  db: Firestore
  authorize: (uid: string, orgId: string) => Promise<{ member: Record<string, unknown> }>
  assertProgram: (input: { orgId: string; programId: string }) => Promise<{ program: Record<string, unknown> }>
  assertEvent: (input: { orgId: string; programId: string; eventId: string }) => Promise<unknown>
  appleConfig: () => ApplePushConfig | null
  send: (devices: PushDevice[], message: PushMessage, apple: ApplePushConfig | null) => Promise<PushResult[]>
}

function parseInput<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new HttpsError('invalid-argument', 'Check the message and audience selections.')
  return result.data
}

export function createProgramNotifications(deps: Dependencies) {
  const { db } = deps
  const jobs = (programId: string) => db.collection('pePrograms').doc(programId).collection('notifications')

  async function context(uid: string, orgId: string, programId: string) {
    const { member } = await deps.authorize(uid, orgId)
    const scope = String(member.scope || '')
    if (!['organization', 'program', 'event'].includes(scope) || (scope !== 'organization' && member.programId !== programId)) {
      throw new HttpsError('permission-denied', 'You cannot send notifications for this program.')
    }
    const scopeEventId = scope === 'event' ? String(member.eventId || '') : ''
    if (scope === 'event' && !scopeEventId) throw new HttpsError('permission-denied', 'Your event assignment is missing.')
    const { program } = await deps.assertProgram({ orgId, programId })
    if (program.status === 'archived') throw new HttpsError('failed-precondition', 'This program is archived.')
    return { program, scopeEventId }
  }

  async function resolveAudience(uid: string, input: NotificationInput) {
    const { program, scopeEventId } = await context(uid, input.orgId, input.programId)
    if (input.audience.mode === 'events') {
      for (const eventId of input.audience.eventIds) {
        if (scopeEventId && eventId !== scopeEventId) throw new HttpsError('permission-denied', 'Choose your assigned event only.')
        await deps.assertEvent({ orgId: input.orgId, programId: input.programId, eventId })
      }
    }
    const roster = await db.collection('peProgramPeople').where('orgId', '==', input.orgId).where('programId', '==', input.programId).limit(2001).get()
    if (roster.size > 2000) throw new HttpsError('resource-exhausted', 'This program exceeds the current 2,000-person notification limit.')
    const people = roster.docs.map((snapshot) => ({ ...snapshot.data(), id: snapshot.id }) as NotificationPerson)
    const scopedPeople = people.filter((person) => !scopeEventId || hasNotificationEventAccess(person, scopeEventId))
    if (input.audience.mode === 'people' && input.audience.personIds.some((id) => !scopedPeople.some((person) => person.id === id))) {
      throw new HttpsError('permission-denied', 'Some selected people are outside your program or event access. Select the audience again.')
    }
    const matching = scopedPeople.filter((person) => matchesNotificationAudience(person, input.audience))
    const active = matching.filter(activeNotificationPerson)
    const linked = active.map((person) => ({ person, uid: linkedNotificationUid(person) })).filter((person) => person.uid)
    const userIds = [...new Set(linked.map((person) => person.uid))].sort()
    const apple = deps.appleConfig()
    const counts = {
      matchedPeople: matching.length, inactivePeople: matching.length - active.length,
      unlinkedPeople: active.length - linked.length, duplicatePeople: linked.length - userIds.length,
      missingAccessUsers: 0, noDeviceUsers: 0, iosUnavailableDevices: 0, unsupportedDevices: 0,
      eligibleUsers: 0, deviceCount: 0, androidDevices: 0, iosDevices: 0,
    }
    const devicesByUser = await mapNotificationItems(userIds, async (userId) => {
      const mirror = await db.collection('users').doc(userId).collection('eventAccess').doc(input.programId).get()
      const access = mirror.data()
      if (!access || access.orgId !== input.orgId || access.programId !== input.programId || !activeNotificationPerson(access)
        || (scopeEventId && !hasNotificationEventAccess(access, scopeEventId))
        || (input.audience.mode === 'events' && !input.audience.eventIds.some((eventId) => hasNotificationEventAccess(access, eventId, input.audience.eventRoleIds)))) {
        counts.missingAccessUsers++
        return []
      }
      const snapshots = await db.collection('devices').where('uid', '==', userId).limit(101).get()
      if (snapshots.size > 100) throw new HttpsError('resource-exhausted', 'A recipient has too many registered devices. Contact support before sending.')
      const targets: PushDevice[] = []
      for (const snapshot of snapshots.docs) {
        const device = snapshot.data()
        if (device.active !== true || device.notificationPermission !== 'granted') continue
        const token = typeof device.fcmToken === 'string' ? device.fcmToken.trim() : ''
        if (!token || token.length > 1024) continue
        if (device.platform === 'ios') {
          if (!apple) { counts.iosUnavailableDevices++; continue }
          if (!/^[a-fA-F0-9]{64}$/.test(token)) { counts.unsupportedDevices++; continue }
          targets.push({ uid: userId, platform: 'ios', token })
        } else if (device.platform === 'android') {
          targets.push({ uid: userId, platform: 'android', token })
        } else { counts.unsupportedDevices++ }
      }
      if (targets.length === 0) counts.noDeviceUsers++
      return targets
    })
    const devices = [...new Map(devicesByUser.flat().map((device) => [`${device.platform}:${device.token}`, device])).values()]
      .sort((first, second) => `${first.platform}:${first.token}`.localeCompare(`${second.platform}:${second.token}`))
    if (devices.length > 1000) throw new HttpsError('resource-exhausted', 'Choose a smaller audience: up to 1,000 devices can be notified in one send.')
    counts.eligibleUsers = new Set(devices.map((device) => device.uid)).size
    counts.deviceCount = devices.length
    counts.androidDevices = devices.filter((device) => device.platform === 'android').length
    counts.iosDevices = devices.length - counts.androidDevices
    const fingerprint = createHash('sha256').update(JSON.stringify({ devices, counts, people: active.map((person) => person.id).sort(), scopeEventId })).digest('hex')
    return { counts, fingerprint, devices, apple, scopeEventId, programName: String(program.name || 'Program') }
  }

  function publicJob(id: string, job: Record<string, any>) {
    return {
      id, title: job.title, body: job.body, programName: job.programName, audience: job.audience,
      status: job.status, counts: job.counts, result: job.result || null,
      createdAt: job.createdAt?.toDate?.().toISOString() || '', expiresAt: job.expiresAt?.toDate?.().toISOString() || '',
      finishedAt: job.finishedAt?.toDate?.().toISOString() || '',
    }
  }

  async function recoverInterruptedSend(ref: DocumentReference, job: Record<string, any>) {
    const interrupted = (value: Record<string, any>) => value.status === 'sending'
      && value.startedAt?.toMillis?.() < Date.now() - 10 * 60 * 1000
    if (!interrupted(job)) return job
    // A callable runs for at most five minutes. After ten minutes, an unfinished
    // claim is ambiguous, never safe to retry. Let the UI leave its pending state.
    await db.runTransaction(async (transaction) => {
      const current = (await transaction.get(ref)).data()
      if (current && interrupted(current)) transaction.update(ref, { status: 'uncertain', finishedAt: FieldValue.serverTimestamp() })
    })
    return (await ref.get()).data() || job
  }

  async function preview(uid: string, raw: unknown) {
    const input = parseInput(notificationInputSchema, raw)
    const resolved = await resolveAudience(uid, input)
    const ref = jobs(input.programId).doc()
    const job = {
      ...input, createdBy: uid, programName: resolved.programName, scopeEventId: resolved.scopeEventId,
      status: 'draft', counts: resolved.counts, fingerprint: resolved.fingerprint,
      createdAt: Timestamp.now(), expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
    }
    await ref.create(job)
    return publicJob(ref.id, job)
  }

  async function send(uid: string, raw: unknown) {
    const input = parseInput(notificationReferenceSchema, raw)
    await context(uid, input.orgId, input.programId)
    const ref = jobs(input.programId).doc(input.notificationId)
    const original = (await ref.get()).data()
    if (!original || original.orgId !== input.orgId || original.createdBy !== uid) throw new HttpsError('permission-denied', 'This notification preview is not yours.')
    // Once claimed, a request is never sent again, including after a timeout.
    if (original.status !== 'draft') return publicJob(ref.id, await recoverInterruptedSend(ref, original))
    if (original.expiresAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'The preview expired. Review the audience again.')
    const message = parseInput(notificationInputSchema, original)
    const resolved = await resolveAudience(uid, message)
    if (resolved.fingerprint !== original.fingerprint) throw new HttpsError('failed-precondition', 'The audience or device availability changed. Review a fresh preview before sending.')
    if (resolved.devices.length === 0) throw new HttpsError('failed-precondition', 'No selected people can currently receive this notification.')
    const auditRef = db.collection('peAuditLogs').doc()
    const claimed = await db.runTransaction(async (transaction) => {
      const current = (await transaction.get(ref)).data()
      if (!current || current.status !== 'draft') return false
      if (current.expiresAt.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'The preview expired. Review it again.')
      transaction.update(ref, { status: 'sending', startedAt: FieldValue.serverTimestamp() })
      transaction.create(auditRef, { orgId: input.orgId, actorUid: uid, action: 'programNotification.send', entityPath: ref.path, metadata: { programId: input.programId, notificationId: ref.id, eligibleUsers: resolved.counts.eligibleUsers, deviceCount: resolved.devices.length }, createdAt: FieldValue.serverTimestamp() })
      return true
    })
    if (!claimed) return publicJob(ref.id, (await ref.get()).data() || original)
    let results: PushResult[]
    try {
      results = await deps.send(resolved.devices, { ...message, notificationId: ref.id }, resolved.apple)
    } catch {
      // Providers may have accepted messages before a transport failure. Do not
      // automatically retry the job or claim that zero devices received it.
      await ref.update({ status: 'uncertain', finishedAt: FieldValue.serverTimestamp() })
      return publicJob(ref.id, (await ref.get()).data() || original)
    }
    const accepted = results.filter((result) => result.accepted)
    const result = {
      acceptedDevices: accepted.length, acceptedUsers: new Set(accepted.map((item) => item.uid)).size,
      failedDevices: results.filter((item) => !item.accepted && !item.uncertain).length,
      uncertainDevices: results.filter((item) => item.uncertain).length,
    }
    const status = result.uncertainDevices ? 'uncertain' : result.failedDevices ? (accepted.length ? 'partial' : 'failed') : 'sent'
    await ref.update({ status, result, finishedAt: FieldValue.serverTimestamp() })
    return publicJob(ref.id, (await ref.get()).data() || original)
  }

  async function history(uid: string, raw: unknown) {
    const input = parseInput(notificationHistorySchema, raw)
    const { scopeEventId } = await context(uid, input.orgId, input.programId)
    if (input.notificationId) {
      const job = (await jobs(input.programId).doc(input.notificationId).get()).data()
      if (!job || job.orgId !== input.orgId || (scopeEventId && job.createdBy !== uid)) throw new HttpsError('permission-denied', 'This notification is not available.')
      return { notifications: [publicJob(input.notificationId, await recoverInterruptedSend(jobs(input.programId).doc(input.notificationId), job))] }
    }
    // Draft previews do not have startedAt, so they cannot crowd sent items out.
    const snapshots = await jobs(input.programId).orderBy('startedAt', 'desc').limit(50).get()
    const visible = snapshots.docs.filter((snapshot) => snapshot.data().orgId === input.orgId && (!scopeEventId || snapshot.data().createdBy === uid)).slice(0, 20)
    return { notifications: await mapNotificationItems(visible, async (snapshot) => publicJob(snapshot.id, await recoverInterruptedSend(jobs(input.programId).doc(snapshot.id), snapshot.data()))) }
  }

  return { preview, send, history }
}
