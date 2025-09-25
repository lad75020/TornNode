async function createIndexedDB() {
     let db = await idb.openDB('TORN');
    
    if (!db.objectStoreNames.contains('logs') || !db.objectStoreNames.contains('charts')) {
        const oldVersion = db.version;
        db.close();
        // Upgrade DB version to add missing stores
        
        db = await idb.openDB('TORN', oldVersion + 1, {
            upgrade(upgradeDb) {
                if (!upgradeDb.objectStoreNames.contains('logs')) {
                    const logsStore = upgradeDb.createObjectStore('logs', { keyPath: '_id' });
                    logsStore.createIndex('logIndex', 'log', { unique: false });
                    logsStore.createIndex('timestampIndex', 'timestamp', { unique: false });
                    logsStore.createIndex('crime_actionIndex', 'data.crime_action', { unique: false });
                    logsStore.createIndex('crimeIndex', 'data.crime', { unique: false });
                }
                if (!upgradeDb.objectStoreNames.contains('charts')) {
                    const chartsStore = upgradeDb.createObjectStore('charts', { keyPath: 'chartName' });
                    chartsStore.createIndex('chartNameIndex', 'chartName', { unique: true });
                }
            }
        });
    }

}

// Call the function to create the database
createIndexedDB();