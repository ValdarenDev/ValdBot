import { redis } from "./redis.js";

export async function linkAccount(usernameInput, ignInput) {
    const username = usernameInput.toLowerCase();
    const ign = ignInput.toLowerCase();

    await redis.set(`userLinks:${username}`, ign);

    return `Account was successfully linked to ${ign}!`;
}