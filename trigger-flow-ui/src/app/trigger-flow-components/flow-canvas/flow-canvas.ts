import { Component, ViewChild, HostListener } from '@angular/core';
import { FFlowModule, FFlowComponent } from '@foblex/flow';
import { CommonModule } from '@angular/common';

interface FlowNode {
  id: string;
  position: { x: number; y: number };
  svgPath: string;
}

@Component({
  selector: 'app-flow-canvas',
  imports: [
    FFlowModule,
    CommonModule
  ],
  templateUrl: './flow-canvas.html',
  styleUrl: './flow-canvas.css',
})
export class FlowCanvas {
  @ViewChild(FFlowComponent) flowComponent!: FFlowComponent;
  
  nodes: FlowNode[] = [];
  private nodeCounter = 0;

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    console.log('Drag over canvas');
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Drop event triggered');
    
    const shapeType = event.dataTransfer?.getData('application/shape-type');
    const svgPath = event.dataTransfer?.getData('application/svg-path');
    
    console.log('Shape type:', shapeType);
    console.log('SVG path:', svgPath);
    
    if (shapeType && svgPath) {
      const canvasRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const x = event.clientX - canvasRect.left;
      const y = event.clientY - canvasRect.top;
      
      const newNode: FlowNode = {
        id: `node-${++this.nodeCounter}`,
        position: { x: Math.max(0, x - 75), y: Math.max(0, y - 40) },
        svgPath: svgPath
      };
      
      this.nodes = [...this.nodes, newNode];
      console.log('Node added:', newNode);
      console.log('Total nodes:', this.nodes.length);
    } else {
      console.log('No shape data received');
    }
  }
}
