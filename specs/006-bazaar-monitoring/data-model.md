# Data Model: Bazaar Monitoring

## `MarketListing`

The normalized current listing used by server broadcasts and the client table.

| Field | Type | Rules |
|---|---|---|
| `price` | number | finite, strictly greater than zero |
| `quantity` | number | finite positive integer |
| `seller` | string or omitted | optional; empty/invalid values are omitted |

Raw Torn fields are mapped from `price` and `amount` into `price` and `quantity`.

## `MarketSnapshot`

```json
{
  "type": "priceUpdate",
  "time": 1710000000000,
  "itemId": 1234,
  "itemName": "Example item",
  "minBazaar": 1250,
  "listings": [
    { "price": 1250, "quantity": 3, "seller": "seller-name" }
  ]
}
```

Rules:

- `itemId` is a positive safe integer.
- `time` is a positive epoch-millisecond number and is used for per-item ordering.
- `listings` contains the valid listing collection used for the snapshot. The normal server broadcast contains only the selected minimum listing; the client still recomputes the minimum defensively if more entries arrive.
- `minBazaar` is the normalized minimum price or `null` when no valid listing exists.
- A no-listing update is an availability signal and must not overwrite the last valid row in the client.

## `ThresholdAlertEpisode`

Client-local state keyed by normalized `itemId`:

```text
triggered: Set<number>
```

For a valid positive threshold `t` and a valid current minimum `p`:

- if `p <= t` and the item is not in `triggered`, emit one alert and add it;
- if `p <= t` and it is already in `triggered`, do nothing;
- if `p > t`, remove it from `triggered` (the recovery boundary is strict);
- if `p` is absent/invalid or `t` is invalid, do not change the episode.

## Persisted browser state

- `watchedItems`: array of unique positive safe integer item IDs; malformed values are discarded.
- `priceThresholds`: object keyed by item ID whose values are finite positive numbers; zero, negative, non-numeric, and empty values are removed.

Persistence remains best-effort through the existing `usePersistentState` hook. If `localStorage` is unavailable or malformed, the in-memory defaults are used.

## `DailyHistoryLine`

```json
{
  "id": 1234,
  "name": "Example item",
  "points": [
    { "date": "2026-08-16", "avg": 1250 }
  ]
}
```

Rules:

- `id` is a positive safe integer and `name` is a safe display string.
- `date` must normalize to a valid non-future UTC day or valid timestamp accepted by the existing chart date normalizer.
- `avg` must be finite and strictly positive.
- Invalid points are excluded; lines with no valid points are excluded; remaining points are chronological and duplicate days are stable/deterministic.
