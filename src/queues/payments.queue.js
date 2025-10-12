import { Queue } from "bullmq";
import { connection } from "../config/redis.js";

export const paymentsQueue = new Queue("payments", { connection });
