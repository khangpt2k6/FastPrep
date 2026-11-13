// The profile wizard's steps, in their own module so pages can name the review step without loading the wizard.

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
