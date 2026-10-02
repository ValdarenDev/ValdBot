import axios from "axios";

// -------------------------------------------------------
// Error Handling
// -------------------------------------------------------

function classifyError(err, context = {}) {
    const status = err?.response?.status;
    const url = err?.config?.url ?? "";

    // Mojang API errors
    if (url.includes("mojang.com")) {
        if (status === 404) {
            const name = context.failedName ?? "That username";
            return `${name} is not a valid Minecraft username`;
        }
        return "Could not reach Mojang API, please try again";
    }

    // MCSR Ranked API errors
    if (status === 404) {
        const name = context.username ?? "That player";
        return `${name} was not found on MCSR Ranked`;
    }
    if (status === 429) return "Rate limited, please try again in a moment";
    if (status === 502 || status === 503) return "MCSR Ranked API is currently down";

    return "Something went wrong, please try again";
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function timeConversion(time) {
    if (!time || isNaN(time)) return "N/A";
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    const formattedSeconds = seconds < 10 ? "0" + seconds : seconds;
    return `${minutes}:${formattedSeconds}`;
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
    const lastMatch = matchList[matchList.length - 1];
    let startingElo;
    for (const change of lastMatch.changes) {
        if (change.uuid === playerUuid) {
            startingElo = change.eloRate;
        }
    }
    const delta = finalElo - startingElo;
    return delta < 0 ? `${delta}` : `+${delta}`;
}

function getResults(matchList, playerUuid) {
    let totalWins = 0;
    let totalLosses = 0;
    let draws = 0;
    for (const match of matchList) {
        // Some matches come back with result: null — treat them as having no winner
        const winner = match.result?.uuid ?? null;
        if (winner === playerUuid) totalWins++;
        else if (winner === null) draws++;
        else totalLosses++;
    }
    return { totalWins, totalLosses };
}

function getAverage(matchList, playerUuid) {
    let times = 0;
    let games = 0;
    for (const match of matchList) {
        if (match.result?.uuid === playerUuid && !match.forfeited) {
            times += match.result.time;
            games++;
        }
    }
    return timeConversion(times / games);
}

const SEED_INFO = [
    ["v",   "Village"],
    ["rp",  "RP"],
    ["bt",  "BT"],
    ["sw",  "Ship"],
    ["dt",  "Temple"]
];

const BASTION_INFO = [
    ["bri", "Bridge"],
    ["tre", "Treasure"],
    ["hou", "Housing"],
    ["sta", "Stables"]
];

const avg = (t, c) => c > 0 ? timeConversion(t / c) : "N/A";
const rate = (w, l) => (w + l) > 0 ? ((w / (w + l)) * 100).toFixed(1) + "%" : "N/A";

// -------------------------------------------------------
// Season Handling
// -------------------------------------------------------

// Value bot.js passes as `season` when the user types "alltime" (any casing).
// `season` is therefore one of: null (current season), a number, or ALL_TIME.
export const ALL_TIME = "alltime";
const isAllTime = season => season === ALL_TIME;

// Returns the seasons a player has played, sorted oldest → newest.
// seasonResults is an object keyed by season number and skips seasons the
// player didn't play (e.g. { "1": {...}, "2": {...}, "4": {...} }), so the
// keys are used directly instead of counting entries and looping 1..count.
async function getPlayedSeasons(username) {
    const res = await axios.get(`https://api.mcsrranked.com/users/${username}/seasons`);
    const seasonResults = res.data.data.seasonResults ?? {};
    const seasons = Object.keys(seasonResults)
        .map(Number)
        .filter(Number.isInteger)
        .sort((a, b) => a - b);
    return { seasons, seasonResults };
}

// Runs fetchFn once per season (in parallel) and returns [{ season, data }, ...]
// in the same order as `seasons`.
async function fetchEachSeason(seasons, fetchFn) {
    const results = await Promise.all(seasons.map(s => fetchFn(s)));
    return seasons.map((season, i) => ({ season, data: results[i] }));
}

// Fetches and stores the /users/{username}?season=<n> profile for every season played.
async function getAllSeasonProfiles(username) {
    const { seasons, seasonResults } = await getPlayedSeasons(username);
    const profiles = await fetchEachSeason(seasons, s =>
        axios.get(`https://mcsrranked.com/api/users/${username}?season=${s}`).then(r => r.data.data)
    );
    return { seasons, seasonResults, profiles };
}

// Sums a ranked season stat (e.g. "wins", "forfeits") across every stored season profile.
function sumRankedStat(profiles, key) {
    return profiles.reduce((sum, { data }) => sum + (data.statistics.season[key]?.ranked ?? 0), 0);
}

function bracketSeasonLabel(season) {
    if (season === null) return "";
    return isAllTime(season) ? " [All-Time]" : ` [Season ${season}]`;
}

function noMatchesMessage(username, season) {
    if (season === null) return `${username} has no ranked matches this season`;
    if (isAllTime(season)) return `No ranked matches found for ${username}`;
    return `No matches found for ${username} in season ${season}`;
}

// -------------------------------------------------------
// Match Fetching & Organization
// -------------------------------------------------------

async function getPlayerMatches(username, quantity = null, season = null) {
    if (isAllTime(season)) return getAllTimeMatches(username, quantity);

    let totalMatches;

    if (quantity == null) {
        if (season === null) {
            const userRes = await axios.get(`https://mcsrranked.com/api/users/${username}`);
            totalMatches = userRes.data.data.statistics.season.playedMatches.ranked;
        } else {
            totalMatches = Infinity;
        }
    } else {
        totalMatches = quantity;
    }

    const seasonSuffix = season !== null ? `&season=${season}` : "";
    const matchesList = [];
    let before = null;

    while (matchesList.length < totalMatches) {
        const url = before
            ? `https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&before=${before}&excludeDecay=true${seasonSuffix}`
            : `https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&excludeDecay=true${seasonSuffix}`;

        const res = await axios.get(url);
        const batch = res.data.data;

        if (!batch || batch.length === 0) break;

        for (const m of batch) {
            // Some matches (seen in older seasons) come back with result: null even though
            // the API docs say it's always present. Treat those as having no winner and no
            // time so they're counted like a draw: not a win or loss, not in any average.
            matchesList.push({
                id: m.id,
                seedType: m.seedType,
                bastionType: m.bastionType,
                forfeited: m.forfeited,
                result: {
                    uuid: m.result?.uuid ?? null,
                    time: m.result?.time ?? null
                }
            });
            if (matchesList.length >= totalMatches) break;
        }

        before = batch[batch.length - 1].id;
        if (batch.length < 100) break;
    }

    return matchesList;
}

// Fetches matches from every season the player has played, one season at a time,
// and combines them newest → oldest (same order the API uses within a season).
async function getAllTimeMatches(username, quantity = null) {
    const { seasons } = await getPlayedSeasons(username);
    const newestFirst = [...seasons].reverse();

    if (quantity == null) {
        const perSeason = await fetchEachSeason(newestFirst, s => getPlayerMatches(username, null, s));
        return perSeason.flatMap(({ data }) => data);
    }

    // "Last N" only has to walk back through seasons until N matches are collected
    const matches = [];
    for (const s of newestFirst) {
        const batch = await getPlayerMatches(username, quantity - matches.length, s);
        matches.push(...batch);
        if (matches.length >= quantity) break;
    }
    return matches;
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

    const prefixes = ["dt", "bt", "rp", "v", "sw", "tre", "sta", "bri", "hou"];
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

// -------------------------------------------------------
// All-Time Variants
// -------------------------------------------------------

async function getEloAllTime(username) {
    const [{ seasons, seasonResults, profiles }, mojangRes] = await Promise.all([
        getAllSeasonProfiles(username),
        axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`)
    ]);

    const displayName = mojangRes.data.name;
    if (seasons.length === 0) {
        return `${displayName} has not played any ranked seasons`;
    }

    // Highest elo reached in any season
    let peakElo = null;
    let peakSeason = null;
    for (const s of seasons) {
        const highest = seasonResults[s]?.highest;
        if (highest != null && (peakElo === null || highest > peakElo)) {
            peakElo = highest;
            peakSeason = s;
        }
    }

    const matchesPlayed = sumRankedStat(profiles, "playedMatches");
    const wins = sumRankedStat(profiles, "wins");
    const losses = sumRankedStat(profiles, "loses");
    const completions = sumRankedStat(profiles, "completions");
    const completionTime = sumRankedStat(profiles, "completionTime");
    const bestTimes = profiles
        .map(({ data }) => data.statistics.season.bestTime?.ranked)
        .filter(t => t != null);

    const peakLabel = peakElo !== null
        ? `${peakElo} (${rankConversion(peakElo)}, Season ${peakSeason})`
        : "N/A";
    const pb = bestTimes.length ? timeConversion(Math.min(...bestTimes)) : "N/A";
    const average = avg(completionTime, completions);
    const seasonCount = `${seasons.length} season${seasons.length === 1 ? "" : "s"}`;

    return `${displayName} All-Time Stats ❚ Peak Elo: ${peakLabel} ❚ W/L: ${wins}/${losses} (${rate(wins, losses)}) ❚ Matches: ${matchesPlayed} Played across ${seasonCount} ❚ Pb: ${pb} Average: ${average}`;
}

async function getRecordAllTime(username1, username2) {
    const [seasons1, seasons2, res1, res2] = await Promise.all([
        getPlayedSeasons(username1),
        getPlayedSeasons(username2),
        axios.get(`https://api.mojang.com/users/profiles/minecraft/${username1}`),
        axios.get(`https://api.mojang.com/users/profiles/minecraft/${username2}`)
    ]);

    const uuid1 = res1.data.id;
    const uuid2 = res2.data.id;
    const displayName1 = res1.data.name;
    const displayName2 = res2.data.name;

    // Only seasons both players played can contain matches between them
    const sharedSeasons = seasons1.seasons.filter(s => seasons2.seasons.includes(s));
    const perSeason = await fetchEachSeason(sharedSeasons, s =>
        axios.get(`https://api.mcsrranked.com/users/${username1}/versus/${username2}?season=${s}`)
            .then(r => r.data.data.results.ranked)
    );

    let player1Wins = 0;
    let player2Wins = 0;
    let total = 0;
    for (const { data } of perSeason) {
        player1Wins += data[uuid1] ?? 0;
        player2Wins += data[uuid2] ?? 0;
        total += data.total ?? 0;
    }

    if (!total) {
        return `${displayName1} and ${displayName2} have never played each other in ranked`;
    }

    return `${displayName1} ${player1Wins}-${player2Wins} ${displayName2} ❚ ${total} total games played all-time`;
}

// -------------------------------------------------------
// Exported Commands
// -------------------------------------------------------

export async function getElo(username, season = null) {
    try {
        if (isAllTime(season)) return await getEloAllTime(username);

        const seasonParam = season !== null ? `?season=${season}` : "";
        const [response, mojangRes] = await Promise.all([
            axios.get(`https://mcsrranked.com/api/users/${username}${seasonParam}`),
            axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`)
        ]);

        const displayName = mojangRes.data.name;
        const userData = response.data.data;
        const userStats = userData.statistics.season;
        const userElo = season !== null ? userData.seasonResult.last.eloRate : userData.eloRate;
        const userPeak = userData.seasonResult.highest;
        const userPlacement = season !== null ? userData.seasonResult.last.eloRank : userData.eloRank;
        const userMatchesPlayed = userStats.playedMatches.ranked;
        const userWins = userStats.wins.ranked;
        const userLosses = userStats.loses.ranked;
        const userDraws = userMatchesPlayed - (userWins + userLosses);
        const userCompletions = userStats.completions.ranked;
        const userWinrate = Math.round((userWins / (userMatchesPlayed - userDraws)) * 1000) / 10;
        const userPhasePoints = userData.seasonResult.last.phasePoint;
        const userRank = rankConversion(userElo);
        const userPb = timeConversion(userStats.bestTime.ranked);
        const userAverage = timeConversion(userStats.completionTime.ranked / userCompletions);
        const seasonLabel = season !== null ? ` Season ${season} Stats ❚` : "";
        const phasePoints = (season === null || season >= 6) ? ` ❚ Phase Points: ${userPhasePoints}` : "";

        return `${displayName}${seasonLabel} Elo: ${userElo} (${userPeak} Peak) ❚ ${userRank} (#${userPlacement}) ❚ W/L: ${userWins}/${userLosses} (${userWinrate}%) ❚ Matches: ${userMatchesPlayed} Played ❚ Pb: ${userPb} Average: ${userAverage}${phasePoints}`;
    } catch (err) {
        console.error("getElo error:", err);
        return classifyError(err, { username });
    }
}

export async function getToday(username) {
    try {
        const [response, mojangRes] = await Promise.all([
            axios.get(`https://mcsrranked.com/api/users/${username}/matches?type=2&count=100&excludeDecay=true`),
            axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`)
        ]);

        const displayName = mojangRes.data.name;
        const twelveHoursAgo = Math.floor((Date.now() - 43200000) / 1000);
        const matchData = response.data.data;
        const pastMatches = [];

        for (const match of matchData) {
            if (match.date <= twelveHoursAgo) break;
            pastMatches.push(match);
        }

        if (pastMatches.length === 0) {
            return `${displayName} has not played any matches in the last 12 hours`;
        }

        const matchPlayers = pastMatches[0].players;
        let currentElo, playerUuid;

        for (const player of matchPlayers) {
            if (player.nickname.toLowerCase() === username.toLowerCase()) {
                currentElo = player.eloRate;
                playerUuid = player.uuid;
            }
        }

        if (!playerUuid) {
            return `Could not find ${displayName} in their recent matches`;
        }

        const eloChange = getEloChange(pastMatches, currentElo, playerUuid);
        const { totalWins, totalLosses } = getResults(pastMatches, playerUuid);
        const gamesAverage = getAverage(pastMatches, playerUuid);
        const totalMatches = pastMatches.length;
        const totalDraws = totalMatches - (totalWins + totalLosses);
        const totalWinrate = Math.round((totalWins / (totalMatches - totalDraws)) * 1000) / 10;

        return `${displayName} 12hr Ranked Stats ❚ Elo: ${currentElo} (${eloChange}) ❚ W/L: ${totalWins}/${totalLosses} (${totalWinrate}%) ❚ Average: ${gamesAverage}`;
    } catch (err) {
        console.error("getToday error:", err);
        return classifyError(err, { username });
    }
}

export async function getRecord(username1, username2, season = null) {
    try {
        if (isAllTime(season)) return await getRecordAllTime(username1, username2);

        const seasonParam = season !== null ? `?season=${season}` : "";
        const [response, res1, res2] = await Promise.all([
            axios.get(`https://api.mcsrranked.com/users/${username1}/versus/${username2}${seasonParam}`),
            axios.get(`https://api.mojang.com/users/profiles/minecraft/${username1}`),
            axios.get(`https://api.mojang.com/users/profiles/minecraft/${username2}`)
        ]);

        const uuid1 = res1.data.id;
        const uuid2 = res2.data.id;
        const displayName1 = res1.data.name;
        const displayName2 = res2.data.name;
        const matchData = response.data.data.results.ranked;
        const seasonLabel = season !== null ? ` in season ${season}` : " this season";

        if (!matchData.total) {
            return `${displayName1} and ${displayName2} have not played each other${seasonLabel}`;
        }

        const player1Wins = matchData[uuid1];
        const player2Wins = matchData[uuid2];
        return `${displayName1} ${player1Wins}-${player2Wins} ${displayName2} ❚ ${matchData.total} total games played${seasonLabel}`;
    } catch (err) {
        console.error("getRecord error:", err);
        // Try to identify which name failed the Mojang lookup
        const failedName = err?.config?.url?.includes(username2) ? username2 : username1;
        return classifyError(err, { username: username1, failedName });
    }
}

export async function getAverageCommand(username, season = null) {
    try {
        const matches = await getPlayerMatches(username, null, season);

        if (matches.length === 0) {
            return noMatchesMessage(username, season);
        }

        const [mojangRes, userRes] = await Promise.all([
            axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`),
            season === null ? axios.get(`https://mcsrranked.com/api/users/${username}`) : Promise.resolve(null)
        ]);

        const uuid = mojangRes.data.id;
        const displayName = mojangRes.data.name;
        const stats = userRes?.data.data.statistics.season ?? null;
        const dict = organizeMatches(matches, uuid);

        const all_avg = (() => {
            if (season === null) return avg(stats.completionTime.ranked, stats.completions.ranked);
            const wins = matches.filter(m => m.result.uuid === uuid && !m.forfeited);
            const total = wins.reduce((s, m) => s + m.result.time, 0);
            return avg(total, wins.length);
        })();

        const seedAverages = SEED_INFO.map(([p, name]) =>
            `${name}: ${avg(dict[p + "_time"], dict[p + "_matches"])}`
        ).join(" ⋮ ");

        const bastionAverages = BASTION_INFO.map(([p, name]) =>
            `${name}: ${avg(dict[p + "_time"], dict[p + "_matches"])}`
        ).join(" ⋮ ");

        const seasonLabel = bracketSeasonLabel(season);
        return `${displayName}${seasonLabel}'s overall average: ${all_avg} (${matches.length} completions) ❚ ${seedAverages} ❚ ${bastionAverages}`;
    } catch (err) {
        console.error("getAverageCommand error:", err);
        return classifyError(err, { username });
    }
}

export async function getWinrateCommand(username, season = null) {
    try {
        const matches = await getPlayerMatches(username, null, season);

        if (matches.length === 0) {
            return noMatchesMessage(username, season);
        }

        const mojangRes = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        const uuid = mojangRes.data.id;
        const displayName = mojangRes.data.name;
        const dict = organizeMatches(matches, uuid);

        const seedRates = SEED_INFO.map(([p, name]) =>
            `${name}: ${rate(dict[p + "_wins"], dict[p + "_losses"])}`
        ).join(" ⋮ ");

        const bastionRates = BASTION_INFO.map(([p, name]) =>
            `${name}: ${rate(dict[p + "_wins"], dict[p + "_losses"])}`
        ).join(" ⋮ ");

        const totalWins =
            SEED_INFO.reduce((s, [p]) => s + dict[p + "_wins"], 0) +
            BASTION_INFO.reduce((s, [p]) => s + dict[p + "_wins"], 0);
        const totalLosses =
            SEED_INFO.reduce((s, [p]) => s + dict[p + "_losses"], 0) +
            BASTION_INFO.reduce((s, [p]) => s + dict[p + "_losses"], 0);

        const seasonLabel = bracketSeasonLabel(season);
        return `${displayName}${seasonLabel}'s overall winrate: ${rate(totalWins, totalLosses)} (${matches.length} matches) ❚ ${seedRates} ❚ ${bastionRates}`;
    } catch (err) {
        console.error("getWinrateCommand error:", err);
        return classifyError(err, { username });
    }
}

export async function getForfeitCommand(username, season = null) {
    try {
        let displayName, forfeits, totalMatches;

        if (isAllTime(season)) {
            const [{ profiles }, mojangRes] = await Promise.all([
                getAllSeasonProfiles(username),
                axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`)
            ]);
            displayName = mojangRes.data.name;
            forfeits = sumRankedStat(profiles, "forfeits");
            totalMatches = sumRankedStat(profiles, "playedMatches");
        } else {
            const seasonParam = season !== null ? `?season=${season}` : "";
            const [response, mojangRes] = await Promise.all([
                axios.get(`https://mcsrranked.com/api/users/${username}${seasonParam}`),
                axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`)
            ]);
            displayName = mojangRes.data.name;
            const stats = response.data.data.statistics.season;
            forfeits = stats.forfeits.ranked;
            totalMatches = stats.playedMatches.ranked;
        }

        const forfeitPct = totalMatches > 0
            ? ((forfeits / totalMatches) * 100).toFixed(1)
            : "0.0";
        const timesLabel = forfeits === 1 ? "time" : "times";
        const seasonLabel = isAllTime(season)
            ? "all-time"
            : season !== null ? `in season ${season}` : "this season";

        return `${displayName} has forfeited ${forfeits} (${forfeitPct}% ff rate) ${timesLabel} ${seasonLabel}`;
    } catch (err) {
        console.error("getForfeitCommand error:", err);
        return classifyError(err, { username });
    }
}

export async function getLastCommand(username, quantity, season = null) {
    try {
        const matches = await getPlayerMatches(username, quantity, season);

        if (!matches || matches.length === 0) {
            return `No matches found for ${username}`;
        }

        const mojangRes = await axios.get(`https://api.mojang.com/users/profiles/minecraft/${username}`);
        const uuid = mojangRes.data.id;
        const displayName = mojangRes.data.name;
        const dict = organizeMatches(matches, uuid);

        const seedStats = SEED_INFO.map(([p, name]) => {
            const a = avg(dict[p + "_time"], dict[p + "_matches"]);
            const r = rate(dict[p + "_wins"], dict[p + "_losses"]);
            return `${name}: ${a} (${r})`;
        }).join(" ⋮ ");

        const bastionStats = BASTION_INFO.map(([p, name]) => {
            const a = avg(dict[p + "_time"], dict[p + "_matches"]);
            const r = rate(dict[p + "_wins"], dict[p + "_losses"]);
            return `${name}: ${a} (${r})`;
        }).join(" ⋮ ");

        const totalWins =
            SEED_INFO.reduce((s, [p]) => s + dict[p + "_wins"], 0) +
            BASTION_INFO.reduce((s, [p]) => s + dict[p + "_wins"], 0);
        const totalLosses =
            SEED_INFO.reduce((s, [p]) => s + dict[p + "_losses"], 0) +
            BASTION_INFO.reduce((s, [p]) => s + dict[p + "_losses"], 0);
        const totalTime =
            SEED_INFO.reduce((s, [p]) => s + dict[p + "_time"], 0) +
            BASTION_INFO.reduce((s, [p]) => s + dict[p + "_time"], 0);
        const totalCompletions =
            SEED_INFO.reduce((s, [p]) => s + dict[p + "_matches"], 0) +
            BASTION_INFO.reduce((s, [p]) => s + dict[p + "_matches"], 0);

        const seasonLabel = bracketSeasonLabel(season);
        return `${displayName}${seasonLabel}'s last ${matches.length} games: Overall: ${avg(totalTime, totalCompletions)} (${rate(totalWins, totalLosses)}) ❚ ${seedStats} ❚ ${bastionStats}`;
    } catch (err) {
        console.error("getLastCommand error:", err);
        return classifyError(err, { username });
    }
}