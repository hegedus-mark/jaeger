import { Span, Tag } from '../types';
import { getServiceColor } from './colors';

function formatDuration(us: number): string {
  if (us < 1000) return `${Math.round(us)}µs`;
  if (us < 1_000_000) return `${(us / 1000).toFixed(3)}ms`;
  return `${(us / 1_000_000).toFixed(3)}s`;
}

function formatTs(us: number): string {
  return new Date(us / 1000).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

interface Props {
  span: Span;
  traceStart: number;
  onClose: () => void;
}

export function SpanDetail({ span, traceStart, onClose }: Props) {
  const color = getServiceColor(span.serviceName);
  const relativeStart = span.startTime - traceStart;

  // Separate process-level tags from span-level tags
  const errorTags = span.tags.filter(t => t.key === 'error');
  const regularTags = span.tags.filter(t => t.key !== 'error');

  return (
    <div className="Tl-detail">
      {/* Title row */}
      <div className="Tl-detail__title">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
          {span.serviceName} — {span.operationName}
          {errorTags.length > 0 && (
            <span style={{ fontSize: 10, background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>
              ERROR
            </span>
          )}
        </span>
        <button className="Tl-detail__close" onClick={onClose}>✕ close</button>
      </div>

      {/* Metadata grid */}
      <div className="Tl-detail__meta">
        <div className="Tl-detail__field">
          <span className="Tl-detail__key">Span ID:</span>
          <span className="Tl-detail__val Tl-detail__val--mono">{span.spanID}</span>
        </div>
        <div className="Tl-detail__field">
          <span className="Tl-detail__key">Duration:</span>
          <span className="Tl-detail__val">{formatDuration(span.duration)}</span>
        </div>
        <div className="Tl-detail__field">
          <span className="Tl-detail__key">Start (abs):</span>
          <span className="Tl-detail__val">{formatTs(span.startTime)}</span>
        </div>
        <div className="Tl-detail__field">
          <span className="Tl-detail__key">Start (+trace):</span>
          <span className="Tl-detail__val">+{formatDuration(relativeStart)}</span>
        </div>
      </div>

      {/* Tags */}
      {regularTags.length > 0 && (
        <div className="Tl-detail__section">
          <div className="Tl-detail__section-title">Tags ({regularTags.length})</div>
          <div className="Tl-detail__tags">
            {regularTags.map((t: Tag) => (
              <span key={t.key} className="Tl-detail__tag">
                <span className="Tl-detail__tag-key">{t.key}</span>
                <span className="Tl-detail__tag-eq">=</span>
                <span className="Tl-detail__tag-val">{String(t.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Logs / events */}
      {span.logs && span.logs.length > 0 && (
        <div className="Tl-detail__section">
          <div className="Tl-detail__section-title">Logs ({span.logs.length})</div>
          {span.logs.slice(0, 8).map((log, idx) => (
            <div key={idx} className="Tl-detail__log">
              <span className="Tl-detail__log-ts">+{formatDuration(log.timestamp - traceStart)}</span>
              {log.fields.map((f: Tag) => (
                <span key={f.key} style={{ marginRight: 8 }}>
                  <span style={{ color: '#7dd3fc' }}>{f.key}</span>
                  <span style={{ color: '#475569' }}>=</span>
                  <span>{String(f.value)}</span>
                </span>
              ))}
            </div>
          ))}
          {span.logs.length > 8 && (
            <div className="Tl-detail__log" style={{ color: '#475569' }}>
              … {span.logs.length - 8} more logs
            </div>
          )}
        </div>
      )}
    </div>
  );
}
