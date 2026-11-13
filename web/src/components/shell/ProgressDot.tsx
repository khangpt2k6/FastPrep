/** A tiny ring that fills as setup gets done. */
export function ProgressDot({ value, size = 16 }: { value: number; size?: number }) {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="pdot" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <circle cx={size / 2} cy={size / 2} r={r} className="pdot__track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="pdot__value"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.08, Math.min(1, value)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
