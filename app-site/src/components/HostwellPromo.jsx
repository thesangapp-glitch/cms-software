import { LINKS } from '../site.js'

const POINTS = [
  'Create programs and events in minutes',
  'Import guests and issue QR passes',
  'Check people in at the gate',
  'Passes appear straight in the Sang app',
]

function HostwellMark({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hostwell-promo-grad" x1="6" x2="42" y1="4" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#hostwell-promo-grad)" />
      <rect x="11" y="12" width="5.2" height="25" rx="2.6" fill="#fff" />
      <rect x="31.8" y="12" width="5.2" height="25" rx="2.6" fill="#fff" />
      <path d="M16.2 23.5C19.5 30.5 28.5 30.5 31.8 23.5" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="24" cy="18.2" r="3.7" fill="#C7D2FE" />
    </svg>
  )
}

// Cross-promotes Hostwell, the organizer workspace whose passes land in Sang.
export default function HostwellPromo() {
  return (
    <section id="hostwell" className="section hostwell">
      <div className="container hostwell__inner">
        <div className="hostwell__brand">
          <HostwellMark size={64} />
          <div>
            <b>Hostwell</b>
            <span>by the Sang team</span>
          </div>
        </div>
        <div className="hostwell__copy">
          <span className="eyebrow">For event organizers</span>
          <h2>Running an event? Meet Hostwell.</h2>
          <p>
            Hostwell is the event workspace for fests, conferences and meetups. Your guests get their
            passes, schedule and networking right inside Sang.
          </p>
          <ul className="hostwell__list">
            {POINTS.map((point) => (
              <li key={point}><span aria-hidden="true">✓</span>{point}</li>
            ))}
          </ul>
          <div className="hostwell__actions">
            <a className="btn btn--primary" href={LINKS.hostwell} target="_blank" rel="noopener">
              Open Hostwell
            </a>
            <a className="hostwell__url" href={LINKS.hostwell} target="_blank" rel="noopener">
              events.sangapp.in ↗
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
