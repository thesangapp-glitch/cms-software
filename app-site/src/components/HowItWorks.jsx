import Reveal from './Reveal.jsx'

const STEPS = [
  {
    n: '01',
    title: 'Create your card',
    text: 'Build a customizable digital business card with your contact info, social links and portfolio — free, in minutes.',
  },
  {
    n: '02',
    title: 'Share instantly',
    text: 'Show your QR code, tap an NFC tag, or send a single link. The person receiving it needs no app at all.',
  },
  {
    n: '03',
    title: 'Save the connection',
    text: 'Your details save to their phone as a vCard instantly. When you both use the Sang app, it becomes a full two-way connection — capture leads and auto-tag contacts by the event you met at.',
  },
  {
    n: '04',
    title: 'Update anytime',
    text: 'Change your card whenever you like — everyone who has it sees the latest version instantly. No reprinting, no waste.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how" className="section section--alt">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">How it works</span>
          <h2>From hello to saved contact in seconds</h2>
          <p>No paper, no friction. Just a modern, memorable way to exchange contact info.</p>
        </div>

        <div className="steps">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 90} className="step tilt3d">
              <div className="step__n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
