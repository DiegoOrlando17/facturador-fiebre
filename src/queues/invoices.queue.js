import { Queue } from "bullmq";
import { connection } from "../config/redis.js";

export const invoicesQueue = new Queue("invoices", { connection });
