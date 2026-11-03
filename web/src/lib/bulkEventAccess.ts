export type EventAccess = {
  eventId?: string
  eventNameSnapshot?: string
  roleId: string
  roleName: string
  status: 'allowed' | 'registered' | 'blocked' | 'cancelled' | 'rejected' | 'revoked'
}

export type EventAccessGrant = EventAccess & { eventId: string }

// The existing callable replaces the access list, so retain every unselected
// event (including inactive access) when adding or changing selected events.
export function mergeEventAccess(
  person: { eventAccess?: Record<string, EventAccess>; eventAccessList?: EventAccessGrant[] },
  grants: EventAccessGrant[],
): EventAccessGrant[] {
  const existing = person.eventAccess
    ? Object.entries(person.eventAccess).map(([eventId, access]) => ({ ...access, eventId }))
    : person.eventAccessList || []
  const merged = new Map(existing.map((access) => [access.eventId, { ...access }]))
  for (const grant of grants) {
    merged.set(grant.eventId, {
      ...grant,
      status: merged.get(grant.eventId)?.status === 'registered' ? 'registered' : grant.status,
    })
  }
  return Array.from(merged.values())
}

// Keep requests bounded for large rosters; one failed person must not prevent
// the rest from saving. Callers can retain only failures for an explicit retry.
export async function runBulkUpdates<T>(
  items: T[],
  update: (item: T) => Promise<unknown>,
  onProgress: (completed: number) => void,
) {
  const succeeded: T[] = []
  const failed: Array<{ item: T; error: unknown }> = []
  let nextIndex = 0
  let completed = 0
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++]
      try {
        await update(item)
        succeeded.push(item)
      } catch (error) {
        failed.push({ item, error })
      }
      onProgress(++completed)
    }
  }))
  return { succeeded, failed }
}
