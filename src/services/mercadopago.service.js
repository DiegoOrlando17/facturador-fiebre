import logger from "../utils/logger.js";
import fetch from "node-fetch";
import crypto from "crypto";
import axios from "axios";

import { DateTime } from "luxon";
import { config } from "../config/index.js";
import { parseUtc } from "../utils/date.js"

export function getPaymentInfoMP(payment) {
  try {
    return {
      "id": payment.id,
      "amount": payment.transaction_amount,
      "currency": payment.currency_id,
      "date_approved": payment.date_approved,
      "payment_method_id": payment.payment_method?.id || null,
      "customer": payment.payer?.email || null,
      "customer_doc_type": payment.payer?.identification?.type || null,
      "customer_doc_number": payment.payer?.identification?.number || null,
    };
  } catch (error) {
    logger.error("Error obteniendo pago:", error);
    return null;
  }
}

/**
 * - Ordenar por date_approved DESC (más nuevos primero)
 * - Paginamos con offset
 * - Procesamos pagos mientras su date_approved >= (lastApprovedDate - overlap)
 * - Apenas vemos pagos con date_approved < (lastApprovedDate - overlap), CORTAMOS la paginación
 * - De-duplicamos por provider_payment_id (DB) o por un set en memoria si hace falta
 */
export async function fetchNewPayments(lastTimestamp) {

  const limit = 200;
  const maxPages = 20; // cortafuego para no recorrer histórico infinito
  const overlapMs = 90_000; // 90s de margen por latencia de indexación
  const maxLookbackMs = 8 * 60 * 60 * 1000; // 8h por si lastApprovedDate es muy viejo

  const newPayments = [];
  const seenIds = new Set();

  let offset = 0;
  let pages = 0;

  // Normalizamos checkpoint temporal
  const now = new Date();
  const fallbackFloor = new Date(now.getTime() - maxLookbackMs);
  const lastApproved = lastTimestamp ? new Date(lastTimestamp) : fallbackFloor;

  // Margen/overlap para no perder pagos que aparecieron tarde en el search
  const floorDate = new Date(Math.max(0, lastApproved.getTime() - overlapMs));

  let olderConsecutiveCount = 0;

  while (true) {

    if (pages >= maxPages) break;

    try {

      const params = {};
      params.status = "approved";
      params.sort = "date_approved";
      params.criteria = "desc";
      params.limit = limit;
      params.offset = offset;

      const res = await axios.get(`${config.MP.API_URL}/payments/search`, {
        headers: { Authorization: "Bearer " + config.MP.ACCESS_TOKEN },
        params: params,
      });

      const results = res.data.results || [];

      if (results.length === 0) break;

      // fallback defensivo: MP A VECES no ordena bien
      results.sort((a, b) =>
        new Date(b.date_approved) - new Date(a.date_approved)
      );

      // let sawOlderThanFloor = false;

      for (const payment of results) {

        // Parse seguro del date_approved
        const approvedAt = parseUtc(payment.date_approved);

        if (approvedAt < floorDate) {
          olderConsecutiveCount++;
        } else {
          olderConsecutiveCount = 0;
        }

        // Si ya vimos 10 consecutivos más viejos → cortar
        if (olderConsecutiveCount >= 10) break;

        // if (approvedAt.getTime() < floorDate.getTime()) {
        //   sawOlderThanFloor = true;
        //   break;
        // }

        const isPosOk = payment.pos_id !== null && String(payment.pos_id) === String(config.MP.POS_ID);
        const isNotTransfer = payment.operation_type !== "money_transfer";

        // if (isPosOk && isNotTransfer)
        //   newPayments.push(payment);

        if (!isPosOk || !isNotTransfer) continue;

        // Dedup por ID
        if (!seenIds.has(payment.id)) {
          seenIds.add(payment.id);
          newPayments.push(payment);
        }
      }

      // Si encontramos items más viejos que el piso, no hace falta seguir paginando
      // if (sawOlderThanFloor) {
      //   break;
      // }

      // Si esta página vino incompleta, ya no hay más hacia atrás
      if (results.length < limit) break;

      offset += limit;
      pages += 1;

    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      logger.warn(`⚠️ MP devolvió ${status || "error"} en offset ${offset}: ${message}`);
      break; // salimos y seguimos en la próxima iteración
    }
  }

  // Devolvemos en orden cronológico ascendente para procesar naturalmente
  // (los trajimos desc, así que invertimos)
  newPayments.sort((a, b) => new Date(a.date_approved) - new Date(b.date_approved));
  return newPayments;
}

