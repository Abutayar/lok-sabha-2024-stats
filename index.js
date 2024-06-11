const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://results.eci.gov.in/PcResultGenJune2024/';
const INIT_ENDPOINT = `${BASE_URL}index.htm`;



// Function to fetch HTML content from the given URL
async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url);
        return data;
    } catch (error) {
        console.error(`Error fetching data from URL: ${error.message}`);
        return null;
    }
}

// Function to extract data from HTML
async function extractData(html, headerSelector, bodySelector) {
    const $ = cheerio.load(html);
    let extractedData = [];

    const headers = $(headerSelector);

    const column = headers.map((idx, el) => $(el).text().trim()).toArray().join(' ').split('\n').map(e => e.trim());


    // Selector for table rows
    const rows = $(bodySelector);

    // Iterate over each row in the table
    for (let index = 0; index < rows.length; index++) {
        const element = rows[index];
        let dataItem = {};

        // Select all cells (td) in the current row
        const cells = $(element).find('td');

        // Check if the number of columns matches the expected number
        if (cells.length === column.length) {
            for (let idx = 0; idx < cells.length; idx++) {
                const cell = cells[idx];
                const text = $(cell).text().trim();
                if ($(cell).find('a').length > 0) {
                    const link = $(cell).find('a').attr('href');
                    const fullLink = path.join(BASE_URL, link);
                    dataItem.next = fullLink;
                }
                dataItem[column[idx]] = text;
            }
            extractedData.push(dataItem);
        } else {
            console.warn(`Row ${index + 1} does not match the expected number of columns.`);
        }
    }

    return extractedData;
}




// Function to save data to a file
function saveData(data, filename) {
    try {
        fs.writeFileSync(`dataset/${filename}`, JSON.stringify(data, null, 2));
        console.log(`Data saved to ${filename}`);
    } catch (error) {
        console.error(`Error saving data to file: ${error.message}`);
    }
}



async function fetchOverview() {
    const html = await fetchHTML(INIT_ENDPOINT);
    if (html) {
        const data = await extractData(html, '.rslt-table table thead tr', '.rslt-table table tbody tr');
        saveData(data, 'overview-lok_sabha_2024_data.json');
    } else {
        console.error('Failed to retrieve HTML.');
    }
}


// fetchOverview();



const LS_2024_DATA = require('./dataset/overview-lok_sabha_2024_data.json');

async function fetchPartyWiseCount() {
    const moreInfo = {};
    for (let index = 0; index < LS_2024_DATA.length; index++) {
        const element = LS_2024_DATA[index];
        const html = await fetchHTML(element['next']);
        if (html) {
            const data = await extractData(html, 'table thead tr', 'table tbody tr');
            moreInfo[element['Party']] = data;
            //saveData(data, 'lok_sabha_2024_data.json');
        } else {
            console.error('Failed to retrieve HTML.');
        }
        //console.log(element);
        
    }
    saveData(moreInfo,'detail-partywise-won-seat-data.json');
}

// fetchPartyWiseCount()



const LS_2024_PARTY_WISE_WINNER_DATA = require('./dataset/detail-partywise-won-seat-data.json');

const WINNER_LIST = Object.values(LS_2024_PARTY_WISE_WINNER_DATA).reduce((a,c) => [...a,...c], [])




async function fetchConstituencyWiseCount() {
    const moreInfo = {};
    for (let index = 0; index < WINNER_LIST.length; index++) {
        const element = WINNER_LIST[index];
        // https://results.eci.gov.in/PcResultGenJune2024/candidateswise-S015.htm
        // https://results.eci.gov.in/PcResultGenJune2024/ConstituencywiseS015.htm
        console.log('fetching...' , element['next'].replace('candidateswise-','Constituencywise'))
        const html = await fetchHTML(element['next'].replace('candidateswise-','Constituencywise'));
        if (html) {
            const data = await extractData(html, 'table thead tr', 'table tbody tr');
            moreInfo[element['Parliament Constituency']] = data;
        } else {
            console.error('Failed to retrieve HTML.');
        }
        //console.log(element);
        
    }
    saveData(moreInfo,'constituency-wise-vote-count-data.json');
}

//fetchConstituencyWiseCount();





const constituencywisedataset =  require('./dataset/constituency-wise-vote-count-data.json');
const constituency = Object.keys(constituencywisedataset).length

const constituencyWise = {};
let total = 0;

for (const key in constituencywisedataset) {
    if (Object.hasOwnProperty.call(constituencywisedataset, key)) {
        const element = constituencywisedataset[key];
        constituencyWise[key] = 0;
        element.forEach(each => constituencyWise[key] += parseInt(each["Total Votes"])); 
       // console.log(key,constituencyWise[key])
        if(Number.isNaN(constituencyWise[key])) continue;
        total = constituencyWise[key] + total;
    }
}


saveData({constituencyWise,total, constituency},'count-stats.json');