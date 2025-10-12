import { Queue } from "bullmq";
import { connection } from "../config/redis.js";

export const webhooksQueue = new Queue("webhooks", { connection });