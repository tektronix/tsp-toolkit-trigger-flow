import { Component, DestroyRef, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { CanvasBlocksService } from '../../../services/canvas-blocks.service';
import {
  findblockCategory,
  getBlockParameterDisplayName,
  ParamControlType,
  resolveParamControlType,
  shouldShowBlockParameter,
} from '../../../models/blockParameterHelper';
import { ActualParameter, EventDefinition, DelayListConfig } from '../../../models/triggerBlock';
import { Textbox } from '../../../custom-controls/textbox/textbox';
import { InputNumeric } from '../../../custom-controls/input-numeric/input-numeric';
import { Dropdown } from '../../../custom-controls/dropdown/dropdown';
import { RadioButton } from '../../../custom-controls/radio-button/radio-button';
import { MultilineTextbox } from '../../../custom-controls/multiline-textbox/multiline-textbox';
import { FormsModule } from '@angular/forms';
import { EventBlockComponent } from './event-block/event-block';
import { SpecificEvent } from './specific-event/specific-event';
import { TriggerFlowDataService } from '../../../services/triggerFlowDataService';
// import { EventDefinition } from '../../../models/triggerBlock';
import { Toggle } from '../../../custom-controls/toggle/toggle';
import {
  CheckboxGroup,
  CheckboxOption,
} from '../../../custom-controls/checkbox-group/checkbox-group';
import { RadioGroup, RadioOption } from '../../../custom-controls/radio-group/radio-group';
import { ModelResourceAllocationService } from '../../../services/model-resource-allocation.service';
import { Checkbox } from '../../../custom-controls/checkbox/checkbox';
import { DelayListModal, DelayListModalValue } from './delay-list-modal/delay-list-modal';

// interface DelayListConfigValue {
//   delay_count: number;
//   delay_durations: number[];
// }

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
    CheckboxGroup,
    RadioGroup,
    FormsModule,
    EventBlockComponent,
    SpecificEvent,
    DelayListModal,
  ],
  templateUrl: './block-parameters.html',
  styleUrl: './block-parameters.scss',
})
export class BlockParameters {
  private canvasBlocksService = inject(CanvasBlocksService);
  private triggerFlowDataService = inject(TriggerFlowDataService);
  private modelResourceService = inject(ModelResourceAllocationService);
  private destroyRef = inject(DestroyRef);

  selectedBlockId: string | null = null;
  blockName = '';
  blockTypeSvgPath = '';
  actualParameters: ActualParameter[] = [];
  blockNotes = '';
  triggerEvents: Record<string, EventDefinition> = {};
  channelListOptions: CheckboxOption[] = [];
  channelItemOptions: RadioOption[] = [];
  showDelayListModal = false;
  delayListModalDelayCount = 1;
  delayListModalDelayDurations: number[] = [1];
  selectedBlockNodeId = 'localnode';
  selectedBlockSlotIndex = 1;
  private previousDelayListConfig: DelayListConfig | null = null;

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
        
        // Resolve model context from the owning model
        const model = this.canvasBlocksService.getModelForBlock(this.selectedBlockId);

        this.selectedBlockNodeId = model?.node_id ?? 'localnode';
        this.selectedBlockSlotIndex = model?.slot_index ?? 1;

