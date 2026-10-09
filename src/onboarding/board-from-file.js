// @ts-check
// Onboarding "Import a file" (Oct 9): turns a CSV / Excel file into a board and its past figures.
//
// The file is read by the import engine (public/legacy/importer.js), which finds either a monthly grid (a budget sheet
// with month columns) or a transaction list (a bank or card export). This module then sorts every row into the app's
// three buckets — Income, Savings and investments, Expenses — and, for Expenses, into a sub-category (Fixed, Variable,
// Extra, Additional) and a group, so the result opens in "Set up your board" (Ongatu 401:4464) ready to edit:
//   - a grid keeps the person's own names: the section words in the sheet set the bucket and sub-category, the
//     category column (or heading row) is the group, the row label is the type;
//   - a transaction list uses the file's own category column when there is one; otherwise the description is matched
//     against a list of common merchants and words (EN / ES / PT / CA), a charge that comes back every month with a
//     similar amount becomes its own Fixed type, and what is left goes to "Other";
//   - each type's budget is its monthly average over the months the file covers (rounded to the euro).
// Pure functions, no I/O: the page reads the file and saves the result.
import { norm, merchantKey } from '../../public/legacy/importer.js';

export const DEFAULT_SUBS = ['Fixed', 'Variable', 'Extra', 'Additional'];

