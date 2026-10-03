// "Upload documents": turning files into reviewable entries. Ported from the legacy page. Files are read in
// the browser (text, PDF text layer, or page images for scans) and sent to Claude through /api/read-document;
// nothing is stored on the server. A DocReader holds the file list; the panel re-renders on every change.
import { EXP_GROUPS, findIn, parseAmount, todayISO, yearLabelOfDate } from './model.js';

const PDFJS_BASE = '/vendor/pdfjs/'; // copied from the pdfjs-dist package at install time (scripts/vendor-pdfjs.mjs)
const TEXT_EXT = /\.(txt|csv|tsv)$/i;
const MAX_CHUNKS = 4;
const utf8Len = (t) => new TextEncoder().encode(t).length;
export const fmtSize = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))}KB` : `${(b / 1048576).toFixed(1).replace(/\.0$/, '')}MB`);

let pdfjsPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_BASE + 'pdf.min.js';
      s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; } catch { /* keep going */ } resolve(window.pdfjsLib); };
      s.onerror = () => { pdfjsPromise = null; reject(new Error('pdf.js could not be loaded')); };
      document.head.appendChild(s);
    });
  }
  return pdfjsPromise;
}

export function docMeta(d) {
  const sz = fmtSize(d.size);
  if (d.status === 'preparing') return `${sz} ⋅ Preparing`;
  if (d.status === 'ready') return `${sz} ⋅ Ready${d.note ? ' ⋅ ' + d.note : ''}`;
  if (d.status === 'reading') return `${sz} ⋅ Reading`;
  if (d.status === 'done') return `${sz} ⋅ ${d.rows.length} ${d.rows.length === 1 ? 'entry' : 'entries'} found`;
  if (d.status === 'empty') return `${sz} ⋅ No entries found`;
  return `${sz} ⋅ ${d.note || "Couldn't read this file"}`;
}
// The file's own icon (174:15198): Image for photos and screenshots, Document for PDFs and text files.
export const docIconName = (d) => ((/^image\//.test((d.file && d.file.type) || '') || /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(d.name)) ? 'image' : 'document');

export function errCopy(e) {
  switch (e && e.code) {
    case 'not_granted': return 'Claude access was declined for this page.';
    case 'sampling_disabled': return 'Claude isn’t available for this account.';
    case 'rate_limited': return 'Usage limit reached. Try again later.';
    case 'session_expired': return 'Your session expired. Sign in again.';
    case 'image_rejected': return "Couldn't read this image.";
    // Oct 2: every failure used to say "Couldn't read this file", which hid the reason (a preview deployment has no
    // API key, a timeout, an answer that wasn't JSON). Each now says what happened.
    case 'not_available': return "Reading isn't set up on this server";
    case 'bad_output': return "Claude's answer couldn't be read. Try again";
    case 'too_large': return 'File too large to read';
    case 'network': return 'No connection. Try again';
    case 'http_504': case 'http_502': return 'Reading took too long. Try again';
    default: return "Couldn't read this file" + (e && e.code ? ` (${e.code})` : '');
  }
}

function taxonomyText(model, yearLabel) {
  const TX = model.taxonomyForYear(yearLabel);
  const lines = [];
  EXP_GROUPS.forEach((g) => {
    const gc = TX.expenses[g] || {};
    if (!Object.keys(gc).length) return;
    lines.push(`Expenses, group "${g}":`);
    Object.keys(gc).sort().forEach((c) => lines.push(`  category "${c}": items ${gc[c].slice().sort().map((i) => `"${i}"`).join(', ')}`));
  });
  lines.push(`Income items: ${(TX.incomes || []).slice().sort().map((i) => `"${i}"`).join(', ')}`);
  lines.push(`Savings/Investment items: ${(TX.investments || []).slice().sort().map((i) => `"${i}"`).join(', ')}`);
  return lines.join('\n');
}

export function buildPrompt(model, d, chunk, i, n) {
  const isText = chunk !== undefined && chunk !== null;
  const src = isText
    ? `The text below was extracted from one file named "${d.name}"${n > 1 ? ` (part ${i + 1} of ${n})` : ''}. Columns may be jumbled or split across lines.`
    : `The images are the pages of one file named "${d.name}".`;
  const py = model.promptYearLabel();
  return `You are reading a personal-finance document (a receipt, invoice, bank or card statement, or a screenshot of one) for a monthly costs tracker. ${src} Today is ${todayISO()}.

