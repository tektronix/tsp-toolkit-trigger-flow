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
  DestroyRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { CanvasBlocksService } from '../../services/canvas-blocks.service';
import { TriggerFlowDataService } from '../../services/triggerFlowDataService';
import { TemplateInstantiationService } from '../../services/template-instantiation.service';
import { BlockErrorEntry } from '../../models/triggerFlowState';
import {
  EFMarkerType,
  FCanvasComponent,
  FFlowModule,
  FSelectionChangeEvent,
  FDragStartedEvent,
} from '@foblex/flow';
import { ModelModalValue } from '../model-modal/model-modal';
import { EventListItem } from '../../models/triggerBlock';

// Generate all groups that might have toggle-able visibility
const DEFAULT_HIDDEN_SELECTORS: string[] = [
  ...(() => {
    const selectors: string[] = [];
    for (const any_all of ['.EventsAll', '.EventsAny']) {
      selectors.push(any_all);
      for (const event of ['.Event1', '.Event2', '.Event3', '.Event4']) {
        selectors.push(event);
        selectors.push([any_all, event].join(' '));
        for (const type of [
          '.DigitalIO',
          '.TSPLink',
          '.Notify',
          '.Blender',
          '.Generator',
          '.Timer',
          '.AtLimit',
        ]) {
          selectors.push([event, type].join(' '));
          selectors.push([any_all, event, type].join(' '));
          for (let s = 1; s <= 3; s++) {
            for (let c = 1; c <= 2; c++) {
              const str = `.s${s}c${c}`;
              selectors.push([event, type, str].join(' '));
              selectors.push([any_all, event, type, str].join(' '));
            }
            for (let id = 1; id <= 16; id++) {
              const str = `.s${s}id${id}`;
              selectors.push([event, type, str].join(' '));
              selectors.push([any_all, event, type, str].join(' '));
            }
          }
          for (let n = 1; n <= 18; n++) {
            const str = `._${n}`;
            selectors.push([event, type, str].join(' '));
            selectors.push([any_all, event, type, str].join(' '));
          }
        }
      }
    }
    return selectors;
  })(),
];

export interface FlowNode {
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
export interface FlowConnection {
  id: string;
  fOutputId: string;
  fInputId: string;
}

interface CreateNodePayload {
  type?: string;
  svgPath: string;
  catalogLabel?: string;
  /** Set by the palette when the user drags a Template instead of a block. */
  isTemplate?: boolean;
}

interface FlowCanvasEvent {
  rect?: { x: number; y: number };
  data?: CreateNodePayload;
  fTargetNode?: string;
  fDropPosition?: { x: number; y: number };
  fNodes?: ({ id: string; position: { x: number; y: number } } | string)[];
}

export interface FlowSection {
  id: string;
  modelName: string;
  slotIndex: number;
  nodeId: string;
  nodes: FlowNode[];
  /**
   * Stable horizontal slot assigned at creation time. Used to compute the
   * section's x position so that deleting a model does not cause the
   * remaining sections to shift left on the canvas.
   */
  positionIndex?: number;
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

interface InsertionIndicator {
  sectionId: string;
  position: number; // index where the block would be inserted
}

@Component({
  selector: 'app-canvas',
  imports: [FFlowModule, CommonModule, AngularSvgIconModule],
  templateUrl: './canvas.html',
  styleUrl: './canvas.scss',
})
export class Canvas implements AfterViewInit {
  private static readonly INTERACTIVE_PAN_BLOCKERS =
    'button, input, textarea, select, option, label, a, [role="button"], [contenteditable="true"]';
  private static readonly SECTION_WIDTH = 400;
  private static readonly SECTION_HEADER_HEIGHT = 42;
  private static readonly SECTION_TOP_PADDING = Canvas.SECTION_HEADER_HEIGHT + 16;
  private static readonly STACK_GAP = 12;
  private static readonly DEFAULT_NODE_WIDTH = 160;
  private static readonly DEFAULT_NODE_HEIGHT = 88;

  private hostRef = inject(ElementRef<HTMLElement>);
  private canvasBlocksService = inject(CanvasBlocksService);
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private templateInstantiationService = inject(TemplateInstantiationService);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);
  protected readonly eMarkerType = EFMarkerType;
  private readonly _canvas = viewChild(FCanvasComponent);

  // Cache of input-connector positions (as % of node bounds) keyed by svgPath.
  // null = SVG has no <g class="Connector"> group, so no input should render.
  private connectorPositions = signal<Record<string, { xPct: number; yPct: number } | null>>({});
  // svgPaths whose load is in flight, to avoid duplicate HTTP requests.
  private connectorLoadInFlight = new Set<string>();
  private svgVisibilityRefreshQueued = false;

  private nodeCounter = 0;

