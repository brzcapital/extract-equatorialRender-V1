import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { env } = require("./package.json");

export const ENV = {
  PORT: env.PORT || "10000",
  USE_GPT: env.USE_GPT === "true",
  OPENAI_API_KEY: env.OPENAI_API_KEY || "",
  PRIMARY_MODEL: env.PRIMARY_MODEL || "gpt-4o-mini",
  FALLBACK_MODEL: env.FALLBACK_MODEL || "gpt-5-mini",
  LOG_RING_SIZE: parseInt(env.LOG_RING_SIZE || "200", 10)
};
import express from "express";
import multer from "multer";
import morgan from "morgan";
import cors from "cors";
import crypto from "crypto";
import { createRequire } from "module";
import { extrairCamposLocais } from "./services/localParser.mjs";
import { jsonrepair } from "jsonrepair";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
const pdfjsWorker = require("pdfjs-dist/legacy/build/pdf.worker.js");
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const ring = [];
const log = (level, msg, meta) => {
  const entry = { ts: new Date().toISOString(), level, msg, ...(meta || {}) };
  ring.push(entry);
  if (ring.length > ENV.LOG_RING_SIZE) ring.shift();
  console[level === "error" ? "error" : "log"](`[${entry.ts}] ${level}: ${msg}`);
};

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(morgan("tiny"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    versao: "vE3-refined",
    use_gpt: ENV.USE_GPT,
    primary: ENV.PRIMARY_MODEL,
    fallback: ENV.FALLBACK_MODEL
  });
});

app.get("/logs", (req, res) => {
  res.json(ring.slice(-200));
});

async function extractTextWithPdfjs(buffer) {
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map(i => i.str).join(" ");
    text += pageText + "\n\n";
  }
  await doc.destroy();
  return text;
}

