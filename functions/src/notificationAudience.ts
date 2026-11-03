import { z } from 'zod'

const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,128}$/)
const ids = z.array(id).max(2000).default([]).transform((values) => [...new Set(values)].sort())
export const notificationAudienceSchema = z.object({
  mode: z.enum(['all', 'roles', 'events', 'people']),
  roleIds: ids,
  eventIds: ids,
  eventRoleIds: ids,
  personIds: ids,
}).superRefine((audience, context) => {
  const required = audience.mode === 'roles' ? audience.roleIds : audience.mode === 'events' ? audience.eventIds : audience.mode === 'people' ? audience.personIds : null
  if (required && required.length === 0) context.addIssue({ code: 'custom', message: 'Choose at least one audience option.' })
})
export const notificationInputSchema = z.object({
  orgId: id,
  programId: id,
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(500),
  audience: notificationAudienceSchema,
})
export const notificationReferenceSchema = z.object({ orgId: id, programId: id, notificationId: id })
export const notificationHistorySchema = z.object({ orgId: id, programId: id, notificationId: id.optional() })
export type NotificationInput = z.infer<typeof notificationInputSchema>
export type NotificationAudience = z.infer<typeof notificationAudienceSchema>
export type NotificationPerson = Record<string, unknown> & { id: string }

export function activeNotificationPerson(person: Record<string, unknown>) {
  return !['blocked', 'removed', 'revoked', 'cancelled'].includes(String(person.accessStatus || person.rosterStatus || 'active'))
}

export function notificationEventAccess(person: Record<string, unknown>) {
  const map = person.eventAccess
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    return Object.entries(map as Record<string, Record<string, unknown>>).map(([eventId, entry]) => ({ ...entry, eventId }))
  }
  return Array.isArray(person.eventAccessList) ? person.eventAccessList as Array<Record<string, unknown>> : []
}

export function hasNotificationEventAccess(person: Record<string, unknown>, eventId: string, roles: string[] = []) {
  return notificationEventAccess(person).some((entry) => entry.eventId === eventId
    && ['allowed', 'registered'].includes(String(entry.status || 'allowed'))
    && (roles.length === 0 || roles.includes(String(entry.roleId || ''))))
}

export function matchesNotificationAudience(person: NotificationPerson, audience: NotificationAudience) {
  switch (audience.mode) {
    case 'all': return true
    case 'roles': return audience.roleIds.includes(String(person.programRoleId || person.kind || ''))
    case 'people': return audience.personIds.includes(person.id)
    case 'events': return audience.eventIds.some((eventId) => hasNotificationEventAccess(person, eventId, audience.eventRoleIds))
  }
}

export function linkedNotificationUid(person: Record<string, unknown>) {
  if (person.linkStatus !== 'linked' && person.sangAppStatus !== 'linked' && person.sangAppLinked !== true) return ''
  const uid = String(person.sangUserId || person.sangUid || person.sangAppUserId || '').trim()
  return uid && !uid.includes('/') ? uid : ''
}

export async function mapNotificationItems<T, R>(items: T[], action: (item: T) => Promise<R>, concurrency = 8): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await action(items[index])
    }
  }))
  return results
}
