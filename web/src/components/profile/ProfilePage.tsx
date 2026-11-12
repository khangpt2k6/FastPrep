import { useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode, type SVGProps } from 'react';
import { motion } from 'motion/react';
import { SPRING } from '../../lib/motion';
import { bulletLines, profileProgress, type Profile } from '../../lib/profile';
import { monthRange } from '../../lib/format';
import type { ProfileRow } from '../../lib/types';
import { Callout } from '../common';
import { IconAlert, IconGithub, IconGlobe, IconLinkedin, IconMail, IconMapPin, IconPencil, IconPhone, IconPlus, IconSpark } from '../Icons';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const TABS = [
  { key: 'personal', title: 'Personal', step: 0 },
  { key: 'education', title: 'Education', step: 1 },
  { key: 'experience', title: 'Experience', step: 2 },
  { key: 'skills', title: 'Skills', step: 3 },
  { key: 'authorization', title: 'Work authorization', step: 4 },
  { key: 'eeo', title: 'Self-identification', step: 5 },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface ProfilePageProps {
  profile: Profile;
  row: ProfileRow | null;
  onEdit: (step: number) => void;
}

function withScheme(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function bare(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/i, '');
}

/** Property rows: a name on the left, the value on the right. */
function Rows({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="props">
      {items.map(([label, value]) => (
        <div className="prop" key={label}>
          <dt className="prop__name">{label}</dt>
          <dd className="prop__value">{value || <span className="muted">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A contact property with an icon; links open in a new tab. */
function Contact({ icon: Icon, label, value, href }: { icon: Icon; label: string; value: string; href?: string }) {
  return (
    <div className="prop">
      <dt className="prop__name">
        <Icon size={15} />
        {label}
      </dt>
      <dd className="prop__value">
        {!value ? (
          <span className="muted">Not set</span>
        ) : href ? (
          <a className="link" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Nothing({ text, onAdd, label }: { text: string; onAdd: () => void; label: string }) {
  return (
    <div className="tabempty">
      <p>{text}</p>
      <button type="button" className="btn btn--secondary btn--sm" onClick={onAdd}>
        <IconPlus size={14} />
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
      <p className="person__name">{name || <span className="muted">No name</span>}</p>
      {p.preferred_name ? <p className="person__pref">Goes by {p.preferred_name}</p> : null}
      <dl className="props">
        <Contact icon={IconMail} label="Email" value={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
        <Contact icon={IconPhone} label="Phone" value={p.phone} href={p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : undefined} />
        <Contact icon={IconMapPin} label="Address" value={address} />
        <Contact icon={IconLinkedin} label="LinkedIn" value={p.linkedin ? bare(p.linkedin) : ''} href={p.linkedin ? withScheme(p.linkedin) : undefined} />
        <Contact icon={IconGithub} label="GitHub" value={p.github ? bare(p.github) : ''} href={p.github ? withScheme(p.github) : undefined} />
        <Contact icon={IconGlobe} label="Website" value={p.website ? bare(p.website) : ''} href={p.website ? withScheme(p.website) : undefined} />
      </dl>
    </div>
  );
}

function TabBody({ tab, profile, onEdit }: { tab: TabKey; profile: Profile; onEdit: (step: number) => void }) {
  const { preferences: pr, authorization: a, eeo: e, extra } = profile;
  switch (tab) {
    case 'personal':
      return <PersonalTab p={profile.personal} />;
    case 'education':
      return profile.education.length === 0 ? (
        <Nothing text="No education yet." label="Add education" onAdd={() => onEdit(1)} />
      ) : (
        <ol className="timeline">
          {profile.education.map((ed, i) => (
            <li className="timeline__item" key={i}>
              <p className="timeline__title">{ed.school || 'School'}</p>
              {ed.degree || ed.field ? <p className="timeline__sub">{[ed.degree, ed.field].filter(Boolean).join(', ')}</p> : null}
              <p className="timeline__date num">{[monthRange(ed.start, ed.end), ed.gpa ? `GPA ${ed.gpa}` : ''].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ol>
      );
    case 'experience':
      return profile.experience.length === 0 ? (
        <Nothing text="No experience yet." label="Add experience" onAdd={() => onEdit(2)} />
      ) : (
        <ol className="timeline">
          {profile.experience.map((ex, i) => {
            const points = bulletLines(ex.description);
            return (
              <li className="timeline__item" key={i}>
                <p className="timeline__title">{ex.title || 'Role'}</p>
                <p className="timeline__sub">{[ex.company, ex.location].filter(Boolean).join(', ')}</p>
                {monthRange(ex.start, ex.end) ? <p className="timeline__date num">{monthRange(ex.start, ex.end)}</p> : null}
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
        </ol>
      );
    case 'skills':
      return (
        <div className="stack">
          {profile.skills.length === 0 ? (
            <Nothing text="No skills yet." label="Add skills" onAdd={() => onEdit(3)} />
          ) : (
            <div className="taglist">
              {profile.skills.map((s) => (
                <span className="tag tag--gray" key={s}>
                  {s}
                </span>
              ))}
            </div>
          )}
          <h3 className="section__label">Job preferences</h3>
          <Rows
            items={[
              ['Roles', pr.desired_roles],
              ['Locations', pr.desired_locations],
              ['Work mode', pr.work_mode],
              ['Relocation', pr.willing_to_relocate],
              ['Start date', pr.earliest_start],
              ['Notice period', pr.notice_period],
              ['Salary', pr.desired_salary],
            ]}
          />
          {extra.how_heard || extra.notes || extra.custom.length > 0 ? (
            <>
              <h3 className="section__label">Other answers</h3>
              <Rows
                items={[
                  ['Referral source', extra.how_heard],
                  ['Notes', extra.notes],
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
            ['US work authorization', a.authorized_us],
            ['Needs sponsorship', a.needs_sponsorship],
            ['Authorization basis', a.authorization_basis],
            ['Visa type', a.visa_type],
          ]}
        />
      );
    case 'eeo':
      return (
        <>
          <p className="tabnote">Voluntary. Used only for optional questions.</p>
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

export function ProfilePage({ profile, row, onEdit }: ProfilePageProps) {
  const [tab, setTab] = useState<TabKey>('personal');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sections = profileProgress(profile);
  const done = sections.filter((s) => s.done).length;
  const complete = row?.completed === true && done === sections.length;
  const prefilled = row?.updated_by === 'agent' && !row?.completed;
  const missing = new Set(sections.filter((s) => !s.done).map((s) => s.step));
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
      {prefilled ? (
        <Callout
          tone="gray"
          icon={<IconSpark size={16} />}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onEdit(0)}>
              Review
            </button>
          }
        >
          Prefilled from your resume.
        </Callout>
      ) : !complete ? (
        <Callout
          tone="yellow"
          icon={<IconAlert size={16} />}
          action={
            <button type="button" className="btn btn--primary btn--sm" onClick={() => onEdit(0)}>
              Finish
            </button>
          }
        >
          Profile incomplete. {done} of {sections.length} sections done.
        </Callout>
      ) : null}

      <div className="tabs viewtabs" role="tablist" aria-label="Profile sections">
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
            className={`viewtab ${tab === t.key ? 'is-on' : ''}`}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <span>{t.title}</span>
            {missing.has(t.step) ? <span className="navdot navdot--orange" title="Incomplete" /> : null}
            {tab === t.key ? <motion.span className="viewtab__bar" layoutId="profile-tab" transition={SPRING} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      <section className="tabpanel" role="tabpanel" id="profile-panel" aria-labelledby={`tab-${current.key}`}>
        <header className="tabpanel__head">
          <h2 className="sr-only">{current.title}</h2>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(current.step)} aria-label={`Edit ${current.title}`}>
            <IconPencil size={14} />
            Edit
          </button>
        </header>
        <TabBody tab={tab} profile={profile} onEdit={onEdit} />
      </section>
    </div>
  );
}
