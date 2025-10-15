import logger from "../utils/logger.js";
import fetch from "node-fetch";
import crypto from "crypto";
import axios from "axios";

import { config } from "../config/index.js";

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

export async function fetchNewPayments(lastPaymentId) {
  const allPayments = [];
  let offset = 0;
  const limit = 500;
  let keepGoing = true;

  while (true) {
    const params = {};
    params.status = "approved";
    params.sort = "date_approved";
    params.criteria = "desc";
    params.limit = limit;
    params.offset = offset;

    try {

      const res = await axios.get(`${config.MP.API_URL}/payments/search`, {
        headers: { Authorization: "Bearer " + config.MP.ACCESS_TOKEN },
        params: params,
      });

      const results = res.data.results || [];

      if (results.length === 0) break;

      for (const payment of results) {
        if (String(payment.id) === String(lastPaymentId)) {
          keepGoing = false;
          break;
        }
        allPayments.push(payment);
      }

      if (!keepGoing || results.length < limit) break;


      offset += limit;
      
    } catch (error) {
      logger.error(`❌ Error al obtener el offset ${offset} de Mercadopago:`, error);
      break; // si falla una página, salimos del bucle
    }
  }

  return allPayments.reverse();
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