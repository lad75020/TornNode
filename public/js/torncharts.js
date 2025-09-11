const DAY_TO_SEC = 86400;
const HOME_URL = "../";
google.charts.load('upcoming', { packages: ['corechart'] });

let firstLogDate = new Date(0);
let lastLogDate = new Date(0);

function wsLED(isOn) {
    const indicator = document.getElementById('WSLED');
    if (isOn === true) {
      indicator.innerHTML = '🟢'; // Green Circle Emoji
      indicator.className = 'text-success fs-1';
    } else if (isOn === false){
      indicator.innerHTML = '🔴'; // Red Circle Emoji
      indicator.className = 'text-danger fs-1';
    }
    else if (isOn === "off"){
        indicator.innerHTML = '🔅'; // Yellow Circle Emoji
        indicator.className = 'text-warning fs-1';
    }
    else if (isOn === "blink"){
        if(indicator.innerHTML == "🔅")
            indicator.innerHTML = '🟢'; // Green Circle Emoji
        else if (indicator.innerHTML == '🟢')
            indicator.innerHTML = "🔅"; // Yellow Circle Emoji
    }
}
async function insertLogs(url, highestTimestamp) {
    // First, open the DB and check if stores exist
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
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: highestTimestamp
            })
        });
        const data = await response.json();
        let count = 0;
        for (const item of data) {
            const exists = await db.count('logs', item._id);
            if (exists === 0) {
                await db.put('logs', item);
                ++count;
                console.log(`inserting '${item.title}' at ${item.timestamp}`);
                wsLED('blink');
            } else {
                console.log('skipping ' + item._id);
            }
        }
        wsLED(true);
    } catch (error) {
        console.error(`Mongo Logs Fetch error:`, error);
    } finally {
        db.close();
    }
}
async function findIDBLog(url) {
    const db = await idb.openDB('TORN');
    try {
        const tx = db.transaction('logs', 'readonly');
        const store = tx.objectStore('logs');
        const index = store.index('timestampIndex');
        const cursor = await index.openCursor(null, 'prev');
        if (cursor) {
            const record = cursor.value;
            insertLogs(url, record.timestamp);
        } else {
            insertLogs(url, 0);
        }
        await tx.done;
    } catch (error) {
        console.error('Error finding last log: ', error);
    } finally {
        db.close();
    }
}
async function setInitialDates(which){
    switch (which){
        case "first":
            document.getElementById("from").value = firstLogDate.toISOString().slice(0,10);
        break;
        case "range":
            document.getElementById("last").value = lastLogDate.toISOString().slice(0,10);
            document.getElementById("from").value = firstLogDate.toISOString().slice(0,10);
        break;
        case "last":
            document.getElementById("last").value = lastLogDate.toISOString().slice(0,10);
        break;
        default:
            document.getElementById("from").value = firstLogDate.toISOString().slice(0,10);
            document.getElementById("last").value = lastLogDate.toISOString().slice(0,10);
        break;
    }
}
async function fetchDateRange(){
    firstLogDate = new Date(0);
    
    await fetch(`${HOME_URL}getMaxDateRange`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
    .then(response=> response.json())
    .then(data => { 
        firstLogDate.setUTCSeconds(data.firstTimestamp);
        lastLogDate = new Date();
        setInitialDates('range');});
}

let from = firstLogDate.getTime()/1000;
let first = 0;
let last = lastLogDate.getTime()/1000;
let stop = false;
let chart;
let chartData;
let firstSelectedDate = "";
let secondSelectedDate = "";
let jsonCharts;

function getCommonObjectsById(array1, array2) { 
    const map = new Map();
    array1.forEach(item => { map.set(item._id, item); });
    return array2.filter(item => map.has(item._id));
}
function hasNestedProperty(obj, propertyPath) {
    const properties = propertyPath.split('.');
    let currentObj = obj;
    for (const property of properties) {
        if (!currentObj || !currentObj.hasOwnProperty(property)) {
            return false;
        }
        currentObj = currentObj[property];
    }
    return true;
}
async function createTable(data) {
    // Créer un élément table
    const table = document.createElement('table');
    table.style.border = '2px solid black';

    // Parcourir chaque ligne de données
    data.forEach((rowData, index) => {
        const row = document.createElement('tr');
        if (index === 0) {
                row.style.backgroundColor = 'darkgrey';
            row.style.color = 'white';
        }

        rowData.forEach((cellData, index) => {
            const cell = document.createElement('td');;
            if (cellData !== undefined){
                if (cellData instanceof Date) {
                    const span = document.createElement('span');
                    span.innerText = cellData.toISOString().slice(0,10);
                    span.style.cursor = 'pointer';
                    span.setAttribute('data-bs-toggle', 'tooltip');
                    span.setAttribute('title', 'View Logs');
                    span.addEventListener('click', async function() {
                        const logs = await fetch(`${HOME_URL}getAllTornLogs`,
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(
                                    {from : cellData.getTime()/1000, to: cellData.getTime()/1000 + DAY_TO_SEC})
                            });
                        const logsData = await logs.json();
                        showLogs(logsData);
                    });
                    cell.appendChild(span);
                }
                else
                    cell.innerText = cellData;
            }
            cell.style.border = '1px solid black';

            if (index !== rowData.length - 1) {
                row.appendChild(cell); 
            }
        });

        // Ajouter la ligne à la table
        table.appendChild(row);
    });

    // Ajouter la table au corps du document ou à un élément spécifique
    return (table);
}
async function removeCachedChart(keyName){
    const db = await idb.openDB('TORN');
    await db.delete('charts', keyName.replace(/\s+/g, ''));
    db.close();
}
async function removeIDBDuplicates() {
    const db = await idb.openDB('TORN');
    const tx = db.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');
    const uniqueKeys = new Set();
    let count = 0;

    // Use a cursor to iterate over all records and remove duplicates
    let cursor = await store.openCursor();
    while (cursor) {
        const key = cursor.primaryKey;
        if (uniqueKeys.has(key)) {
            count++;
            await store.delete(key);
        } else {
            uniqueKeys.add(key);
        }
        cursor = await cursor.continue();
    }
    await tx.done;
    document.getElementById("fetchStatus").innerHTML += `<BR/>${count} records removed from IDB.`;
    db.close();
}
async function retrieveLogsByLog(log, from, to) {
    const db = await idb.openDB("TORN");
    const value1 = await db.getAllFromIndex('logs', 'logIndex', log);
    const value2 = await db.getAllFromIndex('logs', 'timestampIndex', IDBKeyRange.bound(from, to));
    const result = getCommonObjectsById(value1, value2);
    db.close();
    return result;
}
async function retrieveLogsByCrimeAction(crime_action){
    const db = await idb.openDB("TORN");
    let cursor = await db.transaction('logs').store.openCursor();
    const aLogs = new Array();
    while(cursor) {
        if(hasNestedProperty(cursor.value,'data.crime_action') && cursor.value.data.crime_action.match(crime_action)) {
            aLogs.push(cursor.value);
        }
        cursor = await cursor.continue();
    };
    db.close();
    return aLogs;
}
async function retrieveLogsByCrime(crime){
    const db = await idb.openDB("TORN");
    let cursor = await db.transaction('logs').store.openCursor();
    const aLogs = new Array();
    while(cursor) {
        if(hasNestedProperty(cursor.value,'data.crime') && typeof(cursor.value.data.crime) == "string" && cursor.value.data.crime.match(crime)) {
            aLogs.push(cursor.value);
        }
        cursor = await cursor.continue();
    };
    db.close();
    return aLogs;
}

