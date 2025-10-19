import express from "express";
import multer from "multer";
import morgan from "morgan";
import cors from "cors";
import crypto from "crypto";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { env } = require("./package.json");

// --- Ajuste PDFJS ---
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const ENV = {
  PORT: env.PORT || "10000",
  USE_GPT: env.USE_GPT === "true",
  OPENAI_API_KEY: env.OPENAI_API_KEY || "",
  PRIMARY_MODEL: env.PRIMARY_MODEL || "gpt-4o-mini",
  FALLBACK_MODEL: env.FALLBACK_MODEL || "gpt-5-mini",
  LOG_RING_SIZE: parseInt(env.LOG_RING_SIZE || "200", 10)
};

// PDF parser (somente local)

import { processFaturaPDF } from "./services/localparser.mjs";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const ring = [];
const log = (level, msg, meta) => {
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta || {}) };
  ring.push(entry);
  if (ring.length > ENV.LOG_RING_SIZE) ring.shift();
  console.log(`[${entry.ts}] ${level}: ${msg}`);
};

// Normalizador simples
function normalize(text) {
  return String(text).replace(/\r/g, "\n").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// Função de extração simplificada
async function extractTextWithPdfjs(buffer) {
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(" ") + "\n\n";
  }
  await doc.destroy();
  return normalize(text);
}

// Extração local
function extrairCamposLocais(text) {
  const find = (regex, idx = 1) => {
    const m = regex.exec(text);
    return m ? m[idx] : null;
  };
  const toNum = s => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : null);

  const unidade_consumidora = find(/(UC|Unidade\s*Consumidora)\D+(\d{6,14})/i, 2);
  const total_a_pagar = toNum(find(/total\s+a\s+pagar\D+([\d\.,]+)/i));
  const data_vencimento = find(/vencimento\D+(\d{2}\/\d{2}\/\d{4})/i);
  const leitura_atual = find(/leitura\s*atual\D+(\d{1,6})/i);
  const leitura_anterior = find(/leitura\s*anterior\D+(\d{1,6})/i);
  const mes_referencia = find(/refer[eê]ncia\D+([A-Z]{3}\/\d{2,4})/i);

  return {
    unidade_consumidora,
    total_a_pagar,
    data_vencimento,
    leitura_anterior,
    leitura_atual,
    mes_referencia
  };
}

// Rotas
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(morgan("tiny"));

app.get("/health", (req, res) => {
  res.json({ ok: true, versao: "v1", use_gpt: ENV.USE_GPT });
});

app.get("/logs", (req, res) => {
  res.json(ring.slice(-100));
});

app.post("/extract-local", upload.single("fatura"), async (req, res) => {
  try {
    const buffer = req.file.buffer;
    const resultado = await processFaturaPDF(buffer);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: "Falha ao processar fatura." });
  }
});


const port = parseInt(ENV.PORT, 10) || 10000;
app.listen(port, () => console.log(`🚀 Servidor rodando na porta ${port}`));
