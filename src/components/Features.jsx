const FEATURES = [
  {
    icon: 'qr',
    title: 'Instant QR & NFC sharing',
    text: 'Share your card in seconds with a QR code scan or NFC tap. No app required for the person receiving it.',
  },
  {
    icon: 'card',
    title: 'Customizable digital card',
    text: 'Build a virtual business card with your contact info, social links, portfolio and more — styled your way.',
  },
  {
    icon: 'vcard',
    title: 'One-tap save to contacts',
    text: 'Your details save straight to their phone as a vCard. One tap, no typing, no lost paper cards.',
  },
  {
    icon: 'lead',
    title: 'Lead capture & auto-tags',
    text: 'Capture leads and auto-tag every contact by event, so your team never loses track of a connection.',
  },
  {
    icon: 'scan',
    title: 'Built-in business card scanner',
    text: 'Scan paper cards and other QR codes to save new contacts directly into your network.',
  },
  {
    icon: 'shield',
    title: 'Privacy & offline access',
    text: 'You control exactly what you share, access your card offline, and manage every contact with full control.',
  },
]

function Icon({ name }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (name) {
    case 'qr':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/></svg>
    case 'card':
      return <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></svg>
    case 'vcard':
      return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
    case 'lead':
      return <svg {...common}><path d="M20 6 9 17l-5-5"/></svg>
    case 'scan':
      return <svg {...common}><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M3 12h18"/></svg>
    case 'shield':
      return <svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
    default:
      return null
  }
}

export default function Features() {
  return (
    <section id="features" className="section">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">Features</span>
          <h2>Everything you need to network smarter</h2>
          <p>Sang combines the simplicity of a QR and NFC business card with the power of a full digital profile.</p>
        </div>

        <div className="grid grid--3">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <div className="feature__icon"><Icon name={f.icon} /></div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
