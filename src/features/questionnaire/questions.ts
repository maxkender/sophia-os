/**
 * 15/11 (Max) : le questionnaire « top posters ». 20/11 : la définition est partagée avec la fonction questionnaire
 * (bonus du questionnaire terminé) : supabase/functions/_shared/questionnaire_questions.ts.
 */
export * from "../../../supabase/functions/_shared/questionnaire_questions";

/** Les codes pays ISO 3166-1, affichés en anglais. */
const CODES = (
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ " +
  "DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI XK KW KG " +
  "LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH " +
  "PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE " +
  "GB US UY UZ VU VA VE VN YE ZM ZW"
).split(" ");

let paysCache: string[] | null = null;
export function listePays(): string[] {
  if (paysCache) return paysCache;
  let noms: string[];
  try {
    const d = new Intl.DisplayNames(["en"], { type: "region" });
    noms = CODES.map((c) => d.of(c) ?? c);
  } catch {
    noms = CODES;
  }
  paysCache = [...new Set(noms)].sort((a, b) => a.localeCompare(b, "en"));
  return paysCache;
}

/** 20/11 : les pays affichés dans la langue du posteur ; la valeur gardée reste le nom anglais. */
export function paysOptions(langue = "en"): { valeur: string; libelle: string }[] {
  let en: Intl.DisplayNames | null = null;
  let loc: Intl.DisplayNames | null = null;
  try {
    en = new Intl.DisplayNames(["en"], { type: "region" });
    loc = new Intl.DisplayNames([langue, "en"], { type: "region" });
  } catch {
    /* noms anglais */
  }
  const vus = new Set<string>();
  const out: { valeur: string; libelle: string }[] = [];
  for (const c of CODES) {
    const valeur = en?.of(c) ?? c;
    if (vus.has(valeur)) continue;
    vus.add(valeur);
    out.push({ valeur, libelle: loc?.of(c) ?? valeur });
  }
  return out.sort((a, b) => a.libelle.localeCompare(b.libelle, langue));
}
