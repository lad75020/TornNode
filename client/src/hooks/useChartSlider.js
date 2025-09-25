import { useEffect, useState } from 'react';
import usePersistentState from './usePersistentState.js';

export default function useChartSlider(length) {
  const [autoPlay, setAutoPlay] = usePersistentState('chartsAutoPlay', false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => {
      setIndex(i => (i + 1) % length);
    }, 30000);
    return () => clearInterval(id);
  }, [autoPlay, length]);

  return { index, setIndex, autoPlay, setAutoPlay };
}
