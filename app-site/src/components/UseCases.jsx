const USERS = [
  { emoji: '🚀', label: 'Founders' },
  { emoji: '💼', label: 'Sales teams' },
  { emoji: '🎨', label: 'Creators' },
  { emoji: '🎓', label: 'Students' },
  { emoji: '🏠', label: 'Real estate agents' },
  { emoji: '🧑‍💻', label: 'Freelancers' },
  { emoji: '🤝', label: 'Recruiters & HR' },
  { emoji: '💰', label: 'Investors' },
  { emoji: '📅', label: 'Event organizers' },
  { emoji: '🧭', label: 'Consultants' },
]

export default function UseCases() {
  return (
    <section id="use-cases" className="section">
      <div className="container">
        <div className="section__head">
          <span className="eyebrow">Who uses Sang</span>
          <h2>Loved by professionals who network</h2>
          <p>Startup founders, sales pros, creators, students, recruiters and investors all use Sang to connect smarter.</p>
        </div>

        <div className="chips">
          {USERS.map((u) => (
            <span key={u.label} className="chip">
              <span className="chip__emoji">{u.emoji}</span>
              {u.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
