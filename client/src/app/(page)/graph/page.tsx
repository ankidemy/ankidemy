// src/app/(page)/graph/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MathJaxContext } from 'better-react-mathjax';
import GraphLayout from '@/app/components/Layout/GraphLayout';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import KnowledgeGraph from '@/app/components/Graph/KnowledgeGraph';

// MathJax configuration
const config = {
  loader: { load: ["input/tex", "output/svg"] },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
  }
};

export default function GraphPage() {
  // State to track selected subject matter
  const [selectedSubjectMatter, setSelectedSubjectMatter] = useState<string | null>(null);
  const [subjectMatters, setSubjectMatters] = useState([
    { id: 'algebra', name: 'Algebra', nodeCount: 24, exerciseCount: 12 },
    { id: 'calculus', name: 'Calculus', nodeCount: 18, exerciseCount: 9 },
    { id: 'geometry', name: 'Geometry', nodeCount: 15, exerciseCount: 8 }
  ]);
  
  // State to hold the current graph data
  const [graphData, setGraphData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Load graph data when a subject matter is selected
  useEffect(() => {
    if (selectedSubjectMatter) {
      setIsLoading(true);
      
      // In production, this would be an API call
      // Simulating API call with timeout
      setTimeout(() => {
        // Mock data for the selected subject matter
        const mockGraphData = {
          "definitions": {
            "D1": {
              "code": "D1",
              "name": "Set Theory",
              "description": [
                "A set is a collection of distinct objects. Formally, $S = \\{x : P(x)\\}$ where $P$ is a property that elements of $S$ satisfy."
              ],
              "notes": "Fundamental concept in mathematics",
              "references": [
                "Cantor, G. (1874). On a Property of the Collection of All Real Algebraic Numbers"
              ],
              "prerequisites": []
            },
            "D2": {
              "code": "D2",
              "name": "Functions",
              "description": [
                "A function $f: X \\to Y$ is a relation that associates each element $x \\in X$ with exactly one element $y \\in Y$."
              ],
              "notes": "Central concept connecting different areas of mathematics",
              "references": [
                "Bourbaki, N. (1939). Elements of Mathematics"
              ],
              "prerequisites": ["D1"]
            },
            "D3": {
              "code": "D3",
              "name": "Limit of a Function",
              "description": [
                "The limit of a function $f(x)$ as $x$ approaches $a$ is $L$, written as $\\lim_{x \\to a} f(x) = L$, if for every $\\epsilon > 0$ there exists a $\\delta > 0$ such that $|f(x) - L| < \\epsilon$ whenever $0 < |x - a| < \\delta$."
              ],
              "notes": "Foundation of calculus",
              "references": [
                "Cauchy, A. (1823). Résumé des Leçons sur le Calcul Infinitésimal"
              ],
              "prerequisites": ["D2"]
            }
          },
          "exercises": {
            "E1": {
              "code": "E1",
              "name": "Function Evaluation",
              "difficulty": "1",
              "statement": "If $f(x) = x^2 + 2x + 1$, find $f(3)$.",
              "description": "Substitute $x = 3$ into the function: $f(3) = 3^2 + 2(3) + 1 = 9 + 6 + 1 = 16$.",
              "hints": "Substitute the value of $x$ into the function and evaluate.",
              "verifiable": true,
              "result": "16",
              "prerequisites": ["D2"]
            },
            "E2": {
              "code": "E2",
              "name": "Limit Calculation",
              "difficulty": "3",
              "statement": "Calculate $\\lim_{x \\to 2} (3x^2 - 4x + 1)$.",
              "description": "Substitute $x = 2$ directly: $\\lim_{x \\to 2} (3x^2 - 4x + 1) = 3(2)^2 - 4(2) + 1 = 12 - 8 + 1 = 5$.",
              "hints": "This is a continuous function, so you can directly substitute the value.",
              "verifiable": true,
              "result": "5",
              "prerequisites": ["D3"]
            }
          }
        };
        
        setGraphData(mockGraphData);
        setIsLoading(false);
      }, 1000);
    } else {
      setGraphData(null);
    }
  }, [selectedSubjectMatter]);
  
  // Handle subject matter selection
  const handleSelectSubjectMatter = (id: string) => {
    setSelectedSubjectMatter(id);
  };
  
  return (
    <MathJaxContext config={config}>
      <GraphLayout>
        <div className="h-full w-full flex flex-col">
          {selectedSubjectMatter ? (
            isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xl text-gray-500">Loading {selectedSubjectMatter} graph...</p>
              </div>
            ) : (
              <div className="flex-1">
                {graphData && (
                  <KnowledgeGraph 
                    graphData={graphData} 
                    subjectMatterId={selectedSubjectMatter}
                    onBack={() => setSelectedSubjectMatter(null)}
                  />
                )}
              </div>
            )
          ) : (
            <div className="flex-1">
              <SubjectMatterGraph 
                subjectMatters={subjectMatters}
                onSelectSubjectMatter={handleSelectSubjectMatter}
              />
            </div>
          )}
        </div>
      </GraphLayout>
    </MathJaxContext>
  );
}
