import { Component, ViewChild, inject, DestroyRef, effect, computed, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Canvas } from './canvas/canvas';
import { SidePanelAccordion } from './palette/side-panel-accordion/side-panel-accordion';
import { BlockParameters } from './palette/block-parameters/block-parameters';
import { ModelModal, ModelModalValue, ModelSlotOption } from './model-modal/model-modal';
import { EditModelModal, EditModelValue } from './edit-model-modal/edit-model-modal';
import { CanvasBlocksService, vscode } from '../services/canvas-blocks.service';
import { ModelResourceAllocationService } from '../services/model-resource-allocation.service';
import { SlotBindingHelperService } from '../services/slot-binding-helper.service';
import {
  ModelSettingsModal,
  ModelSettingsItem,
} from './model-settings-modal/model-settings-modal';
import { BannerDisplay } from '../custom-controls/banner-display/banner-display';
import { TemplateModal } from './template-modal/template-modal';
import { ITemplate } from '../models/triggerBlock';
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
    EditModelModal,
    ModelSettingsModal,
    BannerDisplay,
    TemplateModal
  ],
  templateUrl: './main-flow.html',
  styleUrl: './main-flow.scss',
})
export class MainFlow {
  @ViewChild(Canvas) private canvas?: Canvas;
  @ViewChild(TemplateModal) private templateModal?: TemplateModal;

  sidebarCollapsed = false;
  parametersCollapsed = false;

  showModelModal = false;
  modelName = 'MyTriggerModel';
  modelSlot = 1;
  modelNodeId = '';
  modelNotes = '';

  showModelSettingsModal = false;
  showTemplateModal = false;
  pendingTemplate: ITemplate | null = null;
  // Set while the model modal is creating a model for a template group.
  private templateModelGroupIndex: number | null = null;

  modelSettingsList: ModelSettingsItem[] = [];

  private readonly canvasBlocksService = inject(CanvasBlocksService);
  private readonly modelResourceAllocationService = inject(ModelResourceAllocationService);
  private readonly slotBindingHelper = inject(SlotBindingHelperService);
  private readonly destroyRef = inject(DestroyRef);

  /** Recomputes whenever recall or a hardware update changes channel usage. */
  readonly modelSettingsChannelUsage = computed(() =>
    this.modelResourceAllocationService.getChannelUsage(),
  );

  readonly modelSettingsCanAdd = computed(() => this.slotOptions().length > 0);

  // Edit Model modal state. Buffered locally so Cancel/X discards
  // without any server round-trip; OK routes through
  // `canvasBlocksService.rebindModelSlot(...)` for the single evaluate.
  // `editingModelName` is the trigger — all other editing-* views
  // derive reactively from it plus `slotOptions()`, so mid-modal
  // hardware updates flow through automatically.
  showEditModelModal = false;
  readonly editingModelName = signal<string>('');

  /** Current bound slot from the model (recomputed on canvas changes). */
  readonly editingSlot = computed<number>(() => {
    const name = this.editingModelName();
    if (!name) return 1;
    this.canvasBlocksService.sections();
    return this.canvasBlocksService.getModels()[name]?.slot_index ?? 1;
  });

  readonly editingNodeId = computed<string>(() => {
    const name = this.editingModelName();
    if (!name) return '';
    this.canvasBlocksService.sections();
    return this.canvasBlocksService.getModels()[name]?.node_id ?? '';
  });

  /**
   * Valid options offered by the Edit Model picker. Excludes the
   * currently-editing model's own reservations so a model that fills
   * its own slot's channels doesn't disqualify its own bound slot.
   */
  readonly editingSlotOptions = computed<ModelSlotOption[]>(() => {
    const name = this.editingModelName();
    if (!name) return this.slotOptions();
    return this.slotBindingHelper.validOptions(name);
  });

  /**
   * Non-null when the model's current binding is not in
   * `editingSlotOptions()`. Recomputes whenever the model or the valid
   * options list changes so mid-modal healing / breakage surfaces in
   * real time.
   */
  readonly editingInvalidLabel = computed<string | null>(() => {
    const name = this.editingModelName();
    if (!name) return null;
    this.canvasBlocksService.sections();
    const model = this.canvasBlocksService.getModels()[name];
    if (!model) return null;
    const valid = this.editingSlotOptions();
    const currentIsValid = valid.some(
      (o) => o.slot === model.slot_index && o.nodeId === model.node_id,
    );
    return currentIsValid
      ? null
      : `${model.node_id}.slot[${model.slot_index}]`;
  });

  /** Reactive list of slots available for a new model binding. */
  readonly slotOptions = computed<ModelSlotOption[]>(() =>
    this.computeSlotOptions(),
  );

  existingModelNames: string[] = [];

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
      if (this.showModelModal && this.templateModelGroupIndex === null) {
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

  onRequestTemplateModal(req: { template: ITemplate }): void {
    this.pendingTemplate = req.template;
    this.showTemplateModal = true;
  }

  /** Opens the model modal on top of the template modal for the given group. */
  onTemplateModalAddModel(groupIndex: number): void {
    this.templateModelGroupIndex = groupIndex;

    this.initModelSelection();
    this.refreshExistingModelNames();

    this.modelName = this.generateUniqueModelName('MyTriggerModel');
    this.modelNotes = '';

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

    const templateGroupIndex = this.templateModelGroupIndex;
    if (templateGroupIndex !== null) {
      this.templateModelGroupIndex = null;
      this.showModelModal = false;

      const createdModelName = this.canvas?.createModelWithoutContinuing(value);
      if (createdModelName) {
        this.templateModal?.setGroupSelection(templateGroupIndex, createdModelName);
      }
      return;
    }

    this.canvas?.createModelAndContinue(value);
    this.showModelModal = false;
  }

  // Trash action from modal:
  // Cancels pending block creation in Canvas.
  onModelModalDelete(): void {
    if (this.templateModelGroupIndex !== null) {
      // Keep the template drop queued; only the model creation was cancelled.
      this.templateModelGroupIndex = null;
      this.showModelModal = false;
      return;
    }

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
      nodeId: this.canvasBlocksService.getModelNodeId(section.modelName),
      slotIndex: this.canvasBlocksService.getModelSlotIndex(section.modelName),
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
    const model = this.canvasBlocksService.getModels()[item.modelName];
    if (!model) {
      console.warn(`onEditModel: no model named "${item.modelName}"`);
      return;
    }

    this.editingModelName.set(model.trigger_model_name);

    this.showEditModelModal = true;
    this.showModelSettingsModal = false;
  }

  onEditModelSave(value: EditModelValue): void {
    this.canvasBlocksService.rebindModelSlot(
      this.editingModelName(),
      value.slot,
      value.nodeId,
    );
    this.showEditModelModal = false;
  }

  onEditModelCancel(): void {
    this.showEditModelModal = false;
  }

  onTemplateModalConfirm(selections: string[]): void {
    this.showTemplateModal = false;
    this.canvas?.continueTemplateDrop(selections);
  }

  onTemplateModalCancel(): void {
    this.showTemplateModal = false;
    this.templateModelGroupIndex = null;
    this.canvas?.discardPendingCreateNode();
  }

  openScript(): void {
    console.log('Open Script clicked');
    // Ask the server to regenerate the script from current canvas state.
    this.canvasBlocksService.updateAndPrint();
    vscode.postMessage({ command: 'open_script' });
  }

}
