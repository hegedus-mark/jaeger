import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  template: `
    <div class="flex flex-col items-center justify-center h-full text-center py-24">
      <div class="text-8xl font-bold text-white/5 mb-4">404</div>
      <h1 class="text-2xl font-semibold text-white mb-2">Page Not Found</h1>
      <p class="text-slate-400 mb-8">The page you're looking for doesn't exist.</p>
      <p-button label="Back to Search" icon="pi pi-search" routerLink="/search" />
    </div>
  `,
})
export class NotFoundComponent {}
