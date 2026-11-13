import { useRef, useState, type ChangeEvent } from 'react';
import { errorText } from '../../lib/errors';
import { fileSize, timeAgo } from '../../lib/format';
import {
  TRANSCRIPT_ACCEPT,
  checkTranscriptFile,
  deleteDocument,
  newestTranscript,
  uploadTranscript,
  useDocuments,
  useUserId,
} from '../../hooks/useDocuments';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { Group } from '../settings';
import { IconFile, IconLetter, IconUpload } from '../Icons';
import './documents.css';

/** The transcript: the newest upload is the one the agent gives to a form that asks for a transcript. */
function TranscriptRow({ userId, now }: { userId: string; now: number }) {
  const { rows, loading, error, reload } = useDocuments(userId);
  const [busy, setBusy] = useState<'' | 'upload' | 'remove'>('');
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const current = newestTranscript(rows);
  const { url } = useSignedUrl(current?.path ?? '', current?.created_at ?? '');
  const missing = error?.kind === 'missing-table';

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const refused = checkTranscriptFile(file);
    if (refused) {
      setProblem(refused);
      return;
    }
    setProblem('');
    setBusy('upload');
    try {
      await uploadTranscript(userId, file, rows.filter((r) => r.kind === 'transcript'));
    } catch (thrown) {
      setProblem(errorText(thrown));
    }
    setBusy('');
    reload();
  }

  async function onRemove() {
    if (!current) return;
    setProblem('');
    setBusy('remove');
    try {
      for (const row of rows.filter((r) => r.kind === 'transcript')) await deleteDocument(row);
    } catch (thrown) {
      setProblem(errorText(thrown));
    }
    setBusy('');
    reload();
  }

  if (loading) {
    return (
      <div className="resume docrow" aria-busy="true">
        <span className="skeleton resume__iconskel" />
        <span className="resume__info">
          <span className="skeleton skeleton--line" style={{ width: '34%' }} />
          <span className="skeleton skeleton--line skeleton--thin" style={{ width: '22%' }} />
        </span>
      </div>
    );
  }

  return (
    <div className="resume docrow">
      <span className={`resume__icon ${current ? '' : 'is-empty'} ${busy ? 'is-busy' : ''}`} aria-hidden="true">
        <IconFile size={22} />
      </span>
      <div className="resume__info">
        <p className="resume__name">{current ? current.name : 'Transcript'}</p>
        <p className="resume__meta num">
          {missing ? (
            <span>
              Uploading needs the latest <code className="code">supabase/schema.sql</code>
            </span>
          ) : busy === 'upload' ? (
            <span>Uploading</span>
          ) : current ? (
            <>
              <span>Transcript, uploaded {timeAgo(current.created_at, now)}</span>
              {fileSize(current.size) ? <span>{fileSize(current.size)}</span> : null}
            </>
          ) : (
            <span>None yet. The agent attaches it only where a form asks for a transcript.</span>
          )}
        </p>
        {problem ? (
          <p className="docrow__problem" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      {!missing ? (
        <div className="resume__actions">
          {current && url ? (
            <a className="btn btn--secondary btn--sm" href={url} target="_blank" rel="noreferrer">
              Open
            </a>
          ) : null}
          <button type="button" className={`btn btn--sm ${current ? 'btn--secondary' : 'btn--primary'}`} onClick={() => input.current?.click()} disabled={busy !== ''}>
            {current ? null : <IconUpload size={14} />}
            {current ? 'Replace' : 'Upload transcript'}
          </button>
          {current ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove} disabled={busy !== ''}>
              Remove
            </button>
          ) : null}
          <input ref={input} type="file" accept={TRANSCRIPT_ACCEPT} className="sr-only" tabIndex={-1} aria-label="Transcript file" onChange={onPick} />
        </div>
      ) : null}
    </div>
  );
}

/** The other files that go with an application, under the resume: the cover letter and the transcript. */
export function DocumentsCard({ now }: { now: number }) {
  const userId = useUserId();
  return (
    <Group title="Documents">
      <div className="resume docrow">
        <span className="resume__icon" aria-hidden="true">
          <IconLetter size={22} />
        </span>
        <div className="resume__info">
          <p className="resume__name">Cover letter</p>
          <p className="resume__meta">Written for each job from your template, as a PDF.</p>
        </div>
        <div className="resume__actions">
          <a className="btn btn--secondary btn--sm" href="#/letters">
            Open letters
          </a>
        </div>
      </div>
      {userId ? (
        <TranscriptRow userId={userId} now={now} />
      ) : (
        <div className="resume docrow">
          <span className="resume__icon is-empty" aria-hidden="true">
            <IconFile size={22} />
          </span>
          <div className="resume__info">
            <p className="resume__name">Transcript</p>
            <p className="resume__meta">The agent attaches it only where a form asks for a transcript.</p>
          </div>
        </div>
      )}
    </Group>
  );
}
