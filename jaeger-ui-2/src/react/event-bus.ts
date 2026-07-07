// Copyright (c) 2024 Jaeger Authors.
// SPDX-License-Identifier: Apache-2.0

import { Subject, Observable, filter, map } from 'rxjs';

export interface BusEvent<T = unknown> {
  type: string;
  payload: T;
}

/**
 * Plain TypeScript singleton EventBus.
 * Imported directly by both Angular services and React components.
 * Uses RxJS Subject under the hood so Angular can subscribe reactively.
 */
class EventBusClass {
  private bus$ = new Subject<BusEvent>();

  emit<T>(type: string, payload: T): void {
    this.bus$.next({ type, payload });
  }

  on<T>(type: string): Observable<T> {
    return this.bus$.pipe(
      filter(e => e.type === type),
      map(e => e.payload as T)
    );
  }
}

export const eventBus = new EventBusClass();
