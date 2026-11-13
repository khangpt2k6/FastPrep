// A small confetti burst on a canvas laid over the page for about a second. No library.
// Skipped entirely when the person asks for reduced motion.

const COLORS = ['#0285ff', '#10a37f', '#7cc4ff', '#ffb547', '#ff7aa8', '#8f7cff', '#0d0d0d'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  ratio: number;
  angle: number;
  spin: number;
  wobble: number;
  color: string;
  round: boolean;
}

export interface ConfettiOptions {
  /** Where the burst starts, in viewport pixels. Defaults to the middle, a third of the way down. */
  x?: number;
  y?: number;
  count?: number;
  /** Total time in ms; pieces fade over the last third. */
  duration?: number;
}

function reduced(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Bursts confetti from a point (or from an element's center). Safe to call any time; it cleans up after itself. */
export function confetti(options: ConfettiOptions = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || reduced()) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  const x0 = options.x ?? width / 2;
  const y0 = options.y ?? height * 0.36;
  const count = options.count ?? 110;
  const duration = options.duration ?? 1150;
  const pieces: Piece[] = Array.from({ length: count }, () => {
    // A fan pointing up, a little wider than a quarter turn.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.85;
    const speed = 520 + Math.random() * 620;
    return {
      x: x0 + (Math.random() - 0.5) * 24,
      y: y0 + (Math.random() - 0.5) * 12,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      ratio: 0.4 + Math.random() * 0.35,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 14,
      wobble: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.22,
    };
  });

  const gravity = 1500;
  const drag = 2.6;
  const start = performance.now();
  let last = start;
  let frame = 0;

  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const t = now - start;
    const fade = t > duration * 0.66 ? Math.max(0, 1 - (t - duration * 0.66) / (duration * 0.34)) : 1;
    ctx.clearRect(0, 0, width, height);
    for (const p of pieces) {
      p.vx -= p.vx * drag * dt;
      p.vy += gravity * dt - p.vy * drag * dt * 0.6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.wobble += 9 * dt;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.32, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // The cos term flips the strip like paper turning in the air.
        const w = p.size;
        const h = p.size * p.ratio * Math.max(0.2, Math.abs(Math.cos(p.wobble)));
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
    if (t < duration) frame = window.requestAnimationFrame(step);
    else canvas.remove();
  };
  frame = window.requestAnimationFrame(step);
  // A hidden tab never runs frames: clean up anyway.
  window.setTimeout(() => {
    window.cancelAnimationFrame(frame);
    canvas.remove();
  }, duration + 1500);
}

/** Confetti from the middle of an element, such as the button that was pressed. */
export function confettiFrom(element: Element | null, options: Omit<ConfettiOptions, 'x' | 'y'> = {}) {
  if (!element) return confetti(options);
  const box = element.getBoundingClientRect();
  confetti({ ...options, x: box.left + box.width / 2, y: box.top + box.height / 2 });
}
