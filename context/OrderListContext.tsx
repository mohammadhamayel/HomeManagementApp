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
  /** Stable group id for cross-device; preferred when set. */
  productGroupSyncId?: string;
  productName: string;
  quantity: number;
  notes: string;
  checked: boolean;
};

/** Product identity for starring / order list rows (ties to SQLite after sync). */
export type OrderListProductRef = {
  id: number;
  groupSyncId: string;
};

export type OrderListEntryTarget = {
  productId: number;
  productGroupSyncId?: string | null;
};

type OrderListContextValue = {
  entries: OrderListEntry[];
  loading: boolean;
  isStarred: (product: OrderListProductRef) => boolean;
  getEntry: (product: OrderListProductRef) => OrderListEntry | undefined;
  upsertEntry: (input: {
    productId: number;
    productGroupSyncId: string;
    productName: string;
    quantity: number;
    notes: string;
  }) => void;
  removeEntry: (target: OrderListEntryTarget) => void;
  setEntryChecked: (target: OrderListEntryTarget, checked: boolean) => void;
  syncProductNames: (
    products: { id: number; name: string; groupSyncId: string }[]
  ) => void;
};

const OrderListContext = createContext<OrderListContextValue | null>(null);

function matchesCatalogProduct(
  e: OrderListEntry,
  product: OrderListProductRef
): boolean {
  const sid = (e.productGroupSyncId ?? "").trim();
  const gs = product.groupSyncId.trim();
  if (sid !== "" && gs !== "" && sid === gs) return true;
  if (sid === "" && e.productId === product.id) return true;
  return false;
}

function matchesEntryTarget(e: OrderListEntry, t: OrderListEntryTarget): boolean {
  const ts = (t.productGroupSyncId ?? "").trim();
  if (ts !== "") return (e.productGroupSyncId ?? "").trim() === ts;
  return e.productId === t.productId;
}

function normalizeEntries(raw: unknown): OrderListEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const quantity = Number(o.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) return null;

      const syncRaw = o.productGroupSyncId;
      const productGroupSyncId =
        typeof syncRaw === "string" && syncRaw.trim() !== ""
          ? syncRaw.trim()
          : undefined;

      const productId = Number(o.productId);
      if (productGroupSyncId) {
        const pid =
          Number.isFinite(productId) && productId > 0 ? Math.trunc(productId) : 0;
        return {
          productId: pid,
          productGroupSyncId,
          productName: String(o.productName ?? ""),
          quantity: Math.max(0, Math.trunc(quantity)),
          notes: String(o.notes ?? ""),
          checked: Boolean(o.checked),
        } satisfies OrderListEntry;
      }

      if (!Number.isFinite(productId) || productId <= 0) return null;
      return {
        productId: Math.trunc(productId),
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
  }, [persistLocally]);

  const isStarred = useCallback(
    (product: OrderListProductRef) =>
      entries.some((e) => matchesCatalogProduct(e, product)),
    [entries]
  );

  const getEntry = useCallback(
    (product: OrderListProductRef) =>
      entries.find((e) => matchesCatalogProduct(e, product)),
    [entries]
  );

  const upsertEntry = useCallback(
    (input: {
      productId: number;
      productGroupSyncId: string;
      productName: string;
      quantity: number;
      notes: string;
    }) => {
      const qty = Math.max(0, Math.trunc(input.quantity));
      const syncId = input.productGroupSyncId.trim();
      setEntries((prev) => {
        const idx = prev.findIndex(
          (e) => (e.productGroupSyncId ?? "").trim() === syncId
        );
        let next: OrderListEntry[];
        if (idx === -1) {
          next = [
            ...prev,
            {
              productId: input.productId,
              productGroupSyncId: syncId,
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
            productId: input.productId,
            productGroupSyncId: syncId,
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

  const removeEntry = useCallback(
    (target: OrderListEntryTarget) => {
      setEntries((prev) => {
        const next = prev.filter((e) => !matchesEntryTarget(e, target));
        persistLocally(next);
        persistRemotely(next);
        return next;
      });
    },
    [persistLocally, persistRemotely]
  );

  const setEntryChecked = useCallback(
    (target: OrderListEntryTarget, checked: boolean) => {
      setEntries((prev) => {
        const next = prev.map((e) =>
          matchesEntryTarget(e, target) ? { ...e, checked } : e
        );
        persistLocally(next);
        persistRemotely(next);
        return next;
      });
    },
    [persistLocally, persistRemotely]
  );

  const syncProductNames = useCallback(
    (products: { id: number; name: string; groupSyncId: string }[]) => {
      if (products.length === 0) return;
      setEntries((prev) => {
        let changed = false;
        const next = prev.map((e) => {
          const p = products.find((x) => {
            if ((e.productGroupSyncId ?? "").trim() !== "") {
              return x.groupSyncId === (e.productGroupSyncId ?? "").trim();
            }
            return x.id === e.productId;
          });
          if (p && p.name !== e.productName) {
            changed = true;
            return {
              ...e,
              productId: p.id,
              productGroupSyncId: p.groupSyncId,
              productName: p.name,
            };
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
    },
    [persistLocally, persistRemotely]
  );

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
