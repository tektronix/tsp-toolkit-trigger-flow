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
    FormsModule,
    EventBlockComponent,
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
    const hiddenParams = ['trigger_model_name', 'slot_index'];
    return !hiddenParams.includes(param.name);
  }

  closePanel(): void {
    //
  }
}
