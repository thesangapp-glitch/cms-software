import { Link } from 'react-router-dom'

// Wordmark + app icon. Used in the navbar and footer.
export default function Logo({ footer = false }) {
  return (
    <Link to="/" className={`logo${footer ? ' logo--footer' : ''}`} aria-label="Sang home">
      <img src="/logo.png" alt="" width="34" height="34" className="logo__mark" />
      <span className="logo__word">Sang</span>
    </Link>
  )
}
