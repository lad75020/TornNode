module.exports = async function (client, socket) {
    
        const database = client.db('TORN');
        const logsCollection = database.collection('logs');
        const docsBefore = await logsCollection.countDocuments();
        try {
            const cursor = logsCollection.aggregate([
                {
                    $group: {
                        _id: {
                            log: "$log",
                            timestamp: "$timestamp",
                            data: "$data",
                            title: "$title",
                            category: "$category",
                            params: "$params"
                        },
                        uniqueIds: { $addToSet: "$_id" },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        count: { $gt: 1 }
                    }
                }
            ]);
            for await (const doc of cursor) {
                doc.uniqueIds.shift();
                await logsCollection.deleteMany({ _id: { $in: doc.uniqueIds } });
            }
            const docsAfter = await logsCollection.countDocuments();
            const docsDeleted = docsBefore - docsAfter;
            socket.send(`Deduplication completed: ${docsDeleted} documents deleted`);
        } catch (error) {
            socket.send(`Internal Server Error: ${error.message}`);
        }

};