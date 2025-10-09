import React, { useEffect, useMemo, useState } from 'react';
import { useChartTheme } from './useChartTheme.js';
import { CHART_HEIGHT } from './chartConstants.js';

// Simple palette generator
function hashColor(id){
  const h = (id * 137) % 360; // dispersion
  return `hsl(${h}deg 65% 50%)`;
}

// Normalise diverses formes de dates (string ISO, YYYY-MM-DD, objet {$date:...}, timestamp, etc.) vers timestamp (ms) + clé jour
function normalizeDateInput(raw) {
  let d = raw;
  if (d && typeof d === 'object') {
    if ('$date' in d) d = d.$date;
    else if (d.date) d = d.date; // parfois { date: '...' }
  }
  if (typeof d === 'number') {
    const dt = new Date(d);
    if (!isNaN(dt)) return { ts: dt.getTime(), day: dt.toISOString().slice(0,10) };
  }
  if (typeof d === 'string') {
    // Déjà format jour ?
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return { ts: Date.UTC(+d.slice(0,4), +d.slice(5,7)-1, +d.slice(8,10)), day: d };
    }
    // Remplacer espace par T pour parse standard
    const s = d.replace(' ', 'T');
    const ts = Date.parse(s);
    if (!isNaN(ts)) {
      const day = new Date(ts).toISOString().slice(0,10);
      return { ts, day };
    }
  }
  return { ts: NaN, day: null };
}

