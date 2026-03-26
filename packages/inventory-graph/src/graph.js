// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';

/** @import { ERef } from '@endo/far' */

/**
 * @typedef {object} GraphNode
 * @property {string} id - formula identifier
 * @property {string} label - primary display label (pet name or truncated id)
 * @property {string[]} allNames - all pet names pointing to this formula
 * @property {string} type - formula type (from locator)
 * @property {boolean} isPetName - true if this node has at least one pet name
 * @property {boolean} isSpecial - true if all names are SPECIAL (uppercase system names)
 * @property {'live' | 'pending' | 'failed' | 'unknown'} liveness
 * @property {number} messageCount - inbox messages (for host/guest nodes, -1 = n/a)
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number | undefined} [targetX] - layout target X (for anchored modes)
 * @property {number | undefined} [targetY] - layout target Y (for anchored modes)
 */

/**
 * @typedef {object} GraphEdge
 * @property {string} source - source node id
 * @property {string} target - target node id
 * @property {string} label - edge label
 * @property {'petstore' | 'formula'} kind
 */

const SPECIAL_NAME_RE = /^[A-Z][A-Z0-9_-]*$/;

const TYPE_COLORS = harden({
  host: '#4fc3f7',
  guest: '#81c784',
  handle: '#ffb74d',
  worker: '#ce93d8',
  'pet-store': '#f06292',
  'readable-blob': '#a1887f',
  channel: '#4dd0e1',
  eval: '#fff176',
  'make-unconfined': '#ff8a65',
  'make-bundle': '#aed581',
  peer: '#90a4ae',
  remote: '#b0bec5',
  directory: '#7986cb',
  keypair: '#e0e0e0',
  promise: '#b39ddb',
  resolver: '#9fa8da',
  'mailbox-store': '#80cbc4',
  'mail-hub': '#80cbc4',
  endo: '#ef5350',
  'pet-inspector': '#7986cb',
  invitation: '#ffcc80',
  default: '#bdbdbd',
});

const LIVENESS_RING = harden({
  live: '#4caf50',
  pending: '#9e9e9e',
  failed: '#f44336',
  unknown: 'transparent',
});

/** @param {string} type */
const colorForType = type => TYPE_COLORS[type] || TYPE_COLORS.default;

const NODE_RADIUS = 16;
const LIVENESS_TIMEOUT_MS = 4000;

/**
 * Render the inventory graph into the given container.
 *
 * @param {HTMLElement} $parent
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers (host)
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 * @returns {() => void} cleanup function
 */
