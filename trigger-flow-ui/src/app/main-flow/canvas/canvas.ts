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
  effect,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SvgManagerService } from '../../services/svg-manager.service';
import { CanvasBlocksService } from '../../services/canvas-blocks.service';
import { TriggerFlowDataService } from '../../services/triggerFlowDataService';
import { PaletteDataService } from '../../services/palette-data.service';
import { BlockErrorEntry } from '../../models/triggerFlowState';
import { EFMarkerType, FFlowModule, FSelectionChangeEvent } from '@foblex/flow';
import { ModelModalValue } from '../model-modal/model-modal';

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
  nodeId: string;
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
  private paletteDataService = inject(PaletteDataService);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  protected readonly eMarkerType = EFMarkerType;

  // Cache of input-connector positions (as % of node bounds) keyed by svgPath.
  // null = SVG has no <g class="Connector"> group, so no input should render.
  private connectorPositions = signal<Record<string, { xPct: number; yPct: number } | null>>({});
  // svgPaths whose load is in flight, to avoid duplicate HTTP requests.
  private connectorLoadInFlight = new Set<string>();

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

  constructor() {
    // Session restoration effect - runs whenever models$() signal changes
    effect(() => {
      const models = this.triggerFlowDataService.models$();
      const currentSections = this.sections();

      console.log('Models changed, checking for restoration...', models);

      // Detection logic: restore if canvas is empty but models have data
      if (this.shouldRestoreFromModels(models, currentSections)) {
        console.log('Session restoration triggered - converting models to canvas sections');
        const newSections = this.convertModelsToSections(models);
        this.sections.set(newSections);
      }
    });

    // External requests (e.g. from BlockParameters) to add a connection.
    this.canvasBlocksService.connectionRequest$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sourceBlockId, targetBlockId }) => {
        this.addConnectionByBlockIds(sourceBlockId, targetBlockId);
      });
  }

  /**
   * Adds a FlowConnection from `sourceBlockId`'s right output port to
   * `targetBlockId`'s input port. No-ops if a matching connection already
   * exists.
   */
  private addConnectionByBlockIds(sourceBlockId: string, targetBlockId: string): void {
    if (!sourceBlockId || !targetBlockId) return;
    const fOutputId = `${sourceBlockId}-out-right`;
    const fInputId = `${targetBlockId}-in`;

    const exists = this.connections().some(
      (c) => c.fOutputId === fOutputId && c.fInputId === fInputId,
    );
    if (exists) return;

    const newConnection: FlowConnection = {
      id: `connection-${++this.connectionCounter}`,
      fOutputId,
      fInputId,
    };
    this.connections.update((current) => [...current, newConnection]);
    console.log('Connection added (parameter-driven):', newConnection);
  }

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

  createModelAndContinue(result: ModelModalValue): void {
    const sectionId = `group-${this.sections().length + 1}`;
    const modelName = result.name.trim() || `Model${this.sections().length + 1}`;

    // Create a new section/model from modal values.
    const newSection: FlowSection = {
      id: sectionId,
      modelName,
      slotIndex: result.slot,
      nodeId: result.nodeId,
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

  /**
   * Returns true when the node's SVG contains a `<g class="Connector">` group
   * (i.e. an input port should be rendered). Triggers a background fetch on
   * first access for each unique svgPath.
   */
  hasInputConnector(node: FlowNode): boolean {
    const pos = this.connectorPositions()[node.svgPath];
    if (pos === undefined) {
      this.loadConnectorPosition(node.svgPath);
      return false;
    }
    return pos !== null;
  }

  getInputDirection(node: FlowNode): string {
    const catalog = this.triggerFlowDataService.catalog$();
    const blockCatalog = catalog?.blocks[node.catalogLabel || ''];
    const hasBranchParam = blockCatalog?.parameters.some(
      (param) => param.name === 'branch_to_block_name'
    );
    const hasReferenceParam = blockCatalog?.parameters.some(
      (param) => param.name === 'reference_block_name'
    );
    const hasResetBranchCountParam = blockCatalog?.parameters.some(
      (param) => param.name === 'reset_branch_count_block_name'
    );
    return hasBranchParam ? "right" : hasResetBranchCountParam ? "left" : hasReferenceParam ? "left" : "right";
  }


  /**
   * Inline style positioning the input connector exactly on top of the SVG's
   * Connector element (expressed as % of the node's bounding box).
   */
  getInputStyle(node: FlowNode): Record<string, string> {
    const pos = this.connectorPositions()[node.svgPath];
    if (!pos) return {};
    return {
      left: `${pos.xPct}%`,
      top: `${pos.yPct}%`,
    };
  }

  private loadConnectorPosition(svgPath: string): void {
    if (!svgPath) return;
    if (svgPath in this.connectorPositions()) return;
    if (this.connectorLoadInFlight.has(svgPath)) return;
    this.connectorLoadInFlight.add(svgPath);

    this.http.get(svgPath, { responseType: 'text' }).subscribe({
      next: (svgText) => {
        const parsed = this.parseConnectorPosition(svgText);
        this.connectorPositions.update((current) => ({ ...current, [svgPath]: parsed }));
        this.connectorLoadInFlight.delete(svgPath);
      },
      error: () => {
        this.connectorPositions.update((current) => ({ ...current, [svgPath]: null }));
        this.connectorLoadInFlight.delete(svgPath);
      },
    });
  }

  private parseConnectorPosition(svgText: string): { xPct: number; yPct: number } | null {
    try {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return null;

      const connector = doc.querySelector('g.Connector');
      if (!connector) return null;

      const viewBoxAttr = svg.getAttribute('viewBox');
      let vbX = 0, vbY = 0, vbW = 0, vbH = 0;
      if (viewBoxAttr) {
        const parts = viewBoxAttr.trim().split(/\s+|,/).map(Number);
        if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
          [vbX, vbY, vbW, vbH] = parts;
        }
      }
      if (!vbW || !vbH) {
        vbW = Number(svg.getAttribute('width')) || 0;
        vbH = Number(svg.getAttribute('height')) || 0;
      }
      if (!vbW || !vbH) return null;

      // Prefer a circle inside the Connector group (the visual port).
      const circle = connector.querySelector('circle');
      let cx: number | null = null;
      let cy: number | null = null;
      if (circle) {
        cx = Number(circle.getAttribute('cx'));
        cy = Number(circle.getAttribute('cy'));
      }
      if (cx === null || cy === null || !Number.isFinite(cx) || !Number.isFinite(cy)) {
        return null;
      }

      return {
        xPct: ((cx - vbX) / vbW) * 100,
        yPct: ((cy - vbY) / vbH) * 100,
      };
    } catch {
      return null;
    }
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
    const newSVGPath = this.changeSVGPath(event.data?.svgPath);
    const newNode: FlowNode = {
      blockId: uniqueBlockId,
      sectionId: targetSectionId,
      position: { x: event.rect.x, y: event.rect.y },
      svgPath: newSVGPath,
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
      section.nodeId,
    );

    this.canvasBlocksService.selectBlock(newNode.blockId);
  }

  private changeSVGPath(svgPath: string): string {
    return svgPath.replace('palette/', 'canvas/');
  }
  private getSVGPath(blockType: string): string {
    const svgPath = this.paletteDataService.getSVGPathByCatalogLabel(blockType);
    return this.changeSVGPath(svgPath || '');
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

  onCreateConnection(event: any) {
    console.log('🔗 CONNECTION CREATED! Event details:', event);
    console.log('Connection data:', JSON.stringify(event, null, 2));

    if (event.fOutputId && event.fInputId) {
      const outputBlockId = this.extractBlockIdFromPortId(event.fOutputId);
      const inputBlockId = this.extractBlockIdFromPortId(event.fInputId);

      const outputBlock = outputBlockId
        ? this.canvasBlocksService.getBlockById(outputBlockId)
        : null;
      const inputBlock = inputBlockId
        ? this.canvasBlocksService.getBlockById(inputBlockId)
        : null;

      // Wire the connection in the data model:
      //  1. Read `trigger_block_name` from the output (source) block.
      //  2. If the input (target) block has a `branch_to_block_name` parameter, set it there.
      //  3. Otherwise, if the input (target) block has `reference_block_name`, set it there.
      if (outputBlock && inputBlock && outputBlockId && inputBlockId) {
        const triggerBlockName = outputBlock.actual_parameters.find(
          (p) => p.name === 'trigger_block_name',
        )?.value;

        // Ensure sourceValue is string | number | null only
        const sourceValue =
          triggerBlockName !== undefined && triggerBlockName !== null
            ? String(triggerBlockName)
            : outputBlock.block_id;

        const inputHasBranch = inputBlock.actual_parameters.some(
          (p) => p.name === 'branch_to_block_name',
        );
        const inputHasReference = inputBlock.actual_parameters.some(
          (p) => p.name === 'reference_block_name',
        );

        const inputHasResetBranchCounter = inputBlock.actual_parameters.some(
          (p) => p.name === 'reset_branch_count_block_name',
        );

        if (inputHasBranch) {
          this.canvasBlocksService.updateBlockParameterValue(
            inputBlockId,
            'branch_to_block_name',
            sourceValue,
          );
          console.log(
            `Set branch_to_block_name=${sourceValue} on input block ${inputBlockId}`,
          );
        } else if (inputHasReference) {
          this.canvasBlocksService.updateBlockParameterValue(
            inputBlockId,
            'reference_block_name',
            sourceValue,
          );
          console.log(
            `Set reference_block_name=${sourceValue} on input block ${inputBlockId}`,
          );
        }
        else if (inputHasResetBranchCounter) {
          this.canvasBlocksService.updateBlockParameterValue(
            inputBlockId,
            'reset_branch_count_block_name',
            sourceValue,
          );
          console.log(
            `Set reset_branch_count_block_name=${sourceValue} on input block ${inputBlockId}`,
          );
        }
      }

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

  /**
   * Port ids are constructed as `<blockId>-out-<side>` or `<blockId>-in[-<side>]`.
   * Strip the trailing port suffix so we can resolve back to the FlowNode/block.
   */
  private extractBlockIdFromPortId(portId: string): string | null {
    if (!portId) return null;
    const match = portId.match(/^(.*)-(?:in|out)(?:-[a-z]+)?$/i);
    if (match) return match[1];
    // Fallback: match against known block ids.
    const node = this.sectionNodes().find((n) => portId.startsWith(n.blockId + '-'));
    return node?.blockId ?? null;
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

  /**
   * Determines if we should restore the canvas from service models
   * This happens when:
   * 1. Canvas is empty (no sections) 
   * 2. Service has model data
   * 3. It's not a user-initiated change (session restore scenario)
   */
  private shouldRestoreFromModels(models: Record<string, any>, currentSections: FlowSection[]): boolean {
    const canvasIsEmpty = currentSections.length === 0;
    const serviceHasModels = Object.keys(models).length > 0;

    return canvasIsEmpty && serviceHasModels;
  }

  /**
   * Converts service models to canvas sections
   * This is the core transformation: backend data → visual canvas elements
   */
  private convertModelsToSections(models: Record<string, any>): FlowSection[] {
    console.log('Converting models to sections:', models);

    const sections = Object.entries(models).map(([modelName, model], index) => {
      console.log(`Processing model ${index + 1}:`, modelName, model);

      const sectionId = `group-${index + 1}`;
      const resolvedModelName = model.trigger_model_name || modelName;
      const resolvedSlotIndex = model.slot_index || 0;

      return {
        id: sectionId,
        modelName: model.trigger_model_name || modelName,
        slotIndex: model.slot_index || 0,
        nodeId: model.node_id,
        nodes: this.convertBlocksToNodes(model.blocks || [], sectionId, resolvedModelName, resolvedSlotIndex, model.node_id)
      };
    });

    return sections;
  }

  /**
   * Converts an array of service blocks to canvas FlowNodes
   */
  private convertBlocksToNodes(
    blocks: any[],
    sectionId: string,
    modelName: string,
    slotIndex: number,
    node_id: string,
  ): FlowNode[] {
    return blocks.map((block, index) => {

      const blockId: string = block.block_id || `restored-block-${index + 1}`;
      const blockType: string = block.type;
      const position = {
        x: block.block_position?.x ?? (100 + index * 150),
        y: block.block_position?.y ?? 100,
      };

      this.canvasBlocksService.addBlock(
        blockId,
        blockType,
        position,
        modelName,
        slotIndex,
        node_id
      );

      // Overlay saved parameter values onto the ActualParameters.
      const savedParams: Record<string, unknown> | undefined = block.block_parameters;
      if (savedParams) {
        const canvasBlock = this.canvasBlocksService.getBlockById(blockId);
        if (canvasBlock) {
          for (const ap of canvasBlock.actual_parameters) {
            if (Object.prototype.hasOwnProperty.call(savedParams, ap.name)) {
              const v = savedParams[ap.name];
              ap.value = (v === null || v === undefined) ? null : (v as string | number);
            }
          }
        }
      }

      const blockSVG = this.getSVGPath(blockType);
      return {
        blockId,
        sectionId,
        position,
        blockType,
        catalogLabel: blockType, // use saved type as catalog label (matches drop path)
        svgPath: blockSVG,
        input: `input-${blockId}`,
        outputs: [`output-${blockId}`],
        color: '#FFFFFF',
      };
    });
  }
}
