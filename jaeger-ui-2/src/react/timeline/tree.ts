import { Span } from '../types';

export interface SpanNode {
  span: Span;
  children: SpanNode[];
  depth: number;
  hasChildren: boolean;
}

/**
 * Builds a parent-child tree from a flat span list.
 * Respects CHILD_OF references where the parent spanID exists in the trace.
 * Returns the root nodes sorted by startTime.
 */
export function buildSpanTree(spans: Span[]): SpanNode[] {
  const nodeMap = new Map<string, SpanNode>();

  // Create nodes
  for (const span of spans) {
    nodeMap.set(span.spanID, { span, children: [], depth: 0, hasChildren: false });
  }

  const roots: SpanNode[] = [];

  // Wire up parent-child relationships
  for (const span of spans) {
    const node = nodeMap.get(span.spanID)!;
    const parentRef = span.references?.find(r => r.refType === 'CHILD_OF' && nodeMap.has(r.spanID));

    if (parentRef) {
      const parent = nodeMap.get(parentRef.spanID)!;
      parent.children.push(node);
      parent.hasChildren = true;
    } else {
      roots.push(node);
    }
  }

  // Assign depths and sort children by startTime
  function assignDepth(node: SpanNode, d: number) {
    node.depth = d;
    node.children.sort((a, b) => a.span.startTime - b.span.startTime);
    node.children.forEach(c => assignDepth(c, d + 1));
  }

  roots.sort((a, b) => a.span.startTime - b.span.startTime);
  roots.forEach(r => assignDepth(r, 0));

  return roots;
}

/**
 * Flattens the span tree into a display-order list.
 * Children of spans in `collapsed` are omitted.
 */
export function flattenTree(roots: SpanNode[], collapsed: Set<string>): SpanNode[] {
  const result: SpanNode[] = [];

  function visit(node: SpanNode) {
    result.push(node);
    if (node.hasChildren && !collapsed.has(node.span.spanID)) {
      node.children.forEach(visit);
    }
  }

  roots.forEach(visit);
  return result;
}

/** Returns the maximum depth across all nodes */
export function maxDepth(roots: SpanNode[]): number {
  let max = 0;
  function walk(node: SpanNode) {
    if (node.depth > max) max = node.depth;
    node.children.forEach(walk);
  }
  roots.forEach(walk);
  return max;
}
