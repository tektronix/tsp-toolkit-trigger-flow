import { Directive, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core';

@Directive({
  selector: '[appSvgIdNamespace]',
  standalone: true,
})
export class SvgIdNamespaceDirective implements OnInit, OnDestroy {
  @Input({ required: true }) appSvgIdNamespace!: string;

  private observer: MutationObserver | null = null;

  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnInit(): void {
    this.observer = new MutationObserver(() => {
      const svg = this.host.nativeElement.querySelector('svg');
      if (svg) {
        this.rewriteIds(svg);
        this.observer?.disconnect();
        this.observer = null;
      }
    });

    this.observer.observe(this.host.nativeElement, {
      childList: true,
      subtree: true,
    });

    // Handle the case where the SVG is already present (e.g. cached icon).
    const existing = this.host.nativeElement.querySelector('svg');
    if (existing) {
      this.rewriteIds(existing);
      this.observer.disconnect();
      this.observer = null;
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private rewriteIds(svg: SVGElement): void {
    const prefix = this.appSvgIdNamespace;
    svg.querySelectorAll('[id]').forEach((el) => {
      el.id = `${prefix}+${el.id}`;
    });
  }
}
