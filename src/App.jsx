import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import Privacy from './pages/Privacy.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import CookieConsent from './components/CookieConsent.jsx'
import Analytics from './components/Analytics.jsx'

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Analytics />
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<Privacy />} />
        </Routes>
      </main>
      <Footer />
      <CookieConsent />
    </>
  )
}
