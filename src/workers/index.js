import path from "path";
import { config } from "../config/index.js";
import { fork } from "child_process";
import { writeFilesFromEnv } from "../utils/bootCerts.js";

writeFilesFromEnv();

const workers = [
  "payment.worker.js",
  "invoice.worker.js",
  "retry.worker.js",
  "payway.worker.js",
  "mercadopago.worker.js"
];

if (config.ENABLE_WORKERS === "true") {
  for (const file of workers) {
    const proc = fork(path.resolve(`./src/workers/${file}`));

    proc.on("message", (msg) => console.log(`[${file}] ${msg}`));
    proc.on("exit", (code) => console.log(`❌ ${file} salió con código ${code}`));
  }
}
