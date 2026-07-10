import { memo } from 'react';
import { SpanNode } from './tree';
import { getServiceColor } from './colors';

function formatDuration(us: number): string {
  if (us < 1000) return `${Math.round(us)}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(2)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

function hasError(node: SpanNode): boolean {
  return node.span.tags?.some(t => t.key === 'error' && (t.value === true || t.value === 'true')) ?? false;
}

interface Props {
  node: SpanNode;
  traceStart: number;
  traceDuration: number;
  nameWidth: number;
  numTicks: number;
  isCollapsed: boolean;
  isDetailExpanded: boolean;
  onToggleCollapse: (spanID: string) => void;
  onToggleDetail: (spanID: string) => void;
}

export const SpanRow = memo(function SpanRow({
  node,
  traceStart,
  traceDuration,
  nameWidth,
  numTicks,
  isCollapsed,
  isDetailExpanded,
  onToggleCollapse,
  onToggleDetail,
}: Props) {
  const { span, depth, hasChildren } = node;
  const color = getServiceColor(span.serviceName);
  const error = hasError(node);

  // Bar positioning
  const viewStart = traceDuration > 0 ? (span.startTime - traceStart) / traceDuration : 0;
  const viewEnd = traceDuration > 0 ? (span.startTime + span.duration - traceStart) / traceDuration : 0;
  const leftPct = `${(Math.max(0, viewStart) * 100).toFixed(2)}%`;
  const widthPct = `${(Math.max(0.1, viewEnd - viewStart) * 100).toFixed(2)}%`;

  const durationLabel = formatDuration(span.duration);

  // Label position: if bar ends in the right half, show label to the left
  const labelInside = (viewEnd - viewStart) > 0.08;

  // Indent structure: one connector segment per depth level
  const indentSegments = Array.from({ length: depth }, (_, i) => i);

  return (
    <div
      className={`Tl-row${isDetailExpanded ? ' Tl-row--selected' : ''}${error ? ' Tl-row--error' : ''}`}
    >
      {/* ── Name panel ── */}
      <div className="Tl-row__name" style={{ width: nameWidth }}>
        {/* Tree indent lines */}
        <div className="Tl-row__indent" style={{ display: 'flex', flexShrink: 0 }}>
          {indentSegments.map(i => (
            <span key={i} className="Tl-connector Tl-connector--vert" />
          ))}
        </div>

        {/* Collapse toggle */}
        {hasChildren ? (
          <button
            className="Tl-row__toggle"
            onClick={e => { e.stopPropagation(); onToggleCollapse(span.spanID); }}
            title={isCollapsed ? 'Expand children' : 'Collapse children'}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className="Tl-row__spacer" />
        )}

        {/* Service color dot */}
        <span className="Tl-row__dot" style={{ background: color }} />

        {/* Service name */}
        <span className="Tl-row__svc" title={span.serviceName}>
          {span.serviceName}
        </span>

        {/* Operation name */}
        <span className="Tl-row__op" title={span.operationName}>
          {span.operationName}
        </span>
      </div>

      {/* ── Bar panel ── */}
      <div
        className="Tl-row__bar-panel"
        onClick={() => onToggleDetail(span.spanID)}
      >
        {/* Grid tick lines */}
        {Array.from({ length: numTicks }, (_, i) => {
          const frac = numTicks === 1 ? 0 : i / (numTicks - 1);
          return (
            <div
              key={i}
              className="Tl-gridline"
              style={{ left: `${frac * 100}%` }}
            />
          );
        })}

        {/* Span bar */}
        <div
          className="Tl-bar"
          style={{ left: leftPct, width: widthPct, background: color }}
          title={`${span.serviceName}::${span.operationName} — ${durationLabel}`}
        >
          {labelInside ? (
            <span className="Tl-bar__label-inside">{durationLabel}</span>
          ) : (
            <span className="Tl-bar__label-outside">{durationLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
});
