import { useCallback, useEffect, useState } from 'react';

// Hook générique pour les graphes Bar nécessitant une modal JSON des buckets.
// buildBuckets: async () => ({ labels, sums, bucketObjects })
// buildPayload: (label, items) => objet à passer à JsonPreview
// deps: tableau de dépendances provoquant recompute
export default function useBarBucketModal({ buildBuckets, buildPayload, deps = [] }) {
  const [data, setData] = useState({ labels: [], sums: [] });
  const [bucketObjects, setBucketObjects] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalLabel, setModalLabel] = useState(null);
  const [modalItems, setModalItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { labels = [], sums = [], bucketObjects: objs = {} } = await buildBuckets();
        if (cancelled) return;
        setData({ labels, sums });
        setBucketObjects(objs);
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const openModalForLabel = useCallback((label) => {
    if (!label) return;
    const items = bucketObjects[label] || [];
    setModalLabel(label);
    setModalItems(items);
    setShowModal(true);
  }, [bucketObjects]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setModalLabel(null);
    setModalItems([]);
  }, []);

  const onBarClick = useCallback((evt, elements, chart) => {
    if (!elements || !elements.length) return;
    const el = elements[0];
    const label = chart?.data?.labels?.[el.index];
    if (label) openModalForLabel(label);
  }, [openModalForLabel]);

  const payload = modalLabel ? buildPayload(modalLabel, modalItems) : null;

  return {
    data,
    bucketObjects,
    loading,
    error,
    onBarClick,
    showModal,
    modalLabel,
    modalItems,
    payload,
    closeModal,
  };
}
