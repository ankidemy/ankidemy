export type GraphHelpTopic = {
  id: string;
  label: string;
  content: string;
};

export type GraphHelpCategory = {
  id: string;
  label: string;
  topics: GraphHelpTopic[];
};

export type GraphHelpContent = {
  title: string;
  content: string;
};

export const GRAPH_HELP_TOPICS: GraphHelpCategory[] = [
  {
    id: 'node-types',
    label: 'Node Types',
    topics: [
      { id: 'node.definition', label: 'Definition', content: 'Definitions are concept nodes that capture knowledge units.' },
      { id: 'node.exercise', label: 'Exercise', content: 'Exercises are practice nodes for applying knowledge.' },
      { id: 'node.source', label: 'Source', content: 'Sources attach references or materials to the graph.' },
      { id: 'node.quest', label: 'Quest', content: 'Quests are goal-driven nodes that group related work.' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning',
    topics: [
      { id: 'learning.study', label: 'Study', content: 'Study mode focuses on reviewing due items.' },
      { id: 'learning.practice', label: 'Practice', content: 'Practice mode emphasizes exercises and exploration.' },
    ],
  },
  {
    id: 'graph',
    label: 'Graph',
    topics: [
      { id: 'graph.normal', label: 'Normal mode', content: 'Normal mode is for browsing and selecting nodes.' },
      {
        id: 'graph.edit',
        label: 'Edit mode',
        content: 'Shortcuts: Click toggles selection. Double-click opens. Double-click empty creates. Drag near to link. Right-click removes.',
      },
    ],
  },
];

export const getSelectedHelpContent = (
  categories: GraphHelpCategory[],
  selectedHelpTopic: string,
): GraphHelpContent => {
  for (const category of categories) {
    for (const topic of category.topics) {
      if (topic.id === selectedHelpTopic) {
        return { title: `${category.label} / ${topic.label}`, content: topic.content };
      }
    }
  }
  return { title: 'Help', content: 'Select a topic to see details.' };
};
