import logger from "../utils/logger.js";

import { getPendingPayments } from "../models/Payment.js";
import { webhooksQueue } from "../queues/webhooks.queue.js";
import { paymentsQueue } from "../queues/payments.queue.js";
import { invoicesQueue } from "../queues/invoices.queue.js";

const RETRY_INTERVAL_MS = 10 * 60 * 1000; // 5 minutos

async function reenqueuePendingPayments() {
  try {
    const pendings = await getPendingPayments();

    if (!pendings.length) {
      return;
    }

    for (const payment of pendings) {
      try {
        const { id, provider_payment_id, status } = payment;

        if (status === "mercadopago_fetch_pending") {
          await webhooksQueue.add(`webhooks-${provider_payment_id}`, { paymentId: id }, {
            jobId: `job-webhooks-${provider_payment_id}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 50,
          });
        }
        else if (status === "afip_pending") {
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

  } catch (err) {
    logger.error("❌ Error en retryPending.worker:", err);
  }
}

// Repite el proceso automáticamente cada X minutos
setInterval(reenqueuePendingPayments, RETRY_INTERVAL_MS);

// Ejecuta al arrancar también
await reenqueuePendingPayments();

logger.info(`♻️ RetryPendingWorker iniciado (intervalo: ${RETRY_INTERVAL_MS / 60000} min).`);
