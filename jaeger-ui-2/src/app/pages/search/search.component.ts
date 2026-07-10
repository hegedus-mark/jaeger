import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { SearchStateService } from '../../core/search-state.service';
import { Trace } from '../../../react/types';
import { JaegerApiService } from '../../core/jaeger-api.service';
import { transformTrace } from '../../core/transform-trace';

const LOOKBACK_OPTIONS = [
  { label: 'Last 1 hour', value: '1h', ms: 60 * 60 * 1000 },
  { label: 'Last 3 hours', value: '3h', ms: 3 * 60 * 60 * 1000 },
  { label: 'Last 12 hours', value: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: 'Last 24 hours', value: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 2 days', value: '2d', ms: 2 * 24 * 60 * 60 * 1000 },
  { label: 'Last 7 days', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule, InputTextModule, SelectModule, TagModule,
    ProgressSpinnerModule, MessageModule,
  ],
  templateUrl: './search.component.html',
})
export class SearchComponent implements OnInit {
  private searchState = inject(SearchStateService);
  private api = inject(JaegerApiService);
  private router = inject(Router);

  selectedService = '';
  selectedOperation = 'all';
  lookback = '1h';
  tags = '';
  minDuration = '';
  limit = 20;

  lookbackOptions = LOOKBACK_OPTIONS;

  loading = signal(false);
  servicesLoading = signal(false);
  results = signal<Trace[]>([]);
  searched = signal(false);
  apiError = signal(false);
  searchError = signal('');
  serviceOptions = signal<Array<{ label: string; value: string }>>([]);
  operationOptions = signal<Array<{ label: string; value: string }>>([{ label: 'all', value: 'all' }]);

  async ngOnInit(): Promise<void> {
    this.searchState.state.subscribe(s => {
      this.loading.set(s.loading);
      this.results.set(s.results);
      this.serviceOptions.set(s.services.map(s => ({ label: s, value: s })));
    });

    // Load services from Jaeger
    this.servicesLoading.set(true);
    try {
      const services = await this.api.fetchServices();
      this.searchState.setServices(services);
      this.apiError.set(false);
    } catch {
      this.apiError.set(true);
    } finally {
      this.servicesLoading.set(false);
    }
  }

  async onServiceChange(service: string): Promise<void> {
    this.selectedOperation = 'all';
    this.operationOptions.set([{ label: 'all', value: 'all' }]);
    if (!service) return;
    try {
      const ops = await this.api.fetchOperations(service);
      this.operationOptions.set([
        { label: 'all', value: 'all' },
        ...ops.map(o => ({ label: o, value: o })),
      ]);
    } catch { /* ignore */ }
  }

  async search(): Promise<void> {
    if (!this.selectedService) return;
    this.searched.set(true);
    this.searchError.set('');
    this.searchState.setLoading(true);

    const lookbackMs = LOOKBACK_OPTIONS.find(o => o.value === this.lookback)?.ms ?? 3600_000;
    const end = Date.now() * 1000;    // microseconds
    const start = end - lookbackMs * 1000;

    try {
      const raw = await this.api.searchTraces({
        service: this.selectedService,
        operation: this.selectedOperation !== 'all' ? this.selectedOperation : undefined,
        tags: this.tags || undefined,
        minDuration: this.minDuration || undefined,
        limit: this.limit,
        start,
        end,
      });
      const traces = raw.map(transformTrace);
      this.searchState.setResults(traces);
    } catch (err: any) {
      this.searchError.set(err?.message ?? 'Search failed');
      this.searchState.setLoading(false);
    }
  }

  openTrace(trace: Trace): void {
    this.router.navigate(['/trace', trace.traceID], { state: { trace } });
  }

  formatDuration(us: number): string {
    if (us < 1000) return `${us}µs`;
    if (us < 1_000_000) return `${(us / 1000).toFixed(2)}ms`;
    return `${(us / 1_000_000).toFixed(2)}s`;
  }

  formatTs(us: number): string {
    return new Date(us / 1000).toLocaleString();
  }
}
