import logger from "../utils/logger.js";

import { db } from "./db.js";
import { getLastInvoiceAFIP } from "../services/afip.service.js";

export async function getLastCbteSeq(tx, pto_vta, cbte_tipo) {
    let seq = await tx.$queryRaw`
        SELECT * FROM "InvoiceSequence"
        WHERE "pto_vta" = ${pto_vta}
        FOR UPDATE
    `;

    seq = seq[0];

    if (!seq) {
        const lastFromAfip = await getLastInvoiceAFIP(pto_vta, cbte_tipo);
        if (!lastFromAfip) return null;

        seq = await tx.invoiceSequence.create({
            data: {
                pto_vta,
                cbte_tipo,
                last_nro: lastFromAfip,
            },
        });
    }

    return seq;
}

export async function getNextCbteNro(pto_vta, cbte_tipo) {
    try {
        return db.$transaction(async (tx) => {
            const seq = await getLastCbteSeq(tx, pto_vta, cbte_tipo);
            if (!seq) return null;
            return { id: seq.id, next: seq.last_nro + 1n };
        });
    }
    catch (err) {
        logger.error("Error en getNextCbteNro: " + err);
        return null;
    }
}

export async function setLastCbteNro(id, nro) {
    return db.invoiceSequence.update({
        where: { id },
        data: { last_nro: nro },
    });
}

export async function resyncCbteNro(pto_vta, cbte_tipo) {
    try {
        const lastFromAfip = await getLastInvoiceAFIP(pto_vta, cbte_tipo);
        if (!lastFromAfip) return null;

        await db.$transaction(async (tx) => {
            await tx.invoiceSequence.updateMany({
                where: { pto_vta, cbte_tipo },
                data: { last_nro: lastFromAfip },
            });
        });

        return lastFromAfip;
    }
    catch (err) {
        logger.error("Error en resyncCbteNro: " + err);
        return null;
    }
}
