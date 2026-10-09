import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, analyzeWorkbook } from '../public/legacy/importer.js';
import { boardFromFile, entriesForBoard, matchRule, prettyName } from '../src/onboarding/board-from-file.js';

// Oct 9: onboarding "Import a file" — a CSV / Excel file becomes the board (three buckets) and its past figures.
const enc = (s) => new TextEncoder().encode(s);
const run = async (name, text, opt) => boardFromFile(analyzeWorkbook(await readFile(name, enc(text)), { fileName: name }), opt);
const find = (b, item) => b.types.find((t) => t.item === item);

const BANK = `Fecha;Concepto;Importe
${['01', '02', '03'].map((m) => `28/${m}/2026;NOMINA ACME SL;2.500,00
01/${m}/2026;Alquiler piso;-900,00
05/${m}/2026;MERCADONA BARCELONA 123;-85,40
09/${m}/2026;Netflix.com;-12,99
12/${m}/2026;Transferencia a cuenta ahorro;-300,00
15/${m}/2026;ACME GYM CLUB SANTS;-39,90
18/${m}/2026;Tienda Rara 77;-${m === '01' ? '20' : m === '02' ? '55' : '9'},00`).join('\n')}
20/03/2026;Vueling Airlines;-180,00`;

test('a bank export lands in the three buckets with sensible types', async () => {
  const r = await run('cuenta.csv', BANK);
  const b = r.board;
  assert.deepEqual(r.years, ['2026']); assert.equal(r.months, 3); assert.equal(r.first, '2026-01');
  assert.deepEqual([find(b, 'Salary').type, find(b, 'Salary').budget], ['income', 2500]);
  assert.deepEqual([find(b, 'Savings').type, find(b, 'Savings').budget], ['investment', 300]);
  assert.deepEqual(['type', 'group', 'category', 'budget'].map((k) => find(b, 'Rent')[k]), ['expense', 'Fixed', 'Habitation', 900]);
  assert.deepEqual(['group', 'category'].map((k) => find(b, 'Groceries')[k]), ['Variable', 'Food']);
  assert.equal(find(b, 'Subscriptions').group, 'Fixed');
  assert.equal(find(b, 'Travel').group, 'Extra'); assert.equal(find(b, 'Travel').budget, 60); // 180 over 3 months
  // the gym is matched by its word; a charge with no match and changing amounts goes to Other
  assert.equal(find(b, 'Gym and sports').group, 'Fixed');
  assert.deepEqual(['group', 'category'].map((k) => find(b, 'Other')[k]), ['Variable', 'Other']);
  assert.deepEqual(b.subs.expense, ['Fixed', 'Variable', 'Extra', 'Additional']);
  assert.equal(r.rows.length, 22);
});

test('a monthly charge nobody recognises becomes its own Fixed type', async () => {
  const csv = 'Date,Description,Amount\n' + ['01', '02', '03', '04'].map((m) => `2026-${m}-03,ZYX CLOUDHOST 9921,-15.00`).join('\n');
  const r = await run('card.csv', csv);
  assert.deepEqual(['item', 'group', 'category', 'budget'].map((k) => r.board.types[0][k]), ['Zyx Cloudhost', 'Fixed', 'Recurring', 15]);
});

test("the file's own category column wins and keeps its names", async () => {
  const csv = 'Date,Description,Amount,Category\n2026-01-03,Mercadona,-50,Food / Supermarket\n2026-01-04,Shell,-40,Car\n2026-01-28,ACME,3000,Salary';
  const b = (await run('app.csv', csv)).board;
  assert.deepEqual(['group', 'category'].map((k) => find(b, 'Supermarket')[k]), ['Variable', 'Food']);
  assert.ok(find(b, 'Car'));
  assert.equal(find(b, 'Salary').type, 'income');
});

test('a budget sheet keeps its own structure', async () => {
  const csv = `Budget 2025,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec
Income,,,,,,,,,,,,
Salary,3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,3000,3000
Savings,,,,,,,,,,,,
Index fund,500,500,500,500,500,500,500,500,500,500,500,500
Fixed expenses,,,,,,,,,,,,
Habitation,,,,,,,,,,,,
Rent,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000
Variable expenses,,,,,,,,,,,,
Food,,,,,,,,,,,,
Supermarket,300,280,320,300,300,300,300,300,300,300,300,300
Total,,,,,,,,,,,,`;
  const r = await run('budget.csv', csv);
  const b = r.board;
  assert.deepEqual(r.years, ['2025']); assert.equal(r.months, 12);
  assert.deepEqual(['type', 'budget'].map((k) => find(b, 'Salary')[k]), ['income', 3000]);
  assert.equal(find(b, 'Index fund').type, 'investment');
  assert.deepEqual(['group', 'category', 'budget'].map((k) => find(b, 'Rent')[k]), ['Fixed', 'Habitation', 1000]);
  assert.deepEqual(['group', 'category'].map((k) => find(b, 'Supermarket')[k]), ['Variable', 'Food']);
});

test('a grid without section words is sorted by its row names; a year-less grid uses the fallback year', async () => {
  const csv = `Item,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec
Salary,2000,2000,,,,,,,,,,
Electricity,60,70,,,,,,,,,,
Cinema,10,,,,,,,,,,,`;
  const r = await run('plain.csv', csv, { fallbackYear: '2024' });
  assert.deepEqual(r.years, ['2024']);
  assert.equal(find(r.board, 'Salary').type, 'income');
  assert.deepEqual(['group', 'category'].map((k) => find(r.board, 'Electricity')[k]), ['Fixed', 'Habitation']);
  assert.equal(find(r.board, 'Cinema').group, 'Variable');
});

