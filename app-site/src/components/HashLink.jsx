import { useNavigate, useLocation } from 'react-router-dom'

// Link that navigates to a "/#section" target and smooth-scrolls to it,
// even when already on the home page.
export function HashLink({ to, children, onClick, className }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [path, hash] = to.split('#')

  const handleClick = (e) => {
    if (onClick) onClick(e)
    if (!hash) return
    e.preventDefault()
    const scroll = () => {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    if (location.pathname === (path || '/')) {
      scroll()
    } else {
      navigate(path || '/')
      // Wait for the target page to render before scrolling.
      setTimeout(scroll, 60)
    }
  }

  return (
    <a href={to} className={className} onClick={handleClick}>
      {children}
    </a>
  )
}
