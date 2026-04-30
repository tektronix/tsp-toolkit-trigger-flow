import { Injectable } from '@angular/core';

interface ShapeDefinition {
  type: string;
  svgPath: string;
  catalogLabel: string;
}

interface GroupDefinition {
  label: string;
  type: 'single' | 'group';
  subgroups?: SubgroupDefinition[];
}

interface SubgroupDefinition {
  label: string;
  shapes: ShapeDefinition[];
}

@Injectable({
  providedIn: 'root'
})
export class PaletteDataService {
  private readonly shapes: ShapeDefinition[] = [
    // Action blocks
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListNext.svg', catalogLabel: 'configlist next' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListPrev.svg', catalogLabel: 'configlist prev' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListRecall.svg', catalogLabel: 'configlist recall' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-Measure.svg', catalogLabel: 'measure' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-MeasureOverlapped.svg', catalogLabel: 'measure overlapped' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-NoOperation.svg', catalogLabel: 'no operation' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ResetBranchCounter.svg', catalogLabel: 'reset counter' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionBias.svg', catalogLabel: 'source action bias' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionSkip.svg', catalogLabel: 'source action skip' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionStep.svg', catalogLabel: 'source action step' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionSet.svg', catalogLabel: 'source action set' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceOutput.svg', catalogLabel: 'source output' },
    
    // Branch blocks
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Always.svg', catalogLabel: 'always' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnceExcluded.svg', catalogLabel: 'onceexcluded' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Once.svg', catalogLabel: 'once' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-LoopCounter.svg', catalogLabel: 'counter' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnEvent.svg', catalogLabel: 'event count' },
    
    // Notify blocks
    { type: 'Notify', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-LogEvent.svg', catalogLabel: 'log_event' },
    { type: 'Notify', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-Notify.svg', catalogLabel: 'notify' },
    
    // Timing blocks
    { type: 'Timing', svgPath: 'assets/shapes/palette/Timing/Timing-ConstantDelay.svg', catalogLabel: 'delay constant' },
    { type: 'Timing', svgPath: 'assets/shapes/palette/Timing/Timing-WaitOnEvent.svg', catalogLabel: 'wait' },
  ];

  // TODO: Add actual template and event data when available
  private readonly templates: ShapeDefinition[] = [];
  private readonly events: ShapeDefinition[] = [];

  private readonly catalogLabelToSvgPath = new Map<string, string>();

  constructor() {
    this.buildLookupMap();
  }

  private buildLookupMap(): void {
    this.shapes.forEach(shape => {
      this.catalogLabelToSvgPath.set(shape.catalogLabel, shape.svgPath);
    });
  }

  /**
   * Get SVG path by catalog label
   */
  getSVGPathByCatalogLabel(catalogLabel: string): string | undefined {
    return this.catalogLabelToSvgPath.get(catalogLabel);
  }

  /**
   * Get canvas SVG path by catalog label (converts palette/ to canvas/)
   */
  getCanvasSVGPathByCatalogLabel(catalogLabel: string): string | undefined {
    const palettePath = this.getSVGPathByCatalogLabel(catalogLabel);
    return palettePath ? palettePath.replace('palette/', 'canvas/') : undefined;
  }

  /**
   * Get all shapes grouped by type
   */
  getShapesByType(): Record<string, ShapeDefinition[]> {
    return this.shapes.reduce((acc, shape) => {
      if (!acc[shape.type]) {
        acc[shape.type] = [];
      }
      acc[shape.type].push(shape);
      return acc;
    }, {} as Record<string, ShapeDefinition[]>);
  }

  /**
   * Get all shapes as flat array
   */
  getAllShapes(): ShapeDefinition[] {
    return [...this.shapes];
  }

  /**
   * Get the complete groups structure for the palette UI
   */
  getGroupsStructure(): GroupDefinition[] {
    const shapesByType = this.getShapesByType();
    
    return [
      { 
        label: 'Templates', 
        type: 'single'
        // TODO: Add subgroups when template data is available
      },
      {
        label: 'Blocks',
        type: 'group',
        subgroups: [
          {
            label: 'Actions',
            shapes: shapesByType['Action'] || []
          },
          {
            label: 'Branches', 
            shapes: shapesByType['Branch'] || []
          },
          {
            label: 'Notify',
            shapes: shapesByType['Notify'] || []
          },
          {
            label: 'Timing',
            shapes: shapesByType['Timing'] || []
          }
        ]
      }
    ];
  }

  /**
   * Get templates (placeholder for future implementation)
   */
  getTemplates(): ShapeDefinition[] {
    return [...this.templates];
  }
}