test('entries follow the edited board: renamed types move, deleted types are left out', async () => {
  const r = await run('cuenta.csv', BANK);
  const board = { ...r.board, types: r.board.types.filter((t) => t.item !== 'Other').map((t) => (t.item === 'Rent' ? { ...t, item: 'Flat', category: 'Home' } : t)) };
  const e = entriesForBoard(r.rows, board);
  assert.equal(e.length, 19);
  const rent = e.filter((x) => x.item === 'Flat');
  assert.equal(rent.length, 3); assert.deepEqual([rent[0].group, rent[0].category, rent[0].amount], ['Fixed', 'Home', 900]);
  assert.ok(e.every((x) => x.type !== 'expense' || (x.group && x.category)));
  assert.equal(e.find((x) => x.item === 'Salary').category, null);
});

test('helpers', () => {
  assert.equal(matchRule('PAGO EN MERCADONA 4432').type, 'Groceries');
  assert.equal(matchRule('Recibo Endesa Energia').type, 'Electricity');
  assert.equal(matchRule('Something else'), null);
  assert.equal(prettyName('COMPRA TARJETA ZYX CLOUDHOST 9921'), 'Zyx Cloudhost');
});

// Oct 9 (Felipe's test with a downloaded budget template): one block per section, each repeating the month header;
// no figures in the type rows; summary rows (with values) on top; a copyright year; instruction sheets of text only.
const M = 'JAN,FEB,MAR,APR,MAY,JUN,JUL,AUG,SEP,OCT,NOV,DEC,Total,Avg';
const blank = (label) => `${label},,,,,,,,,,,,,,`;
const TEMPLATE = [
  'Personal Budget Spreadsheet,,,,,,,,,,,,,,',
  'https://example.com/template,,,,,,,,,,,,,,© 2008-2019 Example LLC',
  'Starting Balance,1500,,,,,,,,,,,,,',
  `,${M}`,
  'Total Income,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
  'NET,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
  'Projected End Balance,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,1500,,',
  `INCOME,${M}`, blank('Wages & Tips'), blank('Dividends'), blank('Other'), 'Total INCOME,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
  `HOME EXPENSES,${M}`, blank('Mortgage/Rent'), blank('Electricity'), blank('Furnishings/Appliances'), blank('Other'), 'Total HOME EXPENSES,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
  `TRANSPORTATION,${M}`, blank('Fuel'), blank('Student Loans'), 'Total TRANSPORTATION,0,0,0,0,0,0,0,0,0,0,0,0,0,0',
  `CHARITY/GIFTS,${M}`, blank('Gifts Given'),
  `SAVINGS,${M}`, blank('Emergency Fund'), blank('Retirement Fund'),
].join('\n');

test('a blank budget template becomes the board: sections are groups, every named row is a type', async () => {
  const book = await readFile('budget.csv', enc(TEMPLATE));
  book.sheets.push({ name: 'Help', rows: [['HELP'], ['Step 1:', 'Define Budget Categories'], ['© 2010-2019 Example']] });
  const a = analyzeWorkbook(book, { fileName: 'budget.xlsx' });
  assert.deepEqual(a.warnings, [], 'no warning for the text-only Help sheet, no year asked for');
  assert.equal(a.candidates.length, 0, 'summary rows (Projected End Balance, NET, totals) are not entries');
  const r = boardFromFile(a);
  assert.equal(r.rows.length, 0); assert.equal(r.months, 0); assert.deepEqual(r.years, []);
  const b = r.board;
  const t = (item, cat) => b.types.find((x) => x.item === item && (cat === undefined || x.category === cat));
  assert.deepEqual(['Wages & Tips', 'Dividends', 'Other'].map((i) => t(i, null).type), ['income', 'income', 'income']);
  assert.deepEqual(['type', 'group', 'category', 'budget'].map((k) => t('Mortgage/Rent')[k]), ['expense', 'Fixed', 'Home', 0]);
  assert.deepEqual(['group', 'category'].map((k) => t('Electricity')[k]), ['Fixed', 'Home']);
  assert.deepEqual(['group', 'category'].map((k) => t('Furnishings/Appliances')[k]), ['Variable', 'Home']);
  assert.deepEqual(['group', 'category'].map((k) => t('Fuel')[k]), ['Variable', 'Transportation']);
  assert.equal(t('Student Loans').group, 'Fixed');
  assert.deepEqual(['group', 'category'].map((k) => t('Gifts Given')[k]), ['Extra', 'Charity/gifts']);
  assert.deepEqual([t('Emergency Fund').type, t('Retirement Fund').type], ['investment', 'investment']);
  assert.ok(!b.types.some((x) => /balance|total|net/i.test(x.item)));
});

test('the same template with figures keeps its structure and imports the months', async () => {
  const filled = TEMPLATE.replace(blank('Mortgage/Rent'), 'Mortgage/Rent,900,900,,,,,,,,,,,,').replace(',© 2008-2019 Example LLC', ',Budget 2025');
  const r = await run('budget.csv', filled);
  assert.deepEqual(r.years, ['2025']); assert.equal(r.rows.length, 2);
  const rent = r.board.types.find((x) => x.item === 'Mortgage/Rent');
  assert.deepEqual([rent.group, rent.category, rent.budget], ['Fixed', 'Home', 900]);
  assert.ok(r.board.types.find((x) => x.item === 'Electricity' && x.budget === 0));
});
