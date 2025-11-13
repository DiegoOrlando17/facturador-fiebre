import logger from "../utils/logger.js";

import { DateTime } from "luxon";
import { upsertPayment, getAllPaymentsIds } from "../models/Payment.js";
import { paymentsQueue } from "../queues/payments.queue.js";
import { fetchLast24HsPayments, getPaymentInfoMP } from "../services/mercadopago.service.js"

// AUDIT INTERVAL (en minutos)
const CHECK_INTERVAL_MIN = 1; // el worker despierta cada 1 minuto

// Guardamos el último “slot” ejecutado
let lastRunSlot = null;

async function addMissingPayments(payments) {
    if (payments.length === 0) {
        logger.info("🟢 No hay pagos faltantes en últimas 24h.");
        return;
    }

    logger.error(`❌ Detectados ${payments.length} pagos faltantes → generando upsert...`);

    for (const p of payments) {

        const data = getPaymentInfoMP(p);
        data.status = "pending";

        const payment = await upsertPayment("mercadopago", String(p.id || ""), data);

        const queue = await paymentsQueue.add(`payments-${payment.provider_payment_id.toString()}`, { paymentId: payment.id.toString() }, {
            jobId: `job-payments-${payment.provider_payment_id.toString()}-${Date.now()}`,
            attempts: 10,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: true,
            removeOnFail: 50,
        });
    }
}

async function audit() {
    const mpPayments = await fetchLast24HsPayments();
    const dbIds = (await getAllPaymentsIds("mercadopago"))
        .map(r => Number(r.provider_payment_id));

    const dbSet = new Set(dbIds);

    // De todos los pagos MP últimas 24h, nos quedamos con los que NO existen en DB
    const missing = mpPayments.filter(p => !dbSet.has(Number(p.id)));

    await addMissingPayments(missing);
}

// ----------------------------------------------------------------------
// LOOP DEL WORKER
// ----------------------------------------------------------------------

async function startAuditWorker() {
    console.log("🔧 Audit worker iniciado.");

    setInterval(async () => {
        try {
            const now = DateTime.now().setZone("America/Argentina/Buenos_Aires");
            const hour = now.hour;
            const minute = now.minute;

            const validMinutes = [0, 10, 20, 30, 40, 50];

            if (hour === 9 && validMinutes.includes(minute)) {
                const slotKey = `${now.toISODate()}-${hour}-${minute}`;

                // Evitar ejecutar dos veces en el mismo minuto
                if (lastRunSlot !== slotKey) {
                    lastRunSlot = slotKey;
                    await audit();
                }
            }

        } catch (err) {
            logger.error("❌ Error en Audit worker:", err);
        }
    }, CHECK_INTERVAL_MIN * 60 * 1000);
}

startAuditWorker().catch(e => {
    logger.error("❌ Error fatal en el Audit worker:", e);
    process.exit(1);
});