export async function fetchLastPayment() {
  try {
    const params = {};
    params.status = "approved";
    params.sort = "date_approved";
    params.criteria = "desc";
    params.limit = 1;

    const res = await axios.get(`${config.MP.API_URL}/payments/search`, {
      headers: { Authorization: "Bearer " + config.MP.ACCESS_TOKEN },
      params: params,
    });

    const results = res.data.results || [];

    if (results.length === 0) return null;

    const lastPayment = results[0];

    return lastPayment;

  } catch (error) {
    logger.error(`❌ Error en FetchLastPayment de Mercadopago:`, error);
    return null;
  }
}

async function createCardToken() {
  const response = await fetch(
    `${config.MP.API_URL}/card_tokens?public_key=${config.MP.PUBLIC_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        card_number: "5031755734530604", // tarjeta aprobada
        expiration_year: 2030,
        expiration_month: 11,
        security_code: "123",
        cardholder: {
          name: "APRO",
          identification: { type: "DNI", number: "12345678" },
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(`Error creando card_token: ${JSON.stringify(data)}`);
  return data.id;
}

export async function createPaymentMP() {
  try {
    const cardTokenId = await createCardToken();
    const idempotencyKey = crypto.randomUUID(); // genera un UUID único    

    const body = {
      "additional_info": {
        "items": [
          { "title": "Botella Fernet", "quantity": 1, "unit_price": 10000 },
        ]
      },
      transaction_amount: 10000,
      payment_method_id: "master", // método de pago (ej: visa, master, amex)
      payer: {
        email: "TESTUSER451059130353807312@testuser1234.com", // un mail cualquiera o test_user
        identification: {
          type: "DNI",
          number: "12345678"
        }
      },
      token: cardTokenId, // 🔥 token de tarjeta de prueba
      installments: 1,
    };

    const response = await fetch(`${config.MP.API_URL}/payments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.MP.ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creando pago de prueba:", error);
    throw error;
  }
}

export async function fetchLast24HsPayments() {
  // Usamos horario de Buenos Aires
  const nowLocal = DateTime.now().setZone("America/Argentina/Buenos_Aires");

  // Ventana de últimas 25 horas para solapamiento y eventual reindexación tardía
  const windowEndLocal = nowLocal;
  const windowStartLocal = nowLocal.minus({ hours: 25 });

  // Para MercadoPago usamos UTC
  const startIsoUtc = windowStartLocal.toUTC().toISO();
  const endIsoUtc = windowEndLocal.toUTC().toISO();

  // const startIsoUtc = "2025-11-07T09:00:00.000Z";
  // const endIsoUtc   = "2025-11-08T09:00:00.000Z";

  const limit = 500;
  let offset = 0;
  const all = [];
  const seen = new Set();

  while (true) {
    const params = {
      status: "approved",
      limit,
      offset,
      begin_date: startIsoUtc,
      end_date: endIsoUtc
    };

    let res;
    try{
      res = await axios.get(
      "https://api.mercadopago.com/v1/payments/search",
      {
        headers: { Authorization: "Bearer " + config.MP.ACCESS_TOKEN },
        params
      }
    );
  } catch (err) {
    logger.error("⚠️ MP error en auditor:", err.response?.status, err.message);
    break;
  }

    const results = res.data.results || [];

    if (results.length === 0) break;

    // Recolectar evitando repetidos (MP devuelve cosas mezcladas)
    for (const p of results) {
      const key = String(p.id);
      if (!seen.has(key)) {
        seen.add(key);
        all.push(p);
      }
    }

    if (results.length < limit) break;

    offset += limit;
  }

  // Filtrar solo POS correcto y no money_transfer
  return all
    .filter(p =>
      String(p.pos_id) === String(config.MP.POS_ID) &&
      p.operation_type !== "money_transfer"
    )
}