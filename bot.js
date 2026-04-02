import tmi from "tmi.js";
import { getElo, getToday, getRecord } from "./api.js";
import { linkAccount } from "./link.js";
import { redis } from "./redis.js";

if (process.env.NODE_ENV !== "production") {
    const dotenv = await import("dotenv");
    dotenv.config({ override: false });
}

console.log("Good morning!");

const BOT_USERNAME = process.env.BOT_USERNAME;
const OAUTH_TOKEN = process.env.OAUTH_TOKEN;

async function loadChannels() {
    const keys = await redis.keys("channels:*");
    return keys.map(k => k.replace("channels:", ""));
}

const channels = await loadChannels();

const client = new tmi.Client({
    identity: {
        username: BOT_USERNAME,
        password: OAUTH_TOKEN
    },
    channels: channels
});

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

    // Remove all zero-width / invisible Unicode characters
const sanitize = str =>
    (str || "")
        .replace(/[\u034F\u200B-\u200F\uFEFF]/g, "")
        .trim();

    const cleanMessage = sanitize(message);

    const parts = cleanMessage.split(/\s+/);

    const command = sanitize(parts[0] || "").toLowerCase();
    const ign1 = sanitize(parts[1] || "");
    const ign2 = sanitize(parts[2] || "");

    if (command === "+elo") {
        let target = tags.username;
        let result;
        const linked = await getLinkedIGN(target);

        if (!ign1) {
            if (!linked) {
                result = "Please use +link <IGN> to link account or use +elo <IGN>";
            } else {
                result = await getElo(linked);
            }
        } else {
            result = await getElo(ign1);
        }

        client.say(channel, `/me @${target} ${result}`);
    }

    if (command === "+today") {
        let target = tags.username;
        let result;
        const linked = await getLinkedIGN(target);

        if (!ign1) {
            if (!linked) {
                result = "Please use +link <IGN> to link account or use +today <IGN>";
            } else {
                result = await getToday(linked);
            }
        } else {
            result = await getToday(ign1);
        }

        client.say(channel, `/me @${target} ${result}`);
    }

    if (command === "+link") {
        let target = tags.username;
        let result;

        if (!ign1) {
            result = "Please provide an IGN, +link <IGN>";
        } else {
            result = await linkAccount(target, ign1);
            await redis.set(`userLinks:${target.toLowerCase()}`, ign1);
        }

        client.say(channel, `/me @${target} ${result}`);
    }

    if (command === "+record") {
        let result;
        const linked = await getLinkedIGN(tags.username);

        if (!ign2) {
            if (!linked) {
                result = "Please use +link <IGN> to link account or use +record <IGN1> <IGN2>";
            } else {
                result = await getRecord(linked, ign1);
            }
        } else {
            result = await getRecord(ign1, ign2);
        }

        console.log(result);

        client.say(channel, `/me @${tags.username} ${result}`);
    }

    if (command === "+join") {
        const target = tags.username.toLowerCase();
        const chanKey = `channels:${target}`;

        const exists = await redis.exists(chanKey);

        if (!exists) {
            await redis.set(chanKey, "1");
        }

        try {
            await client.join(target);
            client.say(channel, `/me @${tags.username} Joined your channel!`);
            console.log(`Joined channel: ${target}`);
        } catch (err) {
            console.error("Join error:", err);
            client.say(channel, `/me @${tags.username} Failed to join your channel.`);
        }
    }

    if (command === "+leave") {
        const target = tags.username.toLowerCase();
        const chanKey = `channels:${target}`;

        await redis.del(chanKey);

        try {
            await client.part(target);
            client.say(channel, `/me @${tags.username} Left your channel.`);
            console.log(`Left channel: ${target}`);
        } catch (err) {
            console.error("Leave error:", err);
            client.say(channel, `/me @${tags.username} Failed to leave your channel.`);
        }
    }

});