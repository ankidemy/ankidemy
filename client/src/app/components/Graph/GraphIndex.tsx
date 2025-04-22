// Export the main components
export { default as KnowledgeGraph } from './KnowledgeGraph';
export { default as SubjectMatterGraph } from './SubjectMatterGraph';
export { default as NodeCreationModal } from './NodeCreationModal';

// Export panel components
export { default as TopControls } from './panels/TopControls';
export { default as LeftPanel } from './panels/LeftPanel';
export { default as RightPanel } from './panels/RightPanel';
export { default as LeftPanelToggle } from './panels/LeftPanelToggle';

// Export detail components
export { default as DefinitionView } from './details/DefinitionView';
export { default as ExerciseView } from './details/ExerciseView';
export { default as NodeEditForm } from './details/NodeEditForm';

// Export utilities
export { default as GraphContainer } from './utils/GraphContainer';
export { default as GraphLegend } from './utils/GraphLegend';

// Export types
export * from './utils/types';
