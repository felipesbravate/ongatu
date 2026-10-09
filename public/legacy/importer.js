// @ts-check
// Import engine for a user's initial data: CSV / TSV / TXT / XLSX -> candidate entries for review.
// Runs in the browser (the file never leaves the page until the user submits reviewed rows) and in
// Node for tests. No dependencies: XLSX is unzipped with DecompressionStream and read with small,
// structure-specific parsers. The UI is deliberately NOT here: the screen follows a Figma frame.
//
// Pipeline:  readFile(name, bytes)                  -> { sheets: [{ name, rows }] }
//            analyzeWorkbook(book, { fileName })    -> { candidates, sheets, warnings }
//            markDuplicates(candidates, existingEntries)
//            groupForCategorizing(candidates) -> batchGroups -> buildCategorizePrompt(batch, taxonomy)
//            applySuggestions(candidates, groups, parseAiJson(answer), taxonomy)
//            rowProblems(candidate) / toEntryDoc(candidate) -> the app's `entries` document

// ---------------------------------------------------------------- text helpers
/** lower-case, no accents, single spaces, no trailing dots/colons */
export function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '').trim();
}
const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
const pad = (n) => String(n).padStart(2, '0');

// Month names in EN / ES / PT / CA / SV (full and common short forms).
const MONTH_WORDS = [
  ['jan', 'january', 'ene', 'enero', 'janeiro', 'gen', 'gener', 'januari'],
  ['feb', 'february', 'febrero', 'fev', 'fevereiro', 'febrer', 'februari'],
  ['mar', 'march', 'marzo', 'marco', 'marc', 'mars'],
  ['apr', 'april', 'abr', 'abril'],
  ['may', 'mayo', 'mai', 'maio', 'maig', 'maj'],
  ['jun', 'june', 'junio', 'junho', 'juny', 'juni'],
  ['jul', 'july', 'julio', 'julho', 'juliol', 'juli'],
  ['aug', 'august', 'ago', 'agosto', 'ag', 'agost', 'augusti'],
  ['sep', 'sept', 'september', 'septiembre', 'set', 'setembro', 'setembre'],
  ['oct', 'october', 'octubre', 'out', 'outubro', 'okt', 'oktober'],
  ['nov', 'november', 'noviembre', 'novembro', 'novembre'],
  ['dec', 'december', 'dic', 'diciembre', 'dez', 'dezembro', 'des', 'desembre'],
];
const MONTH_INDEX = new Map();
MONTH_WORDS.forEach((ws, i) => ws.forEach((w) => MONTH_INDEX.set(w, i)));
/** Month index of a header cell like "Jan", "Enero", "Jan 2024", "January-24"; else -1. */
export function monthOf(cell) {
  if (typeof cell !== 'string') return -1;
  const w = norm(cell).split(/[\s\-/'’_.]+/)[0];
  return MONTH_INDEX.has(w) ? MONTH_INDEX.get(w) : -1;
}

export class ImportError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

// ---------------------------------------------------------------- CSV
function countOutside(line, d) {
  let n = 0, q = false;
  for (const c of line) { if (c === '"') q = !q; else if (c === d && !q) n++; }
  return n;
}
/** The delimiter that splits the first lines most consistently. */
export function sniffDelimiter(text) {
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ',', bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => countOutside(l, d)).filter((n) => n > 0);
    if (!counts.length) continue;
    const freq = new Map();
    counts.forEach((n) => freq.set(n, (freq.get(n) || 0) + 1));
    let mode = 0, modeFreq = 0;
    for (const [n, f] of freq) if (f > modeFreq || (f === modeFreq && n > mode)) { mode = n; modeFreq = f; }
    const score = modeFreq * 1000 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
/** RFC-4180-ish CSV: quotes, doubled quotes, CRLF/LF, BOM. Trimmed string cells; blank rows dropped. */
export function parseCsv(text, delim, opt = {}) {
  text = String(text).replace(/^﻿/, '');
  const d = delim || sniffDelimiter(text);
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field.trim() === '') { q = true; field = ''; }
    else if (c === d) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const out = rows.map((r) => r.map((s) => s.trim()));
  // keepBlank preserves line numbers (the review shows "row N" of the user's file)
  if (opt.keepBlank) { while (out.length && !out[out.length - 1].some((c) => c !== '')) out.pop(); return out.map((r) => (r.some((c) => c !== '') ? r : [])); }
  return out.filter((r) => r.some((c) => c !== ''));
}

// ---------------------------------------------------------------- XLSX (zip + xml)
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
/** @param {Uint8Array} b @returns {Promise<Map<string, Uint8Array>>} */
export async function unzip(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ImportError('bad_file', 'This file is not a valid .xlsx workbook.');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new ImportError('bad_file', 'This .xlsx file is damaged.');
    const method = u16(b, p + 10), size = u32(b, p + 20);
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    const raw = b.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]);
const attrs = (s) => { const a = {}; for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) a[m[1]] = unxml(m[2]); return a; };
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
const textOf = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join('');

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFormat(code) {
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[dy]/i.test(c) || (/m/i.test(c) && !/[#0]/.test(c) && !/h/i.test(c));
}
/** Excel serial day (1900 system) -> YYYY-MM-DD */
export function serialToISO(n) {
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}

/** @param {Uint8Array} bytes @returns {Promise<{name:string, rows:any[][]}[]>} */
export async function readXlsx(bytes) {
  const files = await unzip(bytes);
  const str = (p) => (files.has(p) ? new TextDecoder().decode(files.get(p)) : '');
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const styles = str('xl/styles.xml');
  const custom = new Map([...styles.matchAll(/<numFmt\b([^>]*?)\/?>/g)].map((m) => { const a = attrs(m[1]); return [Number(a.numFmtId), a.formatCode || '']; }));
  const xfBlock = (styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [, ''])[1];
  const dateStyle = [...xfBlock.matchAll(/<xf\b([^>]*?)\/?>/g)].map((m) => {
    const id = Number(attrs(m[1]).numFmtId || 0);
    return BUILTIN_DATE_FMTS.has(id) || (custom.has(id) && isDateFormat(custom.get(id)));
  });
  const rels = new Map([...str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*?)\/?>/g)].map((m) => { const a = attrs(m[1]); return [a.Id, a.Target]; }));
  const sheets = [];
  for (const m of str('xl/workbook.xml').matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = attrs(m[1]);
    const t = rels.get(a['r:id']) || '';
    const xml = str(t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''));
    const rows = [];
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const r = Number(attrs(rm[1]).r || rows.length + 1) - 1;
      const cells = [];
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ca = attrs(cm[1]); const inner = cm[2] || '';
        const ci = ca.r ? colIndex(ca.r) : cells.length;
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [, null])[1];
        let val = null;
        if (ca.t === 's') val = v == null ? null : shared[Number(v)] ?? null;
        else if (ca.t === 'inlineStr') val = textOf(inner);
        else if (ca.t === 'str' || ca.t === 'e') val = v == null ? null : unxml(v);
        else if (ca.t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (v != null) {
          const num = Number(v);
          val = dateStyle[Number(ca.s || 0)] && num > 0 && num < 2958466 ? serialToISO(num) : num;
        }
        cells[ci] = val;
      }
      rows[r] = Array.from(cells, (c) => (c === undefined ? null : c));
    }
    sheets.push({ name: a.name || `Sheet${sheets.length + 1}`, rows: Array.from(rows, (r) => (r && r.some((c) => !isBlank(c)) ? r : [])) });
  }
  return sheets;
}

