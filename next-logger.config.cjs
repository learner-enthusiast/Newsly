const { createPinoInstance } = require("./clients/pinoLoggerFactory.cjs");

/** Used by next-logger to patch Next.js + console output. */
module.exports = {
  logger: (defaultConfig) => createPinoInstance(defaultConfig),
};
