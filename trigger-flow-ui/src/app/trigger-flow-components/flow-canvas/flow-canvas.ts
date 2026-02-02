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
      // Use rect position directly
      const position = {
        x: event.rect.x,
        y: event.rect.y
      };
      
      const newNode: FlowNode = {
        id: `node-${++this.nodeCounter}`,
        position: position,
        svgPath: event.data.svgPath
      };
      this.nodes = [...this.nodes, newNode];
      console.log('Created node:', newNode);
    }
  }

  onMoveNodes(event: any) {
    // event.fNodes is an array of { id, position }
    if (!event || !event.fNodes || !Array.isArray(event.fNodes)) {
      return;
    }
    const updates = new Map<string, { x: number; y: number }>(
      event.fNodes.map((item: any) => [item.id, { x: item.position.x, y: item.position.y }])
    );
    this.nodes = this.nodes.map((node): FlowNode => {
      const newPos = updates.get(node.id);
      if (newPos) {
        return { ...node, position: newPos };
      }
      return node;
    });
  }

  onNodePositionChange(position: { x: number; y: number }, nodeId: string) {
    // Update position of the specific node
    console.log('Node position change:', nodeId, position);
    this.nodes = this.nodes.map((node): FlowNode => {
      if (node.id === nodeId) {
        return { ...node, position: { x: position.x, y: position.y } };
      }
      return node;
    });
    console.log('Updated nodes:', this.nodes);
  }
}
