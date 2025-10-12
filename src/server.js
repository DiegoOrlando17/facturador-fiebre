import app from "./app.js";
import logger from "./utils/logger.js";

import { config } from "./config/index.js";
import { writeFilesFromEnv } from "./utils/bootCerts.js";

const { PORT } = config;

writeFilesFromEnv();

app.listen(PORT, () => {
  logger.info(`API escuchando en http://localhost:${PORT}`);
});
