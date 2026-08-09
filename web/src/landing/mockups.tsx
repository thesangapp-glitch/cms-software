import { BatteryFull, Signal, Wifi } from 'lucide-react'

/** iOS-style status bar for the phone mockups. */
export function StatusBar() {
  return (
    <div className="eos-phone-status">
      <span>9:41</span>
      <span className="eos-status-icons">
        <Signal size={12} /><Wifi size={12} /><BatteryFull size={15} />
      </span>
    </div>
  )
}

/** Decorative QR with three finder patterns. */
export function QrMock() {
  return (
    <div className="eos-qr">
      <span className="eos-qr-finder tl" />
      <span className="eos-qr-finder tr" />
      <span className="eos-qr-finder bl" />
    </div>
  )
}
