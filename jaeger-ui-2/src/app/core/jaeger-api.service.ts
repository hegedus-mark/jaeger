import { Injectable } from '@angular/core';

/**
 * Jaeger HTTP API v1 Angular service.
 * All requests go through the Angular dev-server proxy at /api → localhost:16686.
 * In production, serve from the same origin as Jaeger (or configure your reverse proxy).
 */

// ── Response shapes ──────────────────────────────────────────────────────────

export interface JaegerTag {
  key: string;
  type: string;
  value: string | number | boolean;
}

export interface JaegerLog {
  timestamp: number;
  fields: JaegerTag[];
}

export interface JaegerRef {
  refType: 'CHILD_OF' | 'FOLLOWS_FROM';
  traceID: string;
  spanID: string;
}

export interface JaegerSpan {
  traceID: string;
  spanID: string;
  operationName: string;
  references: JaegerRef[];
  startTime: number;   // microseconds
  duration: number;    // microseconds
  tags: JaegerTag[];
  logs: JaegerLog[];
  processID: string;
  warnings?: string[];
}

export interface JaegerProcess {
  serviceName: string;
  tags: JaegerTag[];
}

export interface JaegerTrace {
  traceID: string;
  spans: JaegerSpan[];
  processes: Record<string, JaegerProcess>;
  warnings?: string[];
}

export interface JaegerDependency {
  parent: string;
  child: string;
  callCount: number;
}

export interface TraceSearchParams {
  service?: string;
  operation?: string;
  tags?: string;
  start?: number;        // microseconds
  end?: number;          // microseconds
  minDuration?: string;
  maxDuration?: string;
  limit?: number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class JaegerApiService {

  private async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(`/api/${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') {
          url.searchParams.set(k, String(v));
        }
      });
    }
    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Jaeger API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async fetchServices(): Promise<string[]> {
    const res = await this.get<{ data: string[] }>('services');
    return res.data ?? [];
  }

  async fetchOperations(service: string): Promise<string[]> {
    const res = await this.get<{ data: string[] }>(
      `services/${encodeURIComponent(service)}/operations`
    );
    return res.data ?? [];
  }

  async searchTraces(params: TraceSearchParams): Promise<JaegerTrace[]> {
    const res = await this.get<{ data: JaegerTrace[] }>('traces', {
      service: params.service,
      operation: params.operation,
      tags: params.tags,
      start: params.start,
      end: params.end,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
      limit: params.limit ?? 20,
    });
    return res.data ?? [];
  }

  async fetchTrace(traceId: string): Promise<JaegerTrace | null> {
    const res = await this.get<{ data: JaegerTrace[] }>(`traces/${traceId}`);
    return res.data?.[0] ?? null;
  }

  async fetchDependencies(
    endTs = Date.now(),
    lookback = 7 * 24 * 60 * 60 * 1000
  ): Promise<JaegerDependency[]> {
    const res = await this.get<{ data: JaegerDependency[] }>('dependencies', { endTs, lookback });
    return res.data ?? [];
  }
}
