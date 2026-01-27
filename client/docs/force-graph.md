# Force-Graph API Cheatsheet

A 2D force-directed graph component using HTML5 canvas and d3-force.

## Data Input
| Method | Description | Default |
| :--- | :--- | :--- |
| **graphData**([data]) | Getter/setter for graph data: `{ nodes: [], links: [] }`. | `{ nodes: [], links: [] }` |
| **nodeId**([str]) | Node object accessor for unique ID. | `id` |
| **linkSource**([str]) | Link accessor for source node ID. | `source` |
| **linkTarget**([str]) | Link accessor for target node ID. | `target` |

## Container Layout
| Method | Description | Default |
| :--- | :--- | :--- |
| **width**([px]) | Canvas width. | <window width> |
| **height**([px]) | Canvas height. | <window height> |
| **backgroundColor**([str]) | Chart background color. | <transparent> |

## Node Styling
| Method | Description | Default |
| :--- | :--- | :--- |
| **nodeRelSize**([num]) | Ratio of node circle area per value unit. | 4 |
| **nodeVal**([num, str, fn]) | Accessor for node numeric value (affects size). | `val` |
| **nodeLabel**([str, fn]) | Hover label (supports text, HTML, or HTMLElement). | `name` |
| **nodeVisibility**([bool, str, fn]) | Whether to display the node. | `true` |
| **nodeColor**([str, fn]) | Node color accessor. | `color` |
| **nodeAutoColorBy**([str, fn]) | Automatically group colors by a specific attribute. | |
| **nodeCanvasObject**([fn]) | Custom painting: `(node, ctx, globalScale)`. | Circle |
| **nodeCanvasObjectMode**([str, fn]) | Custom paint mode: `replace`, `before`, or `after`. | `replace` |

## Link Styling
| Method | Description | Default |
| :--- | :--- | :--- |
| **linkLabel**([str, fn]) | Hover label (supports text, HTML, or HTMLElement). | `name` |
| **linkVisibility**([bool, str, fn]) | Whether to display the link. | `true` |
| **linkColor**([str, fn]) | Link color accessor. | `color` |
| **linkAutoColorBy**([str, fn]) | Automatically group link colors. | |
| **linkLineDash**([arr, str, fn]) | Line dash segments (e.g., `[5, 15]`). | `null` |
| **linkWidth**([num, str, fn]) | Link line width. | 1 |
| **linkCurvature**([num, str, fn]) | Curvature radius (0 = straight, 1 = semi-circle). | 0 |
| **linkCanvasObject**([fn]) | Custom painting: `(link, ctx, globalScale)`. | Line |
| **linkCanvasObjectMode**([str, fn]) | Custom paint mode: `replace`, `before`, or `after`. | `replace` |
| **linkDirectionalArrowLength**([num]) | Length of directional arrow head. | 0 |
| **linkDirectionalArrowColor**([str]) | Arrow color. | `color` |
| **linkDirectionalArrowRelPos**([num]) | Arrow position ratio along link (0-1). | 0.5 |
| **linkDirectionalParticles**([num]) | Number of moving particles on link. | 0 |
| **linkDirectionalParticleSpeed**([num]) | Particle speed (ratio of length per frame). | 0.01 |
| **linkDirectionalParticleWidth**([num]) | Particle diameter. | 4 |
| **linkDirectionalParticleColor**([str]) | Particle color. | `color` |
| **emitParticle**(link) | Emits a single non-cyclical particle. | |

## Render Control
| Method | Description | Default |
| :--- | :--- | :--- |
| **autoPauseRedraw**([bool]) | Performance: pause redraw when simulation is stable. | `true` |
| **pauseAnimation**() | Freezes the rendering cycle. | |
| **resumeAnimation**() | Resumes the rendering cycle. | |
| **centerAt**([x], [y], [ms]) | Panning: centers viewport at coordinates. | 0,0 |
| **zoom**([num], [ms]) | Zoom level (1 = unity). | Auto |
| **zoomToFit**([ms], [px], [filter]) | Fits all nodes into viewport with padding. | (0, 10, all) |
| **minZoom** / **maxZoom**([num]) | Zoom constraints. | 0.01 / 1000 |
| **onRenderFramePre / Post**(fn) | Callbacks for drawing external items on canvas. | |

## Force Engine (d3-force)
| Method | Description | Default |
| :--- | :--- | :--- |
| **dagMode**([str]) | DAG layout: `td`, `bu`, `lr`, `rl`, `radialout`, `radialin`. | |
| **dagLevelDistance**([num]) | Distance between graph depths. | Auto |
| **d3AlphaMin / Decay**([num]) | Simulation alpha parameters. | 0 / 0.0228 |
| **d3VelocityDecay**([num]) | Resistance/friction (0-1). | 0.4 |
| **d3Force**(str, [fn]) | Getter/setter for internal forces (`link`, `charge`, `center`). | |
| **d3ReheatSimulation**() | Restarts simulation by setting alpha to 1. | |
| **warmupTicks**([int]) | Layout cycles to run before first render. | 0 |
| **cooldownTicks**([int]) | Max frames to render before freezing. | Infinity |
| **cooldownTime**([ms]) | Max time to render before freezing. | 15000 |

## Interaction
| Method | Description |
| :--- | :--- |
| **onNodeClick / RightClick** | `(node, event)` |
| **onNodeHover** | `(node, prevNode)` |
| **onNodeDrag / End** | `(node, translate{x,y})` |
| **onLinkClick / RightClick** | `(link, event)` |
| **onLinkHover** | `(link, prevLink)` |
| **onBackgroundClick** | `(event)` |
| **onZoom / ZoomEnd** | `({ k, x, y })` |
| **enableNodeDrag**(bool) | Toggle node dragging. |
| **enableZoomInteraction**(bool/fn) | Toggle zooming. |
| **enablePanInteraction**(bool/fn) | Toggle panning. |
| **enablePointerInteraction**(bool) | Toggle mouse tracking (hover/tooltips). |

## Utility
| Method | Description |
| :--- | :--- |
| **getGraphBbox**([filter]) | Returns `{ x: [min, max], y: [min, max] }`. |
| **screen2GraphCoords**(x, y) | Translates screen px to graph units. |
| **graph2ScreenCoords**(x, y) | Translates graph units to screen px. |
