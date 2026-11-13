import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { monthRange } from '../../lib/format';
import type { Profile } from '../../lib/profile';
import { readResume, type ResumeProfile, type ResumeSearch } from '../../lib/resume';
import type { ResumeRow } from '../../lib/types';
import { Shimmer } from '../motion';
import { TagInput, TextArea, TextField } from '../profile/fields';
import { IconArrowLeft, IconBuilding, IconCheck, IconGrad, IconX } from '../Icons';

type Personal = Profile['personal'];

const PERSONAL: [keyof Personal, string, string?][] = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['email', 'Email', 'email'],
  ['phone', 'Phone', 'tel'],
  ['city', 'City'],
  ['state', 'State'],
  ['linkedin', 'LinkedIn', 'url'],
  ['github', 'GitHub', 'url'],
];

/** Step 2: what the agent read, editable. Search parts stay on the resume; profile parts go into the profile. */
export function Customize({ row, busy, onBack, onApply }: {
  row: ResumeRow;
  busy: boolean;
  onBack: () => void;
  onApply: (read: { search: ResumeSearch; profile: ResumeProfile }) => void;
}) {
  const initial = useMemo(() => readResume(row.data), [row.id]);
  const [search, setSearch] = useState<ResumeSearch>(initial.search);
  const [profile, setProfile] = useState<ResumeProfile>(initial.profile);
  const setPersonal = (key: keyof Personal) => (value: string) => setProfile((p) => ({ ...p, personal: { ...p.personal, [key]: value } }));

  return (
    <div className="custom">
      <div className="custom__grid">
        <section className="card custom__card" aria-labelledby="custom-search">
          <h2 className="custom__title" id="custom-search">
            What to look for
          </h2>
          <p className="custom__sub">Used for the job search.</p>
          <div className="custom__fields">
            <TagInput label="Job titles" values={search.titles} onChange={(titles) => setSearch((s) => ({ ...s, titles }))} placeholder="Software Engineer Intern" hint="Press Enter after each" />
            <TagInput label="Cities" values={search.cities} onChange={(cities) => setSearch((s) => ({ ...s, cities }))} placeholder="Tampa, FL" />
            <TagInput label="Countries" values={search.countries} onChange={(countries) => setSearch((s) => ({ ...s, countries }))} placeholder="United States" suggestions={['United States', 'Remote']} />
            <TextArea label="Goals" value={search.goals} onChange={(goals) => setSearch((s) => ({ ...s, goals }))} placeholder="Backend or data internships for summer 2027" rows={3} />
          </div>
        </section>

        <section className="card custom__card" aria-labelledby="custom-profile">
          <h2 className="custom__title" id="custom-profile">
            For your profile
          </h2>
          <p className="custom__sub">Replaces education, experience and skills. Fills empty personal fields only.</p>
          <div className="custom__fields">
            <div className="grid-fields">
              {PERSONAL.map(([key, label, type]) => (
                <TextField key={key} label={label} value={profile.personal[key]} onChange={setPersonal(key)} type={(type as 'email' | 'tel' | 'url' | undefined) ?? 'text'} />
              ))}
            </div>

            <div className="field field--wide">
              <span className="field__label">Education</span>
              <ul className="minilist">
                <AnimatePresence initial={false}>
                  {profile.education.map((ed, i) => (
                    <motion.li key={`${ed.school}-${i}`} className="minilist__item" layout exit={{ opacity: 0, height: 0 }}>
                      <span className="minilist__icon" aria-hidden="true">
                        <IconGrad size={16} />
                      </span>
                      <span className="minilist__text">
                        <strong>{ed.school || 'School'}</strong>
                        <span>{[[ed.degree, ed.field].filter(Boolean).join(', '), monthRange(ed.start, ed.end)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label={`Remove ${ed.school || 'school'}`}
                        onClick={() => setProfile((p) => ({ ...p, education: p.education.filter((_, j) => j !== i) }))}
                      >
                        <IconX size={13} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {profile.education.length === 0 ? <li className="minilist__none">None read</li> : null}
              </ul>
            </div>

            <div className="field field--wide">
              <span className="field__label">Experience</span>
              <ul className="minilist">
                <AnimatePresence initial={false}>
                  {profile.experience.map((ex, i) => (
                    <motion.li key={`${ex.company}-${i}`} className="minilist__item" layout exit={{ opacity: 0, height: 0 }}>
                      <span className="minilist__icon" aria-hidden="true">
                        <IconBuilding size={16} />
                      </span>
                      <span className="minilist__text">
                        <strong>{[ex.title, ex.company].filter(Boolean).join(' at ') || 'Role'}</strong>
                        <span>{[ex.location, monthRange(ex.start, ex.end)].filter(Boolean).join(' · ')}</span>
                      </span>
                      <button
                        type="button"
                        className="icon-btn icon-btn--sm"
                        aria-label={`Remove ${ex.title || 'role'}`}
                        onClick={() => setProfile((p) => ({ ...p, experience: p.experience.filter((_, j) => j !== i) }))}
                      >
                        <IconX size={13} />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {profile.experience.length === 0 ? <li className="minilist__none">None read</li> : null}
              </ul>
            </div>

            <TagInput label="Skills" values={profile.skills} onChange={(skills) => setProfile((p) => ({ ...p, skills }))} placeholder="Python, SQL, React" />
          </div>
        </section>
      </div>

      <div className="custom__foot">
        <button type="button" className="btn btn--ghost" onClick={onBack} disabled={busy}>
          <IconArrowLeft size={15} />
          Back
        </button>
        <button type="button" className="btn btn--brand" onClick={() => onApply({ search, profile })} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <IconCheck size={15} />}
          {busy ? <Shimmer tone="inverse">Saving</Shimmer> : 'Use in my profile'}
        </button>
      </div>
    </div>
  );
}
