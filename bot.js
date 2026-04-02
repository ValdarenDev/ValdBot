import tmi from "tmi.js";
import dotenv from "dotenv";
import { getElo, getToday, getRecord } from "./api.js";
import { linkAccount } from "./link.js";
import { redis } from "./redis.js";

dotenv.config();

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

    const parts = message.trim().split(/\s+/); // collapse multiple spaces
    const command = parts[0].toLowerCase();
    const ign1 = parts[1] || null;
    const ign2 = parts[2] || null;

    if (command === "+elo") {
        let result;
        const linked = await getLinkedIGN(tags.username);

        if (!ign1) {
            if (!linked) {
                result = "Please use +link <IGN> to link account or use +elo <IGN>";
            } else {
                result = await getElo(linked);
            }
        } else {
            result = await getElo(ign1);
        }

        client.say(channel, `/me @${tags.username} ${result}`);
    }

    if (command === "+today") {
        let result;
        const linked = await getLinkedIGN(tags.username);

        if (!ign1) {
            if (!linked) {
                result = "Please use +link <IGN> to link account or use +today <IGN>";
            } else {
                result = await getToday(linked);
            }
        } else {
            result = await getToday(ign1);
        }

        client.say(channel, `/me @${tags.username} ${result}`);
    }

    if (command === "+link") {
        let result;

        if (!ign1) {
            result = "Please provide an IGN, +link <IGN>";
        } else {
            result = await linkAccount(tags.username, ign1);
            await redis.set(`userLinks:${tags.username.toLowerCase()}`, ign1);
        }

        client.say(channel, `/me @${tags.username} ${result}`);
    }

    if (command === "+record") {
        let result;
        const linked = await getLinkedIGN(tags.username);

        if (!ign2) {
            if (!linked) {
                result = "Please use +link <IGN> to link account or use +record <IGN1> <IGN2>";
            } else {
                result = await getRecord(linked, ign2);
            }
        } else {
            result = await getRecord(ign1, ign2);
        }

        client.say(channel, `/me @${tags.username} ${result}`);
    }
});