  canvasSize = signal(this.getCanvasSize());
  selectedNodeIds = signal<string[]>([]);
  insertionIndicator = signal<InsertionIndicator | null>(null);
  private activeDraggedNodeId = signal<string | null>(null);
  private isExternalDragActive = false;
  private suppressMoveForNodeUntil = new Map<string, number>();
  selectedBlockId = signal<string | null>(null);
  canvasMoveTrigger = (event: MouseEvent | TouchEvent | WheelEvent): boolean => {
    if (!(event instanceof MouseEvent)) {
      return true;
    }

    if (event.button !== 0 && event.button !== 1) {
      return false;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return event.button === 1;
    }

    if (target.closest('.node-wrapper, [fNode], [fNodeInput], [fNodeOutput]')) {
      return false;
    }

    if (target.closest(Canvas.INTERACTIVE_PAN_BLOCKERS)) {
      return false;
    }

    return true;
  };

  protected onDragStarted(event: FDragStartedEvent): void {
    const data = event.data ?? event.fData;
    const nodeIds =
      data && typeof data === 'object' && 'fNodeIds' in data
        ? (data as { fNodeIds?: string[] }).fNodeIds
        : [];
    const draggedNodeId = Array.isArray(nodeIds) && nodeIds.length > 0 ? nodeIds[0] : null;
    this.activeDraggedNodeId.set(draggedNodeId);
    this.isExternalDragActive = !draggedNodeId;
    this.insertionIndicator.set(null);
  }

  protected onDragEnded(): void {
    const draggedNodeId = this.activeDraggedNodeId();
    const indicator = this.insertionIndicator();

    if (draggedNodeId) {
      this.suppressMoveForNodeUntil.set(draggedNodeId, Date.now() + 250);
    }

    if (draggedNodeId && indicator) {
      this.reorderFromInsertionIndicator(draggedNodeId, indicator);
    } else if (draggedNodeId) {
      const sectionId = this.findSectionIdByNodeId(draggedNodeId);
      if (sectionId) {
        this.scheduleSectionReflow(sectionId);
      }
    }

    this.activeDraggedNodeId.set(null);
    this.isExternalDragActive = false;
    this.insertionIndicator.set(null);
  }

  /**
   * Pans the canvas so the section with the given id is brought into view at
   * the left edge of the viewport. No-op if the section or canvas is missing.
   */
  private focusSection(sectionId: string): void {
    const canvas = this._canvas();
    if (!canvas) return;
    const layout = this.sectionLayouts().find((s) => s.id === sectionId);
    if (!layout) return;
    const current = canvas.getPosition();
    canvas.position.apply({ x: -layout.position.x, y: current.y });
    canvas.redraw();
  }

  // Raised to parent (MainFlow) when first block is dropped and
  // a model must be created before node insertion can continue.
  @Output() requestModelModal = new EventEmitter<ModelModalRequest>();

  // Stores the first dropped-node event temporarily until modal closes.
  private pendingCreateNodeEvent: FlowCanvasEvent | null = null;

  get sections() {
    return this.canvasBlocksService.sections;
  }
  get connections() {
    return this.canvasBlocksService.connections;
  }

  sectionLayouts = computed<LaidOutSection[]>(() => {
    const size = this.canvasSize();

    const sectionWidth = Canvas.SECTION_WIDTH; // virtual width per section
    const sectionHeight = Math.max(size.height, 2000); // virtual vertical space

    return this.sections().map((section, index) => ({
      ...section,
      position: {
        // Use the stable positionIndex assigned at creation time so that
        // deleting a section does not re-flow the remaining sections.
        x: (section.positionIndex ?? index) * sectionWidth,
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
    // External requests (e.g. from BlockParameters) to add a connection.
    this.canvasBlocksService.connectionRequest$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ source, target }) => {
        this.canvasBlocksService.addConnectionByBlockIds(source, target);
      });

    this.canvasBlocksService.selectedBlock$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((blockId) => {
        this.selectedBlockId.set(blockId);
      });

    // Keep SVG group visibility synced when block data changes
    // (for example when parameters are edited in Block Parameters).
    this.canvasBlocksService.canvasBlocks$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.scheduleSvgVisibilityRefresh();
      });
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

    // Assign a stable horizontal slot (max existing + 1) so that deleting
    // a model later does not shift remaining sections leftward.
    const nextPositionIndex =
      this.sections().reduce((max, s) => Math.max(max, s.positionIndex ?? -1), -1) + 1;

    // Create a new section/model from modal values.
    const newSection: FlowSection = {
      id: sectionId,
      modelName,
      slotIndex: result.slot,
      nodeId: result.nodeId,
      nodes: [],
      positionIndex: nextPositionIndex,
    };

    this.canvasBlocksService.sections.update((current) => [...current, newSection]);

    // Resume deferred first-drop node creation into this new section.
    if (this.pendingCreateNodeEvent) {
      const pending = this.pendingCreateNodeEvent;
      this.pendingCreateNodeEvent = null;
      this.createNodeInSection(pending, sectionId);
    }

    // Defer focus until after the new section's layout has rendered, so
    // sectionLayouts() reflects the just-added section.
    queueMicrotask(() => this.focusSection(sectionId));
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
      // Keep input connectable while SVG connector metadata loads.
      return true;
    }
    // Even SVGs without an explicit Connector group get a side fallback
    // input so users can complete a connection from either direction.
    return true;
  }

