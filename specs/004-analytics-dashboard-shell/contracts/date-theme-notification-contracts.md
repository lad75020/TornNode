# Contracts: Date, Theme, and Notifications

## Date filter contract

Existing function:

```text
filterDatasetsByDate(labels, datasets, dateFrom, dateTo)
  -> { labels, datasets }
```

Rules:

1. If both dates are absent, return the existing inputs unchanged.
2. A supported daily series is recognized by canonical `YYYY-MM-DD` labels.
3. `dateFrom` and `dateTo` are inclusive string bounds.
4. If the bounds do not overlap, return empty labels and one empty data array per input dataset.
5. The same `[start, end]` slice is applied to labels and every dataset.
6. Unsupported or malformed label formats are returned unchanged rather than guessed.
7. The function does not mutate the input labels or datasets.

## Theme contract

Existing provider values:

```text
useTheme() -> { darkMode, userTheme, cycleTheme }
```

Rules:

- `userTheme === 'dark'` resolves dark mode.
- `userTheme === 'light'` resolves light mode.
- `userTheme === null` resolves automatic mode using available daylight/environment data and a deterministic fallback.
- `cycleTheme` follows automatic → deliberate opposite of current mode → other deliberate mode → automatic.
- Preference storage failure falls back to the in-memory/default state.
- Switching away from automatic mode clears automatic recomputation timers.
- `useChartTheme(darkMode)` supplies one resolved mode to text/grid palettes, common options, and datasets.

## Notification contract

Existing event-bus functions:

```text
pushToast(detail)
pushOrReplaceToast(detail)
subscribeToasts(handler) -> unsubscribe
```

Rules:

- Events are non-blocking and do not navigate away from the shell.
- A keyed event replaces the visible event with the same `key` and preserves one visible item.
- An unkeyed event receives a unique host id.
- Non-persistent items expire after `ttl` or the host default.
- Persistent items remain until explicit dismissal or replacement.
- `subscribeToasts` always returns an unsubscribe function; the host calls it on unmount.
- User-visible title/body text is safe by construction; raw diagnostics are optional, bounded, and never include credentials or session secrets.
- Status/error notifications are announced without moving focus.
