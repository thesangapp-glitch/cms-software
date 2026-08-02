import StoreButtons from './StoreButtons.jsx'
import PhoneMockup from './PhoneMockup.jsx'
import { HashLink } from './HashLink.jsx'

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
          <span className="pill">✦ Free digital business card maker</span>
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
            <div><b>No app</b> needed to receive</div>
            <div><b>One-tap</b> save to contacts</div>
            <div><b>Privacy</b>-first sharing</div>
          </div>

          <HashLink to="/#how" className="hero__scroll">
            See how it works ↓
          </HashLink>
        </div>

        <div className="hero__visual">
          <PhoneMockup />
        </div>
      </div>
    </section>
  )
}
