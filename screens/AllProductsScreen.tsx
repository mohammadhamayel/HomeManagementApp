import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  getAllProducts,
  deleteProduct,
  updateProductQuantity,
  parseQuantityInput,
  type Product,
} from "../database";
import { useInventoryNotifications } from "../context/NotificationContext";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";
import { sanitizeUnsignedIntegerInput } from "../utils/digitLocale";

export default function AllProductsScreen() {
  const { refreshNotifications } = useInventoryNotifications();
  const [products, setProducts] = useState<Product[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<"all" | "expired" | "valid">(
    "all"
  );
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editQtyDraft, setEditQtyDraft] = useState("");

  const load = useCallback(() => {
    void (async () => {
      setProducts(await getAllProducts());
      void refreshNotifications();
    })();
  }, [refreshNotifications]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
      Alert.alert("خطأ", "أدخل كمية صحيحة");
      return;
    }
    void (async () => {
      await updateProductQuantity(editProduct.id, q);
      closeEditQuantity();
      load();
    })();
  };

  const confirmDelete = (item: Product) => {
    Alert.alert(
      "حذف",
      `حذف «${item.name}»؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await deleteProduct(item.id);
              load();
            })();
          },
        },
      ]
    );
  };

  const filteredProducts = useMemo(() => {
    const nameQ = nameFilter.trim().toLowerCase();
    const categoryQ = categoryFilter.trim().toLowerCase();
    const now = new Date();

    return products.filter((item) => {
      if (nameQ && !item.name.toLowerCase().includes(nameQ)) return false;
      if (categoryQ && !item.category.toLowerCase().includes(categoryQ)) {
        return false;
      }
      if (expiryFilter === "expired" && new Date(item.expiryDate) >= now) {
        return false;
      }
      if (expiryFilter === "valid" && new Date(item.expiryDate) < now) {
        return false;
      }
      return true;
    });
  }, [products, nameFilter, categoryFilter, expiryFilter]);

  return (
    <View style={styles.container}>
      <View style={styles.filtersWrap}>
        <Text style={[styles.filtersTitle, rtlLabel]}>فلترة المنتجات</Text>
        <TextInput
          placeholder="بحث باسم المنتج"
          placeholderTextColor="#94a3b8"
          style={[styles.filterInput, rtlInput]}
          value={nameFilter}
          onChangeText={setNameFilter}
        />
        <TextInput
          placeholder="بحث بالتصنيف"
          placeholderTextColor="#94a3b8"
          style={[styles.filterInput, rtlInput]}
          value={categoryFilter}
          onChangeText={setCategoryFilter}
        />
        <View style={styles.filterChips}>
          <TouchableOpacity
            style={[
              styles.chip,
              expiryFilter === "all" ? styles.chipActive : undefined,
            ]}
            onPress={() => setExpiryFilter("all")}
          >
            <Text
              style={[
                styles.chipText,
                expiryFilter === "all" ? styles.chipTextActive : undefined,
              ]}
            >
              الكل
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.chip,
              expiryFilter === "expired" ? styles.chipActive : undefined,
            ]}
            onPress={() => setExpiryFilter("expired")}
          >
            <Text
              style={[
                styles.chipText,
                expiryFilter === "expired" ? styles.chipTextActive : undefined,
              ]}
            >
              منتهي
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.chip,
              expiryFilter === "valid" ? styles.chipActive : undefined,
            ]}
            onPress={() => setExpiryFilter("valid")}
          >
            <Text
              style={[
                styles.chipText,
                expiryFilter === "valid" ? styles.chipTextActive : undefined,
              ]}
            >
              غير منتهي
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={
          filteredProducts.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          <Text style={[styles.empty, rtlLabel]}>
            لا توجد منتجات بهذه الفلاتر
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => openEditQuantity(item)}
                  accessibilityLabel="تعديل الكمية"
                >
                  <Text style={styles.icon}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => confirmDelete(item)}
                  accessibilityLabel="حذف"
                >
                  <Text style={styles.icon}>🗑️</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.details}>
                <Text style={[styles.name, rtlLabel]}>{item.name}</Text>
                <Text style={[styles.quantityLine, rtlLabel]}>
                  الكمية: <Text style={styles.quantityValue}>{item.quantity}</Text>
                </Text>
                <Text style={[styles.meta, rtlLabel]}>
                  التصنيف: {item.category}
                </Text>
                <Text style={[styles.meta, rtlLabel]}>
                  تاريخ الإضافة:{" "}
                  {new Date(item.purchaseDate).toLocaleDateString("ar")}
                </Text>
                <Text style={[styles.meta, rtlLabel]}>
                  انتهاء: {new Date(item.expiryDate).toLocaleDateString("ar")}
                </Text>
                {item.notes ? (
                  <Text style={[styles.meta, rtlLabel]}>ملاحظات: {item.notes}</Text>
                ) : null}
              </View>
            </View>
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
            <Text style={[styles.modalTitle, rtlLabel]}>تعديل الكمية</Text>
            {editProduct ? (
              <Text style={[styles.modalSubtitle, rtlLabel]}>
                {editProduct.name}
              </Text>
            ) : null}

            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpEditQty(-1)}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.modalQtyInput, rtlInput]}
                placeholder="الكمية"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                value={editQtyDraft}
                onChangeText={(t) =>
                  setEditQtyDraft(sanitizeUnsignedIntegerInput(t))
                }
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpEditQty(1)}
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
  container: { flex: 1, backgroundColor: "#fff" },
  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 4,
  },
  filtersTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
    color: "#334155",
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    fontSize: 15,
  },
  filterChips: { flexDirection: "row-reverse", gap: 8, marginBottom: 4 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
  },
  chipActive: { backgroundColor: "#dbeafe" },
  chipText: { color: "#334155", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#1d4ed8" },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  empty: { textAlign: "center", color: "#64748b", fontSize: 16, padding: 24 },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  details: { flex: 1, alignItems: "flex-end" },
  name: { fontSize: 17, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 2, marginTop: -2 },
  iconBtn: { padding: 6 },
  icon: { fontSize: 22 },
  quantityLine: { fontSize: 16, marginTop: 6 },
  quantityValue: { fontWeight: "800", fontSize: 17 },
  meta: { fontSize: 14, color: "#475569", marginTop: 2 },
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
