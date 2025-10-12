import path from "path";
import fs from "fs";
import axios from "axios";
import logger from "../utils/logger.js";

import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { parseStringPromise } from "xml2js";
import { config } from "../config/index.js";
import { caeDueToDMY } from "../utils/date.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const traPath = path.resolve(__dirname, "../../", config.AFIP.TRA);
const traCmsPath = path.resolve(__dirname, "../../", config.AFIP.TRACMS);
const taPath = path.resolve(__dirname, "../../", config.AFIP.TA);
const certPath = path.resolve(__dirname, "../../", config.AFIP.CERT);
const keyPath = path.resolve(__dirname, "../../", config.AFIP.KEY);

// 1. Generar TRA.xml
function generarTRA() {
  const now = new Date();
  const genTime = new Date(now.getTime() - 600000).toISOString(); // -10 min
  const expTime = new Date(now.getTime() + 600000).toISOString(); // +10 min

  const tra = `<?xml version="1.0" encoding="UTF-8"?>
    <loginTicketRequest version="1.0">
      <header>
        <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
        <generationTime>${genTime}</generationTime>
        <expirationTime>${expTime}</expirationTime>
      </header>
      <service>wsfe</service>
    </loginTicketRequest>`;

  fs.writeFileSync(traPath, tra);
  return traPath;
}

// 2. Firmar con OpenSSL para generar CMS en DER + base64 limpio
function firmarTRA() {
  execSync(`openssl cms -sign -in ${traPath} -signer ${certPath} -inkey ${keyPath} -out ${traCmsPath} -outform DER -nodetach -nosmimecap -noattr -md sha1`);
  const cmsDer = fs.readFileSync(traCmsPath);
  return cmsDer.toString("base64"); // limpio en una sola línea
}

// 3. Enviar CMS a WSAA y parsear respuesta
async function pedirTA(cmsB64) {
  const soapEnvelope = `
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
    <soapenv:Header/>
    <soapenv:Body>
      <wsaa:loginCms>
        <wsaa:in0>${cmsB64}</wsaa:in0>
      </wsaa:loginCms>
    </soapenv:Body>
  </soapenv:Envelope>`;

  const { data } = await axios.post(config.AFIP.WSAA_URL, soapEnvelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    timeout: 30000,
  });

  // 1er parseo: SOAP
  const parsedSoap = await parseStringPromise(data, { explicitArray: false });
  let cmsReturn = parsedSoap["soapenv:Envelope"]["soapenv:Body"]["loginCmsResponse"]["loginCmsReturn"];

  // limpiar CDATA si está presente
  cmsReturn = cmsReturn.replace("<![CDATA[", "").replace("]]>", "");

  // 2do parseo: TA real
  const parsedTA = await parseStringPromise(cmsReturn, { explicitArray: false });
  const ta = {
    token: parsedTA.loginTicketResponse.credentials.token,
    sign: parsedTA.loginTicketResponse.credentials.sign,
    generationTime: parsedTA.loginTicketResponse.header.generationTime,
    expirationTime: parsedTA.loginTicketResponse.header.expirationTime,
    destination: parsedTA.loginTicketResponse.header.destination,
  };

  fs.writeFileSync(taPath, JSON.stringify(ta, null, 2));
  console.log("✅ TA guardado en TA-wsfe.json");
  return ta;
}

// Obtiene TA válido (desde archivo o generando uno nuevo)
async function getTA() {
  if (fs.existsSync(taPath)) {
    const ta = JSON.parse(fs.readFileSync(taPath, "utf8"));
    if (new Date(ta.expirationTime) > new Date()) {
      return ta;
    } else {
      console.log("⚠️ TA vencido, generando uno nuevo...");
    }
  }

  const traFile = generarTRA();
  const cmsB64 = firmarTRA(traFile);
  return await pedirTA(cmsB64);
}

// Consulta último comprobante
export async function getLastInvoiceAFIP(PtoVta, CbteTipo) {
  try {
    const ta = await getTA();

    const soapEnvelope = `
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soap:Header/>
    <soap:Body>
      <ar:FECompUltimoAutorizado>
        <ar:Auth>
          <ar:Token>${ta.token}</ar:Token>
          <ar:Sign>${ta.sign}</ar:Sign>
          <ar:Cuit>${config.CUIT}</ar:Cuit>
        </ar:Auth>
        <ar:PtoVta>${PtoVta}</ar:PtoVta>
        <ar:CbteTipo>${CbteTipo}</ar:CbteTipo>
      </ar:FECompUltimoAutorizado>
    </soap:Body>
  </soap:Envelope>`;

    const { data } = await axios.post(config.AFIP.WSFE_URL, soapEnvelope, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado",
      },
    });

    const parsed = await parseStringPromise(data, { explicitArray: false });
    const result = parsed["soap:Envelope"]["soap:Body"]["FECompUltimoAutorizadoResponse"]["FECompUltimoAutorizadoResult"];

    return Number(result?.CbteNro);
  }
  catch (err) {
    logger.error("No se pudo obtener el ultimo comprobante de AFIP. " + err);
    return null;
  }
}

