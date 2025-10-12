import logger from "../utils/logger.js";

import { google } from "googleapis";
import { getAccessToken } from "./google-auth.js";
import { config } from "../config/index.js";

export async function appendRow(values) {
  try {
    const accessToken = await getAccessToken();
    if(!accessToken) {
      return null;
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: "v4", auth });
    const range = `${config.GOOGLE.SHEET_NAME}!A1`;

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: config.GOOGLE.SHEETS_ID || config.GOOGLE.SHEETS_ID || config.GOOGLE.SHEETS_ID,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values: [values],
      },
    });

    return response?.data?.updates?.updatedRange || null;
  }
  catch (err) {
    logger.error("Error en el appendRow: " + err);
    return null;
  }
}
