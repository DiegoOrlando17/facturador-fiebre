import { Router } from "express";
import { upsertPayment } from "../models/Payment.js";
import { webhooksQueue } from "../queues/webhooks.queue.js";

const router = Router();

router.post("/mercadopago", async (req, res) => {

  try {
    const { type, data } = req.body;

    if (type === "payment" && data && data.id) {

      const payment = await upsertPayment("mercadopago", String(data.id || ""), { id: Number(data.id), status: "pending" });

      const job = await webhooksQueue.add(`webhooks-${data.id}`, { paymentId: payment.id }, {
        jobId: `job-webhooks-${data.id}`,
        attempts: 8,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 50,
      }); 
            
    }
    
    res.sendStatus(200);
  } catch (err) {
    console.error("Error en webhook:", err);
    res.sendStatus(500);
  }
});

export default router;
