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
        let userCompletions = userStats.completions.ranked;
        let userWinrate = Math.round((userWins/userMatchesPlayed) * 1000) / 10;
        let userPhasePoints = userData.seasonResult.last.phasePoint;
        let userRank = rankConversion(userElo);
        let userPb = timeConversion(userStats.bestTime.ranked);
        let userAverage = timeConversion(userStats.completionTime.ranked/userCompletions);

        let responseMessage = `${userName} Elo: ${userElo} (${userPeak} Peak) | ${userRank} (#${userPlacement}) | W/L: ${userWins}/${userLosses} (${userWinrate}%) | Matches: ${userMatchesPlayed} Played | Pb: ${userPb} Average: ${userAverage} | Phase Points: ${userPhasePoints}`;

        console.log("Successful");
        return responseMessage;
    } catch (err) {
        console.error("API error:");
        console.log(err);
        const errMessage = "Please provide a valid Minecraft username: !elo <IGN>";
        return errMessage;
    }
}

export async function getToday(username) {
    try {
        const response = await axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=50`);
        let responseMessage;
        const twelveHoursAgo = Math.floor((Date.now() - 43200000)/1000);
        const matchData = response.data.data;

        let pastMatches = [];

        for (let i=0; i < matchData.length; i++){
            if (matchData[i].date <= twelveHoursAgo){
                if(pastMatches.length == 0) {
                    responseMessage = "This player has not played any matches in the last 12 hours";
                    break;
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
        let playerUuid
        for (let i=0; i < matchPlayers.length; i++) {
            if (matchPlayers[i].nickname == `${username}`) {
                currentElo = matchPlayers[i].eloRate;
                playerUuid = matchPlayers[i].uuid
            }
        }
        let eloChange = getEloChange(pastMatches, currentElo, playerUuid);
        let { totalWins, totalLosses } = getResults(pastMatches, playerUuid);
        let gamesAverage = getAverage(pastMatches, playerUuid);
        let totalWinrate = Math.round((totalWins/totalMatches) * 1000) / 10;

        responseMessage = `${username} 12hr Ranked Stats | Elo: ${currentElo} (${eloChange}) | W/L: ${totalWins}/${totalLosses} (${totalWinrate}%) | Average: ${gamesAverage}`;

        console.log("Successful");
        return responseMessage;
    } catch (err) {
        console.error("API error:");
        console.log(err);
        const errMessage = "Please provide a valid Minecraft username: !elo <IGN>";
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