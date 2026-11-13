import { OPTIONS, emptyEducation, emptyExperience, type PersonalErrors, type Profile } from '../../lib/profile';
import { IconPlus, IconX } from '../Icons';
import { MonthRange, MultiChoice, Section, Segmented, SelectField, TagInput, TextArea, TextField } from './fields';

export interface StepProps {
  profile: Profile;
  update: (change: (draft: Profile) => Profile) => void;
}

type Personal = Profile['personal'];

export function PersonalStep({ profile, update, errors }: StepProps & { errors: PersonalErrors }) {
  const p = profile.personal;
  const set = (key: keyof Personal) => (value: string) => update((d) => ({ ...d, personal: { ...d.personal, [key]: value } }));
  return (
    <>
      <Section title="Contact">
        <TextField label="First name" value={p.first_name} onChange={set('first_name')} placeholder="Jane" autoComplete="given-name" required error={errors.first_name} />
        <TextField label="Last name" value={p.last_name} onChange={set('last_name')} placeholder="Doe" autoComplete="family-name" required error={errors.last_name} />
        <TextField label="Preferred name" value={p.preferred_name} onChange={set('preferred_name')} placeholder="Optional" autoComplete="nickname" />
        <TextField label="Email" type="email" value={p.email} onChange={set('email')} placeholder="jane@example.com" autoComplete="email" required error={errors.email} />
        <TextField label="Phone" type="tel" value={p.phone} onChange={set('phone')} placeholder="+1 555 123 4567" autoComplete="tel" required error={errors.phone} />
      </Section>
      <Section title="Address">
        <TextField label="Street address" value={p.address} onChange={set('address')} placeholder="123 Main St, Apt 4" autoComplete="street-address" wide />
        <TextField label="City" value={p.city} onChange={set('city')} placeholder="Springfield" autoComplete="address-level2" />
        <TextField label="State" value={p.state} onChange={set('state')} placeholder="CA" autoComplete="address-level1" />
        <TextField label="Postal code" value={p.zip} onChange={set('zip')} placeholder="90210" autoComplete="postal-code" />
        <TextField label="Country" value={p.country} onChange={set('country')} placeholder="United States" autoComplete="country-name" />
      </Section>
      <Section title="Links">
        <TextField label="LinkedIn" type="url" value={p.linkedin} onChange={set('linkedin')} placeholder="https://linkedin.com/in/janedoe" />
        <TextField label="GitHub" type="url" value={p.github} onChange={set('github')} placeholder="https://github.com/janedoe" />
        <TextField label="Website" type="url" value={p.website} onChange={set('website')} placeholder="https://janedoe.dev" />
      </Section>
    </>
  );
}

function CardHead({ title, onRemove, label }: { title: string; onRemove: () => void; label: string }) {
  return (
    <div className="wcard__head">
      <span className="wcard__title">{title}</span>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove} aria-label={label}>
        <IconX size={14} />
        Remove
      </button>
    </div>
  );
}

export function EducationStep({ profile, update }: StepProps) {
  const list = profile.education;
  const patch = (i: number, change: Partial<Profile['education'][number]>) =>
    update((d) => ({ ...d, education: d.education.map((e, j) => (j === i ? { ...e, ...change } : e)) }));
  const add = () => update((d) => ({ ...d, education: [...d.education, emptyEducation()] }));
  return (
    <div className="wlist">
      {list.length === 0 ? <p className="wempty">No education yet.</p> : null}
      {list.map((e, i) => (
        <section className="wcard" key={i} aria-label={`School ${i + 1}`}>
          <CardHead
            title={e.school || `School ${i + 1}`}
            label={`Remove ${e.school || `school ${i + 1}`}`}
            onRemove={() => update((d) => ({ ...d, education: d.education.filter((_, j) => j !== i) }))}
          />
          <div className="grid-fields">
            <TextField label="School" value={e.school} onChange={(v) => patch(i, { school: v })} placeholder="State University" wide />
            <TextField label="Degree" value={e.degree} onChange={(v) => patch(i, { degree: v })} placeholder="Bachelor of Science" />
            <TextField label="Field" value={e.field} onChange={(v) => patch(i, { field: v })} placeholder="Computer Science" />
            <TextField label="GPA" value={e.gpa} onChange={(v) => patch(i, { gpa: v })} placeholder="3.7" />
            <MonthRange start={e.start} end={e.end} onChange={(start, end) => patch(i, { start, end })} presentLabel="Current" />
          </div>
        </section>
      ))}
      <button type="button" className="btn btn--secondary add-btn" onClick={add}>
        <IconPlus size={15} />
        Add education
      </button>
    </div>
  );
}

