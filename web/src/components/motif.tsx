// The two signature graphics: topographic contours (the hunting ground) and the dotted trail (the path from a job
// found to an interview). Both are drawn here once, deterministically, so every render is the same picture.

/** A closed, smooth contour around a center: a wobbly ellipse, as Catmull-Rom points turned into cubic curves. */
function contour(cx: number, cy: number, r: number, squash: number, seed: number): string {
  const n = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = 1 + 0.1 * Math.sin(3 * t + seed) + 0.055 * Math.sin(5 * t + seed * 1.7) + 0.035 * Math.cos(7 * t + seed * 0.6);
    pts.push([cx + r * k * Math.cos(t), cy + r * k * squash * Math.sin(t)]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

const HILLS: { cx: number; cy: number; rings: number; step: number; squash: number; seed: number }[] = [
  { cx: 640, cy: 170, rings: 10, step: 30, squash: 0.68, seed: 0.4 },
  { cx: 140, cy: 380, rings: 6, step: 34, squash: 0.6, seed: 2.1 },
  { cx: 860, cy: 420, rings: 5, step: 28, squash: 0.75, seed: 4.2 },
];

const PATHS = HILLS.flatMap((h) => Array.from({ length: h.rings }, (_, i) => contour(h.cx, h.cy, 24 + i * h.step, h.squash, h.seed + i * 0.35)));

/** Faint topographic lines for the back of a hero area. Decorative. */
export function Contours({ className = '' }: { className?: string }) {
  return (
    <svg className={`contours ${className}`} viewBox="0 0 960 440" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {PATHS.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** A short dotted trail with three nodes, as a divider in empty states. */
export function TrailDivider({ className = '' }: { className?: string }) {
  return (
    <svg className={`traildiv ${className}`} viewBox="0 0 160 12" width="160" height="12" aria-hidden="true" focusable="false">
      <line x1="6" y1="6" x2="154" y2="6" className="traildiv__line" />
      <circle cx="6" cy="6" r="4" className="traildiv__node" />
      <circle cx="80" cy="6" r="4" className="traildiv__node traildiv__node--mid" />
      <circle cx="154" cy="6" r="4" className="traildiv__node" />
    </svg>
  );
}
