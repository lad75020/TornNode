import { createContext, useContext, useEffect, useState, useCallback, createElement, useRef } from 'react';
import * as SunCalc from 'suncalc';
import usePersistentState from './usePersistentState.js';
const ThemeContext = createContext(null);

function fallbackDarkMode(now = new Date()) {
  const hour = now.getHours();
  return !(hour >= 7 && hour < 19);
}

function validCoordinates(value) {
  return value && Number.isFinite(value.lat) && Number.isFinite(value.lon);
}

export function ThemeProvider({ children }) {
  const [userTheme, setUserTheme] = usePersistentState('themePreference', null);
  const [darkMode, setDarkMode] = useState(() => fallbackDarkMode());
  const [coords, setCoords] = useState(null);
  const timesRef = useRef({ coordinatesKey: null, dateKey: null, sunrise: null, sunset: null });
  const recomputeTimerRef = useRef(null);

  const computeAuto = useCallback(() => {
    const now = new Date();
    const currentDateKey = now.toISOString().slice(0, 10);
    const coordinatesKey = validCoordinates(coords) ? `${coords.lat}:${coords.lon}` : 'fallback';
    const previous = timesRef.current;

    if (previous.coordinatesKey !== coordinatesKey) {
      timesRef.current = { coordinatesKey, dateKey: null, sunrise: null, sunset: null };
    }

    if (validCoordinates(coords) && SunCalc && timesRef.current.dateKey !== currentDateKey) {
      try {
        const times = SunCalc.getTimes(now, coords.lat, coords.lon);
        timesRef.current = {
          coordinatesKey,
          dateKey: currentDateKey,
          sunrise: times.sunrise instanceof Date ? times.sunrise : null,
          sunset: times.sunset instanceof Date ? times.sunset : null
        };
      } catch (_) {
        // Keep the deterministic time-based fallback.
      }
    }

    const { sunrise, sunset } = timesRef.current;
    if (sunrise instanceof Date && sunset instanceof Date
      && !Number.isNaN(sunrise.getTime()) && !Number.isNaN(sunset.getTime())) {
      return !(now >= sunrise && now < sunset);
    }
    return fallbackDarkMode(now);
  }, [coords]);

  useEffect(() => {
    if (userTheme === 'dark') setDarkMode(true);
    else if (userTheme === 'light') setDarkMode(false);
    else setDarkMode(computeAuto());
  }, [userTheme, computeAuto]);

  useEffect(() => {
    if (!('geolocation' in navigator)) return undefined;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      position => {
        if (!active) return;
        const { latitude, longitude } = position.coords || {};
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          setCoords({ lat: latitude, lon: longitude });
        }
      },
      () => { /* refusal intentionally uses the deterministic fallback */ },
      { enableHighAccuracy: false, maximumAge: 6 * 60 * 60 * 1000, timeout: 8000 }
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (userTheme !== null) {
      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      recomputeTimerRef.current = null;
      return undefined;
    }

    let active = true;
    const schedule = () => {
      if (!active) return;
      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      const now = Date.now();
      const targets = [timesRef.current.sunrise, timesRef.current.sunset]
        .filter(date => date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() > now)
        .map(date => date.getTime());
      const nextMs = targets.length ? Math.min(...targets) - now + 250 : 60_000;
      recomputeTimerRef.current = setTimeout(tick, Math.max(5_000, Math.min(nextMs, 30 * 60 * 1000)));
    };
    const tick = () => {
      if (!active) return;
      setDarkMode(computeAuto());
      schedule();
    };

    schedule();
    return () => {
      active = false;
      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      recomputeTimerRef.current = null;
    };
  }, [userTheme, computeAuto]);

  const cycleTheme = useCallback(() => {
    setUserTheme(previous => {
      if (previous === 'dark') return 'light';
      if (previous === 'light') return null;
      return darkMode ? 'light' : 'dark';
    });
  }, [darkMode, setUserTheme]);

  return createElement(
    ThemeContext.Provider,
    { value: { darkMode, userTheme: userTheme === 'dark' || userTheme === 'light' ? userTheme : null, cycleTheme } },
    children
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export { fallbackDarkMode };
