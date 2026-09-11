import contratMd from "./papierCmContrat.en.md?raw";

import { CONTRAT_PAPIER_VERSION } from "./papierCmCompte";

export function texteContratPapier(opts: {
  email: string;
  instagram: string;
  paysEn: string;
}): string {
  const table =
    `| 1 | ${opts.paysEn} | Instagram | ${opts.instagram} | ${opts.email} | on signature |`;
  return contratMd.replace("| 1 | | Instagram | | | |", table);
}

export { CONTRAT_PAPIER_VERSION, contratMd as CONTRAT_PAPIER_SOURCE };
