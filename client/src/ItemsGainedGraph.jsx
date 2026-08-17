import { useEffect, useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import JsonPreview from './JsonPreview.jsx';
import useChartTheme from './useChartTheme.js';
import { computeSeries } from './chartTheme.js';
import { getLogsByLogId } from './dbLayer.js';
import { getAllItemsFromIDB } from './syncItemsToIndexedDB.js';
import { toFiniteNumber } from './financeAnalytics.js';
import {
  bucketChartData,
  chartBuckets,
  notifyMinDate,
  validTimestamp,
} from './activityChartUtils.js';
import useBarBucketModal from './hooks/useBarBucketModal.js';

function itemEntries(log, prices) {
  const source = log?.data?.items_gained;
  if (!source || typeof source !== 'object') return [];

  const iterable = Array.isArray(source)
    ? source
    : Object.entries(source).map(([id, value]) => ({
      id,
      ...(value && typeof value === 'object' ? value : { amount: value }),
    }));

  return iterable.flatMap(entry => {
    const id = toFiniteNumber(entry?.id);
    const quantity = toFiniteNumber(
      entry?.amount ?? entry?.qty ?? entry?.quantity ?? entry?.count ?? entry?.value,
    );
    if (id === null || quantity === null || quantity < 0) return [];

    const price = prices.get(id);
    const totalValue = Number.isFinite(price) && price >= 0 ? price * quantity : 0;
    return Number.isFinite(totalValue) ? [{ id, quantity, totalValue }] : [];
  });
}

export default function ItemsGainedGraph({
  logsUpdated,
  darkMode,
  chartHeight = 400,
  dateFrom,
  dateTo,
  onMinDate,
}) {
  const [showChart, setShowChart] = useState(true);
  const [granularity, setGranularity] = useState('day');
  const { themedOptions, ds } = useChartTheme(darkMode);

  const {
    data,
    loading,
    error,
    onBarClick,
    showModal,
    modalLabel,
    modalItems,
    payload,
    closeModal,
  } = useBarBucketModal({
    buildBuckets: async () => {
      const [logs, items] = await Promise.all([
        getLogsByLogId(9020),
        getAllItemsFromIDB(),
      ]);
      const prices = new Map(
        (Array.isArray(items) ? items : []).flatMap(item => {
          const id = toFiniteNumber(item?.id);
          const price = toFiniteNumber(item?.price);
          return id !== null && price !== null && price >= 0 ? [[id, price]] : [];
        }),
      );
      const rows = (Array.isArray(logs) ? logs : [])
        .filter(validTimestamp)
        .map(log => ({
          ...log,
          entries: itemEntries(log, prices),
        }))
        .filter(log => log.entries.length > 0);
      const buckets = chartBuckets(rows, {
        granularity,
        getTimestamp: row => row.timestamp,
        getValues: row => [
          row.entries.reduce((sum, item) => sum + item.totalValue, 0),
        ],
        getItem: row => ({
          timestamp: row.timestamp,
          entries: row.entries.slice(0, 100),
        }),
      });
      const filtered = bucketChartData(
        buckets,
        [{ label: 'Value', data: buckets.map(bucket => bucket.sums[0]) }],
        dateFrom,
        dateTo,
        granularity,
      );
      const byLabel = new Map(buckets.map(bucket => [bucket.label, bucket]));
      const bucketObjects = Object.fromEntries(
        filtered.labels.map(label => [
          label,
          (byLabel.get(label)?.items || []).slice(0, 1500),
        ]),
      );
      if (granularity === 'day') notifyMinDate(buckets, onMinDate);
      return {
        labels: filtered.labels,
        sums: filtered.datasets[0]?.data || [],
        bucketObjects,
      };
    },
    buildPayload: (label, items) => ({
      bucket: label,
      count: items.length,
      items,
    }),
    deps: [logsUpdated, granularity, dateFrom, dateTo, onMinDate],
  });

  const values = data.sums || [];
  const { cumulative } = useMemo(() => computeSeries(values), [values]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart(value => !value)}
      >
        Items Value Gained per {granularity}
      </h5>
      {loading ? (
        <img src="/images/loader.gif" alt="Loading..." style={{ maxWidth: 80 }} />
      ) : error ? (
        <div className="text-muted">{error}</div>
      ) : !values.length ? (
        <div className="text-muted">No matching gained items.</div>
      ) : showChart ? (
        <div style={{ display: 'flex', gap: 8, height: chartHeight }}>
          <div className="btn-group-vertical" role="group" aria-label="Granularity">
            {[
              ['day', 'Daily'],
              ['week', 'Weekly'],
              ['month', 'Monthly'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={`btn btn-sm ${granularity === value ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setGranularity(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <Bar
              data={{
                labels: data.labels,
                datasets: [
                  ds('bar', 0, values, { label: 'Value' }),
                  ds('line', 1, cumulative, {
                    label: 'Cumulative Value',
                    yAxisID: 'y1',
                  }),
                ],
              }}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                onClick: onBarClick,
                scales: {
                  y: { beginAtZero: true },
                  y1: {
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                  },
                },
              })}
            />
          </div>
        </div>
      ) : null}
      {showModal && (
        <div className="modal d-block" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5>{modalLabel}</h5>
                <button type="button" className="btn-close" onClick={closeModal} />
              </div>
              <div className="modal-body">
                <JsonPreview value={payload} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
