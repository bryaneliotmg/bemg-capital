interface RingProps {
  pct: number;
  color: string;
  size?: number;
  thickness?: number;
  fontSize?: number;
  children?: React.ReactNode;
}

export function Ring({ pct, color, size = 52, thickness = 5, fontSize = 13, children }: RingProps) {
  return (
    <div
      className="relative shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} ${pct * 3.6}deg, var(--color-line-2) 0)`,
      }}
    >
      <div className="absolute rounded-full bg-surface" style={{ inset: thickness }} />
      <div className="relative font-serif font-semibold" style={{ fontSize }}>
        {children ?? `${pct}%`}
      </div>
    </div>
  );
}