/** @param {string} name @param {Uint8Array|ArrayBuffer} data @returns {Promise<{sheets:{name:string, rows:any[][]}[]}>} */
export async function readFile(name, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const lower = String(name).toLowerCase();
  if (lower.endsWith('.xls')) throw new ImportError('old_excel', 'Old .xls files are not supported. Save it as .xlsx or .csv and try again.');
  if (/\.(numbers|ods)$/.test(lower)) throw new ImportError('unsupported', 'Export this file as .xlsx or .csv first.');
  if (lower.endsWith('.xlsx') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return { sheets: await readXlsx(bytes) };
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes); // "CSV" saved by Excel on Windows
  return { sheets: [{ name: String(name).replace(/\.[^.]+$/, ''), rows: parseCsv(text, undefined, { keepBlank: true }) }] };
}

// ---------------------------------------------------------------- values
/** 'dmy' | 'mdy' | 'ymd' for a column of date strings (European default). */
export function inferDateOrder(values) {
  let firstBig = false, secondBig = false;
  for (const v of values) {
    const m = typeof v === 'string' && v.trim().match(/^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/);
    if (!m) continue;
    if (m[1].length === 4) return 'ymd';
    if (Number(m[1]) > 12) firstBig = true;
    if (Number(m[2]) > 12) secondBig = true;
  }
  return secondBig && !firstBig ? 'mdy' : 'dmy';
}
const validYmd = (y, m, d) => {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return new Date(Date.UTC(y, m - 1, d)).getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};
/** Any common date -> 'YYYY-MM-DD', else null. */
export function parseDate(v, order = 'dmy') {
  if (v == null) return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToISO(v) : null; // unformatted Excel serial
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validYmd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
  if (m) {
    let y = +m[3]; if (m[3].length === 2) y += y >= 70 ? 1900 : 2000;
    return order === 'mdy' ? validYmd(y, +m[1], +m[2]) : validYmd(y, +m[2], +m[1]);
  }
  m = s.match(/^(\d{1,2})[\s\-.]+([A-Za-zÀ-ÿ]+)\.?[\s\-.,]+(\d{2,4})$/); // 12 Sep 2026, 12-sept-26
  if (m && monthOf(m[2]) >= 0) { let y = +m[3]; if (m[3].length === 2) y += 2000; return validYmd(y, monthOf(m[2]) + 1, +m[1]); }
  m = s.match(/^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/); // Sep 12, 2026
  if (m && monthOf(m[1]) >= 0) return validYmd(+m[3], monthOf(m[1]) + 1, +m[2]);
  return null;
}

