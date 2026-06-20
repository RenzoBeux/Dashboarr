import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after it has stayed unchanged for
 * `delayMs`. Used by global search so typing updates the input immediately but
 * the query that fans out to up to five services trails the keystrokes, instead
 * of firing a network search per character across self-hosted boxes.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
