'use client';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { ActionLink, Button, Divider, Dropdown, Field, Illustration, Input, PanelHeader, ProgressBar, RoundButton, illustrations, useMobile } from '../ui/index.js';
import { Icon } from '../ui/Icon.jsx';
import { calendar, chevronDown, documentIcon, euro, image, plus, questionOutlined, upload, x } from '../ui/icons.js';
import { KINDS, TypeModal } from './TaxonomyModals.jsx';
import { sample } from './api.js';
import { DocReader, docIconName, docMeta } from './reader.js';
import { EXP_GROUPS, TYPE_OPTS, hasGroups, fmtDateEU, fmtNum, parseAmount, periodKeyOfDate, periodLabel, periodMismatch, todayISO, typeKeyOf, yearLabelOfDate } from './model.js';

const GROUP_TABS = ['Fixed', 'Variable', 'Additional', 'Extra'].map((g) => ({ value: g, label: g }));
const simpleOpts = (values) => values.map((v) => ({ value: v, label: v }));

// Add entry panel (Cost-tracker 52:3443 / 174:15081): "Upload documents" (read by Claude, then reviewed row by row)
// and "Enter manually". Both end the same way: entries are saved, a Toast confirms, the panel resets.
export function AddPanel({ open, preset, model, yearIdx, monthIdx, onClose, save }) {
  // ---------- manual form ----------
  const [entryType, setEntryType] = useState('expense');
  const [entryGroup, setEntryGroup] = useState('Fixed');
  const [cat, setCat] = useState('');
  const [item, setItem] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState(null);
  const [periodTouched, setPeriodTouched] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const dateRef = useRef(null);
  const [dateVal, setDateVal] = useState(todayISO());
  const panelRef = useRef(null);
  const mobile = useMobile();

  // The date input is uncontrolled: code (and tests) may set .value and fire 'change', as on the legacy page.
  useEffect(() => {
    const el = dateRef.current; if (!el) return;
    const on = () => setDateVal(el.value);
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  }, []);
  const setDate = (v) => { if (dateRef.current) dateRef.current.value = v; setDateVal(v); };

  const periodKey = period && model.periodExists(period) ? period : model.defaultPeriodKey(yearIdx, monthIdx);
  const yearLabel = (periodKey || '').slice(0, 4) || yearLabelOfDate(dateVal);
  const TX = model.taxonomyForYear(yearLabel);
  const isExp = entryType === 'expense';
  // The three categories and any of their sub-categories. Expenses always have one; Income and Savings may have none.
  const kinds = model.kindsOf(yearLabel);
  const kindName = (kinds.find((k) => k.type === entryType) || {}).label || entryType;
  const grouped = hasGroups(entryType);
  const namedSubs = model.subsOf(entryType, yearLabel).filter(Boolean);
  const subVal = isExp ? entryGroup : (namedSubs.includes(entryGroup) ? entryGroup : '');
  const gc = !grouped ? {} : (TX.expenses[subVal] || {});
  // Oct 2 (229:18166): Group (Optional) is the taxonomy category, Type the item. With no group picked, Type lists
  // every type of the sub-category and picking one fills its group.
  const groupNames = Object.keys(gc).sort();
  const catVal = grouped && cat && gc[cat] ? cat : '';
  const typeOwner = (it) => groupNames.find((g) => gc[g].includes(it)) || '';
  const pool = grouped
    ? (catVal ? gc[catVal].slice().sort() : [...new Set(groupNames.flatMap((g) => gc[g]))].sort())
    : model.catOptions(entryType, subVal || null, yearLabel).map((o) => o.item);
  const itemVal = pool.includes(item) ? item : (grouped && catVal && pool.length === 1 ? pool[0] : '');
  const itemCat = grouped ? (catVal || typeOwner(itemVal)) : '';
  const [typeModal, setTypeModal] = useState(false);
  const typeHas = (v) => model.subsOf(v, yearLabel).some((g) => model.catOptions(v, g, yearLabel).length > 0);
  const subOptions = [...(isExp ? [] : [{ value: '__none', label: 'None' }]), ...(isExp ? GROUP_TABS.map((o) => o.value).filter((g) => namedSubs.includes(g)).concat(namedSubs.filter((g) => !GROUP_TABS.some((o) => o.value === g))) : namedSubs)
    .filter((g) => !isExp || Object.keys(TX.expenses[g] || {}).length || g === entryGroup).map((g) => ({ value: g, label: g }))];
  const bounds = model.entryDateBounds();
  // Oct 5: Expenses' sub-categories are the user's (Fixed may be gone): fall back to the first one the year has.
  const expDefault = (g) => { const subs = model.subsOf('expense', yearLabel).filter(Boolean); return subs.includes(g) ? g : subs.includes('Fixed') ? 'Fixed' : (subs[0] || 'Fixed'); };

  // Opening the panel (from the Tracker's "+ Add ..." or a row's "Add entry") sets the type (and the row's group and type) and starts a fresh form.
  useEffect(() => {
    if (!open) return;
    setEntryType(preset.type); setEntryGroup(preset.type === 'expense' ? expDefault(preset.group) : (preset.group || ''));
    setCat(preset.cat || ''); setItem(preset.item || ''); setDate(todayISO()); setPeriodTouched(false); setPeriod(model.defaultPeriodKey(yearIdx, monthIdx));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset]);
  // Until the person picks a month, "Add to" follows the date (when that month exists).
  useEffect(() => {
    if (periodTouched) return;
    const k = periodKeyOfDate(dateVal);
    if (k && model.periodExists(k)) setPeriod(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateVal]);

  const manualReady = !!desc.trim() && !!itemVal && (!isExp || !!itemCat) && parseAmount(amount) > 0;
  const entryGroupOut = isExp ? entryGroup : (subVal || null);
  const resetManual = () => {
    setDesc(''); setAmount(''); setDate(todayISO()); setPeriodTouched(false); setPeriod(model.defaultPeriodKey(yearIdx, monthIdx));
    setStatus(null); setCat(''); setItem('');
  };

  const submitManual = async () => {
    setStatus(null);
    const err = (m) => setStatus({ err: true, text: m });
    const description = desc.trim();
    const amt = Math.round(parseAmount(amount) * 100) / 100;
    const date = (dateRef.current && dateRef.current.value) || todayISO();
    if (!description) return err('Add a description.');
    if (!itemVal) return err('Pick a type.');
    if (periodMismatch(date, periodKey)) return err(`The date of the entry (${fmtDateEU(date)}) doesn't match the month and year selected (${periodLabel(periodKey)}). Change the date or the month.`);
    if (!(amt > 0)) return err('Enter an amount greater than 0.');
    setBusy(true);
    try {
      await save.entries(periodKey, [{ type: entryType, group: entryGroupOut, category: grouped ? (itemCat || null) : null, item: itemVal, description, amount: amt, date }]);
      resetManual();
    } catch (e) {
      err('Could not save: ' + (e && e.message ? e.message : 'unknown error'));
    } finally { setBusy(false); }
  };

  // ---------- upload + review ----------
  const [, bump] = useReducer((n) => n + 1, 0);
  const readerRef = useRef(null);
  if (!readerRef.current) readerRef.current = new DocReader(bump);
  const reader = readerRef.current;
  reader.model = model;
  useEffect(() => { reader.init(sample); }, [reader]);
  const [docStatus, setDocStatus] = useState(null);
  const [review, setReview] = useState(null); // { rows, period, editing, snap, sticky }
  const fileRef = useRef(null);
  const [over, setOver] = useState(false);

  // Reading progress: the reader gets no progress from the server, so each file advances on an estimate of how long
  // Claude takes for it (a photo ~10s, a text chunk ~5s), easing towards 95%; a file that finishes jumps to 100%,
  // and the bar fills before the review opens.
  const [readStart, setReadStart] = useState(null);
  const [finishing, setFinishing] = useState(false);
  const [, tick] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    if (!reader.analyzing) { setReadStart(null); return undefined; }
    setReadStart(Date.now());
    const t = setInterval(tick, 120);
    return () => clearInterval(t);
  }, [reader.analyzing]);
  const analyze = async () => {
    setDocStatus(null);
    const res = await reader.analyze(model);
    if (!res || res.aborted) return;
    if (res.rows.length) { setFinishing(true); await new Promise((r) => setTimeout(r, 350)); setFinishing(false); }
    if (res.rows.length) {
      const ks = res.rows.map((r) => periodKeyOfDate(r.date)).filter((k) => k && model.periodExists(k)).sort();
      const p = ks.length ? ks[ks.length - 1] : model.defaultPeriodKey(yearIdx, monthIdx);
      setReview(fitRows({ rows: res.rows, period: p, editing: null, snap: null, status: null }, model));
      if (panelRef.current) panelRef.current.scrollTop = 0;
    } else setDocStatus({ err: true, text: res.fatal ? errCopyFatal(res.fatal) : 'No entries found in these files.' });
  };
  const closeReview = () => { setReview(null); reader.clear(); setDocStatus(null); };

  const enabled = reader.ready && !!reader.sampleFn;
  // (Oct 3: the review title no longer counts entries and files.)
  // Files reading (Cost-tracker 229:18563): the drop area becomes a progress box; the rest of the panel fades.
  const readingDocs = reader.docs.filter((d) => ['reading', 'done', 'empty'].includes(d.status) || (d.status === 'error' && d.wasRead));
  const elapsed = readStart ? Date.now() - readStart : 0;
  const docProgress = (d) => {
    if (d.status !== 'reading') return 1;
    const tau = d.kind === 'image' || (d.images && d.images.length) ? 10000 : 5000 * Math.max(1, (d.chunks || []).length);
    return 0.95 * (1 - Math.exp(-elapsed / tau));
  };
  const readProgress = finishing ? 1 : (readingDocs.length ? readingDocs.reduce((a, d) => a + docProgress(d), 0) / readingDocs.length : 0);
  const showReading = reader.analyzing || finishing;
  const anyPrep = reader.docs.some((d) => d.status === 'preparing');
  const anyReady = reader.docs.some((d) => d.status === 'ready');

  return (
    <>
      <div className={'add-panel-backdrop' + (open ? ' open' : '')} id="add-panel-backdrop" onClick={onClose} />
      <div ref={panelRef} className={'add-panel' + (open ? ' open' : '') + (review ? ' is-review' : '')} id="add-panel" role="dialog" aria-modal="true" aria-labelledby="add-panel-title">
        <PanelHeader closeId="entry-close-btn" titleId="add-panel-title" onClose={onClose} faded={showReading}
            title={review && !mobile ? 'Review imported entries' : 'Add an entry'}
          hint={review ? (mobile ? "Check your entries. Change anything that's wrong, or remove what doesn't belong." : "Edit details, adjust categories, or remove entries you don't want to track.") : 'Upload receipts or statements or enter the information by hand.'} />

        <div className="ap-main" id="ap-main" hidden={!!review}>
          <section className="ap-section" id="ap-upload">
            <h3 className="ap-section-title">Upload documents</h3>
            <div className="ap-block">
              {showReading && (
                <div className="dz-reading" id="dz-reading" role="status">
                  <div className="dz-reading-info">
                    <Illustration art={illustrations.upload} width={35} className="dz-reading-art" />
                    <div className="dz-reading-text">
                      <div className="dz-reading-title">{`Reading ${readingDocs.length} ${readingDocs.length === 1 ? 'file' : 'files'}`}</div>
                      <div className="dz-hint">It may take a few seconds.</div>
                    </div>
                  </div>
                  <div className="dz-progress-wrap">
                    <ProgressBar value={Math.max(0.04, readProgress)} className="dz-progress" />
                    <div className="dz-pct">{`${Math.round(readProgress * 100)}%`}</div>
                  </div>
                </div>
              )}
              <div hidden={showReading} className={'dropzone' + (enabled ? '' : ' is-off') + (over ? ' is-over' : '')} id="dropzone"
                tabIndex={enabled ? 0 : -1} role="button" aria-label="Upload documents" aria-disabled={enabled ? 'false' : 'true'}
                onClick={() => { if (!reader.analyzing && enabled) fileRef.current.click(); }}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !reader.analyzing && enabled) { e.preventDefault(); fileRef.current.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); setDocStatus(null); reader.add(e.dataTransfer && e.dataTransfer.files); }}>
                <div className="dz-text">
                  <div className="dz-line"><span className={'ds-action-link ' + (mobile ? 'small' : 'medium')}><Icon icon={upload} size={mobile ? 16 : 20} />Click to upload</span><span>or drag and drop your file here</span></div>
                  <div className="dz-hint" id="dz-hint">{reader.ready && reader.imgCaps() ? 'JPG, PNG, PDF or CSV. Add as many as you like.' : 'PDF or CSV. Add as many as you like.'}</div>
                </div>
              </div>
              <div className="dz-off-note" id="dz-off-note" role="status" hidden={!(reader.offReason || reader.imagesNote)}>
                {reader.offReason ? reader.offReason + ' You can still enter the entry by hand below.' : reader.imagesNote}
              </div>
              <input ref={fileRef} type="file" id="file-input" multiple hidden accept={reader.ready ? reader.accept() : undefined}
                onChange={(e) => { setDocStatus(null); reader.add(e.target.files); e.target.value = ''; }} />
              <div className="doc-list" id="doc-list" hidden={showReading}>
                {reader.docs.map((d) => {
                  const bad = d.status === 'error' || d.status === 'empty';
                  return (
                    <div className="doc-item" key={d.id}>
                      <span className="doc-ic"><Icon icon={docIconName(d) === 'image' ? image : documentIcon} size={mobile ? 20 : 16} /></span>
                      <div className="doc-info"><div className="doc-name" title={d.name}>{d.name}</div><div className={'doc-meta' + (bad ? ' err' : '')}>{docMeta(d)}</div></div>
                      {d.status === 'preparing' ? <span className="doc-pct">{d.pct}%</span>
                        : d.status === 'reading' ? null
                        : <RoundButton icon={x} size="tiny" iconSize="sm" className="doc-remove" label={'Remove ' + d.name} onClick={() => { setDocStatus(null); reader.remove(d.id); }} />}
                    </div>
                  );
                })}
              </div>
              <div className="add-actions" id="doc-actions" hidden={reader.docs.length === 0 || showReading}>
                {/* 229:18169 / 415:13796: only "Add files" (Small Primary, no icon); full width on phones. */}
                <Button id="doc-add" size="small" disabled={reader.analyzing || anyPrep || !anyReady} onClick={analyze}>Add files</Button>
                <span className={'add-status' + (docStatus && docStatus.err ? ' err' : '')} id="doc-status" role="status">{docStatus ? docStatus.text : ''}</span>
              </div>
            </div>
          </section>

          <Divider id="ap-divider" className={'ds-divider' + (showReading ? ' is-faded' : '')} />

          <section className={'ap-section ap-manual' + (showReading ? ' is-faded' : '')} id="ap-manual">
            <h3 className="ap-section-title">Enter manually</h3>
            <div className="add-grid">
              <div className="fld span-2 field-period">
                <label className="fld-label" htmlFor="entry-period-trigger">Track in</label>
                <Dropdown id="entry-period" size="md" emptyOption={false} value={periodKey} options={model.periodOptions()} onChange={(v) => { setPeriod(v); setPeriodTouched(true); }} />
              </div>
              <div className={'fld' + (isExp || namedSubs.length ? '' : ' span-2')}>
                <label className="fld-label" htmlFor="entry-kind-trigger">Category</label>
                <Dropdown id="entry-kind" size="md" emptyOption={false} value={entryType} onChange={(v) => { setEntryType(v); setEntryGroup(v === 'expense' ? expDefault('Fixed') : ''); setCat(''); setItem(''); }}
                  options={kinds.filter((k) => typeHas(k.type) || k.type === entryType).map((k) => ({ value: k.type, label: k.label }))} />
              </div>
              <div className="fld" id="entry-group-field" hidden={!isExp && !namedSubs.length}>
                <label className="fld-label" htmlFor="entry-sub-trigger">{isExp ? 'Sub-category' : 'Sub-category (Optional)'}</label>
                <Dropdown id="entry-sub" size="md" emptyOption={false} value={isExp ? subVal : (subVal || '__none')} onChange={(v) => { setEntryGroup(v === '__none' ? '' : v); setCat(''); setItem(''); }}
                  options={subOptions} />
              </div>
              <div className="fld span-2">
                <label className="fld-label" htmlFor="entry-desc">Description</label>
                <Input id="entry-desc" placeholder="e.g., Grocery store" autoComplete="off" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <div className="fld" id="entry-category-field" hidden={!grouped}>
                <label className="fld-label" htmlFor="entry-cat-trigger">Group (Optional)</label>
                <Dropdown id="entry-cat" size="md" placeholder="Select" value={catVal || itemCat} options={grouped ? simpleOpts(groupNames.filter(Boolean)) : []} onChange={(v) => { setCat(v); if (!(gc[v] || []).includes(itemVal)) setItem(''); }} />
              </div>
              <div className={'fld' + (grouped ? '' : ' span-2')} id="entry-item-field">
                <label className="fld-label" htmlFor="entry-item-trigger">Type</label>
                <Dropdown id="entry-item" size="md" placeholder="Select" value={itemVal} options={simpleOpts(pool)} onChange={(v) => setItem(v)} />
              </div>
              <div className="fld">
                <label className="fld-label" htmlFor="entry-amount">Amount</label>
                <Input id="entry-amount" icon={euro} iconSize={mobile ? 'lg' : 'md'} size="medium" type="text" placeholder="0,00" inputMode="decimal" autoComplete="off" value={amount} className="is-value" onChange={(e) => setAmount(e.target.value)}
                  onBlur={(e) => { if (e.target.value.trim()) setAmount(fmtNum(parseAmount(e.target.value))); }} />
              </div>
              <div className="fld">
                <label className="fld-label" htmlFor="entry-date">Date</label>
                {/* 229:18166: a Medium Dropdown with a 24px Calendar before dd/mm/yyyy and the chevron; phones (369:13388): no
                    leading icon, a 12px Calendar where the chevron is. The native picker opens on click. */}
                <div className={'date-dd' + (mobile ? ' is-phone' : '')}>
                  {!mobile && <Icon icon={calendar} size="xl" className="date-dd-cal" />}
                  <input ref={dateRef} id="entry-date" type="date" defaultValue={todayISO()} min={bounds.min} max={bounds.max}
                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* older browsers open it themselves */ } }} />
                  <span className="date-dd-label" aria-hidden="true">{fmtDateEU(dateVal) || 'dd/mm/yyyy'}</span>
                  <Icon icon={mobile ? calendar : chevronDown} size={12} className="date-dd-chevron" />
                </div>
              </div>
              <div className="span-2">
                <ActionLink size="medium" icon={plus} id="entry-add-type" onClick={() => setTypeModal(true)}>Add type</ActionLink>
              </div>
            </div>
            <TypeModal open={typeModal} kind={entryType} kindName={kindName} group={isExp ? entryGroup : (subVal || null)} groupsOf={() => groupNames.filter(Boolean)} onClose={() => setTypeModal(false)} id="entry-type-modal"
              onSave={async (t) => {
                try { await save.addTypes(yearLabel, { type: entryType, kindName, ...t }); setTypeModal(false); if (grouped) setCat(t.category || ''); setItem(t.items[0]); }
                catch (e) { setStatus({ err: true, text: 'Could not add the type: ' + (e && e.message ? e.message : 'unknown error') }); setTypeModal(false); }
              }} />
            <div className="add-actions">
              {/* 229:18167 / 369:13388: one Submit (40% until the form has what an entry needs), full width on phones. */}
              <Button id="entry-submit" disabled={busy || !manualReady} onClick={submitManual}>Save entry</Button>
              <span className={'add-status' + (status && status.err ? ' err' : '')} id="entry-status" role="status">{status ? status.text : ''}</span>
            </div>
          </section>
        </div>

        <Review mobile={mobile} review={review} setReview={setReview} model={model} reader={reader} onCancel={closeReview} save={save} onDone={closeReview} />
      </div>
    </>
  );
}

