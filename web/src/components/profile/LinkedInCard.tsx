import { useRef, useState, type ChangeEvent } from 'react';
import { errorText } from '../../lib/errors';
import { connectLinkedIn, disconnectLinkedIn, takeLinkedInError } from '../../lib/linkedin';
import { useUserId } from '../../hooks/useDocuments';
import { checkLinkedInFile, importLinkedIn, useLinkedInAccount, useLinkedInImport, type LinkedInImport } from '../../hooks/useLinkedIn';
import { Group } from '../settings';
import { Shimmer } from '../motion';
import { IconLinkedin, IconUpload } from '../Icons';
import './documents.css';
import './linkedin.css';

/** The profile saved from LinkedIn as a PDF: the agent reads it and adds what the profile is missing. */
function ImportRow({ userId }: { userId: string }) {
  const [running, setRunning] = useState<LinkedInImport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const state = useLinkedInImport(running);
  const working = uploading || state?.status === 'pending' || state?.status === 'running';

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const refused = checkLinkedInFile(file);
    if (refused) {
      setProblem(refused);
      return;
    }
    setProblem('');
    setRunning(null);
    setUploading(true);
    try {
      setRunning(await importLinkedIn(userId, file));
    } catch (thrown) {
      setProblem(errorText(thrown));
    }
    setUploading(false);
  }

  let line;
  if (uploading) line = <Shimmer>Uploading</Shimmer>;
  else if (state?.status === 'pending') line = <Shimmer>Waiting for the agent</Shimmer>;
  else if (state?.status === 'running') line = <Shimmer>The agent is reading it</Shimmer>;
  else if (state?.status === 'done') line = 'Added. Existing details unchanged.';
  else line = 'LinkedIn profile PDF (More > Save to PDF). Adds missing details only.';
  const failed = problem || (state?.status === 'failed' ? state.error || 'The agent could not read it.' : '');

  return (
    <div className="resume docrow">
      <span className={`resume__icon ${working ? 'is-busy' : ''}`} aria-hidden="true">
        <IconUpload size={22} />
      </span>
      <div className="resume__info">
        <p className="resume__name">Import your profile</p>
        <p className="resume__meta">{line}</p>
        {failed ? (
          <p className="docrow__problem" role="alert">
            {failed}
          </p>
        ) : null}
      </div>
      <div className="resume__actions">
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => input.current?.click()} disabled={working || !userId}>
          Upload PDF
        </button>
        <input ref={input} type="file" accept=".pdf,application/pdf" className="sr-only" tabIndex={-1} aria-label="LinkedIn profile PDF" onChange={onPick} />
      </div>
    </div>
  );
}

/** LinkedIn's own sign-in, linked to this account. It shares a name, an email and a photo, nothing more. */
function ConnectRow() {
  const { account, loading, reload } = useLinkedInAccount();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(() => takeLinkedInError());

  async function connect() {
    setProblem('');
    setBusy(true);
    const refused = await connectLinkedIn();
    // With no refusal the browser is on its way to LinkedIn: the button stays busy until the page leaves.
    if (refused) {
      setProblem(refused);
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!account) return;
    setProblem('');
    setBusy(true);
    try {
      await disconnectLinkedIn(account);
    } catch (thrown) {
      setProblem(errorText(thrown));
    }
    setBusy(false);
    reload();
  }

  return (
    <div className="resume docrow">
      {account?.picture ? (
        <img className="lnk__photo" src={account.picture} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className={`resume__icon ${account ? '' : 'is-empty'}`} aria-hidden="true">
          <IconLinkedin size={22} />
        </span>
      )}
      <div className="resume__info">
        <p className="resume__name">{account ? account.name || 'LinkedIn account' : 'Connect LinkedIn'}</p>
        <p className="resume__meta">
          {account ? (
            <>
              {account.email ? <span>{account.email}</span> : null}
              <span className="tag tag--green">Connected</span>
            </>
          ) : (
            'Links your LinkedIn account. Shares name, email and photo only.'
          )}
        </p>
        {problem ? (
          <p className="docrow__problem" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
      <div className="resume__actions">
        {account ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={disconnect} disabled={busy}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn btn--secondary btn--sm" onClick={connect} disabled={busy || loading}>
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

/** LinkedIn on the Profile page: the profile brought in as a file, and the account linked by LinkedIn's sign-in. */
export function LinkedInCard() {
  const userId = useUserId();
  return (
    <Group title="LinkedIn">
      <ImportRow userId={userId} />
      <ConnectRow />
    </Group>
  );
}
