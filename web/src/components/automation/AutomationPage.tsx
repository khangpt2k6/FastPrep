// The Automation page: work typed here runs on the person's own computer, with their own plans (Claude Code or Codex),
// and comes back here step by step. A domain of its own, apart from the agent's settings.
import { useState } from 'react';
import { useUserId } from '../../hooks/useDocuments';
import { BrandLogo } from '../BrandLogo';
import { EmptyState } from '../common';
import { IconCheck, IconGlobe, IconInfo, IconTerminal } from '../Icons';
import { GuideDialog } from '../guide/GuideDialog';
import { TaskComposer, TaskList, addTask, cancelTask, useTasks } from '../agent/TasksCard';
import type { Engine, TaskRow } from '../agent/TaskTimeline';
import type { ModelCatalog } from '../../lib/types';
import './automation.css';

/** Where a click goes: this page, then this PC, then the plans, then back here. The PC is lit while the agent is online. */
function Flow({ online, onGuide }: { online: boolean; onGuide: () => void }) {
  return (
    <div className="aflow">
      <ol className="aflow__steps" aria-label="Where a task runs">
        <li className="aflow__node">
          <span className="aflow__icon">
            <IconGlobe size={16} />
          </span>
          Dashboard
        </li>
        <li className={`aflow__node ${online ? 'is-on' : 'is-off'}`}>
          <span className="aflow__icon">
            <IconTerminal size={16} />
          </span>
          This PC
          <span className={`aflow__dot ${online ? 'is-on' : ''}`} title={online ? 'Online' : 'Offline'} />
        </li>
        <li className="aflow__node">
          <span className="aflow__icon aflow__icon--duo">
            <BrandLogo brand="claude" size={15} />
            <BrandLogo brand="openai" size={15} />
          </span>
          Your plans
        </li>
        <li className="aflow__node">
          <span className="aflow__icon">
            <IconCheck size={16} />
          </span>
          Back here
        </li>
      </ol>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onGuide}>
        <IconInfo size={14} />
        Guide
      </button>
    </div>
  );
}

export interface AutomationViewProps {
  tasks: TaskRow[];
  /** The tasks table is not in the database yet. */
  missing?: boolean;
  now: number;
  /** Whether the agent on the person's computer is online: tasks run there. */
  online: boolean;
  /** The models this computer's engines offer. */
  catalog?: ModelCatalog | null;
  onRun: (engine: Engine, prompt: string, model: string, effort: string) => Promise<string>;
  onCancel: (id: number) => void;
}

export function AutomationView({ tasks, missing = false, now, online, catalog, onRun, onCancel }: AutomationViewProps) {
  const [guide, setGuide] = useState(false);
  return (
    <div className="page auto">
      <Flow online={online} onGuide={() => setGuide(true)} />
      {missing ? (
        <p className="groupnote groupnote--warn">Needs the latest supabase/schema.sql.</p>
      ) : (
        <div className="auto__grid">
          <section className="card auto__new" aria-labelledby="auto-new">
            <h2 id="auto-new" className="auto__title">
              New run
            </h2>
            <TaskComposer onRun={onRun} catalog={catalog} disabled={online ? '' : 'This PC is offline'} />
          </section>
          <section className="auto__runs" aria-labelledby="auto-runs">
            <h2 id="auto-runs" className="auto__title">
              Runs <span className="auto__count num">{tasks.length}</span>
            </h2>
            {tasks.length ? (
              <div className="card auto__list">
                <TaskList tasks={tasks} now={now} onCancel={onCancel} />
              </div>
            ) : (
              <EmptyState compact friend="robot-laptop" title="No runs yet" text="Pick an engine, say what to do, run it." />
            )}
          </section>
        </div>
      )}
      <GuideDialog open={guide} onClose={() => setGuide(false)} start="automation" />
    </div>
  );
}

/** The page wired to the database. */
export function AutomationPage({ now, online, catalog }: { now: number; online: boolean; catalog?: ModelCatalog | null }) {
  const userId = useUserId();
  const { rows, error } = useTasks(userId);
  return (
    <AutomationView
      tasks={rows}
      missing={error?.kind === 'missing-table'}
      now={now}
      online={online}
      catalog={catalog}
      onRun={(engine, prompt, model, effort) => (userId ? addTask(engine, prompt, model, effort) : Promise.resolve('Not signed in'))}
      onCancel={(id) => void cancelTask(id)}
    />
  );
}
