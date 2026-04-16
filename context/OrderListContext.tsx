import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type DocumentReference,
} from "firebase/firestore";
import {
  ensureOrderListAuth,
  firestore,
  getOrderListDocumentId,
  FIREBASE_SHARED_EMAIL,
} from "../firebaseClient";

const STORAGE_KEY = "orderListReceipt:v1";
const ORDER_LIST_COLLECTION = "order_lists";

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

function normalizeEntries(raw: unknown): OrderListEntry[] {
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
}

function parseStored(json: string | null): OrderListEntry[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json) as unknown;
    return normalizeEntries(raw);
  } catch {
    return [];
  }
}

function parseFirestoreEntries(data: DocumentData | undefined): OrderListEntry[] {
  if (!data || typeof data !== "object") return [];
  const entries = normalizeEntries(data.entries);
  if (entries.length > 0) return entries;

  // Backward-compatible fallback if payload was persisted as JSON text.
  if (typeof data.payload === "string") {
    try {
      return normalizeEntries(JSON.parse(data.payload) as unknown);
    } catch {
      return [];
    }
  }
  return normalizeEntries(data.payload);
}

export function OrderListProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<OrderListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const listDocRef = useRef<DocumentReference | null>(null);
  const remoteReadyRef = useRef(false);

  const persistLocally = useCallback((next: OrderListEntry[]) => {
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const persistRemotely = useCallback((next: OrderListEntry[]) => {
    if (!remoteReadyRef.current) return;
    const d = listDocRef.current;
    if (!d) return;
    void setDoc(
      d,
      {
        entries: next,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ).catch((error: unknown) => {
      console.warn(
        "[OrderList] Firestore write failed:",
        error instanceof Error ? error.message : error
      );
    });
  }, []);

  useEffect(() => {
    let unmounted = false;
    let unsubscribeRemote: (() => void) | null = null;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!unmounted) {
          setEntries(parseStored(stored));
          setLoading(false);
        }

        try {
          const user = await ensureOrderListAuth();
          const docId = getOrderListDocumentId(user);
          listDocRef.current = doc(firestore, ORDER_LIST_COLLECTION, docId);
          remoteReadyRef.current = true;
          if (FIREBASE_SHARED_EMAIL.trim() !== "") {
            console.warn(
              `[OrderList] Firestore sync: order_lists/${docId} (email user)`
            );
          } else {
            console.warn(
              `[OrderList] Firestore sync: order_lists/${docId} (anonymous). If you see permission errors, either enable Anonymous auth + rules for doc "1", or set FIREBASE_SHARED_EMAIL / FIREBASE_SHARED_PASSWORD in firebaseClient.ts to use order_lists/{uid} with your existing uid rules.`
            );
          }
        } catch (error) {
          console.warn(
            "[OrderList] Firebase auth failed:",
            error instanceof Error ? error.message : error
          );
        }
        if (unmounted) return;

        if (listDocRef.current) {
          unsubscribeRemote = onSnapshot(
            listDocRef.current,
            (snapshot) => {
              const next = parseFirestoreEntries(snapshot.data());
              setEntries(next);
              persistLocally(next);
            },
            (error) => {
              console.warn(
                "[OrderList] Firestore listener failed:",
                error instanceof Error ? error.message : error
              );
            }
          );
        }
      } finally {
        if (!unmounted) setLoading(false);
      }
    })();

    return () => {
      unmounted = true;
      if (unsubscribeRemote) unsubscribeRemote();
    };
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
        persistLocally(next);
        persistRemotely(next);
        return next;
      });
    },
    [persistLocally, persistRemotely]
  );

  const removeEntry = useCallback((productId: number) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.productId !== productId);
      persistLocally(next);
      persistRemotely(next);
      return next;
    });
  }, [persistLocally, persistRemotely]);

  const setEntryChecked = useCallback((productId: number, checked: boolean) => {
    setEntries((prev) => {
      const next = prev.map((e) =>
        e.productId === productId ? { ...e, checked } : e
      );
      persistLocally(next);
      persistRemotely(next);
      return next;
    });
  }, [persistLocally, persistRemotely]);

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
        persistLocally(next);
        persistRemotely(next);
        return next;
      }
      return prev;
    });
  }, [persistLocally, persistRemotely]);

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
