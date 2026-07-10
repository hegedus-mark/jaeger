import { useEffect, useRef } from 'react';
import { DirectedGraph, LayoutManager } from '@jaegertracing/plexus';
import type { TEdge, TVertex } from '@jaegertracing/plexus/lib/types';
import type { Trace, JaegerDependency } from './types';

// ── Inline dark-mode CSS for plexus nodes ────────────────────────────────────
const DAG_STYLES = `
  :root {
    --border-strong: rgba(255,255,255,0.15);
    --border-default: rgba(255,255,255,0.1);
    --surface-primary: #0f172a;
    --surface-component-background: #1e293b;
    --text-primary: #f1f5f9;
    --text-secondary: #94a3b8;
  }
  .jaeger-dag-wrap { width:100%; height:100%; min-height:320px; position:relative; }
  .jaeger-dag-wrap .DGraph { background: #0f172a; }
  .jaeger-dag-wrap .DGraph--edges path { stroke: rgba(255,255,255,0.2); stroke-width:1.5; fill:none; }
  .jaeger-dag-wrap .DGraph--edges marker { fill: rgba(255,255,255,0.3); }
  .dag-node { display:flex; flex-direction:column; align-items:center; cursor:pointer; }
  .dag-node__circle {
    width:48px; height:48px; border-radius:50%; border:1.5px solid rgba(255,255,255,0.15);
    background:#1e293b; margin-bottom:28px;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    transition:border-color .15s, background .15s;
  }
  .dag-node__circle.focal { border-color:#00d4aa; background:rgba(0,212,170,0.12); }
  .dag-node__label {
    position:absolute; top:52px; white-space:nowrap; font-size:11px; font-weight:600;
    color:#94a3b8; background:#0f172a; padding:0 4px; text-align:center;
  }
`;

interface Props {
  trace?: Trace;
  dependencies?: JaegerDependency[];
  selectedService?: string;
}

function buildFromTrace(trace: Trace): { vertices: TVertex[]; edges: TEdge[] } {
  const keys = new Set<string>(trace.services.map(s => s.name));
  const vertices: TVertex[] = Array.from(keys).map(key => ({ key }));

  const edgeMap = new Map<string, TEdge>();
  trace.spans.forEach(span => {
    (span.references ?? []).forEach(ref => {
      if (ref.refType !== 'CHILD_OF') return;
      const parent = trace.spans.find(s => s.spanID === ref.spanID);
      if (!parent || parent.serviceName === span.serviceName) return;
      const k = `${parent.serviceName}→${span.serviceName}`;
      if (!edgeMap.has(k)) edgeMap.set(k, { from: parent.serviceName, to: span.serviceName });
    });
  });

  return { vertices, edges: Array.from(edgeMap.values()) };
}

function buildFromDeps(deps: JaegerDependency[]): { vertices: TVertex[]; edges: TEdge[] } {
  const keys = new Set<string>();
  deps.forEach(d => { keys.add(d.parent); keys.add(d.child); });
  return {
    vertices: Array.from(keys).map(key => ({ key })),
    edges: deps.map(d => ({ from: d.parent, to: d.child })),
  };
}

export function TraceDag({ trace, dependencies, selectedService = '' }: Props) {
  const lmRef = useRef<InstanceType<typeof LayoutManager> | null>(null);

  // Inject CSS once
  useEffect(() => {
    const id = 'jaeger-dag-styles';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = DAG_STYLES;
      document.head.appendChild(el);
    }
  }, []);

  useEffect(() => {
    return () => {
      lmRef.current?.stopAndRelease();
      lmRef.current = null;
    };
  }, []);

  const hasData = trace || (dependencies && dependencies.length > 0);

  if (!hasData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#64748b', fontSize: 14 }}>
        Load a trace or fetch dependencies to see the service graph
      </div>
    );
  }

  const { vertices, edges } = trace
    ? buildFromTrace(trace)
    : buildFromDeps(dependencies!);

  if (vertices.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: '#64748b', fontSize: 14 }}>
        No service relationships found in this trace
      </div>
    );
  }

  if (!lmRef.current) {
    lmRef.current = new LayoutManager({ useDotEdges: true, rankdir: 'LR', ranksep: 2.5 });
  }

  const getNodeLabel = (vtx: TVertex) => (
    <div className="dag-node">
      <div className={`dag-node__circle${vtx.key === selectedService ? ' focal' : ''}`} />
      <div className="dag-node__label">{vtx.key}</div>
    </div>
  );

  return (
    <div className="jaeger-dag-wrap">
      <DirectedGraph
        layoutManager={lmRef.current}
        vertices={vertices}
        edges={edges}
        getNodeLabel={getNodeLabel}
        zoom
        minimap
        minimapClassName="Minimap--minimap"
      />
    </div>
  );
}