export function ExperienceStep({ profile, update }: StepProps) {
  const list = profile.experience;
  const patch = (i: number, change: Partial<Profile['experience'][number]>) =>
    update((d) => ({ ...d, experience: d.experience.map((e, j) => (j === i ? { ...e, ...change } : e)) }));
  const add = () => update((d) => ({ ...d, experience: [...d.experience, emptyExperience()] }));
  return (
    <div className="wlist">
      {list.length === 0 ? <p className="wempty">No experience yet.</p> : null}
      {list.map((e, i) => (
        <section className="wcard" key={i} aria-label={`Experience ${i + 1}`}>
          <CardHead
            title={[e.title, e.company].filter(Boolean).join(' at ') || `Experience ${i + 1}`}
            label={`Remove experience ${i + 1}`}
            onRemove={() => update((d) => ({ ...d, experience: d.experience.filter((_, j) => j !== i) }))}
          />
          <div className="grid-fields">
            <TextField label="Company" value={e.company} onChange={(v) => patch(i, { company: v })} placeholder="Acme Corp" />
            <TextField label="Title" value={e.title} onChange={(v) => patch(i, { title: v })} placeholder="Software Engineer Intern" />
            <TextField label="Location" value={e.location} onChange={(v) => patch(i, { location: v })} placeholder="Remote" />
            <MonthRange start={e.start} end={e.end} onChange={(start, end) => patch(i, { start, end })} presentLabel="Current" />
            <TextArea
              label="Highlights"
              value={e.description}
              onChange={(v) => patch(i, { description: v })}
              placeholder={'Built a dashboard used by 40 people\nCut report time from 2 hours to 10 minutes'}
              hint="One per line"
              rows={4}
            />
          </div>
        </section>
      ))}
      <button type="button" className="btn btn--secondary add-btn" onClick={add}>
        <IconPlus size={15} />
        Add experience
      </button>
    </div>
  );
}

