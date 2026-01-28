import { Component } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-palette',
  imports: [],
  templateUrl: './palette.html',
  styleUrl: './palette.css',
})
export class Palette {
  rectangleSvg = 'assets/shapes/rectangle.svg';

  constructor(private sanitizer: DomSanitizer) {}

  onDragStart(event: DragEvent, shapeType: string) {
    console.log('Drag started:', shapeType);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('application/shape-type', shapeType);
      event.dataTransfer.setData('application/svg-path', this.rectangleSvg);
      console.log('Data set:', { shapeType, svgPath: this.rectangleSvg });
    }
  }
}
