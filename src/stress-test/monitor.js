import fs from "fs";
import path from "path";
import logger from "../utils/logger.js";
import yargs from "yargs";

import { hideBin } from "yargs/helpers";
import { db } from "../models/db.js";


async function monitorStressTest(runFilePath) {
    if (!fs.existsSync(runFilePath)) {
        throw new Error(`Archivo no encontrado: ${runFilePath}`);
    }

    const runData = JSON.parse(fs.readFileSync(runFilePath, "utf8"));
    const { payments } = runData;

    const generatedIds = payments.map(p => String(p.id));
    const totalMP = payments.filter(p => p.provider === "mercadopago");
    const totalPWY = payments.filter(p => p.provider === "payway");

    // Buscar en base los pagos correspondientes
    const dbPayments = await db.payment.findMany({
        where: {
            provider_payment_id: { in: generatedIds },
        },
        select: {
            provider: true,
            provider_payment_id: true,
            status: true,
            error: true,
        },
    });

    const okMP = dbPayments.filter(p => p.status === "complete" &&
        p.provider === "mercadopago")

    const okPWY = dbPayments.filter(p => p.status === "complete" &&
        p.provider === "payway")

    const foundIds = dbPayments.map(p => p.provider_payment_id);

    const missing = generatedIds.filter(id => !foundIds.includes(id));
    const erroredMP = dbPayments.filter(
        p =>
            p.status !== "complete" &&
            (p.error && p.error.trim() !== "") &&
            p.provider === "mercadopago"
    );

    const erroredPWY = dbPayments.filter(
        p =>
            p.status !== "complete" &&
            (p.error && p.error.trim() !== "") &&
            p.provider === "payway"
    );

    return { totalMP, totalPWY, okMP, okPWY, missing, erroredMP, erroredPWY };
}

const argv = yargs(hideBin(process.argv))
    .option("file", { type: "string", describe: "Ruta al archivo JSON del stress-test" })
    .help().argv;

async function findLatestRun() {
    const dir = path.join(process.cwd(), "src/stress-test", "runs");
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith(".json"))
        .map(f => ({ file: f, time: fs.statSync(path.join(dir, f)).mtime }))
        .sort((a, b) => b.time - a.time);
    return files.length ? path.join(dir, files[0].file) : null;
}

(async () => {
    try {
        const runFilePath = argv.file || await findLatestRun();
        if (!runFilePath) {
            console.error("❌ No se encontró ningún archivo de stress-test en stress-tests/runs/");
            process.exit(1);
        }

        console.log(`📄 Usando archivo: ${runFilePath}`);
        const report = await monitorStressTest(runFilePath);

        console.log("\n==== RESUMEN FINAL ====");
        console.log(`Total MP: ${report.totalMP.length}`);
        console.log(`Total PWY: ${report.totalPWY.length}`);
        console.log(`OK MP: ${report.okMP.length}`);
        console.log(`OK PWY: ${report.okPWY.length}`);
        console.log(`Con error MP: ${report.erroredMP.length}`);
        console.log(`Con error PWY: ${report.erroredPWY.length}`);
        console.log(`Perdidos: ${report.missing.length}`);

        if (report.erroredMP.length > 0) {
            console.log("\n⚠️ Pagos MP con error:");
            for (const e of report.erroredMP.slice(0, 10)) {
                console.log(`   → ${e.id}: ${e.error}`);
            }
        }

        if (report.erroredPWY.length > 0) {
            console.log("\n⚠️ Pagos PWY con error:");
            for (const e of report.erroredPWY.slice(0, 10)) {
                console.log(`   → ${e.id}: ${e.error}`);
            }
        }

        if (report.missing.length > 0) {
            console.log("\n❌ Pagos perdidos:");
            console.log(report.missing.slice(0, 20).join(", "));
        }

        console.log("\n✅ Monitoreo completado");
    } catch (err) {
        logger.error("❌ Error ejecutando monitor:", err.message);
        process.exit(1);
    }
})();