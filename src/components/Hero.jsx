import StoreButtons from './StoreButtons.jsx'
import PhoneMockup from './PhoneMockup.jsx'
import { HashLink } from './HashLink.jsx'
import NetworkCanvas from './NetworkCanvas.jsx'
import { useTilt } from '../useTilt.js'

export default function Hero() {
  const tiltRef = useTilt({ max: 10, scale: 1.03 })

  return (
    <section className="hero">
      <NetworkCanvas className="hero__network" />
      <div className="hero__glow" aria-hidden="true" />
      <div className="hero__grid" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="pill pill--glow">✦ Free digital business card maker</span>
          <h1>
            Share who you are in <span className="grad-text">one tap.</span>
          </h1>
          <p className="hero__sub">
            Sang is the smart, paperless way to create a digital business card and share your
            profile instantly with a QR code or NFC tap. Ditch paper business cards and make every
            connection count.
          </p>

          <StoreButtons />

          <div className="hero__meta">
            <div><b>No app</b> to save a vCard</div>
            <div><b>Sang app</b> for full connections</div>
            <div><b>Privacy</b>-first sharing</div>
          </div>

          <HashLink to="/#how" className="hero__scroll">
            See how it works ↓
          </HashLink>
        </div>

        <div className="hero__visual">
          <div ref={tiltRef} className="hero__tilt">
            <div className="hero__orb hero__orb--1" aria-hidden="true" />
            <div className="hero__orb hero__orb--2" aria-hidden="true" />
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  )
}
