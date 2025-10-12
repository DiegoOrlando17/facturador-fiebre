import fs from "fs";
import logger from "../utils/logger.js";

import { google } from "googleapis";
import { getAccessToken } from "./google-auth.js";
import { config } from "../config/index.js";

export async function uploadToDrive(pdfPath, filename) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return null;
    }
    
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [config.GOOGLE.DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "application/pdf",
        body: fs.createReadStream(pdfPath),
      },
      fields: "id, webViewLink",
    });

    fs.unlink(pdfPath, (err) => {
      if (err) console.error(`❌ Error al eliminar ${pdfPath}:`, err);
    });

    return res.data;
  }
  catch (err) {
    logger.error("Error en el uploadToDrive: " + err);
    return null;
  }
}
