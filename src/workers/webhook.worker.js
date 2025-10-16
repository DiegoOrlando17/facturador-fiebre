import logger from "../utils/logger.js";

import { Worker } from "bullmq";
import { updatePaymentStatus, getPayment, updatePayment } from "../models/Payment.js";
import { getPaymentInfoMP } from "../services/mercadopago.service.js";
import { connection } from "../config/redis.js";
import { paymentsQueue } from "../queues/payments.queue.js";

const worker = new Worker("webhooks", async (job) => {
    try {
        const { paymentId } = job.data;

        const payment = await getPayment(paymentId);

        if (!payment) return;

        if (payment.status !== "pending" && payment.status !== "mercadopago_fetch_pending") return;

        await updatePaymentStatus(payment.id, "processing");
        payment.status = "processing";

        if (payment.provider === "mercadopago") {

            const paymentMP = getPaymentInfoMP(payment.provider_payment_id);
            if (paymentMP === null) {
                await updatePaymentStatus(paymentId, "mercadopago_fetch_pending", "No se pudo recuperar el pago de la api mercadopago.");
                throw new Error("No se pudo recuperar el pago de la api mercadopago.");
            }

            if (paymentMP.status !== "approved") {
                throw new Error("El pago todavia no esta aprobado.");
            }

            payment.payment_method_id = paymentMP.payment_method_id;
            payment.amount = paymentMP.transaction_amount;
            payment.currency = paymentMP.currency_id;
            payment.customer = paymentMP.payer?.email || "";
            payment.customer_doc_type = paymentMP.payer?.identification?.type || "";
            payment.customer_doc_number = paymentMP.payer?.identification?.number || "";
            payment.date_approved = paymentMP.date_approved;

            await updatePayment(payment.id, payment);
        }

        const queue = await paymentsQueue.add(`payments-${payment.provider_payment_id.toString()}`, { paymentId: payment.id.toString() }, {
            jobId: `job-payments-${payment.provider_payment_id.toString()}-${Date.now()}`,
            attempts: 10,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: true,
            removeOnFail: 50,
        });
    } catch (err) {
        logger.error("Error en el webhook worker: " + err);
        throw err;
    }
}, { 
    concurrency: 10, 
    connection: connection,
    lockDuration: 30000,      // cuánto dura el lock antes de considerarlo muerto
    stalledInterval: 60000,   // cada 60s revisa jobs colgados
    lockRenewTime: 15000
 });

worker.on("ready", () => console.log("✅ Worker webhooks listo y conectado a Redis"));
worker.on("error", (err) => console.error("❌ Error en worker:", err));
worker.on("failed", (job, err) => console.error(`⚠️ Job ${job.id} falló:`, err));