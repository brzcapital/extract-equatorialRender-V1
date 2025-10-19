// services/localparser.mjs
// -----------------------------------------------
// Parser local de faturas Equatorial Goiás
// Extração de texto 100% local, sem dependência do GPT
// Compatível com Node 22+ e pdfjs-dist v4.x
// -----------------------------------------------

import * as pdfjsLib from "pdfjs-dist";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Corrige o erro “does not provide an export named 'default'”
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
  __dirname,
  "../node_modules/pdfjs-dist/build/pdf.worker.mjs"
);

/**
 * Extrai o texto de todas as páginas de um PDF em buffer.
 * @param {Buffer} buffer - Arquivo PDF em formato Buffer
 * @returns {Promise<string>} - Texto completo extraído
 */
export async function extractTextFromPDF(buffer) {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(" ");
      fullText += `\n--- Página ${pageNum} ---\n${text}\n`;
    }

    await pdf.destroy();
    return fullText.trim();
  } catch (err) {
    console.error("❌ Erro ao extrair texto do PDF:", err);
    throw new Error("Falha ao processar o PDF localmente.");
  }
}

/**
 * Processa o texto extraído e estrutura os campos principais.
 * Aqui você pode evoluir a lógica para capturar
 * consumo, UC, data, valores, etc.
 * @param {string} text - Texto completo do PDF
 * @returns {Object} - Dados estruturados básicos
 */
export function parseFaturaEquatorial(text) {
  const data = {
    distribuidora: "Equatorial Goiás",
    uc: null,
    mes_referencia: null,
    consumo_kwh: null,
    valor_total: null,
    bandeira: null,
  };

  // Regex simples inicial (pode ser refinado)
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

/**
 * Função principal: extrai e estrutura os dados do PDF
 * @param {Buffer} buffer - Arquivo PDF
 * @returns {Promise<Object>} - Dados estruturados
 */
export async function processFaturaPDF(buffer) {
  const texto = await extractTextFromPDF(buffer);
  const dados = parseFaturaEquatorial(texto);
  return {
    status: "ok",
    origem: "local",
    dados_extraidos: dados,
  };
}