const CURRENCY_RE = /(r\$|€|£|\$|\beur\b|\bgbp\b|\busd\b|\bbrl\b|\bkr\b|\bsek\b|\bnok\b|\bdkk\b|\bchf\b)/i;
const CURRENCY_CODE = { '€': 'EUR', eur: 'EUR', '£': 'GBP', gbp: 'GBP', $: 'USD', usd: 'USD', r$: 'BRL', brl: 'BRL', kr: 'SEK', sek: 'SEK', nok: 'NOK', dkk: 'DKK', chf: 'CHF' };
/** Currency written inside an amount string, else null. */
export function currencyIn(v) {
  const m = typeof v === 'string' && v.match(CURRENCY_RE);
  return m ? CURRENCY_CODE[m[1].toLowerCase()] || null : null;
}
/** ',' or '.' as the decimal separator of a column (EUR default: ','). */
export function inferDecimal(values) {
  let comma = 0, dot = 0;
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const s = v.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s) || /\.\d{3},/.test(s)) comma++;
    else if (/\.\d{1,2}$/.test(s) || /,\d{3}\./.test(s)) dot++;
  }
  return dot > comma ? '.' : ',';
}
/** '-1.234,56 €' / '(12.50)' / '12,50-' / 42 -> number, else null. */
export function parseAmount(v, decimal = ',') {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || !/\d/.test(s)) return null;
  if (/[A-Za-z]{4,}/.test(s.replace(/\b(eur|usd|gbp|sek|brl|nok|dkk|chf)\b/gi, ''))) return null; // words, not an amount
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/[-−]\s*$/.test(s)) { neg = true; s = s.replace(/[-−]\s*$/, ''); }
  if (/^[^\d]*[-−]/.test(s)) neg = true;
  s = s.replace(/[^\d.,]/g, '');
  const thousands = decimal === ',' ? '.' : ',';
  s = s.split(thousands).join('');
  if (decimal === ',') s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

// ---------------------------------------------------------------- shape detection
/** 'grid' (months across the top) | 'transactions' (one row per movement) | 'empty' */
export function detectShape(rows) {
  if (!rows.some((r) => r.some((c) => !isBlank(c)))) return { shape: 'empty' };
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const seen = new Map();
    (rows[r] || []).forEach((c, i) => { const mi = monthOf(c); if (mi >= 0 && !seen.has(mi)) seen.set(mi, i); });
    if (seen.size >= 6) return { shape: 'grid', headerRow: r, monthCols: seen };
  }
  return { shape: 'transactions' };
}

