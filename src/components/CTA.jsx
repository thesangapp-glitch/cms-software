import StoreButtons from './StoreButtons.jsx'

export default function CTA() {
  return (
    <section className="cta">
      <div className="container cta__inner">
        <div className="cta__glow" aria-hidden="true" />
        <h2>Start making smarter, paperless connections</h2>
        <p>Download Sang today and turn every handshake into a saved contact.</p>
        <StoreButtons className="store-buttons--center" />
      </div>
    </section>
  )
}
