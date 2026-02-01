import { useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';
import JsonPreview from './JsonPreview.jsx';
import MemoryGraphImageGenerator from './MemoryGraphImageGenerator.jsx';

const MAX_ROWS = 220;

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function normalizeTagList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function getEntityId(entity) {
  return entity?.data?.id || entity?.id || entity?.name || entity?.key || 'unknown';
}

function getEntityKind(entity) {
  return entity?.data?.kind || entity?.kind || entity?.type || 'unknown';
}

function getEntitySummary(entity) {
  return entity?.data?.summary || entity?.summary || entity?.content || '';
}

function getEntityTags(entity) {
  return normalizeTagList(entity?.data?.tags || entity?.tags);
}

function getEntityLastTouched(entity) {
  return entity?.data?.lastTouched || entity?.lastTouched || entity?.data?.updatedAt || null;
}

function buildNode(entity) {
  return {
    id: String(getEntityId(entity)),
    kind: String(getEntityKind(entity)),
    summary: String(getEntitySummary(entity) || ''),
    raw: entity
  };
}

function formatDate(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item) || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export default function MemoryGraphExplorer({ darkMode }) {
  const { theme, themedOptions, ds } = useChartTheme(darkMode);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [namespaceInput, setNamespaceInput] = useState('');
  const [activeNamespace, setActiveNamespace] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(namespaceValue, force = false) {
    try {
      setError('');
      force ? setRefreshing(true) : setLoading(true);
      const params = new URLSearchParams();
      if (namespaceValue) params.set('namespace', namespaceValue);
      if (force) params.set('force', '1');
      const qs = params.toString();
      const res = await fetch(qs ? `/api/memory/graphs?${qs}` : '/api/memory/graphs');
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setPayload(json);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load MCP data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(activeNamespace, false);
  }, [activeNamespace]);

  const data = payload?.data;
  const entities = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return normalizeArray(data.entities || data.graphs || data.items);
  }, [data]);
  const relations = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data.relations)) return data.relations;
    return normalizeArray(data.edges || data.links);
  }, [data]);

  const kinds = useMemo(() => countBy(entities, getEntityKind), [entities]);
  const tags = useMemo(() => {
    const all = [];
    for (const entity of entities) {
      all.push(...getEntityTags(entity));
    }
    return countBy(all, (tag) => tag);
  }, [entities]);
  const relationKinds = useMemo(() => countBy(relations, (rel) => rel?.type || rel?.kind || 'unknown'), [relations]);

  const kindOptions = useMemo(() => ['all', ...kinds.map((k) => k.key)], [kinds]);

  const filteredEntities = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entities.filter((entity) => {
      if (kindFilter !== 'all' && getEntityKind(entity) !== kindFilter) return false;
      if (!term) return true;
      const id = String(getEntityId(entity)).toLowerCase();
      const summary = String(getEntitySummary(entity)).toLowerCase();
      const tagsList = getEntityTags(entity).join(' ').toLowerCase();
      return id.includes(term) || summary.includes(term) || tagsList.includes(term);
    });
  }, [entities, search, kindFilter]);

  const graphNodes = useMemo(() => filteredEntities.map(buildNode), [filteredEntities]);

  const limitedEntities = filteredEntities.slice(0, MAX_ROWS);

  const topKinds = kinds.slice(0, 12);
  const kindsChart = {
    labels: topKinds.map((k) => k.key),
    datasets: [
      ds('bar', 0, topKinds.map((k) => k.count), {
        label: 'Entities'
      })
    ]
  };

  const topTags = tags.slice(0, 10);
  const tagColors = topTags.map((_, idx) => theme.linePalette[idx % theme.linePalette.length]);
  const tagsChart = {
    labels: topTags.map((t) => t.key),
    datasets: [
      {
        data: topTags.map((t) => t.count),
        backgroundColor: tagColors,
        borderColor: darkMode ? '#121212' : '#ffffff',
        borderWidth: 1
      }
    ]
  };

  const chartOptions = themedOptions({
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { beginAtZero: true } }
  });

  const doughnutOptions = themedOptions({
    plugins: { legend: { position: 'right' } }
  });

  return (
    <div className="container-fluid px-2">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <h4 className="m-0">Memory MCP Graphs</h4>
            {loading && <span className="badge bg-secondary">Loading</span>}
            {refreshing && <span className="badge bg-info text-dark">Refreshing</span>}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Source: {payload?.source || 'unknown'}
            {activeNamespace ? ` · namespace: ${activeNamespace}` : ' · all namespaces'}
            {lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ''}
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <label className="form-label mb-1" style={{ fontSize: 12 }}>Namespace</label>
            <input
              className="form-control form-control-sm"
              value={namespaceInput}
              placeholder="(optional)"
              onChange={(e) => setNamespaceInput(e.target.value)}
              style={{ minWidth: 180 }}
            />
          </div>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setActiveNamespace(namespaceInput.trim())}
          >
            Load
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => load(activeNamespace, true)}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="row g-2 mb-3">
        {[
          { label: 'Entities', value: entities.length },
          { label: 'Relations', value: relations.length },
          { label: 'Kinds', value: kinds.length },
          { label: 'Tags', value: tags.length }
        ].map((stat) => (
          <div className="col-6 col-lg-3" key={stat.label}>
            <div className={`card ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'} h-100`}>
              <div className="card-body py-3">
                <div style={{ fontSize: 12, opacity: 0.7 }}>{stat.label}</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{stat.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-6">
          <div className={`card ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'}`}>
            <div className="card-body">
              <h6 className="card-title">Top entity kinds</h6>
              <div style={{ height: 320 }}>
                <Bar data={kindsChart} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className={`card ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'}`}>
            <div className="card-body">
              <h6 className="card-title">Top tags</h6>
              <div style={{ height: 320 }}>
                <Doughnut data={tagsChart} options={doughnutOptions} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12">
          <MemoryGraphImageGenerator nodes={graphNodes} relations={relations} darkMode={darkMode} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <div className={`card ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'}`}>
            <div className="card-body">
              <div className="d-flex flex-wrap gap-2 align-items-end mb-3">
                <div>
                  <label className="form-label mb-1" style={{ fontSize: 12 }}>Search</label>
                  <input
                    className="form-control form-control-sm"
                    placeholder="id, summary, tags"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ minWidth: 200 }}
                  />
                </div>
                <div>
                  <label className="form-label mb-1" style={{ fontSize: 12 }}>Kind</label>
                  <select
                    className="form-select form-select-sm"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value)}
                    style={{ minWidth: 160 }}
                  >
                    {kindOptions.map((kind) => (
                      <option key={kind} value={kind}>{kind}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Showing {Math.min(filteredEntities.length, MAX_ROWS)} / {filteredEntities.length}
                </div>
              </div>
              <div className="table-responsive" style={{ maxHeight: 420 }}>
                <table className={`table table-sm ${darkMode ? 'table-dark' : 'table-striped'}`}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>Id</th>
                      <th style={{ minWidth: 120 }}>Kind</th>
                      <th>Summary</th>
                      <th style={{ minWidth: 140 }}>Last touched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {limitedEntities.map((entity) => {
                      const id = getEntityId(entity);
                      const kind = getEntityKind(entity);
                      const summary = getEntitySummary(entity);
                      const lastTouched = getEntityLastTouched(entity);
                      const isActive = selected && getEntityId(selected) === id;
                      return (
                        <tr
                          key={`${id}-${kind}`}
                          style={{ cursor: 'pointer' }}
                          className={isActive ? (darkMode ? 'table-active' : 'table-primary') : ''}
                          onClick={() => setSelected(entity)}
                        >
                          <td>{id}</td>
                          <td>{kind}</td>
                          <td>{summary}</td>
                          <td>{formatDate(lastTouched)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div className="col-12 col-lg-5">
          <div className={`card ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'}`}>
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="card-title m-0">Selection details</h6>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {selected ? getEntityId(selected) : 'none'}
                </span>
              </div>
              {selected ? (
                <JsonPreview value={selected} enableFilter={false} />
              ) : (
                <div style={{ fontSize: 13, opacity: 0.7 }}>Select an entity to inspect raw data.</div>
              )}
            </div>
          </div>
          {relationKinds.length > 0 && (
            <div className={`card mt-3 ${darkMode ? 'bg-dark text-light border-secondary' : 'bg-white'}`}>
              <div className="card-body">
                <h6 className="card-title">Relation types</h6>
                <div style={{ fontSize: 12 }}>
                  {relationKinds.slice(0, 8).map((rel) => (
                    <div key={rel.key} className="d-flex justify-content-between">
                      <span>{rel.key}</span>
                      <span>{rel.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