// ---------------------------------------------------------------- transactions
const HEAD = {
  date: ['date', 'fecha', 'data', 'datum', 'dia', 'day', 'booking date', 'transaction date', 'fecha operacion', 'fecha de operacion', 'data movimento', 'data do movimento', 'bokforingsdatum', 'transaktionsdatum', 'posted', 'posting date', 'started date', 'completed date', 'value date', 'fecha valor'],
  description: ['description', 'descripcion', 'concepto', 'detalle', 'detalles', 'descricao', 'historico', 'beskrivning', 'text', 'merchant', 'payee', 'comercio', 'memo', 'name', 'narrative', 'details', 'movimiento', 'lancamento', 'transaction', 'reference', 'referencia', 'mottagare', 'counterparty', 'establecimiento'],
  amount: ['amount', 'importe', 'valor', 'monto', 'belopp', 'cantidad', 'montante', 'quantia', 'value', 'total'],
  debit: ['debit', 'debe', 'cargo', 'cargos', 'debito', 'withdrawal', 'withdrawals', 'paid out', 'money out', 'gasto', 'gastos', 'uttag', 'saida', 'saidas'],
  credit: ['credit', 'haber', 'abono', 'abonos', 'credito', 'deposit', 'deposits', 'paid in', 'money in', 'ingreso', 'ingresos', 'insattning', 'entrada', 'entradas'],
  category: ['category', 'categoria', 'kategori', 'rubro', 'grupo'],
  subcategory: ['subcategory', 'sub-category', 'subcategoria', 'underkategori'],
  currency: ['currency', 'moneda', 'divisa', 'moeda', 'valuta', 'ccy'],
  balance: ['balance', 'saldo', 'running balance', 'available', 'disponible', 'disponivel'],
};
function roleOfHeader(cell) {
  if (typeof cell !== 'string') return null;
  const h = norm(cell).replace(/\s*\(.*\)$/, '');
  if (!h) return null;
  for (const [role, words] of Object.entries(HEAD)) if (words.includes(h)) return role;
  for (const [role, words] of Object.entries(HEAD)) if (words.some((w) => w.length > 3 && (h.startsWith(w + ' ') || h.endsWith(' ' + w)))) return role;
  return null;
}
function findTransactionHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const roles = (rows[r] || []).map(roleOfHeader);
    // keep only the first column per role (e.g. booking date before value date)
    const seen = new Set();
    const firstRoles = roles.map((x) => (x && !seen.has(x) ? (seen.add(x), x) : x && x !== 'date' ? x + '2' : null));
    if (seen.has('date') && (seen.has('amount') || seen.has('debit') || seen.has('credit'))) return { row: r, roles: firstRoles };
  }
  // No recognizable header: infer from content of the first 50 rows.
  const body = rows.slice(0, 50);
  const width = Math.max(0, ...body.map((r) => r.length));
  const score = (fn) => Array.from({ length: width }, (_, c) => body.filter((r) => fn(r[c])).length);
  const dates = score((v) => parseDate(v) != null);
  const nums = score((v) => typeof v === 'number' || (typeof v === 'string' && parseDate(v) == null && parseAmount(v) != null && !/[A-Za-z]{3,}/.test(v)));
  const texts = score((v) => typeof v === 'string' && /[A-Za-zÀ-ÿ]{3,}/.test(v) && parseDate(v) == null);
  const dc = dates.indexOf(Math.max(...dates));
  if (dc < 0 || dates[dc] < body.length / 2) return null;
  const roles = Array(width).fill(null);
  roles[dc] = 'date';
  const numCols = nums.map((n, i) => [n, i]).filter(([n, i]) => i !== dc && n >= body.length / 2).map(([, i]) => i);
  if (!numCols.length) return null;
  roles[numCols[0]] = 'amount'; // the first numeric column; a trailing one is usually the running balance
  if (numCols.length > 1) roles[numCols[numCols.length - 1]] = 'balance';
  const tc = texts.map((n, i) => [n, i]).filter(([, i]) => roles[i] == null).sort((a, b) => b[0] - a[0])[0];
  if (tc && tc[0] > 0) roles[tc[1]] = 'description';
  return { row: -1, roles };
}

/** @param {any[][]} rows @param {{sheet:string, file:string}} src */
export function parseTransactions(rows, src) {
  const warnings = [];
  const head = findTransactionHeader(rows);
  if (!head) return { candidates: [], warnings: [{ code: 'no_columns', message: `“${src.sheet}”: couldn't find a date column and an amount column.` }] };
  const col = (role) => head.roles.indexOf(role);
  const cDate = col('date'), cDesc = col('description'), cAmt = col('amount'), cDeb = col('debit'), cCred = col('credit');
  const cCat = col('category'), cSub = col('subcategory'), cCur = col('currency');
  const body = rows.slice(head.row + 1);
  const dateCells = body.map((r) => r[cDate]);
  const order = inferDateOrder(dateCells);
  const decimal = inferDecimal([cAmt, cDeb, cCred].filter((c) => c >= 0).flatMap((c) => body.map((r) => r[c])));
  const numericDates = dateCells.filter((v) => typeof v === 'string' && /^\d{1,2}[/.\-]\d{1,2}[/.\-]/.test(v));
  if (order === 'dmy' && numericDates.length && numericDates.every((v) => { const m = v.match(/^(\d{1,2})[/.\-](\d{1,2})/); return +m[1] <= 12 && +m[2] <= 12; }))
    warnings.push({ code: 'date_order_assumed', message: `“${src.sheet}”: dates could be day/month or month/day; they were read as day/month.` });

  const raw = [];
  body.forEach((r, i) => {
    const date = parseDate(r[cDate], order);
    let amount = cAmt >= 0 ? parseAmount(r[cAmt], decimal) : null;
    if (!amount && (cDeb >= 0 || cCred >= 0)) {
      const d = cDeb >= 0 ? parseAmount(r[cDeb], decimal) : null;
      const c = cCred >= 0 ? parseAmount(r[cCred], decimal) : null;
      if (d) amount = -Math.abs(d); else if (c) amount = Math.abs(c);
    }
    if (!date || !amount) return; // repeated headers, totals, blank lines
    const cur = cCur >= 0 && typeof r[cCur] === 'string' && r[cCur].trim() ? r[cCur].trim().toUpperCase() : currencyIn(cAmt >= 0 ? r[cAmt] : r[cDeb] ?? r[cCred]);
    const cat = [cCat, cSub].filter((c) => c >= 0).map((c) => r[c]).filter((v) => !isBlank(v)).join(' / ');
    raw.push({ date, signed: amount, description: String(cDesc >= 0 && r[cDesc] != null ? r[cDesc] : '').replace(/\s+/g, ' ').trim(), fileCategory: cat || null, currency: cur || null, rowNumber: head.row + 2 + i });
  });
  const hasNeg = raw.some((x) => x.signed < 0);
  if (raw.length && !hasNeg) warnings.push({ code: 'all_positive', message: `“${src.sheet}”: every amount is positive, so all rows were read as expenses. Change income rows in the review.` });
  const candidates = raw.map((x) => {
    const flags = [];
    if (x.currency && x.currency !== 'EUR') flags.push('currency');
    return {
      date: x.date, description: x.description, amount: Math.abs(x.signed),
      type: hasNeg && x.signed > 0 ? 'income' : 'expense',
      group: null, category: null, item: null, fileCategory: x.fileCategory, fileItem: null, currency: x.currency,
      source: { file: src.file, sheet: src.sheet, row: x.rowNumber, shape: 'transactions' }, flags,
    };
  });
  return { candidates, warnings, year: null };
}

