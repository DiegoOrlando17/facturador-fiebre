import fs from "fs";
import { config } from "../config/index.js";

export function writeFilesFromEnv() {
  if (config.AFIP.CERT_B64) {
    const crt = Buffer.from(config.AFIP.CERT_B64, "base64");
    fs.writeFileSync("/tmp/certificado.crt", crt);
    config.AFIP.CERT = "/tmp/certificado.crt";
  }
  if (config.AFIP.KEY_B64) {
    const key = Buffer.from(config.AFIP.KEY_B64, "base64");
    fs.writeFileSync("/tmp/clave.key", key);
    config.AFIP.KEY = "/tmp/clave.key";
  }
  if (config.AFIP.TRA_B64) {
    const tra = Buffer.from(config.AFIP.TRA_B64, "base64");
    fs.writeFileSync("/tmp/tra.xml", tra);
    config.AFIP.TRA = "/tmp/tra.xml";
  }
  if (config.AFIP.TRACMS_B64) {
    const tracms = Buffer.from(config.AFIP.TRACMS_B64, "base64");
    fs.writeFileSync("/tmp/tra.cms", tracms);
    config.AFIP.TRACMS = "/tmp/tra.cms";
  }
  if (config.AFIP.TA_B64) {
    const ta = Buffer.from(config.AFIP.TA_B64, "base64");
    fs.writeFileSync("/tmp/TA-wsfe.json", ta);
    config.AFIP.TA = "/tmp/TA-wsfe.json";
  }
  if (config.GOOGLE.TOKEN_B64) {
    const token = Buffer.from(config.GOOGLE.TOKEN_B64, "base64");
    fs.writeFileSync("/tmp/token.json", token);
    config.GOOGLE.TOKEN = "/tmp/token.json";
  }
}
