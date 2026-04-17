import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
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
  getProductLinesByGroupId,
  parseQuantityInput,
  pickDisplayLine,
  bumpProductLineQuantity,
  type Product,
  type ProductLineRecord,
} from "../database";
import { useInventoryNotifications } from "../context/NotificationContext";
import { useInventorySync } from "../context/InventorySyncContext";
import { useOrderList } from "../context/OrderListContext";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";
import { sanitizeUnsignedIntegerInput } from "../utils/digitLocale";

export default function AllProductsScreen() {
  const { refreshNotifications } = useInventoryNotifications();
  const { inventoryRevision } = useInventorySync();
  const { isStarred, getEntry, upsertEntry, removeEntry } = useOrderList();
  const [products, setProducts] = useState<Product[]>([]);
  const [nameFilter, setNameFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState<"all" | "expired" | "valid">(
    "all"
  );
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [editQtyDraft, setEditQtyDraft] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyGroupName, setHistoryGroupName] = useState("");
  const [historyLines, setHistoryLines] = useState<ProductLineRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [starModalVisible, setStarModalVisible] = useState(false);
  const [starProduct, setStarProduct] = useState<Product | null>(null);
  const [starQtyDraft, setStarQtyDraft] = useState("1");
  const [starNotesDraft, setStarNotesDraft] = useState("");

  const load = useCallback(() => {
    void (async () => {
      setProducts(await getAllProducts());
      void refreshNotifications();
    })();
  }, [refreshNotifications]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, inventoryRevision])
  );

  const openEditQuantity = (item: Product) => {
    setEditProduct(item);
    setEditQtyDraft(String(item.quantity));
    setEditModalVisible(true);
  };

  const openHistory = (item: Product) => {
    setHistoryGroupName(item.name);
    setHistoryVisible(true);
    setHistoryLines([]);
    setHistoryLoading(true);
    void (async () => {
      const lines = await getProductLinesByGroupId(item.id);
      setHistoryLines(lines.sort((a, b) => a.id - b.id));
      setHistoryLoading(false);
    })();
  };

  const closeHistory = () => {
    setHistoryVisible(false);
    setHistoryGroupName("");
    setHistoryLines([]);
    setHistoryLoading(false);
  };

  const closeEditQuantity = () => {
    setEditModalVisible(false);
    setEditProduct(null);
    setEditQtyDraft("");
  };

  const closeStarModal = () => {
    setStarModalVisible(false);
    setStarProduct(null);
    setStarQtyDraft("1");
    setStarNotesDraft("");
  };

  const openStarModal = (item: Product) => {
    setStarProduct(item);
    const existing = getEntry({ id: item.id, groupSyncId: item.groupSyncId });
    setStarQtyDraft(String(existing?.quantity ?? 1));
    setStarNotesDraft(existing?.notes ?? "");
    setStarModalVisible(true);
  };

  const bumpStarQty = (delta: number) => {
    const n = parseQuantityInput(starQtyDraft) ?? 0;
    setStarQtyDraft(String(Math.max(0, n + delta)));
  };

  const saveStarToOrder = () => {
    if (!starProduct) return;
    const q = parseQuantityInput(starQtyDraft);
    if (q === null || q <= 0) {
      Alert.alert("تنبيه", "أدخل كمية أكبر من صفر");
      return;
    }
    upsertEntry({
      productId: starProduct.id,
      productGroupSyncId: starProduct.groupSyncId,
      productName: starProduct.name,
      quantity: q,
      notes: starNotesDraft,
    });
    closeStarModal();
  };

  const removeStarFromOrder = () => {
    if (!starProduct) return;
    removeEntry({
      productId: starProduct.id,
      productGroupSyncId: starProduct.groupSyncId,
    });
    closeStarModal();
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

  const bumpLineQuantity = (line: ProductLineRecord, delta: number) => {
    void (async () => {
      await bumpProductLineQuantity(line.id, delta);
      const lines = await getProductLinesByGroupId(line.groupId);
      setHistoryLines(lines.sort((a, b) => a.id - b.id));
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
            <TouchableOpacity
              style={styles.starBtn}
              onPress={() => openStarModal(item)}
              accessibilityLabel={
                isStarred({ id: item.id, groupSyncId: item.groupSyncId }) ? "تعديل الطلبية" : "إضافة للطلبية"
              }
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <Text style={styles.starIcon}>
                {isStarred({ id: item.id, groupSyncId: item.groupSyncId }) ? "★" : "☆"}
              </Text>
            </TouchableOpacity>
            <View style={styles.cardTop}>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={() => openHistory(item)}
                  accessibilityLabel="تفاصيل السجلات"
                >
                  <Text style={styles.icon}>📋</Text>
                </TouchableOpacity>
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
                  الكمية الإجمالية:{" "}
                  <Text style={styles.quantityValue}>{item.quantity}</Text>
                </Text>
                <Text style={[styles.meta, rtlLabel]}>
                  التصنيف: {item.category}
                </Text>
                <Text style={[styles.meta, rtlLabel]}>
                  تاريخ الإضافة (الدفعة الظاهرة):{" "}
                  {new Date(item.purchaseDate).toLocaleDateString("ar")}
                </Text>
                <Text style={[styles.meta, rtlLabel]}>
                  انتهاء (الدفعة الظاهرة):{" "}
                  {new Date(item.expiryDate).toLocaleDateString("ar")}
                </Text>
                {item.expiryAlertDays > 0 ? (
                  <Text style={[styles.meta, rtlLabel]}>
                    تنبيه انتهاء: خلال {item.expiryAlertDays} يومًا أو أقل
                  </Text>
                ) : null}
                {item.lowQtyThreshold > 0 ? (
                  <Text style={[styles.meta, rtlLabel]}>
                    تنبيه كمية عند: {item.lowQtyThreshold} أو أقل
                  </Text>
                ) : null}
                {item.notes ? (
                  <Text style={[styles.meta, rtlLabel]}>ملاحظات: {item.notes}</Text>
                ) : null}
              </View>
            </View>
          </View>
        )}
      />

      <Modal
        visible={historyVisible}
        transparent
        animationType="fade"
        onRequestClose={closeHistory}
      >
        <Pressable style={styles.modalOverlay} onPress={closeHistory}>
          <Pressable style={styles.historyModalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, rtlLabel]}>سجل الدفعات</Text>
            <Text style={[styles.historySubtitle, rtlLabel]}>{historyGroupName}</Text>
            <ScrollView
              style={styles.historyScroll}
              keyboardShouldPersistTaps="handled"
            >
              {historyLoading ? (
                <Text style={[styles.historyEmpty, rtlLabel]}>جاري التحميل…</Text>
              ) : historyLines.length === 0 ? (
                <Text style={[styles.historyEmpty, rtlLabel]}>لا توجد دفعات</Text>
              ) : (
                (() => {
                  const displayLine = pickDisplayLine(historyLines);
                  return historyLines.map((line, idx) => {
                  const isDisplayed = line.id === displayLine.id;
                  return (
                  <View key={line.id} style={styles.historySubCard}>
                    <View style={styles.historySubTitleRow}>
                      <View style={styles.historyQtyStepper}>
                        <TouchableOpacity
                          style={[
                            styles.historyStepBtn,
                            line.quantity <= 0
                              ? styles.historyStepBtnDisabled
                              : undefined,
                          ]}
                          onPress={() => bumpLineQuantity(line, -1)}
                          disabled={line.quantity <= 0}
                          accessibilityLabel="نقصان كمية الدفعة"
                        >
                          <Text style={styles.historyStepBtnText}>−</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.historyStepBtn}
                          onPress={() => bumpLineQuantity(line, 1)}
                          accessibilityLabel="زيادة كمية الدفعة"
                        >
                          <Text style={styles.historyStepBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.historySubTitle, rtlLabel, styles.historySubTitleFlex]}>
                        دفعة {idx + 1} — كمية:{" "}
                        <Text style={styles.historyQty}>{line.quantity}</Text>
                        {isDisplayed ? (
                          <Text style={styles.historyBadge}> — على البطاقة</Text>
                        ) : null}
                      </Text>
                    </View>
                    <Text style={[styles.historyMeta, rtlLabel]}>
                      تاريخ الإضافة:{" "}
                      {new Date(line.purchaseDate).toLocaleDateString("ar")}
                    </Text>
                    <Text style={[styles.historyMeta, rtlLabel]}>
                      انتهاء: {new Date(line.expiryDate).toLocaleDateString("ar")}
                    </Text>
                    <Text style={[styles.historyMeta, rtlLabel]}>
                      التصنيف: {line.category}
                    </Text>
                    {line.expiryAlertDays > 0 ? (
                      <Text style={[styles.historyMeta, rtlLabel]}>
                        تنبيه انتهاء: خلال {line.expiryAlertDays} يومًا أو أقل
                      </Text>
                    ) : null}
                    {line.lowQtyThreshold > 0 ? (
                      <Text style={[styles.historyMeta, rtlLabel]}>
                        تنبيه كمية عند: {line.lowQtyThreshold} أو أقل
                      </Text>
                    ) : null}
                    {line.notes ? (
                      <Text style={[styles.historyMeta, rtlLabel]}>
                        ملاحظات: {line.notes}
                      </Text>
                    ) : null}
                  </View>
                  );
                });
                })()
              )}
            </ScrollView>
            <TouchableOpacity style={styles.historyCloseBtn} onPress={closeHistory}>
              <Text style={styles.modalBtnPrimaryText}>إغلاق</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={starModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeStarModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeStarModal}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity
              style={styles.starModalCloseX}
              onPress={closeStarModal}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="إغلاق"
            >
              <Text style={styles.starModalCloseXText}>✕</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, rtlLabel]}>الطلبية — الرشيتة</Text>
            {starProduct ? (
              <Text style={[styles.modalSubtitle, rtlLabel]}>
                {starProduct.name}
              </Text>
            ) : null}

            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpStarQty(-1)}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.modalQtyInput, rtlInput]}
                placeholder="الكمية"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                value={starQtyDraft}
                onChangeText={(t) =>
                  setStarQtyDraft(sanitizeUnsignedIntegerInput(t))
                }
                selectTextOnFocus
              />
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => bumpStarQty(1)}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.starNotesLabel, rtlLabel]}>ملاحظات</Text>
            <TextInput
              style={[styles.starNotesInput, rtlInput]}
              placeholder="ملاحظات (اختياري)"
              placeholderTextColor="#94a3b8"
              value={starNotesDraft}
              onChangeText={setStarNotesDraft}
              multiline
            />

            <View style={styles.starModalActions}>
              {starProduct && isStarred({
                  id: starProduct.id,
                  groupSyncId: starProduct.groupSyncId,
                }) ? (
                <TouchableOpacity
                  style={styles.starRemoveBtn}
                  onPress={removeStarFromOrder}
                >
                  <Text style={styles.starRemoveBtnText}>إزالة من الطلبية</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={saveStarToOrder}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {starProduct && isStarred({
                  id: starProduct.id,
                  groupSyncId: starProduct.groupSyncId,
                }) ? "حفظ" : "إضافة"}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeEditQuantity}
      >
        <Pressable style={styles.modalOverlay} onPress={closeEditQuantity}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, rtlLabel]}>تعديل الكمية الإجمالية</Text>
            {editProduct ? (
              <Text style={[styles.modalSubtitle, rtlLabel]}>
                {editProduct.name}
              </Text>
            ) : null}
            {editProduct ? (
              <Text style={[styles.modalHint, rtlLabel]}>
                يُوزَّع النقصان حسب الأقدمية (الدفعات الأقدم أولًا). الزيادة تُضاف
                لأحدث دفعة.
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
    position: "relative",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    paddingLeft: 52,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  starBtn: {
    position: "absolute",
    left: 8,
    top: 10,
    minWidth: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  starIcon: {
    fontSize: 26,
    color: "#ca8a04",
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
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 18,
  },
  historyModalBox: {
    width: "100%",
    maxWidth: 360,
    maxHeight: "78%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
  },
  historySubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#334155",
    textAlign: "center",
    marginBottom: 12,
  },
  historyScroll: { maxHeight: 420 },
  historyEmpty: {
    textAlign: "center",
    color: "#94a3b8",
    paddingVertical: 20,
    fontSize: 14,
  },
  historySubCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#f8fafc",
  },
  historySubTitleRow: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  historySubTitleFlex: { flex: 1 },
  historyQtyStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyStepBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#e2e8f0",
    justifyContent: "center",
    alignItems: "center",
  },
  historyStepBtnDisabled: {
    opacity: 0.35,
  },
  historyStepBtnText: {
    fontSize: 22,
    fontWeight: "600",
    color: "#0f172a",
  },
  historySubTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  historyQty: { fontWeight: "800" },
  historyBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1d4ed8",
  },
  historyMeta: {
    fontSize: 13,
    color: "#475569",
    marginTop: 3,
  },
  historyCloseBtn: {
    alignSelf: "center",
    marginTop: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
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
  starModalCloseX: {
    position: "absolute",
    top: 10,
    left: 12,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  starModalCloseXText: { fontSize: 20, color: "#64748b", fontWeight: "700" },
  starNotesLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    marginTop: 16,
    marginBottom: 6,
    textAlign: "right",
    alignSelf: "stretch",
  },
  starNotesInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    textAlignVertical: "top",
  },
  starModalActions: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
  },
  starRemoveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#fee2e2",
  },
  starRemoveBtnText: {
    color: "#b91c1c",
    fontSize: 15,
    fontWeight: "700",
  },
});
