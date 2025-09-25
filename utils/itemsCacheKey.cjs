// Gestion centralisée des clés cache items.
// Nouveau modèle: une clé RedisJSON par item => tornItems:<version>:<id>
// Incrémentez ITEM_STRUCT_VERSION si la structure du document change.

const ITEM_STRUCT_VERSION = 'v2';
const ITEMS_KEY_PREFIX = `tornItems:${ITEM_STRUCT_VERSION}:`; // ex: tornItems:v2:1234

module.exports = {
  ITEM_STRUCT_VERSION,
  ITEMS_KEY_PREFIX,
  REQUIRED_ITEM_FIELDS: ['id','name','price','img64','description'],
};
