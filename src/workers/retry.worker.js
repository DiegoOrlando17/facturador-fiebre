import logger from "../utils/logger.js";

import { getPendingPayments } from "../models/Payment.js";
import { paymentsQueue } from "../queues/payments.queue.js";
import { invoicesQueue } from "../queues/invoices.queue.js";
import { keepTokenAlive } from "../services/drive.service.js";

const RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos

async function reenqueuePendingPayments() {

  try {
    const pendings = await getPendingPayments();

    if (!pendings.length) {
      return;
    }

    for (const payment of pendings) {
      try {
        const { id, provider_payment_id, status } = payment;

        if (status === "afip_pending") {
          await paymentsQueue.add(`payments-${provider_payment_id}`, { paymentId: id }, {
            jobId: `job-payments-${provider_payment_id}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: true,
            removeOnFail: 50,
          });
        }
        else if (["pdf_pending", "drive_pending", "sheets_pending"].includes(status)) {
          await invoicesQueue.add(`invoices-${provider_payment_id}`, { paymentId: id }, {
            jobId: `job-invoices-${provider_payment_id}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 50,
          });
        }
      } catch (innerErr) {
        logger.error(`❌ Error reintentando pago ${payment.id}: ${innerErr.message}`);
      }
    }

    await keepTokenAlive();

  } catch (err) {
    logger.error("❌ Error en Retry worker:", err);
  }
}

// Repite el proceso automáticamente cada X minutos
setInterval(reenqueuePendingPayments, RETRY_INTERVAL_MS);

// Ejecuta al arrancar también
await reenqueuePendingPayments();

logger.info(`♻️ Retry worker iniciado (intervalo: ${RETRY_INTERVAL_MS / 60000} min).`);
