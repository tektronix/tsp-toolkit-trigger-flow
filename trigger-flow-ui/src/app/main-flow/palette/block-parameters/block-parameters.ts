import { Component, DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { CanvasBlocksService } from '../../../services/canvas-blocks.service';
import {
  findblockCategory,
  ParamControlType,
  resolveParamControlType,
} from '../../../models/blockParameterHelper';
import { ActualParameter, ParamTypeName } from '../../../models/triggerBlock';
import { Textbox } from '../../../custom-controls/textbox/textbox';
import { InputNumeric } from '../../../custom-controls/input-numeric/input-numeric';
import { Dropdown } from '../../../custom-controls/dropdown/dropdown';
import { RadioButton } from '../../../custom-controls/radio-button/radio-button';
import { MultilineTextbox } from '../../../custom-controls/multiline-textbox/multiline-textbox';
import { FormsModule } from '@angular/forms';
import { EventBlockComponent } from './event-block/event-block';
import { TriggerFlowDataService } from '../../../services/triggerFlowDataService';
import { EventDefinition } from '../../../models/triggerBlock';
import { Toggle } from '../../../custom-controls/toggle/toggle';
import { Checkbox } from '../../../custom-controls/checkbox/checkbox';
import { DelayListModal, DelayListModalValue } from './delay-list-modal/delay-list-modal';

interface DelayListConfigValue {
  points: number;
  sweep_values: number[];
}

const CATEGORY_ICON_PATHS: Record<string, string> = {
  actions: 'assets/shapes/icons/TinyAction.svg',
  branches: 'assets/shapes/icons/TinyBranch.svg',
  notify: 'assets/shapes/icons/TinyNotify.svg',
  timing: 'assets/shapes/icons/TinyTiming.svg',
};

@Component({
  selector: 'app-block-parameters',
  imports: [
    AngularSvgIconModule,
    Textbox,
    InputNumeric,
    Dropdown,
    RadioButton,
    MultilineTextbox,
    Toggle,
    Checkbox,
    FormsModule,
    EventBlockComponent,
    DelayListModal,
  ],
  templateUrl: './block-parameters.html',
  styleUrl: './block-parameters.scss',
})
export class BlockParameters {
  private canvasBlocksService = inject(CanvasBlocksService);
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private destroyRef = inject(DestroyRef);

  selectedBlockId: string | null = null;
  blockName = '';
  blockTypeSvgPath = '';
  actualParameters: ActualParameter[] = [];
  blockNotes = '';
  triggerEvents: Record<string, EventDefinition> = {};
  showDelayListModal = false;
  delayListModalPoints = 1;
  delayListModalSweepValues: number[] = [1];
  private previousDelayListConfig: DelayListConfigValue | null = null;

  constructor() {
    // Reacts to both: new block added (auto-select) and existing block clicked.
    this.canvasBlocksService.selectedBlock$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((blockId) => {
        this.selectedBlockId = blockId;
        this.updateBlockControls();
      });

    // Catalog data is loaded asynchronously, so reading it once in ngOnInit can
    // leave the Event custom UI empty. Keep the trigger event definitions in sync
    // with the reactive catalog signal so raw event names and parameter labels are
    // available as soon as the catalog arrives.
    effect(() => {
      const catalog = this.triggerFlowDataService.catalog$();
      this.triggerEvents = catalog?.trigger_events || {};
    });
  }

  private updateBlockControls() {
    if (this.selectedBlockId !== null) {
      const canvasBlock = this.canvasBlocksService.getBlockById(this.selectedBlockId);
      if (canvasBlock) {
        this.blockName = canvasBlock.type.toUpperCase(); // Display type as name for now
        const category = findblockCategory(canvasBlock.type);
        if (category) {
          this.blockTypeSvgPath = CATEGORY_ICON_PATHS[category];
        }

        this.actualParameters = canvasBlock.actual_parameters;
        // Notes are per-block, so refresh the textarea each time selection changes.
        this.blockNotes = canvasBlock.notes ?? '';
        this.ensureParameterDefaults(this.actualParameters);
      }
    }
  }

  isNumberType(type: ParamTypeName): boolean {
    // DelayTime is represented as a numeric value in catalog metadata.
    return type === 'Number' || type === 'DelayTime';
  }

  isStringType(type: ParamTypeName): boolean {
    return type === 'String';
  }

  isMultiLineStringType(type: ParamTypeName): boolean {
    return type === 'MultiString';
  }

  isToggleType(type: ParamTypeName): boolean {
    return type === 'SourceState';
  }

  getControlType(param: ActualParameter): ParamControlType {    
    return resolveParamControlType({
      name: param.name,
      type: param.type,
      hasOptions: this.hasSelectableOptions(param),
    });
  }

  getEventSelectionMode(param: ActualParameter): 'single' | 'multi' {
    // New schema: EventItem => single, EventList => multi.
    // Backward compatibility: keep event_id as single if older catalog still uses EventList.
    if (param.type === 'EventItem') {
      return 'single';
    }

    if (param.type === 'EventList') {
      return param.name === 'event_id' ? 'single' : 'multi';
    }

    return 'multi';
  }

  getSelectOptions(param: ActualParameter): string[] {
    if (!param.options) {
      return [];
    }

    // We use option.value for binding so the payload matches backend expectations.
    return param.options.map((option) => option.value);
  }

  private hasSelectableOptions(param: ActualParameter): boolean {
    return Array.isArray(param.options) && param.options.length > 0;
  }

  private ensureParameterDefaults(parameters: ActualParameter[]): void {
    for (const param of parameters) {
      // If the catalog defines options and no value is selected yet,
      // pick the first option so the field is immediately valid/editable.
      if (this.hasSelectableOptions(param) && (param.value === null || param.value === '')) {
        const options = this.getSelectOptions(param);
        if (options.length > 0) {
          param.value = options[0];
        }
      }
    }
  }

  getRadioGroupName(param: ActualParameter): string {
    const blockId = this.selectedBlockId ?? 'no-block';
    // Use a unique group name per parameter and selected block so radios
    // from different fields do not interfere with each other.
    return `param-${blockId}-${param.name}`;
  }

  onParameterValueChange(): void {
    if (this.selectedBlockId) {
      const canvasBlock = this.canvasBlocksService.getBlockById(this.selectedBlockId);
      if (canvasBlock) {
        console.log(
          'Updating block parameters for block ID:',
          this.selectedBlockId,
          'with values:',
          this.actualParameters,
        );
        // Update the block's actual_parameters with the new values
        // canvasBlock.actual_parameters = this.actualParameters;
        
        // Values are updated via ngModel by reference. Trigger serialization so
        // backend preview/state stays synchronized while user edits parameters.
        this.canvasBlocksService.logIpcDataFormat();
      }
    }
  }

  onBlockNotesChange(): void {
    if (!this.selectedBlockId) {
      return;
    }

    const canvasBlock = this.canvasBlocksService.getBlockById(this.selectedBlockId);
    if (!canvasBlock) {
      return;
    }

    // Persist notes on the selected block object so each block keeps its own notes.
    // No backend sync needed here — notes are UI-only annotations and are not
    // part of the IPC payload sent to the Rust back-end for script generation.
    canvasBlock.notes = this.blockNotes;
  }

  shouldShowInUI(param: ActualParameter): boolean {
    const hiddenParams = ['trigger_model_name', 'slot_index', 'list_config'];
    return !hiddenParams.includes(param.name);
  }

  hasDelayListConfig(): boolean {
    return this.findParameter('list_config') !== null;
  }

  isDelayListEnabled(): boolean {
    const config = this.getDelayListConfigValue();
    return !!config;
  }

  openDelayListModal(): void {
    this.previousDelayListConfig = this.cloneDelayListConfig(this.getDelayListConfigValue());
    const config = this.getDelayListConfigValue() ?? this.seedDelayListConfig();
    this.delayListModalPoints = config.points;
    this.delayListModalSweepValues = [...config.sweep_values];
    this.showDelayListModal = true;
  }

  onDelayListCheckedChange(checked: boolean): void {
    const listConfigParam = this.findParameter('list_config');
    if (!listConfigParam) {
      return;
    }

    if (!checked) {
      listConfigParam.value = null;
      this.showDelayListModal = false;
      this.previousDelayListConfig = null;
      this.onParameterValueChange();
      return;
    }

    const seeded = this.seedDelayListConfig();
    listConfigParam.value = seeded;
    this.delayListModalPoints = seeded.points;
    this.delayListModalSweepValues = [...seeded.sweep_values];
    this.onParameterValueChange();
  }

  onDelayListCancel(): void {
    const listConfigParam = this.findParameter('list_config');
    if (listConfigParam) {
      listConfigParam.value = this.previousDelayListConfig;
    }

    this.showDelayListModal = false;
    this.previousDelayListConfig = null;
    this.onParameterValueChange();
  }

  onDelayListApply(value: DelayListModalValue): void {
    const listConfigParam = this.findParameter('list_config');
    if (!listConfigParam) {
      return;
    }

    listConfigParam.value = {
      points: value.points,
      sweep_values: [...value.sweepValues],
    };

    this.showDelayListModal = false;
    this.previousDelayListConfig = null;
    this.onParameterValueChange();
  }

  private seedDelayListConfig(): DelayListConfigValue {
    const existing = this.getDelayListConfigValue();
    if (existing) {
      return existing;
    }

    const delayTime = Number(this.findParameter('delay_time')?.value ?? 1);
    const fallback = Number.isFinite(delayTime) ? delayTime : 1;

    return {
      points: 1,
      sweep_values: [fallback],
      // sweep_values: [1], // default to 1s if no existing delay_time value, or if it's invalid    
    };
  }

  private getDelayListConfigValue(): DelayListConfigValue | null {
    const raw = this.findParameter('list_config')?.value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const candidate = raw as Partial<DelayListConfigValue>;
    const points = Number(candidate.points);
    const sweepValues = Array.isArray(candidate.sweep_values)
      ? candidate.sweep_values.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    if (!Number.isFinite(points) || points < 1) {
      return null;
    }

    if (sweepValues.length === 0) {
      return null;
    }

    return {
      points: Math.floor(points),
      sweep_values: sweepValues,
    };
  }

  private cloneDelayListConfig(value: DelayListConfigValue | null): DelayListConfigValue | null {
    if (!value) {
      return null;
    }

    return {
      points: value.points,
      sweep_values: [...value.sweep_values],
    };
  }

  private findParameter(name: string): ActualParameter | null {
    return this.actualParameters.find((param) => param.name === name) ?? null;
  }

  closePanel(): void {
    //
  }
}
