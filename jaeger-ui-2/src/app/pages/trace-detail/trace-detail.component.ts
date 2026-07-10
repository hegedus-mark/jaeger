import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TraceViewerComponent, GraphMode } from '../../react-bridge/trace-viewer.component';
import { TraceStateService } from '../../core/trace-state.service';
import { EventBusService } from '../../core/event-bus.service';
import { Trace, Span, JaegerDependency } from '../../../react/types';
import { JaegerApiService } from '../../core/jaeger-api.service';
import { transformTrace } from '../../core/transform-trace';

@Component({
  selector: 'app-trace-detail',
  standalone: true,
  imports: [ButtonModule, ProgressSpinnerModule, TraceViewerComponent, RouterLink],
  templateUrl: './trace-detail.component.html',
})
export class TraceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private traceState = inject(TraceStateService);
  private api = inject(JaegerApiService);
  private events = inject(EventBusService);

  traceId = '';
  trace = signal<Trace | undefined>(undefined);
  dependencies = signal<JaegerDependency[]>([]);
  mode = signal<GraphMode>('timeline');
  selectedSpan = signal<Span | null>(null);
  loading = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    this.traceId = this.route.snapshot.params['id'];

    this.traceState.state.subscribe(s => {
      this.trace.set(s.trace ?? undefined);
    });

    this.events.on<Span>('span:selected').subscribe(span => {
      this.selectedSpan.set(span);
    });

    // Check if trace came from router state (from search results)
    const nav = window.history.state as { trace?: Trace };
    if (nav?.trace) {
      this.traceState.setTrace(nav.trace);
    } else {
      // Load from API
      this.loading.set(true);
      try {
        const raw = await this.api.fetchTrace(this.traceId);
        if (raw) {
          this.traceState.setTrace(transformTrace(raw));
        } else {
          this.error.set(`Trace ${this.traceId} not found`);
        }
      } catch (err: any) {
        this.error.set(err?.message ?? 'Failed to load trace');
      } finally {
        this.loading.set(false);
      }
    }

    // Load dependencies for the DAG (async, non-blocking)
    this.loadDependencies();
  }

  private async loadDependencies(): Promise<void> {
    try {
      const deps = await this.api.fetchDependencies();
      this.dependencies.set(deps);
    } catch { /* non-critical — DAG falls back to trace-derived graph */ }
  }

  setMode(m: GraphMode): void {
    this.mode.set(m);
  }

  formatDuration(us: number): string {
    if (us < 1000) return `${us}µs`;
    if (us < 1_000_000) return `${(us / 1000).toFixed(2)}ms`;
    return `${(us / 1_000_000).toFixed(2)}s`;
  }
}
