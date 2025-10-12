import express from "express";
import dotenv from "dotenv";

import webhookRouter from "./routes/webhook.routes.js";
import paymentsRouter from "./routes/payments.routes.js";
import healthRouter from "./routes/health.routes.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/webhook", webhookRouter);
app.use("/api", paymentsRouter);

export default app;
