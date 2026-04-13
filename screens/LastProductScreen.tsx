import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import DateInputField from "../components/DateInputField";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";
import {
  getLastProduct,
  insertProduct,
  updateProduct,
  parseQuantityInput,
  type Product,
} from "../database";

export default function LastProductScreen() {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("food");
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [expiryDate, setExpiryDate] = useState(new Date());
  /** null = no row loaded yet; number = editing this id */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  /** Loaded async for hints / «منتج جديد» visibility */
  const [lastSnapshot, setLastSnapshot] = useState<Product | null>(null);

  const fillFromProduct = useCallback((p: Product) => {
    setName(p.name);
    setQuantity(String(p.quantity));
    setNotes(p.notes);
    setCategory(p.category || "food");
    setPurchaseDate(new Date(p.purchaseDate));
    setExpiryDate(new Date(p.expiryDate));
    setEditingId(p.id);
    setCreatingNew(false);
  }, []);

  const resetFormForNew = useCallback(() => {
    setName("");
    setQuantity("");
    setNotes("");
    setCategory("food");
    setPurchaseDate(new Date());
    setExpiryDate(new Date());
    setEditingId(null);
    setCreatingNew(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const last = await getLastProduct();
        if (cancelled) return;
        setLastSnapshot(last);
        if (last) {
          fillFromProduct(last);
          setCreatingNew(false);
        } else {
          resetFormForNew();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [fillFromProduct, resetFormForNew])
  );

  const save = async () => {
    const qty = parseQuantityInput(quantity);
    if (!name.trim() || qty === null) {
      Alert.alert("خطأ", "أدخل اسم المنتج وكمية صحيحة");
      return;
    }
    const pDate = purchaseDate.toISOString();
    const eDate = expiryDate.toISOString();

    if (creatingNew || editingId === null) {
      await insertProduct(name.trim(), qty, pDate, eDate, category, notes);
      setCreatingNew(false);
      const inserted = await getLastProduct();
      setLastSnapshot(inserted);
      if (inserted) fillFromProduct(inserted);
      if (expiryDate < new Date()) {
        Alert.alert("تنبيه", "⚠️ المنتج منتهي الصلاحية");
      }
      return;
    }

    const updated: Product = {
      id: editingId,
      name: name.trim(),
      quantity: qty,
      purchaseDate: pDate,
      expiryDate: eDate,
      category,
      notes,
    };
    await updateProduct(updated);
    if (expiryDate < new Date()) {
      Alert.alert("تنبيه", "⚠️ المنتج منتهي الصلاحية");
    }
    const again = await getLastProduct();
    setLastSnapshot(again);
    if (again) fillFromProduct(again);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.hint, rtlLabel]}>
        {lastSnapshot && !creatingNew
          ? "آخر منتج مضاف — يمكنك تعديل كل الحقول ثم حفظ التعديلات"
          : "لا يوجد منتج بعد — أدخل بيانات أول منتج أو اضغط «منتج جديد» بعد وجود منتجات"}
      </Text>

      {lastSnapshot ? (
        <TouchableOpacity style={styles.newBtn} onPress={resetFormForNew}>
          <Text style={[styles.newBtnText, rtlLabel]}>➕ منتج جديد</Text>
        </TouchableOpacity>
      ) : null}

      <TextInput
        placeholder="اسم المنتج"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        value={name}
        onChangeText={setName}
      />

      <TextInput
        placeholder="الكمية (رقم)"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        keyboardType="number-pad"
        value={quantity}
        onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ""))}
      />

      <TextInput
        placeholder="التصنيف"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        value={category}
        onChangeText={setCategory}
      />

      <TextInput
        placeholder="ملاحظات"
        placeholderTextColor="#94a3b8"
        style={[styles.input, styles.notesInput, rtlInput]}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <DateInputField
        label="📅 تاريخ الشراء"
        value={purchaseDate}
        onChange={setPurchaseDate}
        placeholder="يوم/شهر/سنة"
      />

      <DateInputField
        label="⏳ تاريخ الانتهاء"
        value={expiryDate}
        onChange={setExpiryDate}
        placeholder="يوم/شهر/سنة"
      />

      <TouchableOpacity style={styles.saveBtn} onPress={() => void save()}>
        <Text style={[styles.saveBtnText, rtlLabel]}>
          {creatingNew || editingId === null ? "💾 حفظ المنتج" : "💾 حفظ التعديلات"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#fff" },
  scrollContent: { padding: 16, paddingBottom: 40 },
  hint: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 12,
    lineHeight: 22,
  },
  newBtn: {
    backgroundColor: "#e0f2fe",
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    alignItems: "center",
  },
  newBtnText: { fontSize: 16, fontWeight: "700", color: "#0369a1" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  saveBtn: {
    backgroundColor: "#16a34a",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
  saveBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
