import axios from "axios";
import { redis } from "./redis.js";

const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

const REFRESH_TOKEN_KEY = "twitch:refresh_token";

// One-time seed: if Redis has no refresh token yet, fall back to .env
// (set TWITCH_REFRESH_TOKEN once after your manual auth-code exchange).
async function getStoredRefreshToken() {
    const stored = await redis.get(REFRESH_TOKEN_KEY);
    if (stored) return stored;

    const seed = process.env.TWITCH_REFRESH_TOKEN;
    if (seed) {
        await redis.set(REFRESH_TOKEN_KEY, seed);
        return seed;
    }

    throw new Error(
        "No refresh token found in Redis or TWITCH_REFRESH_TOKEN env var. " +
        "Run the one-time authorization code exchange first."
    );
}

// Exchanges the current refresh token for a new access token + refresh token,
// and persists the new refresh token (Twitch rotates it on every use).
export async function refreshAccessToken() {
    const refreshToken = await getStoredRefreshToken();

    const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
        params: {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken
        }
    });

    const { access_token, refresh_token, expires_in } = res.data;

    // Twitch issues a new refresh token each time — the old one becomes invalid.
    await redis.set(REFRESH_TOKEN_KEY, refresh_token);

    console.log(`Twitch token refreshed, expires in ${expires_in}s`);

    return {
        accessToken: access_token,
        expiresIn: expires_in
    };
}