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
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  buildInventorySnapshotPayloadV1,
  parseInventorySnapshotPayload,
  replaceInventoryFromSnapshotV1,
  setInventoryMutatedCallback,
} from "../database";
import {
  ensureOrderListAuth,
  firestore,
  getOrderListDocumentId,
} from "../firebaseClient";
import { useInventoryNotifications } from "./NotificationContext";

const COLLECTION = "inventory_snapshots";
const ASYNC_LAST_VERSION = "inventorySnapshotAppliedVersion:v1";
const DEBOUNCE_MS = 2500;

export type InventorySyncTarget = {
  productId: number;
  productGroupSyncId?: string | null;
};

type InventorySyncContextValue = {
  /** Incremented after a remote snapshot is applied locally; use to refresh product UIs. */
  inventoryRevision: number;
  syncing: boolean;
  lastError: string | null;
  lastRemoteVersion: number;
  manualPull: () => Promise<void>;
};

const InventorySyncContext = createContext<InventorySyncContextValue | null>(
  null
);

export function InventorySyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { refreshNotifications } = useInventoryNotifications();
  const [inventoryRevision, setInventoryRevision] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastRemoteVersion, setLastRemoteVersion] = useState(0);
  const listRef = useRef<ReturnType<typeof doc> | null>(null);
  const lastAppliedVersionRef = useRef(0);
  const applyingRemoteRef = useRef(false);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyRef = useRef(false);

  const applyRemotePayload = useCallback(
    async (version: number, payloadJson: string) => {
      if (version <= lastAppliedVersionRef.current) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadJson) as unknown;
      } catch {
        setLastError("Invalid snapshot JSON");
        return;
      }
      const payload = parseInventorySnapshotPayload(parsed);
      if (!payload) {
        setLastError("Invalid snapshot schema");
        return;
      }
      try {
        applyingRemoteRef.current = true;
        await replaceInventoryFromSnapshotV1(payload);
        lastAppliedVersionRef.current = version;
        setLastRemoteVersion(version);
        await AsyncStorage.setItem(ASYNC_LAST_VERSION, String(version));
        setInventoryRevision((n) => n + 1);
        await refreshNotifications();
        setLastError(null);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [refreshNotifications]
  );

  const pushDebounced = useCallback(() => {
    if (!readyRef.current || applyingRemoteRef.current) return;
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void (async () => {
        const d = listRef.current;
        if (!d || applyingRemoteRef.current) return;
        setSyncing(true);
        try {
          const json = JSON.stringify(await buildInventorySnapshotPayloadV1());
          const nextV = await runTransaction(firestore, async (transaction) => {
            const snap = await transaction.get(d);
            const curRaw = snap.data()?.version;
            const cur =
              typeof curRaw === "number" && Number.isFinite(curRaw) ? curRaw : 0;
            const next = cur + 1;
            transaction.set(
              d,
              {
                version: next,
                payload: json,
                updatedAt: serverTimestamp(),
              },
              { merge: false }
            );
            return next;
          });
          lastAppliedVersionRef.current = nextV;
          await AsyncStorage.setItem(ASYNC_LAST_VERSION, String(nextV));
          setLastRemoteVersion(nextV);
          setLastError(null);
        } catch (e) {
          setLastError(e instanceof Error ? e.message : String(e));
        } finally {
          setSyncing(false);
        }
      })();
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(ASYNC_LAST_VERSION);
        const v = stored ? Number.parseInt(stored, 10) : 0;
        if (!cancelled && Number.isFinite(v) && v >= 0) {
          lastAppliedVersionRef.current = v;
          setLastRemoteVersion(v);
        }
      } catch {
        /* ignore */
      }

      try {
        const user = await ensureOrderListAuth();
        if (cancelled) return;
        const docId = getOrderListDocumentId(user);
        const d = doc(firestore, COLLECTION, docId);
        listRef.current = d;
        readyRef.current = true;

        unsub = onSnapshot(
          d,
          (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            const version =
              typeof data?.version === "number" && Number.isFinite(data.version)
                ? data.version
                : 0;
            const payload = typeof data?.payload === "string" ? data.payload : "";
            if (!payload || version <= lastAppliedVersionRef.current) return;
            void applyRemotePayload(version, payload);
          },
          (err) => setLastError(err.message)
        );
      } catch (e) {
        if (!cancelled) {
          setLastError(e instanceof Error ? e.message : String(e));
        }
      }

      if (!cancelled) {
        setInventoryMutatedCallback(() => pushDebounced());
      }
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      readyRef.current = false;
      listRef.current = null;
      setInventoryMutatedCallback(null);
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    };
  }, [applyRemotePayload, pushDebounced]);

  const manualPull = useCallback(async () => {
    const d = listRef.current;
    if (!d) return;
    setSyncing(true);
    try {
      const s = await getDoc(d);
      if (!s.exists()) return;
      const data = s.data();
      const version =
        typeof data?.version === "number" && Number.isFinite(data.version)
          ? data.version
          : 0;
      const payload = typeof data?.payload === "string" ? data.payload : "";
      if (payload) await applyRemotePayload(version, payload);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [applyRemotePayload]);

  const value = useMemo(
    () => ({
      inventoryRevision,
      syncing,
      lastError,
      lastRemoteVersion,
      manualPull,
    }),
    [inventoryRevision, syncing, lastError, lastRemoteVersion, manualPull]
  );

  return (
    <InventorySyncContext.Provider value={value}>
      {children}
    </InventorySyncContext.Provider>
  );
}

export function useInventorySync(): InventorySyncContextValue {
  const ctx = useContext(InventorySyncContext);
  if (!ctx) {
    throw new Error("useInventorySync must be used within InventorySyncProvider");
  }
  return ctx;
}
