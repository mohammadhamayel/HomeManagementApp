import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getAllProducts } from "../database";
import {
  syncInventoryNotificationsFromProducts,
  type InventoryNotificationItem,
} from "../inventoryNotifications";

type NotificationContextValue = {
  notifications: InventoryNotificationItem[];
  panelVisible: boolean;
  setPanelVisible: (v: boolean) => void;
  refreshNotifications: () => Promise<void>;
  /** Number of alerts currently stored (includes prior days). */
  alertCount: number;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined
);

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<InventoryNotificationItem[]>(
    []
  );
  const [panelVisible, setPanelVisible] = useState(false);

  const refreshNotifications = useCallback(async () => {
    const products = await getAllProducts();
    const next = await syncInventoryNotificationsFromProducts(products);
    setNotifications(next);
  }, []);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") void refreshNotifications();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refreshNotifications]);

  const alertCount = notifications.length;

  const value = useMemo(
    () => ({
      notifications,
      panelVisible,
      setPanelVisible,
      refreshNotifications,
      alertCount,
    }),
    [notifications, panelVisible, refreshNotifications, alertCount]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationsPanelModal
        visible={panelVisible}
        onClose={() => setPanelVisible(false)}
        items={notifications}
      />
    </NotificationContext.Provider>
  );
}

function NotificationsPanelModal({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: InventoryNotificationItem[];
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.panelTitle, styles.rtl]}>التنبيهات</Text>
          <ScrollView
            style={styles.panelScroll}
            keyboardShouldPersistTaps="handled"
          >
            {items.length === 0 ? (
              <Text style={[styles.empty, styles.rtl]}>لا توجد تنبيهات</Text>
            ) : (
              items.map((n) => (
                <View key={n.id} style={styles.notifRow}>
                  <Text style={[styles.notifTitle, styles.rtl]}>{n.title}</Text>
                  <Text style={[styles.notifDesc, styles.rtl]}>
                    {n.description}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>إغلاق</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function useInventoryNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useInventoryNotifications must be inside NotificationProvider");
  }
  return ctx;
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-start",
    paddingTop: 56,
    paddingHorizontal: 16,
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 14,
    maxHeight: "72%",
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 12,
    textAlign: "right",
  },
  panelScroll: { maxHeight: 420 },
  empty: {
    textAlign: "center",
    color: "#64748b",
    paddingVertical: 24,
    fontSize: 15,
  },
  notifRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingVertical: 12,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e40af",
    textAlign: "right",
  },
  notifDesc: {
    fontSize: 14,
    color: "#334155",
    marginTop: 6,
    textAlign: "right",
    lineHeight: 22,
  },
  closeBtn: {
    marginTop: 12,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeBtnText: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
  rtl: { writingDirection: "rtl" },
});
