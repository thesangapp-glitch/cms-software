const POINTS = [
  {
    title: 'Eco-friendly & paperless',
    text: 'Every share saves paper. Update your card instead of reprinting — the greenest way to network.',
  },
  {
    title: 'Always up to date',
    text: 'Change jobs, numbers or links anytime. Everyone who has your card sees the latest version instantly.',
  },
  {
    title: 'Works everywhere',
    text: 'QR, NFC or a single link — no app required to receive. Access your own card even when you are offline.',
  },
  {
    title: 'Built for teams & events',
    text: 'Capture leads, auto-tag contacts by event, and keep your whole team’s network organized in one place.',
  },
]

export default function WhySang() {
  return (
    <section className="section section--alt why">
      <div className="container why__inner">
        <div className="why__copy">
          <span className="eyebrow">Why choose Sang</span>
          <h2>The easiest, most modern way to make a first impression</h2>
          <p className="why__lead">
            Sang combines the simplicity of a QR and NFC business card with the power of a full
            digital profile — the easiest, most eco-friendly way to share who you are and what you do.
          </p>

          <ul className="why__list">
            {POINTS.map((p) => (
              <li key={p.title}>
                <span className="why__check" aria-hidden="true">✓</span>
                <div>
                  <b>{p.title}</b>
                  <span>{p.text}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="why__stats">
          <div className="stat"><b>0 s</b><span>To share your card</span></div>
          <div className="stat"><b>1 tap</b><span>Saves you to contacts</span></div>
          <div className="stat"><b>No app</b><span>Needed to receive</span></div>
          <div className="stat"><b>100%</b><span>Paperless & free</span></div>
        </div>
      </div>
    </section>
  )
}
