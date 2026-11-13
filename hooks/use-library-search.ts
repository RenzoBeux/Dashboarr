import { useCallback, useEffect, useState } from "react";

const DEBOUNCE_MS = 200;

/**
 * The in-library search: whether the toolbar's search row is open (Bazarr),
 * the typed text, and `applied`, the text the list filters by.
 * Typing is debounced; clearing applies at once and also drops the pending
 * value, so typing again right after a clear can't bring the old term back.
 * Closing always clears, so a closed search never filters.
 */
export function useLibrarySearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  useEffect(() => {
    if (query === "") {
      setAppliedQuery("");
      return;
    }
    const handle = setTimeout(() => setAppliedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);
  const reset = useCallback(() => {
    setQuery("");
    setOpen(false);
  }, []);
  return {
    open,
    query,
    // "" covers the render before the effect above catches up.
    applied: query === "" ? "" : appliedQuery,
    reset,
    // For an always-visible field (Movies, TV), which has no open state.
    setQuery,
    // The toolbar's `search` prop, less its placeholder.
    toolbar: {
      open,
      onToggle: () => {
        if (open) setQuery("");
        setOpen(!open);
      },
      query,
      onQuery: setQuery,
    },
  };
}
