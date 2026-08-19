// A trust strip of networking moments Sang is built for.
const MOMENTS = ['Conferences', 'Trade shows', 'Career fairs', 'Hackathons', 'Meetups', 'Investor meetings']

export default function LogosStrip() {
  return (
    <section className="strip">
      <div className="container">
        <p className="strip__label">Built for every networking moment</p>
        <div className="strip__items">
          {MOMENTS.map((m) => (
            <span key={m} className="strip__item">{m}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
