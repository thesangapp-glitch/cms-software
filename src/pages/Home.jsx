import { useEffect } from 'react'
import Hero from '../components/Hero.jsx'
import LogosStrip from '../components/LogosStrip.jsx'
import Features from '../components/Features.jsx'
import HowItWorks from '../components/HowItWorks.jsx'
import UseCases from '../components/UseCases.jsx'
import WhySang from '../components/WhySang.jsx'
import FAQ from '../components/FAQ.jsx'
import CTA from '../components/CTA.jsx'

export default function Home() {
  useEffect(() => {
    document.title =
      'Sang — Free Digital Business Card Maker | Share Contact with QR & NFC'
  }, [])

  return (
    <>
      <Hero />
      <LogosStrip />
      <Features />
      <HowItWorks />
      <UseCases />
      <WhySang />
      <FAQ />
      <CTA />
    </>
  )
}
