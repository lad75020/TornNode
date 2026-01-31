import { useCallback, useMemo, useRef, useState } from 'react';
import useChartTheme from './useChartTheme.js';

const DEFAULT_SIZE = { width: 1200, height: 800 };
const DEFAULT_LIMITS = { nodes: 140, edges: 260 };

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildGraph(nodes, relations, limits) {
  const nodeList = nodes.slice(0, limits.nodes).map((node) => ({
    ...node,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0
  }));
  const idToIndex = new Map(nodeList.map((node, idx) => [node.id, idx]));
  const edges = [];
  for (const rel of relations) {
    const from = rel?.from || rel?.source || rel?.src || rel?.left;
    const to = rel?.to || rel?.target || rel?.dst || rel?.right;
    if (!from || !to) continue;
    const source = idToIndex.get(from);
    const target = idToIndex.get(to);
    if (source === undefined || target === undefined) continue;
    edges.push({
      source,
      target,
      type: rel?.relationType || rel?.type || rel?.kind || ''
    });
    if (edges.length >= limits.edges) break;
  }
  return { nodes: nodeList, edges };
}

function layoutGraph(nodes, edges, width, height, iterations) {
  const count = nodes.length;
  if (!count) return nodes;

  const padding = 36;
  const centerX = width / 2;
  const centerY = height / 2;
  const area = width * height;
  const ideal = Math.sqrt(area / Math.max(count, 1));
  const repulsion = 0.9 * ideal * ideal;
  const spring = 0.02;
  const gravity = 0.0015;
  const damping = 0.86;

  for (const node of nodes) {
    node.x = padding + Math.random() * (width - padding * 2);
    node.y = padding + Math.random() * (height - padding * 2);
    node.vx = 0;
    node.vy = 0;
  }

  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < count; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < count; j += 1) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const force = repulsion / dist2;
        const fx = dx * force;
        const fy = dy * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const edge of edges) {
      const a = nodes[edge.source];
      const b = nodes[edge.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = dist - ideal;
      const fx = (dx / dist) * diff * spring;
      const fy = (dy / dist) * diff * spring;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const node of nodes) {
      node.vx += (centerX - node.x) * gravity;
      node.vy += (centerY - node.y) * gravity;
      node.vx *= damping;
      node.vy *= damping;
      node.x = clamp(node.x + node.vx, padding, width - padding);
      node.y = clamp(node.y + node.vy, padding, height - padding);
    }
  }

  return nodes;
}

function drawGraph(canvas, graph, options) {
  const { width, height, darkMode, palette, showLabels } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = darkMode ? '#0f1115' : '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const edge of graph.edges) {
    const from = graph.nodes[edge.source];
    const to = graph.nodes[edge.target];
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
  }
  ctx.stroke();

  for (const node of graph.nodes) {
    const color = palette[hashString(node.kind) % palette.length];
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.strokeStyle = darkMode ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.4;
    ctx.arc(node.x, node.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (showLabels && graph.nodes.length <= 90) {
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)';
    for (const node of graph.nodes) {
      ctx.fillText(node.id, node.x + 8, node.y - 6);
    }
  }
}

export default function MemoryGraphImageGenerator({ nodes, relations, darkMode }) {
  const { theme } = useChartTheme(darkMode);
  const canvasRef = useRef(null);
  const [size, setSize] = useState(DEFAULT_SIZE);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [showLabels, setShowLabels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const graphStats = useMemo(() => {
    const graph = buildGraph(nodes, relations, limits);
    return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
  }, [nodes, relations, limits]);

  const handleGenerate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = clamp(size.width, 600, 3200);
    const height = clamp(size.height, 400, 2400);
    canvas.width = width;
    canvas.height = height;

    setBusy(true);
    requestAnimationFrame(() => {
      const graph = buildGraph(nodes, relations, limits);
      layoutGraph(graph.nodes, graph.edges, width, height, 220);
      drawGraph(canvas, graph, {
        width,
        height,
        darkMode,
        palette: theme.linePalette,
        showLabels
      });
      setImageUrl(canvas.toDataURL('image/png'));
      setBusy(false);
    });
  }, [nodes, relations, limits, size, darkMode, theme.linePalette, showLabels]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'memory-graph.png';
    link.click();
  }, [imageUrl]);

  const updateSize = (field) => (event) => {
    const value = Number(event.target.value) || 0;
    setSize((prev) => ({ ...prev, [field]: value }));
  };

  const updateLimit = (field) => (event) => {
    const value = Number(event.target.value) || 0;
    setLimits((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className={`card ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'}`}>
      <div className="card-body">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h6 className="card-title mb-1">Graph image generator</h6>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {graphStats.nodeCount} nodes · {graphStats.edgeCount} links
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-sm btn-primary" onClick={handleGenerate} disabled={busy || !nodes.length}>
              {busy ? 'Rendering...' : 'Generate image'}
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={handleDownload} disabled={!imageUrl}>
              Download PNG
            </button>
          </div>
        </div>
        <div className="row g-2 mb-3">
          <div className="col-6 col-lg-3">
            <label className="form-label" style={{ fontSize: 12 }}>Width</label>
            <input type="number" className="form-control form-control-sm" value={size.width} onChange={updateSize('width')} />
          </div>
          <div className="col-6 col-lg-3">
            <label className="form-label" style={{ fontSize: 12 }}>Height</label>
            <input type="number" className="form-control form-control-sm" value={size.height} onChange={updateSize('height')} />
          </div>
          <div className="col-6 col-lg-3">
            <label className="form-label" style={{ fontSize: 12 }}>Max nodes</label>
            <input type="number" className="form-control form-control-sm" value={limits.nodes} onChange={updateLimit('nodes')} />
          </div>
          <div className="col-6 col-lg-3">
            <label className="form-label" style={{ fontSize: 12 }}>Max links</label>
            <input type="number" className="form-control form-control-sm" value={limits.edges} onChange={updateLimit('edges')} />
          </div>
        </div>
        {graphStats.edgeCount === 0 && (
          <div className="alert alert-warning py-2" role="alert" style={{ fontSize: 12 }}>
            No relations found in the MCP payload. The image will show nodes only.
          </div>
        )}
        <div className="form-check mb-3">
          <input
            className="form-check-input"
            type="checkbox"
            id="memoryGraphLabels"
            checked={showLabels}
            onChange={(event) => setShowLabels(event.target.checked)}
          />
          <label className="form-check-label" htmlFor="memoryGraphLabels" style={{ fontSize: 12 }}>
            Show labels (best for small graphs)
          </label>
        </div>
        <div className="border rounded" style={{ overflow: 'auto', background: darkMode ? '#0f1115' : '#fff' }}>
          <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
        </div>
      </div>
    </div>
  );
}
