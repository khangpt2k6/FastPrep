import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EASE_OUT, SPRING_SOFT } from '../../lib/motion';
import { IconCheck } from '../Icons';
import { Contours } from '../motif';

/** The form fields and the resume piece each one comes from. */
const FIELDS = [
  { label: 'Name', value: 'Alex Rivera' },
  { label: 'Email', value: 'alex.rivera@usf.edu' },
  { label: 'School', value: 'University of South Florida' },
  { label: 'Employer', value: 'Tampa Bay Robotics Lab' },
  { label: 'Skills', value: 'Python, React, SQL' },
];

const STEP_MS = 1150;
/** Steps with every field filled before it starts over. */
const HOLD = 3;
const CYCLE = FIELDS.length + HOLD;

/** The drawing is laid out at this size and scaled to fit its column. */
const W = 520;
const H = 548;

/** Scales a fixed-size drawing to the width it gets. */
function useFit<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / W));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, scale] as const;
}

/**
 * A resume and an application form on a dotted panel: the resume's pieces light up one after another while the form's
 * fields fill in with a check and the progress bar grows. Loops calmly; holds still when motion is reduced or `done`.
 */
export function Illustration({ done = false }: { done?: boolean }) {
  const reduce = useReducedMotion();
  const still = done || Boolean(reduce);
  const [tick, setTick] = useState(0);
  const [ref, scale] = useFit<HTMLDivElement>();

  useEffect(() => {
    if (still) return;
    const timer = window.setInterval(() => setTick((t) => (t + 1) % CYCLE), STEP_MS);
    return () => window.clearInterval(timer);
  }, [still]);

  // At step k the resume's piece k lights up and form field k types in; fields before k are filled.
  const hot = still ? -1 : tick < FIELDS.length ? tick : -1;
  const filled = still ? FIELDS.length : Math.min(tick, FIELDS.length);
  const shown = hot >= 0 ? filled + 1 : filled;
  const pct = Math.round((filled / FIELDS.length) * 100);
  const piece = (i: number) => `illo__piece ${hot === i ? 'is-hot' : ''} ${i < filled ? 'is-read' : ''}`;

  return (
    <div className="illo" ref={ref} style={{ height: H * scale }} aria-hidden="true">
      <Contours className="illo__map" />
      <div className="illo__stage" style={{ width: W, height: H, transform: `scale(${scale})` } as CSSProperties}>
        <div className="illo__resume">
          <div className={piece(0)}>
            <span className="illo__avatar">AR</span>
            <span className="illo__who">
              <span className="illo__name">Alex Rivera</span>
              <span className="illo__role">Computer Science, junior</span>
            </span>
          </div>
          <div className={`${piece(1)} illo__contact`}>alex.rivera@usf.edu · Tampa, FL</div>
          <p className="illo__head">Education</p>
          <div className={piece(2)}>
            <span className="illo__strong">University of South Florida</span>
            <span className="illo__muted">B.S. Computer Science, 2027</span>
          </div>
          <p className="illo__head">Experience</p>
          <div className={piece(3)}>
            <span className="illo__strong">Tampa Bay Robotics Lab</span>
            <span className="illo__bar" style={{ width: '88%' }} />
            <span className="illo__bar" style={{ width: '64%' }} />
          </div>
          <p className="illo__head">Skills</p>
          <div className={`${piece(4)} illo__chips`}>
            <span>Python</span>
            <span>React</span>
            <span>SQL</span>
            <span>Git</span>
          </div>
        </div>

        <div className="illo__form">
          <div className="illo__formhead">
            <span className="illo__formtitle">Application</span>
            <span className="illo__pct num">{pct}%</span>
          </div>
          <div className="illo__progress">
            <motion.span initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
          </div>
          {FIELDS.map((f, i) => {
            const typing = i === hot;
            const on = i < shown;
            return (
              <div key={f.label} className={`illo__field ${typing ? 'is-hot' : ''} ${i < filled ? 'is-done' : ''}`}>
                <span className="illo__label">{f.label}</span>
                <span className="illo__input">
                  <AnimatePresence initial={false}>
                    {on ? (
                      <motion.span
                        key={`${f.label}-${tick < FIELDS.length || still ? 'a' : 'b'}`}
                        className={`illo__value ${typing ? 'is-typing' : ''}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.3 } }}
                      >
                        {f.value}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {i < filled ? (
                      <motion.span
                        className="illo__tick"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1, transition: SPRING_SOFT }}
                        exit={{ scale: 0, opacity: 0, transition: { duration: 0.2 } }}
                      >
                        <IconCheck size={11} strokeWidth={3} />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
              </div>
            );
          })}
          <span className={`illo__submit ${filled === FIELDS.length ? 'is-ready' : ''}`}>Review and send</span>
        </div>
      </div>
    </div>
  );
}
