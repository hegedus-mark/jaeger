import { JaegerTrace } from './jaeger-api.service';
import { Trace, Span, Tag, Log } from '../../react/types';

/**
 * Converts a Jaeger HTTP API v1 trace response into our shared Trace model.
 * Resolves processID → serviceName and computes span depth.
 */
export function transformTrace(raw: JaegerTrace): Trace {
  const spanMap = new Map(raw.spans.map(s => [s.spanID, s]));

  const depthMap = new Map<string, number>();
  function getDepth(spanID: string, visited = new Set<string>()): number {
    if (depthMap.has(spanID)) return depthMap.get(spanID)!;
    if (visited.has(spanID)) return 0;
    visited.add(spanID);
    const span = spanMap.get(spanID);
    if (!span) return 0;
    const parent = span.references?.find(r => r.refType === 'CHILD_OF');
    if (!parent) { depthMap.set(spanID, 0); return 0; }
    const d = getDepth(parent.spanID, visited) + 1;
    depthMap.set(spanID, d);
    return d;
  }
  raw.spans.forEach(s => getDepth(s.spanID));

  const spans: Span[] = raw.spans.map(s => ({
    spanID: s.spanID,
    operationName: s.operationName,
    serviceName: raw.processes[s.processID]?.serviceName ?? s.processID,
    startTime: s.startTime,
    duration: s.duration,
    depth: depthMap.get(s.spanID) ?? 0,
    tags: (s.tags ?? []).map(t => ({ key: t.key, type: t.type, value: t.value } as Tag)),
    logs: (s.logs ?? []).map(l => ({
      timestamp: l.timestamp,
      fields: l.fields.map(f => ({ key: f.key, type: f.type, value: f.value } as Tag)),
    } as Log)),
    references: (s.references ?? []).map(r => ({
      traceID: r.traceID, spanID: r.spanID, refType: r.refType,
    })),
  }));

  spans.sort((a, b) => a.startTime - b.startTime);

  const svcCounts = new Map<string, number>();
  spans.forEach(s => svcCounts.set(s.serviceName, (svcCounts.get(s.serviceName) ?? 0) + 1));
  const services = Array.from(svcCounts.entries()).map(([name, numberOfSpans]) => ({ name, numberOfSpans }));

  const startTime = Math.min(...spans.map(s => s.startTime));
  const endTime = Math.max(...spans.map(s => s.startTime + s.duration));

  return { traceID: raw.traceID, spans, services, startTime, duration: endTime - startTime };
}
