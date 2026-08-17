# Contract: Dashboard Shell

## Route contract

- The dashboard uses the existing route shape `/chart/:idx`.
- `idx` is parsed as an integer and normalized to the available chart range.
- Browser back/forward and direct links select the same chart as the visible shell.
- Previous/next controls navigate to adjacent valid indexes.
- Automatic rotation navigates through the same route contract, wraps to the first view, and stops when disabled or unmounted.

## Chart view contract

The selected chart receives the existing shared inputs:

```text
token, logsUpdated, wsRef, wsMessages, sendWs, darkMode,
chartHeight, dateFrom, dateTo, onMinDate
```

A chart view may report its earliest daily date through `onMinDate`. The shell owns the date inputs and re-renders/remounts the selected view when the range changes so stale range data is not presented as current.

## Loading, empty, and error contract

- Loading state is visible while a lazy chart or route transition is unresolved.
- Empty state is explicit when valid data returns no points.
- Error state is recoverable and offers continued shell navigation.
- A failed chart must not remove the surrounding navigation, theme, date, or notification controls.

## Accessibility and layout contract

- Every navigation, date, theme, autoplay, and notification-dismiss control has an accessible name.
- Keyboard focus order follows the visual shell order and focus-visible styling remains visible in both themes.
- Progress/status changes use a non-blocking status/live mechanism and do not steal focus.
- Toolbar controls wrap at narrow supported widths; the chart remains visible and no core control is clipped.
