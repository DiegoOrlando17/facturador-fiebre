import logger from "../utils/logger.js";

import { Worker } from "bullmq";
import { updatePayment, updatePaymentStatus, getPayment } from "../models/Payment.js";
import { createInvoicePDF } from "../services/pdf.service.js";
import { uploadToDrive } from "../services/drive.service.js";
import { appendRow } from "../services/sheets.service.js";
import { connection } from "../config/redis.js";

const worker = new Worker("invoices", async (job) => {
    try {
        const { paymentId } = job.data;

        const payment = await getPayment(paymentId);

        if (!payment) return;

        if (payment.status !== "processing" && payment.status !== "pdf_pending" && payment.status !== "drive_pending" && payment.status !== "sheets_pending") return;

        if (payment.status === "processing" || payment.status === "pdf_pending") {
            const pdfPath = await createInvoicePDF(payment, payment.cae, payment.cbte_nro, payment.cae_vto);
            if (!pdfPath) {
                await updatePaymentStatus(payment.id, "pdf_pending", "No se pudo generar la factura.");
                throw new Error("No se pudo generar la factura.");
            }

            payment.pdf_path = pdfPath;
            await updatePayment(payment.id, payment);
        }

        if (payment.status === "processing" || payment.status === "pdf_pending" || payment.status === "drive_pending") {

            const driveFile = await uploadToDrive(payment.pdf_path, `factura_${payment.provider_payment_id}.pdf`);
            if (!driveFile) {
                await updatePaymentStatus(payment.id, "drive_pending", "No se pudo subir la factura al drive.");
                throw new Error("No se pudo subir la factura al drive.");
            }

            payment.drive_file_link = driveFile.webViewLink;
            await updatePayment(payment.id, payment);
        }

        if (payment.status === "processing" || payment.status === "pdf_pending" || payment.status === "drive_pending" || payment.status === "sheets_pending") {

            const sheets = await appendRow([
                payment.provider_payment_id,
                payment.cbte_nro,
                payment.date_approved,
                payment.amount,
                payment.customer || "Consumidor Final",
                payment.cae,
                payment.cae_vto,
                "OK",
                payment.drive_file_link,
            ]);

            if (!sheets) {
                await updatePaymentStatus(payment.id, "sheets_pending", "No se pudo registrar en el sheets.");
                throw new Error("No se pudo registrar en el sheets.");
            }

            payment.sheets_row = sheets.row;
            await updatePayment(payment.id, payment);
        }

        await updatePaymentStatus(payment.id, "complete");

    } catch (err) {
        logger.error("Error en el invoice worker: " + err);
        throw err;
    }
}, {
    concurrency: 1,
    connection: connection,
    lockDuration: 30000,      // cuánto dura el lock antes de considerarlo muerto
    stalledInterval: 60000,   // cada 60s revisa jobs colgados
    lockRenewTime: 15000
});

worker.on("ready", () => console.log("✅ Worker invoices listo y conectado a Redis"));
worker.on("error", (err) => console.error("❌ Error en worker:", err));
worker.on("failed", (job, err) => console.error(`⚠️ Job ${job.id} falló:`, err));