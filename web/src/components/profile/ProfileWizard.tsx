import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { ProfileRow } from '../../lib/types';
import { stepVariants } from '../../lib/motion';
import { cleanProfile, mergeProfile, profileProgress, validatePersonal, type Profile } from '../../lib/profile';
import { errorText } from '../../lib/errors';
import { clock } from '../../lib/format';
import { saveProfileRow } from '../../hooks/useAutomationData';
import { Dialog } from '../Dialog';
import { IconArrowLeft, IconArrowRight, IconCheck, IconX } from '../Icons';
import { AuthorizationStep, EducationStep, EeoStep, ExperienceStep, PersonalStep, SkillsStep } from './steps';
import { ReviewStep } from './ReviewStep';

export const STEPS = [
  { title: 'Personal', short: 'Personal' },
  { title: 'Education', short: 'Education' },
  { title: 'Experience', short: 'Experience' },
  { title: 'Skills and preferences', short: 'Skills' },
  { title: 'Work authorization', short: 'Work auth' },
  { title: 'Self-identification', short: 'Identity' },
  { title: 'Review', short: 'Review' },
];
export const REVIEW_STEP = STEPS.length - 1;

export type WizardReason = 'auto' | 'manual' | 'apply';

interface ProfileWizardProps {
  open: boolean;
  /** Changes every time the wizard is opened, so it can jump to `startStep`. */
  openKey: number;
  startStep: number;
  reason: WizardReason;
  row: ProfileRow | null;
  accountEmail: string;
  onClose: () => void;
  onSaved: () => void;
  /** After any successful write, so the page can re-read the row even if realtime is slow. */
  onPersisted: () => void;
  onDraftError: (message: string) => void;
}

type SaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: number } | { state: 'error'; message: string };

const fingerprint = (p: Profile) => JSON.stringify(cleanProfile(p));

/** A draft of a finished profile stays finished while every section is still done: one edit and a close must not send
 * the whole profile back to "incomplete", which reopens the wizard on every load. */
function stillComplete(row: ProfileRow | null, draft: Profile): boolean {
  return row?.completed === true && profileProgress(draft).every((section) => section.done);
}

/** The stored profile, with the account email filled in when the profile has none yet. */
function loadForm(row: ProfileRow | null, email: string): Profile {
  const profile = mergeProfile(row?.data);
  if (!profile.personal.email && email) profile.personal.email = email;
  return profile;
}

