import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  getAllProducts,
  parseQuantityInput,
  type Product,
} from "../database";
import {
  useOrderList,
  type OrderListEntry,
  type OrderListEntryTarget,
} from "../context/OrderListContext";
import { useInventorySync } from "../context/InventorySyncContext";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";
import { formatDateForDisplay } from "../components/DateInputField";

function toISODateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromISO(iso: string | null | undefined): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, mo, da] = iso.split("-").map(Number);
    return new Date(y, mo - 1, da);
  }
  return new Date();
}

function entryTarget(item: OrderListEntry): OrderListEntryTarget {
  return {
    productId: item.productId,
    productGroupSyncId: item.productGroupSyncId,
  };
}

export default function OrderReceiptScreen() {
  const insets = useSafeAreaInsets();
  const { inventoryRevision } = useInventorySync();
  const {
    entries,
    removeEntry,
    setEntryChecked,
    setCheckedWithExpiry,
    updateEntryQuantity,
    upsertEntry,
    getEntry,
    syncProductNames,
    loading,
  } = useOrderList();

  const [notesModalEntry, setNotesModalEntry] = useState<OrderListEntry | null>(
    null
  );
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [pendingAddProduct, setPendingAddProduct] = useState<Product | null>(
    null
  );
  const [addQtyDraft, setAddQtyDraft] = useState("1");

  const [expiryModalEntry, setExpiryModalEntry] = useState<OrderListEntry | null>(
    null
  );
  const [expiryDraftDate, setExpiryDraftDate] = useState<Date>(() => new Date());
  const [androidExpiryPicker, setAndroidExpiryPicker] = useState(false);

  const [qtyEditEntry, setQtyEditEntry] = useState<OrderListEntry | null>(null);
  const [qtyEditDraft, setQtyEditDraft] = useState("");

  const refreshNames = useCallback(() => {
    void (async () => {
      const products = await getAllProducts();
      setCatalogProducts(products);
      syncProductNames(
        products.map((p) => ({
          id: p.id,
          name: p.name,
          groupSyncId: p.groupSyncId,
        }))
      );
    })();
  }, [syncProductNames]);

  useFocusEffect(
    useCallback(() => {
      refreshNames();
    }, [refreshNames, inventoryRevision])
  );

  const loadCatalogForModal = useCallback(() => {
    void (async () => {
      setCatalogProducts(await getAllProducts());
    })();
  }, []);

  const openAddModal = useCallback(() => {
    setAddSearch("");
    setPendingAddProduct(null);
    setAddQtyDraft("1");
    setAddModalVisible(true);
    loadCatalogForModal();
  }, [loadCatalogForModal]);

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) =>
        a.productName.localeCompare(b.productName, "ar")
      ),
    [entries]
  );

  const filteredCatalog = useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    if (!q) return catalogProducts;
    return catalogProducts.filter((p) =>
      p.name.toLowerCase().includes(q)
    );
  }, [catalogProducts, addSearch]);

  const confirmAddProduct = useCallback(() => {
    if (!pendingAddProduct) return;
    const q = parseQuantityInput(addQtyDraft);
    if (q === null || q < 1) return;

    const ref = {
      id: pendingAddProduct.id,
      groupSyncId: pendingAddProduct.groupSyncId,
    };
    const existing = getEntry(ref);
    const mergedQty = (existing?.quantity ?? 0) + q;

    upsertEntry({
      productId: pendingAddProduct.id,
      productGroupSyncId: pendingAddProduct.groupSyncId,
      productName: pendingAddProduct.name,
      quantity: mergedQty,
      notes: existing?.notes ?? "",
    });

    setPendingAddProduct(null);
    setAddQtyDraft("1");
    setAddSearch("");
  }, [pendingAddProduct, addQtyDraft, getEntry, upsertEntry]);

  const bumpAddQty = (delta: number) => {
    const n = parseQuantityInput(addQtyDraft) ?? 0;
    setAddQtyDraft(String(Math.max(1, n + delta)));
  };

  const onPressCheckbox = (item: OrderListEntry) => {
    if (item.checked) {
      setEntryChecked(entryTarget(item), false);
      return;
    }
    setExpiryDraftDate(dateFromISO(item.expiresAt));
    setExpiryModalEntry(item);
    if (Platform.OS === "android") {
      setAndroidExpiryPicker(false);
    }
  };

  const confirmExpiryAndCheck = () => {
    if (!expiryModalEntry) return;
    setCheckedWithExpiry(
      entryTarget(expiryModalEntry),
      true,
      toISODateString(expiryDraftDate)
    );
    setExpiryModalEntry(null);
  };

  const onAndroidExpiryChange = (
    event: { type?: string },
    date?: Date
  ) => {
    if (Platform.OS === "android") {
      setAndroidExpiryPicker(false);
      if (event.type === "dismissed") return;
    }
    if (date) setExpiryDraftDate(date);
  };

  const bumpLineQty = (item: OrderListEntry, delta: number) => {
    const next = Math.max(1, item.quantity + delta);
    updateEntryQuantity(entryTarget(item), next);
  };

  const openQtyEditor = (item: OrderListEntry) => {
    setQtyEditEntry(item);
    setQtyEditDraft(String(item.quantity));
  };

  const saveQtyEdit = () => {
    if (!qtyEditEntry) return;
    const q = parseQuantityInput(qtyEditDraft);
    if (q === null || q < 1) return;
    updateEntryQuantity(entryTarget(qtyEditEntry), q);
    setQtyEditEntry(null);
    setQtyEditDraft("");
  };

  const fabBottom = Math.max(insets.bottom, 12) + 8;
  const listBottomPad = fabBottom + 56 + 12;

  return (
    <View style={styles.container}>
      {loading ? (
        <Text style={[styles.hint, rtlLabel]}>جاري التحميل…</Text>
      ) : sorted.length === 0 ? (
        <Text style={[styles.empty, rtlLabel, { paddingBottom: listBottomPad }]}>
          لا توجد منتجات في الطلبية. اضغط الزر العائم + لإضافة منتجات من القائمة،
          أو استخدم النجمة في «جميع المنتجات».
        </Text>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) =>
            item.productGroupSyncId?.trim()
              ? item.productGroupSyncId
              : `id:${item.productId}`
          }
          contentContainerStyle={[
            styles.listPad,
            { paddingBottom: listBottomPad },
          ]}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.checkHit}
                onPress={() => onPressCheckbox(item)}
                accessibilityLabel={
                  item.checked ? "إلغاء التحديد" : "تحديد وتاريخ الانتهاء"
                }
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View
                  style={[
                    styles.checkbox,
                    item.checked ? styles.checkboxOn : undefined,
                  ]}
                >
                  {item.checked ? (
                    <Text style={styles.checkMark}>✓</Text>
                  ) : null}
                </View>
              </TouchableOpacity>

              <View style={styles.middle}>
                <Text style={[styles.name, rtlLabel]} numberOfLines={2}>
                  {item.productName}
                </Text>
                {item.checked && item.expiresAt ? (
                  <Text style={[styles.expiryLine, rtlLabel]}>
                    ينتهي:{" "}
                    <Text style={styles.expiryVal}>
                      {formatDateForDisplay(dateFromISO(item.expiresAt))}
                    </Text>
                  </Text>
                ) : null}

                <View style={styles.qtyRow}>
                  <Text style={[styles.qtyLabel, rtlLabel]}>الكمية</Text>
                  <View style={styles.qtyStepper}>
                    <TouchableOpacity
                      style={[
                        styles.stepBtn,
                        item.quantity <= 1 && styles.stepBtnDisabled,
                      ]}
                      onPress={() => bumpLineQty(item, -1)}
                      disabled={item.quantity <= 1}
                      accessibilityLabel="نقص الكمية"
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openQtyEditor(item)}
                      style={styles.qtyValueHit}
                      accessibilityLabel="تعديل الكمية"
                    >
                      <Text style={styles.qtyValueNum}>{item.quantity}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => bumpLineQty(item, 1)}
                      accessibilityLabel="زيادة الكمية"
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.detailsBtn}
                onPress={() => setNotesModalEntry(item)}
                accessibilityLabel="تفاصيل الملاحظات"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.detailsIcon}>ⓘ</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() =>
                  removeEntry({
                    productId: item.productId,
                    productGroupSyncId: item.productGroupSyncId,
                  })
                }
                accessibilityLabel="إزالة من الطلبية"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.removeText}>−</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {!loading ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: fabBottom }]}
          onPress={openAddModal}
          activeOpacity={0.85}
          accessibilityLabel="إضافة منتج للطلبية"
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      ) : null}

      {/* Notes modal */}
      <Modal
        visible={notesModalEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setNotesModalEntry(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setNotesModalEntry(null)}
        >
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity
              style={styles.modalCloseX}
              onPress={() => setNotesModalEntry(null)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="إغلاق"
            >
              <Text style={styles.modalCloseXText}>✕</Text>
            </TouchableOpacity>
            {notesModalEntry ? (
              <>
                <Text style={[styles.modalTitle, rtlLabel]}>ملاحظات</Text>
                <Text style={[styles.modalProduct, rtlLabel]}>
                  {notesModalEntry.productName}
                </Text>
                <Text style={[styles.notesBody, rtlLabel]}>
                  {notesModalEntry.notes.trim()
                    ? notesModalEntry.notes.trim()
                    : "لا توجد ملاحظات لهذا المنتج."}
                </Text>
              </>
            ) : null}
            <TouchableOpacity
              style={styles.modalOk}
              onPress={() => setNotesModalEntry(null)}
            >
              <Text style={styles.modalOkText}>حسنًا</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Expiry when checking */}
      <Modal
        visible={expiryModalEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setExpiryModalEntry(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setExpiryModalEntry(null)}
          >
            <Pressable style={styles.expiryBox} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.expiryTitle, rtlLabel]}>
              تاريخ انتهاء الصلاحية
            </Text>
            <Text style={[styles.expirySubtitle, rtlLabel]} numberOfLines={2}>
              {expiryModalEntry?.productName ?? ""}
            </Text>

            <TouchableOpacity
              style={styles.calendarLaunch}
              onPress={() => {
                if (Platform.OS === "android") {
                  setAndroidExpiryPicker(true);
                }
              }}
            >
              <Text style={styles.calendarEmoji}>📅</Text>
              <Text style={[styles.calendarLaunchText, rtlLabel]}>
                {formatDateForDisplay(expiryDraftDate)}
              </Text>
            </TouchableOpacity>

            {Platform.OS === "ios" && (
              <DateTimePicker
                value={expiryDraftDate}
                mode="date"
                display="spinner"
                locale="ar"
                onChange={(_, d) => {
                  if (d) setExpiryDraftDate(d);
                }}
                style={styles.iosPicker}
              />
            )}

            {Platform.OS === "android" && androidExpiryPicker && (
              <DateTimePicker
                value={expiryDraftDate}
                mode="date"
                display="default"
                locale="ar"
                onChange={onAndroidExpiryChange}
              />
            )}

            <View style={styles.expiryActions}>
              <TouchableOpacity
                style={styles.expiryGhost}
                onPress={() => setExpiryModalEntry(null)}
              >
                <Text style={styles.expiryGhostText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.expiryPrimary}
                onPress={confirmExpiryAndCheck}
              >
                <Text style={styles.expiryPrimaryText}>تأكيد التحديد</Text>
              </TouchableOpacity>
            </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add product from catalog */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.addOverlay}
        >
          <Pressable
            style={styles.addBackdrop}
            onPress={() => setAddModalVisible(false)}
          />
          <View style={styles.addSheet}>
            <View style={styles.addHandle} />
            <Text style={[styles.addTitle, rtlLabel]}>إضافة إلى الطلبية</Text>
            <TextInput
              style={[styles.addSearch, rtlInput]}
              placeholder="بحث باسم المنتج…"
              placeholderTextColor="#94a3b8"
              value={addSearch}
              onChangeText={setAddSearch}
            />

            <FlatList
              data={filteredCatalog}
              keyExtractor={(p) => String(p.id) + p.groupSyncId}
              style={styles.addList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: p }) => {
                const onList = !!getEntry({
                  id: p.id,
                  groupSyncId: p.groupSyncId,
                });
                return (
                  <TouchableOpacity
                    style={styles.catalogRow}
                    onPress={() => {
                      setPendingAddProduct(p);
                      setAddQtyDraft("1");
                    }}
                  >
                    <View style={styles.catalogRowMain}>
                      <Text style={[styles.catalogName, rtlLabel]} numberOfLines={2}>
                        {p.name}
                      </Text>
                      {p.category ? (
                        <Text style={[styles.catalogCat, rtlLabel]} numberOfLines={1}>
                          {p.category}
                        </Text>
                      ) : null}
                    </View>
                    {onList ? (
                      <View style={styles.badgeInList}>
                        <Text style={styles.badgeInListText}>في الطلبية</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.addEmpty, rtlLabel]}>
                  لا توجد منتجات مطابقة.
                </Text>
              }
            />

            {pendingAddProduct ? (
              <View style={styles.addFooter}>
                <Text style={[styles.addFooterTitle, rtlLabel]} numberOfLines={1}>
                  {pendingAddProduct.name}
                </Text>
                <View style={styles.addQtyRow}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => bumpAddQty(-1)}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.addQtyInput, rtlInput]}
                    keyboardType="number-pad"
                    value={addQtyDraft}
                    onChangeText={(t) =>
                      setAddQtyDraft(t.replace(/[^\d]/g, ""))
                    }
                  />
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => bumpAddQty(1)}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.addFooterBtns}>
                  <TouchableOpacity
                    style={styles.expiryGhost}
                    onPress={() => setPendingAddProduct(null)}
                  >
                    <Text style={styles.expiryGhostText}>إلغاء</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.addConfirm}
                    onPress={confirmAddProduct}
                  >
                    <Text style={styles.addConfirmText}>أضف للطلبية</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.addCloseBtn}
              onPress={() => setAddModalVisible(false)}
            >
              <Text style={styles.addCloseText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Quantity edit */}
      <Modal
        visible={qtyEditEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setQtyEditEntry(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setQtyEditEntry(null)}
        >
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, rtlLabel]}>تعديل الكمية</Text>
            {qtyEditEntry ? (
              <Text style={[styles.modalProduct, rtlLabel]} numberOfLines={2}>
                {qtyEditEntry.productName}
              </Text>
            ) : null}
            <TextInput
              style={[styles.qtyModalInput, rtlInput]}
              keyboardType="number-pad"
              value={qtyEditDraft}
              onChangeText={(t) => setQtyEditDraft(t.replace(/[^\d]/g, ""))}
              placeholder="الكمية"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.expiryActions}>
              <TouchableOpacity
                style={styles.expiryGhost}
                onPress={() => setQtyEditEntry(null)}
              >
                <Text style={styles.expiryGhostText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.expiryPrimary} onPress={saveQtyEdit}>
                <Text style={styles.expiryPrimaryText}>حفظ</Text>
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
  listPad: { paddingVertical: 10 },
  hint: {
    textAlign: "center",
    color: "#64748b",
    marginTop: 24,
    fontSize: 15,
  },
  empty: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 15,
    paddingHorizontal: 24,
    marginTop: 32,
    lineHeight: 22,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "300",
    marginTop: -2,
  },
  card: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fafafa",
    gap: 10,
  },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#b91c1c",
    marginTop: -2,
  },
  detailsBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
  },
  detailsIcon: {
    fontSize: 20,
    fontWeight: "800",
    color: "#3730a3",
  },
  middle: { flex: 1, alignItems: "flex-end", minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
    alignSelf: "stretch",
    textAlign: "right",
  },
  expiryLine: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    alignSelf: "stretch",
    textAlign: "right",
  },
  expiryVal: { fontWeight: "700", color: "#059669" },
  qtyRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    alignSelf: "stretch",
    marginTop: 10,
    justifyContent: "space-between",
    gap: 8,
  },
  qtyLabel: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  qtyStepper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 0,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  stepBtn: {
    minWidth: 44,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },
  stepBtnDisabled: { opacity: 0.35 },
  stepBtnText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1e293b",
  },
  qtyValueHit: {
    minWidth: 48,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  qtyValueNum: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
  },
  checkHit: { padding: 4 },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxOn: {
    borderColor: "#2563eb",
    backgroundColor: "#dbeafe",
  },
  checkMark: {
    fontSize: 16,
    fontWeight: "900",
    color: "#1d4ed8",
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
    paddingTop: 16,
  },
  modalCloseX: {
    position: "absolute",
    top: 10,
    left: 12,
    zIndex: 2,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  modalCloseXText: { fontSize: 20, color: "#64748b", fontWeight: "700" },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
  },
  modalProduct: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    marginBottom: 14,
  },
  notesBody: {
    fontSize: 15,
    color: "#0f172a",
    textAlign: "right",
    lineHeight: 22,
    marginBottom: 18,
  },
  modalOk: {
    alignSelf: "center",
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  modalOkText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  expiryBox: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    zIndex: 1,
  },
  expiryTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    color: "#0f172a",
  },
  expirySubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  calendarLaunch: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 8,
  },
  calendarEmoji: { fontSize: 22 },
  calendarLaunchText: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1e293b",
  },
  iosPicker: { alignSelf: "stretch" },
  expiryActions: {
    flexDirection: "row-reverse",
    gap: 10,
    marginTop: 16,
    justifyContent: "center",
  },
  expiryGhost: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  expiryGhostText: { fontSize: 16, fontWeight: "600", color: "#475569" },
  expiryPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  expiryPrimaryText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  addOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  addBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  addSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 20,
    maxHeight: "88%",
  },
  addHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e2e8f0",
    marginVertical: 10,
  },
  addTitle: {
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
    color: "#0f172a",
  },
  addSearch: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#f8fafc",
  },
  addList: { maxHeight: 340 },
  catalogRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    gap: 8,
  },
  catalogRowMain: { flex: 1, minWidth: 0 },
  catalogName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "right",
  },
  catalogCat: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
    textAlign: "right",
  },
  badgeInList: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeInListText: { fontSize: 11, fontWeight: "700", color: "#166534" },
  addEmpty: { textAlign: "center", color: "#94a3b8", padding: 24 },
  addFooter: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  addFooterTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 12,
  },
  addQtyRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 14,
  },
  addQtyInput: {
    minWidth: 80,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "#fff",
  },
  addFooterBtns: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    gap: 12,
  },
  addConfirm: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#2563eb",
  },
  addConfirmText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  addCloseBtn: {
    marginTop: 14,
    alignSelf: "center",
    paddingVertical: 10,
  },
  addCloseText: { fontSize: 15, color: "#64748b", fontWeight: "600" },
  qtyModalInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    marginBottom: 16,
    backgroundColor: "#f8fafc",
  },
});
