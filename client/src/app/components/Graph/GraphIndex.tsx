// File: ./src/app/components/Graph/GraphIndex.tsx
// Export the main components
export { default as KnowledgeGraph } from './KnowledgeGraph';
export { default as SubjectMatterGraph } from './SubjectMatterGraph';
export { default as NodeCreationModal } from './NodeCreationModal';
export { default as StudyModeModal } from './StudyModeModal'; // Added export

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

// Export new SRS related UI components
export { default as StatusIndicator } from './components/StatusIndicator';
export { default as ProgressDisplay } from './components/ProgressDisplay';
export { default as CreditFlowOverlay } from './components/CreditFlowOverlay';


// Export types - ensure all necessary types are exported
export * from './utils/types';
