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

  onCreateNode(event: any) {
    // FCreateNodeEvent: { rect, data, fTargetNode?, fDropPosition? }
    console.log('fCreateNode event:', event);
    if (event.data && event.data.type === 'rectangle') {
      const newNode: FlowNode = {
        id: `node-${++this.nodeCounter}`,
        position: { x: event.rect.x, y: event.rect.y },
        svgPath: event.data.svgPath
      };
      this.nodes = [...this.nodes, newNode];
    }
  }

  onMoveNodes(event: any) {
    // event.items is an array of { id, position }
    const updates = new Map<string, { x: number; y: number }>(
      event.items.map((item: any) => [item.id, { x: item.position.x, y: item.position.y }])
    );
    this.nodes = this.nodes.map((node): FlowNode => {
      const newPos = updates.get(node.id);
      if (newPos) {
        return { ...node, position: newPos };
      }
      return node;
    });
  }
}