Extract every transaction shown and reply with ONLY a JSON array (no prose). One object per transaction:
{"date":"YYYY-MM-DD" or null,"description":string,"amount":number,"currency":"EUR","type":"expense"|"income"|"investment","group":"Fixed"|"Variable"|"Extra"|"Additional" or null,"category":string or null,"item":string,"certainty":"sure"|"guess"}

Rules:
- A receipt or invoice is ONE object for its total. A statement is one object per transaction line; skip balances, totals and headers.
- amount is a positive number with a dot as decimal separator and no thousands separator. currency is the ISO code printed on the document.
- description is a short label (max 40 characters) for what it was, usually the merchant. Use "" if you cannot tell.
- Money going out is "expense". Money coming in (salary, refunds of income, interest) is "income". Money moved into savings or investments is "investment".
- For an expense set group, category and item; for income and investment set group and category to null and set item. Copy group, category and item EXACTLY from the taxonomy below. If nothing fits well, pick the closest one; never invent new names. Do not use a group that is not listed in the taxonomy.
- certainty is about group, category and item only. Use "sure" when the document itself makes the choice clear (for example a supermarket receipt for Groceries, or a payslip for Salary). Use "guess" whenever you had to infer it from a vague merchant name or an unclear line, or when the closest match is not a good one. When unsure, use "guess": the person will check every guess.
- If the year is missing from a date, use the most recent plausible year. Use null when there is no date.
- Reply with [] if there are no transactions.

