import axios from "axios";
import logger from "../utils/logger.js";

import { config } from "../config/index.js";

export function getPaymentInfoPWY(txn) {
  try {
    return {
      "id": txn.id,
      "amount": txn.amount,
      "currency": txn.currency,
      "date_approved": normalizeDate(txn.date),
      "payment_method_id": txn.card_brand,
      "customer": txn.customer,
      "customer_doc_type": txn.customer_doc_type,
      "customer_doc_number": txn.customer_doc_number
    };
  } catch (error) {
    logger.error("Error obteniendo pago:", error);
    return null;
  }
}

function normalizeDate(input) {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

async function tokenizarTarjeta() {
  const body = {
    card_number: "4507990000000010",
    card_expiration_month: "12",
    card_expiration_year: "30",
    security_code: "123",
    card_holder_name: "Test",
    card_holder_identification: {
      type: "dni",
      number: "12345678"
    },
    fraud_detection: {
      device_unique_identifier: "12345"
    },
    ip_address: "192.168.100.1"
  };

  const res = await axios.post("https://developers.decidir.com/api/v2/tokens", body, {
    headers: { "apikey": config.PAYWAY.PUBLIC_KEY }
  });

  return res.data.id; // 🔹 este es el token válido
}

function getHeaders() {
  return {
    "apikey": config.PAYWAY.PRIVATE_KEY,
    "Content-Type": "application/json",
  };
}

export async function createPaymentPWY() {
  const tokenTarjeta = await tokenizarTarjeta();
  const body = {
    site_transaction_id: "test_" + Date.now(),
    token: tokenTarjeta, // tokenizado de prueba de tarjeta    
    payment_method_id: 1, // 1 = VISA en testing
    bin: "450799",
    amount: 5000,
    currency: "ARS",
    installments: 1,
    description: "Trago de prueba Payway",
    payment_type: "single",
    establishment_name: "Fiebre Flow",
    sub_payments: [],
    fraud_detection: {
      bill_to: {
        city: 'Buenos Aires',
        country: 'AR',
        customer_id: '12345',
        email: 'cliente@correo.com',
        first_name: 'Juan',
        last_name: 'Pérez',
        phone_number: '1112345678',
        postal_code: 'C1001',
        state: 'BA',
        street1: 'Calle Falsa 123',
        street2: 'Piso 1',
      },
      purchase_totals: {
        currency: 'ARS',
        amount: 5000,
      },
      customer_in_site: {
        days_in_site: 120,
        is_guest: false,
        num_of_transactions: 5,
      },
      retail_transaction_data: {
        ship_to: {
          city: 'Buenos Aires',
          country: 'AR',
          customer_id: '12345',
          email: 'cliente@correo.com',
          first_name: 'Juan',
          last_name: 'Pérez',
          phone_number: '1112345678',
          postal_code: 'C1001',
          state: 'BA',
          street1: 'Calle Falsa 123',
          street2: 'Piso 1',
        },
        items: [
          {
            code: 'prueba',
            sku: 'prueba',
            name: 'prueba',
            total_amount: 5000,
            description: 'prueba',
            quantity: 1,
            unit_price: 5000
          }
        ],
      },
    },
    'Content-Type': "application/json",
  };

  try {
    const res = await axios.post(`${config.PAYWAY.API_URL}/payments`, body, {
      headers: getHeaders(),
    });
    return res.data;
  } catch (err) {
    logger.error("❌ Error creando pago PWY:", err.response.data.status_details.error.type, err.response.data.status_details.error.reason);
  }
}

// export async function fetchNewPayments(fromDate) {
//   try {
//     const params = {};
//     if (fromDate) params.fromDate = fromDate;

//     const res = await axios.get(`${config.PAYWAY.API_URL}/payments`, {
//       headers: { apikey: config.PAYWAY.PRIVATE_KEY },
//       params,
//     });

//     const payments = res.data.results || [];
//     return payments;
//   } catch (error) {
//     logger.error(`⚠️ Error al obtener pagos de Payway: ${error.message}`);
//     return [];
//   }
// }

export async function fetchNewPayments(fromDate) {
  const allPayments = [];
  let offset = 0;
  const pageSize = 50;
  const MAX_PAGES = 200;
  let page = 1;

  while (true) {
    const params = {};
    if (fromDate) params.fromDate = fromDate;
    params.pageSize = pageSize;
    params.offset = offset;

    try {
      const res = await axios.get(`${config.PAYWAY.API_URL}/payments`, {
        headers: { apikey: config.PAYWAY.PRIVATE_KEY },
        params,
      });

      const results = res.data.results || [];

      if (results.length === 0) break;

      allPayments.push(...results);

      if (results.length < pageSize) break;

      offset += pageSize;
      page++;

      if (page > MAX_PAGES) {
        break;
      }
    } catch (error) {
      logger.error(`❌ Error al obtener página ${page} de Payway:`, error.message);
      break; // si falla una página, salimos del bucle
    }
  }

  return allPayments;
}