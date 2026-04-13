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
  deleteProduct,
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<Product | null>(null);

  const fillFromProduct = useCallback((p: Product) => {
    setName(p.name);
    setQuantity(String(p.quantity));
    setNotes(p.notes);
    setCategory(p.category || "food");
    setPurchaseDate(new Date(p.purchaseDate));
    setExpiryDate(new Date(p.expiryDate));
    setEditingProduct(p);
  }, []);

  const resetFormForNew = useCallback(() => {
    setName("");
    setQuantity("");
    setNotes("");
    setCategory("food");
    setPurchaseDate(new Date());
    setExpiryDate(new Date());
    setEditingProduct(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const last = await getLastProduct();
        if (cancelled) return;
        setLastSnapshot(last);
        resetFormForNew();
      })();
      return () => {
        cancelled = true;
      };
    }, [resetFormForNew])
  );

  const save = async () => {
    const qty = parseQuantityInput(quantity);
    if (!name.trim() || qty === null) {
      Alert.alert("خطأ", "أدخل اسم المنتج وكمية صحيحة");
      return;
    }
    const pDate = purchaseDate.toISOString();
    const eDate = expiryDate.toISOString();

    if (!editingProduct) {
      await insertProduct(name.trim(), qty, pDate, eDate, category, notes);
      const inserted = await getLastProduct();
      setLastSnapshot(inserted);
      resetFormForNew();
      if (expiryDate < new Date()) {
        Alert.alert("تنبيه", "⚠️ المنتج منتهي الصلاحية");
      }
      return;
    }

    const updated: Product = {
      id: editingProduct.id,
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
    resetFormForNew();
  };

  const onDeleteLast = () => {
    if (!lastSnapshot) return;
    Alert.alert("حذف", `حذف «${lastSnapshot.name}»؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await deleteProduct(lastSnapshot.id);
            const nextLast = await getLastProduct();
            setLastSnapshot(nextLast);
            resetFormForNew();
          })();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.hint, rtlLabel]}>
        {editingProduct
          ? "وضع التعديل: عدل البيانات ثم اضغط حفظ."
          : "أدخل منتج جديد. بعد الحفظ يظهر آخر منتج أسفل الفورم."}
      </Text>

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
          {editingProduct ? "💾 حفظ التعديلات" : "💾 حفظ المنتج"}
        </Text>
      </TouchableOpacity>

      {lastSnapshot ? (
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => fillFromProduct(lastSnapshot)}
              >
                <Text style={styles.icon}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={onDeleteLast}>
                <Text style={styles.icon}>🗑️</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cardDetails}>
              <Text style={[styles.cardName, rtlLabel]}>{lastSnapshot.name}</Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                الكمية: <Text style={styles.quantityValue}>{lastSnapshot.quantity}</Text>
              </Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                التصنيف: {lastSnapshot.category}
              </Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                شراء:{" "}
                {new Date(lastSnapshot.purchaseDate).toLocaleDateString("ar")}
              </Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                انتهاء: {new Date(lastSnapshot.expiryDate).toLocaleDateString("ar")}
              </Text>
              {lastSnapshot.notes ? (
                <Text style={[styles.cardMeta, rtlLabel]}>
                  ملاحظات: {lastSnapshot.notes}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
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
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    backgroundColor: "#fafafa",
    marginTop: 16,
    padding: 14,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -2,
  },
  iconBtn: { padding: 6 },
  icon: { fontSize: 22 },
  cardDetails: { flex: 1, alignItems: "flex-end" },
  cardName: { fontSize: 17, fontWeight: "700" },
  cardMeta: { fontSize: 14, color: "#475569", marginTop: 3 },
  quantityValue: { fontWeight: "800", fontSize: 16 },
});
