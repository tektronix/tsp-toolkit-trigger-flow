import {
  Component,
  signal,
  inject,
  computed,
  HostListener,
  ElementRef,
  AfterViewInit,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SvgManagerService } from '../../services/svg-manager.service';
import { CanvasBlocksService } from '../../services/canvas-blocks.service';
import { TriggerFlowDataService } from '../../services/triggerFlowDataService';
import { BlockErrorEntry } from '../../models/triggerFlowState';
import { EFMarkerType, FFlowModule, FSelectionChangeEvent } from '@foblex/flow';

interface FlowNode {
  blockId: string;
  sectionId: string;
  position: { x: number; y: number };
  svgPath: string;
  catalogLabel?: string;
  blockType?: string;
  input?: string;
  outputs: string[];
  color?: string;
}
interface FlowConnection {
  id: string;
  fOutputId: string;
  fInputId: string;
}

interface CreateNodePayload {
  type?: string;
  svgPath: string;
  catalogLabel?: string;
}

interface FlowCanvasEvent {
  rect?: { x: number; y: number };
  data?: CreateNodePayload;
  fTargetNode?: string;
  fDropPosition?: { x: number; y: number };
  fNodes?: ({ id: string; position: { x: number; y: number } } | string)[];
}

interface FlowSection {
  id: string;
  modelName: string;
  slotIndex: number;
  nodes: FlowNode[];
}

interface LaidOutSection extends FlowSection {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface ModelModalRequest {
  suggestedName: string;
  suggestedSlot: number;
  notes: string;
}

//User entered data from Model Modal form
interface ModelModalResult {
  name: string;
  slot: number;
  notes: string;
}

@Component({
  selector: 'app-canvas',
  imports: [FFlowModule, CommonModule, AngularSvgIconModule],
  templateUrl: './canvas.html',
  styleUrl: './canvas.scss',
})
export class Canvas implements AfterViewInit {
  private hostRef = inject(ElementRef<HTMLElement>);
  private svgManager = inject(SvgManagerService);
  private canvasBlocksService = inject(CanvasBlocksService);
  private triggerFlowDataService = inject(TriggerFlowDataService);
  protected readonly eMarkerType = EFMarkerType;

  private nodeCounter = 0;

  canvasSize = signal(this.getCanvasSize());
  connections = signal<FlowConnection[]>([]);
  selectedNodeIds = signal<string[]>([]);
  canvasMoveTrigger = (event: MouseEvent | TouchEvent | WheelEvent): boolean => {
    return event instanceof MouseEvent && event.button === 1; // middle mouse pan
  };

  // Raised to parent (MainFlow) when first block is dropped and
  // a model must be created before node insertion can continue.
  @Output() requestModelModal = new EventEmitter<ModelModalRequest>();

  // Stores the first dropped-node event temporarily until modal closes.
  private pendingCreateNodeEvent: FlowCanvasEvent | null = null;

  // Start empty -> first block drop triggers model modal
  sections = signal<FlowSection[]>([]);

sectionLayouts = computed<LaidOutSection[]>(() => {
  const size = this.canvasSize();

  const sectionWidth = 1400; // virtual width per section
  const sectionHeight = Math.max(size.height, 2000); // virtual vertical space

  return this.sections().map((section, index) => ({
    ...section,
    position: {
      x: index * sectionWidth,
      y: 0,
    },
    size: {
      width: sectionWidth,
      height: sectionHeight,
    },
  }));
});
  sectionNodes = computed<FlowNode[]>(() => this.sections().flatMap((section) => section.nodes));

  readonly modelErrorSummary = computed<Record<string, { hasError: boolean; tooltip: string }>>(
    () => {
      const models = this.triggerFlowDataService.models$();
      const result: Record<string, { hasError: boolean; tooltip: string }> = {};

      for (const [modelName, model] of Object.entries(models)) {
        const lines: string[] = [];
        let hasAnyError = false;

        for (const block of model.blocks) {
          if (this.hasBlockErrorItems(block.block_error)) {
            hasAnyError = true;
          }

          const errors = this.getBlockMessages(block.block_error);
          for (const message of errors) {
            lines.push(`${block.block_id} - ${message}`);
          }
        }

        result[modelName] = {
          hasError: hasAnyError,
          tooltip:
            lines.length > 0 ? lines.join('\n') : hasAnyError ? 'Validation errors found' : '',
        };
      }

      return result;
    },
  );

  private connectionCounter = 0;

  onCreateNode(event: FlowCanvasEvent): void {
    console.log('fCreateNode event:', event);
    console.log('Block Type:', event.data?.type);
    if (!event.data || !event.data.type || !event.rect) return;

    // first block + no model => ask parent to open modal
    if (this.sections().length === 0) {
      this.pendingCreateNodeEvent = event;
      this.requestModelModal.emit({
        suggestedName: 'MyTriggerModel',
        suggestedSlot: 1,
        notes: '',
      });
      return;
    }

    // Normal path when at least one section/model already exists.
    this.createNodeInSection(event);
  }

