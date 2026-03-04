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

        let responseMessage = `${userName} Elo: ${userElo} (${userPeak} Peak) | ${userRank} (${userPlacement}) | W/L: ${userWins}/${userLosses} (${userWinrate}%) | Matches: ${userMatchesPlayed} Played | Pb: ${userPb} Average: ${userAverage} | Phase Points: ${userPhasePoints}`;

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
        const response = await axios.get(`https://mcsrranked.com/api/users/${username}`);
        let userData = response.data.data;
        let userStats = userData.statistics.season
        

        return responseMessage;
    } catch (err) {
        console.error("API error:");
        const errMessage = "Please provide a valid Minecraft username: !today <IGN>";
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