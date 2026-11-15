// Dev preview only: a fake apply run that moves on its own, to see the dialog's motion without the agent.
import { useEffect, useMemo, useState } from 'react';
import type { AgentRow, CommandRow, JobRow } from '../../lib/types';
import { ApplyRunDialog, ApplyRunDock } from './ApplyRunDialog';

const STEPS = ['', 'Claude Code: browser_navigate', 'Claude Code: browser_snapshot', 'Claude Code: browser_type', 'Claude Code: browser_file_upload', 'Claude Code: browser_select_option', 'Claude Code: finish_form'];
const RESULTS = ['submitted', 'blocked', 'unconfirmed', 'failed'];

export function ApplyRunDemo({ jobs, agent, now, onEnd }: { jobs: JobRow[]; agent: AgentRow; now: number; onEnd: () => void }) {
  const picked = useMemo(() => jobs.slice(0, 4), [jobs]);
  const [created] = useState(() => new Date().toISOString());
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(true);
  const perJob = STEPS.length + 1;
  const end = 2 + picked.length * perJob;
  useEffect(() => {
    if (tick >= end) return;
    const timer = window.setTimeout(() => setTick((t) => t + 1), 900);
    return () => window.clearTimeout(timer);
  }, [tick, end]);

  const t = tick - 2;
  const current = t < 0 ? -1 : Math.floor(t / perJob);
  const step = t < 0 ? 0 : t % perJob;
  const stamp = new Date(Date.parse(created) + 1000).toISOString();
  const rows = picked.map((job, i): JobRow => {
    if (current > i || (current === i && step === STEPS.length)) {
      const status = RESULTS[i % RESULTS.length];
      return { ...job, status, reason: status === 'blocked' ? 'dry_run' : '', dry_run: true, note: status === 'failed' ? 'The page asked for an account.' : 'Reached the submit button.', updated_at: stamp };
    }
    if (current === i) return { ...job, status: 'applying', updated_at: stamp };
    return { ...job, status: 'scored', updated_at: new Date(0).toISOString() };
  });
  const done = tick >= end;
  const command: CommandRow = {
    id: 9001,
    kind: 'apply',
    job_ids: picked.map((j) => j.id),
    dry_run: true,
    status: tick < 2 ? 'pending' : done ? 'done' : 'running',
    error: '',
    created_at: created,
  };
  const active = current >= 0 && current < picked.length ? picked[current] : null;
  const fakeAgent: AgentRow = {
    ...agent,
    state: active && step < STEPS.length ? 'applying' : 'idle',
    message: active ? `${current + 1}/${picked.length} ${active.company}: ${active.title}${STEPS[step] ? `: ${STEPS[step]}` : ' (dry run, nothing is sent)'}` : '',
    model: 'Claude Code · sonnet',
  };
  return (
    <>
      <ApplyRunDialog
        command={command}
        jobs={rows}
        agent={fakeAgent}
        online
        now={now}
        open={open}
        onHide={() => (done ? onEnd() : setOpen(false))}
        onCancel={onEnd}
        onViewApplied={onEnd}
      />
      <ApplyRunDock command={command} jobs={rows} agent={fakeAgent} now={now} visible={!open} onOpen={() => setOpen(true)} />
    </>
  );
}
