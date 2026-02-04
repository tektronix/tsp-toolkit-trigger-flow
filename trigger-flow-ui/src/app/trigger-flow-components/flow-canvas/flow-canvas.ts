import { Component, ViewChild, signal } from '@angular/core';
import { FFlowModule, FFlowComponent } from '@foblex/flow';
import { CommonModule } from '@angular/common';

interface FlowNode {
  id: string;
  position: { x: number; y: number };
  svgPath: string;
  input?: string;
  outputs: string[];
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

  nodes = signal<FlowNode[]>([]);
  private nodeCounter = 0;

  onCreateNode(event: any) {
    // FCreateNodeEvent: { rect, data, fTargetNode?, fDropPosition? }
    console.log('fCreateNode event:', event);
    if (event.data === 'rectangle') {
      const newNode: FlowNode = {
        id: `node-${++this.nodeCounter}`,
        position: { x: event.rect.x, y: event.rect.y },
        svgPath: 'assets/shapes/rectangle.svg',
        input: `input-${this.nodeCounter}`,
        outputs: [`output-${this.nodeCounter}`]
      };
      this.nodes.update(current => [...current, newNode]);
    }
  }

  onCreateConnection(event: any) {
    console.log('Connection created:', event);
    // Handle connection creation here if needed
  }

  onMoveNodes(event: any) {
    // FMoveNodesEvent: { fNodes: Array<{ id: string, position: IPoint }> }
    if (!event.fNodes) return;
    
    const updates = new Map<string, { x: number; y: number }>(
      event.fNodes.map((item: any) => [item.id, { x: item.position.x, y: item.position.y }])
    );
    this.nodes.update(current => current.map((node): FlowNode => {
      const newPos = updates.get(node.id);
      if (newPos) {
        return { ...node, position: newPos };
      }
      return node;
    }));
  }
}
