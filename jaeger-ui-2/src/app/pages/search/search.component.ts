import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SearchStateService } from '../../core/search-state.service';
import { Trace } from '../../../react/types';

const MOCK_SERVICES = ['frontend', 'cart-service', 'payment-service', 'inventory-service', 'auth-service'];

function makeMockTrace(i: number): Trace {
  const services = MOCK_SERVICES.slice(0, 3);
  const duration = Math.floor(Math.random() * 200_000) + 5_000;
  return {
    traceID: `trace-${Date.now().toString(16)}-${i}`,
    duration,
    startTime: Date.now() * 1000 - i * 60_000_000,
    services: services.map(s => ({ name: s, numberOfSpans: Math.ceil(Math.random() * 10) })),
    spans: services.map((s, j) => ({
      spanID: `span-${i}-${j}`,
      operationName: ['GET /api/cart', 'POST /checkout', 'DB query', 'gRPC call'][j % 4],
      serviceName: s,
      startTime: Date.now() * 1000,
      duration: Math.floor(duration / (j + 1)),
      tags: [{ key: 'http.status_code', type: 'int64', value: 200 }],
      logs: [],
      references: j > 0 ? [{ traceID: `trace-${i}`, spanID: `span-${i}-${j - 1}`, refType: 'CHILD_OF' }] : [],
      depth: j,
    })),
  };
}

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, SelectModule, CardModule, TagModule, ProgressSpinnerModule,
  ],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <h1 class="text-2xl font-semibold text-white mb-6">Find Traces</h1>

      <!-- Search form -->
      <div class="bg-surface-800/60 border border-white/10 rounded-xl p-5 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400 uppercase tracking-wider">Service</label>
            <p-select
              [options]="serviceOptions"
              [(ngModel)]="selectedService"
              placeholder="Select service"
              styleClass="w-full"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400 uppercase tracking-wider">Operation</label>
            <input pInputText [(ngModel)]="operation" placeholder="all" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400 uppercase tracking-wider">Lookback</label>
            <p-select
              [options]="lookbackOptions"
              [(ngModel)]="lookback"
              styleClass="w-full"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400 uppercase tracking-wider">Min Duration</label>
            <input pInputText [(ngModel)]="minDuration" placeholder="e.g. 1ms" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400 uppercase tracking-wider">Max Duration</label>
            <input pInputText [(ngModel)]="maxDuration" placeholder="e.g. 5s" class="w-full" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs text-slate-400 uppercase tracking-wider">Limit</label>
            <input pInputText [(ngModel)]="limit" type="number" placeholder="20" class="w-full" />
          </div>
        </div>
        <div class="flex justify-end mt-4">
          <p-button label="Find Traces" icon="pi pi-search" (onClick)="search()" [loading]="loading()" />
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading()" class="flex justify-center py-10">
        <p-progressSpinner strokeWidth="3" styleClass="w-12 h-12" />
      </div>

      <!-- Results -->
      <div *ngIf="!loading() && results().length > 0" class="flex flex-col gap-3">
        <div class="text-sm text-slate-400 mb-1">{{ results().length }} trace(s) found</div>
        <div
          *ngFor="let trace of results()"
          class="bg-surface-800/50 border border-white/8 rounded-lg p-4 cursor-pointer hover:border-primary/50 hover:bg-surface-800 transition-all group"
          (click)="openTrace(trace)"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="text-sm font-mono text-primary group-hover:underline truncate max-w-xs">
                {{ trace.traceID }}
              </div>
              <div class="flex flex-wrap gap-1 mt-2">
                <p-tag
                  *ngFor="let svc of trace.services"
                  [value]="svc.name"
                  severity="secondary"
                  styleClass="text-xs"
                />
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-white text-sm font-medium">{{ formatDuration(trace.duration) }}</div>
              <div class="text-slate-500 text-xs mt-1">{{ trace.spans.length }} spans</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div *ngIf="!loading() && searched() && results().length === 0"
        class="text-center py-16 text-slate-500">
        <i class="pi pi-inbox text-4xl mb-3 block opacity-30"></i>
        <p>No traces found. Try adjusting your search.</p>
      </div>
    </div>
  `,
})
export class SearchComponent implements OnInit {
  private searchState = inject(SearchStateService);
  private router = inject(Router);

  selectedService = '';
  operation = '';
  lookback = '1h';
  minDuration = '';
  maxDuration = '';
  limit = 20;

  serviceOptions = MOCK_SERVICES.map(s => ({ label: s, value: s }));
  lookbackOptions = ['1h', '3h', '12h', '24h', '2d', '7d'].map(v => ({ label: `Last ${v}`, value: v }));

  loading = signal(false);
  results = signal<Trace[]>([]);
  searched = signal(false);

  ngOnInit(): void {
    this.searchState.state.subscribe(s => {
      this.loading.set(s.loading);
      this.results.set(s.results);
    });
  }

  search(): void {
    this.searched.set(true);
    this.searchState.setLoading(true);
    // Simulate API delay
    setTimeout(() => {
      const mock = Array.from({ length: 8 }, (_, i) => makeMockTrace(i));
      this.searchState.setResults(mock);
    }, 600);
  }

  openTrace(trace: Trace): void {
    this.router.navigate(['/trace', trace.traceID], { state: { trace } });
  }

  formatDuration(us: number): string {
    if (us < 1000) return `${us}µs`;
    if (us < 1_000_000) return `${(us / 1000).toFixed(2)}ms`;
    return `${(us / 1_000_000).toFixed(2)}s`;
  }
}
