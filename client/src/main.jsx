import { StrictMode, useState, useEffect, useRef, Suspense, lazy, useCallback, useMemo, memo } from 'react';
import { setLogsCacheTTL, getLogsCacheTTL, invalidateAllCaches } from './dbLayer.js';
import { CHART_HEIGHT } from './chartConstants.js';
// BazaarTable chargé en lazy pour réduire le chunk initial
const BazaarTable = lazy(() => import('./BazaarTable.jsx'));
// Nouveaux hooks factorisés
import { ThemeProvider, useTheme } from './hooks/themeContext.js';
import useAppWebSocket from './hooks/useAppWebSocket.js';
import useBazaarAlerts from './hooks/useBazaarAlerts.js';
import useChartSlider from './hooks/useChartSlider.js';
import useWsMessageBus from './hooks/useWsMessageBus.js';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams
} from 'react-router-dom';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
// Import JS Bootstrap retiré pour alléger le bundle (composants JS non utilisés). Réintroduire si nécessaire.
import { pushToast, pushOrReplaceToast } from './toastBus.js';
import ToastHost from './ToastHost.jsx';
// Enregistrement global Chart.js pour éviter les erreurs "point/line/bar is not registered"
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js';
try {
  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);
} catch(_) { /* ignore double register */ }
const Autocomplete = lazy(() => import('./Autocomplete.jsx'));
import { handleStoreLogs } from './storeLogsToIndexedDB.jsx';
import { writeItemsToIndexedDB } from './syncItemsToIndexedDB.js';
const LogsGraph = lazy(() => import('./LogsGraph.jsx'));
const CrimeScatterGraph = lazy(() => import('./CrimeScatterGraph.jsx'));
const XanaxBarGraph = lazy(() => import('./XanaxBarGraph.jsx'));
const GymGraph = lazy(() => import('./GymGraph.jsx'));
const WorkStatsGraph = lazy(() => import('./WorkStatsGraph.jsx'));
const BazaarSalesGraph = lazy(() => import('./BazaarSalesGraph.jsx'));
const BloodCountGraph = lazy(() => import('./BloodCountGraph.jsx'));
const BetResultsGraph = lazy(() => import('./BetResultsGraph.jsx'));
const FactionBalanceChart = lazy(() => import('./FactionBalance.jsx'));
const NetworthGraph = lazy(() => import('./NetworthGraph.jsx'));
const XanaxReceivedChart = lazy(() => import('./XanaxReceivedChart.jsx'));
const AttacksStatsGraph = lazy(() => import('./AttacksStatsGraph.jsx'));
const TravelDurationGraph = lazy(() => import('./TravelDurationGraph.jsx'));
const RacingSkillGraph = lazy(() => import('./RacingSkillGraph.jsx'));
const NetworthPieChart = lazy(() => import('./NetworthPieChart.jsx'));
const MoneyLogGraph = lazy(() => import('./MoneyLogGraph.jsx'));
const MoneyGainedGraph = lazy(() => import('./MoneyGainedGraph.jsx'));
const ItemsGainedGraph = lazy(() => import('./ItemsGainedGraph.jsx'));
const RacingPositionGraph = lazy(() => import('./RacingPositionGraph.jsx'));
const CombinedCostsGraph = lazy(() => import('./CombinedCostsGraph.jsx'));
const DailyPriceAveragesChart = lazy(() => import('./DailyPriceAveragesChart.jsx'));
const CompanyStockChart = lazy(() => import('./CompanyStockChart.jsx'));
const CompanyStockHistoryChart = lazy(() => import('./CompanyStockHistoryChart.jsx'));
const CompanyProfileChart = lazy(() => import('./CompanyProfileChart.jsx'));
const CompanyDetailsHistoryChart = lazy(() => import('./CompanyDetailsHistoryChart.jsx'));
const BloodAidDailyChart = lazy(() => import('./BloodAidDailyChart.jsx'));
const PokerBetWinGraph = lazy(() => import('./PokerBetWinGraph.jsx'));
const Login = lazy(() => import('./Login.jsx'));
// ChartSlider doit être défini hors de Main
const ChartSlider = memo(function ChartSlider({ token, logsUpdated, wsRef, wsMessages, sendWs, darkMode, slider, dateFrom, dateTo, onMinDate }) {
  const navigate = useNavigate();
  const { idx } = useParams();
  const index = Math.max(0, Math.min(Number(idx) || 0, chartComponents.length - 1));
  const { Component } = chartComponents[index];
  const goPrev = useCallback(() => navigate(`/chart/${index - 1}`), [navigate, index]);
  const goNext = useCallback(() => navigate(`/chart/${index + 1}`), [navigate, index]);
  // Mise à jour de l'index dans le hook slider
  useEffect(() => { slider.setIndex(index); }, [index]);
  // Avance automatique gérée ici (le hook gère juste l'incrément interne)
  // (Auto-play supprimé)

  return (
    <div className="d-flex flex-column" style={{ width: '100%' }}>
      {/* Zone graphique à hauteur contrôlée */}
  <div style={{ height: CHART_HEIGHT, width: '100%', display: 'flex', flexDirection: 'column', marginBottom: 50 }}>
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 40 }}>Chargement…</div>}>
          <Component
            key={index + ':' + (dateFrom || '') + ':' + (dateTo || '')}
            token={token}
            logsUpdated={logsUpdated}
            wsRef={wsRef}
            wsMessages={wsMessages}
            sendWs={sendWs}
            darkMode={darkMode}
            chartHeight={CHART_HEIGHT}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onMinDate={onMinDate}
          />
        </Suspense>
      </div>
      {/* Contrôles de navigation */}
    <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap" style={{ gap: 8, position:'relative', zIndex: 20 }}>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={goPrev}
          disabled={index === 0}
      style={{ minWidth: 110, position:'relative', zIndex:21 }}
        >
          &lt; {index > 0 ? chartComponents[index - 1].name : ''}
        </button>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={goNext}
          disabled={index === chartComponents.length - 1}
      style={{ minWidth: 110, position:'relative', zIndex:21 }}
        >
          {index < chartComponents.length - 1 ? chartComponents[index + 1].name : ''} &gt;
        </button>
      </div>
    </div>
  );
});
// WsbFeed supprimé après fusion des panneaux

