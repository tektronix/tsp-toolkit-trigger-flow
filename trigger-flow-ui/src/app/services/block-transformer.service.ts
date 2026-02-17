import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { 
  TriggerBlock, 
  TriggerBlocksCollection, 
  BlockShape, 
  BlockCategory, 
  PaletteGroup,
  SHAPE_SVG_MAP,
  SHAPE_CATEGORY_MAP 
} from '../models/trigger-block.model';

/**
 * Service to transform trigger blocks data for UI consumption
 */
@Injectable({
  providedIn: 'root'
})
export class BlockTransformerService {

  /**
   * Transform trigger blocks collection into palette groups
   */
  transformToPaletteGroups(data: TriggerBlocksCollection | null): PaletteGroup[] {
    if (!data) return this.getDefaultGroups();

    const categoriesMap = new Map<string, BlockShape[]>();

    // Group blocks by their shape category
    Object.entries(data.blocks).forEach(([blockName, block]) => {
      const category = SHAPE_CATEGORY_MAP[block.shape] || 'Actions';
      const svgBasePath = SHAPE_SVG_MAP[block.shape] || 'assets/shapes/Actions';
      
      if (!categoriesMap.has(category)) {
        categoriesMap.set(category, []);
      }

      const blockShape: BlockShape = {
        name: blockName,
        type: blockName.replace(/\s+/g, '-').toLowerCase(),
        svgPath: this.getSvgPath(svgBasePath, blockName),
        label: this.formatLabel(blockName),
        block: block
      };

      categoriesMap.get(category)!.push(blockShape);
    });

    // Convert to palette groups structure
    const subgroups: BlockCategory[] = Array.from(categoriesMap.entries()).map(([label, shapes]) => ({
      label,
      shapes
    }));

    return [
      { label: 'Templates', type: 'single' },
      {
        label: 'Blocks',
        type: 'group',
        subgroups
      },
      { label: 'Events', type: 'single' }
    ];
  }

  /**
   * Get SVG path for a block
   */
  private getSvgPath(basePath: string, blockName: string): string {
    const formattedName = blockName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return `${basePath}/${formattedName}.svg`;
  }

  /**
   * Format block name as label
   */
  private formatLabel(blockName: string): string {
    return blockName
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get default groups when no data is available
   */
  private getDefaultGroups(): PaletteGroup[] {
    return [
      { label: 'Templates', type: 'single' },
      {
        label: 'Blocks',
        type: 'group',
        subgroups: [
          { label: 'Actions', shapes: [] },
          { label: 'Branches', shapes: [] },
          { label: 'Notify', shapes: [] },
          { label: 'Timing', shapes: [] }
        ]
      },
      { label: 'Events', type: 'single' }
    ];
  }

  /**
   * Transform for observable streams
   */
  transformObservable(source: Observable<TriggerBlocksCollection | null>): Observable<PaletteGroup[]> {
    return source.pipe(
      map(data => this.transformToPaletteGroups(data))
    );
  }
}
