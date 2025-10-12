// node src/stress-test/stress-test.js --total=100 --concurrency=80 --mercadopago=60 --mercadopagoUrl=http://localhost:5000/api/crear-pago-mp --paywayUrl=http://localhost:5000/api/crear-pago-pwy --ramercadopagoUpMs=120000 --jitterMs=900

import { setTimeout as sleep } from "timers/promises";
import { fetch } from "undici";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import pLimit from "p-limit";
import fs from "fs";
import path from "path";

// ---------- CLI ----------
const argv = yargs(hideBin(process.argv))
  .option("total", { type: "number", default: 10000, describe: "Total de pagos a simular" })
  .option("concurrency", { type: "number", default: 80, describe: "Solicitudes simultáneas máximas" })
  .option("mercadopago", { type: "number", default: 60, describe: "% de pagos vía Mercado Pago (0-100)" })
  .option("mercadopagoUrl", { type: "string", demandOption: true, describe: "Endpoint crear pago MERCADOPAGO" })
  .option("paywayUrl", { type: "string", demandOption: true, describe: "Endpoint crear pago Payway" })
  .option("ramercadopagoUpMs", { type: "number", default: 120000, describe: "Tiemercadopagoo de ramercadopagoa (ms)" })
  .option("jitterMs", { type: "number", default: 900, describe: "Jitter aleatorio por request (ms)" })
  .option("progressSec", { type: "number", default: 10, describe: "Cada cuántos segundos imercadopagorimir métricas parciales" })
  .option("header", { type: "array", default: [], describe: "Headers extra: --header X=Y --header A=B" })
  .help().argv;

const {
  total, concurrency, mercadopago: mercadopagoPct, mercadopagoUrl, paywayUrl, ramercadopagoUpMs, jitterMs, progressSec, header
} = argv;

