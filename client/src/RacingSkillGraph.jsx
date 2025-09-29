import React, { useEffect, useState, useRef } from 'react';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import useChartTheme from './useChartTheme.js';

/**
 * RacingSkillGraph
 * Affiche l'évolution de personalstats.racingskill obtenue via le WebSocket /ws.
 * Le serveur renvoie un payload: { type: 'racingskill', data: [{ date, racingskill }] }
 */
export default function RacingSkillGraph({ wsRef, wsMessages, sendWs, darkMode, chartHeight = 400 }) {
  const [points, setPoints] = useState([]); // {t: Date, v: number}
  const requestedRef = useRef(false);
  const { themedOptions, ds } = useChartTheme(darkMode);

  // Écoute des messages globaux déjà collectés par Main
  useEffect(() => {
    if (!wsMessages || wsMessages.length === 0) return;
    // Parcourt seulement les derniers messages potentiels (simplifié)
    try {
      const last = wsMessages[wsMessages.length - 1];
      if (last && last.startsWith('{')) {
        const msg = JSON.parse(last);
        if (msg && msg.type === 'racingskill' && Array.isArray(msg.data)) {
          const mapped = msg.data
            .filter(d => d && d.date != null && typeof d.racingskill === 'number')
            .map(d => ({ t: new Date(d.date), v: d.racingskill }))
            .sort((a,b) => a.t - b.t);
          setPoints(mapped);
        }
      }
    } catch (_) {}
  }, [wsMessages]);

  // Envoi de la requête initiale une fois le socket ouvert
  useEffect(() => {
    if (!requestedRef.current && wsRef && wsRef.current && wsRef.current.readyState === 1) {
      try { sendWs && sendWs('racingskill'); } catch(_) {}
      requestedRef.current = true;
    }
  }, [wsRef, wsMessages, sendWs]);

  const labels = points.map(p => p.t);
  const dataVals = points.map(p => p.v);
  // Plus de série cumulée demandée

  const lineColor = darkMode ? 'rgba(130,180,255,0.9)' : 'rgba(54,162,235,0.9)';
  const fillColor = darkMode ? 'rgba(130,180,255,0.25)' : 'rgba(54,162,235,0.25)';

  const gridColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const textColor = darkMode ? '#e0e0e0' : '#222';
  const tickColor = textColor;

  const data = {
    labels,
    datasets: [
      ds('line', 0, dataVals, { label: 'Racing Skill', pointRadius: 2, tension: 0.2, fill: true, yAxisID: 'y', borderColor: lineColor, backgroundColor: fillColor })
    ]
  };

  const options = themedOptions({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day' },
        ticks: { maxRotation: 0 },
      },
      y: {
        title: { display: true, text: 'Skill' },
        beginAtZero: true,
      },
    },
    plugins: {
      legend: { display: true },
      tooltip: { enabled: true },
    }
  });

  return (
    <div
      className="card"
      style={{
        height: chartHeight,
        display: 'flex',
        flexDirection: 'column',
        marginBottom: 0,
        ...(darkMode ? { background:'#1b1b1b', color:'#e0e0e0', border:'1px solid #2a2a2a' } : {})
      }}
    >
      <div
        className="card-body"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '0.75rem 0.75rem 0.5rem',
          ...(darkMode ? { background:'#1b1b1b', color:'#e0e0e0' } : {})
        }}
      >
        <h5
          className="card-title"
          style={{
            marginBottom: '0.5rem',
            fontSize: '1rem',
            ...(darkMode ? { background:'#222', color:'#e0e0e0' } : {})
          }}
        >
          Racing Skill
        </h5>
        <div style={{ flex: 1, minHeight: 0 }}>
          <Line data={data} options={options} />
        </div>
      </div>
    </div>
  );
}
