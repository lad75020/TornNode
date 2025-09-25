import { createContext, useContext, useEffect, useState, useCallback, createElement, useRef } from 'react';
import usePersistentState from './usePersistentState.js';
// L'utilisateur installera suncalc : npm i suncalc
// On importe dynamiquement pour réduire le risque si non encore installé
let SunCalc = null;
try { SunCalc = require('suncalc'); } catch(_) { /* sera chargé plus tard si dispo */ }

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [userTheme, setUserTheme] = usePersistentState('themePreference', null); // null|"dark"|"light"
  const [darkMode, setDarkMode] = useState(false);
  const [coords, setCoords] = useState(null); // { lat, lon }
  const timesRef = useRef({ dateKey: null, sunrise: null, sunset: null });
  const recomputeTimerRef = useRef(null);

  // Calcul du mode auto selon sunrise/sunset si disponibles, sinon fallback heure fixe
  const computeAuto = useCallback(() => {
    const now = new Date();
    const { sunrise, sunset, dateKey } = timesRef.current;
    const currentDateKey = now.toISOString().slice(0,10);
    // Recharger SunCalc si pas encore chargé
    if (!SunCalc) {
      try { SunCalc = require('suncalc'); } catch(_) {}
    }
    // Si on a des coordonnées et soit pas de times pour ce jour soit date différente -> recalcul
    if (coords && SunCalc && dateKey !== currentDateKey) {
      try {
        const t = SunCalc.getTimes(now, coords.lat, coords.lon);
        timesRef.current = {
          dateKey: currentDateKey,
            sunrise: t.sunrise || null,
            sunset: t.sunset || null
        };
      } catch(e) {
        // ignore => fallback heuristique
      }
    }
    const { sunrise: sr, sunset: ss } = timesRef.current;
    if (sr instanceof Date && ss instanceof Date && !isNaN(sr) && !isNaN(ss)) {
      const dark = !(now >= sr && now < ss); // noir avant sunrise ou après sunset
      return dark;
    }
    // Fallback : 7h-19h clair
    const h = now.getHours();
    return !(h >= 7 && h < 19);
  }, [coords]);

  useEffect(() => {
    if (userTheme === 'dark') setDarkMode(true);
    else if (userTheme === 'light') setDarkMode(false);
    else setDarkMode(computeAuto());
  }, [userTheme, computeAuto]);

  // Récupération des coordonnées navigateur (une seule fois)
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => { /* refus -> fallback heuristique */ },
      { enableHighAccuracy: false, maximumAge: 6*60*60*1000, timeout: 8000 }
    );
  }, []);

  // Rafraîchissement périodique en mode auto (toutes les minutes) + planification jusqu'à prochain lever/coucher si disponibles
  useEffect(() => {
    if (userTheme != null) return; // seulement auto
    function tick() { setDarkMode(computeAuto()); schedule(); }
    function schedule() {
      if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current);
      const { sunrise, sunset } = timesRef.current;
      const now = Date.now();
      const targets = [sunrise, sunset].filter(d => d instanceof Date && !isNaN(d) && d.getTime() > now).map(d => d.getTime());
      // Prochaine transition sinon dans 60s
      const nextMs = targets.length ? Math.min(...targets) - now + 250 : 60_000;
      recomputeTimerRef.current = setTimeout(tick, Math.max(5_000, Math.min(nextMs, 30*60*1000))); // borne max 30 min
    }
    schedule();
    return () => { if (recomputeTimerRef.current) clearTimeout(recomputeTimerRef.current); };
  }, [userTheme, computeAuto]);

  const cycleTheme = () => {
    setUserTheme(prev => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return null; // back to auto
      // prev null
      return darkMode ? 'light' : 'dark';
    });
  };

  return createElement(
    ThemeContext.Provider,
    { value: { darkMode, userTheme, cycleTheme } },
    children
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
