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

  useEffect(() => {
    initDB();
    loadProducts();
  }, []);

  const initDB = () => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        quantity INTEGER,
        purchaseDate TEXT,
        expiryDate TEXT,
        category TEXT,
        notes TEXT
      );
    `);
  };

  const loadProducts = () => {
    const result = db.getAllSync<Product>("SELECT * FROM products");
    setProducts(result);
  };

  const addProduct = () => {
    if (!name || !quantity) {
      Alert.alert("خطأ", "أدخل الاسم والكمية");
      return;
    }

    db.runSync(
      `INSERT INTO products (name, quantity, purchaseDate, expiryDate, category, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        Number(quantity),
        purchaseDate.toISOString(),
        expiryDate.toISOString(),
        category,
        notes,
      ]
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
        placeholder="الكمية"
        style={styles.input}
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
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
            <Text style={styles.name}>{item.name}</Text>
            <Text>الكمية: {item.quantity}</Text>
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
  name: { fontSize: 18, fontWeight: "bold" },
  deleteBtn: {
    marginTop: 10,
    backgroundColor: "red",
    padding: 5,
    alignItems: "center",
    borderRadius: 5,
  },
});