Taxonomy (the categories that exist in ${py}):
${taxonomyText(model, py)}${isText ? `

Document text:
"""
${chunk}
"""` : ''}`;
}

let rowSeq = 0;
export function normalizeRow(model, raw, d) {
  const type = ['expense', 'income', 'investment'].includes(raw.type) ? raw.type : 'expense';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? raw.date : todayISO();
  // Only what exists in the year of the row's own date is accepted; anything else is left empty to pick.
  const TX = model.taxonomyForYear(yearLabelOfDate(date));
  let group = null, category = null, item = null, regrouped = false;
  if (type === 'expense') {
    group = findIn(EXP_GROUPS, raw.group);
    let gc = group ? (TX.expenses[group] || {}) : {};
    let c = findIn(Object.keys(gc), raw.category);
    if (!c) {
      for (const g of EXP_GROUPS) { const cc = findIn(Object.keys(TX.expenses[g] || {}), raw.category); if (cc) { group = g; gc = TX.expenses[g]; c = cc; regrouped = true; break; } }
    }
    if (!group || !Object.keys(TX.expenses[group] || {}).length) { group = EXP_GROUPS.find((g) => Object.keys(TX.expenses[g] || {}).length) || 'Variable'; regrouped = true; }
    if (c) { category = c; item = findIn(gc[c], raw.item); }
  } else {
    item = findIn((type === 'income' ? TX.incomes : TX.investments) || [], raw.item);
  }
  const cur = String(raw.currency || 'EUR').trim().toUpperCase();
  return {
    id: ++rowSeq, fileId: d.id, fileName: d.name, date,
    description: String(raw.description || '').trim().slice(0, 80),
    type, group: type === 'expense' ? group : null, category, item,
    // Only trusted when the reader says "sure" (and didn't have to move it to another group). Never saved.
    guess: raw.certainty !== 'sure' || regrouped,
    amount: parseAmount(raw.amount),
    flag: cur && cur !== 'EUR' ? `Amount is in ${cur} — enter it in EUR` : '',
  };
}

export class DocReader {
  constructor(onChange) {
    this.docs = []; this.seq = 0; this.analyzing = false; this.ctl = null;
    this.sampleFn = null; this.caps = null; this.offReason = null; this.imagesNote = null;
    this.onChange = onChange;
  }
  changed() { this.onChange && this.onChange(); }
  imgCaps() { return (this.caps && this.caps.images) || null; }
  accept() {
    const types = ['application/pdf', '.pdf', '.csv', '.tsv', '.txt', 'text/plain', 'text/csv'];
    return this.imgCaps() ? types.concat(this.imgCaps().mediaTypes).join(',') : types.join(',');
  }

  async init(sampleFn) {
    if (!sampleFn) { this.offReason = "Reading documents isn't available in this view: the page couldn't get access to Claude."; this.changed(); return; }
    this.sampleFn = sampleFn;
    let limErr = null;
    try { this.caps = await sampleFn.limits(); } catch (e) { this.caps = null; limErr = e; }
    if (!this.imgCaps()) {
      const detail = limErr ? `limits() failed: ${limErr.code || ''} ${limErr.message || limErr}`.trim() : `limits() returned no "images" (keys: ${this.caps ? Object.keys(this.caps).join(', ') || 'none' : 'none'})`;
      this.imagesNote = "Photos and scanned files can't be read in this view, only PDFs with selectable text, CSV and TXT. [" + detail + ']';
    }
    this.ready = true;
    this.changed();
  }

  add(list) {
    if (this.analyzing || !this.sampleFn) return;
    Array.from(list || []).forEach((f) => {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      const isText = !isPdf && (/^text\//.test(f.type) || TEXT_EXT.test(f.name));
      const isImg = !isPdf && !isText && /^image\/(jpeg|png|webp|gif)$/.test(f.type);
      const d = { id: ++this.seq, file: f, name: f.name, size: f.size, kind: isPdf ? 'pdf' : isText ? 'text' : 'image', status: 'preparing', pct: 0, images: [], chunks: null, note: '', rows: [] };
      this.docs.push(d);
      if (!isPdf && !isText && !isImg) { d.status = 'error'; d.note = 'Unsupported file type'; }
      else if (isImg && !this.imgCaps()) { d.status = 'error'; d.note = "Photos can't be read in this view"; }
      else if (f.size > Math.max(20 * 1048576, (this.imgCaps() && this.imgCaps().maxInputBytes) || 0)) { d.status = 'error'; d.note = 'File too large'; }
      else this.prepare(d);
    });
    this.changed();
  }
  remove(id) { this.docs = this.docs.filter((d) => d.id !== id); this.changed(); }
  clear() { this.docs = []; this.changed(); }
  cancel() { if (this.analyzing && this.ctl) { this.ctl.abort(); return true; } this.clear(); return false; }

  textBudget(model) {
    const cap = (this.caps && this.caps.maxPromptBytes) || 65536;
    return Math.max(6000, cap - utf8Len(buildPrompt(model, { name: 'x' }, '', 0, 1)) - 1500);
  }
  chunkText(text) {
    const budget = this.textBudget(this.model), chunks = []; let cur = '', curB = 0;
    const push = () => { if (cur.trim()) chunks.push(cur); cur = ''; curB = 0; };
    text.split('\n').forEach((line0) => {
      let line = line0;
      while (utf8Len(line) + 1 > budget) { const cut = Math.floor(budget / 4); if (curB) push(); chunks.push(line.slice(0, cut)); line = line.slice(cut); }
      const b = utf8Len(line) + 1;
      if (curB + b > budget) push();
      cur += line + '\n'; curB += b;
    });
    push();
    return chunks;
  }
  setText(d, text) {
    const clean = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean) { d.status = 'error'; d.note = 'No text found in this file'; return false; }
    let chunks = this.chunkText(clean);
    if (chunks.length > MAX_CHUNKS) { chunks = chunks.slice(0, MAX_CHUNKS); d.note = (d.note ? d.note + ' · ' : '') + 'very long, only the first part is read'; }
    d.chunks = chunks; return true;
  }

  async prepare(d) {
    const alive = () => this.docs.includes(d);
    try {
      if (d.kind === 'text') {
        if (!this.setText(d, await d.file.text())) { this.changed(); return; }
        d.pct = 100;
      } else if (d.kind === 'image') {
        if (window.createImageBitmap) { const bm = await createImageBitmap(d.file); if (bm.close) bm.close(); }
        d.images = [d.file]; d.pct = 100;
      } else {
        const pdfjs = await loadPdfJs();
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await d.file.arrayBuffer()), isEvalSupported: false }).promise;
        // 1) The text layer first: cheaper, exact, and it works without image input.
        let text = '', pagesRead = 0; const cap = this.textBudget(this.model) * MAX_CHUNKS;
        for (let i = 1; i <= pdf.numPages; i++) {
          if (!alive()) { try { pdf.destroy(); } catch { /* gone */ } return; }
          text += `\n--- page ${i} ---\n` + await pdfPageText(await pdf.getPage(i));
          pagesRead = i; d.pct = Math.round(i / pdf.numPages * 50); this.changed();
          if (text.length > cap) break;
        }
        const chars = text.replace(/--- page \d+ ---/g, '').replace(/\s/g, '').length;
        if (chars >= 30 * Math.max(1, pagesRead)) {
          if (pagesRead < pdf.numPages) d.note = `first ${pagesRead} of ${pdf.numPages} pages`;
          if (!this.setText(d, text)) { try { pdf.destroy(); } catch { /* ignore */ } this.changed(); return; }
        } else if (this.imgCaps()) {
          // 2) A scan (no text layer): render pages to images for Claude to look at.
          const n = Math.min(pdf.numPages, Math.max(1, this.imgCaps().maxCount || 1));
          for (let i = 1; i <= n; i++) {
            if (!alive()) { try { pdf.destroy(); } catch { /* gone */ } return; }
            const page = await pdf.getPage(i);
            const v1 = page.getViewport({ scale: 1 });
            const vp = page.getViewport({ scale: Math.max(0.5, Math.min(3, 1500 / Math.max(v1.width, v1.height))) });
            const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
            const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
            if (!blob) throw new Error('page render failed');
            d.images.push(blob); d.pct = 50 + Math.round(i / n * 50); this.changed();
          }
          if (pdf.numPages > n) d.note = `first ${n} of ${pdf.numPages} pages`;
        } else {
          try { pdf.destroy(); } catch { /* ignore */ }
          d.status = 'error'; d.note = "Scanned PDF: it has no text, and this view can't read images"; this.changed(); return;
        }
        try { pdf.destroy(); } catch { /* ignore */ }
      }
      if (!alive()) return;
      d.status = 'ready';
    } catch {
      d.status = 'error'; d.note = d.kind === 'image' ? "Couldn't read this image" : d.kind === 'pdf' ? "Couldn't open this PDF" : "Couldn't read this file";
    }
    this.changed();
  }

  /** Reads every ready file. Returns { rows, fatal, aborted }. */
  async analyze(model) {
    const targets = this.docs.filter((d) => d.status === 'ready');
    if (!targets.length || this.analyzing || !this.sampleFn) return null;
    this.analyzing = true; const ctl = new AbortController(); this.ctl = ctl;
    targets.forEach((d) => { d.status = 'reading'; d.rows = []; d.wasRead = true; });
    this.changed();
    let fatal = null; const queue = targets.slice();
    const toArr = (out) => (Array.isArray(out) ? out : (out && Array.isArray(out.entries) ? out.entries : []));
    const worker = async () => {
      while (queue.length && !ctl.signal.aborted && !fatal) {
        const d = queue.shift();
        try {
          let arr = [];
          if (d.chunks) {
            for (let k = 0; k < d.chunks.length; k++) arr = arr.concat(toArr(await this.sampleFn.json(buildPrompt(model, d, d.chunks[k], k, d.chunks.length), { signal: ctl.signal })));
          } else {
            arr = toArr(await this.sampleFn.json(buildPrompt(model, d), { images: d.images, signal: ctl.signal }));
          }
          d.rows = arr.filter((x) => x && typeof x === 'object').map((x) => normalizeRow(model, x, d));
          d.status = d.rows.length ? 'done' : 'empty';
        } catch (e) {
          if (e && e.code === 'cancelled') d.status = 'ready';
          else {
            d.status = 'error'; d.note = errCopy(e);
            if (e && ['not_granted', 'sampling_disabled', 'rate_limited', 'session_expired'].includes(e.code)) fatal = e;
          }
        }
        this.changed();
      }
    };
    await Promise.all([worker(), worker()]);
    queue.forEach((d) => { d.status = 'ready'; });
    this.analyzing = false; this.ctl = null;
    this.changed();
    return { rows: targets.flatMap((d) => d.rows), fatal, aborted: ctl.signal.aborted };
  }
}

// Text of one PDF page, keeping rows together (items on the same baseline) and columns apart.
async function pdfPageText(page) {
  const tc = await page.getTextContent(); let out = '', lastY = null;
  tc.items.forEach((it) => {
    if (typeof it.str !== 'string') return;
    const y = it.transform ? it.transform[5] : 0;
    if (lastY !== null && Math.abs(y - lastY) > 2) out += '\n'; else if (out && !out.endsWith('\n') && it.str) out += '  ';
    out += it.str; lastY = y;
  });
  return out;
}
