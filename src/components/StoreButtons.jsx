import { LINKS } from '../site.js'

// App Store + Google Play badges rendered as inline SVG so there are no
// external image dependencies.
export default function StoreButtons({ className = '' }) {
  return (
    <div className={`store-buttons ${className}`}>
      <a className="store-btn" href={LINKS.appStore} target="_blank" rel="noopener" aria-label="Download on the App Store">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.5 1.3c.1 1-.3 2-.9 2.7-.7.8-1.7 1.4-2.7 1.3-.1-1 .3-2 .9-2.6.7-.8 1.8-1.4 2.7-1.4zM19.9 17c-.5 1.2-.8 1.7-1.4 2.7-.9 1.4-2.2 3.1-3.8 3.1-1.4 0-1.8-.9-3.7-.9s-2.4.9-3.7.9c-1.6 0-2.8-1.5-3.7-2.9C1.2 16.9.9 12.3 2.5 9.9c1-1.6 2.6-2.5 4.1-2.5 1.6 0 2.6 1 3.9 1 1.3 0 2-1 3.9-1 1.4 0 2.9.8 3.9 2.1-3.4 1.9-2.9 6.8 1.6 7.5z" />
        </svg>
        <span>
          <small>Download on the</small>
          <strong>App Store</strong>
        </span>
      </a>
      <a className="store-btn" href={LINKS.playStore} target="_blank" rel="noopener" aria-label="Get it on Google Play">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#00d3ff" d="M3.6 2.3 13.5 12 3.6 21.7c-.4-.2-.6-.6-.6-1.1V3.4c0-.5.2-.9.6-1.1z" />
          <path fill="#00e676" d="M13.5 12 3.6 2.3c.1 0 .2-.1.4-.1.3 0 .6.1.9.3l11 6.3-2.4 3.2z" />
          <path fill="#ffea00" d="m16.4 8.8 3.1 1.8c.9.5.9 1.8 0 2.3l-3.1 1.8-2.9-2.7 2.9-3.2z" />
          <path fill="#ff3d00" d="M13.5 12l2.9 2.7-11 6.3c-.3.2-.6.3-.9.3-.1 0-.3 0-.4-.1L13.5 12z" />
        </svg>
        <span>
          <small>Get it on</small>
          <strong>Google Play</strong>
        </span>
      </a>
    </div>
  )
}
