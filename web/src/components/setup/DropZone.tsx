import { useRef, useState, type DragEvent } from 'react';
import { RESUME_ACCEPT } from '../../lib/resume';
import { IconResume, IconUpload } from '../Icons';

/**
 * A large dashed card that takes a dropped file, or opens the file picker. While a file is over it the dashes march
 * and the card lifts a little.
 */
export function DropZone({ onFile, disabled = false }: { onFile: (file: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const enter = (event: DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    depth.current += 1;
    setOver(true);
  };
  const leave = () => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    if (disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`drop ${over ? 'is-over' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragEnter={enter}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={leave}
      onDrop={drop}
      onClick={() => !disabled && input.current?.click()}
    >
      <svg className="drop__border" aria-hidden="true" focusable="false">
        <rect rx="22" ry="22" />
      </svg>
      <span className="drop__icon" aria-hidden="true">
        <IconResume size={28} />
      </span>
      <p className="drop__title">{over ? 'Let go to upload' : 'Drop your resume here'}</p>
      <p className="drop__hint">PDF, up to 10 MB</p>
      <button type="button" className="btn btn--brand drop__btn" disabled={disabled} onClick={(e) => {
          e.stopPropagation();
          input.current?.click();
        }}>
        <IconUpload size={16} />
        Upload resume
      </button>
      <input
        ref={input}
        type="file"
        accept={RESUME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
    </div>
  );
}
