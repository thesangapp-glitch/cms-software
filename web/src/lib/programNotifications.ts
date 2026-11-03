import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

export type NotificationAudience = {
  mode: 'all' | 'roles' | 'events' | 'people'
  roleIds: string[]
  eventIds: string[]
  eventRoleIds: string[]
  personIds: string[]
}
export type NotificationCounts = {
  matchedPeople: number
  inactivePeople: number
  unlinkedPeople: number
  duplicatePeople: number
  missingAccessUsers: number
  noDeviceUsers: number
  iosUnavailableDevices: number
  unsupportedDevices: number
  eligibleUsers: number
  deviceCount: number
  androidDevices: number
  iosDevices: number
}
export type ProgramNotification = {
  id: string
  title: string
  body: string
  programName: string
  audience: NotificationAudience
  status: 'draft' | 'sending' | 'sent' | 'partial' | 'failed' | 'uncertain'
  counts: NotificationCounts
  result: { acceptedUsers: number; acceptedDevices: number; failedDevices: number; uncertainDevices: number } | null
  createdAt: string
  expiresAt: string
  finishedAt: string
}
export type NotificationInput = { orgId: string; programId: string; title: string; body: string; audience: NotificationAudience }
export const previewProgramNotification = httpsCallable<NotificationInput, ProgramNotification>(functions, 'previewProgramNotification', { timeout: 300000 })
export const sendProgramNotification = httpsCallable<{ orgId: string; programId: string; notificationId: string }, ProgramNotification>(functions, 'sendProgramNotification', { timeout: 300000 })
export const listProgramNotifications = httpsCallable<{ orgId: string; programId: string; notificationId?: string }, { notifications: ProgramNotification[] }>(functions, 'listProgramNotifications')

export function notificationError(error: unknown) {
  const code = String((error as { code?: string })?.code || '')
  if (code === 'functions/not-found' || code === 'functions/unimplemented') return 'Notifications are not available on the server yet. The notification backend needs to be deployed.'
  if (code === 'functions/unavailable') return 'Could not reach the notification service. Check your connection and try again.'
  if (code === 'functions/internal') return 'The notification service could not complete this request. Refresh and try again. If it continues, ask an administrator to check the notification service deployment.'
  return error instanceof Error ? error.message : 'Unable to complete this notification request.'
}

export const notificationStatusLabels: Record<ProgramNotification['status'], string> = {
  draft: 'Ready to review', sending: 'Processing / check status', sent: 'Accepted by push service',
  partial: 'Partially accepted', failed: 'Failed', uncertain: 'Delivery status uncertain',
}
