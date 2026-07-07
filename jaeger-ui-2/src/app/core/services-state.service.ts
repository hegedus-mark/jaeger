import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Service } from '../../react/types';

export interface ServicesState {
  services: Service[];
  loading: boolean;
  error: string | null;
}

const initial: ServicesState = {
  services: [],
  loading: false,
  error: null,
};

@Injectable({ providedIn: 'root' })
export class ServicesStateService {
  private state$ = new BehaviorSubject<ServicesState>(initial);

  readonly state = this.state$.asObservable();

  get snapshot() { return this.state$.value; }

  setLoading(loading: boolean): void {
    this.state$.next({ ...this.state$.value, loading, error: null });
  }

  setServices(services: Service[]): void {
    this.state$.next({ ...this.state$.value, services, loading: false, error: null });
  }

  setError(error: string): void {
    this.state$.next({ ...this.state$.value, error, loading: false });
  }
}
