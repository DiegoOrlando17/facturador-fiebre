import { Router } from "express";
import { createPaymentMP } from "../services/mercadopago.service.js";
import { createPaymentPWY } from "../services/payway.service.js";


const router = Router();

router.post("/crear-pago-mp", async (req, res) => {
  try {
    const payment = await createPaymentMP();
    const id =
      payment?.id ||
      payment?.payment_id ||
      payment?.provider_payment_id ||
      payment?.data?.id ||
      payment?.data?.payment_id;

    if (!id) {
      console.warn("⚠️ MP: Payment creado sin id:", payment);
    }

    res.status(200).json({
      id: String(id || ""),
      provider: "mercadopago",
      raw: payment, // opcional, para depuración
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo simular el pago" });
  }
});

router.post("/crear-pago-pwy", async (req, res) => {
  try {
    const payment = await createPaymentPWY();
    const id =
      payment?.id ||
      payment?.payment_id ||
      payment?.provider_payment_id ||
      payment?.data?.id ||
      payment?.data?.payment_id;

    if (!id) {
      console.warn("⚠️ PWY: Payment creado sin id:", payment);
    }

    res.status(200).json({
      id: String(id || ""),
      provider: "payway",
      raw: payment,
    });
  } catch (err) {
    res.status(500).json({ error: "No se pudo simular el pago" });
  }
});

export default router;
