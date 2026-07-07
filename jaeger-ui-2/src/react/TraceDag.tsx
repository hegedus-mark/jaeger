import { useEffect, useRef } from 'react';
import { Trace } from './types';

interface Props {
  trace?: Trace;
}

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  count: number;
}

interface Edge {
  from: string;
  to: string;
  count: number;
}

function buildGraph(trace: Trace): { nodes: Node[]; edges: Edge[] } {
  const nodes: Record<string, Node> = {};
  const edges: Record<string, Edge> = {};
  const W = 600, H = 320;

  // Collect unique services
  trace.services.forEach((svc, i) => {
    const angle = (i / trace.services.length) * 2 * Math.PI - Math.PI / 2;
    nodes[svc.name] = {
      id: svc.name,
      label: svc.name,
      x: W / 2 + Math.cos(angle) * 180,
      y: H / 2 + Math.sin(angle) * 120,
      count: svc.numberOfSpans,
    };
  });

  // Build edges from span references
  trace.spans.forEach(span => {
    span.references?.forEach(ref => {
      const parentSpan = trace.spans.find(s => s.spanID === ref.spanID);
      if (parentSpan && parentSpan.serviceName !== span.serviceName) {
        const key = `${parentSpan.serviceName}->${span.serviceName}`;
        edges[key] = edges[key]
          ? { ...edges[key], count: edges[key].count + 1 }
          : { from: parentSpan.serviceName, to: span.serviceName, count: 1 };
      }
    });
  });

  return { nodes: Object.values(nodes), edges: Object.values(edges) };
}

export function TraceDag({ trace }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !trace) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { nodes, edges } = buildGraph(trace);
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);

    // Draw edges
    edges.forEach(edge => {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (!from || !to) return;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = 'rgba(0,212,170,0.3)';
      ctx.lineWidth = Math.min(edge.count, 4);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const r = 28;
      const ax = to.x - Math.cos(angle) * r;
      const ay = to.y - Math.sin(angle) * r;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4));
      ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,212,170,0.6)';
      ctx.fill();
    });

    // Draw nodes
    nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,170,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#00d4aa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Truncate label
      const label = node.label.length > 10 ? node.label.slice(0, 9) + '…' : node.label;
      ctx.fillText(label, node.x, node.y - 5);
      ctx.fillStyle = '#00d4aa';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`${node.count} spans`, node.x, node.y + 8);
    });
  }, [trace]);

  if (!trace) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
        Load a trace to see the service graph
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <canvas ref={canvasRef} className="w-full h-full" style={{ minHeight: '280px' }} />
    </div>
  );
}
