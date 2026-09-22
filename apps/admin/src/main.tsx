import React from "react";
import ReactDOM from "react-dom/client";
import { Refine } from "@refinedev/core";
import { BrowserRouter } from "react-router-dom";
import { dataProvider } from "./api/data-provider";
import { authProvider, queryClient } from "./api/auth-provider";
import { SessionGate } from "./app/SessionGate";
import { AppRoutes } from "./app/router";
import "./styles/tokens.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Refine
        dataProvider={dataProvider}
        authProvider={authProvider}
        resources={[{ name: "content" }, { name: "agents" }, { name: "runs" }]}
        options={{
          disableTelemetry: true,
          reactQuery: { clientConfig: queryClient },
        }}
      >
        <SessionGate>
          <AppRoutes />
        </SessionGate>
      </Refine>
    </BrowserRouter>
  </React.StrictMode>,
);
