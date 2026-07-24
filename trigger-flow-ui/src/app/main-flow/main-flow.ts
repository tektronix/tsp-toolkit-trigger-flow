import { Component, ViewChild, inject, DestroyRef, effect, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { ModelModal, ModelModalValue, ModelSlotOption } from './model-modal/model-modal';
import { CanvasBlocksService, vscode } from '../services/canvas-blocks.service';
import { ModelResourceAllocationService } from '../services/model-resource-allocation.service';
import { SlotBindingHelperService } from '../services/slot-binding-helper.service';
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
  isEdit = false;

  showModelSettingsModal = false;

  modelSettingsList: ModelSettingsItem[] = [];
  modelSettingsMaxModels = 0;

  /** Reactive list of slots available for a new model binding. */
  readonly slotOptions = computed<ModelSlotOption[]>(() =>
    this.computeSlotOptions(),
  );

  existingModelNames: string[] = [];

  private readonly canvasBlocksService = inject(CanvasBlocksService);
  private readonly modelResourceAllocationService = inject(ModelResourceAllocationService);
  private readonly slotBindingHelper = inject(SlotBindingHelperService);
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

    // Keep the current selection valid as slotOptions changes. When the
    // user's pick disappears (hardware change while modal is open),
    // snap to the first available option.
    effect(() => {
      const options = this.slotOptions();
      if (!this.showModelModal) {
        return;
      }
      const currentStillValid = options.some(
        (o) => o.slot === this.modelSlot && o.nodeId === this.modelNodeId,
      );
      if (!currentStillValid) {
        const first = options[0];
        this.modelSlot = first?.slot ?? 1;
        this.modelNodeId = first?.nodeId ?? '';
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
    this.initModelSelection();

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
    this.initModelSelection();

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

  onModelModalEdit(value: ModelModalValue): void {

    this.canvas?.editModelAndContinue(this.modelName,value);
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

  private computeSlotOptions(): ModelSlotOption[] {
    return this.slotBindingHelper.validOptions();
  }

  /** Seed the modal's selection from the current slotOptions on open. */
  private initModelSelection(): void {
    const first = this.slotOptions()[0];
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

    this.modelSettingsMaxModels = this.modelResourceAllocationService.getMaxModels();
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
    //open the add model window with the model's settings aleady selected in it
    this.modelName = item.modelName;
    this.modelSlot = item.slotIndex;
    this.modelNodeId = item.nodeId;
    this.isEdit = true;
    this.openAddModelModal();
  }

  openAddModelModal(): void {
    this.refreshExistingModelNames();
    this.showModelSettingsModal = false;
    this.showModelModal = true;
  }

  openScript(): void {
    console.log('Open Script clicked');
    // Ask the server to regenerate the script from current canvas state.
    this.canvasBlocksService.updateAndPrint();
    vscode.postMessage({ command: 'open_script' });
  }

}
