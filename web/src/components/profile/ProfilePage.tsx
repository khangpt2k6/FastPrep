import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { SPRING } from '../../lib/motion';
import { AnimatedNumber } from '../motion';
import { bulletLines, profileProgress, type Profile } from '../../lib/profile';
import { monthRange } from '../../lib/format';
import type { ProfileRow } from '../../lib/types';
import {
  IconCheck,
  IconGithub,
  IconGlobe,
  IconLinkedin,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhone,
  IconPlus,
  IconSpark,
} from '../Icons';
import { REVIEW_STEP } from './ProfileWizard';

const TABS = [
  { key: 'personal', title: 'Personal', step: 0 },
  { key: 'education', title: 'Education', step: 1 },
  { key: 'experience', title: 'Work Experience', step: 2 },
  { key: 'skills', title: 'Skills', step: 3 },
  { key: 'authorization', title: 'Work Authorization', step: 4 },
  { key: 'eeo', title: 'Equal Employment', step: 5 },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface ProfilePageProps {
  profile: Profile;
  row: ProfileRow | null;
  email: string;
  onEdit: (step: number) => void;
}

function Chip({ icon, children, href }: { icon: ReactNode; children: string; href?: string }) {
  const body = (
    <>
      <span className="infochip__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="infochip__text">{children}</span>
    </>
  );
  return href ? (
    <a className="infochip" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" title={children}>
      {body}
    </a>
  ) : (
    <span className="infochip" title={children}>
      {body}
    </span>
  );
}

function withScheme(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function Rows({ items }: { items: [string, string][] }) {
  return (
    <dl className="deflist">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || <span className="muted">Not answered</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Nothing({ text, onAdd, label }: { text: string; onAdd: () => void; label: string }) {
  return (
    <div className="tabempty">
      <p>{text}</p>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onAdd}>
        <IconPlus size={15} />
        {label}
      </button>
    </div>
  );
}

function PersonalTab({ p }: { p: Profile['personal'] }) {
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const address = [p.address, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ');
  return (
    <div className="person">
      <p className="person__name">{name || <span className="muted">Your name</span>}</p>
      {p.preferred_name ? <p className="person__pref">Goes by {p.preferred_name}</p> : null}
      <div className="infochips">
        {address ? <Chip icon={<IconMapPin size={15} />}>{address}</Chip> : null}
        {p.email ? (
          <Chip icon={<IconMail size={15} />} href={`mailto:${p.email}`}>
            {p.email}
          </Chip>
        ) : null}
        {p.phone ? (
          <Chip icon={<IconPhone size={15} />} href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>
            {p.phone}
          </Chip>
        ) : null}
        {p.linkedin ? (
          <Chip icon={<IconLinkedin size={15} />} href={withScheme(p.linkedin)}>
            {p.linkedin.replace(/^https?:\/\/(www\.)?/i, '')}
          </Chip>
        ) : null}
        {p.github ? (
          <Chip icon={<IconGithub size={15} />} href={withScheme(p.github)}>
            {p.github.replace(/^https?:\/\/(www\.)?/i, '')}
          </Chip>
        ) : null}
        {p.website ? (
          <Chip icon={<IconGlobe size={15} />} href={withScheme(p.website)}>
            {p.website.replace(/^https?:\/\/(www\.)?/i, '')}
          </Chip>
        ) : null}
      </div>
    </div>
  );
}

function Timeline({ children }: { children: ReactNode }) {
  return <ol className="timeline">{children}</ol>;
}

function TabBody({ tab, profile, onEdit }: { tab: TabKey; profile: Profile; onEdit: (step: number) => void }) {
  const { preferences: pr, authorization: a, eeo: e, extra } = profile;
  switch (tab) {
    case 'personal':
      return <PersonalTab p={profile.personal} />;
    case 'education':
      return profile.education.length === 0 ? (
        <Nothing text="No schools yet." label="Add education" onAdd={() => onEdit(1)} />
      ) : (
        <Timeline>
          {profile.education.map((ed, i) => (
            <li className="timeline__item" key={i}>
              <span className="timeline__dot" aria-hidden="true" />
              {monthRange(ed.start, ed.end) ? <p className="timeline__date mono">{monthRange(ed.start, ed.end)}</p> : null}
              <p className="timeline__title">{ed.school || 'School'}</p>
              {ed.degree || ed.field ? <p className="timeline__sub">{[ed.degree, ed.field].filter(Boolean).join(', ')}</p> : null}
              {ed.gpa ? <p className="timeline__detail">GPA {ed.gpa}</p> : null}
            </li>
          ))}
        </Timeline>
      );
    case 'experience':
      return profile.experience.length === 0 ? (
        <Nothing text="No work experience yet. Internships and projects count." label="Add experience" onAdd={() => onEdit(2)} />
      ) : (
        <Timeline>
          {profile.experience.map((ex, i) => {
            const points = bulletLines(ex.description);
            return (
              <li className="timeline__item" key={i}>
                <span className="timeline__dot" aria-hidden="true" />
                {monthRange(ex.start, ex.end) ? <p className="timeline__date mono">{monthRange(ex.start, ex.end)}</p> : null}
                <p className="timeline__title">{ex.title || 'Role'}</p>
                <p className="timeline__sub">{[ex.company, ex.location].filter(Boolean).join(', ')}</p>
                {points.length > 0 ? (
                  <ul className="timeline__points">
                    {points.map((point, j) => (
                      <li key={j}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </Timeline>
      );
    case 'skills':
      return (
        <div className="stack">
          {profile.skills.length === 0 ? (
            <Nothing text="No skills yet." label="Add skills" onAdd={() => onEdit(3)} />
          ) : (
            <div className="skillchips">
              {profile.skills.map((s) => (
                <span className="skillchip" key={s}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <h3 className="subhead">What you are looking for</h3>
          <Rows
            items={[
              ['Roles', pr.desired_roles],
              ['Locations', pr.desired_locations],
              ['Work mode', pr.work_mode],
              ['Willing to relocate', pr.willing_to_relocate],
              ['Earliest start', pr.earliest_start],
              ['Notice period', pr.notice_period],
              ['Desired salary', pr.desired_salary],
            ]}
          />
          {extra.how_heard || extra.notes || extra.custom.length > 0 ? (
            <>
              <h3 className="subhead">Other answers</h3>
              <Rows
                items={[
                  ['How you heard about jobs', extra.how_heard],
                  ['Notes for the agent', extra.notes],
                  ...extra.custom.map((c): [string, string] => [c.question || 'Question', c.answer]),
                ]}
              />
            </>
          ) : null}
        </div>
      );
    case 'authorization':
      return (
        <Rows
          items={[
            ['Countries', a.countries.join(', ')],
            ['US citizen', a.citizen_us],
            ['Authorized to work in the US', a.authorized_us],
            ['Needs visa sponsorship', a.needs_sponsorship],
            ['Basis of authorization', a.authorization_basis],
            ['Visa type', a.visa_type],
          ]}
        />
      );
    case 'eeo':
      return (
        <>
          <p className="tabnote">Voluntary. Used only for the optional self-identification questions on forms.</p>
          <Rows
            items={[
              ['Gender', e.gender],
              ['Pronouns', e.pronouns],
              ['Race', e.race],
              ['Hispanic or Latino', e.hispanic_latino],
              ['Protected veteran', e.veteran],
              ['Disability', e.disability],
              ['LGBTQ+', e.lgbtq],
              ['Sexual orientation', e.sexual_orientation.join(', ')],
            ]}
          />
        </>
      );
  }
}

export function ProfilePage({ profile, row, email, onEdit }: ProfilePageProps) {
  const [tab, setTab] = useState<TabKey>('personal');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sections = profileProgress(profile);
  const done = sections.filter((s) => s.done).length;
  const complete = row?.completed === true;
  const prefilled = row?.updated_by === 'agent' && !complete;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="page page--profile">
      <div className="profile-main">
        {prefilled ? (
          <div className="notebar">
            <IconSpark size={18} />
            <p>Prefilled from your resume. Check each step, then save.</p>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => onEdit(0)}>
              Review it
            </button>
          </div>
        ) : !complete ? (
          <div className="notebar notebar--todo">
            <IconSpark size={18} />
            <p>Not finished yet. The agent needs your profile before it can apply.</p>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => onEdit(0)}>
              Continue setup
            </button>
          </div>
        ) : null}

        <div className="tabs" role="tablist" aria-label="Profile sections">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls="profile-panel"
              tabIndex={tab === t.key ? 0 : -1}
              className={`tab ${tab === t.key ? 'is-on' : ''}`}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {tab === t.key ? <motion.span className="tab__bar" layoutId="profile-tab" transition={SPRING} aria-hidden="true" /> : null}
              {t.title}
            </button>
          ))}
        </div>

        <section className="card tabpanel" role="tabpanel" id="profile-panel" aria-labelledby={`tab-${current.key}`}>
          <header className="tabpanel__head">
            <h2 className="tabpanel__title">{current.title}</h2>
            <button type="button" className="icon-btn icon-btn--soft" onClick={() => onEdit(current.step)} aria-label={`Edit ${current.title}`}>
              <IconPencil size={17} />
            </button>
          </header>
          <TabBody tab={tab} profile={profile} onEdit={onEdit} />
        </section>
      </div>

      <aside className="profile-side">
        <section className="card progresscard" aria-labelledby="progress-title">
          <div className="progresscard__top">
            {complete ? (
              <span className="donebadge" aria-hidden="true">
                <IconCheck size={18} />
              </span>
            ) : null}
            <div>
              <h2 id="progress-title" className="card__title">
                {complete ? 'Profile complete' : 'Finish your profile'}
              </h2>
              <p className="card__hint">
                <AnimatedNumber id="profile-done" value={done} /> of {sections.length} sections filled
              </p>
            </div>
          </div>
          <div className="progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={sections.length} aria-valuenow={done}>
            <span style={{ width: `${(done / sections.length) * 100}%` }} />
          </div>
          <ul className="checklist">
            {sections.map((s) => (
              <li key={s.title} className={s.done ? 'is-done' : ''}>
                <span className="checklist__mark" aria-hidden="true">
                  {s.done ? <IconCheck size={13} /> : null}
                </span>
                <button type="button" className="checklist__link" onClick={() => onEdit(s.step)}>
                  {s.title}
                </button>
                <span className="sr-only">{s.done ? 'filled' : 'not filled yet'}</span>
              </li>
            ))}
          </ul>
          <button type="button" className={`btn btn--block ${complete ? 'btn--secondary' : 'btn--primary'}`} onClick={() => onEdit(complete ? REVIEW_STEP : 0)}>
            {complete ? 'Review and edit' : 'Continue setup'}
          </button>
          <p className="progresscard__email">Signed in as {email}</p>
        </section>
      </aside>
    </div>
  );
}
