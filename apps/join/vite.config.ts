import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// App « Join » (parcours posteur) : autonome, sans lien avec l'OS à la racine du dépôt.
export default defineConfig({
  plugins: [react()],
});