async function deduplicate() {
    await fetch('../deduplicate')
    .then(response => response.text())
    .then(data =>{document.getElementById("fetchStatus").innerHTML += `<BR/>${data}`});
}
function initTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}
async function updatePrice(){
    const itemID = document.getElementById('itemID').value;
        fetch(`${HOME_URL}updatePrice`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            id: itemID
        })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('price').style.color = 'rgb(89, 209, 144)';
        document.getElementById('price').innerText = data.price || "N/A";

        initAutoComplete();
    });
}

async function getObjectsByProperties(idbName, oStore, properties, startTimestamp, endTimestamp, crime) {
    const db = await idb.openDB(idbName);
    const tx = db.transaction(oStore, 'readonly');
    const store = tx.objectStore(oStore);
    const index = store.index('timestampIndex');
    const range = IDBKeyRange.bound(startTimestamp, endTimestamp);
    const results = [];
    for await (const cursor of index.iterate(range)) {
        const match = Object.keys(properties).every(key => cursor.value[key] === properties[key]);
        if (match) {
            if (crime !== undefined && cursor.value.data.crime.match(crime)) {
                results.push(cursor.value);
            }
            if (crime === undefined) {
                results.push(cursor.value);
            }
        }
    }
    db.close();
    return results;
}

function selectHandler() {
    const selectedItem = chart.getSelection()[0];
    const chartName = chart.options.cc[0].title;
    if (selectedItem) {
        const value = chartData.getValue(selectedItem.row, 0);
        
        if(firstSelectedDate == "" )
            firstSelectedDate = value;
        else if (secondSelectedDate == "")
            secondSelectedDate = value;
        if (firstSelectedDate != "" && secondSelectedDate != ""){
            if(firstSelectedDate < secondSelectedDate){
                const dFirst = new Date(firstSelectedDate);
                let year = dFirst.getFullYear();
                let month = String(dFirst.getMonth() + 1).padStart(2, '0');
                let day = String(dFirst.getDate()).padStart(2, '0');
                document.getElementById("from").value = `${year}-${month}-${day}`;
                const dSecond = new Date(secondSelectedDate);
                year = dSecond.getFullYear();
                month = String(dSecond.getMonth() + 1).padStart(2, '0');
                day = String(dSecond.getDate()).padStart(2, '0');
                document.getElementById("last").value = `${year}-${month}-${day}`;
                initDisplay();
                drawChart(chartName);
            }
            else{
                alert("First Date must be before Last Date");
            }
            firstSelectedDate = "";
            secondSelectedDate = "";
        }
    }
}    
function initDisplay(){
    stop = false;
    data1 = [];
    progress = 0;
    if(chart)
        chart.clearChart();
    document.getElementById("chartContainer").style.display = "none";
    document.getElementById("Total").style.display = "none";
    document.getElementById("Data").innerHTML = "";
    document.getElementById('wait').style.visibility = 'visible';
    
    document.getElementById("Total").innerHTML = "";
    document.getElementById("Average").innerHTML = "";

    const fromDate = new Date(document.getElementById('from').value);
    from = fromDate.getTime()/1000;
    first = fromDate.getTime()/1000;
    const lastDate = new Date(document.getElementById('last').value);
    last = lastDate.getTime()/1000;
}
async function prepareData(chartName){
    let data1 = new Array();
    let total =0;
    let manual_skill =0;
    let intelligence_skill=0;
    let endurance_skill = 0;
    const headers = new Array();
    const previous = new Object();
    const currentChart = jsonCharts.find(chart => chart.name === chartName);
    if (currentChart) {
        const db = await idb.openDB('TORN');
        
        const value = await db.get('charts',currentChart.name.replace(/\s+/g, ''));
        data1 = value ? value.data : [];
        
        if (data1.length > 0) {
            if (currentChart.sum !== undefined){
                total = data1[data1.length - 1][currentChart.sum + 1];
            }
            console.log(`Data for chart '${currentChart.name}' retrieved from IndexedDB.`);
            first = parseInt(new Date(data1[data1.length - 1][0]).getTime()/1000);
        } else {
            currentChart.header.forEach(header => {
                headers.push(header);
            });
            headers.push({ role: 'style' });
            data1.push(headers); 
            console.log(`No data found for chart '${currentChart.name}' in IndexedDB.`);
        }
        if(currentChart.name == "Networth"){
            const data2 = new Array(["Date", "Value",{ role: 'style' }]);
            await fetch(`${HOME_URL}getNetworth`)
            .then(response=> response.json())
            .then(data => { for (networth of data) { data2.push([new Date(networth.date), networth.value,'color: green'])}});
            return (data2);
        }   
        if(currentChart.name == "Faction Balance"){
            const data2 = new Array(["Date", "Balance",{ role: 'style' }]);
            await retrieveLogsByLog(currentChart.log, first, last + DAY_TO_SEC).then(objects => {for (balance of objects) {data2.push([new Date(balance.timestamp * 1000), balance.data.balance_after,'color:green']);}});
            return (data2);
        }
        if(currentChart.log && currentChart.crime_action){
            await fetch(`${HOME_URL}getMaxDateRange`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    log: currentChart.log,
                    crime_action: currentChart.crime_action
                })
            })
            .then(response => response.json())
            .then(data => { 
                if(data.firstTimestamp > first)
                    first = data.firstTimestamp;
                if(data.lastTimestamp < last)    
                    last = data.lastTimestamp;
            });
        }
        for (t=first; t<last+DAY_TO_SEC; t += DAY_TO_SEC){
            wsLED('blink');
            if (stop) return (data1);
            const thisDay = new Date(0);
            thisDay.setUTCSeconds(t);
    
            let i = [thisDay];
            let {log, crime, crime_action, category,type} = currentChart;
            if (log != 9005 && log != 5410 && log != 1112 && log !=2290 && log != 1226 && log !=6738 && log!= 8731 && log!= 4810 && log != 2340 && log != 6000 && log != 5510 && category != "Gym" && type != "Attack" && type != "Trains" && type != "AllSkills" && type != "graffiti" && type != "Casino"){
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log,
                        crime_action
                    })
                })
                .then(response => response.text())
                .then(data => { i.push(parseInt(data)); });
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log: 9150,
                        crime_action: crime_action
                    })
                })
                .then(response => response.text())
                .then(data => { i.push(parseInt(data)); });
                for(let k = 3; k < (data1[0].length - 1); k++) {
                    await fetch(`${HOME_URL}getTorn${currentChart.header[k]}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            from: t,
                            to: t + DAY_TO_SEC,
                            crime_action: crime_action
                        })
                    })
                    .then(response => response.text())
                    .then(data => { 
                        if(!isNaN(parseInt(data))){
                            total += parseInt(data);
                            if(currentChart.header[k] == "Money")
                                i.push(parseInt(total));
                            if(currentChart.header[k] == "Items")
                                i.push(parseInt(data));                                  
                        }   
                    });
                }
                i.push('color: black');
                data1.push(i);
            }
            if ( type == "graffiti"){
                let successes = 0;
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log: 9010,
                        crime_action: crime_action
                    })
                })
                .then(response=> response.text())
                .then(data => { successes += parseInt(data);});
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log: 9015,
                        crime_action: crime_action
                    })
                })
                .then(response=> response.text())
                .then(data => { successes += parseInt(data);});
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log: 9020,
                        crime_action: crime_action
                    })
                })
                .then(response=> response.text())
                .then(data => { successes += parseInt(data);});
                i.push(successes);
                let failures = 0;
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log: 9150,
                        crime_action: crime_action
                    })
                })
                .then(response=> response.text())
                .then(data => { failures += parseInt(data);});
                await fetch(`${HOME_URL}getTornLogCount`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC,
                        log: 9154,
                        crime_action: crime_action
                    })
                })
                .then(response=> response.text())
                .then(data => { failures += parseInt(data);});
                i.push(failures);
                for(let k = 3;k < (currentChart.header.length); k++)
                    await fetch(`${HOME_URL}getTorn${currentChart.header[k]}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            from: t,
                            to: t + DAY_TO_SEC,
                            crime_action: crime_action
                        })
                    })
                    .then(response=> response.text())
                    .then(data => { 
                                    if (!isNaN(parseInt(data))){
                                        total += parseInt(data);
                                        if(currentChart.header[k] == "Money")
                                            i.push(parseInt(total));
                                        if(currentChart.header[k] == "Items")
                                            i.push(parseInt(data)); 
                                    }                                 
                                });
                i.push('color: black');
                data1.push(i);
            }
            if (type == "Casino" && category =="Slots"){
                let money = 0;
                await retrieveLogsByLog(8300, t, t+DAY_TO_SEC).then(objects => {objects.forEach(object => {money += object.data.won_amount - object.data.bet_amount;})});
                await retrieveLogsByLog(8301, t, t+DAY_TO_SEC).then(objects => {objects.forEach(object => {money -= object.data.bet_amount;})});
                i.push(money);
                if (money > 0)
                    i.push('color:rgb(12, 124, 59)');
                else 
                    i.push('color:rgb(173, 20, 20)');         
                data1.push(i);
                
            }
            if(type=="Attack"){
                await fetch(`${HOME_URL}getTornAttacks`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC
                    })
                })
    
                .then(response=> response.json())
                .then(data => { 
                    let {wins, losses,attacks,defends} = data;
                    data1.push([thisDay, attacks,defends,wins,losses,'color: red']);
                });
            }
            if(type=="Trains"){
                await fetch(`${HOME_URL}getCompanyTrains`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC
                    })
                })
                .then(response=> response.json())
                .then(data => { 
                    let {manual, intelligence, endurance, trains} = data;
                    manual_skill += parseInt(manual);
                    intelligence_skill += parseInt(intelligence);
                    endurance_skill += parseInt(endurance);
                    data1.push([thisDay, manual_skill, intelligence_skill, endurance_skill, trains,'color:black']);
                });
            }                   
            if (category == "Gym"){
                await fetch(`${HOME_URL}getGymStats`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC
                    })
                })
    
                .then(response=> response.json())
                .then(data => {
                    if (data){
                        i[1] = data.speed ?? previous.speed;
                        previous.speed = data.speed ?? previous.speed;
                        i[2] = data.defense ?? previous.defense;
                        previous.defense = data.defense ?? previous.defense;
                        i[3] = data.dexterity ?? previous.dexterity;
                        previous.dexterity = data.dexterity ?? previous.dexterity; 
                        i[4] = data.strength ?? previous.strength;
                        previous.strength = data.strength ?? previous.strength;
                        i[5] = data.energy_used || 0;
                    }
                });
                i.push('color: black');
                if (i[5] > 0)
                    data1.push(i);
            }
            if(log == 2290){
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {i[1] = objects.length;});
                await retrieveLogsByLog(2291, t, t+DAY_TO_SEC).then(objects => {i[2] = objects.length;});
                await retrieveLogsByLog(6005, t, t+DAY_TO_SEC).then(objects => {i[3] = objects[0] !== undefined ? objects[0].data.rehab_times : 0;});
                i.push('color: green');
                if(i[1] > 0 || i[2] > 0 || i[3] > 0)
                    data1.push(i);
            }
            if(log == 2340){
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {i[1] = objects.length; });
                await retrieveLogsByLog(2100, t, t+DAY_TO_SEC).then(objects => {i[2] = 0 - objects.length; });
                i.push('color: red');
                if(i[1] > 0 || i[2] < 0)
                    data1.push(i);
            }
            if(log == 4810){
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {for (obj of objects) {if (obj.data.sender != 3277171 && obj.data.sender != 3333632 && obj.data.money < 20000001) total += obj.data.money;} });
                i.push(total);
                let xanax = 0;
                await retrieveLogsByLog(4103, t, t+DAY_TO_SEC).then(objects => {for (obj of objects){if (obj.data.items[0] !== undefined && obj.data.items[0].id == 206 && obj.data.sender != 3277171) xanax += obj.data.items[0].qty; }});
                i.push(xanax);
                i.push('color: blue');
                data1.push(i);
            }
            if(log == 6000){
                i[1] = 0;
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {for (object of objects) {i[1] += object.data.duration / 3600;}});
                i.push('color: blue');
                if(i[1] > 0)
                    data1.push(i);
            }
            if(log == 1226){
                i[1] = 0;
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {for (object of objects) {i[1] += object.data.cost_total;}});
                i.push('color: blue');
                if(i[1] > 0)
                    data1.push(i);
            }
            if (log == 5410){
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {i[1] = objects.length;});
                await retrieveLogsByLog(5415, t, t+DAY_TO_SEC).then(objects => {i[2] = objects.length;});
                
                i.push('color: red');
                if(i[1] > 0 || i[2] > 0)
                    data1.push(i);
            }
            if (log == 5510){
                i[1] = 0;
                i[2] = 0;
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {for (obj of objects) {i[1] += obj.data.worth;}});
                await retrieveLogsByLog(5511, t, t+DAY_TO_SEC).then(objects => {for (obj of objects) {i[2] += obj.data.worth;}});
                
                i.push('color: red');
                if(i[1] > 0 || i[2] < 0)
                    data1.push(i);
            }
            if (log == 1112){
                i[1] = 0;
                i[2] = 0;
                await retrieveLogsByLog(log, t, t+DAY_TO_SEC).then(objects => {for (obj of objects) {i[1] += obj.data.cost_total;}});
                await retrieveLogsByLog(1113, t, t+DAY_TO_SEC).then(objects => {for (obj of objects) {i[2] += obj.data.cost_total;}});
                
                i.push('color: green');
                if(i[1] > 0 || i[2] > 0)
                    data1.push(i);
            }
            if (log == 8731){
                for (const result of ['win', 'lose']){
                        await fetch(`${HOME_URL}getTornLogCount`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                from: t,
                                to: t + DAY_TO_SEC,
                                log: log,
                                position: result
                            })
                        })
                        .then(response=> response.text())
                        .then(data => { i.push((parseInt(data)) ? parseInt(data) : 0);});
        
                };
                i.push('color: red');
                if(i[1] > 0 || i[2] > 0)
                    data1.push(i);
            }
            if (crime != undefined && crime !="" && type != "AllSkills"){
                await getObjectsByProperties('TORN','logs',{log:9005},t,t+DAY_TO_SEC, crime)
                
                .then(objects => {
                    if(objects.length > 0)
                        data1.push( [ thisDay, objects[0].data.skill_level, 'color:blue']);
                })
                .catch(error => {
                    console.error('Error retrieving objects:', error);
                });
            }
            if (type=="AllSkills"){
                await fetch(`${HOME_URL}getAllSkills`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: t,
                        to: t + DAY_TO_SEC
                    })
                })
                .then(response=> response.json())
                .then(data => {
                    const skills = ['cracking', 'pickpocketing', 'graffiti', 'skimming', 'forgery', 'searching', 'shoplifting', 'bootlegging', 'burglary','hustling','scamming','disposal'];
                    skills.forEach(skill => {
                        const skillValue = data[skill] ?? previous[skill];
                        i.push(skillValue);
                        previous[skill] = skillValue;
                    });
                });
                i.push('color: red');
                data1.push(i);              
            }
            const progress = (t - first) / (last - first) * 100;
            document.getElementById("progressBar").style.width = `${progress.toFixed(0)}%`;
            document.getElementById("progressBar").innerHTML = `${progress.toFixed(0).padStart(2, '0')}%`;
            document.getElementById("progressBar").setAttribute("aria-valuenow", progress.toFixed(0));
            document.getElementById("date").innerHTML =  thisDay.toISOString().slice(0,10);
        }
        const data2 = new Array();
        data1.forEach((item) => {
            if (item.length === data1[0].length) {
                data2.push(item);
            }
        });
        return(data2);
 
    }            
    else {
        document.getElementById("fetchStatus").innerText = `${chartName} Chart not found`;
        return;
    }
    

}
async function drawChart(chartName){
    document.getElementById("chartSelect").disabled=true;
    const data = await prepareData(chartName);
    wsLED(true);
    const currentChart = jsonCharts.find(chart => chart.name === chartName);

    document.getElementById("wait").style.visibility="hidden";
    document.getElementById("chartSelect").disabled=false;
    if(data.length > 1){
        document.getElementById("chartContainer").style.display="block";
        if(currentChart.total !== undefined){
            for(const [type, charac] of Object.entries(currentChart.total)){
                let total = 0;
                let isFirstItem = true;
                data.forEach((item) => {
                    if (item[charac.series +1] !== undefined && !isFirstItem)
                        total += parseInt(item[charac.series +1]);
                    if (isFirstItem) 
                        isFirstItem = false;
                });
                const totalPrice = total * (charac.price || 0);
                document.getElementById("Total").innerHTML+= `${type} ${total} ${totalPrice > 0 ? '= $ '+ totalPrice : ''}<BR/>`;
            }
            document.getElementById("Total").style.display='block';
        }
        if(currentChart.average !== undefined){
            for(const [key, value] of Object.entries(currentChart.average)){
                let total = 0;
                let isFirstItem = true;
                data.forEach((item) => {
                    if (item[value +1] !== undefined && !isFirstItem)
                        total += parseInt(item[value+1]);
                    if (isFirstItem) 
                        isFirstItem = false;
                });
                document.getElementById("Average").innerHTML+= `${key} ${total/(last-(new Date(data[1][0]).getTime()/1000)) * 86400}<BR/>`;
            }
            document.getElementById("Average").style.display='block';
        }
        await persistDataToIndexedDB(chartName, data);
        document.getElementById('Data').appendChild(await createTable(data));
        chartData = google.visualization.arrayToDataTable(data);
        chart = new google.visualization.ComboChart(document.getElementById('chartContainer'));
        google.visualization.events.addListener(chart, 'select', selectHandler);
        chart.draw(chartData, currentChart.options);
        
    }
    else{
        document.getElementById("fetchStatus").innerText = "No "+ chartName +" Found";
        document.getElementById("chartContainer").innerHTML = "";
    }
}
async function persistDataToIndexedDB(chartName, data) {
    const db = await idb.openDB('TORN');
    await db.put('charts',
        {
            chartName: chartName.replace(/\s+/g, ''),
            data
        }
    );

}
