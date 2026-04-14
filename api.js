import axios from "axios";

export async function getElo(username) {
    try {
        const response = await axios.get(`https://mcsrranked.com/api/users/${username}`);
        let userData = response.data.data;
        let userStats = userData.statistics.season
        let userName = userData.nickname;
        let userElo = userData.eloRate;
        let userPeak = userData.seasonResult.highest;
        let userPlacement = userData.eloRank;
        let userMatchesPlayed = userStats.playedMatches.ranked;
        let userWins = userStats.wins.ranked;
        let userLosses = userStats.loses.ranked;
        let userDraws = userMatchesPlayed - (userWins + userLosses);
        let userCompletions = userStats.completions.ranked;
        let userWinrate = Math.round((userWins/(userMatchesPlayed - userDraws)) * 1000) / 10;
        let userPhasePoints = userData.seasonResult.last.phasePoint;
        let userRank = rankConversion(userElo);
        let userPb = timeConversion(userStats.bestTime.ranked);
        let userAverage = timeConversion(userStats.completionTime.ranked/userCompletions);

        let responseMessage = `${userName} Elo: ${userElo} (${userPeak} Peak) ❚ ${userRank} (#${userPlacement}) ❚ W/L: ${userWins}/${userLosses} (${userWinrate}%) ❚ Matches: ${userMatchesPlayed} Played ❚ Pb: ${userPb} Average: ${userAverage} ❚ Phase Points: ${userPhasePoints}`;

        return responseMessage;
    } catch (err) {
        console.error("API error:", err);
        return "Please provide a valid Minecraft IGN: +elo <IGN>";
    }
}

export async function getToday(username) {
    try {
        const response = await axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=100`);
        let responseMessage;
        const twelveHoursAgo = Math.floor((Date.now() - 43200000)/1000);
        const matchData = response.data.data;

        let pastMatches = [];

        for (let i=0; i < matchData.length; i++){
            if (matchData[i].date <= twelveHoursAgo){
                if(pastMatches.length == 0) {
                    responseMessage = "This player has not played any matches in the last 12 hours";

                    return responseMessage;
                } else {
                    break;
                }
            } else {
                pastMatches.push(matchData[i]);
            }
        }

        let matchPlayers = pastMatches[0].players;
        let totalMatches = pastMatches.length;
        let currentElo;
        let playerUuid;
        let userName;
        for (let i=0; i < matchPlayers.length; i++) {
            if ((matchPlayers[i].nickname.toLowerCase()) == (username).toLowerCase()) {
                currentElo = matchPlayers[i].eloRate;
                playerUuid = matchPlayers[i].uuid;
                userName = matchPlayers[i].nickname;
            }
        }
        let eloChange = getEloChange(pastMatches, currentElo, playerUuid);
        let { totalWins, totalLosses } = getResults(pastMatches, playerUuid);
        let gamesAverage = getAverage(pastMatches, playerUuid);
        let totalDraws = totalMatches - (totalWins + totalLosses);
        let totalWinrate = Math.round((totalWins/(totalMatches - totalDraws)) * 1000) / 10;

        responseMessage = `${userName} 12hr Ranked Stats ❚ Elo: ${currentElo} (${eloChange}) ❚ W/L: ${totalWins}/${totalLosses} (${totalWinrate}%) ❚ Average: ${gamesAverage}`;

        return responseMessage;
    } catch (err) {
        console.error("API error:", err);
        return "Please provide a valid Minecraft IGN: +today <IGN>";
    }
}

 export async function getRecord(username1, username2) {
    try {
        const response = await axios.get(`https://api.mcsrranked.com/users/${username1}/versus/${username2}`);
        let responseMessage;
        const data = response.data.data;
        const players = data.players;
        const matchData = data.results.ranked;
        let uuid1;
        let uuid2;
        let player1;
        let player2;
        if (matchData.total == 0) {
            responseMessage = `These players have no played a match this season.`
        } else {
            if(username1.toLowerCase() == players[0].nickname.toLowerCase()) {
                uuid1 = players[0].uuid;
                player1 = players[0].nickname;
                uuid2 = players[1].uuid;
                player2 = players[1].nickname;
            } else {
                uuid1 = players[1].uuid;
                player1 = players[1].nickname;
                uuid2 = players[0].uuid;
                player2 = players[0].nickname;
            }
            let player1Wins = matchData[uuid1];
            let player2Wins = matchData[uuid2];
            responseMessage = `${player1} ${player1Wins}-${player2Wins} ${player2} ❚ ${matchData.total} total games played this season.`;

            return responseMessage;
        }
    } catch (err) {
        console.error("API error:", err);
        return "Please provide a valid Minecraft IGNs: +record <IGN1> <IGN2>";
    }
 }

