import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { getAllProducts } from "../database";
import { useOrderList, type OrderListEntry } from "../context/OrderListContext";
import { useInventorySync } from "../context/InventorySyncContext";
import { rtlLabel } from "../theme/rtlStyles";

export default function OrderReceiptScreen() {
  const { inventoryRevision } = useInventorySync();
  const {
    entries,
    removeEntry,
    setEntryChecked,
    syncProductNames,
    loading,
  } = useOrderList();
  const [notesModalEntry, setNotesModalEntry] = useState<OrderListEntry | null>(
    null
  );

  const refreshNames = useCallback(() => {
    void (async () => {
      const products = await getAllProducts();
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

  const sorted = useMemo(
    () => [...entries].sort((a, b) => a.productName.localeCompare(b.productName, "ar")),
    [entries]
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <Text style={[styles.hint, rtlLabel]}>جاري التحميل…</Text>
      ) : sorted.length === 0 ? (
        <Text style={[styles.empty, rtlLabel]}>
          لا توجد منتجات مضافة للطلبية. استخدم النجمة في «جميع المنتجات» لإضافة
          منتج مع الكمية والملاحظات.
        </Text>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) =>
            item.productGroupSyncId?.trim()
              ? item.productGroupSyncId
              : `id:${item.productId}`
          }
          contentContainerStyle={styles.listPad}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.checkHit}
                onPress={() =>
                  setEntryChecked(
                    {
                      productId: item.productId,
                      productGroupSyncId: item.productGroupSyncId,
                    },
                    !item.checked
                  )
                }
                accessibilityLabel={
                  item.checked ? "إلغاء التحديد" : "تحديد"
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
                <Text style={[styles.qtyLine, rtlLabel]}>
                  الكمية:{" "}
                  <Text style={styles.qtyVal}>{item.quantity}</Text>
                </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  listPad: { paddingVertical: 10, paddingBottom: 24 },
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
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
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
  qtyLine: { fontSize: 14, color: "#475569", marginTop: 4 },
  qtyVal: { fontWeight: "800", color: "#0f172a" },
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
});
