import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(null); // { configured, authenticated }
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setError("");
    return api("/api/auth/status")
      .then((next) => setStatus(next))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler(() => setStatus((prev) => (prev ? { ...prev, authenticated: false } : prev)));
    return () => setUnauthorizedHandler(null);
  }, []);

  async function setup(password) {
    await api("/api/auth/setup", { method: "POST", body: { password } });
    await refresh();
  }

  async function login(password) {
    await api("/api/auth/login", { method: "POST", body: { password } });
    await refresh();
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    await refresh();
  }

  async function changePassword(currentPassword, newPassword) {
    await api("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
  }

  return (
    <AuthContext.Provider value={{ status, error, refresh, setup, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