// ---------------------------------------------------------------- monthly grid (budget sheet)
const TOTAL_RE = /^(total|totals|subtotal|sub-total|sum|suma|soma|balance|saldo|net|neto|liquido|resultado)\b|\btotal$/;
// Summary lines of budget templates, wherever the word sits (Oct 9: "Projected End Balance", "Starting Balance").
const SUMMARY_RE = /\b(balance|saldo|projected|proyectado|projetado|net income|net worth|cash flow|flujo de caja|grand total|average|avg|promedio)\b/;
const isSummary = (label) => { const h = norm(label); return TOTAL_RE.test(h) || SUMMARY_RE.test(h); };
const TYPE_WORDS = {
  income: ['income', 'incomes', 'ingresos', 'ingreso', 'receitas', 'receita', 'entradas', 'renda', 'rendimentos', 'inkomster', 'earnings'],
  investment: ['savings', 'investments', 'investment', 'investiments', 'investments/savings', 'savings/investments', 'ahorro', 'ahorros', 'inversiones', 'inversion', 'investimentos', 'poupanca', 'sparande', 'estalvi'],
  expense: ['expenses', 'expense', 'gastos', 'gasto', 'despesas', 'despesa', 'costs', 'utgifter', 'spending', 'despeses'],
};
const GROUP_WORDS = {
  Fixed: ['fixed', 'fijos', 'fijo', 'fixas', 'fixos', 'fasta', 'fixes'],
  Variable: ['variable', 'variables', 'variaveis', 'rorliga', 'variabel'],
  Extra: ['extra', 'extras', 'extraordinarios'],
  Additional: ['additional', 'aditional', 'adicionales', 'adicionais'],
};
/** Section words: "Income", "Savings", "Fixed expenses", "Gastos fijos"... */
function sectionOf(label) {
  const h = norm(label);
  for (const [t, ws] of Object.entries(TYPE_WORDS)) if (ws.includes(h)) return { type: t, group: null };
  const words = h.split(' ');
  for (const [g, ws] of Object.entries(GROUP_WORDS)) {
    if (words.length === 1 && ws.includes(h)) return { type: 'expense', group: g };
    if (words.length === 2 && words.some((w) => ws.includes(w)) && words.some((w) => TYPE_WORDS.expense.includes(w))) return { type: 'expense', group: g };
  }
  return null;
}
// A year written in a copyright line, a link or a range ("© 2008-2019 Vertex42") is not the budget's year (Oct 9).
const notAYearCell = (c) => typeof c === 'string' && (/©|\(c\)|copyright|https?:|www\./i.test(c) || /\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b/.test(c));
function yearOf(sheetName, rows, headerRow, monthCols) {
  const fromName = String(sheetName).match(/\b(19|20)\d{2}\b/);
  if (fromName) return fromName[0];
  for (const ci of monthCols.values()) {
    const m = String(rows[headerRow][ci] ?? '').match(/\b((?:19|20)\d{2})\b|['’\-](\d{2})\b/);
    if (m) return m[1] || '20' + m[2];
  }
  for (let r = 0; r <= headerRow; r++) for (const c of rows[r] || []) {
    if (notAYearCell(c)) continue;
    if (typeof c === 'number' && Number.isInteger(c) && c >= 1990 && c <= 2100) return String(c);
    const y = typeof c === 'string' && c.match(/\b(19|20)\d{2}\b/);
    if (y) return y[0];
  }
  return null;
}

/** @param {any[][]} rows @param {{sheet:string,file:string}} src @param {{headerRow:number, monthCols:Map<number,number>}} det */
export function parseGrid(rows, src, det) {
  const warnings = [];
  const year = yearOf(src.sheet, rows, det.headerRow, det.monthCols);
  const firstMonthCol = Math.min(...det.monthCols.values());
  const labelCols = Array.from({ length: firstMonthCol }, (_, i) => i);
  const monthCells = [...det.monthCols.entries()];
  const decimal = inferDecimal(rows.slice(det.headerRow + 1).flatMap((r) => monthCells.map(([, c]) => r[c])));
  // Templates that repeat the month header over each block ("INCOME | JAN … DEC", "HOME EXPENSES | JAN … DEC"): each
  // such row opens a section, and every labelled row inside it is a type, with figures or not (Oct 9).
  const isHeaderRow = (row) => new Set((row || []).map(monthOf).filter((m) => m >= 0)).size >= 6;
  const sectioned = rows.slice(det.headerRow + 1).filter(isHeaderRow).length >= 1;
  let ctx = { type: null, group: null }, heading = null;
  const fill = labelCols.map(() => null); // forward-filled label columns (merged "Category" cells)
  const candidates = [], items = [];
  const itemSeen = new Set();
  const addItem = (it) => { const k = [it.type, it.group, it.fileCategory, it.fileItem].join('|'); if (!itemSeen.has(k)) { itemSeen.add(k); items.push(it); } };
  for (let r = det.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const labels = labelCols.map((c) => (row[c] == null ? '' : String(row[c]).trim()));
    if (!labels.some(Boolean)) continue;
    if (sectioned && isHeaderRow(row)) {
      // A block header: "INCOME" / "Fixed expenses" set the bucket; anything else ("HOME EXPENSES", "TRANSPORTATION")
      // is an Expenses group named after it.
      const label = labels.filter(Boolean).join(' ');
      const s = sectionOf(label);
      const incomeLike = /\b(income|incomes|ingresos?|receitas?|earnings|salar(y|ies))\b/.test(norm(label));
      const savingsLike = /\b(savings?|investments?|ahorros?|inversion(es)?|investimentos?|poupanca)\b/.test(norm(label));
      ctx = s || (incomeLike ? { type: 'income', group: null } : savingsLike ? { type: 'investment', group: null } : { type: 'expense', group: null });
      heading = s ? null : (ctx.type === 'expense' ? sectionName(label) : null);
      fill.fill(null);
      continue;
    }
    let sectionHere = false;
    if (!sectioned) labels.forEach((l) => { const s = l && sectionOf(l); if (s) { ctx = s.group || s.type !== 'expense' ? s : { type: 'expense', group: ctx.type === 'expense' ? ctx.group : null }; heading = null; sectionHere = true; } });
    if (labels.some((l) => l && isSummary(l))) continue;
    const values = monthCells.map(([mi, c]) => [mi, parseAmount(row[c], decimal)]);
    const plain = labels.map((l) => (l && !sectionOf(l) ? l : ''));
    plain.forEach((l, i) => { if (l) fill[i] = l; });
    if (!values.some(([, v]) => v) && !sectioned) {
      // heading without numbers ("Habitation"): the category for the rows under it
      const last = plain.filter(Boolean).pop();
      if (last && !sectionHere) { heading = last; plain.forEach((l, i) => { if (l) fill[i] = null; }); fill[plain.lastIndexOf(last)] = last; }
      continue;
    }
    const itemCol = plain.map(Boolean).lastIndexOf(true);
    if (itemCol < 0) continue; // only a section word with numbers: a subtotal row
    const item = plain[itemCol];
    let category = null;
    for (let i = itemCol - 1; i >= 0; i--) if (fill[i] && fill[i] !== item) { category = fill[i]; break; }
    if (!category && heading && heading !== item) category = heading;
    // Every type of the sheet, figures or not: the board keeps the rows a blank template only names.
    addItem({ type: ctx.type, group: ctx.type === 'expense' ? ctx.group : null, fileCategory: category, fileItem: item, source: { file: src.file, sheet: src.sheet, row: r + 1, shape: 'grid' } });
    for (const [mi, v] of values) {
      if (!v) continue;
      const flags = [];
      if (v < 0) flags.push('negative');
      if (!year) flags.push('no_year');
      candidates.push({
        date: year ? `${year}-${pad(mi + 1)}-01` : null, description: item, amount: Math.abs(v),
        type: ctx.type, group: ctx.type === 'expense' ? ctx.group : null, category: null, item: null,
        fileCategory: category, fileItem: item, currency: null,
        source: { file: src.file, sheet: src.sheet, row: r + 1, month: mi, shape: 'grid' }, flags,
      });
    }
  }
  if (!year && candidates.length) warnings.push({ code: 'no_year', message: `“${src.sheet}”: couldn't tell which year this sheet is. Pick the year in the review.` });
  return { candidates, warnings, year: candidates.length ? year : null, items };
}
/** "HOME EXPENSES" -> "Home", "CHARITY/GIFTS" -> "Charity/gifts", "Daily living" stays. */
function sectionName(label) {
  let t = String(label).trim().replace(/\s+(expenses?|costs?|gastos?|despesas?)$/i, '');
  if (t === t.toUpperCase()) t = t.charAt(0) + t.slice(1).toLowerCase();
  return t;
}

// ---------------------------------------------------------------- workbook
/** @param {{sheets:{name:string, rows:any[][]}[]}} book @param {{fileName:string}} opt */
export function analyzeWorkbook(book, opt) {
  const candidates = [], warnings = [], sheets = [], items = [];
  for (const s of book.sheets) {
    const det = detectShape(s.rows);
    if (det.shape === 'empty') { sheets.push({ name: s.name, shape: 'empty', rows: 0, year: null }); continue; }
    const src = { sheet: s.name, file: opt.fileName };
    const res = det.shape === 'grid' ? parseGrid(s.rows, src, /** @type {any} */ (det)) : parseTransactions(s.rows, src);
    // A sheet of text only (instructions, a licence) is not a failed import: no warning for it (Oct 9).
    const numbers = s.rows.reduce((n, r) => n + (r || []).filter((c) => typeof c === 'number').length, 0);
    const quiet = det.shape === 'transactions' && !res.candidates.length && numbers < 3;
    sheets.push({ name: s.name, shape: quiet ? 'text' : det.shape, rows: res.candidates.length, year: res.year || null, items: (res.items || []).length });
    candidates.push(...res.candidates); if (!quiet) warnings.push(...res.warnings); items.push(...(res.items || []));
  }
  if (!candidates.length && !items.length) warnings.push({ code: 'nothing_found', message: 'No amounts with a date were found in this file.' });
  candidates.forEach((c, i) => { c.key = `${opt.fileName}#${i}`; });
  return { candidates, sheets, warnings, items };
}

// ---------------------------------------------------------------- duplicates
const cents = (n) => Math.round(Math.abs(Number(n) || 0) * 100);
/** Flags (and skips by default) rows that already exist: same date, amount and description; for grids, same month, amount and item. */
export function markDuplicates(candidates, existingEntries) {
  const keys = new Set();
  for (const e of existingEntries || []) {
    if (!e || !e.date) continue;
    keys.add(`${e.date}|${cents(e.amount)}|${norm(e.description)}`);
    if (e.item) keys.add(`${String(e.date).slice(0, 7)}|${cents(e.amount)}|item:${norm(e.item)}`);
  }
  let n = 0;
  for (const c of candidates) {
    if (!c.date) continue;
    const dup = keys.has(`${c.date}|${cents(c.amount)}|${norm(c.description)}`)
      || (c.source.shape === 'grid' && keys.has(`${c.date.slice(0, 7)}|${cents(c.amount)}|item:${norm(c.fileItem || c.description)}`));
    if (dup) { if (!c.flags.includes('duplicate')) c.flags.push('duplicate'); c.skip = true; n++; }
  }
  return n;
}

// ---------------------------------------------------------------- AI categorization
/** Merchant key, insensitive to case, accents, digits and card/ref noise: "MERCADONA 1234 BCN" ~ "Mercadona 998 bcn". */
export function merchantKey(s) {
  return norm(s).replace(/\d[\d\s/.:-]*/g, ' ').replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
/** One group per distinct merchant (or grid item), so each is sent to the AI once. */
export function groupForCategorizing(candidates) {
  const map = new Map();
  for (const c of candidates) {
    if (c.skip) continue;
    const k = (c.source.shape === 'grid' ? 'g:' + norm(c.fileCategory || '') + '|' : 't:') + merchantKey(c.description) + '|' + (c.type || '?');
    let g = map.get(k);
    if (!g) { g = { k: 'r' + map.size, key: k, text: c.description, fileCategory: c.fileCategory || null, type: c.type || null, group: c.group || null, count: 0, total: 0, members: [] }; map.set(k, g); }
    g.count++; g.total = Math.round((g.total + c.amount) * 100) / 100; g.members.push(c.key);
  }
  return [...map.values()];
}
/** Prompt-sized batches (the server caps one prompt at ~70 KB; the taxonomy also takes room). */
export function batchGroups(groups, maxChars = 30000) {
  const out = []; let cur = [], size = 0;
  for (const g of groups) {
    const s = JSON.stringify([g.k, g.text, g.fileCategory, g.type, g.group]).length + 1;
    if (cur.length && size + s > maxChars) { out.push(cur); cur = []; size = 0; }
    cur.push(g); size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}
/** @param {any[]} batch @param {{incomes?:string[], investments?:string[], expenses?:Record<string,Record<string,string[]>>}} taxonomy */
export function buildCategorizePrompt(batch, taxonomy) {
  const exp = Object.entries(taxonomy.expenses || {}).map(([g, cats]) =>
    `${g}:\n` + Object.entries(cats).map(([c, items]) => `  ${c}: ${items.join(' | ')}`).join('\n')).join('\n');
  return [
    'You categorize personal-finance rows for a budget app. Choose ONLY from the lists below, spelled exactly as written.',
    '',
    'EXPENSES (group, then "category: items"):', exp || '(none)',
    '',
    'INCOME items: ' + ((taxonomy.incomes || []).join(' | ') || '(none)'),
    'SAVINGS/INVESTMENT items: ' + ((taxonomy.investments || []).join(' | ') || '(none)'),
    '',
    'Each row is [id, description or item name, category from the user\'s own file or null, money direction "expense"|"income"|"investment" or null, expense group from the file or null].',
    'Keep the given direction unless the text clearly says otherwise (for example, a transfer to a savings account is "investment").',
    'When nothing fits well, set the uncertain fields to null. Never invent names.',
    '',
    'Answer with JSON only: an array of {"id","type","group","category","item"}. group and category are null for income and investment.',
    '',
    'ROWS:',
    ...batch.map((g) => JSON.stringify([g.k, g.text, g.fileCategory, g.type, g.group])),
  ].join('\n');
}
/** Tolerant JSON-array extraction from a model answer. */
export function parseAiJson(text) {
  const s = String(text || '');
  const start = s.indexOf('['), end = s.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  try { const v = JSON.parse(s.slice(start, end + 1)); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** True when (type, group, category, item) exists in the taxonomy. */
export function inTaxonomy(t, s) {
  if (!s || !s.item) return false;
  if (s.type === 'income') return (t.incomes || []).includes(s.item);
  if (s.type === 'investment') return (t.investments || []).includes(s.item);
  if (s.type === 'expense') return ((t.expenses || {})[s.group] || {})[s.category]?.includes(s.item) || false;
  return false;
}
/** Copies valid suggestions onto every member of each group. Invalid ones are dropped (the user picks). */
export function applySuggestions(candidates, groups, suggestions, taxonomy) {
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const byId = new Map(groups.map((g) => [g.k, g]));
  let applied = 0;
  for (const s of suggestions || []) {
    const g = s && byId.get(s.id);
    if (!g) continue;
    const sug = { type: s.type, group: s.type === 'expense' ? s.group : null, category: s.type === 'expense' ? s.category : null, item: s.item };
    const ok = inTaxonomy(taxonomy, sug);
    for (const key of g.members) {
      const c = byKey.get(key);
      if (!c) continue;
      if (ok) { Object.assign(c, sug); if (!c.flags.includes('suggested')) c.flags.push('suggested'); applied++; }
      else if (!c.type && ['expense', 'income', 'investment'].includes(s.type)) c.type = s.type;
    }
  }
  return applied;
}

// ---------------------------------------------------------------- output
/** What still blocks saving a row; empty array = ready. */
export function rowProblems(c) {
  const p = [];
  if (!c.date || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) p.push('date');
  if (!(c.amount > 0)) p.push('amount');
  if (!['expense', 'income', 'investment'].includes(c.type)) p.push('type');
  if (c.type === 'expense' && (!c.group || !c.category)) p.push('category');
  if (!c.item) p.push('item');
  if (!String(c.description || '').trim()) p.push('description');
  if (c.flags.includes('currency')) p.push('currency');
  if (c.flags.includes('negative')) p.push('negative');
  return p;
}
/** The app's `entries` document for a reviewed row. */
export function toEntryDoc(c, now = new Date().toISOString()) {
  return {
    year: c.date.slice(0, 4), monthIndex: Number(c.date.slice(5, 7)) - 1,
    type: c.type, group: c.type === 'expense' ? c.group : null, category: c.type === 'expense' ? c.category : null,
    item: c.item, description: String(c.description).trim().slice(0, 200), amount: Math.round(c.amount * 100) / 100,
    date: c.date, createdAt: now, source: 'import',
  };
}

if (typeof window !== 'undefined') {
  // @ts-ignore - browser global for the tracker page (loaded as a module)
  window.CostImporter = { readFile, analyzeWorkbook, markDuplicates, groupForCategorizing, batchGroups, buildCategorizePrompt, parseAiJson, applySuggestions, rowProblems, toEntryDoc, ImportError };
}