export async function getAverageCommand(username) {
    try {
        const [matches, userRes] = await Promise.all([
            getPlayerMatches(username),
            axios.get(`https://mcsrranked.com/api/users/${username}`)
        ]);

        const stats = userRes.data.data.statistics.season;
        const uuid = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);

        const dict = organizeMatches(matches, uuid);

        const avg = (t, c) => c > 0 ? timeConversion(t / c) : "N/A";

        const seedInfo = [
            ["v",   "Village"],
            ["rp",  "RP"],
            ["bt",  "BT"],
            ["sw",  "Ship"],
            ["dt",  "Temple"]
        ];

        const bastionInfo = [
            ["bri", "Bridge"],
            ["tre", "Treasure"],
            ["hou", "Housing"],
            ["sta", "Stables"]
        ];

        const all_avg = avg(stats.completionTime.ranked, stats.completions.ranked);

        const seedAverages = seedInfo
            .map(([p, name]) =>
                `${name}: ${avg(dict[p + "_time"], dict[p + "_matches"])}`)
            .join(" ⋮ ");

        const bastionAverages = bastionInfo
            .map(([p, name]) =>
                `${name}: ${avg(dict[p + "_time"], dict[p + "_matches"])}`)
            .join(" ⋮ ");

        return `Overall Average: ${all_avg} (${matches.length} completions) ❚ ${seedAverages} ❚ ${bastionAverages}`;

    } catch (err) {
        console.error("API error:", err);
        return "Please provide a valid Minecraft IGN: +average <IGN>";
    }
}

export async function getWinrateCommand(username) {
    try {
        const [matches, userRes] = await Promise.all([
            getPlayerMatches(username),
            axios.get(`https://mcsrranked.com/api/users/${username}`)
        ]);

        const uuid = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        const dict = organizeMatches(matches, uuid);

        const rate = (w, l) => {
            const total = w + l;
            return total > 0 ? ((w / total) * 100).toFixed(1) + "%" : "N/A";
        };

        const seedInfo = [
            ["v",   "Village"],
            ["rp",  "RP"],
            ["bt",  "BT"],
            ["sw",  "Ship"],
            ["dt",  "Temple"]
        ];

        const bastionInfo = [
            ["bri", "Bridge"],
            ["tre", "Treasure"],
            ["hou", "Housing"],
            ["sta", "Stables"]
        ];

        const seedRates = seedInfo
            .map(([p, name]) => {
                const w = dict[p + "_wins"];
                const l = dict[p + "_losses"];
                return `${name}: ${rate(w, l)}`;
            })
            .join(" ⋮ ");

        const bastionRates = bastionInfo
            .map(([p, name]) => {
                const w = dict[p + "_wins"];
                const l = dict[p + "_losses"];
                return `${name}: ${rate(w, l)}`;
            })
            .join(" ⋮ ");

        const totalWins =
            seedInfo.reduce((sum, [p]) => sum + dict[p + "_wins"], 0) +
            bastionInfo.reduce((sum, [p]) => sum + dict[p + "_wins"], 0);

        const totalLosses =
            seedInfo.reduce((sum, [p]) => sum + dict[p + "_losses"], 0) +
            bastionInfo.reduce((sum, [p]) => sum + dict[p + "_losses"], 0);

        const overall = rate(totalWins, totalLosses);

        return `Overall Winrate: ${overall} (${matches.length} matches) ❚ ${seedRates} ❚ ${bastionRates}`;

    } catch (err) {
        console.error("API error:", err);
        return "Please provide a valid Minecraft IGN: +winrate <IGN>";
    }
}