// [words, bucket, sub-category, group, type]. Words match whole words of the normalized text (or a prefix ending in *).
const RULES = [
  // Income
  [['salary', 'salario', 'nomina', 'payroll', 'wage', 'wages', 'paycheck', 'sueldo', 'ordenado', 'salari'], 'income', null, null, 'Salary'],
  [['bonus', 'bonificacion', 'paga extra'], 'income', null, null, 'Bonus'],
  [['freelance', 'invoice', 'factura', 'honorarios'], 'income', null, null, 'Freelance'],
  [['pension', 'jubilacion', 'aposentadoria'], 'income', null, null, 'Pension'],
  [['dividend', 'dividends', 'dividendo', 'dividendos', 'interest', 'intereses', 'juros'], 'income', null, null, 'Interest and dividends'],
  [['refund', 'reembolso', 'devolucion', 'reintegro', 'cashback'], 'income', null, null, 'Refunds'],
  // Savings and investments
  [['pension plan', 'plan de pensiones', 'plano de previdencia', 'pla de pensions'], 'investment', null, null, 'Pension plan'],
  [['broker', 'etf', 'etfs', 'stocks', 'acciones', 'acoes', 'fund', 'funds', 'fondo', 'fondos', 'indexa', 'myinvestor', 'degiro', 'trade republic', 'interactive brokers', 'revolut invest', 'crypto', 'bitcoin', 'coinbase', 'binance', 'investment', 'investments', 'inversion', 'inversiones', 'investimento', 'investimentos'], 'investment', null, null, 'Investments'],
  [['savings', 'ahorro', 'ahorros', 'poupanca', 'estalvi', 'emergency fund', 'fondo de emergencia', 'deposit', 'deposito'], 'investment', null, null, 'Savings'],
  // Expenses: Fixed
  [['rent', 'alquiler', 'aluguel', 'lloguer', 'arrendamiento'], 'expense', 'Fixed', 'Habitation', 'Rent'],
  [['mortgage', 'hipoteca', 'financiamento'], 'expense', 'Fixed', 'Habitation', 'Mortgage'],
  [['condominium', 'comunidad', 'condominio', 'comunitat', 'hoa'], 'expense', 'Fixed', 'Habitation', 'Condominium'],
  [['electricity', 'luz', 'electricidad', 'endesa', 'iberdrola', 'holaluz', 'energia', 'llum', 'edp'], 'expense', 'Fixed', 'Habitation', 'Electricity'],
  [['water', 'agua', 'aigues', 'aigua', 'canal de isabel'], 'expense', 'Fixed', 'Habitation', 'Water'],
  [['gas', 'naturgy', 'butano'], 'expense', 'Fixed', 'Habitation', 'Gas'],
  [['internet', 'fibra', 'movistar', 'vodafone', 'orange', 'digi', 'jazztel', 'o2', 'lowi', 'simyo', 'masmovil', 'pepephone', 'phone', 'mobile', 'movil', 'telefono', 'telefone'], 'expense', 'Fixed', 'Habitation', 'Internet and phone'],
  [['insurance', 'seguro', 'seguros', 'assegurança', 'mapfre', 'axa', 'allianz', 'sanitas', 'adeslas', 'dkv', 'mutua', 'generali', 'linea directa'], 'expense', 'Fixed', 'Insurances', 'Insurance'],
  [['netflix', 'spotify', 'hbo', 'max', 'disney', 'prime video', 'amazon prime', 'apple com', 'icloud', 'youtube', 'filmin', 'dazn', 'subscription', 'suscripcion', 'assinatura', 'patreon', 'chatgpt', 'openai', 'claude', 'anthropic', 'adobe', 'figma', 'notion'], 'expense', 'Fixed', 'Subscriptions', 'Subscriptions'],
  [['gym', 'gimnasio', 'gimnas', 'academia', 'basic fit', 'dir', 'holmes place', 'crossfit', 'padel'], 'expense', 'Fixed', 'Health', 'Gym and sports'],
  [['bank fee', 'bank fees', 'comision', 'comisiones', 'tarifa', 'maintenance fee'], 'expense', 'Fixed', 'Bank', 'Fees'],
  [['tax', 'taxes', 'impuesto', 'impuestos', 'hacienda', 'aeat', 'ibi', 'irpf', 'imposto', 'iptu', 'ipva'], 'expense', 'Fixed', 'Bank', 'Taxes'],
  [['loan', 'prestamo', 'emprestimo', 'credito', 'financing', 'cetelem'], 'expense', 'Fixed', 'Bank', 'Loans'],
  [['school', 'college', 'tuition', 'university', 'universidad', 'escola', 'escuela', 'colegio', 'course', 'courses', 'curso', 'cursos', 'udemy', 'coursera'], 'expense', 'Fixed', 'Education', 'Education'],
  // Expenses: Variable
  [['groceries', 'grocery', 'supermarket', 'supermercado', 'mercadona', 'carrefour', 'lidl', 'aldi', 'dia', 'eroski', 'caprabo', 'bonpreu', 'condis', 'consum', 'alcampo', 'hipercor', 'ametller', 'mercado', 'market', 'pingo doce', 'continente', 'pao de acucar'], 'expense', 'Variable', 'Food', 'Groceries'],
  [['restaurant', 'restaurante', 'restaurants', 'bar', 'cafe', 'cafeteria', 'coffee', 'starbucks', 'mcdonalds', 'burger', 'pizza', 'glovo', 'uber eats', 'ubereats', 'just eat', 'deliveroo', 'ifood', 'eating out', 'dining'], 'expense', 'Variable', 'Food', 'Eating out'],
  [['uber', 'cabify', 'bolt', 'taxi', 'metro', 'tmb', 'renfe', 'rodalies', 'bus', 'tram', 'fgc', 'emt', 'transport', 'transporte', 'bicing', 'lime', 'free now'], 'expense', 'Variable', 'Transport', 'Transport'],
  [['fuel', 'gasolina', 'gasolinera', 'repsol', 'cepsa', 'bp', 'shell', 'galp', 'combustivel', 'petrol'], 'expense', 'Variable', 'Transport', 'Fuel'],
  [['parking', 'aparcamiento', 'estacionamento', 'saba', 'peaje', 'toll', 'autopista'], 'expense', 'Variable', 'Transport', 'Parking and tolls'],
  [['pharmacy', 'farmacia', 'doctor', 'medico', 'dentist', 'dentista', 'clinic', 'clinica', 'hospital', 'optica', 'physio', 'fisio', 'therapy', 'terapia'], 'expense', 'Variable', 'Health', 'Health'],
  [['amazon', 'zara', 'h m', 'hm', 'mango', 'primark', 'decathlon', 'uniqlo', 'el corte ingles', 'shopping', 'clothes', 'ropa', 'roupa', 'shein', 'aliexpress', 'fnac', 'mediamarkt'], 'expense', 'Variable', 'Shopping', 'Shopping'],
  [['ikea', 'leroy merlin', 'bauhaus', 'home', 'hogar', 'casa', 'furniture', 'muebles'], 'expense', 'Variable', 'Home', 'Home'],
  [['pet', 'pets', 'vet', 'veterinario', 'tiendanimal', 'kiwoko', 'mascota'], 'expense', 'Variable', 'Pets', 'Pets'],
  [['cinema', 'cine', 'theatre', 'teatro', 'museum', 'museo', 'books', 'libros', 'steam', 'playstation', 'nintendo', 'xbox', 'leisure', 'ocio', 'lazer'], 'expense', 'Variable', 'Leisure', 'Leisure'],
  // Expenses: Extra
  [['travel', 'trip', 'viaje', 'viagem', 'viatge', 'hotel', 'hotels', 'airbnb', 'booking', 'flight', 'flights', 'vuelo', 'voo', 'vueling', 'ryanair', 'iberia', 'easyjet', 'tap', 'latam', 'airline', 'holiday', 'holidays', 'vacation', 'vacaciones', 'ferias'], 'expense', 'Extra', 'Travel', 'Travel'],
  [['gift', 'gifts', 'regalo', 'regalos', 'presente', 'presentes', 'regal'], 'expense', 'Extra', 'Gifts', 'Gifts'],
  [['wedding', 'boda', 'casamento', 'concert', 'concierto', 'show', 'tickets', 'entradas', 'ticketmaster', 'festival'], 'expense', 'Extra', 'Events', 'Events'],
  // Expenses: Additional
  [['repair', 'repairs', 'reparacion', 'reparo', 'mechanic', 'taller', 'itv', 'car service'], 'expense', 'Additional', 'Maintenance', 'Repairs'],
  [['donation', 'donations', 'donacion', 'doacao', 'charity', 'ong', 'ngo'], 'expense', 'Additional', 'Donations', 'Donations'],
  [['fine', 'fines', 'multa', 'multas'], 'expense', 'Additional', 'Other', 'Fines'],
];
const COMPILED = RULES.map(([words, bucket, sub, group, type]) => ({ words: words.map((w) => norm(w).replace(/[^a-z0-9 ]+/g, ' ').trim()), bucket, sub, group, type }));