        // Notes are per-block, so refresh the textarea each time selection changes.
        this.blockNotes = canvasBlock.notes ?? '';
        // Refresh channel options BEFORE seeding defaults so composite params
        // (e.g. SourceOutputState) can pick a valid initial channel_index.
        this.refreshChannelListOptions();
        this.refreshChannelItemOptions();
        const seeded = this.ensureParameterDefaults(this.actualParameters);
        if (seeded) {
          // Defaults were just populated (e.g. first time a block is dropped onto
          // the canvas). Regenerate the script so the seeded values are reflected
          // immediately, not only on the user's first manual edit.
          this.canvasBlocksService.updateAndPrint();
        }
      }
    }
  }

  // isNumberType(type: ParamTypeName): boolean {
  //   // DelayTime is represented as a numeric value in catalog metadata.
  //   return type === 'Number' || type === 'DelayTime';
  // }

  // isStringType(type: ParamTypeName): boolean {
  //   return type === 'String';
  // }

  // isMultiLineStringType(type: ParamTypeName): boolean {
  //   return type === 'MultiString';
  // }

  // isToggleType(type: ParamTypeName): boolean {
  //   return type === 'SourceState';
  // }

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

  // Look up the catalog `trigger_events` entry for a parameter whose `type` is
  // a specific event (e.g. `event_notify_n`). Returns null if the catalog has
  // not arrived yet or the type is not an event.
  getEventDefinition(param: ActualParameter): EventDefinition | null {
    return this.triggerEvents[param.type] ?? null;
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

  private ensureParameterDefaults(parameters: ActualParameter[]): boolean {
    let changed = false;
    for (const param of parameters) {
      // If the catalog defines options and no value is selected yet,
      // pick the first option so the field is immediately valid/editable.
      if (this.hasSelectableOptions(param) && (param.value === null || param.value === '')) {
        const options = this.getSelectOptions(param);
        if (options.length > 0) {
          param.value = options[0];
          changed = true;
        }
      }

      // SourceOutputState is a composite { channel_index, state_value }; ensure
      // the value is an object so two-way binding in the template has stable refs.
      if (param.type === 'SourceOutputState') {
        const current = (param.value ?? {}) as { channel_index?: unknown; state_value?: unknown };
        const channelOptions = this.getSourceOutputStateChannelOptions();
        const channelIndex =
          current.channel_index !== undefined && current.channel_index !== null
            ? `${current.channel_index}`
            : channelOptions[0] ?? '';
        const stateOptions = this.getSourceOutputStateValueOptions();
        const stateValue =
          typeof current.state_value === 'string' && current.state_value
            ? current.state_value
            : stateOptions[0] ?? 'ON';
        const before = current as { channel_index?: unknown; state_value?: unknown };
        if (before.channel_index !== channelIndex || before.state_value !== stateValue) {
          changed = true;
        }
        param.value = { channel_index: channelIndex, state_value: stateValue };
      }
    }
    return changed;
  }

  getRadioGroupName(param: ActualParameter): string {
    const blockId = this.selectedBlockId ?? 'no-block';
    // Use a unique group name per parameter and selected block so radios
    // from different fields do not interfere with each other.
    return `param-${blockId}-${param.name}`;
  }

  onParameterValueChange(): void {
    if (!this.selectedBlockId) return;

    const canvasBlock = this.canvasBlocksService.getBlockById(this.selectedBlockId);
    if (!canvasBlock) return;

    console.log(
      'Updating block parameters for block ID:',
      this.selectedBlockId,
      'with values:',
      this.actualParameters,
    );
    canvasBlock.actual_parameters = this.actualParameters;
    this.canvasBlocksService.updateAndPrint();
    // check if its required to create connection between blocks based on parameter changes
    const sourceParam = canvasBlock.actual_parameters.find(
      (p) => p.name === 'branch_to_block_name' || p.name === 'reference_block_name' || p.name === 'reset_branch_count_block_name',
    );
    const sourceValue = sourceParam?.value ? String(sourceParam.value) : '';

    if (sourceValue) {
      // search for block with name same as sourceValue to connect with
      const targetBlock = this.canvasBlocksService.findBlockByName(sourceValue);
      if (targetBlock) {
        console.log('Found target block to connect:', targetBlock);
        // The block whose `trigger_block_name` matches is the source (output);
        // the currently selected block is the target (input).
        this.canvasBlocksService.requestConnection(
          targetBlock,
          canvasBlock,
        );
      } else {
        console.warn(`No block found with name "${sourceValue}"`);
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
    return shouldShowBlockParameter(param.name);
  }

  getChannelListOptions(): CheckboxOption[] {
    return this.channelListOptions;
  }

  private refreshChannelListOptions(): void {
    this.channelListOptions = this.selectedBlockId
      ? this.modelResourceService.getChannelOptionsForBlock(this.selectedBlockId)
      : [];
  }

  private refreshChannelItemOptions(): void {
    // ChannelItem shares the same option source as ChannelList; reuse it directly
    // since RadioOption and CheckboxOption are structurally identical.
    this.channelItemOptions = this.selectedBlockId
      ? this.modelResourceService.getChannelOptionsForBlock(this.selectedBlockId)
      : [];
  }

  getChannelListSelected(param: ActualParameter): string[] {
    return Array.isArray(param.value) ? param.value.map((v) => `${v}`) : [];
  }

  getChannelItemSelected(param: ActualParameter): string {
    return param.value === null || param.value === undefined ? '' : `${param.value}`;
  }

  onChannelListChange(param: ActualParameter, selected: string[]): void {
    param.value = selected.map((v) => Number(v));
    this.onParameterValueChange();
  }

  onChannelItemChange(param: ActualParameter, selected: string): void {
    param.value = selected === '' ? null : Number(selected);
    this.onParameterValueChange();
  }

  // ---- SourceOutputState composite control -----------------------------------
  // Renders two dropdowns: Channel (from the model's allocated channels) and
  // State (ON/OFF). The bound value is an object so the script template can
  // emit e.g. `slot[1].psu[1].ON`.
  getSourceOutputStateChannelOptions(): string[] {
    return this.channelItemOptions.map((option) => option.value);
  }

  getSourceOutputStateValueOptions(): string[] {
    return ['ON', 'OFF'];
  }

  private getSourceOutputStateObject(
    param: ActualParameter,
  ): { channel_index: string; state_value: string } {
    const value = param.value as { channel_index?: unknown; state_value?: unknown } | null;
    return {
      channel_index:
        value && value.channel_index !== undefined && value.channel_index !== null
          ? `${value.channel_index}`
          : '',
      state_value:
        value && typeof value.state_value === 'string' ? value.state_value : 'ON',
    };
  }

  getSourceOutputChannel(param: ActualParameter): string {
    return this.getSourceOutputStateObject(param).channel_index;
  }

  getSourceOutputStateValue(param: ActualParameter): string {
    return this.getSourceOutputStateObject(param).state_value;
  }

  onSourceOutputChannelChange(param: ActualParameter, selected: string): void {
    const current = this.getSourceOutputStateObject(param);
    param.value = { ...current, channel_index: selected };
    this.onParameterValueChange();
  }

  onSourceOutputStateValueChange(param: ActualParameter, selected: string): void {
    const current = this.getSourceOutputStateObject(param);
    param.value = { ...current, state_value: selected };
    this.onParameterValueChange();
  }

  getParameterDisplayName(param: ActualParameter): string {
    return getBlockParameterDisplayName(param.name);
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
    this.delayListModalDelayCount = config.delay_count;
    this.delayListModalDelayDurations = [...config.delay_durations];
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
    this.delayListModalDelayCount = seeded.delay_count;
    this.delayListModalDelayDurations = [...seeded.delay_durations];
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

  onDelayListApply(event: DelayListModalValue): void {
    // Update local UI state (so reopening shows latest values).
    this.delayListModalDelayCount = event.delayCount;
    this.delayListModalDelayDurations = [...event.delayDurations];

    // Persist to the block's list_config parameter using the same naming
    // convention as the backend contract (delay_count / delay_durations).
    const listConfigParam = this.findParameter('list_config');
    if (listConfigParam) {
      const updatedConfig: DelayListConfig = {
        delay_count: event.delayCount,
        delay_durations: [...event.delayDurations],
      };
      listConfigParam.value = updatedConfig;
    }

    this.showDelayListModal = false;
    this.previousDelayListConfig = null;
    this.onParameterValueChange();
  }

  private seedDelayListConfig(): DelayListConfig {
    const existing = this.getDelayListConfigValue();
    if (existing) {
      return existing;
    }

    const delayTime = Number(this.findParameter('delay_time')?.value ?? 1);
    const fallback = Number.isFinite(delayTime) ? delayTime : 1;

    return {
      delay_count: 1,
      delay_durations: [fallback],
      // delay_durations: [1], // default to 1s if no existing delay_time value, or if it's invalid    
    };
  }

  private getDelayListConfigValue(): DelayListConfig | null {
    const raw = this.findParameter('list_config')?.value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const candidate = raw as Partial<DelayListConfig>;
    const delayCount = Number(candidate.delay_count);
    const delayDurations = Array.isArray(candidate.delay_durations)
      ? candidate.delay_durations.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    if (!Number.isFinite(delayCount) || delayCount < 1) {
      return null;
    }

    if (delayDurations.length === 0) {
      return null;
    }

    return {
      delay_count: Math.floor(delayCount),
      delay_durations: delayDurations,
    };
  }

  private cloneDelayListConfig(value: DelayListConfig | null): DelayListConfig | null {
    if (!value) {
      return null;
    }

    return {
      delay_count: value.delay_count,
      delay_durations: [...value.delay_durations],
    };
  }

  private findParameter(name: string): ActualParameter | null {
    return this.actualParameters.find((param) => param.name === name) ?? null;
  }

  closePanel(): void {
    //
  }
}
