// Shared types used by both Angular and React layers

export interface Span {
  spanID: string;
  operationName: string;
  serviceName: string;
  startTime: number;   // microseconds
  duration: number;    // microseconds
  tags: Tag[];
  logs: Log[];
  references: SpanRef[];
  depth?: number;
}

export interface Tag {
  key: string;
  type: string;
  value: string | number | boolean;
}

export interface Log {
  timestamp: number;
  fields: Tag[];
}

export interface SpanRef {
  traceID: string;
  spanID: string;
  refType: 'CHILD_OF' | 'FOLLOWS_FROM';
}

export interface Trace {
  traceID: string;
  spans: Span[];
  services: Array<{ name: string; numberOfSpans: number }>;
  duration: number;
  startTime: number;
}

export interface Service {
  name: string;
  operations: string[];
}

export interface SearchParams {
  service?: string;
  operation?: string;
  tags?: string;
  lookback?: string;
  minDuration?: string;
  maxDuration?: string;
  limit?: number;
}
