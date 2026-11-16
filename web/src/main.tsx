import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/epilogue";
import "@fontsource-variable/onest";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/pixelify-sans";
import "./styles.css";

import App from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
