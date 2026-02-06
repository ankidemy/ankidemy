import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRAPH_HELP_TOPICS,
  getSelectedHelpContent,
} from '../../src/app/components/Graph/knowledge-graph/helpTopics';
import {
  getLabelBackgroundLabel,
  getLabelDisplayLabel,
  getQuestDisplayLabel,
  getToolInstruction,
} from '../../src/app/components/Graph/knowledge-graph/toolbarUiConfig';

test('toolbar instruction reflects frenzy mode and tool state', () => {
  assert.equal(
    getToolInstruction({ isFrenzyEditMode: false, frenzyTool: 'link', pendingLinkSourceId: null }),
    null,
  );

  assert.equal(
    getToolInstruction({ isFrenzyEditMode: true, frenzyTool: 'delete', pendingLinkSourceId: null }),
    'Select a node to delete.',
  );

  assert.equal(
    getToolInstruction({ isFrenzyEditMode: true, frenzyTool: 'link', pendingLinkSourceId: 'D1' }),
    'Select a target to link from D1.',
  );

  assert.equal(
    getToolInstruction({ isFrenzyEditMode: true, frenzyTool: 'unlink', pendingLinkSourceId: null }),
    'Select the first node to unlink.',
  );
});

test('display labels map modes to user-facing strings', () => {
  assert.equal(getLabelDisplayLabel('names'), 'Names');
  assert.equal(getLabelDisplayLabel('codes'), 'Codes');
  assert.equal(getLabelDisplayLabel('off'), 'Off');

  assert.equal(getLabelBackgroundLabel('off'), 'Bg Off');
  assert.equal(getLabelBackgroundLabel('behind_links'), 'Bg Back');
  assert.equal(getLabelBackgroundLabel('behind_text'), 'Bg Front');

  assert.equal(getQuestDisplayLabel('on'), 'Quests');
  assert.equal(getQuestDisplayLabel('nodes'), 'Links Off');
  assert.equal(getQuestDisplayLabel('off'), 'Off');
});

test('help topics selection resolves selected topic and fallback', () => {
  const selected = getSelectedHelpContent(GRAPH_HELP_TOPICS, 'graph.edit');
  assert.equal(selected.title, 'Graph / Edit mode');
  assert.equal(selected.content.includes('Double-click empty creates.'), true);

  const fallback = getSelectedHelpContent(GRAPH_HELP_TOPICS, 'missing.topic');
  assert.deepEqual(fallback, { title: 'Help', content: 'Select a topic to see details.' });
});
