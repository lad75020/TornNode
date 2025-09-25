import { useEffect, useState, useRef } from 'react';
import useChartTheme from './useChartTheme.js';

import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

import { filterDatasetsByDate } from './dateFilterUtil.js';

export default function NetworthGraph({ darkMode, wsMessages = [], sendWs, dateFrom, dateTo, onMinDate }) {
  const [chartData, setChartData] = useState({ datasets: [] });
  const [loading, setLoading] = useState(true);
  const [showChart, setShowChart] = useState(true);
  const { themedOptions } = useChartTheme(darkMode);
  const requestedRef = useRef(false);

  // Envoi de la requête WebSocket une seule fois
  useEffect(() => {
    if (!requestedRef.current && sendWs) {
      try { sendWs('getNetworth'); requestedRef.current = true; setLoading(true); } catch(_) {}
    }
  }, [sendWs]);

  // Écoute des messages WebSocket
  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) return;
    // Chercher le dernier message getNetworth
    for (let i = wsMessages.length - 1; i >= 0; i--) {
      const msg = wsMessages[i];
      if (typeof msg === 'string' && msg.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed && parsed.type === 'getNetworth') {
            if (parsed.error) {
              setChartData({ datasets: [] });
              setLoading(false);
              return;
            }
            const data = Array.isArray(parsed.data) ? parsed.data : [];
            const labels = data.map(item => {
              try {
                if (!item?.date) return '';
                if (/^\d{4}-\d{2}-\d{2}$/.test(item.date.slice(0,10))) return item.date.slice(0,10);
                const d = new Date(item.date);
                if (isNaN(d.getTime())) return String(item.date);
                const y = d.getFullYear();
                const m = String(d.getMonth()+1).padStart(2,'0');
                const day = String(d.getDate()).padStart(2,'0');
                return `${y}-${m}-${day}`;
              } catch(_) { return String(item?.date || ''); }
            });
            const values = data.map(item => item.value);
            if (labels.length && onMinDate && /^\d{4}-\d{2}-\d{2}$/.test(labels[0])) {
              try { onMinDate(labels[0]); } catch {}
            }
            let datasets = [
              {
                label: 'Networth',
                data: values,
                borderColor: 'rgba(75, 192, 192, 0.9)',
                backgroundColor: 'rgba(75, 192, 192, 0.3)',
                pointRadius: 3,
                showLine: true,
                fill: false,
                tension: 0.2,
              },
            ];
            const filtered = filterDatasetsByDate(labels, datasets, dateFrom, dateTo);
            setChartData(filtered);
            setLoading(false);
            return; // stop après le plus récent
          }
        } catch(_) { /* ignore */ }
      }
    }
  }, [wsMessages]);

  return (
    <div className="my-4">
      <h5
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setShowChart((prev) => !prev)}
        title="Click to show/hide chart"
      >
        Networth by Date
      </h5>
      {loading ? (
        <div>
          <img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: "80px" }} />
        </div>
      ) : (
        showChart && (
          <div style={{ height: 400 }}>
            <Line
              data={chartData}
              options={themedOptions({
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: true },
                  title: { display: false },
                  tooltip: { enabled: true },
                },
                scales: {
                  x: {
                    title: { display: true, text: 'Date' },
                    type: 'category',
                  },
                  y: {
                    title: { display: true, text: 'Networth' },
                    beginAtZero: true,
                  },
                },
              })}
            />
          </div>
        )
      )}
    </div>
  );
}
