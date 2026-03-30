import { Component, ViewChild, signal, inject } from '@angular/core';
import { FFlowModule, FFlowComponent } from '@foblex/flow';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SvgManagerService } from '../../services/svg-manager.service';
import { CanvasBlocksService } from '../../services/canvas-blocks.service';

interface FlowNode {
  id: string;
  position: { x: number; y: number };
  svgPath: string;
  catalogLabel?: string;
  input?: string;
  outputs: string[];
  color?: string;
}

@Component({
  selector: 'app-canvas',
  imports: [
    FFlowModule,
    CommonModule,
    AngularSvgIconModule
  ],
  templateUrl: './canvas.html',
  styleUrl: './canvas.css',
})
export class Canvas {
  @ViewChild(FFlowComponent) flowComponent!: FFlowComponent;
  private svgManager = inject(SvgManagerService);
  private canvasBlocksService = inject(CanvasBlocksService);

  nodes = signal<FlowNode[]>([]);
  private nodeCounter = 0;

  onCreateNode(event: any) {
    // FCreateNodeEvent: { rect, data, fTargetNode?, fDropPosition? }
    console.log('fCreateNode event:', event);
    if (event.data && event.data.type) {
      const newNode: FlowNode = {
        id: `node-${++this.nodeCounter}`,
        position: { x: event.rect.x, y: event.rect.y },
        svgPath: event.data.svgPath,
        catalogLabel: event.data.catalogLabel,
        input: `input-${this.nodeCounter}`,
        outputs: [`output-${this.nodeCounter}`],
        color: '#FFFFFF'
      };
      this.nodes.update(current => [...current, newNode]);
      
      // Add block to canvas blocks service with catalogLabel
      // You must now provide modelName and slotIndex
      const modelName = 'Model1'; // Replace with dynamic value as needed
      const slotIndex = 1; // Replace with dynamic value as needed
      this.canvasBlocksService.addBlock(
        newNode.id,
        newNode.catalogLabel || newNode.svgPath,
        newNode.position,
        modelName,
        slotIndex
      );
    }
  }

  getSvgStyle(): Record<string, string> {
    return this.svgManager.buildSvgStyle({
      // fillColor: node.color,
      // width: '60px',
      // height: '60px'
    });
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
        // Update canvas blocks service with new position
        this.canvasBlocksService.updateBlockPosition(node.id, newPos);
        return { ...node, position: newPos };
      }
      return node;
    }));
  }
}
