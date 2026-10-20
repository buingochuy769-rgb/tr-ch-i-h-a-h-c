export default function Atom({ size = 120, className = '' }: { size?: number; className?: string }) {
  const orbits = [0, 60, 120];
  return (
    <svg viewBox="-60 -60 120 120" width={size} height={size} className={className} aria-hidden>
      <defs>
        <radialGradient id="nuc">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="1" stopColor="#0891b2" />
        </radialGradient>
      </defs>
      {orbits.map((a, i) => (
        <g key={a} transform={`rotate(${a})`}>
          <ellipse rx="50" ry="18" fill="none" stroke="#22d3ee" strokeOpacity=".45" strokeWidth="1" />
          <circle r="3.5" fill="#e0f2fe">
            <animateMotion dur={`${4 + i * 1.3}s`} repeatCount="indefinite" path="M50,0 A50,18 0 1,1 -50,0 A50,18 0 1,1 50,0" />
          </circle>
        </g>
      ))}
      <circle r="8" fill="url(#nuc)" />
    </svg>
  );
}