export const renderGraph = (
  $parent,
  { powers: resolvedPowers, rootPowers, profilePath, onProfileChange },
) => {
  $parent.innerHTML = '';

  const $container = document.createElement('div');
  $container.className = 'inventory-graph-container';

  /** @type {'force' | 'hierarchy' | 'radial'} */
  let layoutMode = 'force';
  /** @type {string | undefined} */
  let rootNodeId;
  let showFormulaEdges = true;
  let showPetStoreEdges = true;

  const $toolbar = document.createElement('div');
  $toolbar.className = 'inventory-graph-toolbar';
  const $backBtn = document.createElement('button');
  $backBtn.className = 'inventory-graph-back';
  $backBtn.type = 'button';
  $backBtn.title = 'Back to inbox';
  $backBtn.textContent = '\u2190 Inbox';
  $backBtn.addEventListener('click', () => onProfileChange(profilePath));
  $toolbar.appendChild($backBtn);
  const $status = document.createElement('span');
  $status.className = 'inventory-graph-status';
  $status.textContent = 'Loading inventory\u2026';
  $toolbar.appendChild($status);

  const $layoutGroup = document.createElement('div');
  $layoutGroup.className = 'inventory-graph-layout-group';

  const modes =
    /** @type {Array<['force' | 'hierarchy' | 'radial', string]>} */ ([
      ['force', 'Force'],
      ['hierarchy', 'Hierarchy'],
      ['radial', 'Radial'],
    ]);
  /** @type {Map<string, HTMLButtonElement>} */
  const layoutButtons = new Map();
  for (const [mode, label] of modes) {
    const $btn = document.createElement('button');
    $btn.type = 'button';
    $btn.className = 'inventory-graph-layout-btn';
    if (mode === layoutMode) $btn.classList.add('active');
    $btn.textContent = label;
    $btn.dataset.mode = mode;
    $layoutGroup.appendChild($btn);
    layoutButtons.set(mode, $btn);
  }
  $toolbar.appendChild($layoutGroup);

  const $edgeFilters = document.createElement('div');
  $edgeFilters.className = 'inventory-graph-edge-filters';

  const $formulaToggle = document.createElement('label');
  $formulaToggle.className = 'inventory-graph-filter-label';
  const $formulaCb = document.createElement('input');
  $formulaCb.type = 'checkbox';
  $formulaCb.checked = true;
  $formulaToggle.appendChild($formulaCb);
  $formulaToggle.append(' Formula');
  $edgeFilters.appendChild($formulaToggle);

  const $petStoreToggle = document.createElement('label');
  $petStoreToggle.className = 'inventory-graph-filter-label';
  const $petStoreCb = document.createElement('input');
  $petStoreCb.type = 'checkbox';
  $petStoreCb.checked = true;
  $petStoreToggle.appendChild($petStoreCb);
  $petStoreToggle.append(' Pet name');
  $edgeFilters.appendChild($petStoreToggle);

  $formulaCb.addEventListener('change', () => {
    showFormulaEdges = $formulaCb.checked;
  });
  $petStoreCb.addEventListener('change', () => {
    showPetStoreEdges = $petStoreCb.checked;
  });

  $toolbar.appendChild($edgeFilters);

  $container.appendChild($toolbar);

  const $legend = document.createElement('div');
  $legend.className = 'inventory-graph-legend';
  $container.appendChild($legend);

  const $canvas = document.createElement('canvas');
  $canvas.className = 'inventory-graph-canvas';
  $container.appendChild($canvas);

  const $tooltip = document.createElement('div');
  $tooltip.className = 'inventory-graph-tooltip';
  $container.appendChild($tooltip);

  $parent.appendChild($container);

  /** @type {GraphNode[]} */
  let nodes = [];
  /** @type {GraphEdge[]} */
  let edges = [];
  /** @type {Map<string, GraphNode>} */
  const nodeMap = new Map();
  /** @type {number | null} */
  let animFrame = null;
  let destroyed = false;

  /** @type {GraphNode | null} */
  let dragNode = null;
  /** @type {GraphNode | null} */
  let hoveredNode = null;
  let isDragging = false;

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;

  // ── Coordinate helpers ──────────────────────────────────────

  /** @param {number} sx  @param {number} sy */
  const screenToGraph = (sx, sy) => {
    const rect = $canvas.getBoundingClientRect();
    return {
      gx: (sx - rect.left - rect.width / 2 - panX) / zoom,
      gy: (sy - rect.top - rect.height / 2 - panY) / zoom,
    };
  };

  /** @param {number} gx  @param {number} gy */
  const nodeAt = (gx, gy) => {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      const dx = n.x - gx;
      const dy = n.y - gy;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) return n;
    }
    return null;
  };

  // ── Interaction ─────────────────────────────────────────────

  $canvas.addEventListener('mousedown', e => {
    const { gx, gy } = screenToGraph(e.clientX, e.clientY);
    const hit = nodeAt(gx, gy);
    if (hit) {
      dragNode = hit;
      isDragging = true;
      e.preventDefault();
    } else {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
    }
  });

  $canvas.addEventListener('mousemove', e => {
    if (isDragging && dragNode) {
      const { gx, gy } = screenToGraph(e.clientX, e.clientY);
      dragNode.x = gx;
      dragNode.y = gy;
      dragNode.vx = 0;
      dragNode.vy = 0;
    } else if (isPanning) {
      panX = panStartPanX + (e.clientX - panStartX);
      panY = panStartPanY + (e.clientY - panStartY);
    } else {
      const { gx, gy } = screenToGraph(e.clientX, e.clientY);
      const hit = nodeAt(gx, gy);
      if (hit !== hoveredNode) {
        hoveredNode = hit;
        $canvas.style.cursor = hit ? 'grab' : 'default';
        updateTooltip(e);
      }
    }
  });

  /** @param {MouseEvent} e */
  const updateTooltip = e => {
    if (!hoveredNode) {
      $tooltip.style.display = 'none';
      return;
    }
    const n = hoveredNode;
    const names = n.allNames.length > 0 ? n.allNames.join(', ') : n.label;
    const lines = [names];
    if (n.type && n.type !== 'unknown') lines.push(`type: ${n.type}`);
    lines.push(`id: ${n.id}`);
    if (n.liveness !== 'unknown') lines.push(`status: ${n.liveness}`);
    if (n.messageCount >= 0) lines.push(`messages: ${n.messageCount}`);
    $tooltip.textContent = lines.join('\n');
    $tooltip.style.display = 'block';
    const rect = $container.getBoundingClientRect();
    $tooltip.style.left = `${e.clientX - rect.left + 12}px`;
    $tooltip.style.top = `${e.clientY - rect.top + 12}px`;
  };

  const onMouseUp = () => {
    dragNode = null;
    isDragging = false;
    isPanning = false;
  };
  $canvas.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mouseup', onMouseUp);

  $canvas.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoom = Math.max(0.1, Math.min(5, zoom * factor));
    },
    { passive: false },
  );

  $canvas.addEventListener('mouseleave', () => {
    hoveredNode = null;
    $tooltip.style.display = 'none';
  });

  $layoutGroup.addEventListener('click', e => {
    const $btn = /** @type {HTMLElement} */ (e.target).closest(
      '.inventory-graph-layout-btn',
    );
    if (!$btn) return;
    const next = /** @type {'force' | 'hierarchy' | 'radial'} */ (
      $btn.dataset.mode
    );
    if (next === layoutMode) return;
    layoutMode = next;
    for (const [m, b] of layoutButtons) {
      b.classList.toggle('active', m === next);
    }
    applyLayout();
  });

  // ── Graph building ──────────────────────────────────────────

  /**
   * @param {string} id
   * @param {string} label
   * @param {string} type
   * @param {boolean} isPetName
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @returns {GraphNode}
   */
  const ensureNode = (id, label, type, isPetName, cx, cy, radius) => {
    const existing = nodeMap.get(id);
    if (existing) {
      if (isPetName && !existing.allNames.includes(label)) {
        existing.allNames.push(label);
        existing.label =
          existing.allNames.filter(n => !SPECIAL_NAME_RE.test(n))[0] ||
          existing.allNames[0];
        existing.isPetName = true;
      }
      if (type !== 'unknown' && existing.type === 'unknown') {
        existing.type = type;
      }
      return existing;
    }
    const angle = Math.random() * 2 * Math.PI;
    const isSpecial = isPetName && SPECIAL_NAME_RE.test(label);
    /** @type {GraphNode} */
    const node = {
      id,
      label,
      allNames: isPetName ? [label] : [],
      type: type || 'unknown',
      isPetName,
      isSpecial,
      liveness: 'unknown',
      messageCount: -1,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
    nodes.push(node);
    nodeMap.set(id, node);
    return node;
  };

  /**
   * @param {Array<{ name: string, id: string, type: string }>} entries
   * @param {{ nodes: Array<{ id: string, type: string }>, edges: Array<{ sourceId: string, targetId: string, label: string }> }} [graphData]
   * @param {string} [agentId] - formula ID of the current agent
   */
  const buildGraph = (entries, graphData, agentId) => {
    nodeMap.clear();
    nodes = [];
    edges = [];

    const cx = 0;
    const cy = 0;
    const radius = Math.max(150, entries.length * 20);

    for (const { name, id, type } of entries) {
      ensureNode(id, name, type, true, cx, cy, radius);
    }

    if (graphData) {
      for (const { id, type } of graphData.nodes) {
        ensureNode(id, id.split(':')[0].slice(-6), type, false, cx, cy, radius);
      }

      for (const { sourceId, targetId, label } of graphData.edges) {
        ensureNode(
          sourceId,
          sourceId.split(':')[0].slice(-6),
          'unknown',
          false,
          cx,
          cy,
          radius,
        );
        ensureNode(
          targetId,
          targetId.split(':')[0].slice(-6),
          'unknown',
          false,
          cx,
          cy,
          radius,
        );
        edges.push({
          source: sourceId,
          target: targetId,
          label,
          kind: 'formula',
        });
      }
    }

    if (agentId) {
      /** @type {Set<string>} */
      const hasIncoming = new Set();
      for (const e of edges) {
        hasIncoming.add(e.target);
      }
      /** @type {Set<string>} */
      const seen = new Set();
      for (const { name, id } of entries) {
        if (id !== agentId && !seen.has(id) && !hasIncoming.has(id)) {
          seen.add(id);
          edges.push({
            source: agentId,
            target: id,
            label: name,
            kind: 'petstore',
          });
        }
      }
    }

    for (const n of nodes) {
      if (n.allNames.length > 0) {
        n.isSpecial = n.allNames.every(nm => SPECIAL_NAME_RE.test(nm));
      }
    }
  };

  // ── Layout targets ──────────────────────────────────────────

  const HIERARCHY_ROW_SPACING = 120;
  const HIERARCHY_COL_SPACING = 90;
  const RADIAL_RING_SPACING = 130;

  /**
   * BFS from root, returning a Map of node-id to depth and
   * a Map of depth to GraphNode[].
   * @returns {{ depthOf: Map<string, number>, rings: Map<number, GraphNode[]> }}
   */
  const computeDepthRings = () => {
    /** @type {Map<string, number>} */
    const depthOf = new Map();
    const root =
      rootNodeId && nodeMap.has(rootNodeId) ? rootNodeId : nodes[0]?.id;
    if (!root) return { depthOf, rings: new Map() };

    const queue = [root];
    depthOf.set(root, 0);
    while (queue.length > 0) {
      const id = /** @type {string} */ (queue.shift());
      const d = /** @type {number} */ (depthOf.get(id));
      for (const e of edges) {
        const neighbor =
          e.source === id ? e.target : e.target === id ? e.source : undefined;
        if (neighbor && !depthOf.has(neighbor)) {
          depthOf.set(neighbor, d + 1);
          queue.push(neighbor);
        }
      }
    }

    let maxDepth = 0;
    for (const d of depthOf.values()) {
      if (d > maxDepth) maxDepth = d;
    }
    for (const n of nodes) {
      if (!depthOf.has(n.id)) {
        depthOf.set(n.id, maxDepth + 1);
      }
    }

    /** @type {Map<number, GraphNode[]>} */
    const rings = new Map();
    for (const n of nodes) {
      const d = /** @type {number} */ (depthOf.get(n.id));
      let ring = rings.get(d);
      if (!ring) {
        ring = [];
        rings.set(d, ring);
      }
      ring.push(n);
    }

    return { depthOf, rings };
  };

  /** Place nodes in horizontal rows by BFS depth. */
  const computeHierarchyTargets = () => {
    const { rings } = computeDepthRings();
    if (rings.size === 0) return;

    const totalDepth = Math.max(...rings.keys());
    const originY = -(totalDepth * HIERARCHY_ROW_SPACING) / 2;

    for (const [d, row] of rings) {
      const totalWidth = (row.length - 1) * HIERARCHY_COL_SPACING;
      for (let i = 0; i < row.length; i += 1) {
        row[i].targetX = i * HIERARCHY_COL_SPACING - totalWidth / 2;
        row[i].targetY = originY + d * HIERARCHY_ROW_SPACING;
      }
    }
  };

  /** Place nodes on concentric orbital rings by BFS depth. */
  const computeRadialTargets = () => {
    const { rings } = computeDepthRings();
    if (rings.size === 0) return;

    for (const [d, ring] of rings) {
      if (d === 0) {
        for (const n of ring) {
          n.targetX = 0;
          n.targetY = 0;
        }
      } else {
        const r = d * RADIAL_RING_SPACING;
        for (let i = 0; i < ring.length; i += 1) {
          const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2;
          ring[i].targetX = r * Math.cos(angle);
          ring[i].targetY = r * Math.sin(angle);
        }
      }
    }
  };

  /** Clear all layout targets so the force simulation is unconstrained. */
  const clearTargets = () => {
    for (const n of nodes) {
      n.targetX = undefined;
      n.targetY = undefined;
    }
  };

  /** Apply the current layout mode's targets. */
  const applyLayout = () => {
    if (layoutMode === 'hierarchy') {
      computeHierarchyTargets();
    } else if (layoutMode === 'radial') {
      computeRadialTargets();
    } else {
      clearTargets();
    }
  };

  // ── Force simulation ────────────────────────────────────────

  const DAMPING = 0.85;
  const REPULSION = 5000;
  const SPRING_LENGTH = 120;
  const SPRING_K = 0.005;
  const CENTER_GRAVITY = 0.01;
  const TARGET_K = 0.08;
  const DT = 1;
  const MIN_VELOCITY = 0.01;

  const simulate = () => {
    const anchored = layoutMode !== 'force';

    for (const n of nodes) {
      if (n !== dragNode) {
        let fx = 0;
        let fy = 0;

        for (const m of nodes) {
          if (m !== n) {
            let dx = n.x - m.x;
            let dy = n.y - m.y;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq) || 1;
            if (dist < 1) {
              dx = (Math.random() - 0.5) * 2;
              dy = (Math.random() - 0.5) * 2;
            }
            const repStr = anchored ? REPULSION * 0.4 : REPULSION;
            fx += (dx / dist) * (repStr / (distSq || 1));
            fy += (dy / dist) * (repStr / (distSq || 1));
          }
        }

        if (anchored) {
          if (n.targetX !== undefined && n.targetY !== undefined) {
            fx += (n.targetX - n.x) * TARGET_K;
            fy += (n.targetY - n.y) * TARGET_K;
          }
        } else {
          for (const e of edges) {
            /** @type {GraphNode | undefined} */
            let other;
            if (e.source === n.id) other = nodeMap.get(e.target);
            else if (e.target === n.id) other = nodeMap.get(e.source);
            if (other) {
              const dx = other.x - n.x;
              const dy = other.y - n.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const displacement = dist - SPRING_LENGTH;
              fx += (dx / dist) * displacement * SPRING_K;
              fy += (dy / dist) * displacement * SPRING_K;
            }
          }

          fx -= n.x * CENTER_GRAVITY;
          fy -= n.y * CENTER_GRAVITY;
        }

        n.vx = (n.vx + fx * DT) * DAMPING;
        n.vy = (n.vy + fy * DT) * DAMPING;
        if (Math.abs(n.vx) < MIN_VELOCITY) n.vx = 0;
        if (Math.abs(n.vy) < MIN_VELOCITY) n.vy = 0;
        n.x += n.vx * DT;
        n.y += n.vy * DT;
      }
    }
  };

  // ── Drawing helpers ─────────────────────────────────────────

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} fromX  @param {number} fromY
   * @param {number} toX  @param {number} toY
   * @param {number} size
   */
  const drawArrow = (ctx, fromX, fromY, toX, toY, size) => {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - size * Math.cos(angle - Math.PI / 6),
      toY - size * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      toX - size * Math.cos(angle + Math.PI / 6),
      toY - size * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  };

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  @param {number} y
   * @param {number} s - half-size
   * @param {number} r - corner radius
   */
  const drawRoundedRect = (ctx, x, y, s, r) => {
    ctx.beginPath();
    ctx.moveTo(x - s + r, y - s);
    ctx.lineTo(x + s - r, y - s);
    ctx.arcTo(x + s, y - s, x + s, y - s + r, r);
    ctx.lineTo(x + s, y + s - r);
    ctx.arcTo(x + s, y + s, x + s - r, y + s, r);
    ctx.lineTo(x - s + r, y + s);
    ctx.arcTo(x - s, y + s, x - s, y + s - r, r);
    ctx.lineTo(x - s, y - s + r);
    ctx.arcTo(x - s, y - s, x - s + r, y - s, r);
    ctx.closePath();
  };

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  @param {number} y  @param {number} s
   */
  const drawDiamond = (ctx, x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  };

  // ── Main render ─────────────────────────────────────────────

  const render = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = $canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    $canvas.width = w * dpr;
    $canvas.height = h * dpr;

    const ctx = $canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.scale(zoom, zoom);

    // ── Edges ──
    for (const e of edges) {
      if (e.kind === 'formula' && !showFormulaEdges) {
        // skip
      } else if (e.kind === 'petstore' && !showPetStoreEdges) {
        // skip
      } else {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (src && tgt) {
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / dist;
          const uy = dy / dist;
          const edgeInset = NODE_RADIUS + 6;
          const startX = src.x + ux * NODE_RADIUS;
          const startY = src.y + uy * NODE_RADIUS;
          const endX = tgt.x - ux * edgeInset;
          const endY = tgt.y - uy * edgeInset;

          ctx.beginPath();
          if (e.kind === 'formula') {
            ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.5;
          } else {
            ctx.strokeStyle = 'rgba(100, 181, 246, 0.45)';
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
          }
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle =
            e.kind === 'formula'
              ? 'rgba(255, 152, 0, 0.6)'
              : 'rgba(100, 181, 246, 0.5)';
          drawArrow(ctx, startX, startY, endX, endY, 9);

          if (e.label) {
            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2;
            ctx.font = '9px monospace';
            ctx.fillStyle = 'rgba(180, 180, 180, 0.7)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(e.label, midX, midY - 3);
          }
        }
      }
    }

    // ── Nodes ──
    for (const n of nodes) {
      const color = colorForType(n.type);
      const isHovered = n === hoveredNode;
      const r = isHovered ? NODE_RADIUS + 3 : NODE_RADIUS;
      const isPeerOrRemote = n.type === 'peer' || n.type === 'remote';

      if (isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
      }

      if (isPeerOrRemote) {
        drawDiamond(ctx, n.x, n.y, r);
      } else if (n.isSpecial) {
        drawRoundedRect(ctx, n.x, n.y, r, 5);
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      if (n.liveness !== 'unknown') {
        const ringColor = LIVENESS_RING[n.liveness];
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (n.messageCount > 0) {
        const badgeX = n.x + r * 0.7;
        const badgeY = n.y - r * 0.7;
        const badgeR = 7;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR, 0, 2 * Math.PI);
        ctx.fillStyle = '#f44336';
        ctx.fill();
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const countStr = n.messageCount > 99 ? '99+' : String(n.messageCount);
        ctx.fillText(countStr, badgeX, badgeY);
      }

      ctx.font = n.isSpecial
        ? 'bold 10px monospace'
        : '11px system-ui, sans-serif';
      ctx.fillStyle = n.isSpecial ? '#90caf9' : '#e0e0e0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const displayLabel =
        n.label.length > 22 ? `${n.label.slice(0, 20)}\u2026` : n.label;
      ctx.fillText(displayLabel, n.x, n.y + r + 4);

      if (n.allNames.length > 1) {
        ctx.font = '8px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(144, 202, 249, 0.7)';
        ctx.fillText(
          `+${n.allNames.length - 1} alias${n.allNames.length > 2 ? 'es' : ''}`,
          n.x,
          n.y + r + 18,
        );
      } else if (n.type && n.type !== 'unknown') {
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(180, 180, 180, 0.6)';
        ctx.fillText(n.type, n.x, n.y + r + 18);
      }
    }

    ctx.restore();
  };

  const loop = () => {
    if (destroyed) return;
    simulate();
    render();
    animFrame = requestAnimationFrame(loop);
  };

  // ── Legend ───────────────────────────────────────────────────

  /** @param {boolean} hasFormulaEdges */
  const renderLegend = hasFormulaEdges => {
    $legend.innerHTML = '';

    if (hasFormulaEdges) {
      const petItem = document.createElement('span');
      petItem.className = 'legend-item';
      petItem.innerHTML =
        '<span class="legend-line legend-petstore"></span> pet-store';
      $legend.appendChild(petItem);

      const formulaItem = document.createElement('span');
      formulaItem.className = 'legend-item';
      formulaItem.innerHTML =
        '<span class="legend-line legend-formula"></span> formula dep';
      $legend.appendChild(formulaItem);
    }

    for (const [key, clr] of [
      ['live', LIVENESS_RING.live],
      ['pending', LIVENESS_RING.pending],
      ['failed', LIVENESS_RING.failed],
    ]) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-ring" style="border-color:${clr}"></span>${key}`;
      $legend.appendChild(item);
    }

    const shapeSpecial = document.createElement('span');
    shapeSpecial.className = 'legend-item';
    shapeSpecial.innerHTML =
      '<span class="legend-shape legend-square"></span>system';
    $legend.appendChild(shapeSpecial);

    const shapePeer = document.createElement('span');
    shapePeer.className = 'legend-item';
    shapePeer.innerHTML =
      '<span class="legend-shape legend-diamond"></span>peer/remote';
    $legend.appendChild(shapePeer);

    const typesUsed = new Set(
      nodes.map(n => n.type).filter(t => t !== 'unknown'),
    );
    for (const t of typesUsed) {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-dot" style="background:${colorForType(t)}"></span>${t}`;
      $legend.appendChild(item);
    }
  };

  // ── Data loading ────────────────────────────────────────────

  const loadData = async () => {
    try {
      const powers = /** @type {ERef<unknown>} */ (resolvedPowers);
      const names = /** @type {string[]} */ (await E(powers).list());

      /** @type {Array<{ name: string, id: string, type: string }>} */
      const entries = [];
      await Promise.all(
        names.map(async name => {
          try {
            const locator = await E(powers).locate(name);
            if (!locator) return;
            const url = new URL(/** @type {string} */ (locator));
            const formulaNumber = url.searchParams.get('id');
            const nodeNumber = url.hostname;
            const type = url.searchParams.get('type') || 'unknown';
            if (formulaNumber) {
              entries.push({
                name,
                id: `${formulaNumber}:${nodeNumber}`,
                type,
              });
            }
          } catch {
            // skip entries we can't locate
          }
        }),
      );

      /** @type {{ nodes: Array<{ id: string, type: string }>, edges: Array<{ sourceId: string, targetId: string, label: string }> } | undefined} */
      let graphData;
      try {
        const host = /** @type {ERef<unknown>} */ (rootPowers);
        const result = /** @type {any} */ (await E(host).getFormulaGraph());
        if (
          result &&
          Array.isArray(result.edges) &&
          Array.isArray(result.nodes)
        ) {
          graphData = result;
        }
      } catch (graphErr) {
        console.warn('getFormulaGraph unavailable:', graphErr);
      }

      /** @type {string | undefined} */
      let agentId;
      try {
        const locator = await E(powers).locate('@agent');
        if (locator) {
          const url = new URL(/** @type {string} */ (locator));
          const num = url.searchParams.get('id');
          const node = url.hostname;
          if (num) agentId = `${num}:${node}`;
        }
      } catch {
        // AGENT not available
      }

      buildGraph(entries, graphData, agentId);
      rootNodeId = agentId;
      applyLayout();

      const statusParts = [`${nodes.length} nodes, ${edges.length} edges`];
      if (!graphData) {
        statusParts.push('\u2014 restart daemon for formula edges');
      }
      $status.textContent = statusParts.join(' ');
      renderLegend(!!graphData && graphData.edges.length > 0);

      loop();

      // ── Async enrichment (liveness, aliases, inbox) ──────

      const uniqueIds = [...new Set(entries.map(e => e.id))];
      void Promise.allSettled(
        uniqueIds.map(async id => {
          try {
            const allNames = /** @type {string[]} */ (
              await E(powers).reverseIdentify(id)
            );
            const node = nodeMap.get(id);
            if (node && allNames && allNames.length > 0) {
              for (const nm of allNames) {
                if (!node.allNames.includes(nm)) {
                  node.allNames.push(nm);
                }
              }
              node.label =
                node.allNames.filter(nm => !SPECIAL_NAME_RE.test(nm))[0] ||
                node.allNames[0];
              node.isSpecial = node.allNames.every(nm =>
                SPECIAL_NAME_RE.test(nm),
              );
            }
          } catch {
            // ignore
          }
        }),
      );

      void Promise.allSettled(
        entries.map(async ({ name, id }) => {
          const node = nodeMap.get(id);
          if (!node) return;
          try {
            await Promise.race([
              E(powers).lookup(name),
              new Promise((_resolve, reject) =>
                setTimeout(
                  () => reject(new Error('timeout')),
                  LIVENESS_TIMEOUT_MS,
                ),
              ),
            ]);
            node.liveness = 'live';
          } catch (err) {
            const msg = /** @type {Error} */ (err).message;
            if (msg === 'timeout') {
              node.liveness = 'pending';
            } else {
              node.liveness = 'failed';
            }
          }
        }),
      );

      void Promise.allSettled(
        entries.map(async ({ name, id, type }) => {
          if (type !== 'host' && type !== 'guest') return;
          const node = nodeMap.get(id);
          if (!node) return;
          try {
            const agentPowers = await E(powers).lookup(name);
            const messages = /** @type {unknown[]} */ (
              await E(/** @type {any} */ (agentPowers)).listMessages()
            );
            node.messageCount = messages.length;
          } catch {
            // not available
          }
        }),
      );
    } catch (err) {
      $status.textContent = `Error: ${/** @type {Error} */ (err).message}`;
    }
  };

  const onResize = () => {
    $canvas.width = $canvas.clientWidth * (window.devicePixelRatio || 1);
    $canvas.height = $canvas.clientHeight * (window.devicePixelRatio || 1);
  };
  window.addEventListener('resize', onResize);
  void loadData();

  return () => {
    destroyed = true;
    if (animFrame !== null) cancelAnimationFrame(animFrame);
    document.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', onResize);
  };
};
harden(renderGraph);
