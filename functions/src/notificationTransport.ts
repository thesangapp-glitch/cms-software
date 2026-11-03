import { createPrivateKey, sign } from 'node:crypto'
import { connect, type ClientHttp2Stream } from 'node:http2'
import { getMessaging } from 'firebase-admin/messaging'
import { mapNotificationItems } from './notificationAudience'

export type PushDevice = { uid: string; platform: 'android' | 'ios'; token: string }
export type PushMessage = { orgId: string; programId: string; notificationId: string; title: string; body: string }
export type PushResult = { uid: string; accepted: boolean; error?: string; uncertain?: boolean }
export type ApplePushConfig = { keyId: string; teamId: string; privateKey: string; bundleId: string; environment: 'production' | 'sandbox' }

export function readApplePushConfig(raw: string | undefined): ApplePushConfig | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as ApplePushConfig
    if (!value.keyId || !value.teamId || !value.privateKey || !value.bundleId || !['production', 'sandbox'].includes(value.environment)) return null
    const key = createPrivateKey(value.privateKey.replace(/\\n/g, '\n'))
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null
    return value
  } catch { return null }
}

export function programNotificationData(message: PushMessage) {
  return { type: 'event_program_access', orgId: message.orgId, programId: message.programId, notificationId: message.notificationId, url: `sang://events/${message.programId}` }
}

async function sendApple(devices: PushDevice[], message: PushMessage, config: ApplePushConfig, deadline: number): Promise<PushResult[]> {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: config.keyId })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) })).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: config.privateKey.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' }).toString('base64url')
  const session = connect(config.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com')
  // Request error handlers report failures; never log device tokens or credentials.
  session.on('error', () => {})
  const payload = JSON.stringify({ aps: { alert: { title: message.title, body: message.body } }, ...programNotificationData(message) })
  try {
    return await mapNotificationItems(devices, (device) => new Promise<PushResult>((resolve) => {
      if (Date.now() >= deadline) { resolve({ uid: device.uid, accepted: false, error: 'apns/send-deadline' }); return }
      let settled = false
      let request: ClientHttp2Stream | undefined
      // A wall-clock timer also covers connection setup, before stream timeouts
      // become active. Bound all workers to the callable's execution budget.
      const timer = setTimeout(() => {
        finish({ uid: device.uid, accepted: false, uncertain: true, error: 'apns/timeout' })
        request?.close()
      }, Math.min(10000, deadline - Date.now()))
      const finish = (result: PushResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }
      try {
        request = session.request({
          ':method': 'POST', ':path': `/3/device/${device.token}`,
          authorization: `bearer ${header}.${claims}.${signature}`,
          'apns-topic': config.bundleId, 'apns-push-type': 'alert', 'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
          'apns-collapse-id': message.notificationId,
        })
        request.on('response', (headers) => {
          const status = Number(headers[':status'])
          finish({ uid: device.uid, accepted: status === 200, ...(status === 200 ? {} : { error: `apns/${status}` }) })
          request?.resume()
        })
        request.on('error', () => finish({ uid: device.uid, accepted: false, uncertain: true, error: 'apns/connection' }))
        request.on('close', () => finish({ uid: device.uid, accepted: false, uncertain: true, error: 'apns/connection-closed' }))
        request.end(payload)
      } catch { finish({ uid: device.uid, accepted: false, error: 'apns/unavailable' }) }
    }))
  } finally { session.destroy() }
}

export async function sendProgramPush(devices: PushDevice[], message: PushMessage, apple: ApplePushConfig | null): Promise<PushResult[]> {
  const deadline = Date.now() + 240000
  const results: PushResult[] = []
  const android = devices.filter((device) => device.platform === 'android')
  for (let offset = 0; offset < android.length; offset += 500) {
    const batch = android.slice(offset, offset + 500)
    if (Date.now() >= deadline) {
      results.push(...batch.map((device) => ({ uid: device.uid, accepted: false, error: 'fcm/send-deadline' })))
      continue
    }
    try {
      const response = await getMessaging().sendEachForMulticast({
        tokens: batch.map((device) => device.token),
        notification: { title: message.title, body: message.body },
        data: programNotificationData(message),
        android: { priority: 'high', ttl: 86400000, notification: { channelId: 'connections', tag: message.notificationId, color: '#3A5068' } },
      })
      results.push(...response.responses.map((result, index) => ({ uid: batch[index].uid, accepted: result.success, ...(result.error ? { error: result.error.code } : {}) })))
    } catch {
      results.push(...batch.map((device) => ({ uid: device.uid, accepted: false, uncertain: true, error: 'fcm/request-failed' })))
    }
  }
  const ios = devices.filter((device) => device.platform === 'ios')
  if (ios.length > 0) {
    if (!apple) throw new Error('Apple push is not configured.')
    results.push(...await sendApple(ios, message, apple, deadline))
  }
  return results
}
