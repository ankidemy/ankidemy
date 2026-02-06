import type { FrenzyEditTool } from './types';

export type LabelDisplayModeValue = 'names' | 'codes' | 'off';
export type LabelBackgroundModeValue = 'behind_links' | 'behind_text' | 'off';

export const getToolInstruction = (params: {
  isFrenzyEditMode: boolean;
  frenzyTool: FrenzyEditTool;
  pendingLinkSourceId: string | null;
}): string | null => {
  const { isFrenzyEditMode, frenzyTool, pendingLinkSourceId } = params;
  if (!isFrenzyEditMode) return null;
  if (frenzyTool === 'link') {
    return pendingLinkSourceId
      ? `Select a target to link from ${pendingLinkSourceId}.`
      : 'Select the first node to link.';
  }
  if (frenzyTool === 'unlink') {
    return pendingLinkSourceId
      ? `Select a target to unlink from ${pendingLinkSourceId}.`
      : 'Select the first node to unlink.';
  }
  if (frenzyTool === 'delete') {
    return 'Select a node to delete.';
  }
  return null;
};

export const getLabelDisplayLabel = (mode: LabelDisplayModeValue): string => {
  if (mode === 'names') return 'Names';
  if (mode === 'codes') return 'Codes';
  return 'Off';
};

export const getLabelBackgroundLabel = (mode: LabelBackgroundModeValue): string => {
  if (mode === 'off') return 'Bg Off';
  if (mode === 'behind_links') return 'Bg Back';
  return 'Bg Front';
};

export const getQuestDisplayLabel = (mode: 'on' | 'nodes' | 'off'): string => {
  if (mode === 'on') return 'Quests';
  if (mode === 'nodes') return 'Links Off';
  return 'Off';
};
