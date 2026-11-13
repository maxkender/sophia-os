import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { initSentry } from "@/lib/sentry";
import { protegerContreTraduction } from "@/lib/traductionNavigateur";
import "./index.css";

initSentry();
// Avant le premier rendu : la traduction du navigateur peut démarrer dès l'affichage.
protegerContreTraduction();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
