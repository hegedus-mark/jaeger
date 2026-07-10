import {
  Component, Input, OnInit, OnDestroy, OnChanges,
  ElementRef, ViewChild, ChangeDetectionStrategy,
} from '@angular/core';
import { createRoot, Root } from 'react-dom/client';
import { createElement } from 'react';
import { TraceTimeline } from '../../react/timeline/TraceTimeline';
import { TraceDag } from '../../react/TraceDag';
import { Trace, JaegerDependency } from '../../react/types';

export type GraphMode = 'timeline' | 'dag';

@Component({
  selector: 'app-trace-viewer',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #container class="w-full h-full"></div>`,
})
export class TraceViewerComponent implements OnInit, OnChanges, OnDestroy {
  @Input() traceId = '';
  @Input() trace: Trace | undefined;
  @Input() dependencies: JaegerDependency[] = [];
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
    if (this.mode === 'dag') {
      this.root.render(
        createElement(TraceDag, { trace: this.trace, dependencies: this.dependencies })
      );
    } else {
      // Only render if we have a trace — TraceTimeline requires it
      if (!this.trace) return;
      this.root.render(
        createElement(TraceTimeline, { traceId: this.traceId, trace: this.trace })
      );
    }
  }
}