// Crea una factura (FECAESolicitar)
export async function createInvoiceAFIP(cbteNro, paymentTotal) {
  try {
    const ta = await getTA();
    const total = paymentTotal.toFixed(2);
    const neto = (total / 1.21).toFixed(2);
    const iva = (total - neto).toFixed(2);

    const soapEnvelope = `
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soap:Header/>
    <soap:Body>
      <ar:FECAESolicitar>
        <ar:Auth>
          <ar:Token>${ta.token}</ar:Token>
          <ar:Sign>${ta.sign}</ar:Sign>
          <ar:Cuit>${config.CUIT}</ar:Cuit>
        </ar:Auth>
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${config.AFIP.PTO_VTA}</ar:PtoVta>
            <ar:CbteTipo>${config.AFIP.CBTE_TIPO}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>1</ar:Concepto> <!-- 1: Productos -->
              <ar:DocTipo>99</ar:DocTipo>  <!-- 99: Consumidor Final -->              
              <ar:DocNro>0</ar:DocNro>
              <ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId>
              <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
              <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
              <ar:CbteFch>${new Date().toISOString().slice(0, 10).replace(/-/g, "")}</ar:CbteFch>
              <ar:ImpTotal>${total}</ar:ImpTotal>
              <ar:ImpTotConc>0.00</ar:ImpTotConc>
              <ar:ImpNeto>${neto}</ar:ImpNeto>
              <ar:ImpOpEx>0.00</ar:ImpOpEx>
              <ar:ImpIVA>${iva}</ar:ImpIVA>
              <ar:ImpTrib>0.00</ar:ImpTrib>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1.00</ar:MonCotiz>
              <ar:Iva>
                <ar:AlicIva>
                    <ar:Id>5</ar:Id>
                    <ar:BaseImp>${neto}</ar:BaseImp>
                    <ar:Importe>${iva}</ar:Importe>
                </ar:AlicIva>
            </ar:Iva>
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>
    </soap:Body>
  </soap:Envelope>`;

    const response = await axios.post(config.AFIP.WSFE_URL, soapEnvelope, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      },
    });

    const data = response.data;
    const parsed = await parseStringPromise(data, { explicitArray: false });
    const result = parsed["soap:Envelope"]["soap:Body"]["FECAESolicitarResponse"]["FECAESolicitarResult"];
    const detalle = result.FeDetResp.FECAEDetResponse;
    if (detalle.Resultado === "R") {
      logger.error("Error obteniendo el CAE. " + result.Errors.Err.Msg);
      return null;
    }
    const cae = detalle.CAE;
    const nroComprobante = formatNroCbte(detalle.CbteDesde);
    const fechaVtoCae = caeDueToDMY(detalle.CAEFchVto);

    return { cae, nroComprobante, fechaVtoCae };
  }
  catch (err) {
    logger.error("Error obteniendo el CAE. " + err);
    return null;
  }
}

function formatNroCbte(nroComprobante) {
  if (!nroComprobante) return "";
  return `${config.AFIP.PTO_VTA.toString().padStart(5, "0")}-${nroComprobante.toString().padStart(8, "0")}`;
}

// function formatFechaAfip(yyyymmdd) {
//   if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
//   const yyyy = yyyymmdd.substring(0, 4);
//   const mm = yyyymmdd.substring(4, 6);
//   const dd = yyyymmdd.substring(6, 8);
//   return `${dd}/${mm}/${yyyy}`;
// }

// import logger from "../utils/logger.js";
// import path from "path";
// import Afip from "@afipsdk/afip.js";
// import { config } from "../config/index.js";
// import { caeDueToDMY } from "../utils/date.js";
// import { fileURLToPath } from "url";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const certPath = path.resolve(__dirname, "../../", config.AFIP.CERT);
// const keyPath = path.resolve(__dirname, "../../", config.AFIP.KEY);

// const afip = new Afip({
//   CUIT: config.CUIT,
//   cert: certPath,
//   key: keyPath,
//   production: config.AFIP.PRODUCTION
// });

// export async function getLastInvoiceAFIP() {
//   console.log("entro a get last invoice afip")
//   console.log(config.AFIP.PTO_VTA + "" + config.AFIP.CBTE_TIPO)
//   try {
//     const last = await afip.ElectronicBilling.getLastVoucher(config.AFIP.PTO_VTA, config.AFIP.CBTE_TIPO);
//     return last;
//   }
//   catch (err) {
//     logger.error("No se pudo obtener el ultimo comprobante de AFIP. " + err);
//     return null;
//   }
// }

// export async function createInvoiceAFIP(cbteNro, paymentTotal) {
//   try {
//     const total = paymentTotal.toFixed(2);
//     const neto = total / (1 + config.AFIP.ALIC_IVA / 100);
//     const iva = (total - neto).toFixed(2);

//     const data = {
//       CantReg: 1,
//       PtoVta: config.AFIP.PTO_VTA,
//       CbteTipo: config.AFIP.CBTE_TIPO,
//       Concepto: 1,
//       DocTipo: 99,
//       DocNro: 0,
//       CbteDesde: cbteNro,
//       CbteHasta: cbteNro,
//       CbteFch: today,
//       ImpTotal: Number(total),
//       ImpTotConc: 0,
//       ImpNeto: Number(neto),
//       ImpOpEx: 0,
//       ImpIVA: Number(iva),
//       ImpTrib: 0,
//       MonId: "PES",
//       MonCotiz: 1,
//       Iva: [
//         {
//           Id: Number(config.AFIP.ALIC_IVA) === 21 ? 5 : 0,
//           BaseImp: Number(neto),
//           Importe: Number(iva)
//         }
//       ]
//     };

//     const res = await afip.ElectronicBilling.createVoucher(data);
//     return {
//       cae: res['CAE'],
//       nroComprobante: cbteNro,
//       fechaVtoCae: caeDueToDMY(res['CAEFchVto']),
//     };
//   }
//   catch (err) {
//     logger.error("Error obteniendo el CAE. " + err);
//     return null;
//   }
// }