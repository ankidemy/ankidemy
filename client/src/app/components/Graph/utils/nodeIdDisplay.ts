export const NODE_ID_VISIBLE_SUFFIX_LENGTH = 5;

export const formatNodeIdForDisplay = (
  nodeId: string,
  visibleSuffixLength = NODE_ID_VISIBLE_SUFFIX_LENGTH,
): string => {
  if (nodeId.length <= visibleSuffixLength) return nodeId;
  return `…${nodeId.slice(-visibleSuffixLength)}`;
};

export const escapeNodeIdTooltip = (nodeId: string): string => nodeId
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
