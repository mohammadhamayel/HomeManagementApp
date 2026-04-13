import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { createDbUser, getAllDbUsers } from "../database";
import { rtlInput, rtlLabel } from "../theme/rtlStyles";

export default function ManageUsersScreen() {
  const { user } = useAuth();
  const [list, setList] = useState<{ id: number; username: string }[]>([]);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");

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

  if (!user?.isAdmin) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.denied, rtlLabel]}>
          غير مصرح — هذه الصفحة للمسؤول فقط
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
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowIcon}>👤</Text>
            <Text style={[styles.rowText, rtlLabel]}>{item.username}</Text>
          </View>
        )}
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
  },
  rowIcon: { fontSize: 20 },
  rowText: { fontSize: 16 },
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
});
