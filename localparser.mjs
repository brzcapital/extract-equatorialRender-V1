// services/localparser.mjs
// ------------------------------------------------------------
// Parser local + fallback GPT para faturas Equatorial Goiás
//Extração local robusta (via pdfjs-dist 4.3.136)

//Fallback automático para GPT (usando GPT-4-turbo como primário e GPT-5 como reserva)

//Tratamento de erros, logs e respos
// ------------------------------------------------------------

import * as pdfjsLib from "pdfjs-dist";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

// --- Caminhos utilitários ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuração worker para Node 22+ ---
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
  __dirname,
  "../node_modules/pdfjs-dist/build/pdf.worker.mjs"
);

// --- Configuração da API OpenAI (fallback GPT) ---
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL_PRIMARY = "gpt-4-turbo";
const MODEL_FALLBACK = "gpt-5-turbo";

// ------------------------------------------------------------
// Função: extração local de texto das páginas PDF
// ------------------------------------------------------------
export async function extractTextFromPDF(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map((t) => t.str).join(" ") + "\n";
  }

  await pdf.destroy();
  return fullText.trim();
}

// ------------------------------------------------------------
// Função: parser local básico (regex simples)
// ------------------------------------------------------------
export function parseFaturaEquatorial(text) {
  const data = {
    distribuidora: "Equatorial Goiás",
    uc: null,
    mes_referencia: null,
    consumo_kwh: null,
    valor_total: null,
    bandeira: null,
  };

  const ucMatch = text.match(/UC\s*:?[\s\-]*([\d]{6,})/i);
  const mesRefMatch = text.match(/Referente\s+a\s+([A-Za-zçÇ]+\/\d{4})/i);
  const consumoMatch = text.match(/Consumo\s*\(?kWh\)?\s*[:\-]?\s*(\d+)/i);
  const valorMatch = text.match(/Total\s*a\s+Pagar\s*R\$\s*([\d,.]+)/i);
  const bandeiraMatch = text.match(/Bandeira\s+Tarif[aá]ria\s*:?[\s\-]*(\w+)/i);

  if (ucMatch) data.uc = ucMatch[1];
  if (mesRefMatch) data.mes_referencia = mesRefMatch[1];
  if (consumoMatch) data.consumo_kwh = Number(consumoMatch[1]);
  if (valorMatch) data.valor_total = valorMatch[1];
  if (bandeiraMatch) data.bandeira = bandeiraMatch[1];

  return data;
}

// ------------------------------------------------------------
// Função: fallback GPT para validação/correção
// ------------------------------------------------------------
async function refineWithGPT(text, dadosBase) {
  try {
    const completion = await client.chat.completions.create({
      model: MODEL_PRIMARY,
      messages: [
        {
          role: "system",
          content:
            "Você é um extrator de dados de faturas de energia da Equatorial Goiás. Retorne JSON estruturado com os campos: uc, mes_referencia, consumo_kwh, valor_total, bandeira.",
        },
        {
          role: "user",
          content: `Texto da fatura:\n${text}\n\nBase local:\n${JSON.stringify(
            dadosBase,
            null,
            2
          )}`,
        },
      ],
      temperature: 0,
    });

    const content = completion.choices[0].message.content;
    const json = JSON.parse(content);
    return json;
  } catch (err) {
    console.warn("⚠️ GPT primário falhou, tentando fallback...", err.message);
    try {
      const completion = await client.chat.completions.create({
        model: MODEL_FALLBACK,
        messages: [
          {
            role: "system",
            content:
              "Você é um extrator de dados de faturas de energia elétrica. Retorne apenas JSON válido.",
          },
          {
            role: "user",
            content: `Fatura Equatorial Goiás:\n${text}`,
          },
        ],
        temperature: 0,
      });
      return JSON.parse(completion.choices[0].message.content);
    } catch (err2) {
      console.error("❌ Falha também no fallback GPT:", err2);
      return dadosBase; // Retorna o que já foi extraído localmente
    }
  }
}

// ------------------------------------------------------------
// Função principal: processar PDF com fallback GPT
// ------------------------------------------------------------
export async function processFaturaPDF(buffer) {
  try {
    // 1️⃣ Extração local
    const texto = await extractTextFromPDF(buffer);
    const dadosLocais = parseFaturaEquatorial(texto);

    // 2️⃣ Se dados locais vierem incompletos → chama GPT
    const incompleto = Object.values(dadosLocais).some(
      (v) => v === null || v === ""
    );

    let dadosFinais = dadosLocais;
    if (incompleto) {
      console.log("🔄 Dados incompletos — acionando GPT...");
      const refinado = await refineWithGPT(texto, dadosLocais);
      dadosFinais = { ...dadosLocais, ...refinado };
    }

    return {
      status: "ok",
      origem: incompleto ? "local+gpt" : "local",
      dados_extraidos: dadosFinais,
    };
  } catch (err) {
    console.error("❌ Erro geral no processamento:", err);
    return {
      status: "erro",
      mensagem: "Falha ao processar fatura.",
      detalhes: err.message,
    };
  }
}
