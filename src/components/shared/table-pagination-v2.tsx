"use client";

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];

export function usePagination<T>(data: T[], opts: { defaultPageSize?: number } = {}) {
  const [pageSize, setPageSize] = useState(opts.defaultPageSize ?? 15);
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => { setCurrentPage(1); }, [data.length, pageSize]);
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, data.length);
  const currentData = useMemo(() => data.slice(startIndex, endIndex), [data, startIndex, endIndex]);
  return {
    currentData,
    controls: {
      currentPage: safePage, totalPages, pageSize, setPageSize, setCurrentPage,
      totalItems: data.length, startIndex: startIndex + 1, endIndex,
      canPrev: safePage > 1, canNext: safePage < totalPages,
    },
  };
}

export function PaginationControls(props: {
  currentPage: number; totalPages: number; pageSize: number;
  setPageSize: (n: number) => void; setCurrentPage: (n: number) => void;
  totalItems: number; startIndex: number; endIndex: number;
  canPrev: boolean; canNext: boolean;
}) {
  if (props.totalItems === 0) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-rcc-border bg-rcc-bg/30">
      <div className="flex items-center gap-2 text-xs text-rcc-text-muted">
        <span>Rows per page:</span>
        <select value={props.pageSize} onChange={(e) => props.setPageSize(Number(e.target.value))}
          className="px-2 py-1 bg-rcc-surface border border-rcc-border rounded text-sm text-rcc-text-primary focus:outline-none focus:ring-1 focus:ring-rcc-accent/40">
          {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-rcc-text-muted">{props.startIndex}–{props.endIndex} of {props.totalItems}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => props.setCurrentPage(1)} disabled={!props.canPrev} className="p-1 rounded hover:bg-rcc-bg text-rcc-text-muted hover:text-rcc-text-primary disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsLeft className="h-4 w-4" /></button>
          <button onClick={() => props.setCurrentPage(props.currentPage - 1)} disabled={!props.canPrev} className="p-1 rounded hover:bg-rcc-bg text-rcc-text-muted hover:text-rcc-text-primary disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs text-rcc-text-secondary px-2 tabular-nums">{props.currentPage} / {props.totalPages}</span>
          <button onClick={() => props.setCurrentPage(props.currentPage + 1)} disabled={!props.canNext} className="p-1 rounded hover:bg-rcc-bg text-rcc-text-muted hover:text-rcc-text-primary disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => props.setCurrentPage(props.totalPages)} disabled={!props.canNext} className="p-1 rounded hover:bg-rcc-bg text-rcc-text-muted hover:text-rcc-text-primary disabled:opacity-30 disabled:cursor-not-allowed"><ChevronsRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
