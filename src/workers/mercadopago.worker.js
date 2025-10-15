import logger from "../utils/logger.js";

import { fetchNewPayments, getPaymentInfoMP } from "../services/mercadopago.service.js";
import { upsertPayment } from "../models/Payment.js";
import { getSystemConfig, setSystemConfig } from "../models/SystemConfig.js";
import { paymentsQueue } from "../queues/payments.queue.js";
import { config } from "../config/index.js";

let isRunning = false;

const INTERVAL_MS = Number(config.MP.POLLING_INTERVAL || 5000);

export async function startMercadopagoWorker() {
    logger.info(`🚀 Mercadopago worker iniciado (intervalo: ${INTERVAL_MS} ms)`);

    let checkpoint = await getSystemConfig("lastMercadopagoCheck");
    checkpoint = checkpoint ? JSON.parse(checkpoint) : null;

    let lastTimestamp = checkpoint?.timestamp || null;
    let lastPaymentId = checkpoint?.lastPaymentId || 0;

    setInterval(async () => {
        if (isRunning) return;
        isRunning = true;

        try {
            const newPayments = await fetchNewPayments(lastPaymentId);
            if (!Array.isArray(newPayments) || newPayments.length === 0) {
                isRunning = false;
                return;
            }

            const filtered = newPayments.filter((p) => {

                const ts = p.date_approved;
                const id = Number(p.id);
                if (!ts) return false;
                if (!lastTimestamp) return true;

                if (ts > lastTimestamp) return true;
                if (ts === lastTimestamp && id > lastPaymentId) return true;

                return false;
            });

            if (filtered.length === 0) {
                isRunning = false;
                return;
            }

            for (const p of filtered) {
                const data = getPaymentInfoMP(p);
                data.status = "pending";

                const payment = await upsertPayment("mercadopago", String(p.id || ""), data);

                const queue = await paymentsQueue.add(`payments-${payment.provider_payment_id}`, { paymentId: payment.id }, {
                    jobId: `job-payments-${payment.provider_payment_id}`,
                    attempts: 10,
                    backoff: { type: "exponential", delay: 3000 },
                    removeOnComplete: true,
                    removeOnFail: 50,
                });
            }

            const newest = filtered.sort((a, b) => {
                if (a.date_approved !== b.date_approved)
                    return a.date_approved.localeCompare(b.date_approved);
                return Number(a.id) - Number(b.id);
            }).at(-1);

            if (newest) {
                lastTimestamp = newest.date_approved;
                lastPaymentId = Number(newest.id);

                await setSystemConfig("lastMercadopagoCheck", JSON.stringify({ timestamp: lastTimestamp, lastPaymentId }));
            }
        }
        catch (error) {
            logger.error("❌ Error en Mercadopago worker:", error.message);
        }
        finally {
            isRunning = false;
        }
    }, INTERVAL_MS);
}

if (process.argv[1].includes("mercadopago.worker.js")) {
    startMercadopagoWorker();
}
