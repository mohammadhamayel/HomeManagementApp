import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import * as SQLite from "expo-sqlite";
import DateTimePicker from "@react-native-community/datetimepicker";

const db = SQLite.openDatabaseSync("inventory.db");

type Product = {
  id: number;
  name: string;
  quantity: number;
  purchaseDate: string;
  expiryDate: string;
  category: string;
  notes: string;
};

function parseQuantityInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeProductRow(row: Record<string, unknown>): Product {
  const q = row.quantity;
  let quantity = 0;
  if (typeof q === "number" && Number.isFinite(q)) {
    quantity = Math.trunc(q);
  } else if (typeof q === "string" && q.trim() !== "") {
    const parsed = parseQuantityInput(q);
    quantity = parsed ?? 0;
  }

  return {
    id: Number(row.id),
    name: String(row.name ?? ""),
    quantity,
    purchaseDate: String(row.purchaseDate ?? ""),
    expiryDate: String(row.expiryDate ?? ""),
    category: String(row.category ?? ""),
    notes: String(row.notes ?? ""),
  };
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("food");

  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [expiryDate, setExpiryDate] = useState(new Date());

  const [showPurchasePicker, setShowPurchasePicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editQtyDraft, setEditQtyDraft] = useState("");

  useEffect(() => {
    initDB();
    loadProducts();
  }, []);

  const initDB = () => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        quantity INTEGER NOT NULL DEFAULT 0,
        purchaseDate TEXT,
        expiryDate TEXT,
        category TEXT,
        notes TEXT
      );
    `);

    const columns = db.getAllSync<{ name: string }>(
      "PRAGMA table_info(products)"
    );
    const hasQuantity = columns.some((c) => c.name === "quantity");
    if (!hasQuantity) {
      db.execSync(
        "ALTER TABLE products ADD COLUMN quantity INTEGER NOT NULL DEFAULT 0"
      );
    }
  };

  const loadProducts = () => {
    const rows = db.getAllSync<Record<string, unknown>>(
      "SELECT id, name, quantity, purchaseDate, expiryDate, category, notes FROM products ORDER BY id DESC"
    );
    setProducts(rows.map(normalizeProductRow));
  };

  const addProduct = () => {
    const qty = parseQuantityInput(quantity);
    if (!name.trim() || qty === null) {
      Alert.alert("خطأ", "أدخل اسم المنتج وكمية صحيحة (رقم صحيح ≥ 0)");
      return;
    }

    db.runSync(
      `INSERT INTO products (name, quantity, purchaseDate, expiryDate, category, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), qty, purchaseDate.toISOString(), expiryDate.toISOString(), category, notes]
    );

    checkExpiry(expiryDate);

    setName("");
    setQuantity("");
    setNotes("");
    loadProducts();
  };

  const deleteProduct = (id: number) => {
    db.runSync("DELETE FROM products WHERE id = ?", [id]);
    loadProducts();
  };

  const openEditQuantity = (item: Product) => {
    setEditProduct(item);
    setEditQtyDraft(String(item.quantity));
    setEditModalVisible(true);
  };

  const closeEditQuantity = () => {
    setEditModalVisible(false);
    setEditProduct(null);
    setEditQtyDraft("");
  };

  const bumpEditQty = (delta: number) => {
    const n = parseQuantityInput(editQtyDraft) ?? 0;
    setEditQtyDraft(String(Math.max(0, n + delta)));
  };

  const saveEditQuantity = () => {
    if (!editProduct) return;
    const q = parseQuantityInput(editQtyDraft);
    if (q === null) {
      Alert.alert("خطأ", "أدخل كمية صحيحة (رقم صحيح ≥ 0)");
      return;
    }
    db.runSync("UPDATE products SET quantity = ? WHERE id = ?", [
      q,
      editProduct.id,
    ]);
    closeEditQuantity();
    loadProducts();
  };

  const checkExpiry = (date: Date) => {
    if (date < new Date()) {
      Alert.alert("تنبيه", "⚠️ المنتج منتهي الصلاحية");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📦 مخزون المنزل (SQLite)</Text>

      <TextInput
        placeholder="اسم المنتج"
        style={styles.input}
        value={name}
        onChangeText={setName}
      />

      <TextInput
        placeholder="الكمية (رقم)"
        style={styles.input}
        keyboardType="number-pad"
        inputMode="numeric"
        value={quantity}
        onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ""))}
      />

      <TextInput
        placeholder="ملاحظات"
        style={styles.input}
        value={notes}
        onChangeText={setNotes}
      />

      <Text>📅 تاريخ الشراء</Text>
      <Button title="اختيار" onPress={() => setShowPurchasePicker(true)} />

      {showPurchasePicker && (
        <DateTimePicker
          value={purchaseDate}
          mode="date"
          onChange={(e, date) => {
            setShowPurchasePicker(false);
            if (date) setPurchaseDate(date);
          }}
        />
      )}

      <Text>⏳ تاريخ الانتهاء</Text>
      <Button title="اختيار" onPress={() => setShowExpiryPicker(true)} />

      {showExpiryPicker && (
        <DateTimePicker
          value={expiryDate}
          mode="date"
          onChange={(e, date) => {
            setShowExpiryPicker(false);
            if (date) setExpiryDate(date);
          }}
        />
      )}

      <Button title="➕ إضافة منتج" onPress={addProduct} />

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              <TouchableOpacity
                onPress={() => openEditQuantity(item)}
                style={styles.editIconBtn}
                accessibilityLabel="تعديل الكمية"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.editIcon}>✏️</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.quantityLine}>
              الكمية: <Text style={styles.quantityValue}>{item.quantity}</Text>
            </Text>
            <Text>التصنيف: {item.category}</Text>
            <Text>
              شراء: {new Date(item.purchaseDate).toLocaleDateString()}
            </Text>
            <Text>
              انتهاء: {new Date(item.expiryDate).toLocaleDateString()}
            </Text>
            <Text>ملاحظات: {item.notes}</Text>

            <TouchableOpacity
              onPress={() => deleteProduct(item.id)}
              style={styles.deleteBtn}
            >
              <Text style={{ color: "white" }}>حذف</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeEditQuantity}
      >
        <Pressable style={styles.modalOverlay} onPress={closeEditQuantity}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>تعديل الكمية</Text>
            {editProduct ? (
              <Text style={styles.modalSubtitle}>{editProduct.name}</Text>
            ) : null}

            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpEditQty(-1)}
                accessibilityLabel="نقص واحد"
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.modalQtyInput}
                keyboardType="number-pad"
                value={editQtyDraft}
                onChangeText={(t) =>
                  setEditQtyDraft(t.replace(/[^0-9]/g, ""))
                }
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpEditQty(1)}
                accessibilityLabel="زيادة واحد"
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={closeEditQuantity}
              >
                <Text style={styles.modalBtnSecondaryText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={saveEditQuantity}
              >
                <Text style={styles.modalBtnPrimaryText}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, marginTop: 40 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  input: {
    borderWidth: 1,
    padding: 10,
    marginVertical: 5,
    borderRadius: 5,
  },
  card: {
    borderWidth: 1,
    padding: 10,
    marginVertical: 5,
    borderRadius: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: { fontSize: 18, fontWeight: "bold", flex: 1 },
  editIconBtn: {
    padding: 4,
  },
  editIcon: {
    fontSize: 22,
  },
  quantityLine: { fontSize: 16, marginTop: 4 },
  quantityValue: { fontWeight: "700", fontSize: 17 },
  deleteBtn: {
    marginTop: 10,
    backgroundColor: "red",
    padding: 5,
    alignItems: "center",
    borderRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 15,
    color: "#444",
    textAlign: "center",
    marginTop: 6,
    marginBottom: 16,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#e8e8e8",
    justifyContent: "center",
    alignItems: "center",
  },
  stepBtnText: {
    fontSize: 26,
    fontWeight: "600",
    color: "#222",
    lineHeight: 30,
  },
  modalQtyInput: {
    minWidth: 100,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 22,
  },
  modalBtnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalBtnSecondaryText: {
    fontSize: 16,
    color: "#666",
  },
  modalBtnPrimary: {
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 10,
  },
  modalBtnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});