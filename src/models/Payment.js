import { db } from "./db.js";

/**
 * Inserta o actualiza un pago (idempotente).
 * Si no existe, lo crea. Si ya existe, actualiza los campos nuevos.
 */
export async function upsertPayment(provider, provider_payment_id, data = {}) {  
  return db.payment.upsert({
    where: { provider_provider_payment_id: { provider, provider_payment_id } },
    update: {
      ...data,
      updatedAt: new Date(),
    },
    create: {
      provider,
      provider_payment_id,
      ...data,
      createdAt: new Date(),
    },
  });
}

/**
 * Actualiza un pago existente. Si no existe, lanza error.
 */
export async function updatePayment(id, data = {}) {
  return db.payment.update({
    where: { id },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
}

/**
 * Actualiza solo el estado (status) de un pago.
 */
export async function updatePaymentStatus(id, newStatus, error = null) {
  return db.payment.update({
    where: { id },
    data: {
      status: newStatus,
      error,
      updatedAt: new Date(),
    },
    select: { id: true, status: true, error: true, updatedAt: true },
  });
}

/**
 * Obtiene un pago por provider + provider_payment_id.
 */
export async function getPayment(id) {
  return db.payment.findUnique({
    where: { id } ,
  });
}

/**
 * Lista los pagos por estado (ej: RECEIVED, AFIP_OK, DONE, etc.)
 */
export async function getPaymentsByStatus(status) {
  return db.payment.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingPayments() {
  return db.payment.findMany({
    where: {
      status: {
        in: [
          "mercadopago_fetch_pending",
          "afip_pending",
          "pdf_pending",
          "drive_pending",
          "sheets_pending",
        ],
      },
    },
    select: {
      id: true,
      provider_payment_id: true,
      status: true,
    },
  });
}

export async function getPaymentByProviderId(providerPaymentId) {
  return db.payment.findUnique({
    where: { provider_payment_id: String(providerPaymentId) },
  });
}
