// getUserDb.js
// Retourne la DB Mongo spécifique à l'utilisateur (par userID) ou lève une erreur si indisponible.
module.exports = function getUserDb(mongoClient, req) {
  if (!mongoClient) throw new Error('mongoClient missing');
  if (!req || !req.session || !req.session.userID) throw new Error('missing userID in session');
  // Assure une string sans espaces
  const dbName = String(req.session.userID).trim();
  if (!dbName) throw new Error('empty userID');
  return mongoClient.db(dbName);
};
