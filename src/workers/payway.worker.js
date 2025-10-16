import logger from "../utils/logger.js";

import { fetchNewPayments, getPaymentInfoPWY, fetchLastPayment } from "../services/payway.service.js";
import { upsertPayment } from "../models/Payment.js";
import { getSystemConfig, setSystemConfig } from "../models/SystemConfig.js";
import { paymentsQueue } from "../queues/payments.queue.js";
import { config } from "../config/index.js";

let isRunning = false;

const INTERVAL_MS = Number(config.PAYWAY.POLLING_INTERVAL || 3000);

export async function startPaywayWorker() {
    logger.info(`🚀 Payway worker iniciado (intervalo: ${INTERVAL_MS} ms)`);

    setInterval(async () => {
        if (isRunning) return;
        isRunning = true;

        try {

            let checkpoint = await getSystemConfig("lastPaywayCheck");
            checkpoint = checkpoint ? JSON.parse(checkpoint) : null;

            let lastTimestamp = checkpoint?.timestamp || null;
            let lastPaymentId = checkpoint?.lastPaymentId || 0;

            if (!lastPaymentId) {
                logger.warn("⚠️ No hay checkpoint en DB, inicializando con último pago de MercadoPago...");

                const lastPayment = await fetchLastPayment(); // ajustá para traer solo 1, del más reciente        

                if (lastPayment) {
                    lastTimestamp = lastPayment.date_approved;
                    lastPaymentId = lastPayment.id;
                    await setSystemConfig("lastPaywayCheck", JSON.stringify({ timestamp: lastTimestamp, lastPaymentId: lastPaymentId.toString() }));
                    logger.info(`🧭 Checkpoint inicial PWY creado → id=${lastPaymentId.toString()}, date=${lastTimestamp}`);
                }

                // ⛔️ Salimos del ciclo para no procesar más en este intervalo
                isRunning = false;
                return;
            }

            const newPayments = await fetchNewPayments(lastTimestamp);
            //logger.info(newPayments.length);
            if (!Array.isArray(newPayments) || newPayments.length === 0) {
                isRunning = false;
                return;
            }

            const filtered = newPayments.filter((p) => {
                //logger.info(`lasttimestamp: ${lastTimestamp} - date: ${p.date}`);
                const ts = p.date;
                const id = Number(p.id);
                if (!ts) return false;
                if (!lastTimestamp) return true;

                if (ts > lastTimestamp) return true;
                if (ts === lastTimestamp && id > lastPaymentId) return true;

                return false;
            });

            //logger.info(`Payway: ${filtered.length} pagos nuevos encontrados`);

            if (filtered.length === 0) {
                isRunning = false;
                return;
            }

            for (const p of filtered) {
                const data = getPaymentInfoPWY(p);
                data.status = "pending";

                const payment = await upsertPayment("payway", String(p.id || ""), data);

                const queue = await paymentsQueue.add(`payments-${payment.provider_payment_id.toString()}`, { paymentId: payment.id.toString() }, {
                    jobId: `job-payments-${payment.provider_payment_id.toString()}`,
                    attempts: 10,
                    backoff: { type: "exponential", delay: 3000 },
                    removeOnComplete: true,
                    removeOnFail: 50,
                });
            }

            const newest = filtered.sort((a, b) => {
                if (a.date !== b.date)
                    return a.date.localeCompare(b.date);
                return Number(a.id) - Number(b.id);
            }).at(-1);

            if (newest) {
                lastTimestamp = newest.date;
                lastPaymentId = Number(newest.id);

                await setSystemConfig("lastPaywayCheck", JSON.stringify({ timestamp: lastTimestamp, lastPaymentId: lastPaymentId.toString() }));
            }
        }
        catch (error) {
            logger.error("❌ Error en Payway worker:", error.message);
        }
        finally {
            isRunning = false;
        }
    }, INTERVAL_MS);
}

if (process.argv[1].includes("payway.worker.js")) {
    startPaywayWorker();
}
