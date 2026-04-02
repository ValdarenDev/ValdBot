import { Redis } from "@upstash/redis";

if (process.env.NODE_ENV !== "production") {
    const dotenv = await import("dotenv");
    dotenv.config({ override: false });
}

console.log("UPSTASH_REDIS_REST_URL =", JSON.stringify(process.env.UPSTASH_REDIS_REST_URL));
console.log("UPSTASH_REDIS_REST_TOKEN =", JSON.stringify(process.env.UPSTASH_REDIS_REST_TOKEN));

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});