  hasSvgInputConnector(node: FlowNode): boolean {
    const pos = this.connectorPositions()[node.svgPath];
    if (pos === undefined) {
      this.loadConnectorPosition(node.svgPath);
      return false;
    }
    return pos !== null;
  }

  getInputDirection(node: FlowNode): string {
    return this.canvasBlocksService.getInputDirection(node.catalogLabel);
  }

  /**
   * Inline style positioning the input connector exactly on top of the SVG's
   * Connector element (expressed as % of the node's bounding box).
   */
  getInputStyle(node: FlowNode): Record<string, string> {
    const pos = this.connectorPositions()[node.svgPath];
    if (!pos) {
      return this.getInputDirection(node) === 'left'
        ? { left: '0%', top: '40%' }
        : { left: '100%', top: '40%' };
    }
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
        // Re-center blocks now that the SVG is injected in the DOM and
        // g.Arrow / g.*Block elements are measurable.
        this.reflowSectionsWithSvgPath(svgPath);
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
      let vbX = 0,
        vbY = 0,
        vbW = 0,
        vbH = 0;
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

    if (event.data.isTemplate && event.data.catalogLabel) {
      const indicator = this.insertionIndicator();
      const insertionIndex =
        indicator && indicator.sectionId === targetSectionId ? indicator.position : undefined;
      this.templateInstantiationService.instantiateTemplate(
        event.data.catalogLabel,
        event.rect,
        section,
        {
          createUniqueNodeId: () => this.createUniqueNodeId(),
          getNodeCounter: () => this.nodeCounter,
          changeSVGPath: (path) => this.changeSVGPath(path),
          scheduleSectionReflow: (sectionId) => this.scheduleSectionReflow(sectionId),
        },
        { insertionIndex },
      );
      this.insertionIndicator.set(null);
      return;
    }

    const uniqueBlockId = this.createUniqueNodeId();
    const newSVGPath = this.changeSVGPath(event.data?.svgPath);
    const stackedPosition = this.getNextStackPosition(section);
    const newNode: FlowNode = {
      blockId: uniqueBlockId,
      sectionId: targetSectionId,
      position: stackedPosition,
      svgPath: newSVGPath,
      catalogLabel: event.data?.catalogLabel,
      blockType: event.data?.type,
      input: `input-${this.nodeCounter}`,
      outputs: [`output-${this.nodeCounter}`],
      color: '#FFFFFF',
    };

    const indicator = this.insertionIndicator();
    this.sections.update((current) =>
      current.map((item) => {
        if (item.id !== targetSectionId) return item;
        const nodes = [...item.nodes];
        const insertAt =
          indicator && indicator.sectionId === targetSectionId
            ? Math.max(0, Math.min(indicator.position, nodes.length))
            : nodes.length;
        nodes.splice(insertAt, 0, newNode);
        return { ...item, nodes };
      }),
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

    // Reflow after mount/render so real SVG geometry can be measured for centering.
    this.scheduleSectionReflow(targetSectionId);

    this.canvasBlocksService.selectBlock(newNode.blockId);
  }

  private changeSVGPath(svgPath: string): string {
    return svgPath.replace('palette/', 'canvas/');
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
    this.selectedNodeIds.set([blockId]);
    this.canvasBlocksService.selectBlock(blockId);
    this.selectedNodeIds.set([blockId]);
  }

  onCreateConnection(event: { fOutputId?: string; fInputId?: string }) {
    console.log('🔗 CONNECTION CREATED! Event details:', event);
    console.log('Connection data:', JSON.stringify(event, null, 2));

    if (event.fOutputId && event.fInputId) {
      const outputBlockId = this.extractBlockIdFromPortId(event.fOutputId);
      const inputBlockId = this.extractBlockIdFromPortId(event.fInputId);

      const outputBlock = outputBlockId
        ? this.canvasBlocksService.getBlockById(outputBlockId)
        : null;
      const inputBlock = inputBlockId ? this.canvasBlocksService.getBlockById(inputBlockId) : null;

      // Resolve semantic direction independent of drag start side:
      // the "referencing" block is whichever endpoint owns a supported
      // block-reference parameter, and the opposite endpoint is the source.
      if (outputBlock && inputBlock && outputBlockId && inputBlockId) {
        const outputParamName = this.getLinkParamName(outputBlock);
        const inputParamName = this.getLinkParamName(inputBlock);

        const targetFromOutput =
          !!outputParamName &&
          (!inputParamName ||
            this.getLinkParamPriority(outputParamName) <=
              this.getLinkParamPriority(inputParamName));

        const targetBlock = targetFromOutput
          ? outputParamName
            ? outputBlock
            : null
          : inputParamName
            ? inputBlock
            : null;
        const targetBlockId = targetBlock === outputBlock ? outputBlockId : targetBlock === inputBlock ? inputBlockId : null;
        const parameterName = targetBlock === outputBlock ? outputParamName : targetBlock === inputBlock ? inputParamName : null;
        const sourceBlock = targetBlock === outputBlock ? inputBlock : outputBlock;

        if (!targetBlock || !targetBlockId || !parameterName) {
          console.warn('Connection ignored: neither endpoint supports a block-reference parameter.');
          return;
        }

        const triggerBlockName = sourceBlock.actual_parameters.find(
          (p) => p.name === 'trigger_block_name',
        )?.value;

        // Ensure sourceValue is string | number | null only
        const sourceValue =
          triggerBlockName !== undefined && triggerBlockName !== null
            ? String(triggerBlockName)
            : sourceBlock.block_id;

        this.canvasBlocksService.removeIncomingConnections(targetBlockId);
        this.canvasBlocksService.updateBlockParameterValue(
          targetBlockId,
          parameterName,
          sourceValue,
        );
        console.log(
          `Set ${parameterName}=${sourceValue} on block ${targetBlockId}`,
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
          console.log(`Set branch_to_block_name=${sourceValue} on input block ${inputBlockId}`);
        } else if (inputHasReference) {
          this.canvasBlocksService.updateBlockParameterValue(
            inputBlockId,
            'reference_block_name',
            sourceValue,
          );
          console.log(`Set reference_block_name=${sourceValue} on input block ${inputBlockId}`);
        } else if (inputHasResetBranchCounter) {
          this.canvasBlocksService.updateBlockParameterValue(
            inputBlockId,
            'reset_branch_count_block_name',
            sourceValue,
          );
          console.log(
            `Set reset_branch_count_block_name=${sourceValue} on input block ${inputBlockId}`,
          );
        }
        // Always persist the visual line in canonical data direction:
        // source (referenced block) -> target (referencing block).
        this.canvasBlocksService.addConnectionByBlockIds(sourceBlock, targetBlock);
      }
    }
  }

  private getLinkParamName(block: {
    actual_parameters: { name: string }[];
  }): 'branch_to_block_name' | 'reference_block_name' | 'reset_branch_count_block_name' | null {
    if (block.actual_parameters.some((p) => p.name === 'branch_to_block_name')) {
      return 'branch_to_block_name';
    }
    if (block.actual_parameters.some((p) => p.name === 'reference_block_name')) {
      return 'reference_block_name';
    }
    if (block.actual_parameters.some((p) => p.name === 'reset_branch_count_block_name')) {
      return 'reset_branch_count_block_name';
    }
    return null;
  }

  private getLinkParamPriority(
    paramName: 'branch_to_block_name' | 'reference_block_name' | 'reset_branch_count_block_name',
  ): number {
    switch (paramName) {
      case 'branch_to_block_name':
        return 0;
      case 'reference_block_name':
        return 1;
      case 'reset_branch_count_block_name':
        return 2;
      default:
        return Number.MAX_SAFE_INTEGER;
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
    const nodeIds = event.fNodeIds ?? [];
    this.selectedNodeIds.set(nodeIds);
    if (nodeIds.length > 0) {
      this.canvasBlocksService.selectBlock(nodeIds[0]);
      return;
    }
    this.canvasBlocksService.clearSelectedBlock();
  }

  onMoveNodes(event: FlowCanvasEvent) {
    // FMoveNodesEvent: { fNodes: Array<{ id: string, position: IPoint }> }
    if (!event.fNodes || !event.fNodes.length || typeof event.fNodes[0] === 'string') return;

    const movedNodes = event.fNodes as { id: string; position: { x: number; y: number } }[];
    const now = Date.now();

    const updates = new Map<string, { x: number; y: number }>(
      movedNodes.map((item) => [item.id, { x: item.position.x, y: item.position.y }]),
    );
    this.sections.update((current) =>
      current.map((section) => ({
        ...section,
        nodes: section.nodes.map((node): FlowNode => {
          const newPos = updates.get(node.blockId);
          if (newPos) {
            const suppressUntil = this.suppressMoveForNodeUntil.get(node.blockId);
            if (suppressUntil && now < suppressUntil) {
              return node;
            }
            if (suppressUntil) {
              this.suppressMoveForNodeUntil.delete(node.blockId);
            }
            this.canvasBlocksService.updateBlockPosition(node.blockId, newPos);
            return { ...node, position: newPos };
          }
          return node;
        }),
      })),
    );

    this.scheduleCanvasRedraw();
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    const draggedNodeId = this.activeDraggedNodeId();
    if (!draggedNodeId) {
      if (this.isExternalDragActive) {
        this.updateInsertionIndicatorForExternalDrag(event);
      }
      return;
    }

    const draggedSectionId = this.findSectionIdByNodeId(draggedNodeId);
    if (!draggedSectionId) {
      this.insertionIndicator.set(null);
      return;
    }

    const section = this.getSectionById(draggedSectionId);
    if (!section || section.nodes.length === 0) {
      this.insertionIndicator.set(null);
      return;
    }

    const sectionElement = this.getSectionElement(draggedSectionId);
    if (!sectionElement) {
      this.insertionIndicator.set(null);
      return;
    }

    const sectionRect = sectionElement.getBoundingClientRect();
    const withinSectionX = event.clientX >= sectionRect.left && event.clientX <= sectionRect.right;
    const withinSectionY =
      event.clientY >= sectionRect.top - 24 && event.clientY <= sectionRect.bottom + 24;

    if (!withinSectionX || !withinSectionY) {
      this.insertionIndicator.set(null);
      return;
    }

    const draggedIndex = section.nodes.findIndex((node) => node.blockId === draggedNodeId);
    if (draggedIndex < 0) {
      this.insertionIndicator.set(null);
      return;
    }

    const remainingNodes = section.nodes.filter((node) => node.blockId !== draggedNodeId);
    let targetPositionInRemaining = 0;

    for (const node of remainingNodes) {
      const element = this.getNodeElement(node.blockId);
      if (!element) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (event.clientY > midpoint) {
        targetPositionInRemaining += 1;
      } else {
        break;
      }
    }

    const targetPosition =
      draggedIndex <= targetPositionInRemaining
        ? targetPositionInRemaining + 1
        : targetPositionInRemaining;

    // Ensure the target position is not the same as dragged node's current position
    if (targetPosition === draggedIndex || targetPosition === draggedIndex + 1) {
      this.insertionIndicator.set(null);
      return;
    }

    this.insertionIndicator.set({
      sectionId: draggedSectionId,
      position: targetPosition,
    });
  }

  private updateInsertionIndicatorForExternalDrag(event: PointerEvent): void {
    for (const section of this.sections()) {
      const sectionElement = this.getSectionElement(section.id);
      if (!sectionElement) continue;

      const sectionRect = sectionElement.getBoundingClientRect();
      if (
        event.clientX < sectionRect.left ||
        event.clientX > sectionRect.right ||
        event.clientY < sectionRect.top - 24 ||
        event.clientY > sectionRect.bottom + 24
      )
        continue;

      let targetPosition = 0;
      for (const node of section.nodes) {
        const el = this.getNodeElement(node.blockId);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) {
          targetPosition += 1;
        } else {
          break;
        }
      }

      this.insertionIndicator.set({ sectionId: section.id, position: targetPosition });
      return;
    }
    this.insertionIndicator.set(null);
  }

  onDropToGroup(event: FlowCanvasEvent) {
    // Intentionally ignored: nodes stay in their original section after creation.
    console.log('fDropToGroup ignored (section reassignment disabled):', event);
  }

  private getSectionById(sectionId: string): FlowSection | undefined {
    return this.sections().find((section) => section.id === sectionId);
  }

  private findSectionIdByNodeId(blockId: string): string | null {
    const section = this.sections().find((item) =>
      item.nodes.some((node) => node.blockId === blockId),
    );
    return section?.id ?? null;
  }

  private reorderFromInsertionIndicator(
    draggedNodeId: string,
    indicator: InsertionIndicator,
  ): void {
    const section = this.getSectionById(indicator.sectionId);
    if (!section) return;

    const draggedIndex = section.nodes.findIndex((node) => node.blockId === draggedNodeId);
    if (draggedIndex < 0) {
      this.scheduleSectionReflow(indicator.sectionId);
      return;
    }

    const nodes = [...section.nodes];
    const [draggedNode] = nodes.splice(draggedIndex, 1);

    // Adjust insert index if we removed the node before the target position
    let insertIndex = indicator.position;
    if (draggedIndex < insertIndex) {
      insertIndex -= 1;
    }

    insertIndex = Math.max(0, Math.min(insertIndex, nodes.length));
    nodes.splice(insertIndex, 0, draggedNode);

    this.sections.update((current) =>
      current.map((item) => (item.id === section.id ? { ...item, nodes } : item)),
    );

    this.scheduleSectionReflow(section.id);
  }

  private getNodeElement(blockId: string): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector(`.node-wrapper[data-block-id="${blockId}"]`);
  }