export async function getLastCommand(username, quantity) {
    try {
        const matches = await getPlayerMatches(username, quantity);

        if (!matches || matches.length === 0) {
            return `No matches found for ${username}.`;
        }

        const uuid = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);

        const dict = organizeMatches(matches, uuid);

        const avg = (t, c) => c > 0 ? timeConversion(t / c) : "N/A";
        const rate = (w, l) => {
            const total = w + l;
            return total > 0 ? ((w / total) * 100).toFixed(1) + "%" : "N/A";
        };

        const seedInfo = [
            ["v",   "Village"],
            ["rp",  "RP"],
            ["bt",  "BT"],
            ["sw",  "Ship"],
            ["dt",  "Temple"]
        ];

        const bastionInfo = [
            ["bri", "Bridge"],
            ["tre", "Treasure"],
            ["hou", "Housing"],
            ["sta", "Stables"]
        ];

        const seedStats = seedInfo.map(([p, name]) => {
            const a = avg(dict[p + "_time"], dict[p + "_matches"]);
            const w = dict[p + "_wins"];
            const l = dict[p + "_losses"];
            const r = rate(w, l);
            return `${name}: ${a} (${r})`;
        }).join(" ⋮ ");

        const bastionStats = bastionInfo.map(([p, name]) => {
            const a = avg(dict[p + "_time"], dict[p + "_matches"]);
            const w = dict[p + "_wins"];
            const l = dict[p + "_losses"];
            const r = rate(w, l);
            return `${name}: ${a} (${r})`;
        }).join(" ⋮ ");

        const totalWins =
            seedInfo.reduce((s, [p]) => s + dict[p + "_wins"], 0) +
            bastionInfo.reduce((s, [p]) => s + dict[p + "_wins"], 0);

        const totalLosses =
            seedInfo.reduce((s, [p]) => s + dict[p + "_losses"], 0) +
            bastionInfo.reduce((s, [p]) => s + dict[p + "_losses"], 0);

        const overallRate = rate(totalWins, totalLosses);

        const totalTime = seedInfo.reduce((s, [p]) => s + dict[p + "_time"], 0) +
            bastionInfo.reduce((s, [p]) => s + dict[p + "_time"], 0);

        const totalCompletions = seedInfo.reduce((s, [p]) => s + dict[p + "_matches"], 0) +
            bastionInfo.reduce((s, [p]) => s + dict[p + "_matches"], 0);

        const overallAvg = avg(totalTime, totalCompletions);

        return `Last ${matches.length} games: Overall: ${overallAvg} (${overallRate}) ❚ ${seedStats} ❚ ${bastionStats}`;

    } catch (err) {
        console.error("API error:", err);
        return "Please provide a valid Minecraft IGN: +last <IGN> <Quantity>";
    }
}

function timeConversion(time) {
    let minutes = Math.floor(time / 60000);
    let seconds = Math.floor((time  % 60000) / 1000);
    let formattedSeconds = seconds < 10 ? "0" + seconds : seconds;
    let finalTime = minutes + ":" + formattedSeconds;
    return finalTime;
}

function rankConversion(elo) {
    const ranks = [
        [400,  "Coal I"],
        [500,  "Coal II"],
        [600,  "Coal III"],
        [700,  "Iron I"],
        [800,  "Iron II"],
        [900,  "Iron III"],
        [1000, "Gold I"],
        [1100, "Gold II"],
        [1200, "Gold III"],
        [1300, "Emerald I"],
        [1400, "Emerald II"],
        [1500, "Emerald III"],
        [1650, "Diamond I"],
        [1800, "Diamond II"],
        [2000, "Diamond III"]
    ];

    for (const [limit, name] of ranks) {
        if (elo < limit) return name;
    }

    return "Netherite";
}

