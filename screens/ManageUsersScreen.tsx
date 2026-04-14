import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import {
  ADMIN_USERNAME,
  createDbUser,
  deleteDbUser,
  getAllDbUsers,
  isRootUsername,
  updateDbUser,
} from "../database";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";

type RowUser = { id: number; username: string };

export default function ManageUsersScreen() {
  const { user, signOut } = useAuth();
  const [list, setList] = useState<RowUser[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");

  const [editTarget, setEditTarget] = useState<RowUser | null>(null);
  const [editName, setEditName] = useState("");
  const [editPass, setEditPass] = useState("");

  const load = useCallback(() => {
    void (async () => {
      setList(await getAllDbUsers());
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openEdit = (item: RowUser) => {
    if (isRootUsername(item.username)) return;
    setEditTarget(item);
    setEditName(item.username);
    setEditPass("");
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditName("");
    setEditPass("");
  };

  const saveEdit = () => {
    if (!editTarget) return;
    if (!editName.trim()) {
      Alert.alert("تنبيه", "أدخل اسم مستخدم");
      return;
    }
    void (async () => {
      const prevNorm = editTarget.username.trim().toLowerCase();
      const nextNorm = editName.trim().toLowerCase();
      const usernameChanged = prevNorm !== nextNorm;

      const ok = await updateDbUser(
        editTarget.id,
        editName.trim(),
        editPass.trim() || undefined
      );
      if (!ok) {
        Alert.alert("خطأ", "تعذر الحفظ — ربما اسم المستخدم مستخدم مسبقاً");
        return;
      }
      if (user?.id === editTarget.id && usernameChanged) {
        await signOut();
        Alert.alert("تم", "تم تغيير اسم المستخدم — سجّل الدخول من جديد");
      } else {
        Alert.alert("تم", "تم تحديث المستخدم");
      }
      closeEdit();
      load();
    })();
  };

  const confirmDelete = (item: RowUser) => {
    if (isRootUsername(item.username)) return;
    Alert.alert(
      "حذف مستخدم",
      `حذف «${item.username}» نهائياً؟`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const ok = await deleteDbUser(item.id);
              if (!ok) {
                Alert.alert("خطأ", "تعذر الحذف");
                return;
              }
              if (user?.id === item.id) {
                await signOut();
                Alert.alert("تم", "تم حذف الحساب");
              } else {
                Alert.alert("تم", "تم حذف المستخدم");
              }
              load();
            })();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const addUser = () => {
    if (!newUser.trim() || !newPass) {
      Alert.alert("تنبيه", "أدخل اسم مستخدم وكلمة مرور للمستخدم الجديد");
      return;
    }
    void (async () => {
      const ok = await createDbUser(newUser.trim(), newPass);
      if (!ok) {
        Alert.alert("خطأ", "تعذر الإنشاء — ربما اسم المستخدم موجود مسبقاً");
        return;
      }
      setNewUser("");
      setNewPass("");
      load();
      Alert.alert("تم", "تم إنشاء المستخدم");
    })();
  };

  const allowed =
    user?.username?.trim().toLowerCase() ===
    ADMIN_USERNAME.trim().toLowerCase();
  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.denied, rtlLabel]}>
          غير مصرح — إدارة المستخدمين غير متاحة لهذا الحساب
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, rtlLabel]}>المستخدمون الحاليون</Text>
      <FlatList
        data={list}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <Text style={[styles.empty, rtlLabel]}>لا مستخدمين في القائمة</Text>
        }
        renderItem={({ item }) => {
          const root = isRootUsername(item.username);
          return (
            <View style={[styles.row, root && styles.rowRoot]}>
              {!root ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => openEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel="تعديل المستخدم"
                  >
                    <Text style={styles.editBtnText}>تعديل</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.delBtn}
                    onPress={() => confirmDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel="حذف المستخدم"
                  >
                    <Text style={styles.delBtnText}>حذف</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.rowMain}>
                <View style={styles.nameWithIcon}>
                  <Text
                    style={[styles.rowText, rtlLabel]}
                    numberOfLines={1}
                  >
                    {item.username}
                  </Text>
                  <Text style={styles.rowIcon}>{root ? "🔒" : "👤"}</Text>
                </View>
                {root ? (
                  <Text style={[styles.rootHint, rtlLabel]}>
                    حساب المدير — لا يمكن تعديله أو حذفه
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Text style={[styles.sectionTitle, rtlLabel]}>إضافة مستخدم</Text>
      <Text style={[styles.note, rtlLabel]}>
        فقط المسؤول يمكنه إنشاء مستخدمين جدد (بدون صلاحية إنشاء مستخدمين).
      </Text>
      <TextInput
        style={[styles.input, rtlInput]}
        placeholder="اسم المستخدم الجديد"
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        value={newUser}
        onChangeText={setNewUser}
      />
      <TextInput
        style={[styles.input, rtlInput]}
        placeholder="كلمة المرور"
        placeholderTextColor="#94a3b8"
        secureTextEntry
        value={newPass}
        onChangeText={setNewPass}
      />
      <TouchableOpacity style={styles.addBtn} onPress={addUser}>
        <Text style={styles.addBtnText}>➕ إنشاء مستخدم</Text>
      </TouchableOpacity>

      <Modal
        visible={editTarget != null}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeEdit} />
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, rtlLabel]}>تعديل مستخدم</Text>
            <TextInput
              style={[styles.input, rtlInput]}
              placeholder="اسم المستخدم"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.input, rtlInput]}
              placeholder="كلمة مرور جديدة (اتركه فارغاً للإبقاء على الحالية)"
              placeholderTextColor="#94a3b8"
              secureTextEntry
              value={editPass}
              onChangeText={setEditPass}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeEdit}>
                <Text style={styles.modalCancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveEdit}>
                <Text style={styles.modalSaveText}>حفظ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  denied: { fontSize: 16, color: "#b91c1c", textAlign: "center" },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 8,
    color: "#1e293b",
  },
  note: { fontSize: 13, color: "#64748b", marginBottom: 10, lineHeight: 20 },
  empty: { color: "#94a3b8", padding: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 10,
    // Keep actions physically on the left and name+icon on the right (Arabic UI is often RTL).
    direction: "ltr",
  },
  rowRoot: { backgroundColor: "#f8fafc" },
  rowIcon: { fontSize: 20 },
  rowMain: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-end",
  },
  nameWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  rowText: {
    fontSize: 16,
    color: "#0f172a",
    flexShrink: 1,
    maxWidth: "100%",
  },
  rootHint: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 4,
    alignSelf: "stretch",
    textAlign: "right",
  },
  rowActions: { flexDirection: "row", gap: 8 },
  editBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#e0e7ff",
  },
  editBtnText: { color: "#4338ca", fontWeight: "600", fontSize: 14 },
  delBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
  },
  delBtnText: { color: "#b91c1c", fontWeight: "600", fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  addBtn: {
    backgroundColor: "#7c3aed",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  addBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    zIndex: 1,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
    color: "#0f172a",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  modalCancelText: { color: "#64748b", fontSize: 16, fontWeight: "600" },
  modalSave: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#7c3aed",
  },
  modalSaveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
