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

        let responseMessage = `${userName} Elo: ${userElo} (${userPeak} Peak) | ${userRank} (#${userPlacement}) | W/L: ${userWins}/${userLosses} (${userWinrate}%) | Matches: ${userMatchesPlayed} Played | Pb: ${userPb} Average: ${userAverage} | Phase Points: ${userPhasePoints}`;

        return responseMessage;
    } catch (err) {
        console.error("API error:");
        console.log(err);
        const errMessage = "Please provide a valid Minecraft username: +elo <IGN>";
        return errMessage;
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

        responseMessage = `${userName} 12hr Ranked Stats | Elo: ${currentElo} (${eloChange}) | W/L: ${totalWins}/${totalLosses} (${totalWinrate}%) | Average: ${gamesAverage}`;

        return responseMessage;
    } catch (err) {
        console.error("API error:");
        console.log(err);
        const errMessage = "Please provide a valid Minecraft username: +today <IGN>";
        return errMessage;
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
            responseMessage = `${player1} ${player1Wins}-${player2Wins} ${player2} | ${matchData.total} total games played this season.`;

            return responseMessage;
        }
    } catch (err) {
        console.error("API error:");
        const errMessage = "Please provide a valid Minecraft IGNs: +record <IGN1> <IGN2>";
        return errMessage;
    }
 }

 export async function getAverageCommand(username) {
    try {
        const allMatches = await getPlayerMatches(username);
        const res1 = await axios.get(`https://mcsrranked.com/api/users/${username}`)
        const res2 = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        let allTime = res1.data.data.statistics.season.completionTime.ranked;
        let allCompletions = res1.data.data.statistics.season.completions.ranked;
        let uuid = res2.data.id;
        let matchTimeDict = organizeMatches(allMatches, uuid);

        let all_avg = timeConversion(allTime/allCompletions);
        let dt_avg = timeConversion(matchTimeDict["dt_time"]/matchTimeDict["dt_matches"]);
        let bt_avg = timeConversion(matchTimeDict["bt_time"]/matchTimeDict["bt_matches"]);
        let rp_avg = timeConversion(matchTimeDict["rp_time"]/matchTimeDict["rp_matches"]);
        let v_avg = timeConversion(matchTimeDict["v_time"]/matchTimeDict["v_matches"]);
        let sw_avg = timeConversion(matchTimeDict["sw_time"]/matchTimeDict["sw_matches"]);
        let tre_avg = timeConversion(matchTimeDict["tre_time"]/matchTimeDict["tre_matches"]);
        let sta_avg = timeConversion(matchTimeDict["sta_time"]/matchTimeDict["sta_matches"]);
        let bri_avg = timeConversion(matchTimeDict["bri_time"]/matchTimeDict["bri_matches"]);
        let hou_avg = timeConversion(matchTimeDict["hou_time"]/matchTimeDict["hou_matches"]);

        let responseMessage = `Overall Average: ${all_avg} (${allMatches.length} completions) | Village: ${v_avg} ◊ RP: ${rp_avg} ◊ BT: ${bt_avg} ◊ Ship: ${sw_avg} ◊ Temple: ${dt_avg} | Bridge: ${bri_avg} ◊ Treasure: ${tre_avg} ◊ Housing: ${hou_avg} ◊ Stables: ${sta_avg}`;

        return responseMessage;
        
    } catch (err) {
        console.error("API error:");
        const errMessage = "Please provide a valid Minecraft IGNs: +average <IGN>";
        return errMessage;
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
    let rank;
    if (elo < 400) {
        rank = "Coal I";
    } else if (elo < 500) {
        rank = "Coal II";
    } else if (elo < 600) {
        rank = "Coal III";
    } else if (elo < 700) {
        rank = "Iron I";
    } else if (elo < 800) {
        rank = "Iron II";
    } else if (elo < 900) {
        rank = "Iron III";
    } else if (elo < 1000) {
        rank = "Gold I";
    } else if (elo < 1100) {
        rank = "Gold II";
    } else if (elo < 1200) {
        rank = "Gold III";
    } else if (elo < 1300) {
        rank = "Emerald I";
    } else if (elo < 1400) {
        rank = "Emerald II";
    } else if (elo < 1500) {
        rank = "Emerald III";
    } else if (elo < 1650) {
        rank = "Diamond I";
    } else if (elo < 1800) {
        rank = "Diamond II";
    } else if (elo < 2000) {
        rank = "Diamond III";
    } else {
        rank = "Netherite";
    }
    return rank;
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

async function getPlayerMatches(username) {
    const response1 = await axios.get(`https://mcsrranked.com/api/users/${username}`);
    let totalMatches = response1.data.data.statistics.season.playedMatches.ranked;
    let matchesLeft = totalMatches;
    let matchesList = [];
    let lastMatch = 0;

    if (totalMatches > 100) {
        let response;
        while (matchesLeft > 100){
            if (lastMatch == 0) {
                response = await axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&excludedecay=true`);
            } else {
                response = await axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&before=${lastMatch}&excludedecay=true`);
            }

            let matches = response.data.data;
            for (let i=0; i < 100; i++){
                matchesList.push(matches[i]);
                if (i === 98) lastMatch = matches[i].id;
            }
            matchesLeft -= 100;
        }
        response = await axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&before=${lastMatch}&excludedecay=true`);
        let matches = response.data.data;
        for (let i=0; i < matchesLeft; i++){
            if (matches[i] == null) {
                break;
            } else {
                matchesList.push(matches[i]);
            }
        }
        matchesLeft -= matchesLeft;
    } else {
        const response = await axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=${totalMatches}&excludedecay=true`);
        let matches = response.data.data;
        for (let i=0; i < totalMatches; i++){
            matchesList.push(matches[i]);
        }
    }

    return matchesList;

}

