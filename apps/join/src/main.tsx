import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { chargerLangue, estRtl, langueInitiale } from "./i18n";
import "./styles.css";

// La langue de départ est chargée avant le premier rendu (pas d'anglais qui clignote), avec son sens d'écriture.
const langue = langueInitiale();
document.documentElement.lang = langue;
document.documentElement.dir = estRtl(langue) ? "rtl" : "ltr";
chargerLangue(langue).then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
