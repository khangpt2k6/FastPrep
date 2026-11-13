import type { CSSProperties } from 'react';
import { matchWord } from '../../lib/jobs';

/**
 * The match meter: five short segments that fill in ember up to the score (a 4.6 fills four and most of the fifth),
 * the word for it (Strong 4+, Good 3+, Fair) and the score in mono.
 */
export function MatchMeter({ score, compact = false, index = 0 }: { score: number | null; compact?: boolean; index?: number }) {
  if (score === null || !Number.isFinite(score)) {
    return <span className="meter meter--none">Not scored</span>;
  }
  const word = matchWord(score);
  const tip = `${word} match, ${score.toFixed(1)} of 5`;
  return (
    <span className={`meter ${compact ? 'meter--compact' : ''}`} role="img" aria-label={tip} title={tip} style={{ '--row': Math.min(index, 12) } as CSSProperties}>
      <span className="meter__segs" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="meter__seg" style={{ '--i': i, '--f': Math.max(0, Math.min(1, score - i)) } as CSSProperties} />
        ))}
      </span>
      {compact ? null : (
        <span className={`meter__word meter__word--${word.toLowerCase()}`} aria-hidden="true">
          {word}
        </span>
      )}
      <span className="meter__score num" aria-hidden="true">
        {score.toFixed(1)}
      </span>
    </span>
  );
}
