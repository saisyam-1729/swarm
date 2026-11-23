// PURPOSE: Client-side search, filter, sort, and pagination for API collections of any size.
import { useMemo, useState, useEffect } from 'react';

function readValue(item, key) {
  if (!key) return undefined;
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), item);
}

function matchesSearch(item, search, searchKeys) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  const keys = searchKeys.length ? searchKeys : Object.keys(item || {});
  return keys.some((key) => {
    const value = readValue(item, key);
    if (value == null) return false;
    if (Array.isArray(value)) return value.some((v) => String(v).toLowerCase().includes(q));
    return String(value).toLowerCase().includes(q);
  });
}

function matchesFilters(item, filters) {
  return Object.entries(filters || {}).every(([key, expected]) => {
    if (expected == null || expected === '' || expected === 'ALL') return true;
    const value = readValue(item, key);
    if (Array.isArray(expected)) {
      if (!expected.length) return true;
      return expected.includes(value);
    }
    return String(value) === String(expected);
  });
}

function compareValues(a, b, dir) {
  const av = a == null ? '' : a;
  const bv = b == null ? '' : b;
  if (typeof av === 'number' && typeof bv === 'number') {
    return dir === 'desc' ? bv - av : av - bv;
  }
  const as = String(av).toLowerCase();
  const bs = String(bv).toLowerCase();
  if (as < bs) return dir === 'desc' ? 1 : -1;
  if (as > bs) return dir === 'desc' ? -1 : 1;
  return 0;
}

export const DEFAULT_PAGE_SIZE = 24;

export default function useCollection(items, {
  searchKeys = [],
  initialSortKey = '',
  initialSortDir = 'asc',
  pageSize = DEFAULT_PAGE_SIZE,
  filters: controlledFilters,
} = {}) {
  const list = Array.isArray(items) ? items : [];
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialSortDir);
  const [page, setPage] = useState(0);
  const [internalFilters, setInternalFilters] = useState({});
  const filters = controlledFilters || internalFilters;

  useEffect(() => { setPage(0); }, [search, sortKey, sortDir, pageSize, list.length, JSON.stringify(filters)]);

  const filtered = useMemo(
    () => list.filter((item) => matchesSearch(item, search, searchKeys) && matchesFilters(item, filters)),
    [list, search, searchKeys, filters],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => compareValues(readValue(a, sortKey), readValue(b, sortKey), sortDir));
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize) || 1);
  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize],
  );

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return {
    search,
    setSearch,
    sortKey,
    sortDir,
    setSortKey,
    setSortDir,
    toggleSort,
    page: safePage,
    setPage,
    pageSize,
    pageCount,
    filters,
    setFilters: setInternalFilters,
    items: paged,
    filteredItems: sorted,
    total: list.length,
    filteredCount: sorted.length,
  };
}
