# WebSocket Contracts: Bazaar Monitoring

## Public `/wsb`

The upgrade is allowed without an authenticated session because this socket is explicitly market-only. The default `authorizeSocket` behavior remains required for `/ws`.

### Server-to-client messages

- `welcome`: `{ "type": "welcome", "time": number }`
- `watchList`: `{ "type": "watchList", "items": number[] }`; public connections receive their own subscription list, initially empty.
- `watchAck`: `{ "type": "watchAck", "itemId": number, "already"?: boolean }`
- `unwatchAck`: `{ "type": "unwatchAck", "itemId": number, "missing"?: boolean }`
- `priceUpdate`: a validated `MarketSnapshot`. `listings: []` and `minBazaar: null` mean no current valid listing and do not expose an exception.
- `getAllTornItems`: `{ "type": "getAllTornItems", "ok": true, "items": [...] }`, containing only the existing public item catalog fields needed by the picker.
- `dailyPriceAveragesAll`: `{ "type": "dailyPriceAveragesAll", "ok": true, "lines": [...] }` with validated aggregate lines.
- Failure responses use stable generic messages such as `Item catalog could not be loaded. Please retry.` and `Market history could not be loaded. Please retry.` Internal exception text is logged server-side only.

### Client-to-server messages

- `{ "type": "watch", "itemId": number }`
- `{ "type": "unwatch", "itemId": number }`
- `{ "type": "getAllTornItems" }`
- `{ "type": "dailyPriceAveragesAll" }` or the legacy string command `dailyPriceAveragesAll`
- `ping` for the existing heartbeat behavior.

The public socket must ignore or reject private commands. In particular, it must not dispatch `dailyPriceAverage` (which builds/persists aggregates), account imports, company data, finance data, or any command handled only by `/ws`.

## Private `/ws`

Existing cookie/session validation, 4401 close behavior, command routing, and notification semantics remain unchanged. `dailyPriceAveragesAll` continues to be available to authenticated users, and the existing authenticated build command remains private.

## Ordering and validation

The client tracks the newest accepted `time` independently per `itemId`. A snapshot older than the watermark is ignored. A newer malformed/empty snapshot advances the watermark but preserves the last valid current row. This prevents a reconnect from replacing new data with an old response while retaining a trustworthy last-known summary.
