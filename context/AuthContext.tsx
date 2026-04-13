import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initDB, verifyLogin, validateSessionUser } from "../database";

const STORAGE_KEY = "@home_mgmt_session";

export type SessionUser = {
  id: number;
  username: string;
  isAdmin: boolean;
};

type AuthContextValue = {
  user: SessionUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        await initDB();
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SessionUser;
          if (parsed?.id && parsed?.username) {
            if (await validateSessionUser(parsed.id, parsed.username)) {
              setUser(parsed);
            } else {
              await AsyncStorage.removeItem(STORAGE_KEY);
            }
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const row = await verifyLogin(username, password);
    if (!row) return false;
    const session: SessionUser = {
      id: row.id,
      username: row.username,
      isAdmin: row.isAdmin,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setUser(session);
    return true;
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
