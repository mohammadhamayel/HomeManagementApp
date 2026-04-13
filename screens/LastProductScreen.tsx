import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import DateInputField from "../components/DateInputField";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";
import {
  getLastProduct,
  deleteProduct,
  insertProduct,
  updateProduct,
  getProductGroupsForPicker,
  parseQuantityInput,
  type Product,
  type ProductGroupPickerItem,
} from "../database";
import { useInventoryNotifications } from "../context/NotificationContext";
import { sanitizeUnsignedIntegerInput } from "../utils/digitLocale";

export default function LastProductScreen() {
  const { refreshNotifications } = useInventoryNotifications();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiryAlertDays, setExpiryAlertDays] = useState("");
  const [lowQtyThreshold, setLowQtyThreshold] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("food");
  const [expiryDate, setExpiryDate] = useState(new Date());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<Product | null>(null);
  const [pickerItems, setPickerItems] = useState<ProductGroupPickerItem[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const loadPicker = useCallback(() => {
    void (async () => {
      setPickerItems(await getProductGroupsForPicker());
    })();
  }, []);

  const fillFromProduct = useCallback((p: Product) => {
    setName(p.name);
    setQuantity(String(p.primaryLineQuantity));
    setExpiryAlertDays(
      p.expiryAlertDays > 0 ? String(p.expiryAlertDays) : ""
    );
    setLowQtyThreshold(p.lowQtyThreshold > 0 ? String(p.lowQtyThreshold) : "");
    setNotes(p.notes);
    setCategory(p.category || "food");
    setExpiryDate(new Date(p.expiryDate));
    setEditingProduct(p);
    setSelectedGroupId(null);
  }, []);

  const resetFormForNew = useCallback(() => {
    setName("");
    setQuantity("");
    setExpiryAlertDays("");
    setLowQtyThreshold("");
    setNotes("");
    setCategory("food");
    setExpiryDate(new Date());
    setEditingProduct(null);
    setSelectedGroupId(null);
  }, []);

  const onNameChange = useCallback(
    (t: string) => {
      setName(t);
      if (selectedGroupId != null) {
        const picked = pickerItems.find((p) => p.id === selectedGroupId);
        if (!picked || picked.name.trim() !== t.trim()) {
          setSelectedGroupId(null);
        }
      }
    },
    [pickerItems, selectedGroupId]
  );

  const pickExistingGroup = useCallback((item: ProductGroupPickerItem) => {
    setName(item.name);
    setSelectedGroupId(item.id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        loadPicker();
        const last = await getLastProduct();
        if (cancelled) return;
        setLastSnapshot(last);
        resetFormForNew();
        void refreshNotifications();
      })();
      return () => {
        cancelled = true;
      };
    }, [loadPicker, resetFormForNew, refreshNotifications])
  );

  const save = async () => {
    const qty = parseQuantityInput(quantity);
    if (!name.trim() || qty === null) {
      Alert.alert("خطأ", "أدخل اسم المنتج وكمية صحيحة");
      return;
    }
    const alertDays = parseQuantityInput(expiryAlertDays) ?? 0;
    const lowQty = parseQuantityInput(lowQtyThreshold) ?? 0;
    const eDate = expiryDate.toISOString();

    if (!editingProduct) {
      const pDate = new Date().toISOString();
      await insertProduct(
        name.trim(),
        qty,
        pDate,
        eDate,
        category,
        notes,
        alertDays,
        lowQty,
        selectedGroupId != null
          ? { existingGroupId: selectedGroupId }
          : undefined
      );
      const inserted = await getLastProduct();
      setLastSnapshot(inserted);
      resetFormForNew();
      loadPicker();
      void refreshNotifications();
      if (expiryDate < new Date()) {
        Alert.alert("تنبيه", "⚠️ المنتج منتهي الصلاحية");
      }
      return;
    }

    await updateProduct({
      id: editingProduct.id,
      primaryLineId: editingProduct.primaryLineId,
      name: name.trim(),
      quantity: qty,
      primaryLineQuantity: qty,
      purchaseDate: editingProduct.purchaseDate,
      expiryDate: eDate,
      category,
      notes,
      expiryAlertDays: alertDays,
      lowQtyThreshold: lowQty,
    });
    if (expiryDate < new Date()) {
      Alert.alert("تنبيه", "⚠️ المنتج منتهي الصلاحية");
    }
    const again = await getLastProduct();
    setLastSnapshot(again);
    resetFormForNew();
    loadPicker();
    void refreshNotifications();
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
            loadPicker();
            void refreshNotifications();
          })();
        },
      },
    ]);
  };

  const nameQuery = name.trim().toLowerCase();
  const suggestionList = pickerItems.filter((p) => {
    if (!nameQuery) return false;
    return p.name.toLowerCase().includes(nameQuery);
  });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.hint, rtlLabel]}>
        {editingProduct
          ? "وضع التعديل: يُعدّل سجل الدفعة الظاهر (الأقدم بكمية متبقية) والاسم على مستوى المنتج."
          : selectedGroupId != null
            ? "إضافة سجل جديد لمنتج موجود — الكمية على البطاقة الرئيسية ستُجمع مع السجلات السابقة."
            : "منتج جديد، أو اكتب الاسم واختر منتجًا من القائمة لإضافة دفعة جديدة بنفس الاسم."}
      </Text>

      <TextInput
        placeholder="اسم المنتج (كتابة أو اختيار من القائمة)"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        value={name}
        onChangeText={onNameChange}
      />

      {suggestionList.length > 0 && !editingProduct ? (
        <View style={styles.suggestionsBox}>
          <Text style={[styles.suggestionsTitle, rtlLabel]}>
            منتجات مسجّلة (اختر لربط الدفعة الجديدة)
          </Text>
          <ScrollView
            style={styles.suggestionsList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {suggestionList.map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.suggestionRow,
                  selectedGroupId === item.id ? styles.suggestionRowActive : null,
                ]}
                onPress={() => pickExistingGroup(item)}
              >
                <Text style={[styles.suggestionText, rtlLabel]}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <TextInput
        placeholder="الكمية (رقم)"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        keyboardType="number-pad"
        value={quantity}
        onChangeText={(t) => setQuantity(sanitizeUnsignedIntegerInput(t))}
      />

      <TextInput
        placeholder="تنبيه انتهاء الصلاحية (أيام، 0 = بدون)"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        keyboardType="number-pad"
        value={expiryAlertDays}
        onChangeText={(t) => setExpiryAlertDays(sanitizeUnsignedIntegerInput(t))}
      />

      <TextInput
        placeholder="تنبيه الكمية (حد أقصى للتنبيه، 0 = بدون)"
        placeholderTextColor="#94a3b8"
        style={[styles.input, rtlInput]}
        keyboardType="number-pad"
        value={lowQtyThreshold}
        onChangeText={(t) => setLowQtyThreshold(sanitizeUnsignedIntegerInput(t))}
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
                الكمية الإجمالية:{" "}
                <Text style={styles.quantityValue}>{lastSnapshot.quantity}</Text>
              </Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                التصنيف: {lastSnapshot.category}
              </Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                تاريخ الإضافة (الدفعة الظاهرة):{" "}
                {new Date(lastSnapshot.purchaseDate).toLocaleDateString("ar")}
              </Text>
              <Text style={[styles.cardMeta, rtlLabel]}>
                انتهاء (الدفعة الظاهرة):{" "}
                {new Date(lastSnapshot.expiryDate).toLocaleDateString("ar")}
              </Text>
              {lastSnapshot.expiryAlertDays > 0 ? (
                <Text style={[styles.cardMeta, rtlLabel]}>
                  تنبيه انتهاء: خلال {lastSnapshot.expiryAlertDays} يومًا أو أقل
                </Text>
              ) : null}
              {lastSnapshot.lowQtyThreshold > 0 ? (
                <Text style={[styles.cardMeta, rtlLabel]}>
                  تنبيه كمية عند: {lastSnapshot.lowQtyThreshold} أو أقل
                </Text>
              ) : null}
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
  suggestionsBox: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  suggestionsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
  },
  suggestionsList: { maxHeight: 160 },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  suggestionRowActive: { backgroundColor: "#dbeafe" },
  suggestionText: { fontSize: 15, color: "#0f172a" },
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
