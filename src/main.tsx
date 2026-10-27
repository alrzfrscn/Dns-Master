import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/oxanium/latin-500.css";
import "@fontsource/oxanium/latin-600.css";
import "@fontsource/oxanium/latin-700.css";
import "@fontsource/sora/latin-300.css";
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-500.css";
import "@fontsource/sora/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";

import "./index.css";
import App from "./App";
import { AppProvider } from "./store/AppStore";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing");

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);