/** Normalized words of a text with a space on each side, for whole-word matching. */
const padWords = (s) => ` ${norm(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

/** The first rule whose word appears in the text, or null. @param {string} text */
export function matchRule(text) {
  const t = padWords(text);
  if (t.trim() === '') return null;
  for (const r of COMPILED) if (r.words.some((w) => w && t.includes(` ${w} `))) return r;
  return null;
}

/** A section word in a file's category column ("Fixed", "Gastos fijos", "Income"...). */
function bucketWord(text) {
  const t = padWords(text);
  if (/ (income|incomes|ingresos|receitas|entradas|earnings) /.test(t)) return { bucket: 'income', sub: null };
  if (/ (savings|investments?|ahorros?|inversion(es)?|investimentos?|poupanca) /.test(t)) return { bucket: 'investment', sub: null };
  if (/ (fixed|fijos?|fixos?|fixas) /.test(t)) return { bucket: 'expense', sub: 'Fixed' };
  if (/ (variables?|variaveis) /.test(t)) return { bucket: 'expense', sub: 'Variable' };
  if (/ (extras?) /.test(t)) return { bucket: 'expense', sub: 'Extra' };
  if (/ (additional|adicionales|adicionais) /.test(t)) return { bucket: 'expense', sub: 'Additional' };
  return null;
}

/** "mercadona  barcelona 1234" -> "Mercadona Barcelona". */
export function prettyName(s) {
  const words = String(s || '').replace(/[0-9*#]+/g, ' ').replace(/\b(compra|pago|payment|card|tarjeta|cartao|purchase|transferencia|transfer|recibo|bizum|en|at|de|por|from|to)\b/gi, ' ')
    .replace(/[^A-Za-zÀ-ÿ&' ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length > 1).slice(0, 3);
  // Short all-caps words stay ("BBVA", "H&M") unless the whole line is shouting, as bank exports do.
  const shouting = words.join('') === words.join('').toUpperCase();
  const name = words.map((w) => (!shouting && w.length <= 4 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  return name.slice(0, 40);
}

const ymOf = (date) => String(date || '').slice(0, 7);
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Charges that come back in at least 3 different months with amounts within 15% of each other: subscriptions, bills.
 * @param {any[]} rows transaction candidates (expenses) @returns {Set<string>} merchant keys
 */
export function recurringMerchants(rows) {
  /** @type {Map<string, {months:Set<string>, amounts:number[]}>} */ const by = new Map();
  rows.forEach((c) => {
    const k = merchantKey(c.description); if (!k || k.length < 3) return;
    const v = by.get(k) || { months: new Set(), amounts: [] }; v.months.add(ymOf(c.date)); v.amounts.push(c.amount); by.set(k, v);
  });
  const out = new Set();
  by.forEach((v, k) => {
    if (v.months.size < 3) return;
    const sorted = v.amounts.slice().sort((a, b) => a - b), mid = sorted[Math.floor(sorted.length / 2)];
    if (v.amounts.filter((a) => Math.abs(a - mid) <= mid * 0.15).length >= 3) out.add(k);
  });
  return out;
}

/**
 * Sorts each row into bucket / sub-category / group / type. Returns new objects; rows that can't be saved are dropped
 * and counted. @param {any[]} candidates from analyzeWorkbook @param {{ fallbackYear?: string }} [opt]
 */
export function classify(candidates, opt = {}) {
  const fallbackYear = opt.fallbackYear || String(new Date().getFullYear());
  const skipped = { currency: 0, negative: 0, other: 0 };
  const tx = candidates.filter((c) => c.source && c.source.shape === 'transactions');
  const recurring = recurringMerchants(tx.filter((c) => c.type === 'expense'));
  const out = [];
  for (const c0 of candidates) {
    const c = { ...c0, flags: (c0.flags || []).slice() };
    if (c.flags.includes('currency')) { skipped.currency++; continue; }
    if (c.flags.includes('negative')) { skipped.negative++; continue; }
    if (!c.date && c.flags.includes('no_year') && c.source && c.source.month != null) c.date = `${fallbackYear}-${String(c.source.month + 1).padStart(2, '0')}-01`;
    if (!c.date || !(c.amount > 0)) { skipped.other++; continue; }
    let bucket = c.type, sub = c.group || null, group = null, item = null;
    const shape = c.source && c.source.shape;

    if (shape === 'grid') {
      // The sheet's names stay: row label = type, category column / heading = group.
      item = String(c.fileItem || c.description || '').trim();
      const r = matchRule(item) || (c.fileCategory ? matchRule(c.fileCategory) : null);
      const word = c.fileCategory ? bucketWord(c.fileCategory) : null;
      if (!bucket) { bucket = (word && word.bucket) || (r && r.bucket) || 'expense'; if (!sub) sub = (word && word.sub) || (r && r.sub) || null; }
      if (bucket === 'expense') {
        if (!sub) sub = (r && r.bucket === 'expense' && r.sub) || 'Variable';
        group = c.fileCategory && !(word && word.sub) ? String(c.fileCategory).trim() : (r && r.bucket === 'expense' ? r.group : 'General');
      }
    } else {
      // Transactions: the file's own category first ("Food / Groceries"), then the description.
      const parts = String(c.fileCategory || '').split(' / ').map((s) => s.trim()).filter(Boolean);
      const fromCat = parts.length ? (matchRule(parts.join(' ')) || null) : null;
      const word = parts.length ? bucketWord(parts.join(' ')) : null;
      const fromDesc = matchRule(c.description);
      const rule = fromCat || fromDesc;
      // A rule can move a row between buckets only where the sign agrees: income stays money in, except savings
      // coming back; money out can be an expense or a transfer to savings.
      if (rule && (rule.bucket === c.type || (c.type === 'expense' && rule.bucket === 'investment'))) bucket = rule.bucket;
      else if (word && (word.bucket === c.type || (c.type === 'expense' && word.bucket === 'investment'))) bucket = word.bucket;
      const sameBucket = rule && rule.bucket === bucket ? rule : null;
      if (parts.length && !(word && parts.length === 1)) {
        // Keep the file's names: last part = type, the part before = group.
        item = cap(parts[parts.length - 1]);
        if (bucket === 'expense') { group = parts.length > 1 ? cap(parts[parts.length - 2]) : (sameBucket ? sameBucket.group : item); sub = (word && word.sub) || (sameBucket && sameBucket.sub) || 'Variable'; }
      } else if (sameBucket) {
        item = sameBucket.type;
        if (bucket === 'expense') { sub = (word && word.sub) || sameBucket.sub; group = sameBucket.group; }
      } else if (bucket === 'expense' && recurring.has(merchantKey(c.description))) {
        item = prettyName(c.description) || 'Recurring'; sub = 'Fixed'; group = 'Recurring';
      } else {
        item = bucket === 'income' ? 'Other income' : bucket === 'investment' ? 'Savings' : 'Other';
        if (bucket === 'expense') { sub = (word && word.sub) || 'Variable'; group = 'Other'; }
      }
      if (bucket !== 'expense') sub = null;
    }
    if (bucket !== 'expense') group = null;
    if (!item) { skipped.other++; continue; }
    out.push({ ...c, type: bucket, group: bucket === 'expense' ? sub : sub || null, category: group, item: item.slice(0, 80), description: String(c.description || item).trim() || item });
  }
  return { rows: out, skipped };
}

/**
 * The board for "Set up your board" (same shape as OnboardingApp's boards) from classified rows.
 * board = { kinds, subs: { [type]: [sub] }, groups: {}, types: [{ type, group, category, item, budget }] }
 * @param {any[]} rows
 */
export function boardOf(rows) {
  const months = new Set(rows.map((r) => ymOf(r.date)));
  const n = Math.max(1, months.size);
  /** @type {Map<string, any>} */ const types = new Map();
  rows.forEach((r) => {
    const k = [r.type, r.group || '', r.category || '', r.item].join('␟');
    const t = types.get(k) || { type: r.type, group: r.group || null, category: r.category || null, item: r.item, total: 0, key: 'f' + types.size };
    t.total += r.amount; types.set(k, t); r.typeKey = t.key;
  });
  const order = { income: 0, investment: 1, expense: 2 };
  const subOrder = (s) => { const i = DEFAULT_SUBS.indexOf(s); return i < 0 ? 99 : i; };
  const list = [...types.values()]
    .sort((a, b) => order[a.type] - order[b.type] || subOrder(a.group) - subOrder(b.group) || String(a.category || '').localeCompare(String(b.category || '')) || b.total - a.total)
    .map((t) => ({ type: t.type, group: t.group, category: t.category, item: t.item, budget: Math.round(t.total / n), key: t.key }));
  const expenseSubs = [...new Set(list.filter((t) => t.type === 'expense').map((t) => t.group))];
  // The four default sub-categories always show, in their order, then any of the file's own.
  const subs = { expense: [...DEFAULT_SUBS, ...expenseSubs.filter((s) => !DEFAULT_SUBS.includes(s))] };
  ['income', 'investment'].forEach((k) => { const own = [...new Set(list.filter((t) => t.type === k && t.group).map((t) => t.group))]; if (own.length) subs[k] = own; });
  return { kinds: ['income', 'investment', 'expense'], subs, groups: {}, types: list };
}

/**
 * Everything the import step needs from an analyzed file.
 * @param {{ candidates: any[], sheets: any[], warnings: any[] }} analysis
 * @param {{ fallbackYear?: string }} [opt]
 */
export function boardFromFile(analysis, opt = {}) {
  const { rows, skipped } = classify(analysis.candidates || [], opt);
  const board = boardOf(rows);
  const yms = [...new Set(rows.map((r) => ymOf(r.date)))].sort();
  const years = [...new Set(yms.map((m) => m.slice(0, 4)))];
  const count = (k) => rows.filter((r) => r.type === k).length;
  return {
    board, rows, skipped, years,
    first: yms[0] || null, last: yms[yms.length - 1] || null, months: yms.length,
    counts: { income: count('income'), investment: count('investment'), expense: count('expense') },
    shapes: [...new Set((analysis.sheets || []).filter((s) => s.rows).map((s) => s.shape))],
    warnings: (analysis.warnings || []).filter((w) => w.code !== 'currency'),
  };
}

/**
 * The entries to save once the board is final. Each row follows its type as edited (renamed, moved to another group or
 * sub-category); rows whose type was deleted are left out. @param {any[]} rows @param {any} board
 */
export function entriesForBoard(rows, board) {
  const byKey = new Map(board.types.filter((t) => t.key).map((t) => [t.key, t]));
  const now = new Date().toISOString();
  return rows.filter((r) => byKey.has(r.typeKey)).map((r) => {
    const t = byKey.get(r.typeKey);
    return {
      date: r.date, type: t.type, group: t.group || null, category: t.type === 'expense' ? t.category || 'General' : null, item: t.item,
      description: String(r.description || t.item).slice(0, 200), amount: Math.round(r.amount * 100) / 100, createdAt: now,
    };
  });
}
