// Global Chart.js setup: register common modules once with an HMR-safe guard.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  TimeScale,
  Filler,
  Title,
  Decimation
} from 'chart.js';
import 'chartjs-adapter-date-fns';

const registryKey = Symbol.for('tornnode.chartSetup.registered');
const registry = globalThis[registryKey] || (globalThis[registryKey] = { registered: false });

if (!registry.registered) {
  try {
    ChartJS.register(
      CategoryScale,
      LinearScale,
      LogarithmicScale,
      PointElement,
      LineElement,
      BarElement,
      ArcElement,
      Tooltip,
      Legend,
      TimeScale,
      Filler,
      Title,
      Decimation
    );
    registry.registered = true;
  } catch (error) {
    // Chart.js tolerates repeated registration during HMR. Keep startup alive
    // if a third-party Chart.js plugin rejects registration in development.
    try { console.warn('[chartSetup] Chart.js registration deferred', error); } catch (_) { /* ignore diagnostics */ }
  }
}

// no exports needed; side-effect registration only
export default null;
