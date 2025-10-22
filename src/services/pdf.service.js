import fs from "fs";
import PDFDocument from "pdfkit";
import path from "path";
import logger from "../utils/logger.js";

import { config } from "../config/index.js"
import { getTodaysDate, formatToLocalTime } from "../utils/date.js";

export function createInvoicePDF(payment, cae, nroComprobante, fechaVtoCae) {
    try {
        return new Promise((resolve, reject) => {
            const fileName = `${config.CUIT}_${config.AFIP.CBTE_TIPO.toString().padStart(3, "0")}_${config.AFIP.PTO_VTA.toString().padStart(5, "0")}_${nroComprobante.split('-')[1]}_${getTodaysDate()}.pdf`;
            const filePath = `./facturas/${fileName}`;

            if (!fs.existsSync("./facturas")) {
                fs.mkdirSync("./facturas");
            }

            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(filePath);
            doc.pipe(stream);

            // === ENCABEZADO ===
            // Logo (si tenés un archivo PNG/JPG, ejemplo ./logo.png)
            try {
                const logoPath = path.resolve("assets/fiebre_flow_logo.png");
                doc.image(logoPath, 50, 45, { width: 80 });
            } catch (e) {
                // Si no hay logo, seguimos sin error
            }

            doc.fillColor("#333").fontSize(20).text("Factura - Consumidor Final", 150, 50);
            doc.moveDown(2);

            // Datos del comercio
            doc.fontSize(10).fillColor("#555");
            doc.text("RAZON SOCIAL: FEBRIS", 50, 120);
            doc.text("CUIT: 30-71902252-5", 50, 135);
            doc.text("DEPENDENCIA: 41 - AGENCIA NRO 41", 50, 150);
            doc.text("DOMICILIO: JARAMILLO 2364 Dpto:309 CP: 1429", 50, 165);
            doc.text("LOCALIDAD: CAPITAL FEDERAL", 50, 180);
            doc.moveDown(2);

            // === DATOS DEL PAGO ===
            doc.fillColor("#000").fontSize(12);
            doc.text(`Factura N°: ${nroComprobante}`, 50, 250);
            doc.text(`Fecha: ${formatToLocalTime(payment.date_approved)}`, 50, 265);
            doc.text(`Método de pago: ${payment.payment_method_id}`, 50, 280);
            doc.text(`Comprador: ${payment.payer?.email || "Consumidor Final"}`, 50, 295);
            doc.text(`CAE: ${cae}   Vto: ${fechaVtoCae}`, 50, 310);

            doc.moveDown(3);

            // === DETALLE DE VENTA ===
            // doc.fillColor("#000").fontSize(14).text("Detalle de la venta", 50, doc.y, {
            //     underline: true,
            //     align: "left"
            // });
            // doc.moveDown(0.5);

            // const items = payment.additional_info?.items || [
            //     { title: payment.description || "Venta", quantity: 1, unit_price: payment.transaction_amount }
            // ];

            // let total = 0;

            // // Definir posiciones de columnas
            // const colX = { producto: 50, cantidad: 300, unitario: 360, subtotal: 460 };
            // let y = doc.y + 5;

            // // Cabecera con fondo gris
            // doc.rect(50, y, 500, 20).fill("#eee").stroke();
            // doc.fillColor("#000").fontSize(12).text("Producto", colX.producto + 5, y + 5);
            // doc.text("Cant.", colX.cantidad + 5, y + 5);
            // doc.text("Precio Unit.", colX.unitario + 5, y + 5);
            // doc.text("Subtotal", colX.subtotal + 5, y + 5);

            // y += 25;

            // // Ítems con líneas divisorias
            // items.forEach(item => {
            //     const quantity = item.quantity !== undefined ? Number(item.quantity) : 1;
            //     const unitPrice = item.unit_price !== undefined ? Number(item.unit_price) : 0;
            //     const subtotal = quantity * unitPrice;
            //     total += subtotal;

            //     doc.fillColor("#000").fontSize(12);
            //     doc.text(item.title, colX.producto + 5, y);
            //     doc.text(quantity.toString(), colX.cantidad + 5, y);
            //     doc.text(`$${unitPrice.toFixed(2)}`, colX.unitario + 5, y);
            //     doc.text(`$${subtotal.toFixed(2)}`, colX.subtotal + 5, y);

            //     // Línea separadora
            //     doc.moveTo(50, y + 18).lineTo(550, y + 18).strokeColor("#ccc").stroke();

            //     y += 25;
            // });

            // Total destacado
            doc.fontSize(12).fillColor("#000");
            doc.text(`TOTAL: $${payment.amount.toFixed(2)}`, 50, 400, {
                align: "right"
            });

            // === FOOTER ===
            doc.moveDown(4);
            doc.fontSize(10).fillColor("#777").text("Gracias por su compra", 50, 730, {
                align: "center",
                width: 500
            });

            doc.end();

            stream.on("finish", () => resolve(filePath));
            stream.on("error", reject);
        });
    }
    catch (err) {
        logger.error("Error en el createInvoicePDF: " + err);
        return null;
    }
}
