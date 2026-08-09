import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion'

/** Fade + rise into view once. Honors prefers-reduced-motion. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  as = 'div',
  immediate = false,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'span'
  /** Play on mount instead of on scroll — use for above-the-fold content. */
  immediate?: boolean
}) {
  const reduce = useReducedMotion()
  const MotionTag = motion[as]
  const inViewProps = immediate
    ? { animate: { opacity: 1, y: 0 } }
    : { whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' } }
  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      {...inViewProps}
    >
      {children}
    </MotionTag>
  )
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
}

/** Container that staggers its <Stagger.Item> children into view. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={reduce ? undefined : staggerParent}
      initial={reduce ? false : 'hidden'}
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
    >
      {children}
    </motion.div>
  )
}

Stagger.Item = function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div className={className} variants={reduce ? undefined : staggerChild}>
      {children}
    </motion.div>
  )
}

/** Count up to `value` when scrolled into view. */
export function AnimatedNumber({
  value,
  duration = 1.6,
  format = (n: number) => Math.round(n).toLocaleString('en-IN'),
  className,
}: {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? format(value) : format(0))
  const mv = useMotionValue(0)

  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setDisplay(format(value))
      return
    }
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(format(latest)),
    })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value])

  return (
    <span className={className} ref={ref}>
      {display}
    </span>
  )
}

/** Vertical parallax based on scroll position of the element. */
export function Parallax({
  children,
  distance = 60,
  className,
}: {
  children: ReactNode
  distance?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance])
  const smooth = useSpring(y, { stiffness: 120, damping: 30, mass: 0.4 })
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { y: smooth }}>
      {children}
    </motion.div>
  )
}

export { motion, useReducedMotion }
