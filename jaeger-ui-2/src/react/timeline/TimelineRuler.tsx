function formatDuration(us: number): string {
  if (us === 0) return '0';
  if (us < 1000) return `${Math.round(us)}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(1)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

interface Props {
  /** px width of the left name column */
  nameWidth: number;
  /** Number of tick marks (including first and last) */
  numTicks: number;
  /** Total trace duration in microseconds */
  traceDuration: number;
}

export function TimelineRuler({ nameWidth, numTicks, traceDuration }: Props) {
  const ticks = Array.from({ length: numTicks }, (_, i) => {
    const fraction = numTicks === 1 ? 0 : i / (numTicks - 1);
    const label = formatDuration(fraction * traceDuration);
    const isFirst = i === 0;
    const isLast = i === numTicks - 1;
    return { fraction, label, isFirst, isLast };
  });

  return (
    <div className="Tl-ruler">
      <div className="Tl-ruler__name" style={{ width: nameWidth }}>
        Service &amp; Operation
      </div>
      <div className="Tl-ruler__ticks">
        {ticks.map(({ fraction, label, isFirst, isLast }) => (
          <div
            key={fraction}
            className={`Tl-tick${isFirst ? ' Tl-tick--first' : ''}${isLast ? ' Tl-tick--last' : ''}`}
            style={{ left: `${fraction * 100}%` }}
          >
            <div className="Tl-tick__line" />
            <span className="Tl-tick__label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
