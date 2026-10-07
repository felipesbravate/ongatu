// Most recently added entry, scoped to the month and the chosen switcher.
// Older imports without a creation timestamp fall back to their transaction date.
export function latestEntry(entries, { year, monthIndex, type, group = null }) {
  return entries.reduce((latest, entry) => {
    if (entry.year !== year || entry.monthIndex !== monthIndex || entry.type !== type
      || (group !== null && entry.group !== group)) return latest;
    const timestamp = (value) => Date.parse(value.createdAt || value.date || '') || 0;
    return !latest || timestamp(entry) > timestamp(latest) ? entry : latest;
  }, null);
}
