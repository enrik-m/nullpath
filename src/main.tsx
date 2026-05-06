import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

// Vercel Analytics — script-only, no cookies, no PII. The component
// is a no-op when not deployed on Vercel (or when the env var
// `VERCEL_ANALYTICS_ID` isn't set), so it's safe to leave mounted
// in dev / self-hosted builds.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
      <Analytics />
    </ErrorBoundary>
  </React.StrictMode>,
);
