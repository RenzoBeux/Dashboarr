import { useCallback, useEffect, useState } from "react";

const DEBOUNCE_MS = 200;

/**
 * The in-library search behind LibrarySearchField: the typed text and
 * `applied`, the text the list filters by. Typing is debounced; clearing
 * applies at once and also drops the pending value, so typing again right
 * after a clear can't bring the old term back.
 */
export function useLibrarySearch() {
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
  const reset = useCallback(() => setQuery(""), []);
  return {
    query,
    setQuery,
    // "" covers the render before the effect above catches up.
    applied: query === "" ? "" : appliedQuery,
    reset,
  };
}
