import path from "path";
import { fork } from "child_process";
import { writeFilesFromEnv } from "../utils/bootCerts.js";

writeFilesFromEnv();

const workers = [
  "webhook.worker.js",
  "payment.worker.js",
  "invoice.worker.js",
  "retry.worker.js",
  "payway.worker.js",
];

for (const file of workers) {
  const proc = fork(path.resolve(`./src/workers/${file}`));

  proc.on("message", (msg) => console.log(`[${file}] ${msg}`));
  proc.on("exit", (code) => console.log(`❌ ${file} salió con código ${code}`));
}
