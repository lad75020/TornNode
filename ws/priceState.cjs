// Shared state for bazaar price tracking between wsBazaarPrice and wsUpdatePrice
// Exports a singleton Map so both modules mutate the same instance.
module.exports = {
  lastMinPrices: new Map(), // itemId -> last recorded min price
};
