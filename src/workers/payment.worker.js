import logger from "../utils/logger.js";

import { config } from "../config/index.js";
import { Worker } from "bullmq";
import { updatePaymentStatus, getPayment, updatePayment } from "../models/Payment.js";
import { getNextCbteNro, setLastCbteNro } from "../models/InvoiceSequence.js";
import { createInvoiceAFIP } from "../services/afip.service.js";
import { connection } from "../config/redis.js";
import { invoicesQueue } from "../queues/invoices.queue.js";

const worker = new Worker("payments", async (job) => {
    try {
        const { paymentId } = job.data;

        const payment = await getPayment(paymentId);

        if (!payment) return;

        if (payment.status !== "pending" && payment.status !== "processing" && payment.status !== "afip_pending") return;

        await updatePaymentStatus(payment.id, "processing");
        payment.status = "processing";

        const seq = await getNextCbteNro(config.AFIP.PTO_VTA, config.AFIP.CBTE_TIPO);
        if (!seq) {
            await updatePaymentStatus(payment.id, "afip_pending", "No se pudo obtener el ultimo comprobante.");
            throw new Error("No se pudo obtener el ultimo comprobante.");
        }

        const nextCbteNro = seq.next;

        const response = await createInvoiceAFIP(nextCbteNro, payment.amount);
        if(!response) {
            await updatePaymentStatus(payment.id, "afip_pending", "No se pudo obtener el cae de AFIP.");
            throw new Error("No se pudo obtener el cae de AFIP.");
        }

        const { cae, nroComprobante, fechaVtoCae } = response;

        await setLastCbteNro(seq.id, nextCbteNro);

        payment.cae = cae;
        payment.cae_vto = fechaVtoCae;
        payment.cbte_nro = nroComprobante;
        payment.cbte_tipo = Number(config.AFIP.CBTE_TIPO);
        payment.pto_vta = config.AFIP.PTO_VTA;

        await updatePayment(payment.id, payment);

        const queue = await invoicesQueue.add(`invoices-${payment.provider_payment_id}`, { paymentId: payment.id }, {
            jobId: `job-invoices-${payment.provider_payment_id}`,
            attempts: 5,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: true,
            removeOnFail: 50,
        });
    } catch (err) {
        logger.error("Error en el payment worker: " + err);
        throw err;
    }
}, { 
    concurrency: 1, 
    connection: connection,
    lockDuration: 30000,      // cuánto dura el lock antes de considerarlo muerto
    stalledInterval: 60000,   // cada 60s revisa jobs colgados
    lockRenewTime: 15000
 });

worker.on("ready", () => console.log("✅ Worker payments listo y conectado a Redis"));
worker.on("error", (err) => console.error("❌ Error en worker:", err));
worker.on("failed", (job, err) => console.error(`⚠️ Job ${job.id} falló:`, err));

