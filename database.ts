import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { toLatinDigits } from "./utils/digitLocale";

/** Async DB open — sync SQLite APIs + New Architecture often cause HostFunction / runtime-not-ready crashes. */
let dbPromise: Promise<SQLiteDatabase> | null = null;
let schemaReady: Promise<void> | null = null;

function ensureDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("inventory.db");
  }
  return dbPromise;
}

export const ADMIN_USERNAME = "m.hamayel";
export const ADMIN_PASSWORD = "m.hamayel96";

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export type Product = {
  id: number;
  name: string;
  quantity: number;
  purchaseDate: string;
  expiryDate: string;
  category: string;
  notes: string;
  /** Alert when calendar days until expiry are at most this value (0 = off). */
  expiryAlertDays: number;
  /** Alert when quantity is at or below this value (0 = off). */
  lowQtyThreshold: number;
};

export type DbUser = {
  id: number;
  username: string;
  password: string;
  is_admin: number;
};

export function parseQuantityInput(text: string): number | null {
  const trimmed = toLatinDigits(text.trim());
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function normalizeProductRow(row: Record<string, unknown>): Product {
  const q = row.quantity;
  let quantity = 0;
  if (typeof q === "number" && Number.isFinite(q)) {
    quantity = Math.trunc(q);
  } else if (typeof q === "string" && q.trim() !== "") {
    const parsed = parseQuantityInput(q);
    quantity = parsed ?? 0;
  }

  const expiryAlertRaw = row.expiry_alert_days ?? row.expiryAlertDays;
  let expiryAlertDays = 0;
  if (typeof expiryAlertRaw === "number" && Number.isFinite(expiryAlertRaw)) {
    expiryAlertDays = Math.max(0, Math.trunc(expiryAlertRaw));
  } else if (typeof expiryAlertRaw === "string" && expiryAlertRaw.trim() !== "") {
    const parsed = parseQuantityInput(expiryAlertRaw);
    expiryAlertDays = parsed ?? 0;
  }

  const lowQtyRaw = row.low_qty_threshold ?? row.lowQtyThreshold;
  let lowQtyThreshold = 0;
  if (typeof lowQtyRaw === "number" && Number.isFinite(lowQtyRaw)) {
    lowQtyThreshold = Math.max(0, Math.trunc(lowQtyRaw));
  } else if (typeof lowQtyRaw === "string" && lowQtyRaw.trim() !== "") {
    const parsed = parseQuantityInput(lowQtyRaw);
    lowQtyThreshold = parsed ?? 0;
  }

  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    quantity,
    purchaseDate: String(row.purchaseDate ?? ""),
    expiryDate: String(row.expiryDate ?? ""),
    category: String(row.category ?? ""),
    notes: String(row.notes ?? ""),
    expiryAlertDays,
    lowQtyThreshold,
  };
}

export function initDB(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await ensureDb();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          quantity INTEGER NOT NULL DEFAULT 0,
          purchaseDate TEXT,
          expiryDate TEXT,
          category TEXT,
          notes TEXT,
          expiry_alert_days INTEGER NOT NULL DEFAULT 0,
          low_qty_threshold INTEGER NOT NULL DEFAULT 0
        );
      `);

      const readProductColNames = async () => {
        const cols = await db.getAllAsync<{ name: string }>(
          "PRAGMA table_info(products)"
        );
        return new Set(cols.map((c) => c.name));
      };

      let productColNames = await readProductColNames();
      if (!productColNames.has("quantity")) {
        await db.execAsync(
          "ALTER TABLE products ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0"
        );
        productColNames = await readProductColNames();
      }
      if (!productColNames.has("expiry_alert_days")) {
        await db.execAsync(
          "ALTER TABLE products ADD COLUMN expiry_alert_days INTEGER NOT NULL DEFAULT 0"
        );
        productColNames = await readProductColNames();
      }
      if (!productColNames.has("low_qty_threshold")) {
        await db.execAsync(
          "ALTER TABLE products ADD COLUMN low_qty_threshold INTEGER NOT NULL DEFAULT 0"
        );
      }

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0
        );
      `);

      const existingAdmin = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM users WHERE lower(trim(username)) = ? LIMIT 1",
        [normalizeUsername(ADMIN_USERNAME)]
      );
      if (!existingAdmin) {
        await db.runAsync(
          "INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)",
          [ADMIN_USERNAME, ADMIN_PASSWORD]
        );
      } else {
        // Keep default admin credentials stable even with older local DB data.
        await db.runAsync(
          "UPDATE users SET username = ?, password = ?, is_admin = 1 WHERE id = ?",
          [ADMIN_USERNAME, ADMIN_PASSWORD, existingAdmin.id]
        );
      }
    })();
  }
  return schemaReady;
}

export async function getLastProduct(): Promise<Product | null> {
  await initDB();
  const db = await ensureDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT id, name, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold FROM products ORDER BY id DESC LIMIT 1"
  );
  return row ? normalizeProductRow(row) : null;
}

export async function getAllProducts(): Promise<Product[]> {
  await initDB();
  const db = await ensureDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, name, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold FROM products ORDER BY id DESC"
  );
  return rows.map(normalizeProductRow);
}

export async function insertProduct(
  name: string,
  quantity: number,
  purchaseDate: string,
  expiryDate: string,
  category: string,
  notes: string,
  expiryAlertDays: number,
  lowQtyThreshold: number
): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync(
    `INSERT INTO products (name, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      quantity,
      purchaseDate,
      expiryDate,
      category,
      notes,
      expiryAlertDays,
      lowQtyThreshold,
    ]
  );
}

export async function updateProduct(p: Product): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync(
    `UPDATE products SET name = ?, quantity = ?, purchaseDate = ?, expiryDate = ?, category = ?, notes = ?, expiry_alert_days = ?, low_qty_threshold = ?
     WHERE id = ?`,
    [
      p.name,
      p.quantity,
      p.purchaseDate,
      p.expiryDate,
      p.category,
      p.notes,
      p.expiryAlertDays,
      p.lowQtyThreshold,
      p.id,
    ]
  );
}

export async function updateProductQuantity(
  id: number,
  quantity: number
): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync("UPDATE products SET quantity = ? WHERE id = ?", [
    quantity,
    id,
  ]);
}

export async function deleteProduct(id: number): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync("DELETE FROM products WHERE id = ?", [id]);
}

export async function validateSessionUser(
  id: number,
  username: string
): Promise<boolean> {
  await initDB();
  const db = await ensureDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT id FROM users WHERE id = ? AND username = ?",
    [id, username]
  );
  return row != null;
}

export async function verifyLogin(
  username: string,
  password: string
): Promise<{ id: number; username: string; isAdmin: boolean } | null> {
  await initDB();
  const db = await ensureDb();
  const normalizedUsername = normalizeUsername(username);
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT id, username, is_admin FROM users WHERE lower(trim(username)) = ? AND password = ?",
    [normalizedUsername, password]
  );
  if (!row) return null;
  return {
    id: Number(row.id),
    username: String(row.username),
    isAdmin: Number(row.is_admin) === 1,
  };
}

export async function getAllDbUsers(): Promise<
  { id: number; username: string }[]
> {
  await initDB();
  const db = await ensureDb();
  return db.getAllAsync<{ id: number; username: string }>(
    "SELECT id, username FROM users ORDER BY id ASC"
  );
}

export async function createDbUser(
  username: string,
  password: string
): Promise<boolean> {
  await initDB();
  const db = await ensureDb();
  try {
    await db.runAsync(
      "INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)",
      [username.trim(), password]
    );
    return true;
  } catch {
    return false;
  }
}
