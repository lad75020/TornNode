import { useEffect, useRef } from 'react';

/**
 * Simple message bus for WebSocket messages.
 * Only inspects the latest message for efficiency and dispatches to provided handlers.
 *
 * handlers: {
 *   onImportedData?: (data: { logsImported?: number, attacksImported?: number }) => void,
 *   onGetAllTornItems?: (msg: any) => void,
 *   onManualLogs?: (msg: any) => void, // phases: ignored|start|batch|end, cooldown, errors
 *   onImportStopped?: (msg: any) => void,
 *   onNetworthInsert?: (msg: any) => void,
 *   onStatsInsert?: (msg: any) => void,
 * }
 */
export default function useWsMessageBus(messages, handlers = {}) {
  const handlersRef = useRef(handlers);
  // Always keep latest handlers, but don't retrigger the main effect on identity changes
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const raw = messages[messages.length - 1];
    if (!raw || typeof raw !== 'string' || raw[0] !== '{') return;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return; }
    if (!parsed || typeof parsed !== 'object' || !parsed.type) return;

    const h = handlersRef.current || {};
    switch (parsed.type) {
      case 'getAllTornItems':
        h.onGetAllTornItems && h.onGetAllTornItems(parsed);
        break;
      case 'getAllTornLogs':
        h.onManualLogs && h.onManualLogs(parsed);
        break;
      case 'importStopped':
        h.onImportStopped && h.onImportStopped(parsed);
        break;
      case 'networthInsert':
        h.onNetworthInsert && h.onNetworthInsert(parsed);
        break;
      case 'statsInsert':
        h.onStatsInsert && h.onStatsInsert(parsed);
        break;
      case 'importedData':
        h.onImportedData && h.onImportedData({
          logsImported: parsed.logsImported,
          attacksImported: parsed.attacksImported,
        });
        break;
      // Company related messages
      case 'companyStock':
        h.onCompanyStock && h.onCompanyStock(parsed);
        break;
      case 'getCompanyStockHistory':
        h.onCompanyStockHistory && h.onCompanyStockHistory(parsed);
        break;
      case 'companyProfile':
        h.onCompanyProfile && h.onCompanyProfile(parsed);
        break;
      case 'getCompanyProfileHistory':
        h.onCompanyProfileHistory && h.onCompanyProfileHistory(parsed);
        break;
      case 'getCompanyDetailsHistory':
        h.onCompanyDetailsHistory && h.onCompanyDetailsHistory(parsed);
        break;
      case 'updatePrice':
        h.onUpdatePrice && h.onUpdatePrice(parsed);
        break;
      default:
        if (h.onAny) h.onAny(parsed);
        break;
    }
  }, [messages]);
}
