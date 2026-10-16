import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// The reveal failsafe is not decoration: an earlier build left the whole site
// invisible on phones because the observer never fired.
const FAILSAFE_MS = 1400;

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || reducedMotion()) {
      setInView(true);
      return;
    }

    let revealed = false;
    const show = () => {
      if (revealed) return;
      revealed = true;
      setInView(true);
      observer.disconnect();
    };

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) show();
      },
      { threshold, rootMargin: '0px 0px -6% 0px' }
    );
    observer.observe(el);

    // Safety net for a stalled observer, but only once the element is actually in reach:
    // while it is still far below the fold we keep waiting, so it reveals on scroll
    // instead of fading in unseen.
    let failsafe: number;
    const arm = () => {
      failsafe = window.setTimeout(() => {
        if (revealed) return;
        if (el.getBoundingClientRect().top < window.innerHeight * 1.25) {
          show();
          return;
        }
        arm();
      }, FAILSAFE_MS);
    };
    arm();

    return () => {
      observer.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [threshold]);

  return { ref, inView };
}

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  x?: number;
  scale?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

export function Reveal({ children, delay = 0, y = 22, x = 0, scale = 0.985, duration = 620, className = '', style }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: inView ? 1 : 0,
        transform: inView ? 'translate3d(0,0,0) scale(1)' : `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        transition: `opacity ${duration}ms cubic-bezier(.16,.84,.44,1) ${delay}ms, transform ${duration}ms cubic-bezier(.16,.84,.44,1) ${delay}ms`,
        willChange: inView ? undefined : 'opacity, transform'
      }}
    >
      {children}
    </div>
  );
}

/** Headline words arriving one after another, left to right inside an RTL line. */
export function RevealWords({ text, className = '', style, delay = 0, step = 90 }: { text: string; className?: string; style?: CSSProperties; delay?: number; step?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.3);
  const words = text.split(' ');

  return (
    <span ref={ref} className={className} style={style}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'translate3d(0,0,0)' : 'translate3d(0,60%,0)',
            transition: `opacity 560ms ease-out ${delay + i * step}ms, transform 560ms cubic-bezier(.16,.84,.44,1) ${delay + i * step}ms`
          }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function CountUp({ value, duration = 1100, prefix = '', suffix = '', className = '', style }: { value: number; duration?: number; prefix?: string; suffix?: string; className?: string; style?: CSSProperties }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className} style={style}>
      {prefix}
      {shown.toLocaleString('en-US')}
      {suffix}
    </span>
  );
}

/** Draws an outline icon stroke as it enters the viewport. */
export function DrawIcon({ d, pathLength, className = '', style, strokeWidth = 1.5, delay = 0, duration = 850 }: { d: string; pathLength?: number; className?: string; style?: CSSProperties; strokeWidth?: number; delay?: number; duration?: number }) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(pathLength ?? 200);

  useEffect(() => {
    if (pathLength) return;
    const node = pathRef.current;
    if (!node || typeof node.getTotalLength !== 'function') return;
    const measured = node.getTotalLength();
    if (measured > 0) setLength(Math.ceil(measured));
  }, [pathLength]);

  return (
    <span ref={ref} className={className} style={{ display: 'inline-flex', ...style }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="w-full h-full">
        <path
          ref={pathRef}
          d={d}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: length,
            strokeDashoffset: inView ? 0 : length,
            transition: `stroke-dashoffset ${duration}ms ease-out ${delay}ms`
          }}
        />
      </svg>
    </span>
  );
}

/** Thin gold line under the nav that tracks how far the page is read. */
export function ScrollProgress({ className = '' }: { className?: string }) {
  const [ratio, setRatio] = useState(0);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setRatio(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className={`absolute inset-x-0 bottom-0 h-[2px] overflow-hidden ${className}`} aria-hidden="true">
      <div
        className="h-full bg-amber-500"
        style={{
          width: `${ratio * 100}%`,
          marginInlineStart: 'auto',
          transition: 'width 120ms linear',
          opacity: ratio > 0.005 ? 1 : 0
        }}
      />
    </div>
  );
}
