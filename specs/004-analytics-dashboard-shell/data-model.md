# Data Model: Analytics Dashboard Shell

**Feature**: Analytics Dashboard Shell

This feature has client-side view state only. It does not add a server or database schema.

## Chart View

Represents one selectable analytics view in the existing chart registry.

| Field | Type | Rules |
|---|---|---|
| `index` | non-negative integer | Stable position in the registry; normalized to the available range. |
| `name` | non-empty string | User-facing accessible label. |
| `component` | lazy view reference | Loaded only when selected; failures become recoverable UI state. |
| `dateMinimum` | `YYYY-MM-DD` or null | Earliest known daily data date for the view. |
| `status` | `idle \| loading \| ready \| empty \| error` | A view must not present stale data as ready for a different range. |

**Relationships**: A `Chart View` is selected by `Dashboard Navigation State` and receives the active `Date Filter`, `Theme Preference` resolution, and safe notification events.

## Dashboard Navigation State

| Field | Type | Rules |
|---|---|---|
| `routeIndex` | integer | Derived from `/chart/:idx`; invalid values are clamped or redirected to a valid view. |
| `autoPlay` | boolean | Persisted when possible; advances only while enabled and mounted. |
| `rotationTimer` | browser timer handle or null | Owned by the slider hook and always cleared on disable/unmount. |
| `isNavigating` | boolean | Optional transient state for loading/route transition feedback. |

**State transitions**:

```text
route index -> selected view
selected view + autoPlay -> next valid route index
any view + invalid route -> normalized valid route index
mounted + autoPlay=true -> timer active
(timer active) + autoPlay=false or unmount -> timer cleared
```

## Date Filter

| Field | Type | Rules |
|---|---|---|
| `dateFrom` | `YYYY-MM-DD` or null | Inclusive lower bound; null means no lower bound. |
| `dateTo` | `YYYY-MM-DD` or null | Inclusive upper bound; null means no upper bound. |
| `minimumForView` | `YYYY-MM-DD` or null | View-specific lower UI bound. |
| `maximumForView` | `YYYY-MM-DD` | Current day; future dates are rejected. |
| `isValid` | boolean | `dateFrom` must not be after `dateTo`; values must be canonical when supplied. |

**Transformation**: For daily labels, a valid filter slices labels and every dataset using the same inclusive start/end indexes. If the range contains no labels, the result has empty labels and same-shape datasets with empty data. Unsupported label formats return the original inputs unchanged.

## Theme Preference and Resolved Theme

| Field | Type | Rules |
|---|---|---|
| `userTheme` | `dark \| light \| null` | `null` means automatic mode; stored under the existing preference key when possible. |
| `darkMode` | boolean | Resolved visual mode used by shell CSS and Chart.js helpers. |
| `coordinates` | `{ lat, lon }` or null | Optional browser geolocation input; never required for startup. |
| `modeLabel` | string | Communicates automatic/manual light/dark state to the user. |

**State transitions**:

```text
automatic -> dark or light (cycle)
dark -> light (cycle)
light -> automatic (cycle)
automatic + daylight/environment change -> new resolved mode
storage/geolocation failure -> safe automatic fallback
manual mode or unmount -> automatic recomputation timer cleared
```

## Notification Event

| Field | Type | Rules |
|---|---|---|
| `key` | string or null | Stable operation identity; same key replaces the current notification. |
| `kind` | `success \| info \| warning \| error \| other` | Controls safe visual and live semantics. |
| `title` | non-empty string | Short operation name. |
| `body` | safe user-facing string | Must not contain credentials or session secrets. |
| `ttl` | non-negative milliseconds or null | Null/omitted uses the host default; persistent notifications do not decrement. |
| `persistent` | boolean | Persistent items require explicit dismissal or replacement. |
| `raw` | optional safe diagnostic object | Render only when intentionally supplied and bounded; never use for secrets. |
| `replace` | boolean | Set by the bus for keyed replacement. |

**State transitions**:

```text
published -> visible
visible + same key -> updated in place
visible + ttl elapsed -> removed
visible + dismissal -> removed
unmounted -> subscription and expiry timer cleared
```

## Invariants

1. At most one active chart view corresponds to the canonical route index.
2. Date labels and datasets always have matching slice boundaries.
3. A shell theme and its chart options use the same resolved `darkMode` value.
4. A keyed operation has at most one visible notification.
5. No feature-owned timer, listener, or subscription survives its owning component/hook lifecycle.
