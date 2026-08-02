import { useState } from 'react'

const FAQS = [
  {
    q: 'What is Sang?',
    a: 'Sang is a free digital business card maker that lets you build a customizable virtual business card holding your contact info, social links and portfolio, then share it instantly with a QR code scan, NFC tap, or a single link.',
  },
  {
    q: 'Is Sang really free?',
    a: 'Yes. Sang is a free digital business card maker — you can create your card and share it at no cost. Download it and start making paperless connections today.',
  },
  {
    q: 'Does the person receiving my card need the app?',
    a: 'No. Anyone can receive your Sang card with just a QR scan, NFC tap, or link — no app required. Your contact details save straight to their phone as a vCard.',
  },
  {
    q: 'How does NFC tap sharing work?',
    a: 'With a compatible NFC tag or device, another person simply taps their phone to instantly open your digital business card — no scanning or typing required.',
  },
  {
    q: 'Can I control what information I share?',
    a: 'Absolutely. Sang is privacy-first: you control exactly what information appears on your card and can update it anytime. Everyone who has your card sees the latest version instantly.',
  },
  {
    q: 'Is Sang good for teams and events?',
    a: 'Yes. Sang is a networking app built for teams and events. Capture leads, auto-tag contacts by the event where you met them, and keep your whole team’s network organized.',
  },
  {
    q: 'Which devices does Sang support?',
    a: 'Sang works on both iOS and Android. You can also access your own card offline, so you are always ready to share, even without a connection.',
  },
]

function Item({ item, open, onToggle }) {
  return (
    <div className={`faq__item${open ? ' faq__item--open' : ''}`}>
      <button className="faq__q" onClick={onToggle} aria-expanded={open}>
        <span>{item.q}</span>
        <span className="faq__icon" aria-hidden="true">{open ? '–' : '+'}</span>
      </button>
      <div className="faq__a" role="region">
        <p>{item.a}</p>
      </div>
    </div>
  )
}

export default function FAQ() {
  const [open, setOpen] = useState(0)
  return (
    <section id="faq" className="section">
      <div className="container container--narrow">
        <div className="section__head">
          <span className="eyebrow">FAQ</span>
          <h2>Frequently asked questions</h2>
          <p>Everything you need to know about your Sang digital business card.</p>
        </div>

        <div className="faq">
          {FAQS.map((item, i) => (
            <Item key={item.q} item={item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </div>
      </div>
    </section>
  )
}
