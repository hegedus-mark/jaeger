import { Component, OnInit, signal, inject } from '@angular/core';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { JaegerApiService } from '../../core/jaeger-api.service';

interface ServiceEntry {
  name: string;
  operations: string[];
}

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [ProgressSpinnerModule],
  templateUrl: './services.component.html',
})
export class ServicesComponent implements OnInit {
  private api = inject(JaegerApiService);
  services = signal<ServiceEntry[]>([]);
  loading = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const names = await this.api.fetchServices();
      // Fetch operations for all services in parallel (cap at 20)
      const limited = names.slice(0, 20);
      const ops = await Promise.allSettled(limited.map(n => this.api.fetchOperations(n)));
      const entries: ServiceEntry[] = limited.map((name, i) => ({
        name,
        operations: ops[i].status === 'fulfilled' ? (ops[i] as PromiseFulfilledResult<string[]>).value : [],
      }));
      this.services.set(entries);
    } catch (err: any) {
      this.error.set(err?.message ?? 'Failed to load services');
    } finally {
      this.loading.set(false);
    }
  }
}
