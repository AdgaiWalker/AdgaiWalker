import { QueryClient } from "@tanstack/react-query";
import type { OpsCapabilities } from "@walker/shared";
import { requestJson, setAdminToken } from "./http";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false },
  },
});

export function clearPrivateSession() {
  setAdminToken();
  queryClient.clear();
}

export const adminSession = {
  async login({ username, token }: { username?: string; token?: string }) {
    setAdminToken(token, username);
    try {
      await requestJson<OpsCapabilities>("/ops/capabilities");
      return { success: true as const };
    } catch (error) {
      clearPrivateSession();
      return { success: false as const, error: error as Error };
    }
  },
  async logout() {
    clearPrivateSession();
    return { success: true as const };
  },
  async check() {
    try {
      await requestJson<OpsCapabilities>("/ops/capabilities");
      return { authenticated: true as const };
    } catch (error) {
      return { authenticated: false as const, error: error as Error };
    }
  },
};
