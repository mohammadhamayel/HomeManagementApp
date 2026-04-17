import * as SQLite from "expo-sqlite";
import type { SQLiteDatabase } from "expo-sqlite";
import { toLatinDigits } from "./utils/digitLocale";
import { randomUuidV4 } from "./utils/randomUuid";

let inventoryMutatedCallback: (() => void) | null = null;

/** Inventory sync listens here to debounce-push snapshots to Firestore. */
export function setInventoryMutatedCallback(cb: (() => void) | null): void {
  inventoryMutatedCallback = cb;
}

function notifyInventoryMutated(): void {
  queueMicrotask(() => {
    inventoryMutatedCallback?.();
  });
}

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

/** Built-in admin; must not be edited or deleted from the app. */
export function isRootUsername(username: string): boolean {
  return normalizeUsername(username) === normalizeUsername(ADMIN_USERNAME);
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Match login/create so Arabic-Indic / Persian digits still verify against ASCII in DB. */
function normalizePasswordForAuth(value: string): string {
  return toLatinDigits(value.trim());
}

/** One stock line (batch) inside a logical product group. */
export type ProductLineRecord = {
  id: number;
  groupId: number;
  lineSyncId: string;
  quantity: number;
  purchaseDate: string;
  expiryDate: string;
  category: string;
  notes: string;
  expiryAlertDays: number;
  lowQtyThreshold: number;
};

/**
 * Aggregated product for list/cards/notifications.
 * `id` is the product group id. `primaryLineId` is the oldest line that still has quantity (else first line).
 * `quantity` is the sum of all lines; `primaryLineQuantity` is the primary line only (for edit forms).
 */
export type Product = {
  id: number;
  /** Stable id for cross-device sync and order list entries. */
  groupSyncId: string;
  primaryLineId: number;
  name: string;
  quantity: number;
  primaryLineQuantity: number;
  purchaseDate: string;
  expiryDate: string;
  category: string;
  notes: string;
  expiryAlertDays: number;
  lowQtyThreshold: number;
};

export type ProductGroupPickerItem = {
  id: number;
  name: string;
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

function normalizeLineRow(row: Record<string, unknown>): ProductLineRecord {
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

  const lineSyncRaw = row.sync_id ?? row.lineSyncId ?? row.line_sync_id;
  const lineSyncId =
    typeof lineSyncRaw === "string" && lineSyncRaw.trim() !== ""
      ? lineSyncRaw.trim()
      : "";

  return {
    id: Number(row.id),
    groupId: Number(row.group_id ?? row.groupId),
    lineSyncId,
    quantity,
    purchaseDate: String(row.purchaseDate ?? ""),
    expiryDate: String(row.expiryDate ?? ""),
    category: String(row.category ?? ""),
    notes: String(row.notes ?? ""),
    expiryAlertDays,
    lowQtyThreshold,
  };
}

/** Oldest line with quantity &gt; 0; otherwise the chronologically first line. */
export function pickDisplayLine(lines: ProductLineRecord[]): ProductLineRecord {
  const sorted = [...lines].sort((a, b) => a.id - b.id);
  const active = sorted.find((l) => l.quantity > 0);
  return active ?? sorted[0];
}

export function aggregateGroup(
  groupId: number,
  name: string,
  lines: ProductLineRecord[],
  groupSyncId: string
): Product | null {
  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  const d = pickDisplayLine(lines);
  return {
    id: groupId,
    groupSyncId,
    primaryLineId: d.id,
    name,
    quantity: total,
    primaryLineQuantity: d.quantity,
    purchaseDate: d.purchaseDate,
    expiryDate: d.expiryDate,
    category: d.category,
    notes: d.notes,
    expiryAlertDays: d.expiryAlertDays,
    lowQtyThreshold: d.lowQtyThreshold,
  };
}

async function ensureProductSyncIdColumns(db: SQLiteDatabase): Promise<void> {
  const gCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(product_groups)"
  );
  const gNames = new Set(gCols.map((c) => c.name));
  if (!gNames.has("sync_id")) {
    await db.execAsync("ALTER TABLE product_groups ADD COLUMN sync_id TEXT;");
  }

  const lCols = await db.getAllAsync<{ name: string }>(
    "PRAGMA table_info(product_lines)"
  );
  const lNames = new Set(lCols.map((c) => c.name));
  if (!lNames.has("sync_id")) {
    await db.execAsync("ALTER TABLE product_lines ADD COLUMN sync_id TEXT;");
  }

  const groupsMissing = await db.getAllAsync<{ id: number }>(
    "SELECT id FROM product_groups WHERE sync_id IS NULL OR trim(sync_id) = ''"
  );
  for (const row of groupsMissing) {
    await db.runAsync("UPDATE product_groups SET sync_id = ? WHERE id = ?", [
      randomUuidV4(),
      row.id,
    ]);
  }

  const linesMissing = await db.getAllAsync<{ id: number }>(
    "SELECT id FROM product_lines WHERE sync_id IS NULL OR trim(sync_id) = ''"
  );
  for (const row of linesMissing) {
    await db.runAsync("UPDATE product_lines SET sync_id = ? WHERE id = ?", [
      randomUuidV4(),
      row.id,
    ]);
  }

  await db.execAsync(
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_product_groups_sync_id ON product_groups(sync_id) WHERE length(trim(sync_id)) > 0"
  );
  await db.execAsync(
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_product_lines_sync_id ON product_lines(sync_id) WHERE length(trim(sync_id)) > 0"
  );
}

async function migrateLegacyProductsTableIfPresent(db: SQLiteDatabase): Promise<void> {
  const t = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products' LIMIT 1"
  );
  if (!t) return;

  const rowCount = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) as c FROM products"
  );
  const n = rowCount?.c ?? 0;
  if (n === 0) {
    await db.execAsync("DROP TABLE IF EXISTS products");
    return;
  }

  const legacy = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, name, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold FROM products ORDER BY id ASC"
  );

  for (const row of legacy) {
    const name = String(row.name ?? "");
    const tmp = normalizeLineRow({
      id: 0,
      group_id: 0,
      quantity: row.quantity,
      purchaseDate: row.purchaseDate,
      expiryDate: row.expiryDate,
      category: row.category,
      notes: row.notes,
      expiry_alert_days: row.expiry_alert_days,
      low_qty_threshold: row.low_qty_threshold,
    });
    const qty = tmp.quantity;
    const purchaseDate = tmp.purchaseDate;
    const expiryDate = tmp.expiryDate;
    const category = tmp.category;
    const notes = tmp.notes;
    const expiryAlertDays = tmp.expiryAlertDays;
    const lowQtyThreshold = tmp.lowQtyThreshold;

    const g = await db.runAsync(
      "INSERT INTO product_groups (name, sync_id) VALUES (?, ?)",
      [name, randomUuidV4()]
    );
    const gid = Number(g.lastInsertRowId);
    await db.runAsync(
      `INSERT INTO product_lines (group_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold, sync_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gid,
        qty,
        purchaseDate,
        expiryDate,
        category,
        notes,
        expiryAlertDays,
        lowQtyThreshold,
        randomUuidV4(),
      ]
    );
  }

  await db.execAsync("DROP TABLE IF EXISTS products");
}

export function initDB(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = await ensureDb();
      await db.execAsync("PRAGMA foreign_keys = ON;");

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS product_groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sync_id TEXT
        );
        CREATE TABLE IF NOT EXISTS product_lines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
          quantity INTEGER NOT NULL DEFAULT 0,
          purchaseDate TEXT,
          expiryDate TEXT,
          category TEXT,
          notes TEXT,
          expiry_alert_days INTEGER NOT NULL DEFAULT 0,
          low_qty_threshold INTEGER NOT NULL DEFAULT 0,
          sync_id TEXT
        );
      `);

      await ensureProductSyncIdColumns(db);
      await migrateLegacyProductsTableIfPresent(db);

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          is_admin INTEGER NOT NULL DEFAULT 0
        );
      `);

      // Prefer the row already marked admin so we never touch another account that only
      // differs by case (SQLite username UNIQUE is case-sensitive).
      let existingAdmin = await db.getFirstAsync<{ id: number }>(
        "SELECT id FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1",
        []
      );
      if (!existingAdmin) {
        existingAdmin = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM users WHERE lower(trim(username)) = ? ORDER BY id ASC LIMIT 1",
          [normalizeUsername(ADMIN_USERNAME)]
        );
      }
      if (!existingAdmin) {
        await db.runAsync(
          "INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)",
          [ADMIN_USERNAME, normalizePasswordForAuth(ADMIN_PASSWORD)]
        );
      } else {
        await db.runAsync(
          "UPDATE users SET username = ?, password = ?, is_admin = 1 WHERE id = ?",
          [
            ADMIN_USERNAME,
            normalizePasswordForAuth(ADMIN_PASSWORD),
            existingAdmin.id,
          ]
        );
      }
    })();
  }
  return schemaReady;
}

async function loadLinesForGroup(
  db: SQLiteDatabase,
  groupId: number
): Promise<ProductLineRecord[]> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, group_id, sync_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold FROM product_lines WHERE group_id = ? ORDER BY id ASC",
    [groupId]
  );
  return rows.map(normalizeLineRow);
}

export async function getProductLinesByGroupId(
  groupId: number
): Promise<ProductLineRecord[]> {
  await initDB();
  const db = await ensureDb();
  return loadLinesForGroup(db, groupId);
}

export async function getProductGroupsForPicker(): Promise<ProductGroupPickerItem[]> {
  await initDB();
  const db = await ensureDb();
  return db.getAllAsync<ProductGroupPickerItem>(
    "SELECT id, name FROM product_groups ORDER BY name COLLATE NOCASE ASC"
  );
}

export async function getLastProduct(): Promise<Product | null> {
  await initDB();
  const db = await ensureDb();
  const lastLine = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT group_id FROM product_lines ORDER BY id DESC LIMIT 1"
  );
  if (!lastLine) return null;
  const groupId = Number(lastLine.group_id);
  const g = await db.getFirstAsync<{
    id: number;
    name: string;
    group_sync_id: string;
  }>(
    "SELECT id, name, sync_id as group_sync_id FROM product_groups WHERE id = ?",
    [groupId]
  );
  if (!g) return null;
  const lines = await loadLinesForGroup(db, groupId);
  return aggregateGroup(g.id, g.name, lines, String(g.group_sync_id ?? ""));
}

export async function getAllProducts(): Promise<Product[]> {
  await initDB();
  const db = await ensureDb();
  const groups = await db.getAllAsync<{
    id: number;
    name: string;
    group_sync_id: string;
  }>(
    `SELECT g.id, g.name, g.sync_id as group_sync_id FROM product_groups g
     ORDER BY COALESCE((SELECT MAX(l.id) FROM product_lines l WHERE l.group_id = g.id), 0) DESC`
  );
  const out: Product[] = [];
  for (const g of groups) {
    const lines = await loadLinesForGroup(db, g.id);
    const agg = aggregateGroup(g.id, g.name, lines, String(g.group_sync_id ?? ""));
    if (agg) out.push(agg);
  }
  return out;
}

export async function insertProduct(
  name: string,
  quantity: number,
  purchaseDate: string,
  expiryDate: string,
  category: string,
  notes: string,
  expiryAlertDays: number,
  lowQtyThreshold: number,
  options?: { existingGroupId?: number | null }
): Promise<void> {
  await initDB();
  const db = await ensureDb();
  const gid = options?.existingGroupId ?? null;
  if (gid != null) {
    await db.runAsync(
      `INSERT INTO product_lines (group_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold, sync_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gid,
        quantity,
        purchaseDate,
        expiryDate,
        category,
        notes,
        expiryAlertDays,
        lowQtyThreshold,
        randomUuidV4(),
      ]
    );
    notifyInventoryMutated();
    return;
  }
  const g = await db.runAsync(
    "INSERT INTO product_groups (name, sync_id) VALUES (?, ?)",
    [name.trim(), randomUuidV4()]
  );
  const newGid = Number(g.lastInsertRowId);
  await db.runAsync(
    `INSERT INTO product_lines (group_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold, sync_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newGid,
      quantity,
      purchaseDate,
      expiryDate,
      category,
      notes,
      expiryAlertDays,
      lowQtyThreshold,
      randomUuidV4(),
    ]
  );
  notifyInventoryMutated();
}

export async function updateProductLine(
  lineId: number,
  fields: {
    quantity: number;
    expiryDate: string;
    category: string;
    notes: string;
    expiryAlertDays: number;
    lowQtyThreshold: number;
  }
): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync(
    `UPDATE product_lines SET quantity = ?, expiryDate = ?, category = ?, notes = ?, expiry_alert_days = ?, low_qty_threshold = ?
     WHERE id = ?`,
    [
      fields.quantity,
      fields.expiryDate,
      fields.category,
      fields.notes,
      fields.expiryAlertDays,
      fields.lowQtyThreshold,
      lineId,
    ]
  );
  notifyInventoryMutated();
}

/** Changes one batch line quantity by `delta` (e.g. +1 / −1), floored at zero. */
export async function bumpProductLineQuantity(
  lineId: number,
  delta: number
): Promise<void> {
  if (delta === 0) return;
  await initDB();
  const db = await ensureDb();
  const row = await db.getFirstAsync<Record<string, unknown>>(
    "SELECT id, group_id, sync_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold FROM product_lines WHERE id = ?",
    [lineId]
  );
  if (!row) return;
  const line = normalizeLineRow(row);
  const next = Math.max(0, line.quantity + delta);
  if (next === line.quantity) return;
  await db.runAsync("UPDATE product_lines SET quantity = ? WHERE id = ?", [
    next,
    lineId,
  ]);
  notifyInventoryMutated();
}

export async function updateGroupName(groupId: number, name: string): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync("UPDATE product_groups SET name = ? WHERE id = ?", [
    name.trim(),
    groupId,
  ]);
  notifyInventoryMutated();
}

/** @deprecated Use updateProductLine — kept for call sites that still import updateProduct */
export async function updateProduct(p: Product): Promise<void> {
  await updateProductLine(p.primaryLineId, {
    quantity: p.quantity,
    expiryDate: p.expiryDate,
    category: p.category,
    notes: p.notes,
    expiryAlertDays: p.expiryAlertDays,
    lowQtyThreshold: p.lowQtyThreshold,
  });
  await updateGroupName(p.id, p.name);
}

/**
 * Sets total quantity for a group. Decreases apply FIFO (oldest lines first).
 * Increases add the surplus to the newest line.
 */
export async function updateProductQuantity(
  groupId: number,
  newTotal: number
): Promise<void> {
  await initDB();
  const db = await ensureDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, group_id, sync_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold FROM product_lines WHERE group_id = ? ORDER BY id ASC",
    [groupId]
  );
  const lines = rows.map(normalizeLineRow);
  if (lines.length === 0) return;

  const current = lines.reduce((s, l) => s + l.quantity, 0);
  const diff = newTotal - current;
  if (diff === 0) return;

  if (diff > 0) {
    const last = lines[lines.length - 1];
    await db.runAsync("UPDATE product_lines SET quantity = ? WHERE id = ?", [
      last.quantity + diff,
      last.id,
    ]);
    notifyInventoryMutated();
    return;
  }

  let toRemove = -diff;
  for (const line of lines) {
    if (toRemove <= 0) break;
    const take = Math.min(line.quantity, toRemove);
    const nextQty = line.quantity - take;
    toRemove -= take;
    await db.runAsync("UPDATE product_lines SET quantity = ? WHERE id = ?", [
      nextQty,
      line.id,
    ]);
  }
  notifyInventoryMutated();
}

export async function deleteProduct(groupId: number): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.runAsync("DELETE FROM product_groups WHERE id = ?", [groupId]);
  notifyInventoryMutated();
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
  const inputPass = normalizePasswordForAuth(password);
  const rows = await db.getAllAsync<Record<string, unknown>>(
    "SELECT id, username, is_admin, password FROM users WHERE lower(trim(username)) = ?",
    [normalizedUsername]
  );
  for (const row of rows) {
    const stored = normalizePasswordForAuth(String(row.password ?? ""));
    if (stored === inputPass) {
      return {
        id: Number(row.id),
        username: String(row.username),
        isAdmin: Number(row.is_admin) === 1,
      };
    }
  }
  return null;
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
  const name = username.trim();
  if (!name) return false;
  const clash = await db.getFirstAsync<{ id: number }>(
    "SELECT id FROM users WHERE lower(trim(username)) = ? LIMIT 1",
    [normalizeUsername(name)]
  );
  if (clash) return false;
  try {
    await db.runAsync(
      "INSERT INTO users (username, password, is_admin) VALUES (?, ?, 0)",
      [name, normalizePasswordForAuth(password)]
    );
    return true;
  } catch {
    return false;
  }
}

export async function updateDbUser(
  id: number,
  newUsername: string,
  newPassword?: string
): Promise<boolean> {
  await initDB();
  const db = await ensureDb();
  const row = await db.getFirstAsync<{ username: string }>(
    "SELECT username FROM users WHERE id = ?",
    [id]
  );
  if (!row) return false;
  if (isRootUsername(row.username)) return false;

  const name = newUsername.trim();
  if (!name) return false;
  const pwdTrim = newPassword?.trim() ?? "";
  const nameChanged =
    normalizeUsername(name) !== normalizeUsername(row.username);
  if (nameChanged) {
    const clash = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM users WHERE lower(trim(username)) = ? AND id != ? LIMIT 1",
      [normalizeUsername(name), id]
    );
    if (clash) return false;
  }
  if (!nameChanged && !pwdTrim) return true;

  if (pwdTrim) {
    await db.runAsync(
      "UPDATE users SET username = ?, password = ? WHERE id = ?",
      [name, normalizePasswordForAuth(pwdTrim), id]
    );
  } else {
    await db.runAsync("UPDATE users SET username = ? WHERE id = ?", [
      name,
      id,
    ]);
  }
  return true;
}

export async function deleteDbUser(id: number): Promise<boolean> {
  await initDB();
  const db = await ensureDb();
  const row = await db.getFirstAsync<{ username: string }>(
    "SELECT username FROM users WHERE id = ?",
    [id]
  );
  if (!row) return false;
  if (isRootUsername(row.username)) return false;
  await db.runAsync("DELETE FROM users WHERE id = ?", [id]);
  return true;
}

/** Serialized inventory for Firestore snapshot sync (schema v1). */
export type InventorySnapshotLineV1 = {
  lineSyncId: string;
  quantity: number;
  purchaseDate: string;
  expiryDate: string;
  category: string;
  notes: string;
  expiryAlertDays: number;
  lowQtyThreshold: number;
};

export type InventorySnapshotGroupV1 = {
  groupSyncId: string;
  name: string;
  lines: InventorySnapshotLineV1[];
};

export type InventorySnapshotPayloadV1 = {
  schema: 1;
  groups: InventorySnapshotGroupV1[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseInventorySnapshotPayload(
  raw: unknown
): InventorySnapshotPayloadV1 | null {
  if (!isRecord(raw) || raw.schema !== 1) return null;
  const groupsRaw = raw.groups;
  if (!Array.isArray(groupsRaw)) return null;
  const groups: InventorySnapshotGroupV1[] = [];
  for (const g of groupsRaw) {
    if (!isRecord(g)) return null;
    const groupSyncId = String(g.groupSyncId ?? "").trim();
    const name = String(g.name ?? "").trim();
    if (!groupSyncId || !name) return null;
    const linesRaw = g.lines;
    if (!Array.isArray(linesRaw)) return null;
    const lines: InventorySnapshotLineV1[] = [];
    for (const lr of linesRaw) {
      if (!isRecord(lr)) return null;
      const lineSyncId = String(lr.lineSyncId ?? "").trim();
      if (!lineSyncId) return null;
      const quantity = Number(lr.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) return null;
      lines.push({
        lineSyncId,
        quantity: Math.max(0, Math.trunc(quantity)),
        purchaseDate: String(lr.purchaseDate ?? ""),
        expiryDate: String(lr.expiryDate ?? ""),
        category: String(lr.category ?? ""),
        notes: String(lr.notes ?? ""),
        expiryAlertDays: Math.max(
          0,
          Math.trunc(Number(lr.expiryAlertDays ?? lr.expiry_alert_days ?? 0) || 0)
        ),
        lowQtyThreshold: Math.max(
          0,
          Math.trunc(Number(lr.lowQtyThreshold ?? lr.low_qty_threshold ?? 0) || 0)
        ),
      });
    }
    groups.push({ groupSyncId, name, lines });
  }
  return { schema: 1, groups };
}

export async function buildInventorySnapshotPayloadV1(): Promise<InventorySnapshotPayloadV1> {
  await initDB();
  const db = await ensureDb();
  const groups = await db.getAllAsync<{ id: number; name: string; sync_id: string }>(
    "SELECT id, name, sync_id FROM product_groups ORDER BY id ASC"
  );
  const out: InventorySnapshotGroupV1[] = [];
  for (const g of groups) {
    const lines = await loadLinesForGroup(db, g.id);
    const sid = String(g.sync_id ?? "").trim() || randomUuidV4();
    out.push({
      groupSyncId: sid,
      name: g.name,
      lines: lines.map((l) => ({
        lineSyncId: l.lineSyncId.trim() || randomUuidV4(),
        quantity: l.quantity,
        purchaseDate: l.purchaseDate,
        expiryDate: l.expiryDate,
        category: l.category,
        notes: l.notes,
        expiryAlertDays: l.expiryAlertDays,
        lowQtyThreshold: l.lowQtyThreshold,
      })),
    });
  }
  return { schema: 1, groups: out };
}

/**
 * Replaces all product groups/lines with snapshot data (used after remote pull).
 * Does not notify inventory mutation listeners (avoids echo push).
 */
export async function replaceInventoryFromSnapshotV1(
  payload: InventorySnapshotPayloadV1
): Promise<void> {
  await initDB();
  const db = await ensureDb();
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync("DELETE FROM product_lines;");
      await db.execAsync("DELETE FROM product_groups;");
      for (const g of payload.groups) {
        await db.runAsync("INSERT INTO product_groups (name, sync_id) VALUES (?, ?)", [
          g.name.trim(),
          g.groupSyncId.trim(),
        ]);
        const ins = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM product_groups WHERE sync_id = ? LIMIT 1",
          [g.groupSyncId.trim()]
        );
        const gid = ins?.id;
        if (gid == null) continue;
        for (const line of g.lines) {
          await db.runAsync(
            `INSERT INTO product_lines (group_id, quantity, purchaseDate, expiryDate, category, notes, expiry_alert_days, low_qty_threshold, sync_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              gid,
              line.quantity,
              line.purchaseDate,
              line.expiryDate,
              line.category,
              line.notes,
              line.expiryAlertDays,
              line.lowQtyThreshold,
              line.lineSyncId.trim(),
            ]
          );
        }
      }
    });
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }
}
