import fs from "fs";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

/**
 * Extrai texto de um PDF local.
 * Retorna o texto completo para processamento.
 */
export async function extractTextFromPDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return fullText.trim();
}

/**
 * Faz um parsing básico da fatura Equatorial.
 * Posteriormente, pode ser refinado com GPT para campos específicos.
 */
export async function parseLocalFatura(text) {
  const result = {};

  // Exemplo de regex básicas:
  result.unidade_consumidora =
    text.match(/UC\s*(\d{6,})/)?.[1] || "Não encontrado";
  result.total_a_pagar =
    text.match(/Total a Pagar[^0-9]*([\d.,]+)/i)?.[1] || null;
  result.data_vencimento =
    text.match(/Vencimento[:\s]*([0-9/]+)/i)?.[1] || null;
  result.mes_referencia =
    text.match(/Referente a[:\s]*([A-Z]{3}\/\d{4})/i)?.[1] || null;

  return result;
}
