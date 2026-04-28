import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { CanvasBlocksService } from '../../../services/canvas-blocks.service';
import { findblockCategory } from '../../../models/blockParameterHelper';
import { ActualParameter, ParamTypeName } from '../../../models/triggerBlock';
import { Textbox } from '../../../custom-controls/textbox/textbox';
import { InputNumeric } from '../../../custom-controls/input-numeric/input-numeric';
import { FormsModule } from '@angular/forms';

const CATEGORY_ICON_PATHS: Record<string, string> = {
  actions: 'assets/shapes/icons/TinyAction.svg',
  branches: 'assets/shapes/icons/TinyBranch.svg',
  notify: 'assets/shapes/icons/TinyNotify.svg',
  timing: 'assets/shapes/icons/TinyTiming.svg',
};

@Component({
  selector: 'app-block-parameters',
  imports: [AngularSvgIconModule, Textbox, InputNumeric, FormsModule],
  templateUrl: './block-parameters.html',
  styleUrl: './block-parameters.scss',
})
export class BlockParameters {
  private canvasBlocksService = inject(CanvasBlocksService);
  private destroyRef = inject(DestroyRef);

  selectedBlockId: string | null = null;
  blockName = '';
  blockTypeSvgPath = '';
  actualParameters: ActualParameter[] = [];

  constructor() {
    // Reacts to both: new block added (auto-select) and existing block clicked.
    this.canvasBlocksService.selectedBlock$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((blockId) => {
        this.selectedBlockId = blockId;
        this.updateBlockControls();
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
      }
    }
  }

  isNumberType(type: ParamTypeName): boolean {
    return type === 'Number';
  }

  isStringType(type: ParamTypeName): boolean {
    return type === 'String';
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
        canvasBlock.actual_parameters = this.actualParameters
        this.canvasBlocksService.logIpcDataFormat()
      }
    }
  }

  shouldShowInUI(param: ActualParameter): boolean {
    const hiddenParams = ['trigger_model_name'];
    return !hiddenParams.includes(param.name);
  }

  closePanel(): void {
    //
  }
}
