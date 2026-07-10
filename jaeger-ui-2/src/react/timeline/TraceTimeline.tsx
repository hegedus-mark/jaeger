import { useState, useMemo, useCallback } from 'react';
import { Trace } from '../types';
import { eventBus } from '../event-bus';
import { buildSpanTree, flattenTree, maxDepth, SpanNode } from './tree';
import { TraceHeader } from './TraceHeader';
import { TimelineRuler } from './TimelineRuler';
import { SpanRow } from './SpanRow';
import { SpanDetail } from './SpanDetail';
// Styles are in src/styles.css (timeline.css is appended there at build time)

const NAME_WIDTH = 320; // px — TODO: make draggable (see TODO.md)
const NUM_TICKS = 5;

interface Props {
  traceId: string;
  trace: Trace;
}

export function TraceTimeline({ traceId: _traceId, trace }: Props) {
  // Build tree once per trace
  const roots = useMemo(() => buildSpanTree(trace.spans), [trace]);
  const depth = useMemo(() => maxDepth(roots), [roots]);

  // Collapse state: set of spanIDs whose children are hidden
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Which span has its detail panel open
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);

  // Flat ordered display list (respects collapse)
  const flat: SpanNode[] = useMemo(() => flattenTree(roots, collapsed), [roots, collapsed]);

  const toggleCollapse = useCallback((spanID: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(spanID)) next.delete(spanID);
      else next.add(spanID);
      return next;
    });
  }, []);

  const toggleDetail = useCallback((spanID: string) => {
    setExpandedDetail(prev => {
      const next = prev === spanID ? null : spanID;
      // Fire EventBus when opening a span detail
      if (next) {
        const node = flat.find(n => n.span.spanID === spanID);
        if (node) eventBus.emit('span:selected', node.span);
      }
      return next;
    });
  }, [flat]);

  return (
    <div className="Tl">
      <TraceHeader trace={trace} maxDepth={depth} />

      <div className="Tl-grid">
        <TimelineRuler
          nameWidth={NAME_WIDTH}
          numTicks={NUM_TICKS}
          traceDuration={trace.duration}
        />

        <div className="Tl-rows">
          {flat.map(node => (
            <div key={node.span.spanID}>
              <SpanRow
                node={node}
                traceStart={trace.startTime}
                traceDuration={trace.duration}
                nameWidth={NAME_WIDTH}
                numTicks={NUM_TICKS}
                isCollapsed={collapsed.has(node.span.spanID)}
                isDetailExpanded={expandedDetail === node.span.spanID}
                onToggleCollapse={toggleCollapse}
                onToggleDetail={toggleDetail}
              />
              {expandedDetail === node.span.spanID && (
                <SpanDetail
                  span={node.span}
                  traceStart={trace.startTime}
                  onClose={() => setExpandedDetail(null)}
                />
              )}
            </div>
          ))}

          {flat.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#475569', fontSize: 13 }}>
              No spans to display
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
