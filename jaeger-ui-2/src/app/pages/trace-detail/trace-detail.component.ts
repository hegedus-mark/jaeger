import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { TraceViewerComponent, GraphMode } from '../../react-bridge/trace-viewer.component';
import { TraceStateService } from '../../core/trace-state.service';
import { EventBusService } from '../../core/event-bus.service';
import { Trace, Span } from '../../../react/types';

@Component({
  selector: 'app-trace-detail',
  standalone: true,
  imports: [CommonModule, ButtonModule, TabsModule, TraceViewerComponent],
  template: `
    <div class="flex flex-col h-full p-4 gap-4">
      <!-- Breadcrumb -->
      <div class="flex items-center gap-2 text-sm text-slate-400">
        <a routerLink="/search" class="hover:text-primary transition-colors cursor-pointer">Search</a>
        <span class="pi pi-chevron-right text-xs"></span>
        <span class="text-white font-mono text-xs truncate max-w-xs">{{ traceId }}</span>
      </div>

      <!-- Mode tabs -->
      <div class="flex items-center gap-2">
        <p-button
          label="Timeline"
          [outlined]="mode() !== 'timeline'"
          size="small"
          (onClick)="setMode('timeline')"
          icon="pi pi-bars"
        />
        <p-button
          label="Service Graph"
          [outlined]="mode() !== 'dag'"
          size="small"
          (onClick)="setMode('dag')"
          icon="pi pi-share-alt"
        />
      </div>

      <!-- React Graph -->
      <div class="flex-1 bg-surface-900/80 border border-white/10 rounded-xl overflow-hidden" style="min-height: 480px">
        <app-trace-viewer
          [traceId]="traceId"
          [trace]="trace()"
          [mode]="mode()"
          class="block w-full h-full"
        />
      </div>

      <!-- Selected span event listener info -->
      <div *ngIf="selectedSpan()"
        class="bg-surface-800/60 border border-primary/30 rounded-lg p-3 text-xs text-slate-300">
        <span class="text-primary font-medium">EventBus →</span>
        span:selected fired from React:
        <code class="ml-1 text-white">{{ selectedSpan()?.operationName }}</code>
        ({{ selectedSpan()?.serviceName }})
      </div>
    </div>
  `,
})
export class TraceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private traceState = inject(TraceStateService);
  private events = inject(EventBusService);

  traceId = '';
  trace = signal<Trace | undefined>(undefined);
  mode = signal<GraphMode>('timeline');
  selectedSpan = signal<Span | null>(null);

  ngOnInit(): void {
    this.traceId = this.route.snapshot.params['id'];

    // Grab trace from router state (passed from search results)
    const nav = window.history.state as { trace?: Trace };
    if (nav?.trace) {
      this.traceState.setTrace(nav.trace);
    }

    this.traceState.state.subscribe(s => {
      this.trace.set(s.trace ?? undefined);
    });

    // Listen to span selection events fired by React
    this.events.on<Span>('span:selected').subscribe(span => {
      this.selectedSpan.set(span);
    });
  }

  setMode(m: GraphMode): void {
    this.mode.set(m);
  }
}