const errCopyFatal = (e) => {
  switch (e && e.code) {
    case 'not_granted': return 'Claude access was declined for this page.';
    case 'sampling_disabled': return 'Claude isn’t available for this account.';
    case 'rate_limited': return 'Usage limit reached. Try again later.';
    case 'session_expired': return 'Your session expired. Sign in again.';
    default: return "Couldn't read this file";
  }
};

// ---------------- review ----------------
const rowCatLabel = (r) => (!r.item ? '' : r.type === 'expense' ? (r.category ? `${r.category}/${r.item}` : '') : r.item);
function rowIssues(r, period) {
  const iss = [];
  if (!r.description.trim()) iss.push('desc');
  if (!r.item || (r.type === 'expense' && !r.category)) iss.push('cat');
  if (!(r.amount > 0)) iss.push('amount');
  if (r.flag) iss.push('flag');
  if (periodMismatch(r.date, period)) iss.push('date');
  return iss;
}
// A row's category has to exist in the year it's added to; if not, the person picks it again.
function fitRows(rv, model) {
  const yl = (rv.period || '').slice(0, 4);
  return { ...rv, rows: rv.rows.map((r) => { const label = rowCatLabel(r); return label && !model.catOptions(r.type, r.group, yl).some((o) => o.label === label) ? { ...r, category: null, item: null } : r; }) };
}
const shortDate = (iso) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