function organizeMatches(matches, uuid) {

    const dict = {
        "dt_time": 0,
        "dt_matches": 0,
        "bt_time": 0,
        "bt_matches": 0,
        "rp_time": 0,
        "rp_matches": 0,
        "v_time": 0,
        "v_matches": 0,
        "sw_time": 0,
        "sw_matches": 0,
        "tre_time": 0,
        "tre_matches": 0,
        "sta_time": 0,
        "sta_matches": 0,
        "bri_time": 0,
        "bri_matches": 0,
        "hou_time": 0,
        "hou_matches": 0
    };

    for (let i = 0; i < matches.length; i++) {
        if(matches[i].result.uuid == uuid && matches[i].forfeited == false){
            let matchTime = matches[i].result.time;
            switch(matches[i].seedType){
                case "DESERT_TEMPLE":
                    dict["dt_time"] = dict["dt_time"] + matchTime;
                    dict["dt_matches"] = dict["dt_matches"] + 1;
                    break;
                case "BURIED_TREASURE":
                    dict["bt_time"] = dict["bt_time"] + matchTime;
                    dict["bt_matches"] = dict["bt_matches"] + 1;
                    break;
                case "RUINED_PORTAL":
                    dict["rp_time"] = dict["rp_time"] + matchTime;
                    dict["rp_matches"] = dict["rp_matches"] + 1;
                    break;
                case "VILLAGE":
                    dict["v_time"] = dict["v_time"] + matchTime;
                    dict["v_matches"] = dict["v_matches"] + 1;
                    break;
                case "SHIPWRECK":
                    dict["sw_time"] = dict["sw_time"] + matchTime;
                    dict["sw_matches"] = dict["sw_matches"] + 1;
                    break;
            };
            
            switch(matches[i].bastionType){
                case "TREASURE":
                    dict["tre_time"] = dict["tre_time"] + matchTime;
                    dict["tre_matches"] = dict["tre_matches"] + 1;
                    break;
                case "STABLES":
                    dict["sta_time"] = dict["sta_time"] + matchTime;
                    dict["sta_matches"] = dict["sta_matches"] + 1;
                    break;
                case "BRIDGE":
                    dict["bri_time"] = dict["bri_time"] + matchTime;
                    dict["bri_matches"] = dict["bri_matches"] + 1;
                    break;
                case "HOUSING":
                    dict["hou_time"] = dict["hou_time"] + matchTime;
                    dict["hou_matches"] = dict["hou_matches"] + 1;
                    break;
            };
        } 
    }

    return dict;

}