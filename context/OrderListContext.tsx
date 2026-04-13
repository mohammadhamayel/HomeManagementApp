import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "orderListReceipt:v1";

export type OrderListEntry = {
  productId: number;
  productName: string;
  quantity: number;
  notes: string;
  checked: boolean;
};

type OrderListContextValue = {
  entries: OrderListEntry[];
  loading: boolean;
  isStarred: (productId: number) => boolean;
  getEntry: (productId: number) => OrderListEntry | undefined;
  upsertEntry: (input: {
    productId: number;
    productName: string;
    quantity: number;
    notes: string;
  }) => void;
  removeEntry: (productId: number) => void;
  setEntryChecked: (productId: number, checked: boolean) => void;
  syncProductNames: (products: { id: number; name: string }[]) => void;
};

const OrderListContext = createContext<OrderListContextValue | null>(null);

function parseStored(json: string | null): OrderListEntry[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const productId = Number(o.productId);
        const quantity = Number(o.quantity);
        if (!Number.isFinite(productId) || productId <= 0) return null;
        if (!Number.isFinite(quantity) || quantity < 0) return null;
        return {
          productId,
          productName: String(o.productName ?? ""),
          quantity: Math.max(0, Math.trunc(quantity)),
          notes: String(o.notes ?? ""),
          checked: Boolean(o.checked),
        } satisfies OrderListEntry;
      })
      .filter((x): x is OrderListEntry => x !== null);
  } catch {
    return [];
  }
}

export function OrderListProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<OrderListEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        setEntries(parseStored(stored));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isStarred = useCallback(
    (productId: number) => entries.some((e) => e.productId === productId),
    [entries]
  );

  const getEntry = useCallback(
    (productId: number) => entries.find((e) => e.productId === productId),
    [entries]
  );

  const upsertEntry = useCallback(
    (input: {
      productId: number;
      productName: string;
      quantity: number;
      notes: string;
    }) => {
      const qty = Math.max(0, Math.trunc(input.quantity));
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.productId === input.productId);
        let next: OrderListEntry[];
        if (idx === -1) {
          next = [
            ...prev,
            {
              productId: input.productId,
              productName: input.productName,
              quantity: qty,
              notes: input.notes.trim(),
              checked: false,
            },
          ];
        } else {
          const cur = prev[idx];
          next = [...prev];
          next[idx] = {
            ...cur,
            productName: input.productName,
            quantity: qty,
            notes: input.notes.trim(),
          };
        }
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const removeEntry = useCallback((productId: number) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.productId !== productId);
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const setEntryChecked = useCallback((productId: number, checked: boolean) => {
    setEntries((prev) => {
      const next = prev.map((e) =>
        e.productId === productId ? { ...e, checked } : e
      );
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const syncProductNames = useCallback((products: { id: number; name: string }[]) => {
    if (products.length === 0) return;
    const map = new Map(products.map((p) => [p.id, p.name]));
    setEntries((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        const name = map.get(e.productId);
        if (name && name !== e.productName) {
          changed = true;
          return { ...e, productName: name };
        }
        return e;
      });
      if (changed) {
        void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return next;
      }
      return prev;
    });
  }, []);

  const value = useMemo(
    () => ({
      entries,
      loading,
      isStarred,
      getEntry,
      upsertEntry,
      removeEntry,
      setEntryChecked,
      syncProductNames,
    }),
    [
      entries,
      loading,
      isStarred,
      getEntry,
      upsertEntry,
      removeEntry,
      setEntryChecked,
      syncProductNames,
    ]
  );

  return (
    <OrderListContext.Provider value={value}>{children}</OrderListContext.Provider>
  );
}

export function useOrderList() {
  const ctx = useContext(OrderListContext);
  if (!ctx) {
    throw new Error("useOrderList must be used within OrderListProvider");
  }
  return ctx;
}
