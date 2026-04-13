import React, { useCallback, useState } from "react";
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
import { rtlInput, rtlLabel } from "../theme/rtlStyles";

export default function AllProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editQtyDraft, setEditQtyDraft] = useState("");

  const load = useCallback(() => {
    void (async () => {
      setProducts(await getAllProducts());
    })();
  }, []);

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

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={products.length === 0 ? styles.emptyList : undefined}
        ListEmptyComponent={
          <Text style={[styles.empty, rtlLabel]}>لا توجد منتجات بعد</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={[styles.name, rtlLabel]}>{item.name}</Text>
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
            </View>
            <Text style={[styles.quantityLine, rtlLabel]}>
              الكمية: <Text style={styles.quantityValue}>{item.quantity}</Text>
            </Text>
            <Text style={[styles.meta, rtlLabel]}>
              التصنيف: {item.category}
            </Text>
            <Text style={[styles.meta, rtlLabel]}>
              شراء: {new Date(item.purchaseDate).toLocaleDateString("ar")}
            </Text>
            <Text style={[styles.meta, rtlLabel]}>
              انتهاء: {new Date(item.expiryDate).toLocaleDateString("ar")}
            </Text>
            {item.notes ? (
              <Text style={[styles.meta, rtlLabel]}>ملاحظات: {item.notes}</Text>
            ) : null}
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
                  setEditQtyDraft(t.replace(/[^0-9]/g, ""))
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: { fontSize: 17, fontWeight: "700", flex: 1 },
  actions: { flexDirection: "row", gap: 4 },
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
