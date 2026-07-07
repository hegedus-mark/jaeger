import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { eventBus } from '../../react/event-bus';

/**
 * Angular injectable wrapper around the plain TS singleton eventBus.
 * Inject this in Angular components/services; import eventBus directly in React.
 */
@Injectable({ providedIn: 'root' })
export class EventBusService {
  emit<T>(type: string, payload: T): void {
    eventBus.emit(type, payload);
  }

  on<T>(type: string): Observable<T> {
    return eventBus.on<T>(type);
  }
}
