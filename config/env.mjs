// config/env.mjs
export const ENV = {
  PORT: process.env.PORT || "10000",
  USE_GPT: (process.env.USE_GPT || "false").toLowerCase() == "true",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  PRIMARY_MODEL: process.env.PRIMARY_MODEL || "gpt-4o-mini",
  FALLBACK_MODEL: process.env.FALLBACK_MODEL || "gpt-5-mini",
  LOG_RING_SIZE: parseInt(process.env.LOG_RING_SIZE || "200", 10)
};
