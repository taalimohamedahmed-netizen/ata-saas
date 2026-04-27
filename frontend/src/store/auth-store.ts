import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  tenantId: string | null;
  tenantName: string | null;
  isAuthenticated: boolean;
  setAuth: (token: string, tenantId: string, name: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      tenantId: null,
      tenantName: null,
      isAuthenticated: false,
      setAuth: (token, tenantId, tenantName) => {
        // Also save token to localStorage for the axios interceptor
        if (typeof window !== "undefined") {
          localStorage.setItem("ata_token", token);
        }
        set({ token, tenantId, tenantName, isAuthenticated: true });
      },
      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("ata_token");
        }
        set({
          token: null,
          tenantId: null,
          tenantName: null,
          isAuthenticated: false,
        });
      },
    }),
    { name: "ata-auth" },
  ),
);
