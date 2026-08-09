import { useEffect } from 'react'
import './landing.css'
import { Navbar } from './Navbar'
import { Hero } from './Hero'
import { Ecosystem } from './Ecosystem'
import { Workflow } from './Workflow'
import { Security } from './Security'
import { Pricing } from './Pricing'
import { Footer } from './Footer'

/**
 * EventOS marketing site. `onSignIn` routes into the existing SANG AuthPage —
 * this component never renders its own authentication UI.
 */
export function LandingPage({ onSignIn }: { onSignIn: () => void }) {
  useEffect(() => {
    document.title = 'EventOS — The Operating System for Live Events'
    const html = document.documentElement
    const prevScroll = html.style.scrollBehavior
    const prevBg = html.style.background
    html.style.scrollBehavior = 'smooth'
    html.style.background = '#05070d'
    document.body.classList.add('eos-body')
    return () => {
      html.style.scrollBehavior = prevScroll
      html.style.background = prevBg
      document.body.classList.remove('eos-body')
    }
  }, [])

  function explore() {
    document.getElementById('platform')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="eos">
      <Navbar onSignIn={onSignIn} onGetStarted={onSignIn} />
      <main>
        <Hero onGetStarted={onSignIn} onExplore={explore} />
        <Ecosystem />
        <Workflow />
        <Security />
        <Pricing onGetStarted={onSignIn} onTalkToSales={onSignIn} />
      </main>
      <Footer />
    </div>
  )
}
