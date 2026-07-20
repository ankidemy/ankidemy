import assert from 'node:assert/strict';
import test from 'node:test';

import {
  escapeNodeIdTooltip,
  formatNodeIdForDisplay,
} from '../../src/app/components/Graph/utils/nodeIdDisplay';

test('formatNodeIdForDisplay keeps short IDs and shows only the final five characters of long IDs', () => {
  assert.equal(formatNodeIdForDisplay('D1234'), 'D1234');
  assert.equal(formatNodeIdForDisplay('or-12345678-90ab-cdef'), '…-cdef');
});

test('escapeNodeIdTooltip makes a full node ID safe for the graph tooltip', () => {
  assert.equal(escapeNodeIdTooltip('node<&"\''), 'node&lt;&amp;&quot;&#39;');
});
