import React from 'react';

import type { GraphHelpCategory, GraphHelpContent } from '../knowledge-graph/helpTopics';

type GraphHelpOverlayProps = {
  helpTopics: GraphHelpCategory[];
  expandedHelpCategories: Set<string>;
  selectedHelpTopic: string;
  selectedHelpContent: GraphHelpContent;
  onToggleCategory: (label: string) => void;
  onSelectTopic: (topicId: string) => void;
};

const GraphHelpOverlay: React.FC<GraphHelpOverlayProps> = ({
  helpTopics,
  expandedHelpCategories,
  selectedHelpTopic,
  selectedHelpContent,
  onToggleCategory,
  onSelectTopic,
}) => {
  return (
    <div className="absolute bottom-16 left-32 z-10 w-[520px] rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="flex">
        <div className="w-44 border-r border-gray-100 p-3">
          <div className="text-[10px] font-semibold uppercase text-gray-500">Categories</div>
          <div className="mt-2 space-y-2">
            {helpTopics.map(category => {
              const isExpanded = expandedHelpCategories.has(category.label);
              return (
                <div key={category.id}>
                  <button
                    type="button"
                    onClick={() => onToggleCategory(category.label)}
                    className="flex w-full items-center justify-between text-[11px] font-semibold text-gray-600"
                  >
                    <span>{category.label}</span>
                    <span className="text-[9px] text-gray-400">{isExpanded ? 'v' : '>'}</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-1 space-y-1">
                      {category.topics.map(topic => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => onSelectTopic(topic.id)}
                          className={`w-full rounded px-2 py-1 text-left text-[11px] ${
                            selectedHelpTopic === topic.id
                              ? 'bg-gray-100 text-gray-800'
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {topic.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex-1 p-3">
          <div className="text-[11px] font-semibold uppercase text-gray-500">{selectedHelpContent.title}</div>
          <div className="mt-2 text-[11px] text-gray-600">{selectedHelpContent.content}</div>
        </div>
      </div>
    </div>
  );
};

export default GraphHelpOverlay;