  createModelAndContinue(result: ModelModalResult): void {
    const sectionId = `group-${this.sections().length + 1}`;
    const modelName = result.name.trim() || `Model${this.sections().length + 1}`;

    // Create a new section/model from modal values.
    const newSection: FlowSection = {
      id: sectionId,
      modelName,
      slotIndex: result.slot,
      nodes: [],
    };

    this.sections.update((current) => [...current, newSection]);

    // Resume deferred first-drop node creation into this new section.
    if (this.pendingCreateNodeEvent) {
      const pending = this.pendingCreateNodeEvent;
      this.pendingCreateNodeEvent = null;
      this.createNodeInSection(pending, sectionId);
    }
  }

  getInputPosition(node: FlowNode): string {
    const catalog = this.triggerFlowDataService.catalog$();
    const blockCatalog = catalog?.blocks[node.catalogLabel || ''];
    const hasBranchParam = blockCatalog?.parameters.some(
      (param) => param.name === 'branch_to_block_name'
    );
    const hasReferenceParam = blockCatalog?.parameters.some(
      (param) => param.name === 'reference_block_name'
    );
    return hasBranchParam? "right" : hasReferenceParam ? "left" :"NA";
  }

  discardPendingCreateNode(): void {
    // Called when user cancels/deletes from modal.
    // Prevents accidental node creation after cancel.
    this.pendingCreateNodeEvent = null;
  }

  private createNodeInSection(event: FlowCanvasEvent, forcedSectionId?: string): void {
    if (!event.data || !event.rect) return;

    // forcedSectionId is used by first-drop flow to place node into
    // newly created model section; otherwise resolve from drop target.
    const targetSectionId = forcedSectionId ?? this.resolveTargetSectionId(event.fTargetNode);
    const section = this.getSectionById(targetSectionId);
    if (!section) return;

    const uniqueBlockId = this.createUniqueNodeId();

    const newNode: FlowNode = {
      blockId: uniqueBlockId,
      sectionId: targetSectionId,
      position: { x: event.rect.x, y: event.rect.y },
      svgPath: event.data?.svgPath,
      catalogLabel: event.data?.catalogLabel,
      blockType: event.data?.type,
      input: `input-${this.nodeCounter}`,
      outputs: [`output-${this.nodeCounter}`],
      color: '#FFFFFF',
    };

    this.sections.update((current) =>
      current.map((item) =>
        item.id === targetSectionId ? { ...item, nodes: [...item.nodes, newNode] } : item,
      ),
    );

    // Keep data service in sync with visual node creation.
    this.canvasBlocksService.addBlock(
      newNode.blockId,
      newNode.catalogLabel || newNode.svgPath,
      newNode.position,
      section.modelName,
      section.slotIndex,
    );

    this.canvasBlocksService.selectBlock(newNode.blockId);
  }

  private createUniqueNodeId(): string {
    const existingIds = new Set(this.sectionNodes().map((node) => node.blockId));
    let candidate = '';

    do {
      candidate = `node-${++this.nodeCounter}`;
    } while (existingIds.has(candidate));

    return candidate;
  }

  onNodeClick(blockId: string): void {
    this.canvasBlocksService.selectBlock(blockId);
  }

  getSvgStyle(node: FlowNode): Record<string, string> {
    const blockType = node.blockType;
    const cssConfig = this.getBlockCSSConfig(blockType);
    return {
      '--fill-color': cssConfig.fillColor,
      '--stroke-color': cssConfig.strokeColor,
      '--title-color': cssConfig.titleColor,
      '--event-fill-color': cssConfig.eventFillColor || cssConfig.fillColor,
      '--event-stroke-color': cssConfig.eventStrokeColor || cssConfig.strokeColor,
    };
  }

  private getBlockCSSConfig(blockType: string | undefined): {
    fillColor: string;
    strokeColor: string;
    titleColor: string;
    eventFillColor?: string;
    eventStrokeColor?: string;
  } {
    switch (blockType) {
      case 'Action':
        return { fillColor: '#173727', strokeColor: '#95C5AD', titleColor: '#95C5AD' };
      case 'Branch':
        return { fillColor: '#1E3A41', strokeColor: '#95BBC5', titleColor: '#95BBC5' };
      case 'Notify':
        return {
          fillColor: '#3C2F20',
          strokeColor: '#E79F48',
          titleColor: '#E79F48',
          eventFillColor: '#26251A',
          eventStrokeColor: '#F1EF8B',
        };
      case 'Timing':
        return {
          fillColor: '#372E3F',
          strokeColor: '#C687FA',
          titleColor: '#C687FA',
          eventFillColor: '#26251A',
          eventStrokeColor: '#F1EF8B',
        };
      default:
        return { fillColor: '#FFFFFF', strokeColor: '#333333', titleColor: '#333333' };
    }
  }
  onCreateConnection(event: any) {
    console.log('🔗 CONNECTION CREATED! Event details:', event);
    console.log('Connection data:', JSON.stringify(event, null, 2));
    
    if (event.fOutputId && event.fInputId) {
      const newConnection: FlowConnection = {
        id: `connection-${++this.connectionCounter}`,
        fOutputId: event.fOutputId,
        fInputId: event.fInputId
      };
      this.connections.update(current => [...current, newConnection]);
      console.log('Connection added to array:', newConnection);
      console.log('Total connections:', this.connections().length);
    }
  }

