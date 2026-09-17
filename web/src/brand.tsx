import { useId } from 'react'

/**
 * The Hostwell mark: an "H" whose posts are an entry gate and whose crossbar is a pair of
 * open arms lifted around a guest — hosting, welcome and check-in in one shape.
 */
export function HostwellMark({ size = 32, className, title }: { size?: number; className?: string; title?: string }) {
  const gradientId = useId()
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      height={size}
      role={title ? 'img' : undefined}
      viewBox="0 0 48 48"
      width={size}
    >
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" id={gradientId} x1="6" x2="42" y1="4" y2="44">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect fill={`url(#${gradientId})`} height="48" rx="12" width="48" />
      <rect fill="#fff" height="25" rx="2.6" width="5.2" x="11" y="12" />
      <rect fill="#fff" height="25" rx="2.6" width="5.2" x="31.8" y="12" />
      <path d="M16.2 23.5 C 19.5 30.5, 28.5 30.5, 31.8 23.5" stroke="#fff" strokeLinecap="round" strokeWidth="3.4" />
      <circle cx="24" cy="18.2" fill="#C7D2FE" r="3.7" />
    </svg>
  )
}

export function HostwellLockup({ size = 32, subtitle, className }: { size?: number; subtitle?: string; className?: string }) {
  return (
    <span className={className ? `hostwell-lockup ${className}` : 'hostwell-lockup'}>
      <HostwellMark size={size} />
      <span className="hostwell-lockup-text">
        <strong>Hostwell</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </span>
  )
}
