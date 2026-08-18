import tmi from "tmi.js";
import { getElo, getToday, getRecord, getAverageCommand, getWinrateCommand, getLastCommand, getForfeitCommand } from "./api.js";
import { linkAccount } from "./link.js";
import { redis } from "./redis.js";
import { refreshAccessToken } from "./twitchAuth.js";

// Local Testing
// if (process.env.NODE_ENV !== "production") {
//     const dotenv = await import("dotenv");
//     dotenv.config({ override: false });
// }

console.log("Good morning!");

const BOT_USERNAME = process.env.BOT_USERNAME;

async function loadChannels() {
    const keys = await redis.keys("channels:*");
    return keys.map(k => k.replace("channels:", ""));
}

const channels = await loadChannels();

// Local Testing
// const channels = ["valdaren"];

// Get a fresh access token before connecting instead of relying on a
// hardcoded OAUTH_TOKEN that eventually expires.
let initialToken, initialExpiresIn;
try {
    ({ accessToken: initialToken, expiresIn: initialExpiresIn } = await refreshAccessToken());
} catch (err) {
    console.error("Initial Twitch token refresh failed:", err.response?.data ?? err.message);
    process.exit(1);
}

const client = new tmi.Client({
    identity: {
        username: BOT_USERNAME,
        password: `oauth:${initialToken}`
    },
    channels: channels
});

// Proactively refresh the token before it expires and reconnect with the
// new one. Twitch access tokens from this flow last a few hours, so
// refresh a bit early to be safe.
function scheduleTokenRefresh(expiresIn) {
    const refreshInMs = Math.max((expiresIn - 300) * 1000, 60_000); // 5 min buffer, min 1 min
    setTimeout(async () => {
        try {
            const { accessToken, expiresIn: nextExpiresIn } = await refreshAccessToken();
            client.opts.identity.password = `oauth:${accessToken}`;
            await client.disconnect();
            await client.connect();
            console.log("Reconnected with refreshed Twitch token");
            scheduleTokenRefresh(nextExpiresIn);
        } catch (err) {
            console.error("Token refresh failed, retrying in 5 minutes:", err.response?.data ?? err.message);
            setTimeout(() => scheduleTokenRefresh(0), 5 * 60_000);
        }
    }, refreshInMs);
}

scheduleTokenRefresh(initialExpiresIn);

client.on("join", (chan, username) => {
    if (username.toLowerCase() === BOT_USERNAME.toLowerCase()) {
        console.log("Bot joined:", chan);
    }
});

client.connect().catch(console.error);

client.on("connected", () => {
    console.log(`Bot connected as ${BOT_USERNAME}`);
});

async function getLinkedIGN(username) {
    return await redis.get(`userLinks:${username.toLowerCase()}`);
}

