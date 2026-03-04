import tmi from "tmi.js";
import dotenv from "dotenv";
import { getElo } from "./api.js";

dotenv.config();

const BOT_USERNAME = process.env.BOT_USERNAME;
const CHANNEL_NAME = process.env.CHANNEL_NAME;
const OAUTH_TOKEN = process.env.OAUTH_TOKEN;

const client = new tmi.Client({
    identity: {
        username: BOT_USERNAME,
        password: OAUTH_TOKEN
    },
    channels: [CHANNEL_NAME]
});

client.connect().catch(console.error);

client.on("connected", () => {
    console.log(`Bot connected as ${BOT_USERNAME}`);
});

client.on("message", async (channel, tags, message, self) => {
    if (self) return;

    const parts = message.trim().split(" ");
    const command = parts[0].toLowerCase();
    const arg = parts[1];


    if (command === "!elo" || command === "+elo") {
        const result = await getElo(arg);

        client.say(channel, `/me @${tags.username} ${result}`);
    }

});