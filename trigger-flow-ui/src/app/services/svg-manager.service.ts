import { Injectable, inject } from '@angular/core';
import { SvgIconRegistryService } from 'angular-svg-icon';

export interface SvgOptions {
  fillColor?: string;
  strokeColor?: string;
  width?: string | number;
  height?: string | number;
  className?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SvgManagerService {
  private iconRegistry = inject(SvgIconRegistryService);


  registerIcon(name: string, path: string): void {
    this.iconRegistry.loadSvg(path, name)?.subscribe();
  }

  buildSvgStyle(options: SvgOptions = {}): Record<string, string> {
    const style: Record<string, string> = {};
    
    if (options.fillColor) {
      style['fill'] = options.fillColor;
    }
    if (options.strokeColor) {
      style['stroke'] = options.strokeColor;
    }
    if (options.width) {
      style['width'] = typeof options.width === 'number' ? `${options.width}px` : options.width;
    }
    if (options.height) {
      style['height'] = typeof options.height === 'number' ? `${options.height}px` : options.height;
    }
    
    return style;
  }
}
