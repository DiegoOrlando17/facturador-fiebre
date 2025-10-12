import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { config } from "../config/index.js";

import fetch from "node-fetch";
import crypto from "crypto";

const MP_API_URL = process.env.MP_API_URL;
const MP_PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const client = new MercadoPagoConfig({
  accessToken: MP_ACCESS_TOKEN,
});

const payment = new Payment(client);

export async function getPaymentInfoMP(paymentId) {
  try {
    const response = await payment.get({ id: paymentId });
    return response;
  } catch (error) {
    console.error("Error obteniendo pago:", error);
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