// ---------- Helpers ----------
const RUN_ID = `run_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const OUTPUT_DIR = path.join(process.cwd(), "src/stress-test", "runs");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const OUTPUT_PATH = path.join(OUTPUT_DIR, `${RUN_ID}.json`);

function randAmount() { return Math.round(3000 + Math.random() * 17000); }
function randStr(n = 8) { return Math.random().toString(36).slice(2, 2 + n); }

function buildHeaders() {
  const h = { "Content-Type": "application/json", "X-Test-Run": RUN_ID };
  for (const kv of header) {
    const [k, ...rest] = String(kv).split("=");
    h[k] = rest.join("=");
  }
  return h;
}
const headers = buildHeaders();

function buildBody(provider) {
  const common = {
    amount: randAmount(),
    currency: "ARS",
    metadata: { runId: RUN_ID, paymentRef: randStr(10), provider },
    testMode: true,
    terminalId: ""
  };
  return common;
}

function pXX(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}
const sum = (a, b) => a + b;

// ---------- Métricas ----------
const metrics = {
  start: Date.now(),
  sent: 0, ok: 0, fail: 0,
  latencies: [],
  mercadopago: { sent: 0, ok: 0, fail: 0 },
  payway: { sent: 0, ok: 0, fail: 0 }
};

const results = {
  runId: RUN_ID,
  startedAt: new Date().toISOString(),
  config: { total, concurrency, mercadopagoPct, mercadopagoUrl, paywayUrl, ramercadopagoUpMs, jitterMs },
  payments: [],
};

function logProgress() {
  const s = Math.round((Date.now() - metrics.start) / 1000);
  const p50 = pXX(metrics.latencies, 50);
  const p95 = pXX(metrics.latencies, 95);
  const p99 = pXX(metrics.latencies, 99);
  const avg = metrics.latencies.length ? (metrics.latencies.reduce(sum, 0) / metrics.latencies.length) : 0;

  console.log(
    `[${s}s] SENT=${metrics.sent} OK=${metrics.ok} FAIL=${metrics.fail}` +
    ` | MERCADOPAGO sent=${metrics.mercadopago.sent} ok=${metrics.mercadopago.ok} fail=${metrics.mercadopago.fail}` +
    ` | PAYWAY sent=${metrics.payway.sent} ok=${metrics.payway.ok} fail=${metrics.payway.fail}`
  );
  console.log(`Latency(ms): avg=${avg.toFixed(1)} p50=${p50.toFixed(1)} p95=${p95.toFixed(1)} p99=${p99.toFixed(1)}`);
}

// ---------- Envío ----------
const limiter = pLimit(concurrency);

async function postJson(url, body, provider, index) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await res.text();
    const latency = performance.now() - t0;
    metrics.latencies.push(latency);

    const ok = res.ok;
    const paymentIdMatch = text.match(/"id"\s*:\s*"?([0-9A-Za-z-]+)"?/);
    const id = paymentIdMatch ? paymentIdMatch[1] : `unknown-${index}`;

    results.payments.push({
      id,
      provider,
      amount: body.amount,
      latency: latency.toFixed(1),
      status: ok ? "ok" : "fail",
      httpStatus: res.status,
      error: ok ? null : text.slice(0, 200),
      timestamercadopago: new Date().toISOString(),
    });

    if (ok) {
      metrics.ok++; metrics[provider].ok++;
    } else {
      metrics.fail++; metrics[provider].fail++;
    }

    return ok;
  } catch (e) {
    const latency = performance.now() - t0;
    metrics.latencies.push(latency);
    results.payments.push({
      id: `error-${index}`,
      provider,
      amount: body.amount,
      latency: latency.toFixed(1),
      status: "fail",
      httpStatus: 0,
      error: e.message,
      timestamercadopago: new Date().toISOString(),
    });
    metrics.fail++; metrics[provider].fail++;
    return false;
  }
}

function pickProvider() {
  return Math.random() * 100 < mercadopagoPct ? "mercadopago" : "payway";
}

// ---------- Main ----------
(async () => {
  console.log(`Starting payments stress → total=${total}, conc=${concurrency}, mercadopago%=${mercadopagoPct}`);
  console.log(`MERCADOPAGO:  ${mercadopagoUrl}`);
  console.log(`PAYWAY: ${paywayUrl}`);
  console.log(`Output: ${OUTPUT_PATH}`);
  const progressTimer = setInterval(logProgress, progressSec * 1000);

  const ramercadopagoStep = Math.max(1, Math.floor(ramercadopagoUpMs / Math.max(1, concurrency)));
  const tasks = [];

  for (let i = 0; i < total; i++) {
    const provider = pickProvider();
    const url = provider === "mercadopago" ? mercadopagoUrl : paywayUrl;

    const body = buildBody(provider);

    metrics.sent++;
    metrics[provider].sent++;

    // Ejecutar la request
    await postJson(url, body, provider, i)
      .then((ok) => {
        if (ok) {
          metrics.ok++;
          metrics[provider].ok++;
        } else {
          metrics.fail++;
          metrics[provider].fail++;
        }
      })
      .catch(() => {
        metrics.fail++;
        metrics[provider].fail++;
      });

    // 🔹 Esperar 1 segundo exacto antes del siguiente pago
    await sleep(200);
  }

  await Promise.allSettled(tasks);
  clearInterval(progressTimer);

  // ---------- Fin y persistencia ----------
  logProgress();
  const elapsed = Math.round((Date.now() - metrics.start) / 1000);
  const p50 = pXX(metrics.latencies, 50);
  const p95 = pXX(metrics.latencies, 95);
  const p99 = pXX(metrics.latencies, 99);

  results.finishedAt = new Date().toISOString();
  results.summary = {
    total,
    elapsedSec: elapsed,
    ok: metrics.ok,
    fail: metrics.fail,
    mercadopago: metrics.mercadopago,
    payway: metrics.payway,
    latency: { avg: pXX(metrics.latencies, 50), p95, p99 },
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2), "utf8");

  console.log(`\n==== FIN ====\nDuración: ${elapsed}s`);
  console.log(`Archivo generado: ${OUTPUT_PATH}`);
})();
