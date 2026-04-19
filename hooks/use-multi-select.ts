import { useState, useCallback, useMemo } from "react";

export interface UseMultiSelectResult<T> {
  selected: Set<string>;
  isSelected: (item: T) => boolean;
  toggle: (item: T) => void;
  clear: () => void;
  selectAll: (items: T[]) => void;
  enter: (item: T) => void;
  count: number;
  isActive: boolean;
  selectedItems: (all: T[]) => T[];
}

export function useMultiSelect<T>(
  getId: (item: T) => string,
): UseMultiSelectResult<T> {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (item: T) => selected.has(getId(item)),
    [selected, getId],
  );

  const toggle = useCallback(
    (item: T) => {
      const id = getId(item);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [getId],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectAll = useCallback(
    (items: T[]) => setSelected(new Set(items.map(getId))),
    [getId],
  );

  const enter = useCallback(
    (item: T) => setSelected(new Set([getId(item)])),
    [getId],
  );

  const selectedItems = useCallback(
    (all: T[]) => all.filter((i) => selected.has(getId(i))),
    [selected, getId],
  );

  return useMemo(
    () => ({
      selected,
      isSelected,
      toggle,
      clear,
      selectAll,
      enter,
      count: selected.size,
      isActive: selected.size > 0,
      selectedItems,
    }),
    [selected, isSelected, toggle, clear, selectAll, enter, selectedItems],
  );
}
