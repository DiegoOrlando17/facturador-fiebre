import dotenv from "dotenv";
dotenv.config();

export const config = {
  PORT: process.env.PORT || 5000,
  CUIT: Number(process.env.CUIT),

  MP: {
    ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
    PUBLIC_KEY: process.env.MP_PUBLIC_KEY,
    API_URL: process.env.MP_API_URL,
    POLLING_INTERVAL: process.env.MP_POLLING_INTERVAL
  },
  
  PAYWAY: {
    PUBLIC_KEY: process.env.PAYWAY_API_KEY_PUBLIC,
    PRIVATE_KEY: process.env.PAYWAY_API_KEY_PRIVATE,
    API_URL: process.env.PAYWAY_API_URL,
    POLLING_INTERVAL: process.env.PAYWAY_POLLING_INTERVAL
  },
  
  AFIP: {
    TRA_B64: process.env.AFIP_TRA_B64,
    TRACMS_B64: process.env.AFIP_TRACMS_B64,
    TA_B64: process.env.AFIP_TA_B64,
    CERT_B64: process.env.AFIP_CERT_B64,
    KEY_B64: process.env.AFIP_KEY_B64,
    TRA: process.env.AFIP_TRA_PATH,
    TRACMS: process.env.AFIP_TRACMS_PATH,
    TA: process.env.AFIP_TA_PATH,
    CERT: process.env.AFIP_CERT_PATH,
    KEY: process.env.AFIP_KEY_PATH,
    WSAA_URL: process.env.AFIP_WSAA_URL,
    WSFE_URL: process.env.AFIP_WSFE_URL,
    PRODUCTION: process.env.AFIP_PRODUCTION || "false",
    PTO_VTA: Number(process.env.AFIP_PTO_VTA || 1),
    CBTE_TIPO: Number(process.env.AFIP_CBTE_TIPO || 6),
    ALIC_IVA: Number(process.env.AFIP_ALIC_IVA || 21),
  },

  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    DRIVE_FOLDER_ID: process.env.DRIVE_FOLDER_ID,
    SHEETS_ID: process.env.SHEET_ID,
    SHEET_NAME: process.env.SHEET_NAME || "Hoja1",
    TOKEN_B64: process.env.GOOGLE_TOKEN_B64,
    TOKEN: process.env.GOOGLE_TOKEN_PATH,
  },

  NGROK_URL: process.env.NGROK_URL,

  REDIS_URL: process.env.REDIS_URL,

};