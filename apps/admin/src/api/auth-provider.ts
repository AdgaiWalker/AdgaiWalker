import type { AuthProvider } from "@refinedev/core";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, requestJson, setAdminToken } from "./http";
import type { OpsCapabilities } from "@walker/shared";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 15_000, refetchOnWindowFocus: false },
  },
});
export function clearPrivateSession() {
  setAdminToken();
  queryClient.clear();
}
export const authProvider: AuthProvider = {
  async login({ username, token }: { username?: string; token?: string }) {
    setAdminToken(token, username);
    try {
      await requestJson<OpsCapabilities>("/ops/capabilities");
      return { success: true };
    } catch (error) {
      clearPrivateSession();
      return { success: false, error: error as Error };
    }
  },
  async logout() {
    clearPrivateSession();
    return { success: true };
  },
  async check() {
    try {
      await requestJson<OpsCapabilities>("/ops/capabilities");
      return { authenticated: true };
    } catch (error) {
      return { authenticated: false, error: error as Error };
    }
  },
  async onError(error: unknown) {
    return error instanceof ApiError && error.statusCode === 401
      ? { logout: true }
      : {};
  },
};
