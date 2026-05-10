import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Product } from "./database";
import { parseInventoryDateString } from "./utils/inventoryDates";

const STORAGE_KEY = "@home_mgmt_inventory_notifications_v1";

export const EXPIRY_ALERT_TITLE = "تنبيه انتهاء الصلاحية";
export const LOW_QTY_ALERT_TITLE = "تنبيه انخفاض الكمية";

export type InventoryNotificationItem = {
  id: string;
  title: string;
  description: string;
  dayKey: string;
  kind: "expiry" | "qty";
  productId: number;
  source: "daily";
};

type Persisted = {
  items: InventoryNotificationItem[];
};

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `today` start until `expiry` end (inclusive of expiry day). */
export function calendarDaysUntilExpiry(expiry: Date, today: Date): number {
  const a = startOfLocalDay(today).getTime();
  const b = startOfLocalDay(expiry).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function expiryDescription(name: string, daysLeft: number): string {
  const q = `«${name}»`;
  if (daysLeft < 0) {
    return `${q} منتهي الصلاحية`;
  }
  if (daysLeft === 0) {
    return `${q} ستنتهي صلاحيته اليوم`;
  }
  return `${q} ستنتهي صلاحيته خلال ${daysLeft} يومًا`;
}

function qtyDescription(name: string, qty: number): string {
  return `«${name}» الكمية المتبقية: ${qty}`;
}

export function buildDailyInventoryNotifications(
  products: Product[],
  now: Date
): InventoryNotificationItem[] {
  const dayKey = localDayKey(now);
  const out: InventoryNotificationItem[] = [];

  for (const p of products) {
    const expiryDays = p.expiryAlertDays ?? 0;
    const lowQty = p.lowQtyThreshold ?? 0;

    if (expiryDays > 0) {
      const expiryDt = parseInventoryDateString(p.expiryDate);
      if (!expiryDt) continue;
      const daysLeft = calendarDaysUntilExpiry(expiryDt, now);
      if (daysLeft <= expiryDays) {
        out.push({
          id: `daily-${dayKey}-expiry-${p.groupSyncId}`,
          title: EXPIRY_ALERT_TITLE,
          description: expiryDescription(p.name, daysLeft),
          dayKey,
          kind: "expiry",
          productId: p.id,
          source: "daily",
        });
      }
    }

    if (lowQty > 0 && p.quantity <= lowQty) {
        out.push({
          id: `daily-${dayKey}-qty-${p.groupSyncId}`,
        title: LOW_QTY_ALERT_TITLE,
        description: qtyDescription(p.name, p.quantity),
        dayKey,
        kind: "qty",
        productId: p.id,
        source: "daily",
      });
    }
  }

  return out;
}

async function readPersisted(): Promise<Persisted> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    return { items: parsed.items };
  } catch {
    return { items: [] };
  }
}

/** Replaces today's auto-generated rows and prepends fresh ones from current products. */
export async function syncInventoryNotificationsFromProducts(
  products: Product[],
  now: Date = new Date()
): Promise<InventoryNotificationItem[]> {
  const dayKey = localDayKey(now);
  const fresh = buildDailyInventoryNotifications(products, now);
  const prev = await readPersisted();
  const kept = prev.items.filter(
    (i) => !(i.source === "daily" && i.dayKey === dayKey)
  );
  const merged = [...fresh, ...kept].slice(0, 200);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ items: merged }));
  return merged;
}
