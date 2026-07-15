// Declarative config for the graph context toolbar (edit + normal layouts).
// Pure builder: all state and handlers are passed in from KnowledgeGraph.

import React from 'react';
import {
  Anchor,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Compass,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flag,
  FlagTriangleLeft,
  Layers,
  LifeBuoy,
  Link2,
  List,
  Maximize,
  Minus,
  MousePointer,
  Move,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
  Unlink,
  Upload,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/app/components/core/button';
import type { ToolbarLayout } from '../components/ContextToolbar';
import type { NodeStatus } from '@/types/srs';
import type { LabelBackgroundMode } from '../utils/GraphContainer';
import type { FrenzyEditTool } from './types';

export type ToolboxButtonOptions = {
  variant?: 'outline' | 'secondary' | 'ghost' | 'destructive';
  enabled?: boolean;
  onClick?: () => void;
};

export type ToolboxButtonRenderer = (
  label: string,
  icon: React.ReactNode,
  options?: ToolboxButtonOptions,
) => React.ReactNode;

export const createToolboxButtonRenderer = (
  displayMode: 'compact' | 'descriptive',
): ToolboxButtonRenderer => {
  const isCompact = displayMode === 'compact';
  const render: ToolboxButtonRenderer = (label, icon, options = {}) => {
    const { variant = 'outline', enabled = true, onClick } = options;
    const hasIcon = icon !== null && icon !== undefined && icon !== false;
    return (
      <Button
        variant={variant}
        size="sm"
        title={label}
        aria-label={label}
        disabled={!enabled}
        onClick={enabled ? onClick : undefined}
        className={isCompact ? 'h-4 w-4 p-0' : 'h-4 px-1.5 py-0 text-[9px] leading-none gap-1'}
      >
        {hasIcon ? icon : <span className="text-[9px] font-medium leading-none">{label}</span>}
        {!isCompact && hasIcon && <span className="text-[9px] font-medium leading-none">{label}</span>}
      </Button>
    );
  };
  return render;
};

export type ToolboxLayoutContext = {
  toolboxButton: ToolboxButtonRenderer;
  canEdit: boolean;
  canEditLayout: boolean;
  canUseEditTools: boolean;
  selectedCount: number;
  selectionTool: 'none' | 'add' | 'remove' | 'move';
  isBoxSelectionMode: boolean;
  flaggableCount: number;
  selectableGroupCount: number;
  hasUndoableDelete: boolean;
  toolbarGroupId: number | null;
  canModifyGroup: boolean;
  canEditGroupSelection: boolean;
  canSelectGroupMembers: boolean;
  selectedGroupCollapsed: boolean;
  groupSelectControl: React.ReactNode;
  dagModeEnabled: boolean;
  dagOrientation: 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin';
  labelDisplayLabel: string;
  labelBackgroundLabel: string;
  labelBackgroundMode: LabelBackgroundMode;
  questDisplayLabel: string;
  infoSectionContent: React.ReactNode;
  positionsChanged: boolean;
  isSavingPositions: boolean;
  isExporting: boolean;
  isCopyingSelectionYaml: boolean;
  canImport: boolean;
  canExport: boolean;
  canShare: boolean;
  createFrenzyNode: (type: 'definition' | 'exercise' | 'source' | 'quest') => void;
  handleFrenzyToolChange: (tool: FrenzyEditTool) => void;
  undoFrenzyDelete: () => void;
  handleClearSelection: () => void;
  toggleSelectionTool: (tool: 'add' | 'remove' | 'move') => void;
  handleAddParentsToSelection: () => void;
  handleAddChildrenToSelection: () => void;
  toggleBoxSelectionMode: () => void;
  handleSelectGroupMembers: () => void;
  handleFlagSelection: (status: NodeStatus, label: string) => void;
  zoomToFitVisibleNodes: (duration?: number) => void;
  cycleLabelDisplay: () => void;
  toggleLabelBackground: () => void;
  cycleQuestVisibility: () => void;
  toggleGroupCollapse: (groupId: number, collapsed: boolean) => void;
  handleAddSelectionToGroup: () => void;
  handleRemoveSelectionFromGroup: () => void;
  handleCreateGroupPrompt: () => void;
  handleDeleteGroupPrompt: () => void;
  handleToggleDagMode: () => void;
  toggleDagVertical: () => void;
  toggleDagHorizontal: () => void;
  toggleDagRadial: () => void;
  handleToolbarImport: () => void;
  handleToolbarExport: () => void;
  handleToolbarCopySelectedYaml: () => void;
  handleToolbarShare: () => void;
  savePositions: () => void;
};

export const buildToolboxLayouts = (ctx: ToolboxLayoutContext): ToolbarLayout[] => {
  const { toolboxButton } = ctx;
  return [
    {
      id: 'edit',
      label: 'Edit',
      disabled: !ctx.canEdit,
      handleIcon: <Pencil size={9} />,
      sections: [
        {
          id: 'node-create',
          title: 'Node',
          rows: [
            [
              toolboxButton('Definition', <LifeBuoy size={10} />, {
                onClick: () => ctx.createFrenzyNode('definition'),
                enabled: ctx.canUseEditTools,
              }),
              toolboxButton('Exercise', <Anchor size={10} />, {
                onClick: () => ctx.createFrenzyNode('exercise'),
                enabled: ctx.canUseEditTools,
                variant: 'secondary',
              }),
            ],
            [
              toolboxButton('Quest', <RadioTower size={10} />, {
                onClick: () => ctx.createFrenzyNode('quest'),
                enabled: ctx.canUseEditTools,
                variant: 'ghost',
              }),
              toolboxButton('Source', <Compass size={10} />, {
                onClick: () => ctx.createFrenzyNode('source'),
                enabled: ctx.canUseEditTools,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'select',
          title: 'Select',
          rows: [
            [
              toolboxButton('Box Select', <Maximize size={10} />, {
                onClick: ctx.toggleBoxSelectionMode,
                variant: ctx.isBoxSelectionMode ? 'secondary' : 'outline',
              }),
              toolboxButton('Multi Select', <List size={10} />, { enabled: false, variant: 'ghost' }),
            ],
            [
              toolboxButton('Clear', <EyeOff size={10} />, {
                onClick: ctx.handleClearSelection,
                enabled: ctx.selectedCount > 0,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'graph',
          title: 'Graph',
          rows: [
            [
              toolboxButton('Link', <Link2 size={10} />, {
                onClick: () => ctx.handleFrenzyToolChange('link'),
                enabled: ctx.canUseEditTools,
              }),
              toolboxButton('Unlink', <Unlink size={10} />, {
                onClick: () => ctx.handleFrenzyToolChange('unlink'),
                enabled: ctx.canUseEditTools,
                variant: 'ghost',
              }),
              toolboxButton('Delete', <Trash2 size={10} />, {
                onClick: () => ctx.handleFrenzyToolChange('delete'),
                enabled: ctx.canUseEditTools,
                variant: 'destructive',
              }),
            ],
            ...(ctx.hasUndoableDelete ? [[
              toolboxButton('Undo delete', <Undo2 size={10} />, {
                onClick: ctx.undoFrenzyDelete,
                enabled: ctx.canUseEditTools,
                variant: 'ghost',
              })
            ]] : []),
          ],
        },
      ],
    },
    {
      id: 'normal',
      label: 'Normal',
      handleIcon: <MousePointer size={9} />,
      sections: [
        {
          id: 'select-normal',
          title: 'Select',
          rows: [
            [
              toolboxButton('Clear', <EyeOff size={10} />, {
                onClick: ctx.handleClearSelection,
                enabled: ctx.selectedCount > 0,
                variant: 'ghost',
              }),
              toolboxButton('Add', <Plus size={10} />, {
                onClick: () => ctx.toggleSelectionTool('add'),
                variant: ctx.selectionTool === 'add' ? 'secondary' : 'outline',
              }),
              toolboxButton('Remove', <Minus size={10} />, {
                onClick: () => ctx.toggleSelectionTool('remove'),
                variant: ctx.selectionTool === 'remove' ? 'secondary' : 'ghost',
              }),
            ],
            [
              toolboxButton('Move', <Move size={10} />, {
                onClick: () => ctx.toggleSelectionTool('move'),
                variant: ctx.selectionTool === 'move' ? 'secondary' : 'outline',
              }),
              toolboxButton('Parents', <ArrowUp size={10} />, {
                onClick: ctx.handleAddParentsToSelection,
                enabled: ctx.selectedCount > 0,
                variant: 'ghost',
              }),
              toolboxButton('Children', <ArrowDown size={10} />, {
                onClick: ctx.handleAddChildrenToSelection,
                enabled: ctx.selectedCount > 0,
                variant: 'ghost',
              }),
            ],
            [
              toolboxButton('Box Select', <Maximize size={10} />, {
                onClick: ctx.toggleBoxSelectionMode,
                variant: ctx.isBoxSelectionMode ? 'secondary' : 'ghost',
              }),
              toolboxButton('Select group', <Users size={10} />, {
                onClick: ctx.handleSelectGroupMembers,
                enabled: ctx.canSelectGroupMembers,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'flag',
          title: 'Flag',
          rows: [
            [
              toolboxButton('Grasping', <FlagTriangleLeft size={10} />, {
                onClick: () => ctx.handleFlagSelection('grasped', 'Grasping'),
                enabled: ctx.flaggableCount > 0,
              }),
            ],
            [
              toolboxButton('Tackling', <Flag size={10} />, {
                onClick: () => ctx.handleFlagSelection('tackling', 'Tackling'),
                enabled: ctx.flaggableCount > 0,
                variant: 'ghost',
              }),
            ],
            [
              toolboxButton('Learned', <Check size={10} />, {
                onClick: () => ctx.handleFlagSelection('learned', 'Learned'),
                enabled: ctx.flaggableCount > 0,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'display',
          title: 'Display',
          rows: [
            [
              toolboxButton('Fit', <Maximize size={10} />, {
                onClick: () => ctx.zoomToFitVisibleNodes(400),
              }),
            ],
            [
              toolboxButton(ctx.labelDisplayLabel, <Eye size={10} />, {
                onClick: ctx.cycleLabelDisplay,
              }),
            ],
            [
              toolboxButton(ctx.labelBackgroundLabel, <Layers size={10} />, {
                onClick: ctx.toggleLabelBackground,
                variant: ctx.labelBackgroundMode === 'off' ? 'ghost' : ctx.labelBackgroundMode === 'behind_links' ? 'outline' : 'secondary',
              }),
            ],
            [
              toolboxButton(ctx.questDisplayLabel, <RadioTower size={10} />, {
                onClick: ctx.cycleQuestVisibility,
              }),
            ],
          ],
        },
        {
          id: 'group',
          title: 'Group',
          collapsible: true,
          defaultExpanded: false,
          rows: [
            [
              ctx.groupSelectControl,
            ],
            [
              toolboxButton('Collapse', <EyeOff size={10} />, {
                onClick: () => {
                  if (ctx.toolbarGroupId) ctx.toggleGroupCollapse(ctx.toolbarGroupId, true);
                },
                enabled: ctx.canModifyGroup && !ctx.selectedGroupCollapsed,
                variant: 'ghost',
              }),
              toolboxButton('Expand', <Eye size={10} />, {
                onClick: () => {
                  if (ctx.toolbarGroupId) ctx.toggleGroupCollapse(ctx.toolbarGroupId, false);
                },
                enabled: ctx.canModifyGroup && ctx.selectedGroupCollapsed,
                variant: 'ghost',
              }),
              toolboxButton('Add', <UserPlus size={10} />, {
                onClick: ctx.handleAddSelectionToGroup,
                enabled: ctx.canEditGroupSelection,
              }),
              toolboxButton('Remove', <UserMinus size={10} />, {
                onClick: ctx.handleRemoveSelectionFromGroup,
                enabled: ctx.canEditGroupSelection,
                variant: 'ghost',
              }),
            ],
            [
              toolboxButton('Create group', <Plus size={10} />, {
                onClick: ctx.handleCreateGroupPrompt,
                enabled: ctx.canEdit && ctx.selectableGroupCount > 0,
              }),
              toolboxButton('Delete group', <Trash2 size={10} />, {
                onClick: ctx.handleDeleteGroupPrompt,
                enabled: ctx.canEdit && !!ctx.toolbarGroupId,
                variant: 'destructive',
              }),
            ],
          ],
        },
        {
          id: 'dag',
          title: 'DAG',
          collapsible: true,
          defaultExpanded: false,
          rows: [
            [
              toolboxButton(ctx.dagModeEnabled ? 'DAG On' : 'DAG Off', <Link2 size={10} />, {
                onClick: ctx.handleToggleDagMode,
                variant: ctx.dagModeEnabled ? 'secondary' : 'outline',
              }),
              (
                <div key="dag-controls" className={ctx.dagModeEnabled ? 'flex flex-col gap-0.5' : 'flex flex-col gap-0.5 opacity-50'}>
                  {toolboxButton(
                    ctx.dagOrientation === 'bu' ? 'Bottom-Up' : 'Top-Down',
                    ctx.dagOrientation === 'bu' ? <ArrowUp size={10} /> : <ArrowDown size={10} />,
                    {
                      onClick: ctx.toggleDagVertical,
                      enabled: ctx.dagModeEnabled,
                      variant: 'ghost',
                    }
                  )}
                  {toolboxButton(
                    ctx.dagOrientation === 'rl' ? 'Right-Left' : 'Left-Right',
                    ctx.dagOrientation === 'rl' ? <ArrowLeft size={10} /> : <ArrowRight size={10} />,
                    {
                      onClick: ctx.toggleDagHorizontal,
                      enabled: ctx.dagModeEnabled,
                      variant: 'ghost',
                    }
                  )}
                  {toolboxButton(
                    ctx.dagOrientation === 'radialin' ? 'Radial In' : 'Radial Out',
                    <RefreshCw size={10} />,
                    {
                      onClick: ctx.toggleDagRadial,
                      enabled: ctx.dagModeEnabled,
                      variant: 'ghost',
                    }
                  )}
                </div>
              ),
            ],
          ],
        },
        {
          id: 'info',
          title: 'Info',
          collapsible: true,
          defaultExpanded: false,
          rows: [
            [
              ctx.infoSectionContent,
            ],
          ],
        },
        {
          id: 'io',
          title: 'I/O',
          collapsible: true,
          defaultExpanded: false,
          rows: [
            [
              toolboxButton('Import', <Upload size={10} />, {
                onClick: ctx.handleToolbarImport,
                enabled: ctx.canImport,
                variant: 'ghost',
              }),
              toolboxButton('Export', ctx.isExporting ? <RefreshCw size={10} className="animate-spin" /> : <Download size={10} />, {
                onClick: ctx.handleToolbarExport,
                enabled: ctx.canExport && !ctx.isExporting && !ctx.isCopyingSelectionYaml,
              }),
            ],
            [
              toolboxButton('Copy', ctx.isCopyingSelectionYaml ? <RefreshCw size={10} className="animate-spin" /> : <Copy size={10} />, {
                onClick: ctx.handleToolbarCopySelectedYaml,
                enabled: ctx.canExport && ctx.selectedCount > 0 && !ctx.isCopyingSelectionYaml && !ctx.isExporting,
                variant: 'ghost',
              }),
              toolboxButton('Share', <Users size={10} />, {
                onClick: ctx.handleToolbarShare,
                enabled: ctx.canShare,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'save',
          title: 'Save',
          rows: [
            [
              toolboxButton('Save', <Save size={10} />, {
                onClick: ctx.savePositions,
                enabled: ctx.positionsChanged && !ctx.isSavingPositions && ctx.canEditLayout,
                variant: ctx.positionsChanged ? 'secondary' : 'outline',
              }),
            ],
          ],
        },
      ],
    },
  ];
};