const chartComponents = [
  { name: 'Attacks Stats', Component: AttacksStatsGraph },
  { name: 'Racing Position', Component: RacingPositionGraph },
  { name: 'Networth', Component: NetworthGraph },
  { name: 'Networth Breakdown', Component: NetworthPieChart },
  { name: 'Faction Balance', Component: FactionBalanceChart },
  { name: 'Slot Results', Component: BetResultsGraph },
  { name: 'Poker Bet vs Win', Component: PokerBetWinGraph },
  { name: 'Bazaar Sales', Component: BazaarSalesGraph },
  { name: 'Blood Count', Component: BloodCountGraph },
  { name: 'Work Stats', Component: WorkStatsGraph },
  { name: 'Battle Stats', Component: GymGraph },
  { name: 'Xanax Taken', Component: XanaxBarGraph },
  { name: 'Revives', Component: LogsGraph },
  { name: 'Xanax Received', Component: XanaxReceivedChart },
  { name: 'Money Received', Component: MoneyLogGraph },
  { name: 'Crime Money', Component: MoneyGainedGraph },
  { name: 'Crime Items Value', Component: ItemsGainedGraph },
  { name: 'Travel Duration', Component: TravelDurationGraph },
  { name: 'Racing Skill', Component: RacingSkillGraph },
  { name: 'Crime Skills', Component: CrimeScatterGraph },
  { name: 'Market Sales & Purchases', Component: CombinedCostsGraph },
  { name: 'Daily Price Averages', Component: DailyPriceAveragesChart },
  { name: 'Used Medical Items', Component: BloodAidDailyChart },
  { name: 'Company Stock', Component: CompanyStockChart },
  { name: 'Company Stock History', Component: CompanyStockHistoryChart },
  { name: 'Company Profile', Component: CompanyProfileChart },
  { name: 'Company Details History', Component: CompanyDetailsHistoryChart },
  
];

