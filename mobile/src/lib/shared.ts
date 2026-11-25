// The web app's pure logic, shared as-is (see metro.config.js).
// @ts-ignore plain JS module
export { createModel, yearsFromDocs, currentYearLabel, MONTH_NAMES, MONTH_ABBR, EXP_GROUPS, hasGroups, parseAmount, fmtNum, fmtDateEU, todayISO, periodKeyOfDate, periodLabel, periodMismatch, TYPE_OPTS, typeKeyOf } from '../../../src/tracker/model.js';
// @ts-ignore plain JS module (Nov 18 merchants, shared with the web as-is)
export { MERCHANTS_DOC, applyMerchants, learnMerchants, typedRows } from '../../../src/tracker/merchants.js';
// @ts-ignore plain JS module
export { fmtFigure, fmtMoney, fmtMoneyShort } from '../../../src/ui/format.js';
