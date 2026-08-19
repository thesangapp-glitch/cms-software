// A stylized phone showing a Sang digital business card + QR code.
// Pure markup/CSS so it stays crisp at any size and adapts to dark mode.
export default function PhoneMockup() {
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone__notch" />
      <div className="phone__screen">
        <div className="card">
          <div className="card__banner">
            <img src="/logo.png" alt="" className="card__logo" width="28" height="28" />
            <span>Sang Card</span>
          </div>
          <div className="card__avatar">AR</div>
          <div className="card__name">Alex Rivera</div>
          <div className="card__role">Founder &amp; CEO · Northwind</div>

          <div className="card__rows">
            <div className="card__row"><span>Email</span><b>alex@northwind.co</b></div>
            <div className="card__row"><span>Phone</span><b>+1 415 555 0132</b></div>
            <div className="card__row"><span>Website</span><b>northwind.co</b></div>
          </div>

          <div className="card__qr">
            <QR />
          </div>
          <div className="card__cta">Add to contacts</div>
        </div>
      </div>
    </div>
  )
}

// Decorative QR grid.
function QR() {
  const cells = []
  // deterministic pattern
  const pattern = [
    1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,
    1,0,0,0,0,0,1,0,0,1,1,0,0,0,0,0,1,
    1,0,1,1,1,0,1,0,1,0,1,0,1,1,1,0,1,
    1,0,1,1,1,0,1,1,0,1,0,0,1,1,1,0,1,
    1,0,1,1,1,0,1,0,1,0,1,0,1,1,1,0,1,
    1,0,0,0,0,0,1,1,0,1,1,0,0,0,0,0,1,
    1,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,1,
    0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,
    1,0,1,1,0,1,1,1,0,1,0,1,1,0,1,0,1,
    0,1,0,0,1,0,0,1,1,0,1,0,0,1,0,1,0,
    1,1,1,0,1,1,1,0,0,1,0,1,1,0,1,1,1,
    0,0,0,0,0,0,1,1,0,1,1,0,1,0,0,1,0,
    1,1,1,1,1,1,1,0,1,0,1,0,1,1,0,1,1,
    1,0,0,0,0,0,1,0,0,1,0,1,0,0,1,0,0,
    1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,
    1,0,1,1,1,0,1,0,1,0,0,0,1,0,0,0,1,
    1,0,0,0,0,0,1,1,0,1,1,0,1,1,1,0,1,
  ]
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i]) cells.push(<rect key={i} x={(i % 17) * 6} y={Math.floor(i / 17) * 6} width="6" height="6" />)
  }
  return (
    <svg viewBox="0 0 102 102" width="100%" height="100%">
      <rect width="102" height="102" fill="#fff" rx="6" />
      <g transform="translate(0,0)" fill="#0f1f4b">{cells}</g>
    </svg>
  )
}