  onSelectionChange(event: FSelectionChangeEvent): void {
    this.selectedNodeIds.set(event.fNodeIds ?? []);
  }

  onMoveNodes(event: FlowCanvasEvent) {
    // FMoveNodesEvent: { fNodes: Array<{ id: string, position: IPoint }> }
    if (!event.fNodes || !event.fNodes.length || typeof event.fNodes[0] === 'string') return;

    const movedNodes = event.fNodes as { id: string; position: { x: number; y: number } }[];

    const updates = new Map<string, { x: number; y: number }>(
      movedNodes.map((item) => [item.id, { x: item.position.x, y: item.position.y }]),
    );
    this.sections.update((current) =>
      current.map((section) => ({
        ...section,
        nodes: section.nodes.map((node): FlowNode => {
          const newPos = updates.get(node.blockId);
          if (newPos) {
            this.canvasBlocksService.updateBlockPosition(node.blockId, newPos);
            return { ...node, position: newPos };
          }
          return node;
        }),
      })),
    );
  }

  onDropToGroup(event: FlowCanvasEvent) {
    // Intentionally ignored: nodes stay in their original section after creation.
    console.log('fDropToGroup ignored (section reassignment disabled):', event);
  }

  private getSectionById(sectionId: string): FlowSection | undefined {
    return this.sections().find((section) => section.id === sectionId);
  }

  private resolveTargetSectionId(targetId?: string): string {
    if (!targetId) return this.sections()[0]?.id || '';

    const section = this.getSectionById(targetId);
    if (section) return section.id;

    const parentSection = this.sections().find((item) =>
      item.nodes.some((node) => node.blockId === targetId),
    );
    return parentSection?.id || this.sections()[0]?.id || '';
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.canvasSize.set(this.getCanvasSize());
  }

  @HostListener('window:keydown', ['$event'])
  onDeleteKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const isTypingTarget =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

    if (isTypingTarget) {
      return;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }

    const nodeIds = this.selectedNodeIds();
    if (!nodeIds.length) {
      return;
    }

    event.preventDefault();
    this.deleteNodes(nodeIds);
  }

  ngAfterViewInit(): void {
    this.canvasSize.set(this.getCanvasSize());
  }

  private getCanvasSize(): { width: number; height: number } {
    if (typeof window === 'undefined') {
      return { width: 1280, height: 720 };
    }

    const host = this.hostRef.nativeElement;
    const hostWidth = Math.floor(host.clientWidth || 0);
    const hostHeight = Math.floor(host.clientHeight || 0);

    return {
      width: hostWidth || window.innerWidth,
      height: hostHeight || window.innerHeight,
    };
  }

  private deleteNodes(nodeIds: string[]): void {
    const toDelete = new Set(nodeIds);

    this.sections.update((sections) =>
      sections.map((section) => ({
        ...section,
        nodes: section.nodes.filter((node) => !toDelete.has(node.blockId)),
      })),
    );

    this.connections.update((connections) =>
      connections.filter(
        (connection) =>
          !nodeIds.some(
            (id) =>
              connection.fInputId.startsWith(id + '-') ||
              connection.fOutputId.startsWith(id + '-'),
          ),
      ),
    );

    for (const id of nodeIds) {
      this.canvasBlocksService.removeBlock(id);
    }

    this.selectedNodeIds.set([]);
  }

  getSectionHasError(modelName: string): boolean {
    return this.modelErrorSummary()[modelName]?.hasError ?? false;
  }

  getSectionErrorTooltip(modelName: string): string {
    return this.modelErrorSummary()[modelName]?.tooltip ?? 'No validation errors';
  }

  private getBlockMessages(blockError: BlockErrorEntry[] | null | undefined): string[] {
    if (!Array.isArray(blockError) || blockError.length === 0) {
      return [];
    }

    return blockError
      .filter((entry) => Array.isArray(entry))
      .map((entry) => entry[1])
      .filter(
        (message): message is string => typeof message === 'string' && message.trim().length > 0,
      );
  }

  private hasBlockErrorItems(blockError: BlockErrorEntry[] | null | undefined): boolean {
    return Array.isArray(blockError) && blockError.length > 0;
  }
}
