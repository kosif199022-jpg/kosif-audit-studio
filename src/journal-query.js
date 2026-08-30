import { normalizeAr } from "./audit-core.js";

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 100;

function searchableEntry(entry) {
  return [
    entry?.id,
    entry?.period,
    entry?.postedAt,
    entry?.description,
    ...(entry?.lines || []).flatMap((line) => [line?.code, line?.name]),
  ].map(normalizeAr).join(" ");
}
export function queryJournalEntries(entries = [], query = "") {
  const tokens = normalizeAr(query).split(" ").filter(Boolean);
  if (!tokens.length) return [...entries];
  return entries.filter((entry) => {
    const haystack = searchableEntry(entry);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function paginateJournalEntries(entries = [], page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0
    ? Math.min(pageSize, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(entries.length / safePageSize));
  const safePage = Number.isInteger(page) ? Math.min(pageCount, Math.max(1, page)) : 1;
  const start = (safePage - 1) * safePageSize;
  return {
    items: entries.slice(start, start + safePageSize),
    page: safePage,
    pageCount,
    pageSize: safePageSize,
    total: entries.length,
  };
}
