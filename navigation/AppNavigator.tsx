import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { useAuth } from "../context/AuthContext";
import {
  NotificationProvider,
  useInventoryNotifications,
} from "../context/NotificationContext";
import LoginScreen from "../screens/LoginScreen";
import LastProductScreen from "../screens/LastProductScreen";
import AllProductsScreen from "../screens/AllProductsScreen";
import ManageUsersScreen from "../screens/ManageUsersScreen";

const Drawer = createDrawerNavigator();

function InventoryHeaderLeft() {
  const { setPanelVisible, alertCount } = useInventoryNotifications();
  return (
    <View style={styles.headerLeftWrap}>
      <TouchableOpacity
        onPress={() => setPanelVisible(true)}
        style={styles.bellWrap}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="التنبيهات"
      >
        <Text style={styles.bell}>🔔</Text>
        {alertCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {alertCount > 99 ? "99+" : String(alertCount)}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function DrawerHeaderRight({
  navigation,
}: {
  navigation: { toggleDrawer: () => void };
}) {
  return (
    <TouchableOpacity
      onPress={() => navigation.toggleDrawer()}
      style={styles.headerRightWrap}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Text style={styles.burgerText}>☰</Text>
    </TouchableOpacity>
  );
}

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { user, signOut } = useAuth();

  const Item = ({
    name,
    icon,
    label,
  }: {
    name: string;
    icon: string;
    label: string;
  }) => (
    <TouchableOpacity
      style={styles.drawerItem}
      onPress={() => {
        props.navigation.navigate(name);
        props.navigation.closeDrawer();
      }}
    >
      <Text style={styles.drawerIcon}>{icon}</Text>
      <Text style={styles.drawerLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={styles.drawerScroll}
    >
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerAppName}>تنظيم المنزل</Text>
        <Text style={styles.drawerUser}>👤 {user?.username}</Text>
      </View>

      <Item name="LastProduct" icon="🏷️" label="منيج جديد" />
      <Item name="AllProducts" icon="📋" label="جميع المنتجات" />
      {user?.isAdmin ? (
        <Item name="ManageUsers" icon="👥" label="المستخدمون" />
      ) : null}

      <TouchableOpacity
        style={[styles.drawerItem, styles.logoutRow]}
        onPress={() => {
          props.navigation.closeDrawer();
          signOut();
        }}
      >
        <Text style={styles.drawerIcon}>🚪</Text>
        <Text style={[styles.drawerLabel, styles.logoutText]}>
          تسجيل الخروج
        </Text>
      </TouchableOpacity>
    </DrawerContentScrollView>
  );
}

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(p) => <CustomDrawerContent {...p} />}
      screenOptions={({ navigation }) => ({
        headerShown: true,
        drawerPosition: "right",
        headerTitle: "تنظيم المنزل",
        headerTitleAlign: "center",
        headerStyle: { backgroundColor: "#1a365d" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700", fontSize: 18 },
        headerLeft: () => <InventoryHeaderLeft />,
        headerRight: () => <DrawerHeaderRight navigation={navigation} />,
        drawerStyle: { width: 280 },
      })}
    >
      <Drawer.Screen
        name="LastProduct"
        component={LastProductScreen}
        options={{ title: "منيج جديد" }}
      />
      <Drawer.Screen name="AllProducts" component={AllProductsScreen} />
      <Drawer.Screen name="ManageUsers" component={ManageUsersScreen} />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        <NotificationProvider>
          <MainDrawer />
        </NotificationProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  headerLeftWrap: {
    marginLeft: 10,
    justifyContent: "center",
  },
  headerRightWrap: { marginRight: 14, padding: 4 },
  bellWrap: { padding: 4, position: "relative" },
  bell: { color: "#fff", fontSize: 22 },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  burgerText: { color: "#fff", fontSize: 26, fontWeight: "600" },
  drawerScroll: { paddingTop: 16, paddingBottom: 32 },
  drawerHeader: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    marginBottom: 8,
  },
  drawerAppName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e293b",
  },
  drawerUser: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 6,
  },
  drawerItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  drawerIcon: { fontSize: 22 },
  drawerLabel: { fontSize: 16, color: "#334155", flex: 1, textAlign: "right" },
  logoutRow: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  logoutText: { color: "#b91c1c", fontWeight: "700" },
});
