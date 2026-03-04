// ===============================
// Twitch ChatBot Base Template
// ===============================

// Install dependencies first:
// npm install tmi.js axios dotenv

import tmi from "tmi.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// ===============================
// OAuth Token Generation (App Access Token)
// ===============================
// Replace these with your actual credentials
const CLIENT_ID = "YOUR_CLIENT_ID_HERE";
const CLIENT_SECRET = "YOUR_CLIENT_SECRET_HERE";

// This function fetches an App Access Token from Twitch
async function getAppToken() {
    const url = "https://id.twitch.tv/oauth2/token";

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "client_credentials"
    });

    const response = await axios.post(url, params);
    return response.data.access_token;
}

// ===============================
// Twitch Chat Client Setup
// ===============================

// Replace with your bot's username and the channel you want to join
const BOT_USERNAME = "your_bot_username";
const CHANNEL_NAME = "channel_to_join";

// You will replace this with a real OAuth token later
let oauthToken = null;

// Connect to Twitch IRC
async function startBot() {
    oauthToken = await getAppToken();

    const client = new tmi.Client({
        identity: {
            username: BOT_USERNAME,
            password: `oauth:${oauthToken}`
        },
        channels: [CHANNEL_NAME]
    });

    client.connect();

    // ===============================
    // Message Listener
    // ===============================
    client.on("message", (channel, tags, message, self) => {
        if (self) return;

        const text = message.trim().toLowerCase();

        if (text === "!hello") {
            client.say(channel, `Hello @${tags.username}!`);
        }
    });

    console.log("Bot is running...");
}

startBot();