import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SearchParams, Trace } from '../../react/types';

export interface SearchState {
  params: SearchParams;
  results: Trace[];
  loading: boolean;
  error: string | null;
  services: string[];
  operations: string[];
  servicesLoading: boolean;
}

const initial: SearchState = {
  params: { lookback: '1h', limit: 20 },
  results: [],
  loading: false,
  error: null,
  services: [],
  operations: [],
  servicesLoading: false,
};

@Injectable({ providedIn: 'root' })
export class SearchStateService {
  private state$ = new BehaviorSubject<SearchState>(initial);

  readonly state = this.state$.asObservable();

  get snapshot() { return this.state$.value; }

  setParams(params: Partial<SearchParams>): void {
    this.state$.next({ ...this.state$.value, params: { ...this.state$.value.params, ...params } });
  }

  setLoading(loading: boolean): void {
    this.state$.next({ ...this.state$.value, loading, error: null });
  }

  setResults(results: Trace[]): void {
    this.state$.next({ ...this.state$.value, results, loading: false, error: null });
  }

  setServices(services: string[]): void {
    this.state$.next({ ...this.state$.value, services, servicesLoading: false });
  }

  setOperations(operations: string[]): void {
    this.state$.next({ ...this.state$.value, operations });
  }

  setError(error: string): void {
    this.state$.next({ ...this.state$.value, error, loading: false });
  }

  reset(): void {
    this.state$.next(initial);
  }
}
