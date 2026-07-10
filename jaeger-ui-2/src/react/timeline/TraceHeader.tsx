import { Trace } from '../types';
import { getServiceColor } from './colors';

function formatDuration(us: number): string {
  if (us < 1000) return `${us}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(2)}ms`;
  return `${(us / 1_000_000).toFixed(2)}s`;
}

function formatTs(us: number): string {
  return new Date(us / 1000).toLocaleString();
}

interface Props {
  trace: Trace;
  maxDepth: number;
}

export function TraceHeader({ trace, maxDepth }: Props) {
  // Root operation = earliest span with no parent (depth 0)
  const rootSpan = trace.spans.find(s => s.depth === 0) ?? trace.spans[0];
  const rootService = rootSpan?.serviceName ?? '';
  const rootOp = rootSpan?.operationName ?? trace.traceID;
  const rootColor = getServiceColor(rootService);

  return (
    <div className="Tl-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: rootColor, flexShrink: 0, display: 'inline-block' }} />
        <span className="Tl-header__title">{rootService}: {rootOp}</span>
        <span className="Tl-header__id">{trace.traceID.slice(0, 7)}</span>
      </div>
      <div className="Tl-header__chips">
        <div className="Tl-chip">
          <span className="Tl-chip__label">Start</span>
          <span className="Tl-chip__value">{formatTs(trace.startTime)}</span>
        </div>
        <div className="Tl-chip">
          <span className="Tl-chip__label">Duration</span>
          <span className="Tl-chip__value">{formatDuration(trace.duration)}</span>
        </div>
        <div className="Tl-chip">
          <span className="Tl-chip__label">Services</span>
          <span className="Tl-chip__value">{trace.services.length}</span>
        </div>
        <div className="Tl-chip">
          <span className="Tl-chip__label">Depth</span>
          <span className="Tl-chip__value">{maxDepth}</span>
        </div>
        <div className="Tl-chip">
          <span className="Tl-chip__label">Total Spans</span>
          <span className="Tl-chip__value">{trace.spans.length}</span>
        </div>
      </div>
    </div>
  );
}
