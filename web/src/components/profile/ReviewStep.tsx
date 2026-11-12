import type { ReactNode } from 'react';
import type { Profile } from '../../lib/profile';
import { monthRange } from '../../lib/format';

interface ReviewStepProps {
  profile: Profile;
  onEdit: (step: number) => void;
}

function Value({ children }: { children: ReactNode }) {
  const empty = children === '' || children === null || children === undefined || (Array.isArray(children) && children.length === 0);
  return <dd>{empty ? <span className="muted">Not set</span> : children}</dd>;
}

function Block({ title, step, onEdit, children }: { title: string; step: number; onEdit: (step: number) => void; children: ReactNode }) {
  return (
    <section className="rblock">
      <header className="rblock__head">
        <h3 className="rblock__title">{title}</h3>
        <button type="button" className="link-btn" onClick={() => onEdit(step)} aria-label={`Edit ${title}`}>
          Edit
        </button>
      </header>
      {children}
    </section>
  );
}

const range = monthRange;

export function ReviewStep({ profile, onEdit }: ReviewStepProps) {
  const { personal: p, preferences: pr, authorization: a, eeo: e } = profile;
  const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
  const place = [p.address, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ');
  const links = [p.linkedin, p.github, p.website].filter(Boolean);
  const eeoAnswered = [e.gender, e.pronouns, e.race, e.hispanic_latino, e.veteran, e.disability, e.lgbtq].filter(Boolean).length +
    (e.sexual_orientation.length > 0 ? 1 : 0);
  const extras = profile.extra.custom.length + (profile.extra.how_heard ? 1 : 0) + (profile.extra.notes ? 1 : 0);

  return (
    <div className="review">
      <Block title="Personal" step={0} onEdit={onEdit}>
        <dl className="rgrid">
          <dt>Name</dt>
          <Value>{name + (p.preferred_name ? ` (${p.preferred_name})` : '')}</Value>
          <dt>Email</dt>
          <Value>{p.email}</Value>
          <dt>Phone</dt>
          <Value>{p.phone}</Value>
          <dt>Address</dt>
          <Value>{place}</Value>
          <dt>Links</dt>
          <Value>{links.join('  ')}</Value>
        </dl>
      </Block>

      <Block title="Education" step={1} onEdit={onEdit}>
        {profile.education.length === 0 ? (
          <p className="muted rnone">No schools added.</p>
        ) : (
          <ul className="rlist">
            {profile.education.map((ed, i) => (
              <li key={i}>
                <strong>{ed.school || 'School'}</strong>
                <span>{[ed.degree, ed.field].filter(Boolean).join(', ')}</span>
                <span className="mono">{[range(ed.start, ed.end), ed.gpa ? `GPA ${ed.gpa}` : ''].filter(Boolean).join('  ')}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Experience" step={2} onEdit={onEdit}>
        {profile.experience.length === 0 ? (
          <p className="muted rnone">No experience added.</p>
        ) : (
          <ul className="rlist">
            {profile.experience.map((ex, i) => (
              <li key={i}>
                <strong>{[ex.title, ex.company].filter(Boolean).join(' at ') || 'Role'}</strong>
                <span>{ex.location}</span>
                <span className="mono">{range(ex.start, ex.end)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Skills and preferences" step={3} onEdit={onEdit}>
        <dl className="rgrid">
          <dt>Skills</dt>
          <Value>{profile.skills.join(', ')}</Value>
          <dt>Roles</dt>
          <Value>{pr.desired_roles}</Value>
          <dt>Locations</dt>
          <Value>{pr.desired_locations}</Value>
          <dt>Work mode</dt>
          <Value>{[pr.work_mode, pr.willing_to_relocate ? `relocate: ${pr.willing_to_relocate}` : ''].filter(Boolean).join(', ')}</Value>
          <dt>Start, notice</dt>
          <Value>{[pr.earliest_start, pr.notice_period].filter(Boolean).join(', ')}</Value>
          <dt>Salary</dt>
          <Value>{pr.desired_salary}</Value>
          <dt>Extra answers</dt>
          <Value>{extras > 0 ? `${extras} added` : ''}</Value>
        </dl>
      </Block>

      <Block title="Work authorization" step={4} onEdit={onEdit}>
        <dl className="rgrid">
          <dt>Countries</dt>
          <Value>{a.countries.join(', ')}</Value>
          <dt>US citizen</dt>
          <Value>{a.citizen_us}</Value>
          <dt>Authorized (US)</dt>
          <Value>{a.authorized_us}</Value>
          <dt>Sponsorship</dt>
          <Value>{a.needs_sponsorship}</Value>
          <dt>Basis, visa</dt>
          <Value>{[a.authorization_basis, a.visa_type].filter(Boolean).join(', ')}</Value>
        </dl>
      </Block>

      <Block title="Self-identification" step={5} onEdit={onEdit}>
        <p className="rnone">
          <span className="mono">{eeoAnswered}</span> of 8 answered. <span className="muted">Kept private to your forms.</span>
        </p>
      </Block>
    </div>
  );
}
