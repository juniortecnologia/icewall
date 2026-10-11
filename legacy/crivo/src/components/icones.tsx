type P = { className?: string };

const traco = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Peneira vista de cima: aro, grade de furos e um traço que atravessa. */
export function Logo({ className }: P) {
  const furos = [10, 16, 22].flatMap((y) => [10, 16, 22].map((x) => ({ x, y })));
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13.5" {...traco} strokeWidth={2.25} />
      <circle cx="16" cy="16" r="10" {...traco} strokeWidth={1} opacity={0.35} />
      {furos.map(({ x, y }) => {
        const centro = x === 16 && y === 16;
        return (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={centro ? 1.9 : 1.35}
            fill={centro ? "var(--color-verde)" : "currentColor"}
          />
        );
      })}
      <path d="M4.5 25.5 27.5 6.5" stroke="var(--color-info)" strokeWidth={1.5} strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}

export function IconeEntrada({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 12h11M10 8l4 4-4 4" {...traco} />
      <path d="M18 4v16M21 4v16" {...traco} />
    </svg>
  );
}

export function IconeSaida({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 4v16M6 4v16" {...traco} />
      <path d="M10 12h11M17 8l4 4-4 4" {...traco} />
    </svg>
  );
}

export function IconeTerminal({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="2" {...traco} />
      <path d="M7 10l3 2.5L7 15M12.5 15.5H17" {...traco} />
    </svg>
  );
}

export function IconeArquivo({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...traco} />
      <path d="M14 3v5h5M9 13h6M9 17h4" {...traco} />
    </svg>
  );
}

export function IconeChave({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="8" cy="15" r="4" {...traco} />
      <path d="M11 12l8.5-8.5M16 7l2.5 2.5M18.5 4.5 21 7" {...traco} />
    </svg>
  );
}

export function IconeChevron({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" {...traco} />
    </svg>
  );
}

export function MarcaOk({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" {...traco} strokeWidth={3.25} />
    </svg>
  );
}

export function MarcaPergunta({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M9 9.2a3 3 0 1 1 4.2 2.75c-.75.35-1.2 1.05-1.2 1.85v.7" {...traco} strokeWidth={3} />
      <circle cx="12" cy="18.6" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function MarcaX({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" {...traco} strokeWidth={3.25} />
    </svg>
  );
}
