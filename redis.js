import dotenv from "dotenv";
import { Redis } from "@upstash/redis";

dotenv.config();

export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});