function Main() {
  const token = localStorage.getItem('jwt');
  // Username dérivé du JWT (payload.username) affiché en majuscules
  const [usernameUpper, setUsernameUpper] = useState('');
  useEffect(() => {
    if (!token) { setUsernameUpper(''); return; }
    try {
      const part = token.split('.')[1];
      if (!part) { setUsernameUpper(''); return; }
      let b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '='; // padding
      const jsonStr = atob(b64);
      const payload = JSON.parse(jsonStr);
      const u = (payload && payload.username) ? String(payload.username).toUpperCase() : '';
      setUsernameUpper(u);
    } catch { setUsernameUpper(''); }
  }, [token]);
  const { darkMode, userTheme, cycleTheme } = useTheme();
  // If no token, show Login page
  if (!token) {
    return (
      <StrictMode>
        <Suspense fallback={<div style={{ textAlign: 'center', padding: 40 }}>Chargement…</div> }>
          <Login darkMode={true} />
        </Suspense>
      </StrictMode>
    );
  }
  // WebSockets
  const wsMain = useAppWebSocket('/ws', token);
  const wsBazaar = useAppWebSocket('/wsb', token);
  // Pulsations activité WS principale
  const [wsRecvPulse, setWsRecvPulse] = useState(false);
  const [wsSendPulse, setWsSendPulse] = useState(false);
  // Détection réception: toute arrivée d'un nouveau message déclenche un flash vert
  useEffect(() => {
    if (!wsMain.messages.length) return;
    setWsRecvPulse(true);
    const t = setTimeout(() => setWsRecvPulse(false), 180);
    return () => clearTimeout(t);
  }, [wsMain.messages]);
  // Wrapper d'envoi pour flash bleu
  const sendWithPulse = useCallback((data, opts = {}) => {
    // Autoriser updatePrice uniquement si bypassUpdatePrice=true (évite envois implicites multiples)
    const { bypassUpdatePrice = false } = opts;
    try {
      let payload = data;
      if (typeof data === 'object' && data && !(data instanceof String)) {
        if (data.type === 'updatePrice' && !bypassUpdatePrice) {
          console.debug('[sendWithPulse] blocked outbound updatePrice (no bypass)');
          return;
        }
        payload = JSON.stringify(data);
      } else if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.type === 'updatePrice' && !bypassUpdatePrice) {
            console.debug('[sendWithPulse] blocked outbound updatePrice string (no bypass)');
            return;
          }
        } catch { /* not json */ }
      }
      setWsSendPulse(true);
      const t = setTimeout(() => setWsSendPulse(false), 180);
      try { wsMain.send(payload); } catch {}
      return () => clearTimeout(t);
    } catch { return () => {}; }
  }, [wsMain.send]);
  // Bazaar alerts & persistence
  const { watchedItems, setWatchedItems, priceThresholds, setPriceThresholds, bazaarRows, blinkingItems } = useBazaarAlerts(wsBazaar.messages);
  // Slider
  const slider = useChartSlider(chartComponents.length);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const handleToggleTheme = cycleTheme;

  // Polling périodique companyDetails (toutes les 60 minutes) pour assurer snapshots réguliers
  useEffect(() => {
    if (wsMain.status !== 'open') return; // attendre ouverture
    const send = () => {
      try { wsMain.send(JSON.stringify({ type:'companyDetails', reuseMinutes: 60 })); } catch {}
    };
    send(); // envoi initial
    const id = setInterval(send, 60*60*1000); // 60 minutes
    return () => clearInterval(id);
  }, [wsMain.status]);

  // À l'ouverture de la websocket bazaar, envoyer les items surveillés (localStorage.watchedItems)
  const bazaarInitSentRef = useRef(0);
  useEffect(() => {
    if (wsBazaar.status !== 'open') return;
    // Empêcher renvoi multiple sur re-renders tant que la même instance reste ouverte
    const wsObj = wsBazaar.wsRef && wsBazaar.wsRef.current;
    const wsId = wsObj ? (wsObj._bazInitId || (wsObj._bazInitId = Date.now())) : Date.now();
    if (bazaarInitSentRef.current === wsId) return;
    bazaarInitSentRef.current = wsId;
    let stored = [];
    try {
      const raw = localStorage.getItem('watchedItems');
      if (raw) stored = JSON.parse(raw);
    } catch(_) {}
    if (!Array.isArray(stored) || !stored.length) stored = Array.isArray(watchedItems) ? watchedItems : [];
    const uniqueIds = Array.from(new Set(stored.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0)));
    uniqueIds.forEach(id => {
      try { wsBazaar.send(JSON.stringify({ type: 'watch', itemId: id })); } catch(_) {}
    });
  }, [wsBazaar.status, watchedItems]);

  // Remove the first useEffect that closes the socket on logout
  const [storeProgress, setStoreProgress] = useState({ current: 0, total: 0, percent: 0, running: false });
  useEffect(() => { try { console.debug('[storeProgress]', storeProgress); } catch(_) {} }, [storeProgress]);
  // Ref pour toujours disposer de la valeur courante (évite fermeture obsolète)
  const storeProgressRef = useRef(storeProgress);
  useEffect(() => { storeProgressRef.current = storeProgress; }, [storeProgress]);
  const [cacheTTLms, setCacheTTLms] = useState(getLogsCacheTTL());
  // Restaurer un TTL de cache sauvegardé (persistance entre sessions)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('logsCacheTTLms');
      if (saved != null) {
        const num = Number(saved);
        if (Number.isFinite(num) && num >= 0) {
          setCacheTTLms(num);
          setLogsCacheTTL(num);
        }
      }
    } catch(_) {}
  }, []);
  const [logsUpdated, setLogsUpdated] = useState(false);
  const [logsImportedCount, setLogsImportedCount] = useState(0);
  const [attacksImportedCount, setAttacksImportedCount] = useState(0);
  // Refs pour gestion toast final import logs
  const logsImportCompletedRef = useRef(false); // devient true quand progress logs atteint 100%
  const logsCountShownRef = useRef(0); // dernier count affiché dans le toast
  // Refs pour gestion toast final import attacks
  const attacksImportCompletedRef = useRef(false);
  const attacksCountShownRef = useRef(0);
  // Annulation imports
  const canceledImportsRef = useRef({});
  const lastImportPercentRef = useRef({ logs:0, attacks:0 });
  // Pour séquencer la synchro locale après 100% import serveur des logs
  const [logsImportPercent, setLogsImportPercent] = useState(0);
  const pendingStoreAfterLogsRef = useRef(false);
  // Date range (non persisté sauf minDate par chart)
  const [dateFrom, setDateFrom] = useState(null); // string YYYY-MM-DD
  const [dateTo, setDateTo] = useState(null); // string YYYY-MM-DD
  const [minDatesPerChart, setMinDatesPerChart] = useState({}); // plus de persistance
  const handleMinDateReport = useCallback((chartIndex, dStr) => {
    if (!dStr || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dStr)) return;
    setMinDatesPerChart(prev => {
      if (prev[chartIndex] && prev[chartIndex] <= dStr) return prev; // garder la plus ancienne
      return { ...prev, [chartIndex]: dStr };
    });
  }, []);

  // À chaque changement de graphique: reset range (min => connu si déjà calculé, sinon null) et max => aujourd'hui
  useEffect(() => {
    const idxStr = String(slider.index);
    const today = new Date().toISOString().slice(0,10);
    setDateFrom(minDatesPerChart[idxStr] || null);
    setDateTo(today);
  }, [slider.index]);

  // Quand la minDate est découverte après chargement, si on est sur ce graph et que dateFrom est null ou > min -> ajuster
  useEffect(() => {
    const idxStr = String(slider.index);
    const min = minDatesPerChart[idxStr];
    if (!min) return;
    setDateFrom(prev => (prev === null || (prev && prev > min)) ? min : prev);
  }, [minDatesPerChart, slider.index]);
  // Handler to fetch and store logs with progress is now imported from storeLogsToIndexedDB.jsx
  // Open websocket once when component mounts, close on unmount
  // Gestion WebSockets déléguée aux hooks useAppWebSocket / useBazaarAlerts

  // Persistance watch list & seuils gérée par hooks

  // (auto-scroll supprimé: aucun élément n'est attaché à cette ref)

  // Les compteurs importedData sont mis à jour dans l'effet de parsing des messages ci-dessous

  // Progression import (logs / attacks) — robust: traite toutes les nouvelles entrées pour ne pas rater un message balayé par d'autres
  const lastProcessedProgressIdxRef = useRef(0);
  useEffect(() => {
    if (lastProcessedProgressIdxRef.current === wsMain.messages.length) return;
    for (let i = lastProcessedProgressIdxRef.current; i < wsMain.messages.length; i++) {
      const raw = wsMain.messages[i];
      if (!raw || raw[0] !== '{') continue;
      let parsed; try { parsed = JSON.parse(raw); } catch { continue; }
  if (!parsed || parsed.type !== 'importProgress' || typeof parsed.percent !== 'number') continue;
      const kind = parsed.kind || 'generic';
  if (canceledImportsRef.current[kind]) continue; // ne plus mettre à jour après annulation
      const title = kind === 'logs' ? 'Import Logs' : (kind === 'attacks' ? 'Import Attacks' : 'Import');
      const percentNum = Math.min(100, Math.max(0, Number(parsed.percent)));
  lastImportPercentRef.current[kind] = percentNum;
      const ttl = percentNum >= 100 ? 30000 : 180000; // 3 min pour longues importations, réduit sur final par setTimeout ci-dessous
      if (kind === 'logs' && percentNum >= 100) {
        logsImportCompletedRef.current = true;
      }
      if (kind === 'attacks' && percentNum >= 100) {
        attacksImportCompletedRef.current = true;
      }
      if (kind === 'logs') {
        setLogsImportPercent(percentNum);
      }
      const logsCountSuffix = (kind === 'logs' && percentNum >= 100 && logsImportedCount > 0)
        ? ` – ${logsImportedCount} logs`
        : '';
      const attacksCountSuffix = (kind === 'attacks' && percentNum >= 100 && attacksImportedCount > 0)
        ? ` – ${attacksImportedCount} attacks`
        : '';
      pushOrReplaceToast({
        key: `import-${kind}`,
        replace: true,
        ttl,
        kind: percentNum >= 100 ? 'success' : 'info',
        title,
        body: `${percentNum.toFixed(1)}% (${kind})${percentNum >= 100 ? ' Terminé' : ''}${logsCountSuffix}${attacksCountSuffix}`,
        raw: null
      });
      if (percentNum >= 100) {
        setTimeout(() => {
          const finalLogsSuffix = (kind === 'logs' && logsImportedCount > 0)
            ? ` – ${logsImportedCount} logs`
            : '';
          const finalAttacksSuffix = (kind === 'attacks' && attacksImportedCount > 0)
            ? ` – ${attacksImportedCount} attacks`
            : '';
            if (kind === 'logs' && logsImportedCount > 0) {
              logsCountShownRef.current = logsImportedCount;
            }
            if (kind === 'attacks' && attacksImportedCount > 0) {
              attacksCountShownRef.current = attacksImportedCount;
            }
          pushOrReplaceToast({ key: `import-${kind}`, replace: true, ttl: 4000, kind: 'success', title, body: `Terminé 100%${finalLogsSuffix}${finalAttacksSuffix}` });
        }, 300);
      }
    }
    lastProcessedProgressIdxRef.current = wsMain.messages.length;
  }, [wsMain.messages]);

  // Dès que le nombre total de logs importés (importedData) est connu après completion, rafraîchir le toast si nécessaire
  useEffect(() => {
    if (!logsImportCompletedRef.current) return; // pas encore fini
    if (logsImportedCount <= 0) return; // pas de compte
    if (logsCountShownRef.current === logsImportedCount) return; // déjà affiché
    // Mettre à jour le toast existant sans reset du TTL si possible (on remet un TTL court pour s'assurer fermeture propre)
    pushOrReplaceToast({
      key: 'import-logs',
      replace: true,
      ttl: 5000,
      kind: 'success',
      title: 'Import Logs',
      body: `Terminé 100% – ${logsImportedCount} logs`
    });
    logsCountShownRef.current = logsImportedCount;
  }, [logsImportedCount]);

  // Rafraîchir toast attacks après réception du nombre total
  useEffect(() => {
    if (!attacksImportCompletedRef.current) return;
    if (attacksImportedCount <= 0) return;
    if (attacksCountShownRef.current === attacksImportedCount) return;
    pushOrReplaceToast({
      key: 'import-attacks',
      replace: true,
      ttl: 5000,
      kind: 'success',
      title: 'Import Attacks',
      body: `Terminé 100% – ${attacksImportedCount} attacks`
    });
    attacksCountShownRef.current = attacksImportedCount;
  }, [attacksImportedCount]);

  // Envoie 'torn' puis attend le message final importedData (logs) avant 'tornAttacks'
  const sendTornPendingRef = useRef(false);
  const handleSendTorn = () => {
    // Éviter lancement multiple si déjà en attente
    if (sendTornPendingRef.current) return;
    sendTornPendingRef.current = true;
    sendWithPulse('torn');
    const startWait = Date.now();
    const TIMEOUT = 60_000; // 60s de garde-fou
    const check = () => {
      // Cherche dernier message importedData contenant logsImported
      for (let i = wsMain.messages.length - 1; i >= 0; i--) {
        const raw = wsMain.messages[i];
        if (!raw || raw[0] !== '{') continue;
        let parsed; try { parsed = JSON.parse(raw); } catch { continue; }
        if (parsed && parsed.type === 'importedData' && typeof parsed.logsImported === 'number') {
          sendWithPulse('tornAttacks');
          sendTornPendingRef.current = false;
          return;
        }
      }
      if (Date.now() - startWait > TIMEOUT) {
        // Timeout: on envoie quand même tornAttacks
        sendWithPulse('tornAttacks');
        sendTornPendingRef.current = false;
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  };
  const handleLogout = () => {
    try { wsMain.send('destroySession'); } catch {}
    localStorage.removeItem('jwt');
    location.href = '/';
  };

  const handleStoreLogsAndRefresh = async (setStoreProgress) => {
    if (storeProgressRef.current.running) return; // évite ré-entrées multiples
    await handleStoreLogs(setStoreProgress, { ws: wsMain.wsRef.current, send: wsMain.send });
    invalidateAllCaches();
    setLogsUpdated(l => !l);
  };

  // Séquence: déclenche import serveur puis stockage local uniquement à 100%
  const handleSyncLogsSequence = () => {
    if (storeProgressRef.current.running) return;
    if (logsImportPercent >= 100) {
      // Import déjà complet => lancer directement stockage
      handleStoreLogsAndRefresh(setStoreProgress);
      return;
    }
    pendingStoreAfterLogsRef.current = true;
    // Démarre import serveur (logs + ensuite attacks quand prêts)
    handleSendTorn();
    // Reset progression locale
    setStoreProgress({ current:0, total:0, percent:0, running:false });
  };

  // Watch progression logs => déclencher stockage différé
  useEffect(() => {
    if (pendingStoreAfterLogsRef.current && logsImportPercent >= 100) {
      pendingStoreAfterLogsRef.current = false;
      handleStoreLogsAndRefresh(setStoreProgress);
    }
  }, [logsImportPercent]);

  // Auto-trigger importedData désactivé (obsolete / provoquait ré-entrées)

  // --- Manual Logs Sync (wsGetAllTornLogs) avec état + throttling toasts ---
  const [manualLogsSync, setManualLogsSync] = useState({ active:false, requestId:null, sent:0, total:0, pct:0 });
  const manualLogsSyncRef = useRef(manualLogsSync);
  useEffect(()=>{ manualLogsSyncRef.current = manualLogsSync; }, [manualLogsSync]);
  const lastManualToastRef = useRef({ pct:-10, time:0 });
  const handleManualLogsSync = useCallback(() => {
    if (wsMain.status !== 'open') return;
    if (manualLogsSyncRef.current.active) return;
    // Cooldown local (évite double-clic spam)
    if (manualLogsSyncRef.current._lastEnd && Date.now() - manualLogsSyncRef.current._lastEnd < 16000) {
      pushToast({ kind:'info', title:'Logs', body:'Veuillez attendre un court instant avant une nouvelle sync.' });
      return;
    }
    const requestId = 'mls_'+Date.now().toString(36);
    // Default: last 30 days unless dateFrom/dateTo definis
    const nowSec = Math.floor(Date.now()/1000);
    let to = nowSec;
    let from = dateFrom ? Math.floor(new Date(dateFrom+'T00:00:00Z').getTime()/1000) : (nowSec - 30*24*3600);
    if (dateTo) {
      const dt = Math.floor(new Date(dateTo+'T23:59:59Z').getTime()/1000);
      if (dt < to) to = dt;
    }
    setManualLogsSync({ active:true, requestId, sent:0, total:0, pct:0 });
    try {
      wsMain.send(JSON.stringify({ type:'getAllTornLogs', from, to, batchSize:1000, requestId }));
      lastManualToastRef.current = { pct:0, time:Date.now() };
          // Toast persistant (pas de TTL) jusqu'à fin / erreur
          pushOrReplaceToast({ key:'manualLogsSync', kind:'info', title:'Logs', body:'Sync manuelle démarrée…', persistent:true });
    } catch(e) {
      setManualLogsSync({ active:false, requestId:null, sent:0, total:0, pct:0 });
      pushToast({ kind:'error', title:'Logs', body:'Échec envoi requête', raw:{ error:e.message } });
    }
  }, [wsMain.status, wsMain.send, dateFrom, dateTo]);

  // Stop import (server-driven wsTorn / wsTornAttacks). Envoie un message stopImport; côté serveur on devra vérifier.
  const handleStopImport = useCallback(() => {
    if (wsMain.status !== 'open') return;
    try { wsMain.send(JSON.stringify({ type:'stopImport', kinds:['logs','attacks'] }));
      pushToast({ kind:'warning', title:'Import', body:'Demande d\'arrêt envoyée' });
    } catch(e) {
      pushToast({ kind:'error', title:'Import', body:'Échec envoi stopImport', raw:{ error:e.message } });
    }
  }, [wsMain.status, wsMain.send]);

  // Sync Items via WebSocket: envoie une requête 'getAllTornItems' puis écrit la réponse dans l'IDB
  const itemsSyncingRef = useRef(false);
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const requestItems = () => {
      if (!mounted || itemsSyncingRef.current) return;
      itemsSyncingRef.current = true;
      try { wsMain.send(JSON.stringify({ type: 'getAllTornItems' })); } catch { itemsSyncingRef.current = false; }
    };
    requestItems();
    const id = setInterval(requestItems, 5 * 60 * 1000);
    return () => { mounted = false; clearInterval(id); };
  }, [token]);

  // Écoute des réponses getAllTornItems pour mise à jour IDB
  // Bus de messages WS centralisé
  useWsMessageBus(wsMain.messages, {
    onGetAllTornItems: (msg) => {
      if (msg.ok && Array.isArray(msg.items)) {
        writeItemsToIndexedDB(msg.items);
      }
      itemsSyncingRef.current = false;
    },
    onManualLogs: (parsed) => {
      if (parsed.error === 'cooldown' && parsed.phase === 'ignored') {
        pushOrReplaceToast({ key:'manualLogsSync', kind:'info', title:'Logs', body:`Cooldown (${Math.ceil((parsed.remaining||0)/1000)}s)` , ttl:4000 });
        return;
      } else if (parsed.phase === 'ignored') {
        return;
      } else if (parsed.phase === 'start') {
        setManualLogsSync(s => ({ ...s, total: parsed.total||0, sent:0, pct:0 }));
        pushOrReplaceToast({ key:'manualLogsSync', kind:'info', title:'Logs', body:`Début sync (${parsed.total} logs)…`, persistent:true });
      } else if (parsed.phase === 'batch') {
        const pct = parsed.total ? Math.min(100, Math.round(parsed.sent/parsed.total*100)) : 100;
        if (pct !== manualLogsSyncRef.current.pct) {
          setManualLogsSync(s => ({ ...s, sent: parsed.sent, total: parsed.total||s.total, pct }));
        }
        const now = Date.now();
        if ((pct - lastManualToastRef.current.pct >= 5) || (now - lastManualToastRef.current.time > 4000) || pct >= 100) {
          lastManualToastRef.current = { pct, time: now };
          pushOrReplaceToast({ key:'manualLogsSync', kind:'info', title:'Logs', body:`${parsed.sent}/${parsed.total} (${pct}%)`, persistent:true });
        }
      } else if (parsed.phase === 'end') {
        const pct = parsed.total ? Math.min(100, Math.round(parsed.sent/parsed.total*100)) : 100;
        setManualLogsSync(s => ({ ...s, sent: parsed.sent, total: parsed.total||s.total, pct, active:false }));
        manualLogsSyncRef.current._lastEnd = Date.now();
        pushOrReplaceToast({ key:'manualLogsSync', kind:'success', title:'Logs', body:`Terminé: ${parsed.sent}/${parsed.total} (${pct}%)`, ttl:8000 });
        handleStoreLogsAndRefresh(setStoreProgress);
      } else if (parsed.ok === false && parsed.error) {
        setManualLogsSync(s => ({ ...s, active:false }));
        pushOrReplaceToast({ key:'manualLogsSync', kind:'error', title:'Logs', body:`Erreur: ${parsed.error}`, ttl:8000 });
      }
    },
    onImportStopped: (parsed) => {
      const k = parsed.kind;
      if (k) {
        canceledImportsRef.current[k] = true;
        const pct = lastImportPercentRef.current[k] ?? 0;
        pushOrReplaceToast({
          key:`import-${k}`,
          replace:true,
          ttl:6000,
          kind:'warning',
          title: k === 'logs' ? 'Import Logs' : (k === 'attacks' ? 'Import Attacks' : 'Import'),
          body:`Annulé à ${pct.toFixed ? pct.toFixed(1) : pct}%`
        });
      } else {
        pushToast({ kind:'warning', title:'Import', body:'Import stoppé', raw:parsed });
      }
    },
    onNetworthInsert: (parsed) => {
      const kind = parsed.ok ? (parsed.inserted ? 'success' : 'info') : 'error';
      const body = parsed.ok ? (parsed.inserted ? `Inserted value=${parsed.value}` : parsed.message || 'No insert') : `Error: ${parsed.error}`;
      // Clé stable pour dé-doublonner
      pushOrReplaceToast({ key: 'networth-insert', kind, title: 'Networth', body, ttl: 6000, replace: true });
    },
    onStatsInsert: (parsed) => {
      const kind = parsed.ok ? (parsed.inserted ? 'success' : 'info') : 'error';
      const body = parsed.ok ? (parsed.inserted ? 'Stats inserted' : (parsed.message || 'Not inserted (<12h)')) : `Error: ${parsed.error}`;
      pushOrReplaceToast({ key: 'stats-insert', kind, title: 'Stats', body, ttl: 6000, replace: true });
    },
    onImportedData: ({ logsImported, attacksImported }) => {
      if (typeof logsImported === 'number') setLogsImportedCount(logsImported);
      if (typeof attacksImported === 'number') setAttacksImportedCount(attacksImported);
    }
  });

  // Anciennes fonctions openMarketForItem / sendPriceNotification supprimées (gérées côté hook)
  return (
    <div className={`app-root ${darkMode ? 'dark-mode' : 'light-mode'}`}>
      {/* Indicateurs activité WebSocket principale */}
      <div style={{ position:'fixed', top:4, left:4, display:'flex', gap:6, zIndex:2000, pointerEvents:'none' }}>
        {/* Réception (vert) ou rouge si down */}
        <div
          title={`WS main status: ${wsMain.status}`}
          style={{
            width:14, height:14, borderRadius:'50%',
            background: wsMain.status === 'open' ? (wsRecvPulse ? '#4dff4d' : '#249624') : '#b30000',
            boxShadow: wsMain.status === 'open'
              ? (wsRecvPulse ? '0 0 8px 4px rgba(0,255,0,0.55)' : '0 0 2px rgba(0,0,0,0.4)')
              : '0 0 8px 3px rgba(255,0,0,0.6)',
            transition:'background 120ms, box-shadow 120ms'
          }}
        />
        {/* Envoi (bleu) ou rouge si down */}
        <div
          title={wsMain.status === 'open' ? 'WS send activity' : 'WS disconnected'}
          style={{
            width:14, height:14, borderRadius:'50%',
            background: wsMain.status === 'open' ? (wsSendPulse ? '#70bfff' : '#1f6fbf') : '#b30000',
            boxShadow: wsMain.status === 'open'
              ? (wsSendPulse ? '0 0 8px 4px rgba(40,160,255,0.55)' : '0 0 2px rgba(0,0,0,0.4)')
              : '0 0 8px 3px rgba(255,0,0,0.6)',
            transition:'background 120ms, box-shadow 120ms'
          }}
        />
      </div>
      <div className="container-fluid px-3 mt-2">
        <div className="d-flex justify-content-between align-items-center gap-2 mb-1" style={{ fontSize:10, opacity:0.75 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {usernameUpper && (
              <span
                style={{
                  fontWeight:600,
                  letterSpacing:'0.06em',
                  fontSize:12,
                  marginTop:-4,        // remonte de 4px
                  marginLeft:40       // décale 40px vers la droite
                }}
                title="Utilisateur connecté"
              >
                {usernameUpper}
              </span>
            )}
          </div>
          <div className="d-flex align-items-center gap-2">
            <span>
              {userTheme === null ? (darkMode ? 'Dark (auto)' : 'Light (auto)') : (darkMode ? 'Dark (manual)' : 'Light (manual)')}
            </span>
            <button
              type="button"
              onClick={handleToggleTheme}
              className="btn btn-sm btn-outline-secondary"
              style={{ fontSize: 10 }}
              title="Cycle theme: dark → light → auto"
            >
              Theme
            </button>
          </div>
        </div>
      {/* Tableau bazaar réutilisable (lazy) */}
      <Suspense fallback={<div style={{padding:20}}>Chargement bazaar…</div>}>
        <BazaarTable
          bazaarRows={bazaarRows}
          watchedItems={watchedItems}
          priceThresholds={priceThresholds}
          blinkingItems={blinkingItems}
          onThresholdChange={(itemId, value) => {
            setPriceThresholds(prev => {
              const updated = { ...prev, [itemId]: value };
              try { localStorage.setItem('priceThresholds', JSON.stringify(updated)); } catch(_) {}
              return updated;
            });
          }}
          onUnwatch={(itemId) => { try { wsBazaar.send(JSON.stringify({ type: 'unwatch', itemId })); } catch(_) {}; setWatchedItems(prev => prev.filter(id => id !== itemId)); }}
          sendWs={sendWithPulse}
        />
      </Suspense>
    <Routes>
  <Route path="/chart/:idx" element={<ChartSlider token={token} logsUpdated={logsUpdated} wsRef={wsMain.wsRef} wsMessages={wsMain.messages} darkMode={darkMode} slider={slider} sendWs={sendWithPulse} dateFrom={dateFrom} dateTo={dateTo} onMinDate={d => handleMinDateReport(String(slider.index), d)} />} />
  <Route path="*" element={<ChartSlider token={token} logsUpdated={logsUpdated} wsRef={wsMain.wsRef} wsMessages={wsMain.messages} darkMode={darkMode} slider={slider} sendWs={sendWithPulse} dateFrom={dateFrom} dateTo={dateTo} onMinDate={d => handleMinDateReport(String(slider.index), d)} />} />
    </Routes>
  {/* Séparateur entre le slider et les boutons du bas pour éviter chevauchements */}
  <hr className="my-2" style={{ borderColor: darkMode ? '#555' : '#ddd' }} />
  {/* Barre d'outils et modals */}

  <div className="row mb-4 align-items-start">
        <div className="col-auto d-flex align-items-end" style={{gap:6}}>
          <div className="d-flex flex-column" style={{width:130}}>
            <label className="form-label mb-1" style={{fontSize:12}}>From</label>
            <input type="date" className="form-control form-control-sm" value={dateFrom || ''} max={dateTo || new Date().toISOString().slice(0,10)} min={minDatesPerChart[String(slider.index)] || ''}
              onChange={e => {
                const v = e.target.value || null;
                const minAllowed = minDatesPerChart[String(slider.index)];
                if (v && minAllowed && v < minAllowed) return; // ignore invalid
                setDateFrom(v);
              }} />
          </div>
          <div className="d-flex flex-column" style={{width:130}}>
            <label className="form-label mb-1" style={{fontSize:12}}>To</label>
            <input type="date" className="form-control form-control-sm" value={dateTo || ''} max={new Date().toISOString().slice(0,10)} min={dateFrom || minDatesPerChart[String(slider.index)] || ''}
              onChange={e => {
                const v = e.target.value || null;
                if (v && dateFrom && v < dateFrom) return; // ignore invalid
                setDateTo(v);
              }} />
          </div>
        </div>
        <div className="col-auto p-0 d-flex align-items-center flex-wrap" style={{rowGap:4}}>
          <button
            onClick={handleSyncLogsSequence}
            disabled={storeProgress.running}
            className="btn btn-info btn-sm ms-2 me-2"
            style={{ height: 40, padding: '4px 10px', opacity: storeProgress.running ? 0.7 : 1 }}
            title={storeProgress.running ? 'Import en cours...' : 'Lancer la synchronisation'}
          >
            {storeProgress.running ? 'Sync…' : 'Sync Logs'}
          </button>
            {/* Manual Logs button masqué (conservation du code pour usage futur) */}
            <button
              onClick={handleManualLogsSync}
              disabled={wsMain.status !== 'open' || manualLogsSync.active}
              className="btn btn-outline-primary btn-sm me-2"
              style={{ height: 40, padding: '4px 10px', opacity: wsMain.status === 'open' ? 1 : 0.6, display:'none' }}
              title="Synchroniser manuellement les logs depuis Mongo (par lots) – hidden"
              aria-hidden="true"
            >
              {manualLogsSync.active ? `Logs ${manualLogsSync.pct}%` : 'Manual Logs'}
            </button>
            {/* Stop Import button masqué (conservation du code) */}
            <button
              onClick={handleStopImport}
              disabled={wsMain.status !== 'open'}
              className="btn btn-outline-danger btn-sm me-2"
              style={{ height: 40, padding: '4px 10px', opacity: wsMain.status === 'open' ? 1 : 0.6, display:'none' }}
              title="Arrêter l'import automatique (hidden)"
              aria-hidden="true"
            >
              Stop Import
            </button>
          <button
            onClick={() => {
              try {
                sendWithPulse(JSON.stringify({ type:'dailyPriceAverage' }));
              } catch(_){}
            }}
            disabled={wsMain.status !== 'open'}
            className="btn btn-warning btn-sm me-2"
            // Bouton masqué temporairement (garder la logique). Pour ré-afficher, retirer display:'none'.
            style={{ height: 40, padding: '4px 10px', opacity: wsMain.status === 'open' ? 1 : 0.6, display: 'none' }}
            title="Déclencher immédiatement le calcul des moyennes quotidiennes"
          >
            Daily Avg
          </button>
          <button
            onClick={() => {
              try { sendWithPulse('networth'); } catch(_) {}
              try { sendWithPulse('stats'); } catch(_) {}
            }}
            disabled={wsMain.status !== 'open'}
            className="btn btn-secondary btn-sm me-2"
            style={{ height: 40, padding: '4px 10px', opacity: wsMain.status === 'open' ? 1 : 0.6 }}
            title="Insérer un snapshot Networth (si >12h depuis le dernier)"
          >
            Sync Stats
          </button>
          <button
            onClick={() => { setShowAutocomplete(true);  }}
            className="btn btn-primary btn-sm ms-2 me-2"
            style={{ height: 40, padding: '4px 10px' }}
          >
            Show Items
          </button>
          {/* Bouton Store Logs supprimé : import déclenché automatiquement sur chaque message importedData */}
          <div className="d-flex align-items-center ms-2" style={{gap:4}}>
            <label style={{fontSize:11}} title="TTL cache (ms) pour requêtes logs en mémoire">Cache TTL</label>
            <input
              type="number"
              value={cacheTTLms}
              min={0}
              step={500}
              onChange={e => {
                const v = Math.max(0, Number(e.target.value)||0);
                setCacheTTLms(v);
                setLogsCacheTTL(v);
                try { localStorage.setItem('logsCacheTTLms', String(v)); } catch(_) {}
              }}
              className="form-control form-control-sm"
              style={{width:90}}
            />
          </div>

          {(storeProgress.running || storeProgress.percent === 100) && (
            <div className="d-flex align-items-center" style={{ gap: 6 }}>
              <div style={{ width: 150 }}>
                <div className="progress" style={{ height: 14 }}>
                  <div
                    className={`progress-bar ${storeProgress.running ? 'progress-bar-striped progress-bar-animated' : ''}`}
                    role="progressbar"
                    style={{ width: `${storeProgress.percent}%` }}
                    aria-valuenow={storeProgress.current}
                    aria-valuemin={0}
                    aria-valuemax={storeProgress.total}
                  >
                    {storeProgress.current} / {storeProgress.total} ({storeProgress.percent}%)
                  </div>
                </div>
              </div>
              {(!storeProgress.running && storeProgress.percent === 100) && (
                <span
                  className="btn btn-sm btn-success"
                  onClick={() => setStoreProgress({ current: 0, total: 0, percent: 0, running: false })}
                  title="Réinitialiser la barre de progression"
                >
                  ✅
                </span>
              )}
            </div>
          )}
        </div>
  </div>
  {/* Modal for Autocomplete */}
      {showAutocomplete && (
        <div
          className="modal show"
          tabIndex="-1"
          style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowAutocomplete(false)}
        >
          <div
            className="modal-dialog"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Item Prices</h5>
                <button type="button" className="btn-close" onClick={() => setShowAutocomplete(false)}></button>
              </div>
              <div className="modal-body">
                {/* Suspense wrapper ajouté pour chargement lazy de Autocomplete */}
                <Suspense fallback={<div><img src="/images/loader.gif" alt="Chargement..." style={{ maxWidth: '80px' }} /></div>}>
                  <Autocomplete
                    token={token}
                    watchedItems={watchedItems}
                    onWatch={(itemId) => { try { wsBazaar.send(JSON.stringify({ type: 'watch', itemId })); } catch {} }}
                    onUnwatch={(itemId) => { try { wsBazaar.send(JSON.stringify({ type: 'unwatch', itemId })); } catch {}; setWatchedItems(prev => prev.filter(id => id !== itemId)); }}
                    sendWs={sendWithPulse}
                    wsMessages={wsMain.messages}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      )}
      {token && (
        <div className="d-flex mb-3" style={{ gap: 6 }}>
          <button onClick={handleLogout} className="btn btn-secondary btn-sm w-100" style={{ padding: '6px 10px' }}>Logout</button>
      
        </div>
      )}
  {/* Toasts montés via portail, isolés des re-renders coûteux */}
  <ToastHost />
  {/* Audio supprimé */}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Main />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);

export default Main;