export function ProfileWizard(props: ProfileWizardProps) {
  const { open, openKey, startStep, reason, row, accountEmail, onClose, onSaved, onPersisted, onDraftError } = props;
  const [form, setForm] = useState<Profile>(() => loadForm(row, accountEmail));
  const [step, setStep] = useState(startStep);
  const [backToReview, setBackToReview] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [save, setSave] = useState<SaveState>({ state: 'idle' });
  const [finishing, setFinishing] = useState(false);

  // touched: the person has edited since the form was last loaded, so live updates must not replace their work.
  const touched = useRef(false);
  // baseline: what the database holds, to tell whether there is anything new to save.
  const baseline = useRef(row ? fingerprint(mergeProfile(row.data)) : '');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const rowKey = row ? `${row.updated_at}|${JSON.stringify(row.data)}` : '';
  useEffect(() => {
    baseline.current = row ? fingerprint(mergeProfile(row.data)) : '';
    if (!touched.current) setForm(loadForm(row, accountEmail));
    // rowKey stands in for row: same content means nothing to reload.
  }, [rowKey, accountEmail]);

  useEffect(() => {
    if (!open) return;
    setStep(startStep);
    setBackToReview(false);
    setShowErrors(false);
  }, [openKey]);

  useEffect(() => {
    if (!open) return;
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [step, open]);

  const errors = useMemo(() => (showErrors ? validatePersonal(form.personal) : {}), [showErrors, form.personal]);
  const changed = () => fingerprint(form) !== baseline.current;

  function update(change: (draft: Profile) => Profile) {
    touched.current = true;
    setForm(change);
  }

  async function persist(completed: boolean): Promise<boolean> {
    const clean = cleanProfile(form);
    setSave({ state: 'saving' });
    try {
      await saveProfileRow(clean, completed || stillComplete(row, clean));
      baseline.current = JSON.stringify(clean);
      setSave({ state: 'saved', at: Date.now() });
      onPersisted();
      return true;
    } catch (error) {
      setSave({ state: 'error', message: errorText(error) });
      return false;
    }
  }

  function personalOk(): boolean {
    const errs = validatePersonal(form.personal);
    if (Object.keys(errs).length === 0) return true;
    setShowErrors(true);
    if (step !== 0) setStep(0);
    window.setTimeout(() => {
      const invalid = bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      invalid?.focus({ preventScroll: true });
      invalid?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
    return false;
  }

  function goTo(target: number) {
    if (target === step) return;
    if (step === 0 && target > 0 && !personalOk()) return;
    if (changed()) void persist(false);
    setStep(target);
  }

  function editFromReview(target: number) {
    setBackToReview(true);
    setStep(target);
  }

  async function finish() {
    if (!personalOk()) return;
    setFinishing(true);
    const ok = await persist(true);
    setFinishing(false);
    if (ok) {
      touched.current = false;
      onSaved();
    }
  }

  function close() {
    if (touched.current && changed()) {
      void persist(false).then((ok) => {
        if (ok) touched.current = false;
        else onDraftError('It is still here. Open Profile to try again.');
      });
    } else {
      touched.current = false;
    }
    onClose();
  }

  // Which way the steps slide: forward from the right, back from the left.
  const lastStep = useRef(step);
  const direction = useRef(1);
  if (lastStep.current !== step) {
    direction.current = step > lastStep.current ? 1 : -1;
    lastStep.current = step;
  }

  const prefilled = row?.updated_by === 'agent' && !row.completed;
  const isReview = step === REVIEW_STEP;
  const current = STEPS[step];

  return (
    <Dialog open={open} onClose={close} labelledBy="wizard-title" className="wizard">
      <header className="wizard__head">
        <div className="wizard__top">
          <h2 id="wizard-title" className="wizard__title">
            Profile
          </h2>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close profile (your draft is kept)" title="Close (draft is kept)">
            <IconX size={18} />
          </button>
        </div>

        <ol className="wsteps" aria-label="Profile steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`wsteps__item ${i === step ? 'is-current' : i < step ? 'is-done' : ''}`}>
              <button type="button" onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="wsteps__num mono">{i < step ? <IconCheck size={12} /> : i + 1}</span>
                <span className="wsteps__name">{s.short}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="wsteps__mobile mono" aria-hidden="true">
          Step {step + 1} of {STEPS.length}
        </p>
      </header>

      <div className="wizard__body" ref={bodyRef}>
        {reason === 'apply' ? (
          <p className="wbanner wbanner--warn">Finish your profile to apply.</p>
        ) : null}
        {prefilled ? <p className="wbanner">Prefilled from your resume. Check each step.</p> : null}

        <AnimatePresence mode="popLayout" initial={false} custom={direction.current}>
          <motion.div
            key={step}
            className="wizard__stepfx"
            custom={direction.current}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <div className="wizard__step-head">
              <h3 className="wizard__step-title" ref={headingRef} tabIndex={-1} data-autofocus>
                {current.title}
              </h3>
            </div>

            {step === 0 ? <PersonalStep profile={form} update={update} errors={errors} /> : null}
            {step === 1 ? <EducationStep profile={form} update={update} /> : null}
            {step === 2 ? <ExperienceStep profile={form} update={update} /> : null}
            {step === 3 ? <SkillsStep profile={form} update={update} /> : null}
            {step === 4 ? <AuthorizationStep profile={form} update={update} /> : null}
            {step === 5 ? <EeoStep profile={form} update={update} /> : null}
            {isReview ? <ReviewStep profile={form} onEdit={editFromReview} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="wizard__foot">
        <button type="button" className="btn btn--ghost" onClick={() => goTo(step - 1)} disabled={step === 0}>
          <IconArrowLeft size={15} />
          <span className="hide-sm">Back</span>
        </button>

        <span className={`saved saved--${save.state}`} role="status" aria-live="polite">
          {save.state === 'saving'
            ? 'Saving draft'
            : save.state === 'saved'
              ? `Draft saved ${clock(save.at)}`
              : save.state === 'error'
                ? `Not saved: ${save.message}`
                : row?.completed
                  ? 'Profile complete'
                  : ''}
        </span>

        <div className="wizard__next">
          {backToReview && !isReview ? (
            <button type="button" className="btn btn--secondary" onClick={() => goTo(REVIEW_STEP)}>
              Back to review
            </button>
          ) : null}
          {isReview ? (
            <button type="button" className="btn btn--primary" onClick={finish} disabled={finishing}>
              {finishing ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={15} />}
              Save profile
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => goTo(step + 1)}>
              {step === REVIEW_STEP - 1 ? 'Review' : 'Next'}
              <IconArrowRight size={15} />
            </button>
          )}
        </div>
      </footer>
    </Dialog>
  );
}
