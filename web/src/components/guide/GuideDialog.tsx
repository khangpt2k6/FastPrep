// How the platform works, step by step: a numbered workflow along the top, a screenshot of each step, one line about it.
// The screenshots come from the page's own preview with made-up data (public/guide/), so they show no one's real jobs.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Dialog } from '../Dialog';
import { IconCheck, IconInfo, IconX } from '../Icons';
import './guide.css';

interface Step {
  key: string;
  title: string;
  text: string;
  image: string;
}

export const GUIDE_STEPS: Step[] = [
  { key: 'setup', title: 'Set up', text: 'Drop your resume. The agent reads it.', image: '/guide/setup.webp' },
  { key: 'jobs', title: 'Find', text: 'Find more pulls new internships and scores them.', image: '/guide/jobs.webp' },
  { key: 'pick', title: 'Pick', text: 'Tick jobs, then write letters or apply.', image: '/guide/pick.webp' },
  { key: 'track', title: 'Track', text: 'Every application and reply, in one list.', image: '/guide/track.webp' },
  { key: 'automation', title: 'Automation', text: 'Ask Claude Code or Codex. It runs on this PC.', image: '/guide/automation.webp' },
  { key: 'agent', title: 'Billing', text: 'Engine, budget, and what it went on.', image: '/guide/agent.webp' },
];

export function GuideDialog({ open, onClose, start = 'setup' }: { open: boolean; onClose: () => void; start?: string }) {
  const first = Math.max(0, GUIDE_STEPS.findIndex((s) => s.key === start));
  const [at, setAt] = useState(first);
  const last = GUIDE_STEPS.length - 1;

  useEffect(() => {
    if (open) setAt(first);
  }, [open, first]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setAt((a) => Math.min(last, a + 1));
      if (event.key === 'ArrowLeft') setAt((a) => Math.max(0, a - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, last]);

  const step = GUIDE_STEPS[at];
  return (
    <Dialog open={open} onClose={onClose} labelledBy="guide-title" className="guide">
      <header className="guide__head">
        <h2 id="guide-title">How it works</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close guide" title="Close" data-autofocus>
          <IconX size={18} />
        </button>
      </header>
      <ol className="guide__flow" aria-label="Steps" style={{ ['--done' as string]: at / last }}>
        {GUIDE_STEPS.map((s, i) => (
          <li key={s.key} className={`guide__node ${i === at ? 'is-on' : ''} ${i < at ? 'is-done' : ''}`}>
            <button type="button" onClick={() => setAt(i)} aria-current={i === at ? 'step' : undefined}>
              <span className="guide__num num">{i < at ? <IconCheck size={13} /> : i + 1}</span>
              <span className="guide__name">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="guide__stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.figure
            key={step.key}
            className="guide__shot"
            initial={{ opacity: 0, x: 28, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -28, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <img src={step.image} alt={`${step.title}: ${step.text}`} />
            <figcaption>
              <strong>{step.title}</strong>
              {step.text}
            </figcaption>
          </motion.figure>
        </AnimatePresence>
      </div>
      <footer className="guide__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAt((a) => Math.max(0, a - 1))} disabled={at === 0}>
          Back
        </button>
        <span className="guide__pos num">
          {at + 1} / {GUIDE_STEPS.length}
        </span>
        {at < last ? (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setAt((a) => Math.min(last, a + 1))}>
            Next
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>
            Done
          </button>
        )}
      </footer>
    </Dialog>
  );
}

/** A Guide button that opens the guide from its first step. */
export function GuideButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`icon-btn ${className}`} onClick={() => setOpen(true)} aria-label="Guide" title="Guide">
        <IconInfo size={17} />
      </button>
      <GuideDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