export function SkillsStep({ profile, update }: StepProps) {
  const pr = profile.preferences;
  const setPref = <K extends keyof Profile['preferences']>(key: K) => (value: Profile['preferences'][K]) =>
    update((d) => ({ ...d, preferences: { ...d.preferences, [key]: value } }));
  const ex = profile.extra;
  const setCustom = (i: number, change: Partial<Profile['extra']['custom'][number]>) =>
    update((d) => ({ ...d, extra: { ...d.extra, custom: d.extra.custom.map((c, j) => (j === i ? { ...c, ...change } : c)) } }));
  return (
    <>
      <Section title="Skills">
        <TagInput
          label="Skills"
          values={profile.skills}
          onChange={(skills) => update((d) => ({ ...d, skills }))}
          placeholder="Python, SQL, React..."
          hint="Press Enter after each"
        />
      </Section>
      <Section title="Job preferences">
        <TextField label="Roles" value={pr.desired_roles} onChange={setPref('desired_roles')} placeholder="Data analyst, Software engineer" wide />
        <TextField label="Locations" value={pr.desired_locations} onChange={setPref('desired_locations')} placeholder="New York, Remote" wide />
        <Segmented label="Work mode" value={pr.work_mode} options={OPTIONS.workMode} onChange={setPref('work_mode')} />
        <Segmented label="Relocation" value={pr.willing_to_relocate} options={OPTIONS.yesNo} onChange={setPref('willing_to_relocate')} />
        <TextField label="Start date" value={pr.earliest_start} onChange={setPref('earliest_start')} placeholder="Immediately, or 2026-06" />
        <TextField label="Notice period" value={pr.notice_period} onChange={setPref('notice_period')} placeholder="2 weeks" />
        <TextField label="Salary" value={pr.desired_salary} onChange={setPref('desired_salary')} placeholder="85,000 USD per year" />
      </Section>
      <Section title="Other" aside="Optional">
        <TextField
          label="Referral source"
          value={ex.how_heard}
          onChange={(v) => update((d) => ({ ...d, extra: { ...d.extra, how_heard: v } }))}
          placeholder="Company website"
          wide
        />
        <TextArea
          label="Notes"
          value={ex.notes}
          onChange={(v) => update((d) => ({ ...d, extra: { ...d.extra, notes: v } }))}
          placeholder="Anything the agent should know"
          rows={3}
        />
        <div className="field field--wide">
          <span className="field__label">Custom answers</span>
          <div className="qa">
            {ex.custom.map((c, i) => (
              <div className="qa__row" key={i}>
                <input
                  className="input"
                  value={c.question}
                  placeholder="Question"
                  aria-label={`Question ${i + 1}`}
                  onChange={(e) => setCustom(i, { question: e.target.value })}
                />
                <input
                  className="input"
                  value={c.answer}
                  placeholder="Answer"
                  aria-label={`Answer ${i + 1}`}
                  onChange={(e) => setCustom(i, { answer: e.target.value })}
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove question ${i + 1}`}
                  onClick={() => update((d) => ({ ...d, extra: { ...d.extra, custom: d.extra.custom.filter((_, j) => j !== i) } }))}
                >
                  <IconX size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="pill-btn"
              onClick={() => update((d) => ({ ...d, extra: { ...d.extra, custom: [...d.extra.custom, { question: '', answer: '' }] } }))}
            >
              <IconPlus size={13} />
              Add answer
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}

export function AuthorizationStep({ profile, update }: StepProps) {
  const a = profile.authorization;
  const set = <K extends keyof Profile['authorization']>(key: K) => (value: Profile['authorization'][K]) =>
    update((d) => ({ ...d, authorization: { ...d.authorization, [key]: value } }));
  const b = profile.background;
  const setBackground = <K extends keyof Profile['background']>(key: K) => (value: Profile['background'][K]) =>
    update((d) => ({ ...d, background: { ...d.background, [key]: value } }));
  return (
    <>
      <Section title="Countries">
        <TagInput
          label="Countries"
          values={a.countries}
          onChange={set('countries')}
          placeholder="Add a country"
          suggestions={['United States']}
        />
      </Section>
      <Section title="United States">
        <Segmented label="US citizen" value={a.citizen_us} options={OPTIONS.yesNo} onChange={set('citizen_us')} wide />
        <Segmented label="US work authorization" value={a.authorized_us} options={OPTIONS.yesNo} onChange={set('authorized_us')} wide />
        <Segmented
          label="Needs sponsorship"
          value={a.needs_sponsorship}
          options={OPTIONS.yesNo}
          onChange={set('needs_sponsorship')}
          wide
        />
        <SelectField label="Authorization basis" value={a.authorization_basis} options={OPTIONS.basis} onChange={set('authorization_basis')} />
        <TextField label="Visa type" value={a.visa_type} onChange={set('visa_type')} placeholder="F-1 OPT" list="visa-options" />
        <datalist id="visa-options">
          {OPTIONS.visa.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </Section>
      <Section title="Background">
        <SelectField label="Security clearance" value={b.security_clearance} options={OPTIONS.clearance} onChange={setBackground('security_clearance')} />
        <Segmented label="Foreign government ties" value={b.foreign_government_ties} options={OPTIONS.yesNo} onChange={setBackground('foreign_government_ties')} wide />
        <Segmented label="Criminal conviction" value={b.criminal_conviction} options={OPTIONS.yesNo} onChange={setBackground('criminal_conviction')} wide />
        <Segmented label="Let go or asked to resign" value={b.let_go_or_resigned} options={OPTIONS.yesNo} onChange={setBackground('let_go_or_resigned')} wide />
      </Section>
    </>
  );
}

export function EeoStep({ profile, update }: StepProps) {
  const e = profile.eeo;
  const set = <K extends keyof Profile['eeo']>(key: K) => (value: Profile['eeo'][K]) =>
    update((d) => ({ ...d, eeo: { ...d.eeo, [key]: value } }));
  return (
    <>
      <p className="wintro">Optional.</p>
      <Section title="Identity">
        <Segmented label="Gender" value={e.gender} options={OPTIONS.gender} onChange={set('gender')} wide />
        <Segmented label="Pronouns" value={e.pronouns} options={OPTIONS.pronouns} onChange={set('pronouns')} wide />
        <Segmented label="Race" value={e.race} options={OPTIONS.race} onChange={set('race')} wide />
        <Segmented label="Hispanic or Latino" value={e.hispanic_latino} options={OPTIONS.yesNoPrivate} onChange={set('hispanic_latino')} wide />
      </Section>
      <Section title="Other">
        <Segmented label="Protected veteran" value={e.veteran} options={OPTIONS.yesNoPrivate} onChange={set('veteran')} wide />
        <Segmented label="Disability" value={e.disability} options={OPTIONS.yesNoPrivate} onChange={set('disability')} wide />
        <Segmented label="LGBTQ+" value={e.lgbtq} options={OPTIONS.yesNoPrivate} onChange={set('lgbtq')} wide />
        <MultiChoice label="Sexual orientation" values={e.sexual_orientation} options={OPTIONS.orientation} onChange={set('sexual_orientation')} />
      </Section>
    </>
  );
}