function Review({ review, setReview, model, reader, onCancel, save, onDone, mobile }) {
  const rowsRef = useRef(null);
  const focusReq = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const rows = review ? review.rows : [];
  const period = review ? review.period : null;
  const yl = (period || '').slice(0, 4);

  const update = (fn) => setReview((rv) => (rv ? fn(rv) : rv));
  const patchRow = (id, patch) => update((rv) => ({ ...rv, rows: rv.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const startEdit = (id, field) => {
    update((rv) => ({ ...rv, editing: id, snap: rv.rows.find((r) => r.id === id) || null }));
    focusReq.current = { id, field };
  };
  const commitEdit = () => update((rv) => ({ ...rv, editing: null, snap: null }));
  const cancelEdit = () => update((rv) => ({ ...rv, rows: rv.snap ? rv.rows.map((r) => (r.id === rv.editing ? rv.snap : r)) : rv.rows, editing: null, snap: null }));

  // Focus the field the person clicked once its row is in edit mode (a dropdown: its trigger).
  useLayoutEffect(() => {
    const req = focusReq.current; if (!req || !review || review.editing !== req.id) return;
    focusReq.current = null;
    const row = rowsRef.current && rowsRef.current.querySelector(`.rv-row[data-id="${req.id}"]`);
    let el = row && (row.querySelector(`[data-f="${req.field}"]`) || row.querySelector('[data-f="desc"]'));
    if (el && el.tagName === 'SELECT') el = el.parentElement.querySelector('.ds-dd-trigger');
    if (el) { el.focus(); if (el.select && el.tagName === 'INPUT') el.select(); }
  });

  if (!review) return <div className="ap-section" id="ap-review" hidden />;

  const failed = reader.docs.filter((d) => d.status === 'error' || d.status === 'empty').length;
  const issues = rows.map((r) => rowIssues(r, period));
  const bad = issues.filter((i) => i.length).length;
  const dateBad = issues.filter((i) => i.includes('date')).length;
  const otherBad = issues.filter((i) => i.some((k) => k !== 'date')).length;
  const guesses = rows.filter((r) => r.guess && rowCatLabel(r)).length;
  const away = rows.filter((r) => !periodMismatch(r.date, period) && periodKeyOfDate(r.date) !== period).length;
  let st = review.status;
  if (bad) {
    const parts = [];
    if (otherBad) parts.push(`${otherBad} ${otherBad === 1 ? 'entry needs' : 'entries need'} attention before you can submit.`);
    if (dateBad) parts.push(`The date of ${dateBad} ${dateBad === 1 ? 'entry doesn’t' : 'entries don’t'} match the month and year selected.`);
    st = { err: true, text: parts.join(' ') };
  } else if (!st) {
    const parts = [];
    if (guesses) parts.push(`${guesses} ${guesses === 1 ? 'category is a guess' : 'categories are guesses'}. Check ${guesses === 1 ? 'it' : 'them'} before you submit.`);
    if (away) parts.push(`${away} ${away === 1 ? 'entry is' : 'entries are'} dated in another month and will count toward ${periodLabel(period)}.`);
    st = { err: false, text: parts.join(' '), guess: guesses > 0 };
  }

  const submit = async () => {
    if (review.editing !== null) commitEdit();
    if (!rows.length || bad) return;
    setSubmitting(true);
    try {
      const res = await save.entries(period, rows.map((r) => ({ type: r.type, group: r.type === 'expense' ? r.group : null, category: r.type === 'expense' ? r.category : null, item: r.item, description: r.description.trim(), amount: r.amount, date: r.date })), true);
      if (!res) { update((rv) => ({ ...rv, status: { err: true, text: `Could not create ${period.slice(0, 4)}. Try Submit again.` } })); return; }
      if (res.failed.length === 0) onDone();
      else update((rv) => ({ ...rv, rows: rv.rows.filter((_, i) => res.failed.includes(i)), status: { err: true, text: `${res.failed.length} of ${rows.length} couldn't be saved. Try Submit again.` } }));
    } finally { setSubmitting(false); }
  };

  // Activation on mousedown (with preventDefault, so an open row's inputs keep focus); keyboard via click.
  const activate = (ev) => {
    const rm = ev.target.closest('[data-rm]');
    if (rm) { const id = Number(rm.dataset.rm); update((rv) => ({ ...rv, rows: rv.rows.filter((r) => r.id !== id), ...(rv.editing === id ? { editing: null, snap: null } : {}) })); return; }
    const ed = ev.target.closest('[data-edit]');
    if (ed) startEdit(Number(ed.dataset.edit), ed.dataset.focus);
  };
  const onFocusOut = (ev) => {
    if (review.editing === null) return;
    const row = ev.target.closest('.rv-row');
    setTimeout(() => {
      if (!row || !row.isConnected) return;
      if (row.querySelector('.ds-dd.open')) return;
      if (!row.contains(document.activeElement)) commitEdit();
    }, 0);
  };

  return (
    <div className="ap-section" id="ap-review">
      <Field className="ap-period" id="rv-period-field" label="Track in" htmlFor="rv-period-trigger" hidden={rows.length === 0}>
        <Dropdown id="rv-period" size="md" emptyOption={false} value={period} options={model.periodOptions()}
          onChange={(v) => setReview((rv) => fitRows({ ...rv, period: v, editing: null, snap: null, status: null }, model))} />
      </Field>
      {rows.length === 0
        ? <div className="rv-empty" id="rv-note">No entries left to submit.</div>
        : <div className="rv-note" id="rv-note" hidden={!failed}>{failed ? `${failed} ${failed === 1 ? 'file' : 'files'} couldn't be read and ${failed === 1 ? 'is' : 'are'} not listed here.` : ''}</div>}
      <div className="rv-table" id="rv-table" hidden={rows.length === 0}>
        <div className="rv-head" aria-hidden="true">
          <span className="c-date">Date</span><span className="c-desc">Description</span><span className="c-type">Type</span><span className="c-cat">Category</span><span className="c-amt" style={{ justifyContent: 'flex-end' }}>Amount</span><span className="c-rm" />
        </div>
        <div className="rv-rows" id="rv-rows" ref={rowsRef}
          onMouseDown={(ev) => { if (ev.button === 0 && ev.target.closest('[data-rm],[data-edit]')) { ev.preventDefault(); activate(ev); } }}
          onClick={(ev) => { if (ev.detail === 0) activate(ev); }}
          onKeyDown={(ev) => {
            if (review.editing === null) return;
            if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON') { ev.preventDefault(); commitEdit(); }
            else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancelEdit(); }
          }}
          onBlur={onFocusOut}>
          {/* 229:18167 / 415:14256 (Oct 3): every row is open: description input, Type and Category dropdowns, amount. */}
          {rows.map((r, i) => <ReviewRow key={r.id} r={r} iss={issues[i]} editing mobile={mobile} period={period} yl={yl} model={model} patchRow={patchRow} />)}
        </div>
      </div>
      {/* 229:18717: the guess note (16px Question / Outlined + Body/Medium/Medium) on the left, then Cancel and Save entries,
          8 apart. 415:14256: the note (20px icon, Body/Large/Medium), then Save entries over Cancel, full width, 16 apart. */}
      <div className="add-actions rv-actions">
        <span className={'add-status' + (st && st.err ? ' err' : '') + (st && st.guess ? ' has-guess' : '')} id="rv-status" role="status">{st && st.guess ? <span className="rv-guess" aria-hidden="true"><Icon icon={questionOutlined} size={mobile ? 20 : 16} /></span> : null}{st ? st.text : ''}</span>
        <Button variant="tertiary" id="rv-cancel" onClick={onCancel}>Cancel</Button>
        <Button id="rv-submit" disabled={!rows.length || bad > 0 || submitting} onClick={submit}>{submitting ? 'Saving…' : 'Save entries'}</Button>
      </div>
    </div>
  );
}

function ReviewRow({ r, iss, editing, mobile, period, yl, model, patchRow }) {
  const has = (k) => iss.includes(k);
  const typeKey = typeKeyOf(r.type, r.group);
  const allTypes = model.typeOpts(yl);
  const typeLabel = (allTypes.find((t) => t.key === typeKey) || TYPE_OPTS.find((t) => t.key === 'expense:Variable')).label;
  const catLabel = rowCatLabel(r);
  const dateTitle = has('date') ? `The date of this entry doesn't match the month and year selected (${periodLabel(period)}).` : r.date;
  const date = <span className={'c-date rv-date' + (has('date') ? ' bad' : '')} title={dateTitle}>{shortDate(r.date)}</span>;
  // Type: Income and Savings/Investment first, then the expense sub-types in an "Expenses" group.
  const list = model.typeOptsForYear(yl, typeKey);
  const typeOptions = [...list.filter((t) => t.type !== 'expense').map((t) => ({ value: t.key, label: t.label, selectedLabel: t.label }))];
  const exp = list.filter((t) => t.type === 'expense');
  if (exp.length) typeOptions.push({ group: 'Expenses', options: exp.map((t) => ({ value: t.key, label: t.group, selectedLabel: t.label })) });
  // Category: expenses grouped by category (rows are the sub-categories); income and savings one flat list.
  const cats = model.catOptions(r.type, r.group, yl);
  let catOptions;
  if (hasGroups(r.type)) {
    const by = new Map();
    cats.forEach((o) => { if (!by.has(o.category)) by.set(o.category, []); by.get(o.category).push(o); });
    catOptions = [...by].map(([c, os]) => ({ group: c, options: os.map((o) => ({ value: o.label, label: o.item, selectedLabel: o.label })) }));
  } else catOptions = cats.map((o) => ({ value: o.label, label: o.item, selectedLabel: o.label }));
  // 229:18717 (desktop): Sep 19 (Label/Small, text/secondary) | Input Tn 140 | Dropdown Tiny 140 | Dropdown Tiny 140 | the amount
  // as a value (16px € + Value/Large), 8 apart; no remove. 415:14256 (phones): date | Input + two Dropdowns, Medium, stacked
  // 8 apart | value, 16 apart. A guessed category shows Question / Outlined at the start of its dropdown (phones: both).
  // An amount the reader could not read stays an input, so it can be fixed.
  const guess = !!(r.guess && catLabel);
  const amountOk = r.amount > 0 && !has('amount') && !has('flag');
  return (
    <div className="rv-row is-editing" data-id={r.id}>{date}
      <div className="c-fields">
        <div className={'c-desc' + (has('desc') ? ' bad' : '')} title={'From ' + r.fileName}><Input size={mobile ? 'medium' : 'tiny'} data-f="desc" aria-label="Description" defaultValue={r.description} placeholder="Description" autoComplete="off"
          onChange={(e) => patchRow(r.id, { description: e.target.value })} /></div>
        <div className="c-type rv-select">
          <Dropdown size={mobile ? 'md' : 'tiny'} ariaLabel="Type" emptyOption={false} value={typeKey} options={typeOptions} selectProps={{ 'data-f': 'type' }} icon={guess && mobile ? questionOutlined : undefined}
            onChange={(v) => {
              const t = allTypes.find((o) => o.key === v); if (!t) return;
              const keep = model.catOptions(t.type, t.group, yl).find((o) => o.label === catLabel);
              patchRow(r.id, { type: t.type, group: t.group, category: keep ? keep.category : null, item: keep ? keep.item : null });
            }} />
        </div>
        <div className={'c-cat rv-select' + (has('cat') ? ' bad' : '') + (guess ? ' is-guess' : '')} title={guess ? 'Guess: the reader was not sure about this category. Check it, or pick another.' : undefined}>
          <Dropdown size={mobile ? 'md' : 'tiny'} ariaLabel="Category" value={catLabel} options={catOptions} selectProps={{ 'data-f': 'cat' }} icon={guess ? questionOutlined : undefined}
            onChange={(v) => { const o = cats.find((x) => x.label === v); patchRow(r.id, { category: o ? o.category : null, item: o ? o.item : null, guess: false }); }}
            onChoose={() => patchRow(r.id, { guess: false })} />
        </div>
      </div>
      {amountOk
        ? <div className="c-amt rv-value"><Icon icon={euro} size={16} /><span>{fmtNum(r.amount)}</span></div>
        : <div className="c-amt bad" title={r.flag || ''}><label className="bd-input"><Icon icon={euro} size={12} />
            <input data-f="amount" inputMode="decimal" aria-label="Amount" defaultValue={r.amount > 0 ? fmtNum(r.amount) : ''} placeholder="0,00" autoComplete="off"
              onChange={(e) => patchRow(r.id, { amount: parseAmount(e.target.value), flag: '' })} /></label></div>}
    </div>
  );
}
