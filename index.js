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
    saveData(moreInfo, 'detail-partywise-won-seat-data.json');
}

// fetchPartyWiseCount()



const LS_2024_PARTY_WISE_WINNER_DATA = require('./dataset/detail-partywise-won-seat-data.json');

const WINNER_LIST = Object.values(LS_2024_PARTY_WISE_WINNER_DATA).reduce((a, c) => [...a, ...c], [])




async function fetchConstituencyWiseCount() {
    const moreInfo = {};
    for (let index = 0; index < WINNER_LIST.length; index++) {
        const element = WINNER_LIST[index];
        // https://results.eci.gov.in/PcResultGenJune2024/candidateswise-S015.htm
        // https://results.eci.gov.in/PcResultGenJune2024/ConstituencywiseS015.htm
        console.log('fetching...', element['next'].replace('candidateswise-', 'Constituencywise'))
        const html = await fetchHTML(element['next'].replace('candidateswise-', 'Constituencywise'));
        if (html) {
            const data = await extractData(html, 'table thead tr', 'table tbody tr');
            // sorting because on eci page for jajpur has sort issue
            // Issue URL : https://results.eci.gov.in/PcResultGenJune2024/ConstituencywiseS188.htm
            moreInfo[element['Parliament Constituency']] = data.sort((a, b) => b["% of Votes"] - a["% of Votes"]);
        } else {
            console.error('Failed to retrieve HTML.');
            throw new Error('Failed to retrieve HTML.')
        }
        //console.log(element);

    }
    saveData(moreInfo, 'constituency-wise-vote-count-data.json');
}

// fetchConstituencyWiseCount();



const constituencywisedataset = require('./dataset/constituency-wise-vote-count-data.json');
const NO_OF_CONSTITUENCY = Object.keys(constituencywisedataset).length

const CONSTITUENCY_WISE_TOTAL_VOTES = {};
let TOTAL_VOTES = 0;
let TOTAL_CANDIDATE = 0;

let NOTA_FACTS = {
    total: 0,
    highest: {
        constituency: null,
        count: -Infinity
    },
    lowest: {
        constituency: null,
        count: Infinity
    },
}
const PARTY_WISE_DATA = {};
const parties = [];
for (const constituency in constituencywisedataset) {
    if (Object.hasOwnProperty.call(constituencywisedataset, constituency)) {
        const candidateList = constituencywisedataset[constituency];

        CONSTITUENCY_WISE_TOTAL_VOTES[constituency] = 0;

        candidateList.forEach(candidate => {
            CONSTITUENCY_WISE_TOTAL_VOTES[constituency] += parseInt(candidate["Total Votes"])
            if (candidate['Party'] in PARTY_WISE_DATA) {
                PARTY_WISE_DATA[candidate['Party']]['EVM Votes'] += parseInt(candidate['EVM Votes']) || 0;
                PARTY_WISE_DATA[candidate['Party']]['Postal Votes'] += parseInt(candidate['Postal Votes']) || 0;
                PARTY_WISE_DATA[candidate['Party']]['Total Votes'] += parseInt(candidate['Total Votes']) || 0;
                PARTY_WISE_DATA[candidate['Party']]['Total Candidate']++;
            } else {
                PARTY_WISE_DATA[candidate['Party']] = {
                    "EVM Votes": parseInt(candidate['EVM Votes']) || 0,
                    "Postal Votes": parseInt(candidate['Postal Votes']) || 0,
                    "Total Votes": parseInt(candidate['Total Votes']) || 0,
                    "Total Candidate": 1,
                    "Won": 0,
                    "Constituency Won list": []
                };
            }
            if (!parties.includes(candidate['Party']) && candidate['Party'] !== 'Independent' && candidate['Candidate'] !== 'NOTA') {
                parties.push(candidate['Party'])
            }

            if(candidate['Candidate'] === 'NOTA'){
                const temp_count = parseInt(candidate['Total Votes']) || 0
                NOTA_FACTS.total += temp_count;

                if(NOTA_FACTS.highest.count < temp_count) {
                    NOTA_FACTS.highest.whoWon = candidateList[0];
                    NOTA_FACTS.highest.count = temp_count
                    NOTA_FACTS.highest.constituency = constituency
                }

                if(NOTA_FACTS.lowest.count > temp_count) {
                    NOTA_FACTS.lowest.whoWon = candidateList[0];
                    NOTA_FACTS.lowest.count = temp_count
                    NOTA_FACTS.lowest.constituency = constituency
                }
            }

            /* if(candidate['Party'] == 'Independent') {
                totalIndependentCandidate++;
            } */


            if (candidate['Candidate'] !== 'NOTA') {
                TOTAL_CANDIDATE++;
            }
        });
        PARTY_WISE_DATA[candidateList[0]['Party']]['Won']++;
        PARTY_WISE_DATA[candidateList[0]['Party']]['Constituency Won list'].push(constituency);



        if (Number.isNaN(CONSTITUENCY_WISE_TOTAL_VOTES[constituency])) continue;
        TOTAL_VOTES = CONSTITUENCY_WISE_TOTAL_VOTES[constituency] + TOTAL_VOTES;
    }
}


NOTA_FACTS.percentageOfOverAllVotes =  (100 * NOTA_FACTS.total) / TOTAL_VOTES;
NOTA_FACTS.highest.percentageOfConstituencyVotes = (100 * NOTA_FACTS.highest.count) / CONSTITUENCY_WISE_TOTAL_VOTES[NOTA_FACTS.highest.constituency];
NOTA_FACTS.lowest.percentageOfConstituencyVotes = (100 * NOTA_FACTS.lowest.count) / CONSTITUENCY_WISE_TOTAL_VOTES[NOTA_FACTS.lowest.constituency];


const TOTAL_PARTY = parties.length;

const ALL_ABOUT_NOTA = { ...PARTY_WISE_DATA['None of the Above'], ...{NOTA_FACTS} };
delete PARTY_WISE_DATA['None of the Above']
const INDEPENDENT_CANDIDATE_DATA = { ...PARTY_WISE_DATA['Independent'] };
delete PARTY_WISE_DATA['Independent']

if (Object.keys(PARTY_WISE_DATA).length !== TOTAL_PARTY) {
    throw new Error('Mismatch in Party count')
}

saveData(
    {
        TOTAL_PARTY,
        TOTAL_VOTES,
        TOTAL_CANDIDATE,
        NO_OF_CONSTITUENCY,
        CONSTITUENCY_WISE_TOTAL_VOTES,
        ALL_ABOUT_NOTA,
        INDEPENDENT_CANDIDATE_DATA,
        PARTY_WISE_DATA
    }, 'statistics.json');