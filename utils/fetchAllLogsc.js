const {MongoClient} = require('mongodb');
require('dotenv').config();
const yargs = require('yargs');

const argv = yargs
    .option('start', {
        alias: 's',
        description: 'Nombre de jours pour scanner les logs passés',
        type: 'number'
    })
    .help()
    .alias('help', 'h')
    .argv;

async function main() {
    const client = new MongoClient(process.env.MONGODB_URI_TEST, {
        compressors: ["snappy"]
    });
client.connect().then(async () => {
        try {
            const database = client.db('3277171');
            let startDate;
            let endDate;
            const logsCollection = database.collection('logs');
            if (argv.start) {
                startDate = new Date(Date.now() - argv.start *24 * 60 * 60 * 1000);
                const doc = await logsCollection.findOne({}, { projection: { timestamp: 1 }, sort : { timestamp: 1 }, limit: 1 });
                endDate = new Date((doc.timestamp - 1)* 1000);
            } else {
                const doc = await logsCollection.findOne({}, { projection: { timestamp: 1 }, sort : { timestamp: -1 }, limit: 1 });
                startDate = new Date((doc.timestamp + 1) * 1000);
                endDate = new Date();
            }
            let countInserted = 0;
            for (let t = startDate.getTime() / 1000; t <= endDate.getTime() / 1000; t += 900) {
                const response = await fetch(`${process.env.TORN_API_URL}user?selections=log&key=fJ1mxiRZfEPVILav&from=${t}&to=${t + 900}`);
                const jsonLogs = await response.json();
                if (jsonLogs.log) {
                    for (const [property, value] of Object.entries(jsonLogs.log)) {
                        countInserted++;
                        value.date = new Date(value.timestamp * 1000);
                        value._id = value.id;
                        delete value.id;
                    if (value.details) {
                        value.log = value.details.id;
                        value.title = value.details.title;
                        value.category = value.details.category;
                        delete value.details;
                    }
                    await logsCollection.insertOne(value);
                    }
                }
                console.log(new Date(t * 1000).toISOString().split('.')[0].replace('T', ' '), countInserted);
                await new Promise(resolve => setTimeout(resolve, 600));
                
            }

        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
    });
}

main();