// Markdown as an AI writes its answers, drawn as React elements: headings, lists, bold, italics, code, code blocks,
// quotes, rules, tables and links. Nothing is ever put in as HTML, and a link goes only to http(s), so text from the web
// that ended up in an answer cannot run in the page.
import { Fragment, type ReactNode } from 'react';
import './markdown.css';

const SAFE_URL = /^https?:\/\//i;

/** Bold, italics, code and links inside one line. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Code first (its insides are taken as they are), then links, bold, italics.
  const pattern = /(`[^`]+`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*\*([^*]+)\*\*|__([^_]+)__)|(\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const id = `${key}-${n++}`;
    if (match[1]) out.push(<code key={id}>{match[1].slice(1, -1)}</code>);
    else if (match[2]) {
      const [label, url] = [match[3], match[4]];
      out.push(
        SAFE_URL.test(url) ? (
          <a key={id} href={url} target="_blank" rel="noopener noreferrer">
            {inline(label, id)}
          </a>
        ) : (
          <Fragment key={id}>{label}</Fragment>
        ),
      );
    } else if (match[5]) out.push(<strong key={id}>{inline(match[6] ?? match[7], id)}</strong>);
    else if (match[8]) out.push(<em key={id}>{inline(match[9] ?? match[10], id)}</em>);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

/** The blocks of a Markdown text, as elements. */
function blocks(source: string): ReactNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    // A fenced code block.
    const fence = /^\s*```/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      out.push(
        <pre key={key}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = level <= 2 ? 'h4' : level === 3 ? 'h5' : 'h6';
      out.push(<Tag key={key}>{inline(heading[2].replace(/\s*#+\s*$/, ''), key)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(line)) {
      out.push(<hr key={key} />);
      i++;
      continue;
    }
    // A table: a row of cells, then a line of dashes.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      out.push(
        <div key={key} className="md__table">
          <table>
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c}>{inline(cell, `${key}h${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, c) => (
                    <td key={c}>{inline(row[c] ?? '', `${key}r${r}c${c}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(<blockquote key={key}>{blocks(quote.join('\n'))}</blockquote>);
      continue;
    }
    // A list: its items, with lines that carry on an item and lists nested under it.
    const item = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const indent = item[1].length;
      const items: { text: string; rest: string[] }[] = [];
      while (i < lines.length) {
        const next = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (next && next[1].length === indent && /\d/.test(next[2]) === ordered) {
          items.push({ text: next[3], rest: [] });
          i++;
        } else if (items.length && lines[i].trim() && (/^\s+/.test(lines[i]) || (next && next[1].length > indent))) {
          items[items.length - 1].rest.push(lines[i].slice(Math.min(indent + 2, lines[i].search(/\S/))));
          i++;
        } else break;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={key}>
          {items.map((it, n) => (
            <li key={n}>
              {inline(it.text, `${key}i${n}`)}
              {it.rest.length ? blocks(it.rest.join('\n')) : null}
            </li>
          ))}
        </List>,
      );
      continue;
    }
    // A paragraph: lines up to a blank line or the start of another block.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) {
      // A line that matched none of the above and starts like a block: keep it as text rather than loop.
      para.push(lines[i++]);
    }
    out.push(
      <p key={key}>
        {para.map((text, n) => (
          <Fragment key={n}>
            {n ? <br /> : null}
            {inline(text, `${key}p${n}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return out;
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  return <div className={`md ${className}`}>{blocks(text)}</div>;
}

/** One line of Markdown, inline only: bold, italics, code, links. */
export function MarkdownLine({ text }: { text: string }) {
  return <span className="md-line">{inline(text, 'l')}</span>;
}
