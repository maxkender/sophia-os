import logoArtura from "@/assets/applications/artura.png";
import logoAtala from "@/assets/applications/atala.png";
import logoMicabo from "@/assets/applications/micabo.png";
import logoSophia from "@/assets/applications/sophia.png";
import logoUnswipe from "@/assets/applications/unswipe.png";

/**
 * Le logo de chaque application : son icône d'App Store, en 128 × 128, plein
 * cadre (l'arrondi vient du CSS). Une application du catalogue
 * (`catalogueApplications.ts`) doit avoir sa ligne ici :
 * `catalogueApplications.test.ts` le vérifie. Sans logo, une application
 * prend une pastille à son initiale (`LogoApplication.tsx`).
 */
export const LOGOS: Record<string, string> = {
  sophia: logoSophia,
  micabo: logoMicabo,
  unswipe: logoUnswipe,
  atala: logoAtala,
  artura: logoArtura,
};
