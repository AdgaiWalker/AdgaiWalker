import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { queryClient } from "./api/session";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { SessionGate } from "./app/SessionGate";
import { AppRoutes } from "./app/router";
import "./styles/tokens.css";

// 兜底：发版后懒加载旧 chunk 404 时安全重载 1 次（sessionStorage 防死循环）
window.addEventListener("vite:preloadError", () => {
  const key = "walker:preload-reloaded";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

const router = createBrowserRouter([
  {
    path: "/*",
    element: (
      <AppErrorBoundary scope="root">
        <QueryClientProvider client={queryClient}>
          <SessionGate>
            <AppRoutes />
          </SessionGate>
        </QueryClientProvider>
      </AppErrorBoundary>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
