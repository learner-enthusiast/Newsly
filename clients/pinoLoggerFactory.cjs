const pino = require("pino");

/** @type {Record<string, number>} */
const CUSTOM_LEVELS = {
  success: 32,
  pipeline: 34,
  pipelineError: 48,
};

function shouldUsePrettyPrint() {
  if (process.env.LOG_PRETTY === "0") {
    return false;
  }
  if (process.env.LOG_PRETTY === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

function buildPrettyStream() {
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  const pinoPretty = require("pino-pretty");
  return pinoPretty({
    colorize: true,
    translateTime: "SYS:HH:MM:ss.l",
    ignore: "pid,hostname",
    customLevels: "success:32,pipeline:34,pipelineError:48",
    customColors:
      "error:red,warn:yellow,success:green,pipeline:blue,pipelineError:magenta,info:cyan,debug:gray,trace:gray,fatal:bgRed",
  });
}

/**
 * @param {import('pino').LoggerOptions} [defaultConfig]
 * @returns {import('pino').Logger}
 */
function createPinoInstance(defaultConfig = {}) {
  const level =
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug");

  const options = {
    ...defaultConfig,
    level,
    customLevels: CUSTOM_LEVELS,
  };

  if (shouldUsePrettyPrint()) {
    try {
      return pino(options, buildPrettyStream());
    } catch {
      return pino(options);
    }
  }

  return pino(options);
}

module.exports = {
  CUSTOM_LEVELS,
  createPinoInstance,
};
