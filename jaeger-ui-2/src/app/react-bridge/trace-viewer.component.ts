import {
  Component, Input, OnInit, OnDestroy, OnChanges,
  ElementRef, ViewChild, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { TraceGraph } from '../../react/TraceGraph';
import { TraceDag } from '../../react/TraceDag';
import { Trace } from '../../react/types';

export type GraphMode = 'timeline' | 'dag';

@Component({
  selector: 'app-trace-viewer',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #container class="w-full h-full"></div>`,
})
export class TraceViewerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() traceId = '';
  @Input() trace: Trace | undefined;
  @Input() mode: GraphMode = 'timeline';

  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLDivElement>;

  private root: Root | null = null;

  ngOnInit(): void {
    this.root = createRoot(this.containerRef.nativeElement);
    this.render();
  }

  ngOnChanges(): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.root?.unmount();
    this.root = null;
  }

  private render(): void {
    if (!this.root) return;
    const component = this.mode === 'dag' ? TraceDag : TraceGraph;
    this.root.render(
      createElement(component as any, { traceId: this.traceId, trace: this.trace })
    );
  }
}
