import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Trace, Span } from '../../react/types';

export interface TraceState {
  trace: Trace | null;
  selectedSpan: Span | null;
  loading: boolean;
  error: string | null;
}

const initial: TraceState = {
  trace: null,
  selectedSpan: null,
  loading: false,
  error: null,
};

@Injectable({ providedIn: 'root' })
export class TraceStateService {
  private state$ = new BehaviorSubject<TraceState>(initial);

  readonly state = this.state$.asObservable();

  get snapshot() { return this.state$.value; }

  setLoading(loading: boolean): void {
    this.state$.next({ ...this.state$.value, loading, error: null });
  }

  setTrace(trace: Trace): void {
    this.state$.next({ ...this.state$.value, trace, loading: false, error: null });
  }

  selectSpan(span: Span | null): void {
    this.state$.next({ ...this.state$.value, selectedSpan: span });
  }

  setError(error: string): void {
    this.state$.next({ ...this.state$.value, error, loading: false });
  }

  clear(): void {
    this.state$.next(initial);
  }
}