  private getSectionElement(sectionId: string): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector(
      `.section-group[data-section-id="${sectionId}"]`,
    );
  }

  private reflowSectionsWithSvgPath(svgPath: string): void {
    const affectedSectionIds = new Set<string>();
    for (const section of this.sections()) {
      if (section.nodes.some((node) => node.svgPath === svgPath)) {
        affectedSectionIds.add(section.id);
      }
    }
    // Defer until after angular-svg-icon has injected the SVG into the DOM.
    for (const sectionId of affectedSectionIds) {
      this.scheduleSectionReflow(sectionId);
    }
  }

  private scheduleSectionReflow(sectionId: string): void {
    if (typeof window === 'undefined') {
      this.reflowSection(sectionId);
      return;
    }

    // Two RAF ticks ensures both Angular template update and svg-icon DOM
    // injection/paint have completed before we read SVG geometry.
    queueMicrotask(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          this.reflowSection(sectionId);
        });
      });
    });
  }

  private getMeasuredNodeSize(blockId: string): { width: number; height: number } {
    const element = this.getNodeElement(blockId);
    if (!element) {
      return {
        width: Canvas.DEFAULT_NODE_WIDTH,
        height: Canvas.DEFAULT_NODE_HEIGHT,
      };
    }

    // Prefer offset metrics so sizing is stable regardless of canvas zoom
    // (getBoundingClientRect is viewport-scaled and can collapse spacing).
    const offsetWidth = element.offsetWidth;
    const offsetHeight = element.offsetHeight;
    if (offsetWidth > 0 && offsetHeight > 0) {
      return {
        width: offsetWidth,
        height: offsetHeight,
      };
    }

    const rect = element.getBoundingClientRect();
    return {
      width: rect.width || Canvas.DEFAULT_NODE_WIDTH,
      height: rect.height || Canvas.DEFAULT_NODE_HEIGHT,
    };
  }

  private getCenteredXForNode(blockId: string): number {
    const nodeSize = this.getMeasuredNodeSize(blockId);
    const defaultCenteredX = Math.max(0, (Canvas.SECTION_WIDTH - nodeSize.width) / 2);
    if (!blockId) {
      return defaultCenteredX;
    }

    const arrowCenterXPct = this.getArrowCenterXPctForNode(blockId);
    if (arrowCenterXPct === null) {
      return defaultCenteredX;
    }

    const sectionCenterX = Canvas.SECTION_WIDTH / 2;
    const arrowCenterXWithinNode = (arrowCenterXPct / 100) * nodeSize.width;
    const maxX = Math.max(0, Canvas.SECTION_WIDTH - nodeSize.width);
    return Math.max(0, Math.min(maxX, sectionCenterX - arrowCenterXWithinNode));
  }

  private getArrowCenterXPctForNode(blockId: string): number | null {
    const nodeElement = this.getNodeElement(blockId);
    if (!nodeElement) {
      return null;
    }

    const svgElement = nodeElement.querySelector('.node-svg svg');
    if (!(svgElement instanceof SVGGraphicsElement)) {
      return null;
    }

    const svgRect = svgElement.getBoundingClientRect();
    const arrowElement = nodeElement.querySelector('.node-svg svg g.Arrow');
    const arrowRect =
      arrowElement instanceof SVGGraphicsElement ? arrowElement.getBoundingClientRect() : null;

    if (arrowRect && svgRect.width > 0 && arrowRect.width > 0) {
      const arrowCenterX = arrowRect.left + arrowRect.width / 2;
      return ((arrowCenterX - svgRect.left) / svgRect.width) * 100;
    }

    // Fallback for blocks without g.Arrow: use the midpoint of the smallest
    // g element whose class contains "Block" (e.g. g.BranchBlock).
    const blockCandidates = Array.from(
      nodeElement.querySelectorAll('.node-svg svg g[class$="Block"]'),
    ).filter((element): element is SVGGraphicsElement => element instanceof SVGGraphicsElement);

    if (svgRect.width <= 0 || blockCandidates.length === 0) {
      return null;
    }

    let bestRect: DOMRect | null = null;
    for (const candidate of blockCandidates) {
      const candidateRect = candidate.getBoundingClientRect();
      if (candidateRect.width <= 0) {
        continue;
      }

      if (!bestRect || candidateRect.width < bestRect.width) {
        bestRect = candidateRect;
      }
    }

    if (!bestRect) {
      return null;
    }

    const blockCenterX = bestRect.left + bestRect.width / 2;
    return ((blockCenterX - svgRect.left) / svgRect.width) * 100;
  }

  private getNextStackPosition(section: FlowSection): { x: number; y: number } {
    if (!section.nodes.length) {
      return {
        x: this.getCenteredXForNode(''),
        y: Canvas.SECTION_TOP_PADDING,
      };
    }

    const lastNode = section.nodes[section.nodes.length - 1];
    const lastSize = this.getMeasuredNodeSize(lastNode.blockId);
    return {
      x: this.getCenteredXForNode(lastNode.blockId),
      y: lastNode.position.y + lastSize.height + Canvas.STACK_GAP,
    };
  }

  private reflowSection(sectionId: string): void {
    const section = this.getSectionById(sectionId);
    if (!section) return;

    let currentY = Canvas.SECTION_TOP_PADDING;
    const nextNodes = section.nodes.map((node) => {
      const { height } = this.getMeasuredNodeSize(node.blockId);
      const position = {
        x: this.getCenteredXForNode(node.blockId),
        y: currentY,
      };
      currentY += height + Canvas.STACK_GAP;
      return {
        ...node,
        position,
      };
    });

    this.sections.update((current) =>
      current.map((item) => (item.id === sectionId ? { ...item, nodes: nextNodes } : item)),
    );

    for (const node of nextNodes) {
      this.canvasBlocksService.updateBlockPosition(node.blockId, node.position);
    }

    this.applySvgGroupVisibilityForSection(sectionId);
    this.scheduleCanvasRedraw();
  }

  private scheduleSvgVisibilityRefresh(): void {
    if (this.svgVisibilityRefreshQueued) {
      return;
    }
    this.svgVisibilityRefreshQueued = true;

    if (typeof window === 'undefined') {
      this.svgVisibilityRefreshQueued = false;
      this.applySvgGroupVisibilityForAllSections();
      return;
    }

    queueMicrotask(() => {
      window.requestAnimationFrame(() => {
        this.svgVisibilityRefreshQueued = false;
        this.applySvgGroupVisibilityForAllSections();
      });
    });
  }

  private applySvgGroupVisibilityForAllSections(): void {
    for (const section of this.sections()) {
      this.applySvgGroupVisibilityForSection(section.id);
    }
  }

  private applySvgGroupVisibilityForSection(sectionId: string): void {
    const section = this.getSectionById(sectionId);
    if (!section) {
      return;
    }

    for (const node of section.nodes) {
      this.applySvgGroupVisibilityForNode(node);
    }
  }

  private applySvgGroupVisibilityForNode(node: FlowNode): void {
    const nodeElement = this.getNodeElement(node.blockId);
    if (!nodeElement) {
      return;
    }

    const svgRoot = nodeElement.querySelector('.node-svg svg');
    if (!(svgRoot instanceof SVGElement)) {
      return;
    }

    const { hideGroupSelectors, showGroupSelectors } = this.resolveSvgVisibilityGroups(node);
    this.setSvgGroupsHiddenState(svgRoot, hideGroupSelectors, true);
    // It is vital that show come AFTER hide.
    this.setSvgGroupsHiddenState(svgRoot, showGroupSelectors, false);
  }
  private svgVisibleGroupsFromActualParams(
    eventType: string,
    eventParam: EventListItem,
    parentSelector: string,
  ): string[] {
    const visibleGroups: string[] = [];
    if (
      !(
        eventParam &&
        typeof eventParam != 'string' &&
        typeof eventParam != 'number' &&
        typeof eventParam != 'boolean' &&
        !Array.isArray(eventParam) &&
        'params' in eventParam
      )
    ) {
      return visibleGroups;
    }
    switch (eventType) {
      case 'event_at_limit': {
        const type = '.AtLimit';
        visibleGroups.push([parentSelector, type].join(' '));
        const channel = eventParam.params?.['channel_index'];
        const slot = eventParam.params?.['slot_index'];
        if (channel && slot) {
          visibleGroups.push([parentSelector, type, `.s${slot}c${channel}`].join(' '));
        }
        break;
      }
      case 'event_tsplink': {
        const type = '.TSPLink';
        visibleGroups.push([parentSelector, type].join(' '));
        const triggerLine = eventParam.params?.['trigger_line'];
        if (triggerLine) {
          visibleGroups.push([parentSelector, type, `._${triggerLine}`].join(' '));
        }
        break;
      }
      case 'event_timer': {
        const type = '.Timer';
        visibleGroups.push([parentSelector, type].join(' '));
        const timer = eventParam.params?.['trigger_timer_number'];
        if (timer) {
          visibleGroups.push([parentSelector, type, `._${timer}`].join(' '));
        }
        break;
      }
      case 'event_generator': {
        const type = '.Generator';
        visibleGroups.push([parentSelector, type].join(' '));
        const generator = eventParam.params?.['generator_number'];
        if (generator) {
          visibleGroups.push([parentSelector, type, `._${generator}`].join(' '));
        }
        break;
      }
      case 'event_digio': {
        const type = '.DigitalIO';
        visibleGroups.push([parentSelector, type].join(' '));
        const digioLine = eventParam.params?.['digio_trigger_line'];
        if (digioLine) {
          visibleGroups.push([parentSelector, type, `._${digioLine}`].join(' '));
        }
        break;
      }
      case 'event_notify_n': {
        const type = '.Notify';
        visibleGroups.push([parentSelector, type].join(' '));
        const slot = eventParam.params?.['slot_index'];
        const eventNum = eventParam.params?.['notify_event_number'];
        if (slot && eventNum) {
          visibleGroups.push([parentSelector, type, `.s${slot}id${eventNum}`].join(' '));
        }
        break;
      }
    }
    return visibleGroups;
  }
  private resolveSvgVisibilityGroups(node: FlowNode): {
    hideGroupSelectors: string[];
    showGroupSelectors: string[];
  } {
    // Generate all groups that might have toggle-able visibility
    const hideGroupSelectors: string[] = DEFAULT_HIDDEN_SELECTORS;
    const showGroupSelectors: string[] = [];

    // TODO: Implement your rule selection here.
    // 1) Read block data for this node (for example via getBlockById).
    // 2) Decide which SVG group classes should be hidden vs shown.
    // 3) Push class names into hideGroupClasses/showGroupClasses.
    //
    // Example skeleton:
    // const block = this.canvasBlocksService.getBlockById(node.blockId);
    // if (block) {
    //   // hideGroupClasses.push('Timer');
    //   // showGroupClasses.push('Notify');
    // }
    const block = this.canvasBlocksService.getBlockById(node.blockId);
    if (block) {
      switch (block.type) {
        case 'notify':
        case 'on event': {
          console.warn(block.type, block.actual_parameters);
          const event_id = block.actual_parameters.find((param) => param.name === 'event_id');
          if (
            event_id &&
            event_id.value &&
            typeof event_id.value != 'string' &&
            typeof event_id.value != 'number' &&
            typeof event_id.value != 'boolean' &&
            !Array.isArray(event_id.value) &&
            'type' in event_id.value
          ) {
            const type = event_id.value?.type;
            if (type) {
              showGroupSelectors.push('.Event1');
              showGroupSelectors.push(
                ...this.svgVisibleGroupsFromActualParams(type, event_id.value, '.Event1'),
              );
            }
          }
          break;
        }
        case 'wait on event': {
          console.warn(block.type, block.actual_parameters);
          const event_id = block.actual_parameters.find((param) => param.name === 'event');
          let logic = block.actual_parameters.find((param) => param.name === 'logic')?.value;
          if (logic && typeof logic === 'string') {
            logic = logic === 'AND' ? '.EventsAny' : '.EventsAll';
            showGroupSelectors.push(logic)
          }

          if (
            event_id &&
            event_id.value &&
            typeof event_id.value != 'string' &&
            typeof event_id.value != 'number' &&
            typeof event_id.value != 'boolean' &&
            Array.isArray(event_id.value)
          ) {
            let count = 0;
            for (const event of event_id.value) {
              if (typeof event === 'number') {
                continue;
              }
              const type = event.type;
              if (type) {
                count++;
                if (count > 4) {
                  continue;
                }
                showGroupSelectors.push([logic, `.Event${count}`].join(' '));
                showGroupSelectors.push(
                  ...this.svgVisibleGroupsFromActualParams(
                    type,
                    event,
                    [logic, `.Event${count}`].join(' '),
                  ),
                );
              }
            }
          }

          break;
        }
        default:
          break;
      }
    }

    return { hideGroupSelectors, showGroupSelectors };
  }

  private setSvgGroupsHiddenState(
    svgRoot: SVGElement,
    groupQueries: string[],
    hidden: boolean,
  ): void {
    if (!groupQueries.length) {
      return;
    }
    console.warn('groupQueries', groupQueries);
    for (const query of groupQueries) {
      svgRoot.querySelectorAll(`g ${query}`).forEach((g) => {
        if(!hidden) {console.warn("Showing", g)}
        g.classList.toggle('hidden', hidden);
      });
    }
  }

  private scheduleCanvasRedraw(): void {
    const canvas = this._canvas();
    if (!canvas) return;

    if (typeof window === 'undefined') {
      canvas.redraw();
      return;
    }

    queueMicrotask(() => {
      window.requestAnimationFrame(() => {
        canvas.redraw();
      });
    });
  }

  shouldShowInsertionIndicatorInSection(sectionId: string): boolean {
    const indicator = this.insertionIndicator();
    return indicator !== null && indicator.sectionId === sectionId;
  }

  getInsertionIndicatorTop(section: FlowSection): number {
    const indicator = this.insertionIndicator();
    if (!indicator || indicator.sectionId !== section.id || section.nodes.length === 0) {
      return Canvas.SECTION_TOP_PADDING;
    }

    const position = Math.max(0, Math.min(indicator.position, section.nodes.length));

    if (position === 0) {
      const firstNode = section.nodes[0];
      return Math.max(Canvas.SECTION_TOP_PADDING, firstNode.position.y - Canvas.STACK_GAP / 2);
    }

    if (position >= section.nodes.length) {
      const lastNode = section.nodes[section.nodes.length - 1];
      const { height } = this.getMeasuredNodeSize(lastNode.blockId);
      return lastNode.position.y + height + Canvas.STACK_GAP / 2;
    }

    const previousNode = section.nodes[position - 1];
    const { height } = this.getMeasuredNodeSize(previousNode.blockId);
    return previousNode.position.y + height + Canvas.STACK_GAP / 2;
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
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isTypingTarget) {
      return;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }

    const selectedFromCanvas = this.selectedNodeIds();
    const selectedFromService = this.canvasBlocksService.getSelectedBlockId();
    const nodeIds =
      selectedFromCanvas.length > 0
        ? selectedFromCanvas
        : selectedFromService &&
            this.sectionNodes().some((node) => node.blockId === selectedFromService)
          ? [selectedFromService]
          : [];

    if (!nodeIds.length) {
      return;
    }

    event.preventDefault();
    this.deleteNodes(nodeIds);
  }

  ngAfterViewInit(): void {
    this.canvasSize.set(this.getCanvasSize());
    this.scheduleSvgVisibilityRefresh();
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
    const affectedSectionIds = new Set<string>();

    for (const section of this.sections()) {
      if (section.nodes.some((node) => toDelete.has(node.blockId))) {
        affectedSectionIds.add(section.id);
      }
    }

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
              connection.fInputId.startsWith(id + '-') || connection.fOutputId.startsWith(id + '-'),
          ),
      ),
    );

    for (const id of nodeIds) {
      this.canvasBlocksService.removeBlock(id);
    }

    // Compact each affected section so blocks below deleted ones shift up.
    for (const sectionId of affectedSectionIds) {
      this.scheduleSectionReflow(sectionId);
    }

    this.selectedNodeIds.set([]);
    // Reset BlockParameters back to its "no block selected" state.
    this.canvasBlocksService.clearSelectedBlock();
  }

  getSections(): FlowSection[] {
    return this.sections();
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
