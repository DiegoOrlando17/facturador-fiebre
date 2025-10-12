import fs from "fs";
import path from "path";
import axios from "axios";
import readline from "readline";
import logger from "../utils/logger.js";

import { google } from "googleapis";
import { config } from "../config/index.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_PATH = path.resolve(__dirname, "../../", config.GOOGLE.TOKEN);

export async function getAccessToken() {
  try {
    // lee token.json si existe y no venció
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
      if (token.expiry_date && Date.now() < token.expiry_date) {
        return token.access_token;
      }
      if (token.refresh_token) {
        const refreshed = await refresh(token.refresh_token);
        const merged = { ...token, ...refreshed, expiry_date: Date.now() + refreshed.expires_in * 1000 };
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
        return merged.access_token;
      }
    }
  }
  catch (err) {
    logger.error("Error en el getAccessToken: " + err);
    return null;
  }
}

async function refresh(refresh_token) {  
  const response = await axios.post("https://oauth2.googleapis.com/token", null, {
    params: {
      client_id: config.GOOGLE.CLIENT_ID,
      client_secret: config.GOOGLE.CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    },

  });
  return response.data; // { access_token, expires_in, scope, token_type }
}

async function getNewToken() {
  const SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets"
  ];

  const oAuth2Client = new google.auth.OAuth2(config.GOOGLE.CLIENT_ID, config.GOOGLE.CLIENT_SECRET, "urn:ietf:wg:oauth:2.0:oob");

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("Authorize this app by visiting this url:", authUrl);

  // Copiá el código de la URL y pegalo en consola
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", async (code) => {
    rl.close();
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log("✅ Tokens stored to", TOKEN_PATH);
  });
}

//getNewToken();
