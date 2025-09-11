// Standalone script to fetch logs from Torn API and insert into MongoDB
// Derived from ws/wsTorn.js logic, runnable independently
// Usage: node fetchLogsAndFillMongo.cjs [--from <unix_ts>] [--interval <seconds>]

'use strict';

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

// Load environment variables from .env if present
dotenv.config();

const DEFAULT_DB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGO_DB || 'TORN';
const COLLECTION = process.env.MONGO_COLLECTION || 'logs';
const API_BASE = process.env.TORN_API_URL || 'https://api.torn.com/v2/';
const API_KEY = process.env.TORN_API_KEY;;
const INTERVAL = Number(process.env.TORN_FETCH_INTERVAL || 900);

async function fetchAndInsertLogs(mongoUri = DEFAULT_DB_URI, dbName = DB_NAME, collectionName = COLLECTION, apiBase = API_BASE, apiKey = API_KEY) {
	if (!apiKey) throw new Error('Missing TORN_API_KEY in environment or passed options');

	const client = new MongoClient(mongoUri, { maxPoolSize: 5 });
	await client.connect();
	try {
		const db = client.db(dbName);
		const coll = db.collection(collectionName);

		// Determine starting timestamp if not provided

	const last = await coll.findOne({}, { sort: { timestamp: -1 }, projection: { timestamp: 1 } });
	let start = last && typeof last.timestamp === 'number' ? last.timestamp + 1 : 1716574650;

	const end =  Math.floor(Date.now() / 1000);
	const step =  INTERVAL;
	const totalSpan = Math.max(1, end - start);

		let totalInserted = 0;
		for (let t = start; t <= end; t += step) {
			const url = `${apiBase}user?selections=log&key=${apiKey}&from=${t}&to=${Math.min(t + step, end)}`;
			const fetchStart = Date.now();
			const res = await fetch(url);
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status} fetching ${url} ${txt}`);
			}
			const json = await res.json();
			const fetchMs = Date.now() - fetchStart;
			if (json && json.log) {
				const ops = [];
				for (const [, value] of Object.entries(json.log)) {
					// Transform as in wsTorn.js
					const doc = { ...value };
					doc.date = new Date(doc.timestamp * 1000);
					// Prefer original id if present, else stable hex from content
					doc._id = doc.id;
					delete doc.id;
					if (doc.details) {
						doc.log = doc.details.id;
						doc.title = doc.details.title;
						doc.category = doc.details.category;
						delete doc.details;
					}
					ops.push({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } });
				}
				if (ops.length) {
					const bulk = await coll.bulkWrite(ops, { ordered: false });
					totalInserted += (bulk.upsertedCount || 0);
				}
			}

			// Progress logging: total inserted, fetch duration, and percent based on timestamps
			const windowEnd = Math.min(t + step, end);
			const completed = Math.max(0, windowEnd - start);
			const percent = Math.min(100, Math.max(0, (completed / totalSpan) * 100));
			console.log(`[progress] totalInserted=${totalInserted} fetchTime=${fetchMs}ms progress=${percent.toFixed(2)}% (${new Date(t * 1000).toISOString()} .. ${new Date(windowEnd * 1000).toISOString()})`);

			// Small pacing to be polite
			await new Promise(r => setTimeout(r, 500));
		}
		return { inserted: totalInserted, from: start, to: end, interval: step };
	} finally {
		await client.close();
	}
}

// Execute if run as script
if (require.main === module) {
	(async () => {
		try {
			const result = await fetchAndInsertLogs();
			console.log(`Logs upserted: ${result.inserted} (from ${new Date(result.from * 1000).toISOString()} to ${new Date(result.to * 1000).toISOString()}, step=${result.interval}s)`);
			process.exit(0);
		} catch (err) {
			console.error('fetchLogsAndFillMongo error:', err);
			process.exit(1);
		}
	})();
}

module.exports = { fetchAndInsertLogs };

