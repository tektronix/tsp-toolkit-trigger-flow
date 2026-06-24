import { Component, ViewChild, inject, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { ModelModal, ModelModalValue, ModelSlotOption } from './model-modal/model-modal';
import { TriggerFlowDataService } from '../services/triggerFlowDataService';
import { CanvasBlocksService, vscode } from '../services/canvas-blocks.service';
import { ModelResourceAllocationService } from '../services/model-resource-allocation.service';
import {
  ModelSettingsModal,
  ModelSettingsItem,
} from './model-settings-modal/model-settings-modal';

@Component({
  selector: 'app-main-flow',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    Canvas,
    SidePanelAccordion,
    BlockParameters,
    ModelModal,
    ModelSettingsModal,
  ],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.scss',
})
export class MainFlow {
  @ViewChild(Canvas) private canvas?: Canvas;

  sidebarCollapsed = false;
  parametersCollapsed = false;

  showModelModal = false;
  modelName = 'MyTriggerModel';
  modelSlot = 1;
  modelNodeId = '';
  modelNotes = '';

  showModelSettingsModal = false;

  modelSettingsList: ModelSettingsItem[] = [];

  slotOptions: ModelSlotOption[] = [];

  existingModelNames: string[] = [];

  private readonly triggerFlowDataService = inject(TriggerFlowDataService);
  private readonly canvasBlocksService = inject(CanvasBlocksService);
  private readonly modelResourceAllocationService = inject(ModelResourceAllocationService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Auto-expand the parameters panel whenever a block becomes selected
    // (either by user click or by being newly created on the canvas).
    this.canvasBlocksService.selectedBlock$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((blockId) => {
        if (blockId && this.parametersCollapsed) {
          this.parametersCollapsed = false;
        }
      });

    effect(() => {
      this.canvasBlocksService.sections();
      if (this.showModelModal) {
        this.canvas?.discardPendingCreateNode();
        this.showModelModal = false;
      }
      if (this.showModelSettingsModal) {
        this.refreshModelSettingsList();
      }
    });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleParametersSidebar(): void {
    this.parametersCollapsed = !this.parametersCollapsed;
  }

  addNewTriggerModel(): void {
    this.loadSlotOptions();

    this.refreshExistingModelNames();

    this.modelName = this.generateUniqueModelName('MyTriggerModel');

    this.showModelModal = true;
  }

  private generateUniqueModelName(baseName: string): string {
    const lowerCaseNames = this.existingModelNames.map((name) =>
      name.toLowerCase(),
    );

    if (!lowerCaseNames.includes(baseName.toLowerCase())) {
      return baseName;
    }

    let counter = 1;

    while (
      lowerCaseNames.includes(`${baseName}${counter}`.toLowerCase())
    ) {
      counter++;
    }

    return `${baseName}${counter}`;
  }

  onRequestModelModal(req: {
    suggestedName: string;
    suggestedSlot: number;
    notes: string;
  }): void {
    this.loadSlotOptions();

    this.refreshExistingModelNames();

    this.modelName = this.generateUniqueModelName(
      req.suggestedName,
    );

    this.modelNotes = req.notes;

    this.showModelModal = true;
  }

  private refreshExistingModelNames(): void {
    const sections = this.canvas?.getSections() ?? [];

    this.existingModelNames = sections.map(
      (section) => section.modelName,
    );
  }

  // Kept for future dependent dropdown logic.
  onModelModalSlotChanged(selectedSlot: ModelSlotOption): void {
    this.modelSlot = selectedSlot.slot;
    this.modelNodeId = selectedSlot.nodeId;
  }

  onModelModalClose(value: ModelModalValue): void {
    this.modelName = value.name;
    this.modelSlot = value.slot;
    this.modelNodeId = value.nodeId;
    this.modelNotes = value.notes;

    this.canvas?.createModelAndContinue(value);
    this.showModelModal = false;
  }

  // Trash action from modal:
  // Cancels pending block creation in Canvas.
  onModelModalDelete(): void {
    this.canvas?.discardPendingCreateNode();
    this.showModelModal = false;
  }

  // Copy modal data to clipboard when copy icon_ i_is clicked.
  async onModelModalCopy(): Promise<void> {
    const text = [
      `Name: ${this.modelName}`,
      `Slot: ${this.modelSlot}`,
      `Notes: ${this.modelNotes}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      console.log('Model modal data copied to clipboard.');
    } catch {
      console.warn('Clipboard copy failed.');
    }
  }

  private loadSlotOptions(): void {
    const slotChannelList = this.triggerFlowDataService.getSlotChannelList();

    if (!slotChannelList) {
      this.slotOptions = [];
      return;
    }

    const options: ModelSlotOption[] = [];

    // localnode slots
    for (const slot of slotChannelList.slots ?? []) {
      if (slot.module !== 'Empty') {
        options.push({
          label: `localnode.slot[${slot.slotId}]`,
          slot: slot.slotId,
          nodeId: 'localnode',
        });
      }
    }

    // child node slots (derive display index from nodeId)
    for (const node of slotChannelList.nodes ?? []) {
      // // Example: "node2" -> 2, "N3" -> 3, fallback to original nodeId label
      // const parsedNodeIndex = Number.parseInt(String(node.nodeId).replace(/\D/g, ''), 10);
      // const nodeLabel =
      //   Number.isFinite(parsedNodeIndex) && parsedNodeIndex > 0
      //     ? `node${parsedNodeIndex}`
      //     : `node.${node.nodeId}`;

      for (const slot of node.slots ?? []) {
        if (slot.module !== 'Empty') {
          options.push({
            label: `${node.nodeId}.slot[${slot.slotId}]`,
            slot: slot.slotId,
            nodeId: node.nodeId,
          });
        }
      }
    }

    // Hide slots that have already reached the per-slot model cap or whose
    // channels are fully claimed. Keeps the dropdown in sync with current
    // canvas state every time the modal is opened.
    this.slotOptions = options.filter((o) =>
      this.modelResourceAllocationService.canCreateNewModelOnSlot(o.nodeId, o.slot),
    );

    // Always pick the first available slot from slotOptions; suggestedSlot is
    // just a number and has no direct relevance to slotChannelList.
    const first = this.slotOptions[0];
    this.modelSlot = first?.slot ?? 1;
    this.modelNodeId = first?.nodeId ?? '';
  }

  openModelSettings(): void {
    this.refreshModelSettingsList();

    this.showModelSettingsModal = true;
  }

  private refreshModelSettingsList(): void {
    this.modelSettingsList = this.canvasBlocksService.sections().map((section) => ({
      id: section.id,
      modelName: section.modelName,
      nodeId: section.nodeId,
      slotIndex: section.slotIndex,
    }));
  }

  closeModelSettings(): void {
    this.showModelSettingsModal = false;
  }

  onAddModelFromSettings(): void {
    this.showModelSettingsModal = false;

    this.addNewTriggerModel();
  }

  async onCopyModel(item: ModelSettingsItem): Promise<void> {
    const text = [
      `Model: ${item.modelName}`,
      `Node: ${item.nodeId}`,
      `Slot: ${item.slotIndex}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.warn('Copy failed');
    }
  }

  onDeleteModel(item: ModelSettingsItem): void {
    console.warn('Delete model:', item);
    this.canvasBlocksService.removeModel(item.modelName);
    this.modelSettingsList = this.modelSettingsList.filter((model) => model.modelName !== item.modelName);
  }

  onEditModel(item: ModelSettingsItem): void {
    console.warn('Edit model:', item);
  }

  openScript(): void {
    console.log('Open Script clicked');
    // Ask the server to regenerate the script from current canvas state.
    this.canvasBlocksService.updateAndPrint();
    vscode.postMessage({ command: 'open_script' });
  }

}
