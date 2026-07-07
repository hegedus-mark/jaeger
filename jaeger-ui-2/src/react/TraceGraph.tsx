import { useEffect, useState } from 'react';
import { eventBus } from './event-bus';
import { Trace, Span } from './types';

interface Props {
  traceId: string;
  trace?: Trace;
}

function formatDuration(microseconds: number): string {
  if (microseconds < 1000) return `${microseconds}µs`;
  if (microseconds < 1_000_000) return `${(microseconds / 1000).toFixed(2)}ms`;
  return `${(microseconds / 1_000_000).toFixed(2)}s`;
}

function SpanRow({ span, totalDuration, depth }: { span: Span; totalDuration: number; depth: number }) {
  const [selected, setSelected] = useState(false);
  const widthPct = Math.max(1, (span.duration / totalDuration) * 100);
  const leftPct = ((span.startTime % totalDuration) / totalDuration) * 100;

  const handleClick = () => {
    setSelected(!selected);
    eventBus.emit('span:selected', span);
  };

  return (
    <div
      onClick={handleClick}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className={`flex items-center gap-3 px-2 py-1.5 cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors ${selected ? 'bg-primary/10' : ''}`}
    >
      <div className="w-36 shrink-0 truncate text-xs text-slate-300">{span.serviceName}</div>
      <div className="w-48 shrink-0 truncate text-xs text-white">{span.operationName}</div>
      <div className="flex-1 relative h-5 bg-white/5 rounded">
        <div
          className="absolute h-full rounded bg-primary/70"
          style={{ left: `${Math.min(leftPct, 90)}%`, width: `${widthPct}%` }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-xs text-slate-400">{formatDuration(span.duration)}</div>
    </div>
  );
}

export function TraceGraph({ traceId, trace }: Props) {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  useEffect(() => {
    const sub = eventBus.on<Span>('span:selected').subscribe(span => {
      setSelectedSpan(span);
    });
    return () => sub.unsubscribe();
  }, []);

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-sm">No trace loaded for <code className="text-primary">{traceId}</code></p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-sans">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-white/10 bg-white/3">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Trace ID</div>
          <div className="text-sm text-primary font-mono">{trace.traceID.slice(0, 16)}…</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Duration</div>
          <div className="text-sm text-white">{formatDuration(trace.duration)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Spans</div>
          <div className="text-sm text-white">{trace.spans.length}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Services</div>
          <div className="text-sm text-white">{trace.services.length}</div>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-2 py-1 border-b border-white/10 bg-white/5">
        <div className="w-36 shrink-0 text-xs text-slate-500 uppercase tracking-wider">Service</div>
        <div className="w-48 shrink-0 text-xs text-slate-500 uppercase tracking-wider">Operation</div>
        <div className="flex-1 text-xs text-slate-500 uppercase tracking-wider">Timeline</div>
        <div className="w-20 shrink-0 text-right text-xs text-slate-500 uppercase tracking-wider">Duration</div>
      </div>

      {/* Span rows */}
      <div className="overflow-auto flex-1">
        {trace.spans.map(span => (
          <SpanRow
            key={span.spanID}
            span={span}
            totalDuration={trace.duration}
            depth={span.depth ?? 0}
          />
        ))}
      </div>

      {/* Selected span detail */}
      {selectedSpan && (
        <div className="border-t border-white/10 bg-surface-900 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-white">{selectedSpan.operationName}</h3>
            <button
              onClick={() => setSelectedSpan(null)}
              className="text-slate-500 hover:text-white transition-colors text-xs"
            >
              ✕ close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">Service:</span> <span className="text-slate-200">{selectedSpan.serviceName}</span></div>
            <div><span className="text-slate-500">Duration:</span> <span className="text-slate-200">{formatDuration(selectedSpan.duration)}</span></div>
            <div className="col-span-2"><span className="text-slate-500">Span ID:</span> <span className="text-primary font-mono">{selectedSpan.spanID}</span></div>
          </div>
          {selectedSpan.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedSpan.tags.slice(0, 6).map(t => (
                <span key={t.key} className="px-1.5 py-0.5 bg-white/10 rounded text-xs text-slate-300">
                  {t.key}={String(t.value)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