export default function DailyPriceAveragesChart({ wsMessages, sendWs, darkMode, onMinDate, dateFrom, dateTo }) {
  const [lines, setLines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  // useChartTheme retourne { theme, themedOptions, ds }
  const { theme } = useChartTheme(darkMode);
  const bgColor = darkMode ? '#121417' : '#ffffff';
  // Trigger request initiale
  useEffect(() => {
    sendWs && sendWs('dailyPriceAveragesAll');
  }, [sendWs]);

  // Ecoute des messages
  useEffect(() => {
    if (!wsMessages.length) return;
    const last = wsMessages[wsMessages.length - 1];
    if (!last || last[0] !== '{') return;
    try {
      const parsed = JSON.parse(last);
      if (parsed.type === 'dailyPriceAveragesAll' && parsed.ok && Array.isArray(parsed.lines)) {
        setLines(parsed.lines);
        // Initialiser la sélection si vide
        if (!selectedId && parsed.lines.length) {
          setSelectedId(parsed.lines[0].id);
        }
      }
    } catch(_) {}
  }, [wsMessages]);

  const allPoints = useMemo(() => {
    const pts = [];
    lines.forEach(l => l.points.forEach(p => {
      const { day } = normalizeDateInput(p.date);
      if (day) pts.push(day);
    }));
    const unique = Array.from(new Set(pts)).sort();
    if (unique.length && onMinDate) onMinDate(unique[0]);
    return unique;
  }, [lines, onMinDate]);

  // Préparation dataset pour canvas simple (pas de lib externe pour rester léger)
  // On normalise les dates sur un axe 0..1
  const prepared = useMemo(() => {
    if (!lines.length) return [];
    // Construire table globale de dates valides
    const allTs = [];
    lines.forEach(l => l.points.forEach(p => {
      const { ts } = normalizeDateInput(p.date);
      if (!isNaN(ts)) allTs.push(ts);
    }));
    const hasValidDates = allTs.length > 0;
    let minTs = hasValidDates ? Math.min(...allTs) : 0;
    let maxTs = hasValidDates ? Math.max(...allTs) : (lines[0]?.points.length || 1) - 1;
    if (minTs === maxTs) maxTs = minTs + 1;
    const fromTs = dateFrom ? normalizeDateInput(dateFrom).ts : minTs;
    const toTs = dateTo ? (normalizeDateInput(dateTo).ts + 24*3600*1000 - 1) : maxTs;
    return lines.map(l => {
      let idx = -1;
      const pts = l.points.map(p => {
        idx += 1;
        const { ts } = normalizeDateInput(p.date);
        const y = typeof p.avg === 'number' ? p.avg : Number(p.avg);
        if (hasValidDates && !isNaN(ts)) {
          if (ts < fromTs || ts > toTs) return null;
          return { x: (ts - minTs) / (maxTs - minTs), y };
        } else {
          // Fallback index-based
          if (idx === 0 && !hasValidDates) {
            // rien
          }
          return { x: l.points.length > 1 ? idx / (l.points.length - 1) : 0, y };
        }
      }).filter(Boolean);
      return { id: l.id, name: l.name || String(l.id), color: hashColor(l.id), points: pts };
    });
  }, [lines, dateFrom, dateTo]);

  // Liste triée alphabétiquement pour le menu déroulant (ne change pas l'ordre des séries)
  const sortedItems = useMemo(() => {
    return prepared.slice().sort((a, b) => {
      const an = a.name || String(a.id);
      const bn = b.name || String(b.id);
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });
  }, [prepared]);

  // Appliquer le filtre d'item sélectionné (ne garder qu'une ligne)
  const displayed = useMemo(() => {
    if (!selectedId) return prepared.slice(0,1); // fallback première série
    return prepared.filter(l => String(l.id) === String(selectedId));
  }, [prepared, selectedId]);

  // Si la sélection actuelle n'existe plus, réinitialiser
  useEffect(() => {
    if (prepared.length && !prepared.some(l => String(l.id) === String(selectedId))) {
      setSelectedId(prepared[0].id);
    }
  }, [prepared, selectedId]);

  // Trouver min/max Y sur la/les séries affichées seulement
  const yBounds = useMemo(() => {
    let min = Infinity, max = -Infinity;
    displayed.forEach(l => l.points.forEach(p => { if (p.y < min) min = p.y; if (p.y > max) max = p.y; }));
    if (!isFinite(min) || !isFinite(max)) return { min:0, max:1 };
    if (min === max) { min -= 1; max += 1; }
    return { min, max };
  }, [displayed]);

  return (
    <div style={{ height: CHART_HEIGHT, width: '100%', position:'relative', fontSize:12 }}>
      <canvas
  style={{ width:'100%', height:'100%', background: bgColor }}
        ref={el => {
          if (!el) return;
          const ctx = el.getContext('2d');
          const W = el.width = el.clientWidth * (window.devicePixelRatio||1);
          const H = el.height = el.clientHeight * (window.devicePixelRatio||1);
          ctx.scale(window.devicePixelRatio||1, window.devicePixelRatio||1);
          ctx.clearRect(0,0,W,H);
          if (!displayed.some(l => l.points.length)) {
            ctx.fillStyle = theme.text || '#888';
            ctx.font = '14px sans-serif';
            ctx.fillText('Aucun point valide (dates non reconnues ?)', 50, 60);
          }
          // Axes simples
            ctx.strokeStyle = theme.grid || '#ccc';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(40,10); ctx.lineTo(40,H-30); ctx.lineTo(W-10,H-30); ctx.stroke();
          const { min, max } = yBounds;
          const plotW = W - 50; const plotH = H - 40;
          const zeroX = 40; const zeroY = 10;
          const scaleY = v => {
            return zeroY + (1 - (v - min)/(max - min)) * plotH;
          };
          const scaleX = x => zeroX + x * plotW;
          // Graduations Y (5)
          ctx.fillStyle = theme.text || '#fff';
          ctx.font = '10px sans-serif';
          for (let i=0;i<=5;i++) {
            const t = min + (i/5)*(max-min);
            const y = scaleY(t);
            ctx.strokeStyle = theme.grid || '#444';
            ctx.beginPath(); ctx.moveTo(40,y); ctx.lineTo(W-10,y); ctx.stroke();
            ctx.fillText(t.toFixed(0), 2, y+3);
          }
          // Lignes
          displayed.forEach(l => {
            if (!l.points.length) return;
            ctx.strokeStyle = l.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            l.points.forEach((p,i) => {
              const X = scaleX(p.x);
              const Y = scaleY(p.y);
              if (i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
            });
            ctx.stroke();
          });
          // Légende
          let lx = 50, ly = 14; const lh = 14; const maxWidth = W - 60;
          displayed.slice(0,50).forEach(l => { // déjà 1 élément
            const label = l.name;
            const w = ctx.measureText(label).width + 18;
            if (lx + w > maxWidth) { lx = 50; ly += lh; }
            ctx.fillStyle = l.color; ctx.fillRect(lx, ly-10, 12, 12);
            ctx.fillStyle = theme.text || '#fff'; ctx.fillText(label, lx+16, ly);
            lx += w + 8;
          });
        }}
      />
      <div style={{ position:'absolute', top:4, right:8, fontSize:11, opacity:0.7 }}>
        {prepared.length} items • Item sélectionné: {selectedId || '—'} • Y [{yBounds.min.toFixed(0)}..{yBounds.max.toFixed(0)}]
      </div>
      <div style={{ position:'absolute', top:8, left:50, background:'rgba(0,0,0,0.35)', backdropFilter:'blur(4px)', padding:'4px 6px', borderRadius:4, display:'flex', gap:6, alignItems:'center' }}>
        <label style={{ fontSize:11, color:'#fff' }}>Item:</label>
        <select
          value={selectedId || ''}
          onChange={e => setSelectedId(e.target.value || null)}
          style={{ fontSize:11, padding:'2px 4px', maxWidth:240 }}
        >
          {sortedItems.map(l => (
            <option key={l.id} value={l.id}>{l.name || l.id}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