function getEloChange(matchList, finalElo, playerUuid) {
    let lastMatch = matchList[matchList.length-1];
    let startingElo;

    for (let i=0; i < lastMatch.changes.length; i++) {
        if(lastMatch.changes[i].uuid == playerUuid) {
            startingElo = lastMatch.changes[i].eloRate;
        }
    }
    let eloChangeResult = (finalElo - startingElo);
    let eloChangeConversion;
    if (eloChangeResult < 0) {
        eloChangeConversion = `${eloChangeResult}`;
    } else {
        eloChangeConversion = `+${eloChangeResult}`;
    }
    
    return eloChangeConversion;
}

function getResults(matchList, playerUuid) {
    let totalWins = 0;
    let totalLosses = 0;
    let draws = 0;
    for (let i=0; i < matchList.length; i++) {
        if (matchList[i].result.uuid == playerUuid) {
            totalWins++;
        } else if (matchList[i].result.uuid == null) {
            draws++;
        } else {
            totalLosses++;
        }
    }
    return { totalWins, totalLosses };
}

function getAverage(matchList, playerUuid) {
    let times = 0;
    let games = 0;

    for (let i = 0; i < matchList.length; i++) {
        if (matchList[i].result.uuid == playerUuid){
            if (matchList[i].forfeited == false) {
                times = times + matchList[i].result.time;
                games++;
            }
        }
    }

    let averageConverted = timeConversion(times/games);
    return averageConverted;
}

async function getPlayerMatches(username, quantity = null) {
    let totalMatches;

    if (quantity == null) {
        const userRes = await axios.get(`https://mcsrranked.com/api/users/${username}`);
        totalMatches = userRes.data.data.statistics.season.playedMatches.ranked;
    } else {
        totalMatches = quantity;
    }

    const matchesList = [];
    let before = null;

    while (matchesList.length < totalMatches) {
        const url = before
            ? `https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&before=${before}&excludedecay=true`
            : `https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&excludedecay=true`;

        const res = await axios.get(url);
        const batch = res.data.data;

        if (!batch || batch.length === 0) break;

        for (const m of batch) {
            matchesList.push({
                id: m.id,
                seedType: m.seedType,
                bastionType: m.bastionType,
                forfeited: m.forfeited,
                result: {
                    uuid: m.result.uuid,
                    time: m.result.time
                }
            });

            if (matchesList.length >= totalMatches) break;
        }

        before = batch[batch.length - 1].id;

        if (batch.length < 100) break;
    }

    return matchesList;
}

function organizeMatches(matches, uuid) {
    const seedMap = {
        DESERT_TEMPLE: "dt",
        BURIED_TREASURE: "bt",
        RUINED_PORTAL: "rp",
        VILLAGE: "v",
        SHIPWRECK: "sw"
    };

    const bastionMap = {
        TREASURE: "tre",
        STABLES: "sta",
        BRIDGE: "bri",
        HOUSING: "hou"
    };

    const prefixes = ["dt","bt","rp","v","sw","tre","sta","bri","hou"];
    const dict = {};

    for (const p of prefixes) {
        dict[p + "_time"] = 0;
        dict[p + "_matches"] = 0;
        dict[p + "_wins"] = 0;
        dict[p + "_losses"] = 0;
        dict[p + "_draws"] = 0;
    }

    for (const match of matches) {
        const seedPrefix = seedMap[match.seedType];
        const bastionPrefix = bastionMap[match.bastionType];

        const isWin = match.result.uuid === uuid;
        const isDraw = match.result.uuid === null;
        const outcome = isWin ? "wins" : isDraw ? "draws" : "losses";

        if (seedPrefix) dict[seedPrefix + "_" + outcome]++;
        if (bastionPrefix) dict[bastionPrefix + "_" + outcome]++;

        if (isWin && !match.forfeited) {
            const t = match.result.time;
            if (seedPrefix) {
                dict[seedPrefix + "_time"] += t;
                dict[seedPrefix + "_matches"]++;
            }
            if (bastionPrefix) {
                dict[bastionPrefix + "_time"] += t;
                dict[bastionPrefix + "_matches"]++;
            }
        }
    }

    return dict;
}