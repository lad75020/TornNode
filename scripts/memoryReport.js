#!/usr/bin/env node
/**
 * memoryReport.js
 * Génère un rapport HTML consolidé à partir de:
 *  - memory-graphs.json (graphe brut)
 *  - memory-diff.json (diff & ranking)
 *  - memory-quality.json (métriques de qualité & staleness)
 * Optionnellement memory-relations.json si présent.
 * Sortie: memory-report.html
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname,'..');
const files = {
  graph: path.join(ROOT,'memory-graphs.json'),
  diff: path.join(ROOT,'memory-diff.json'),
  quality: path.join(ROOT,'memory-quality.json'),
  relations: path.join(ROOT,'memory-relations.json')
};
function load(f){ try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return null; } }

const graph = load(files.graph) || {};
const diff = load(files.diff) || {};
const quality = load(files.quality) || {};
const rel = load(files.relations) || {};

const entities = graph.entities || graph || [];
const relations = graph.relations || rel.relations || [];

function esc(str){ return String(str).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }

function table(rows, headers){
  return `<table><thead><tr>${headers.map(hd=>`<th>${esc(hd)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// Top ranking (diff)
const ranked = diff.rankedTop || [];
const rankedTable = table(ranked.map(r=>[
  r.id,
  r.entityType,
  r.degree ?? (r.in+r.out),
  r.centrality ?? '',
  r.obs,
  r.orphan?'yes':'',
  r.staleDays ?? '',
  r.score
]), ['ID','Type','Degree','Centrality','Obs','Orphan','Stale(d)','Score']);

// Centralité
const topCentral = (quality.topCentral||[]).map(c=>[c.id,c.entityType,c.degree]);
const centralTable = table(topCentral, ['ID','Type','Degree']);

// Orphelins
const orphans = (quality.topOrphans||[]).map(o=>[o.id,o.entityType]);
const orphanTable = table(orphans, ['ID','Type']);

// Staleness
const topStale = (((quality||{}).staleness)||{}).topStale||[];
const staleTable = table(topStale.map(s=>[s.id,s.entityType,s.staleDays]), ['ID','Type','Stale(days)']);

// Stats globales
const statsList = [
  ['Entities (server)', quality.counts?.serverEntities],
  ['Relations', quality.counts?.serverRelations],
  ['Coverage %', quality.coverage?.coveragePct],
  ['Orphan rate', quality.orphanRate],
  ['Relation density', quality.relationDensity],
  ['Avg observations', quality.avgObs],
  ['Hash drift count', quality.hashDriftCount],
  ['Staleness avg days', quality.staleness?.avgDays],
  ['Staleness median days', quality.staleness?.medianDays]
].filter(r=>r[1]!==undefined && r[1]!==null);
const statsTable = table(statsList, ['Métrique','Valeur']);

// --- Génération de graphiques SVG simples inline (pas de dépendances externes) ---
function svgBarChart(data, {width=480,height=160,pad=24,title,xLabel,yLabel,color='#4098d7'}={}) {
  if(!data.length) return '';
  const max = Math.max(...data.map(d=>d.value||0)) || 1;
  const barW = (width - pad*2) / data.length;
  const bars = data.map((d,i)=>{
    const h = (d.value / max) * (height - pad*2);
    const x = pad + i*barW;
    const y = height - pad - h;
    return `<g><rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(barW*0.8).toFixed(2)}" height="${h.toFixed(2)}" fill="${color}" rx="2"/>`+
      `<title>${esc(d.label)}: ${d.value}</title>`+
      `<text x="${(x+barW*0.4).toFixed(2)}" y="${(height-pad+12).toFixed(2)}" text-anchor="middle" font-size="10" fill="#444" transform="rotate(45 ${(x+barW*0.4).toFixed(2)} ${(height-pad+12).toFixed(2)})">${esc(d.label.substring(0,20))}</text>`+
      `</g>`;
  }).join('');
  const axes = `<line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" stroke="#555" stroke-width="1"/>`+
               `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}" stroke="#555" stroke-width="1"/>`;
  const titleEl = title? `<text x="${width/2}" y="16" text-anchor="middle" font-size="14" font-weight="600">${esc(title)}</text>`:'';
  const yTicks = 4;
  const ticks = Array.from({length:yTicks+1},(_,i)=>{
    const v = max * (i/yTicks);
    const y = height - pad - (v/max)*(height-pad*2);
    return `<g><line x1="${pad-4}" x2="${pad}" y1="${y}" y2="${y}" stroke="#555"/>`+
      `<text x="${pad-6}" y="${y+4}" text-anchor="end" font-size="10">${v.toFixed(0)}</text></g>`;
  }).join('');
  const xLab = xLabel? `<text x="${width/2}" y="${height-4}" text-anchor="middle" font-size="11">${esc(xLabel)}</text>`:'';
  const yLab = yLabel? `<text x="12" y="${height/2}" text-anchor="middle" font-size="11" transform="rotate(-90 12 ${height/2})">${esc(yLabel)}</text>`:'';
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title||'bar chart')}" style="max-width:100%;background:#fff;border:1px solid #e2e2e2;border-radius:4px;">${titleEl}${axes}${ticks}${bars}${xLab}${yLab}</svg>`;
}

function svgPie(values, {width=220,height=160,title,colors=['#4098d7','#66c18c','#f2c94c','#eb5757']}={}) {
  const total = values.reduce((a,v)=>a+v.value,0)||1;
  const cx = width/2, cy = (height/2)+4, r = Math.min(width, height*1.4)/4;
  let acc = 0;
  const slices = values.map((v,i)=>{
    const start = acc/total * Math.PI*2; acc += v.value; const end = acc/total * Math.PI*2;
    const x1 = cx + r*Math.sin(start), y1 = cy - r*Math.cos(start);
    const x2 = cx + r*Math.sin(end), y2 = cy - r*Math.cos(end);
    const large = end-start > Math.PI ? 1:0;
  return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${colors[i%colors.length]}" stroke="#fff" stroke-width="1"><title>${esc(v.label)}: ${(v.value/total*100).toFixed(1)}%</title></path>`;
  }).join('');
  const legend = values.map((v,i)=>`<g transform="translate(${width-100},${20+i*14})"><rect width="10" height="10" fill="${colors[i%colors.length]}"/><text x="14" y="9" font-size="11">${esc(v.label)} (${(v.value/total*100).toFixed(1)}%)</text></g>`).join('');
  const titleEl = title? `<text x="${width/2}" y="16" text-anchor="middle" font-size="14" font-weight="600">${esc(title)}</text>`:'';
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title||'pie chart')}" style="max-width:100%;background:#fff;border:1px solid #e2e2e2;border-radius:4px;">${titleEl}${slices}${legend}</svg>`;
}

function svgHistogram(values, {bins=8,width=480,height=160,title,color='#8f6dd7'}={}) {
  if(!values.length) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const binSize = (max-min)/bins || 1;
  const counts = Array.from({length:bins},()=>0);
  values.forEach(v=>{ let idx = Math.floor((v-min)/binSize); if(idx>=bins) idx = bins-1; counts[idx]++; });
  const maxC = Math.max(...counts)||1;
  const pad=24; const barW=(width-pad*2)/bins;
  const bars = counts.map((c,i)=>{
      const hgt = (c/maxC)*(height-pad*2);
    const x=pad+i*barW; const y=height-pad-hgt;
    const label=`${(min+i*binSize).toFixed(0)}-${(min+(i+1)*binSize).toFixed(0)}`;
  return `<g><rect x="${x}" y="${y}" width="${(barW*0.9).toFixed(2)}" height="${hgt}" fill="${color}" rx="2"><title>${label}: ${c}</title></rect>`+
    `<text x="${x+barW/2}" y="${height-pad+10}" font-size="9" text-anchor="middle" transform="rotate(35 ${x+barW/2} ${height-pad+10})">${esc(label)}</text></g>`;
  }).join('');
  const axes = `<line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" stroke="#555"/>`+
    `<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}" stroke="#555"/>`;
  const titleEl = title? `<text x="${width/2}" y="16" text-anchor="middle" font-size="14" font-weight="600">${esc(title)}</text>`:'';
  return `<svg viewBox="0 0 ${width} ${height}" style="max-width:100%;background:#fff;border:1px solid #e2e2e2;border-radius:4px;">${titleEl}${axes}${bars}</svg>`;
}

// Données pour graphiques
const barRankingData = ranked.slice(0,12).map(r=>({label:r.id,value: typeof r.score==='number'? Number(r.score.toFixed(2)):0}));
const stalenessData = (topStale||[]).slice(0,10).map(s=>({label:s.id,value:s.staleDays||0}));
const orphanCount = orphans.length;
const nonOrphanCount = (quality.counts?.serverEntities||0) - orphanCount;
const orphanPieData = [
  {label:'Non orphelins', value: nonOrphanCount<0?0:nonOrphanCount},
  {label:'Orphelins', value: orphanCount}
];
const degreeValues = ranked.map(r=> r.degree ?? 0).filter(v=> typeof v==='number');

const rankingChartSvg = svgBarChart(barRankingData,{title:'Score (Top 12)',xLabel:'Entités',yLabel:'Score'});
const stalenessChartSvg = svgBarChart(stalenessData,{title:'Staleness (jours)',xLabel:'Entités',yLabel:'Jours',color:'#d77a42'});
const orphanPieSvg = svgPie(orphanPieData,{title:'Répartition Orphelins'});
const degreeHistSvg = svgHistogram(degreeValues,{title:'Distribution Degree'});

// Suggestions
const suggestions = (quality.suggestions||[]).concat(diff.suggestions||[]);
const suggestionsHtml = suggestions.length? `<ul>${suggestions.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>` : '<p>Aucune suggestion.</p>';

// Relations résumé
const relSample = relations.slice(0,50).map(r=>[r.from,r.relationType,r.to]);
const relTable = table(relSample, ['From','Type','To']);

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Memory Report</title>
<style>
body{font-family:system-ui,Arial,sans-serif;margin:20px;line-height:1.4;}
h1,h2{margin-top:1.2em;}
table{border-collapse:collapse;margin:1em 0;font-size:14px;}
th,td{border:1px solid #ccc;padding:4px 8px;vertical-align:top;}
th{background:#f5f5f5;}
code{background:#f0f0f0;padding:2px 4px;border-radius:3px;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px;}
section{background:#fff;border:1px solid #e2e2e2;border-radius:6px;padding:12px;box-shadow:0 1px 2px rgba(0,0,0,0.04);} 
footer{margin-top:40px;font-size:12px;color:#666;}
</style></head><body>
<h1>Rapport Mémoire Projet</h1>
<p>Généré: ${esc(new Date().toISOString())}</p>
<h2>Résumé Statistiques</h2>
${statsTable}
<h2>Top Ranking (Priorité)</h2>
${rankedTable}
<h2>Visualisations</h2>
<div class="grid">
  <section><h3>Distribution Score</h3>${rankingChartSvg}</section>
  <section><h3>Staleness</h3>${stalenessChartSvg}</section>
  <section><h3>Orphelins</h3>${orphanPieSvg}</section>
  <section><h3>Degree</h3>${degreeHistSvg}</section>
</div>
<div class="grid">
  <section><h3>Centralité (Top)</h3>${centralTable}</section>
  <section><h3>Orphelins (Top)</h3>${orphanTable}</section>
  <section><h3>Staleness (Top)</h3>${staleTable}</section>
</div>
<h2>Suggestions</h2>
${suggestionsHtml}
<h2>Échantillon Relations (50 premières)</h2>
${relTable}
<h2>Méta</h2>
<p>Fichiers sources analysés: ${entities.length}. Relations totales: ${relations.length}.</p>
<footer>Generated by memoryReport.js – adapter si besoin (ajout graph viz, filtres, etc.).</footer>
</body></html>`;

const outFile = path.join(ROOT,'memory-report.html');
fs.writeFileSync(outFile, html);
console.log('[memory:report] écrit', outFile);