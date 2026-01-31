require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = 'TORN';
const COLLECTION_NAME = 'Items'; // Change as needed
const API_URL = `${process.env.TORN_API_URL}`; // Replace with your API endpoint

async function fetchAndStoreNewItems() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db(DATABASE_NAME);
        const collection = db.collection(COLLECTION_NAME);
        const highest = await collection.find().sort({ id: -1 }).limit(1).toArray();
        const highestId = highest.length > 0 ? highest[0].id : 0;
        console.log(`Highest id in DB: ${highestId}`);
        
        // Get all existing ids in the collection
        const existingDocs = await collection.find({}, { projection: { id: 1 } }).toArray();
        const existingIds = new Set(existingDocs.map(doc => doc.id));
        // Find missing ids in the range 1 to 1465
        const missingIds = [];
        for (let i = 1; i <= 1465; i++) {
            if (!existingIds.has(i)) {
                missingIds.push(i);
            }
        }
        if (missingIds.length > 0) {
            console.log('Missing ids:', missingIds);
        } else {
            console.log('No missing ids.');
        }

        for (let i = highestId + 1; i <= 9999; i++) {
            try {
                const response = await fetch(
                    `${API_URL}torn/${i}/items`,
                    {headers: { 'Accept': 'application/json',
                                'Authorization': `ApiKey ${process.env.TORN_API_KEY}` }});
                if (!response.ok) {
                    console.error(`Error fetching item ${i}:`, response.statusText);
                    break;
                }
                const data = await response.json();
                
                if (data.error && data.error.code === 6) {
                    console.log(`Item ${i} not found, skipping`);
                    break;
                }
                const tornItem = data.items[0];
                const item = {
                    id: tornItem.id,
                    name: tornItem.name,
                    type: tornItem.type,
                    description: tornItem.description || '',
                    price: tornItem.value.market_price || 0,
                    image : tornItem.image || null,
                };
                const imageURL = tornItem.image;
                
                // Fetch image and convert to base64
                if (imageURL) {
                    try {
                        const imgResponse = await fetch(imageURL);
                        const imgBuffer = await imgResponse.arrayBuffer();
                        item.img64 = Buffer.from(imgBuffer).toString('base64');
                    } catch (imgErr) {
                        console.error(`Failed to fetch/convert image for id ${item.id}:`, imgErr);
                        item.img64 = null;
                    }
                }
                
                await collection.insertOne(item );
                console.log(`Stored item ${item.id}: ${item.name}`);
            } catch (error) {
                console.error(`Error processing item ${i}:`, error);
            }

        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

fetchAndStoreNewItems();