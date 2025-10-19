\
// services/localParser.mjs
export function extrairCamposLocais(fullText){
  const inconsistencias = [];
  const norm = normalize(fullText);

  const find = (regex, idx=1) => {
    const m = regex.exec(norm);
    return m ? m[idx] : null;
  };
  const findAll = (regex) => {
    const out = [];
    let m;
    while ((m = regex.exec(norm))) out.push(m);
    return out;
  };
  const toNum = (s) => {
    if (s == null) return null;
    const t = s.replace(/\./g, "").replace(",", ".");
    const v = Number(t);
    return Number.isFinite(v) ? v : null;
  };
  const toInt = (s) => {
    const v = parseInt(String(s||"").replace(/[^\d]/g,""), 10);
    return Number.isFinite(v) ? v : null;
  };

  const unidade_consumidora = find(/(?:Unidade\s*Consumidora|UC)\D+(\d{6,14})/i);
  const data_vencimento = find(/data\s+de\s+vencimento\D+(\d{2}\/\d{2}\/\d{4})/i) || find(/vencimento\D+(\d{2}\/\d{2}\/\d{4})/i);
  const data_emissao = find(/emiss[aã]o\D+(\d{2}\/\d{2}\/\d{4})/i);
  const apresentacao = find(/apresenta[cç][aã]o\D+(\d{2}\/\d{2}\/\d{4})/i);

  const datasLeit = findAll(/data\s+de\s+leituras?:?\s*([\d/]{10}).*?([\d/]{10}).*?([\d/]{10})/is);
  let data_leitura_anterior = null, data_leitura_atual = null, data_proxima_leitura = null;
  if (datasLeit.length) {
    data_leitura_anterior = datasLeit[0][1];
    data_leitura_atual = datasLeit[0][2];
    data_proxima_leitura = datasLeit[0][3];
  } else {
    const mm = findAll(/(?:Leitura\s*Anterior|Anterior)\D+(\d{2}\/\d{2}\/\d{4}).*?(?:Leitura\s*Atual|Atual)\D+(\d{2}\/\d{2}\/\d{4}).*?(?:Pr[oó]xima\s*Leitura|Pr[oó]xima)\D+(\d{2}\/\d{2}\/\d{4})/is);
    if (mm.length){
      data_leitura_anterior = mm[0][1]; data_leitura_atual = mm[0][2]; data_proxima_leitura = mm[0][3];
    }
  }

  const mes_ano_referencia = find(/refer[eê]ncia\D+([A-Z]{3}\/\d{2,4})/i) || find(/\b([A-Z]{3}\/\d{2,4})\b/);
  const leitura_anterior = toInt(find(/leitura\s*anterior\D+(\d{3,7})/i));
  const leitura_atual = toInt(find(/leitura\s*atual\D+(\d{3,7})/i));

  const total_a_pagar = toNum(find(/total\s+a\s+pagar\D+([\d\.,]+)\b/i));
  let beneficio_tarifario_bruto = toNum(find(/benef[ií]cio\s+tarif[aá]rio\s+bruto\D+([\d\.,]+)/i));
  let beneficio_tarifario_liquido = toNum(find(/benef[ií]cio\s+tarif[aá]rio\s+liqu[ií]do\D+([\d\.,-]+)/i));
  if (beneficio_tarifario_liquido != null && beneficio_tarifario_liquido > 0) beneficio_tarifario_liquido = -Math.abs(beneficio_tarifario_liquido);
  const icms = toNum(find(/\bicms\D+([\d\.,]+)/i));
  const pis_pasep = toNum(find(/pis[\/\s-]*pasep\D+([\d\.,]+)/i));
  const cofins = toNum(find(/\bcofins\D+([\d\.,]+)/i));

  const fatura_debito_automatico = /d[eé]bito\s+autom[aá]tico\D+(sim|yes|ativo)/i.test(norm) ? "yes" :
                                   /d[eé]bito\s+autom[aá]tico\D+(n[aã]o|no|inativo)/i.test(norm) ? "no" : "no";

  const credito_recebido = toNum(find(/cr[eé]dito\s+recebido\D+([\d\.,]+)/i));
  const saldo_kwh = toNum(find(/saldo\s*kwh\D+([\d\.,]+)/i));
  const excedente_recebido = toNum(find(/excedente\s+recebido\D+([\d\.,]+)/i));

  const ciclo_geracao = find(/informa[cç][oõ]es\s+do\s+scee.*?gera[cç][aã]o\s+do\s+ciclo\s*\(([^)]+)\)/is) || find(/\((\d{1,2}\/\d{4})\)\s*gera[cç][aã]o\s+do\s+ciclo/i);
  const uc_geradora = find(/informa[cç][oõ]es\s+do\s+scee.*?uc\s+(\d{6,14})/is) || find(/uc\s+geradora\D+(\d{6,14})/i);
  const uc_geradora_producao = toNum(find(/uc\s+\d{6,14}\s*:\s*([\d\.,]+)/i));

  const injMatches = findAll(/injec(?:[oõ]es|[aã]o)\s*scee[\s\S]{0,200}?uc\D+(\d{6,14})\D+quant\D+([\d\.,]+)\D+(?:pre[cç]o\s+unit.*?([\d\.,-]+))\D+(?:tarifa\s+unit.*?([\d\.,-]+))/ig);
  const injecoes_scee = injMatches.map(m => ({
    uc: m[1],
    quant_kwh: toNum(m[2]),
    preco_unit_com_tributos: toNum(m[3]),
    tarifa_unitaria: toNum(m[4])
  }));

  const consumo_scee_quant = toNum(find(/consumo\s+scee\D+quant(?:idade)?\D+([\d\.,]+)/i));
  const consumo_scee_preco_unit_com_tributos = toNum(find(/consumo\s+scee[\s\S]{0,80}?pre[cç]o\s+unit.*?([\d\.,]+)/i));
  const consumo_scee_tarifa_unitaria = toNum(find(/consumo\s+scee[\s\S]{0,80}?tarifa\s+unit.*?([\d\.,]+)/i));

  const media = toNum(find(/\bm[eé]dia\D+([\d\.,]+)\b/i));

  const informacoes_para_o_cliente = (()=>{
    const m = /informa[cç][oõ]es\s+para\s+o\s+cliente[:\s]*([\s\S]+)/i.exec(norm);
    if (!m) return "";
    const cut = m[1].split(/(?:uc\s+geradora|cadastro\s+rateio|nota\s+fiscal)/i)[0];
    return cut.trim();
  })();

  const cadastro_rateio_geracao_uc = find(/cadastro\s+rateio\s+gera[cç][aã]o\D+(\d{6,14})/i);
  const cadastro_rateio_geracao_percentual = toNum(find(/cadastro\s+rateio[\s\S]{0,60}?percentual\D+([\d\.,]+)/i));
  const parc_injet_s_desc_percentual = toNum(find(/parc(?:ela)?\s+injet\s*s\/desc\D+([\d\.,]+)/i));

  const data = {
    unidade_consumidora: unidade_consumidora || null,
    total_a_pagar: total_a_pagar ?? null,
    data_vencimento: data_vencimento || null,
    data_leitura_anterior: data_leitura_anterior || null,
    data_leitura_atual: data_leitura_atual || null,
    data_proxima_leitura: data_proxima_leitura || null,
    data_emissao: data_emissao || null,
    apresentacao: apresentacao || null,
    mes_ao_referencia: mes_ano_referencia || null,
    leitura_anterior: leitura_anterior ?? null,
    leitura_atual: leitura_atual ?? null,
    beneficio_tarifario_bruto: beneficio_tarifario_bruto ?? null,
    beneficio_tarifario_liquido: beneficio_tarifario_liquido ?? null,
    icms: icms ?? null,
    pis_pasep: pis_pasep ?? null,
    cofins: cofins ?? null,
    fatura_debito_automatico: fatura_debito_automatico,
    credito_recebido: credito_recebido ?? null,
    saldo_kwh: saldo_kwh ?? null,
    excedente_recebido: excedente_recebido ?? null,
    ciclo_geracao: ciclo_geracao || null,
    informacoes_para_o_cliente: informacoes_para_o_cliente || "",
    uc_geradora: uc_geradora || null,
    uc_geradora_producao: uc_geradora_producao ?? null,
    cadastro_rateio_geracao_uc: cadastro_rateio_geracao_uc || null,
    cadastro_rateio_geracao_percentual: cadastro_rateio_geracao_percentual ?? null,
    injecoes_scee,
    consumo_scee_quant: consumo_scee_quant ?? null,
    consumo_scee_preco_unit_com_tributos: consumo_scee_preco_unit_com_tributos ?? null,
    consumo_scee_tarifa_unitaria: consumo_scee_tarifa_unitaria ?? null,
    media: media ?? null,
    parc_injet_s_desc_percentual: parc_injet_s_desc_percentual ?? null,
    observacoes: ""
  };

  if (!data.unidade_consumidora) inconsistencias.push("UC vazia");
  if (!data.data_proxima_leitura) inconsistencias.push("Data próxima leitura ausente");
  if (data.beneficio_tarifario_liquido != null && data.beneficio_tarifario_liquido > 0) inconsistencias.push("Benefício tarifário líquido deveria ser negativo");
  if (data.consumo_scee_tarifa_unitaria != null && data.consumo_scee_preco_unit_com_tributos != null && data.consumo_scee_tarifa_unitaria > data.consumo_scee_preco_unit_com_tributos) inconsistencias.push("Tarifa unitária SCEE > preço unit c/ tributos");

  return { data, inconsistencias };
}

function normalize(t){
  return String(t).replace(/\r/g,"\\n").replace(/[^\S\\n]+/g," ").replace(/\\n{3,}/g,"\\n\\n").trim();
}