async function callOpenAIChatStrictJSON(rawText) {
  const key = ENV.OPENAI_API_KEY;
  if (!ENV.USE_GPT || !key) {
    return { used: false, tokens: 0, monthly: 0, data: null };
  }
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: key });
  const schema = {
    name: "extrator_equatorial_v1",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        unidade_consumidora: { type: ["string","null"] },
        total_a_pagar: { type: ["number","null"] },
        data_vencimento: { type: ["string","null"] },
        data_leitura_anterior: { type: ["string","null"] },
        data_leitura_atual: { type: ["string","null"] },
        data_proxima_leitura: { type: ["string","null"] },
        data_emissao: { type: ["string","null"] },
        apresentacao: { type: ["string","null"] },
        mes_ao_referencia: { type: ["string","null"] },
        leitura_anterior: { type: ["number","null"] },
        leitura_atual: { type: ["number","null"] },
        beneficio_tarifario_bruto: { type: ["number","null"] },
        beneficio_tarifario_liquido: { type: ["number","null"] },
        icms: { type: ["number","null"] },
        pis_pasep: { type: ["number","null"] },
        cofins: { type: ["number","null"] },
        fatura_debito_automatico: { type: "string", enum: ["yes","no"] },
        credito_recebido: { type: ["number","null"] },
        saldo_kwh: { type: ["number","null"] },
        excedente_recebido: { type: ["number","null"] },
        ciclo_geracao: { type: ["string","null"] },
        informacoes_para_o_cliente: { type: "string" },
        uc_geradora: { type: ["string","null"] },
        uc_geradora_producao: { type: ["number","null"] },
        cadastro_rateio_geracao_uc: { type: ["string","null"] },
        cadastro_rateio_geracao_percentual: { type: ["number","null"] },
        injecoes_scee: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["uc","quant_kwh","preco_unit_com_tributos","tarifa_unitaria"],
            properties: {
              uc: { type: "string" },
              quant_kwh: { type: ["number","null"] },
              preco_unit_com_tributos: { type: ["number","null"] },
              tarifa_unitaria: { type: ["number","null"] }
            }
          }
        },
        consumo_scee_quant: { type: ["number","null"] },
        consumo_scee_preco_unit_com_tributos: { type: ["number","null"] },
        consumo_scee_tarifa_unitaria: { type: ["number","null"] },
        media: { type: ["number","null"] },
        parc_injet_s_desc_percentual: { type: ["number","null"] },
        observacoes: { type: "string" }
      },
      required: ["unidade_consumidora","total_a_pagar","data_vencimento","data_leitura_anterior","data_leitura_atual","data_proxima_leitura","data_emissao","apresentacao","mes_ao_referencia","leitura_anterior","leitura_atual","beneficio_tarifario_bruto","beneficio_tarifario_liquido","icms","pis_pasep","cofins","fatura_debito_automatico","credito_recebido","saldo_kwh","excedente_recebido","ciclo_geracao","informacoes_para_o_cliente","uc_geradora","uc_geradora_producao","cadastro_rateio_geracao_uc","cadastro_rateio_geracao_percentual","injecoes_scee","consumo_scee_quant","consumo_scee_preco_unit_com_tributos","consumo_scee_tarifa_unitaria","media","parc_injet_s_desc_percentual","observacoes"]
    }
  };

  const prompt = [
    "Você é um extrator de faturas da Equatorial. Responda APENAS JSON válido.",
    "Regras:",
    "- 'apresentacao' é a data exata do campo 'Apresentação' (fim da fatura), dd/mm/aaaa.",
    "- 'data_proxima_leitura' é a 3ª data da tabela 'Data de leituras'.",
    "- 'beneficio_tarifario_liquido' deve ser negativo (se positivo, torne negativo).",
    "- 'consumo_scee_tarifa_unitaria' <= 'consumo_scee_preco_unit_com_tributos'; caso contrário, null.",
    "- Preencha **todos** os campos, usando null quando ausente.",
    "",
    "Texto da fatura:\n---\n" + rawText + "\n---"
  ].join("\n");

  const resp = await client.responses.create({
    model: ENV.PRIMARY_MODEL,
    input: prompt,
    text: { format: { type: "json_schema", json_schema: schema } }
  }).catch(async () => {
    const resp2 = await client.responses.create({
      model: ENV.FALLBACK_MODEL,
      input: prompt,
      text: { format: { type: "json_schema", json_schema: schema } }
    });
    return resp2;
  });

  const txt = resp.output_text || "";
  let parsed = null;
  try { parsed = JSON.parse(jsonrepair(txt)); } catch { parsed = null; }
  return { used: true, tokens: resp?.usage?.total_tokens || 0, monthly: 0, data: parsed };
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

app.post("/extract-hybrid", upload.single("fatura"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo PDF ausente. Campo 'fatura' obrigatório." });
    const buffer = req.file.buffer;
    const hash_pdf = hashBuffer(buffer);
    const texto = await extractTextWithPdfjs(buffer);

    const { data: base, inconsistencias } = extrairCamposLocais(texto);

    let gpt = { used: false, tokens: 0, monthly: 0, data: null };
    let finalData = { ...base };

    if (ENV.USE_GPT && inconsistencias.length){
      const g = await callOpenAIChatStrictJSON(texto);
      if (g.used && g.data) {
        gpt = g;
        for (const k of Object.keys(g.data)) {
          if (finalData[k] == null || finalData[k] === "" ) finalData[k] = g.data[k];
        }
      }
    }

    res.json({
      ok: true,
      hash_pdf,
      health: { inconsistencias, gpt_used: gpt.used, tokens_used: gpt.tokens, monthly_tokens: gpt.monthly },
      data: finalData
    });
  } catch (err) {
    log("error", "Falha ao processar fatura", { err: String(err) });
    res.status(500).json({ error: "Falha ao processar a fatura." });
  }
});

const port = parseInt(ENV.PORT, 10) || 10000;
app.listen(port, () => {
  const msg = `🚀 Servidor rodando na porta ${port}`;
  ring.push({ ts: new Date().toISOString(), level: "info", msg });
  console.log(msg);
});