client.on("message", async (channel, tags, message, self) => {
    if (self) return;

    const sanitize = str =>
        (str || "")
            .replace(/[\u034F\u200B-\u200F\uFEFF]/g, "")
            .trim();

    const cleanMessage = sanitize(message);
    const parts = cleanMessage.split(/\s+/);
    const rawCommand = sanitize(parts[0] || "").toLowerCase();

    // --- Determine mode and normalize command name ---
    // Modes:
    //   "normal"   → +<cmd> [IGN]      caller's linked IGN or explicit IGN arg
    //   "mention"  → +<cmd> @<user>    mentioned user's linked IGN
    //   "streamer" → #<cmd>            streamer's linked IGN (no IGN arg accepted)

    let mode, cmdName;

    if (rawCommand.startsWith("#")) {
        mode = "streamer";
        cmdName = rawCommand.slice(1);
    } else if (rawCommand.startsWith("+")) {
        cmdName = rawCommand.slice(1);
        if (parts[1] && sanitize(parts[1]).startsWith("@")) {
            mode = "mention";
        } else {
            mode = "normal";
        }
    } else {
        return; // not a bot command
    }

    // Shift args: in mention mode parts[1] is the @user, so real args start at parts[2]
    const argOffset = mode === "mention" ? 2 : 1;

    // Extract season:<n> from anywhere in the remaining tokens, then remove it
    const remainingParts = parts.slice(argOffset);
    let season = null;
    const filteredParts = remainingParts.filter(p => {
        const match = sanitize(p).toLowerCase().match(/^season:(\d+)$/);
        if (match) { season = parseInt(match[1], 10); return false; }
        return true;
    });

    const arg1 = sanitize(filteredParts[0] || "");
    const arg2 = sanitize(filteredParts[1] || "");

    const callerUsername = tags.username;
    const streamerUsername = channel.replace(/^#/, "");

    // resolveIGN returns { ign } on success or { error } on failure.
    async function resolveIGN(explicitIgn = null) {
        if (explicitIgn) return { ign: explicitIgn };

        if (mode === "streamer") {
            const ign = await getLinkedIGN(streamerUsername);
            if (!ign) return { error: `${streamerUsername} does not have a linked account` };
            return { ign };
        }

        if (mode === "mention") {
            const mentionedUser = sanitize(parts[1]).replace(/^@/, "").toLowerCase();
            const ign = await getLinkedIGN(mentionedUser);
            if (!ign) return { error: `@${mentionedUser} does not have a linked account` };
            return { ign };
        }

        // normal — caller's own linked IGN
        const ign = await getLinkedIGN(callerUsername);
        if (!ign) return { error: `Please use +link <IGN> to link your account` };
        return { ign };
    }

    // -------------------------------------------------------
    // Commands
    // -------------------------------------------------------

    if (cmdName === "elo") {
        const { ign, error } = await resolveIGN(mode === "normal" && arg1 ? arg1 : null);
        const result = error ?? await getElo(ign, season);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "today") {
        const { ign, error } = await resolveIGN(mode === "normal" && arg1 ? arg1 : null);
        const result = error ?? await getToday(ign);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "link") {
        let result;
        if (!arg1) {
            result = "Please provide an IGN: +link <IGN>";
        } else {
            result = await linkAccount(callerUsername, arg1);
        }
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "record") {
        let result;

        if (mode === "normal" && arg1 && arg2) {
            const resolveArg = async (arg) => {
                if (arg.startsWith("@")) {
                    const user = arg.replace(/^@/, "").toLowerCase();
                    const ign = await getLinkedIGN(user);
                    if (!ign) return { error: `@${user} does not have a linked account` };
                    return { ign };
                }
                return { ign: arg };
            };

            const [r1, r2] = await Promise.all([resolveArg(arg1), resolveArg(arg2)]);
            if (r1.error) { client.say(channel, `/me @${callerUsername} ${r1.error}`); return; }
            if (r2.error) { client.say(channel, `/me @${callerUsername} ${r2.error}`); return; }
            result = await getRecord(r1.ign, r2.ign, season);
        } else {
            let opponentIgn;
            if (arg1 && arg1.startsWith("@")) {
                const user = arg1.replace(/^@/, "").toLowerCase();
                const ign = await getLinkedIGN(user);
                if (!ign) {
                    client.say(channel, `/me @${callerUsername} @${user} does not have a linked account`);
                    return;
                }
                opponentIgn = ign;
            } else {
                opponentIgn = arg1;
            }

            const { ign, error } = await resolveIGN(null);
            if (error) {
                client.say(channel, `/me @${callerUsername} ${error} — or use +record <IGN1> <IGN2>`);
                return;
            }
            result = await getRecord(ign, opponentIgn, season);
        }

        console.log(result);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "average") {
        const { ign, error } = await resolveIGN(mode === "normal" && arg1 ? arg1 : null);
        const result = error ?? await getAverageCommand(ign, season);
        console.log(result);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "winrate") {
        const { ign, error } = await resolveIGN(mode === "normal" && arg1 ? arg1 : null);
        const result = error ?? await getWinrateCommand(ign, season);
        console.log(result);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "ff") {
        const { ign, error } = await resolveIGN(mode === "normal" && arg1 ? arg1 : null);
        const result = error ?? await getForfeitCommand(ign, season);
        console.log(result);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "last") {
        let ign = null;
        let quantity = null;

        if (mode === "normal") {
            if (arg1 && !Number.isInteger(Number(arg1))) {
                ign = arg1;
                quantity = arg2 ? Number(arg2) : null;
            } else {
                quantity = arg1 ? Number(arg1) : null;
            }
        } else {
            quantity = arg1 ? Number(arg1) : null;
        }

        if (!quantity || !Number.isInteger(quantity) || quantity <= 0) {
            const msg = quantity <= 0
                ? "Need to provide a quantity greater than 0"
                : "Please provide a quantity: +last [IGN] <Quantity>";
            client.say(channel, `/me @${callerUsername} ${msg}`);
            return;
        }

        const { ign: resolvedIgn, error } = await resolveIGN(ign);
        const result = error ?? await getLastCommand(resolvedIgn, quantity, season);
        client.say(channel, `/me @${callerUsername} ${result}`);
    }

    else if (cmdName === "join") {
        const target = callerUsername.toLowerCase();
        const chanKey = `channels:${target}`;
        await redis.set(chanKey, "1");
        try {
            await client.join(target);
            client.say(channel, `/me @${callerUsername} Joined your channel!`);
            console.log(`Joined channel: ${target}`);
        } catch (err) {
            console.error("Join error:", err);
            client.say(channel, `/me @${callerUsername} Failed to join your channel.`);
        }
    }

    else if (cmdName === "leave") {
        const target = callerUsername.toLowerCase();
        const chanKey = `channels:${target}`;
        await redis.del(chanKey);
        try {
            await client.part(target);
            client.say(channel, `/me @${callerUsername} Left your channel.`);
            console.log(`Left channel: ${target}`);
        } catch (err) {
            console.error("Leave error:", err);
            client.say(channel, `/me @${callerUsername} Failed to leave your channel.`);
        }
    }

    else if (cmdName === "docs") {
        client.say(channel, `/me @${callerUsername} Here are the ValdBot docs: https://valdbot-docs.vercel.app`);
    }

});