// Global Chart.js setup: register once with all commonly used modules
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  TimeScale,
  Decimation,
} from 'chart.js';
// Time adapter for time scale
import 'chartjs-adapter-date-fns';

try {
  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Tooltip,
    Legend,
    TimeScale,
    Decimation,
  );
} catch (_) {
  // ignore double register in HMR / multiple imports
}

// no exports needed; side-effect registration only
export default null;

