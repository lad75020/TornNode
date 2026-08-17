'use strict';

const assert = require('node:assert/strict');

function createSocket() {
  const frames = [];
  return {
    readyState: 1,
    frames,
    send(payload) { frames.push(JSON.parse(payload)); },
    addEventListener() {},
    removeEventListener() {},
  };
}

function matches(document, filter = {}) {
  return Object.entries(filter).every(([field, condition]) => {
    const value = document[field];
    if (condition && typeof condition === 'object' && ('$gte' in condition || '$lte' in condition || '$gt' in condition || '$lt' in condition || '$in' in condition)) {
      if ('$gte' in condition && !(value >= condition.$gte)) return false;
      if ('$lte' in condition && !(value <= condition.$lte)) return false;
      if ('$gt' in condition && !(value > condition.$gt)) return false;
      if ('$lt' in condition && !(value < condition.$lt)) return false;
      if ('$in' in condition && (!Array.isArray(condition.$in) || !condition.$in.includes(value))) return false;
      return true;
    }
    return value === condition;
  });
}

function createCollection(name, initial = []) {
  const docs = initial.slice();
  return {
    name,
    docs,
    indexes: [],
    async createIndex(spec, options) { this.indexes.push({ spec, options }); return options && options.name; },
    async findOne(filter = {}, options = {}) {
      const found = docs.filter(doc => matches(doc, filter));
      const sort = options.sort || {};
      const key = Object.keys(sort)[0];
      if (key) found.sort((a, b) => (Number(b[key]) - Number(a[key])) * (sort[key] < 0 ? 1 : -1));
      return found[0] || null;
    },
    async countDocuments(filter = {}) { return docs.filter(doc => matches(doc, filter)).length; },
    async insertOne(document) {
      if (docs.some(doc => (document._id != null && doc._id === document._id) || (document.code != null && doc.code === document.code))) {
        const error = new Error('duplicate key');
        error.code = 11000;
        throw error;
      }
      docs.push({ ...document });
      return { acknowledged: true, insertedId: document._id };
    },
    async updateOne(filter, update, options = {}) {
      const found = docs.find(doc => matches(doc, filter));
      if (found) return { matchedCount: 1, upsertedCount: 0 };
      if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };
      docs.push({ ...(update.$setOnInsert || {}) });
      return { matchedCount: 0, upsertedCount: 1, upsertedId: update.$setOnInsert && update.$setOnInsert.code };
    },
    find(filter = {}, options = {}) {
      let rows = docs.filter(doc => matches(doc, filter));
      const sort = options.sort || {};
      for (const [key, direction] of Object.entries(sort).reverse()) rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * direction);
      let index = 0;
      return {
        async hasNext() { return index < rows.length; },
        async next() { return rows[index++]; },
        async close() {},
        async toArray() { return rows.slice(); },
        async *[Symbol.asyncIterator]() { while (index < rows.length) yield rows[index++]; },
      };
    },
  };
}

function createUserDatabase(initial = {}) {
  const collections = new Map();
  for (const name of new Set(['logs', 'attacks', 'Networth', 'Stats', ...Object.keys(initial)])) {
    collections.set(name, createCollection(name, initial[name] || []));
  }
  return {
    collections,
    collection(name) {
      if (!collections.has(name)) collections.set(name, createCollection(name));
      return collections.get(name);
    },
    listCollections() { return { toArray: async () => [...collections.keys()].map(name => ({ name })) }; },
    async createCollection(name) { if (!collections.has(name)) collections.set(name, createCollection(name)); return collections.get(name); },
  };
}

function createFastifyForUserDatabases(databases) {
  return {
    mongo: {
      db(name) {
        assert.ok(databases[name], `unexpected tenant database ${name}`);
        return databases[name];
      },
      client: { db(name) { return this.owner.db(name); } },
    },
    log: { info() {}, debug() {}, warn() {}, error() {} },
  };
}

function framesOf(socket, type) { return socket.frames.filter(frame => frame.type === type); }

module.exports = {
  assert,
  createSocket,
  createCollection,
  createUserDatabase,
  createFastifyForUserDatabases,
  framesOf,
};
