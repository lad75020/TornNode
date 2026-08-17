import { useCallback, useEffect, useRef, useState } from 'react';
import usePersistentState from './usePersistentState.js';

const DEFAULT_INTERVAL_MS = 30_000;

function normalizeLength(length) {
  const value = Number(length);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeIndex(index, length) {
  const count = normalizeLength(length);
  if (!count) return 0;
  const value = Number(index);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), count - 1));
}

/**
 * Owns dashboard rotation state while leaving URL navigation to the shell.
 * The callback is invoked only by the interval, so route changes cannot
 * accidentally create a second source of truth for the active chart.
 */
export default function useChartSlider(
  length,
  { currentIndex = 0, onAdvance, enabled = true, intervalMs = DEFAULT_INTERVAL_MS } = {}
) {
  const count = normalizeLength(length);
  const normalizedCurrentIndex = normalizeIndex(currentIndex, count);
  const [autoPlay, setAutoPlay] = usePersistentState('chartsAutoPlay', false);
  const [index, setIndex] = useState(normalizedCurrentIndex);
  const onAdvanceRef = useRef(onAdvance);

  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  }, [onAdvance]);

  useEffect(() => {
    setIndex(normalizedCurrentIndex);
  }, [normalizedCurrentIndex]);

  useEffect(() => {
    if (!enabled || !autoPlay || count < 2) return undefined;
    const delay = Number.isFinite(Number(intervalMs)) && Number(intervalMs) > 0
      ? Number(intervalMs)
      : DEFAULT_INTERVAL_MS;
    const id = window.setInterval(() => {
      const nextIndex = (normalizedCurrentIndex + 1) % count;
      setIndex(nextIndex);
      onAdvanceRef.current?.(nextIndex);
    }, delay);
    return () => window.clearInterval(id);
  }, [autoPlay, count, enabled, intervalMs, normalizedCurrentIndex]);

  const setSafeIndex = useCallback((next) => {
    setIndex(current => normalizeIndex(typeof next === 'function' ? next(current) : next, count));
  }, [count]);

  return { index, setIndex: setSafeIndex, autoPlay: Boolean(autoPlay), setAutoPlay };
}

export { normalizeIndex, normalizeLength };
