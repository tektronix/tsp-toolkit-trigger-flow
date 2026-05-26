import { Injectable, inject } from '@angular/core';
import { TriggerFlowDataService } from './triggerFlowDataService';

interface ShapeDefinition {
  type: string;
  svgPath: string;
  catalogLabel: string;
  label?: string;
  /**
   * When true, dropping this shape on the canvas instantiates a template
   * (multiple blocks + connections) instead of a single block. `catalogLabel`
   * then holds the template key (e.g. "pulsed_sweep").
   */
  isTemplate?: boolean;
  /** Display name for templates (shown as title). Blocks use catalogLabel. */
  displayLabel?: string;
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
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListNext.svg', catalogLabel: 'config list next' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListPrev.svg', catalogLabel: 'config list prev' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ConfigListRecall.svg', catalogLabel: 'config list recall' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-Measure.svg', catalogLabel: 'measure' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-MeasureOverlapped.svg', catalogLabel: 'measure overlapped' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-NoOperation.svg', catalogLabel: 'no operation' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-ResetBranchCounter.svg', catalogLabel: 'reset branch counter' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionBias.svg', catalogLabel: 'source action bias' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionSkip.svg', catalogLabel: 'source action skip' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionStep.svg', catalogLabel: 'source action step' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceActionSet.svg', catalogLabel: 'source action set' },
    { type: 'Action', svgPath: 'assets/shapes/palette/Action/Action-SourceOutput.svg', catalogLabel: 'source output' },

    // Branch blocks
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Always.svg', catalogLabel: 'always' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnceExcluded.svg', catalogLabel: 'once excluded' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-Once.svg', catalogLabel: 'once' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-LoopCounter.svg', catalogLabel: '< loop counter' },
    { type: 'Branch', svgPath: 'assets/shapes/palette/Branch/BranchBlock-OnEvent.svg', catalogLabel: 'on event' },

    // Notify blocks
    { type: 'Notify', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-LogEvent.svg', catalogLabel: 'log event' },
    { type: 'Notify', svgPath: 'assets/shapes/palette/Notify/NotifyBlock-Notify.svg', catalogLabel: 'notify' },

    // Timing blocks
    { type: 'Timing', svgPath: 'assets/shapes/palette/Timing/Timing-ConstantDelay.svg', catalogLabel: 'constant delay' },
    { type: 'Timing', svgPath: 'assets/shapes/palette/Timing/Timing-WaitOnEvent.svg', catalogLabel: 'wait on event' },
  ];

  private readonly templates: ShapeDefinition[] = [

    { type: 'Template', svgPath: 'assets/shapes/templates/PulsedSweep.svg', catalogLabel: 'pulsed_sweep', label: 'Pulsed Sweep', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/PulseMeasuredSweep.svg', catalogLabel: 'pulsed_measure_sweep', label: 'Pulsed Measure Sweep', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/DCSweep.svg', catalogLabel: 'dc_sweep', label: 'DC Sweep', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/DCMeasureSweep.svg', catalogLabel: 'dc_measure_sweep', label: 'DC Measure Sweep', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/WaveformCapture.svg', catalogLabel: 'waveform_capture', label: 'Waveform Capture', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/ConfigListLoad.svg', catalogLabel: 'config_list_load', label: 'Config List Load', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/DigitalIOTrigger.svg', catalogLabel: 'digital_io_trigger', label: 'Digital IO Trigger', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/SimpleMeasureLoop.svg', catalogLabel: 'simple_measure_loop', label: 'Simple Measure Loop', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/LoopUntilEvent.svg', catalogLabel: 'loop_until_event', label: 'Loop Until Event', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/WaitOnTriggerModel.svg', catalogLabel: 'wait_on_trigger_model', label: 'Wait On Trigger Model', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/MOSFET.svg', catalogLabel: 'mosfet_family_of_curves', label: 'MOSFET Family of Curves', isTemplate: true },
    { type: 'Template', svgPath: 'assets/shapes/templates/LIVCurve.svg', catalogLabel: 'liv_curves', label: 'LIV Curves', isTemplate: true },
  ];

  // TODO: Add actual template and event data when available
  private readonly events: ShapeDefinition[] = [];

  // Fallback icon used when a template's catalog `icon` has no matching SVG
  // shipped in assets. Templates from the backend only carry an icon key, so
  // until matching assets exist we render a generic action glyph.
  private static readonly TEMPLATE_FALLBACK_SVG =
    'assets/shapes/palette/Action/Action-Measure.svg';

  private readonly catalogLabelToSvgPath = new Map<string, string>();

  private triggerFlowDataService = inject(TriggerFlowDataService);

  constructor() {
    this.buildLookupMap();
  }

  private buildLookupMap(): void {
    this.shapes.forEach(shape => {
      this.catalogLabelToSvgPath.set(shape.catalogLabel, shape.svgPath);
    });
    this.templates.forEach(template => {
      this.catalogLabelToSvgPath.set(template.catalogLabel, template.svgPath);
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
        type: 'single',
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
        ],
      }]
  }

  /**
   * Get templates (placeholder for future implementation)
   */
  getTemplates(): ShapeDefinition[] {
    return [...this.templates];
  }
}
