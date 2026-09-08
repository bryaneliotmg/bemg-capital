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
        background: `conic-gradient(${color} ${pct * 3.6}deg, var(--color-outline-variant) 0)`,
      }}
    >
      <div
        className="absolute rounded-full bg-surface-container-low"
        style={{ inset: thickness }}
      />
      <div className="relative font-extrabold" style={{ fontSize }}>
        {children ?? `${pct}%`}
      </div>
    </div>
  );
}
