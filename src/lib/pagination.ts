// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Shared server pagination helper (scale hardening)
// Contract: `?page=1-based&pageSize=N (default 25, max 100)`.
// Responses include `total/page/pageSize` alongside the array.
// Callers needing the whole set (reports, export hubs) must pass
// their own paging loop or a dedicated unbounded endpoint.
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface Pagination {
  take: number;
  skip: number;
  page: number;
  pageSize: number;
}

export function parsePagination(searchParams: URLSearchParams): Pagination {
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawSize = Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize > 0
    ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  return { take: pageSize, skip: (page - 1) * pageSize, page, pageSize };
}

export function pageMeta(total: number, p: Pagination) {
  return { total, page: p.page, pageSize: p.pageSize };
}
