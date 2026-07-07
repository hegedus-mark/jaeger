import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataViewModule } from 'primeng/dataview';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ServicesStateService } from '../../core/services-state.service';
import { Service } from '../../../react/types';

const MOCK_SERVICES: Service[] = [
  { name: 'frontend', operations: ['GET /', 'GET /cart', 'POST /checkout'] },
  { name: 'cart-service', operations: ['AddItem', 'RemoveItem', 'GetCart'] },
  { name: 'payment-service', operations: ['Charge', 'Refund', 'GetStatus'] },
  { name: 'inventory-service', operations: ['CheckStock', 'Reserve', 'Release'] },
  { name: 'auth-service', operations: ['Login', 'Logout', 'ValidateToken'] },
];

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, DataViewModule, TagModule, ProgressSpinnerModule],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <h1 class="text-2xl font-semibold text-white mb-6">Services</h1>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          *ngFor="let svc of services()"
          class="bg-surface-800/50 border border-white/8 rounded-xl p-5 hover:border-primary/40 transition-all"
        >
          <div class="flex items-start justify-between mb-3">
            <h2 class="text-base font-medium text-white">{{ svc.name }}</h2>
            <span class="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              {{ svc.operations.length }} ops
            </span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              *ngFor="let op of svc.operations"
              class="text-xs px-2 py-0.5 bg-white/5 text-slate-300 rounded border border-white/8"
            >
              {{ op }}
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ServicesComponent implements OnInit {
  private servicesState = inject(ServicesStateService);
  services = signal<Service[]>([]);

  ngOnInit(): void {
    // Load mock data
    this.servicesState.setServices(MOCK_SERVICES);
    this.servicesState.state.subscribe(s => this.services.set(s.services));
  }
}
