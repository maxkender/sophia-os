export const SLUG_SOPHIA = "sophia";
export const SLUG_MICABO = "micabo";

export type ApplicationRow = {
  id: string;
  slug: string;
  nom: string;
};

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

export function normaliserSlug(valeur: unknown): string {
  return String(valeur ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function estSlugSophia(slug: string | null | undefined): boolean {
  return (slug ?? SLUG_SOPHIA) === SLUG_SOPHIA;
}

/**
 * Application d'un import : la source l'emporte toujours, puis l'id explicite
 * (lien isolé), puis Sophia. Un compte Micabo ne doit jamais retomber sur Sophia.
 */
export function resoudreApplicationImport(opts: {
  sourceApplicationId?: string | null;
  explicitApplicationId?: string | null;
  fallbackId: string;
}): string {
  const source = String(opts.sourceApplicationId ?? "").trim();
  if (source) return source;
  const explicit = String(opts.explicitApplicationId ?? "").trim();
  if (explicit) return explicit;
  return opts.fallbackId;
}

export function clePromptPertinence(slug: string | null | undefined): string {
  return estSlugSophia(slug) ? "pertinence" : `pertinence_${normaliserSlug(slug)}`;
}

export function clePromptPlacement(slug: string | null | undefined): string {
  return estSlugSophia(slug) ? "placement_sophia" : `placement_${normaliserSlug(slug)}`;
}

/**
 * Texte de repli posé sur la dernière slide quand le VRAI placement a échoué.
 *
 * ⚠️ Toute langue de `LANGUES_CIBLES` doit avoir sa version. Une langue absente
 * retombait sur l'anglais : un deck arabe ou hébreu recevait une phrase latine
 * LTR au milieu d'un diaporama RTL. `placementParDefaut.test.ts` interdit
 * désormais ce trou.
 */
export function placementParDefaut(langue: string, slug = SLUG_SOPHIA): string {
  if (slug === SLUG_MICABO) {
    const par: Record<string, string> = {
      fr: "transforme tes cours en flashcards et révise 10 minutes par jour. micabo est top pour ça, il les crée à partir de tes notes.",
      en: "turn your notes into flashcards and review 10 minutes a day. micabo is great for that, it builds them from your notes.",
      de: "mach aus deinen notizen flashcards und wiederhole 10 minuten am tag. micabo ist super dafür, es erstellt sie aus deinen unterlagen.",
      es: "pasa tus apuntes a flashcards y repasa 10 minutos al día. micabo va genial para eso, las crea desde tus notas.",
      it: "trasforma i tuoi appunti in flashcards e ripassa 10 minuti al giorno. micabo è top per questo, le crea dalle tue note.",
      pt: "transforma os teus apontamentos em flashcards e revê 10 minutos por dia. o micabo é ótimo para isso, cria-os a partir das tuas notas.",
      cs: "proměň své poznámky v kartičky a opakuj si 10 minut denně. micabo je na to super, vytvoří je z tvých poznámek.",
      nl: "maak van je aantekeningen flashcards en herhaal 10 minuten per dag. micabo is daar top voor, het maakt ze uit je notities.",
      el: "μετάτρεψε τις σημειώσεις σου σε flashcards και κάνε επανάληψη 10 λεπτά τη μέρα. το micabo είναι τέλειο γι' αυτό, τις φτιάχνει από τις σημειώσεις σου.",
      hu: "alakítsd a jegyzeteidet kártyákká és ismételj napi 10 percet. a micabo tökéletes erre, a jegyzeteidből készíti el őket.",
      pl: "zamień notatki w fiszki i powtarzaj 10 minut dziennie. micabo jest do tego super, tworzy je z twoich notatek.",
      ro: "transformă-ți notițele în flashcards și repetă 10 minute pe zi. micabo e super pentru asta, le creează din notițele tale.",
      sv: "gör om dina anteckningar till flashcards och repetera 10 minuter om dagen. micabo är toppen för det, appen skapar dem från dina anteckningar.",
      tr: "notlarını flashcard'a çevir ve günde 10 dakika tekrar et. micabo bunun için harika, kartları notlarından oluşturuyor.",
      da: "lav dine noter om til flashcards og repetér 10 minutter om dagen. micabo er super til det, den laver dem ud fra dine noter.",
      no: "gjør notatene dine om til flashcards og repeter 10 minutter om dagen. micabo er topp til det, den lager dem fra notatene dine.",
      ru: "преврати свои конспекты в карточки и повторяй по 10 минут в день. micabo отлично с этим справляется, он создаёт их из твоих заметок.",
      hr: "pretvori svoje bilješke u kartice i ponavljaj 10 minuta dnevno. micabo je super za to, izrađuje ih iz tvojih bilježaka.",
      sl: "spremeni svoje zapiske v kartice in ponavljaj 10 minut na dan. micabo je odličen za to, ustvari jih iz tvojih zapiskov.",
      sk: "premeň si poznámky na kartičky a opakuj si 10 minút denne. micabo je na to skvelé, vytvorí ich z tvojich poznámok.",
      sr: "pretvori svoje beleške u kartice i ponavljaj 10 minuta dnevno. micabo je super za to, pravi ih od tvojih beleški.",
      ar: "حوّل ملخصاتك إلى بطاقات تعليمية وراجع 10 دقائق يوميًا. تطبيق micabo ممتاز لذلك، فهو ينشئها من ملاحظاتك.",
      he: "הפוך את הסיכומים שלך לכרטיסיות וחזור עליהן 10 דקות ביום. micabo מעולה לזה, הוא יוצר אותן מהרשומות שלך.",
      fi: "muuta muistiinpanosi korteiksi ja kertaa 10 minuuttia päivässä. micabo on siihen mahtava, se luo ne muistiinpanoistasi.",
      et: "muuda oma märkmed kaartideks ja korda 10 minutit päevas. micabo sobib selleks suurepäraselt, ta loob need sinu märkmetest.",
    };
    return par[langue] ?? par.en;
  }
  const par: Record<string, string> = {
    fr: "Envie d'en apprendre plus chaque jour ? L'appli Sophia t'apprend une culture générale de dingue en quelques minutes. Teste-la 👀",
    en: "Want to learn something new every day? The Sophia app teaches you wild general knowledge in minutes. Give it a try 👀",
    es: "¿Quieres aprender algo nuevo cada día? La app Sophia te enseña cultura general increíble en minutos. Pruébala 👀",
    de: "Lust, jeden Tag etwas Neues zu lernen? Die Sophia-App bringt dir in wenigen Minuten richtig gutes Allgemeinwissen bei. Probier's aus 👀",
    it: "Vuoi imparare qualcosa di nuovo ogni giorno? L'app Sophia ti insegna una cultura generale pazzesca in pochi minuti. Provala 👀",
    pt: "Queres aprender algo novo todos os dias? A app Sophia ensina-te cultura geral incrível em poucos minutos. Experimenta 👀",
    cs: "Chceš se každý den naučit něco nového? Aplikace Sophia tě naučí skvělé všeobecné znalosti za pár minut. Vyzkoušej ji 👀",
    nl: "Wil je elke dag iets nieuws leren? De Sophia-app leert je in een paar minuten waanzinnige algemene kennis. Probeer het 👀",
    el: "Θέλεις να μαθαίνεις κάτι νέο κάθε μέρα; Η εφαρμογή Sophia σου μαθαίνει απίστευτη γενική γνώση σε λίγα λεπτά. Δοκίμασέ την 👀",
    hu: "Szeretnél minden nap valami újat tanulni? A Sophia app perceken belül vad általános műveltséget ad. Próbáld ki 👀",
    pl: "Chcesz codziennie uczyć się czegoś nowego? Aplikacja Sophia uczy szalonej wiedzy ogólnej w kilka minut. Wypróbuj 👀",
    ro: "Vrei să înveți ceva nou în fiecare zi? Aplicația Sophia te învață cultură generală tare în câteva minute. Încearc-o 👀",
    sv: "Vill du lära dig något nytt varje dag? Sophia-appen lär dig galen allmänbildning på några minuter. Testa den 👀",
    tr: "Her gün yeni bir şey öğrenmek ister misin? Sophia uygulaması dakikalar içinde efsane genel kültür öğretir. Dene 👀",
    da: "Har du lyst til at lære noget nyt hver dag? Sophia-appen giver dig vild almenviden på få minutter. Prøv den 👀",
    no: "Har du lyst til å lære noe nytt hver dag? Sophia-appen gir deg vanvittig allmennkunnskap på få minutter. Prøv den 👀",
    ru: "Хочешь узнавать что-то новое каждый день? Приложение Sophia даёт крутую эрудицию за пару минут. Попробуй 👀",
    hr: "Želiš svaki dan naučiti nešto novo? Aplikacija Sophia te za par minuta nauči ludo opće znanje. Isprobaj je 👀",
    sl: "Želiš se vsak dan naučiti kaj novega? Aplikacija Sophia te v nekaj minutah nauči noro splošno znanje. Preizkusi jo 👀",
    sk: "Chceš sa každý deň naučiť niečo nové? Aplikácia Sophia ťa za pár minút naučí skvelé všeobecné vedomosti. Vyskúšaj ju 👀",
    sr: "Želiš da svaki dan naučiš nešto novo? Aplikacija Sophia te za par minuta nauči ludo opšte znanje. Isprobaj je 👀",
    ar: "هل تريد أن تتعلّم شيئًا جديدًا كل يوم؟ تطبيق Sophia يمنحك ثقافة عامة مذهلة في دقائق. جرّبه 👀",
    he: "רוצה ללמוד משהו חדש כל יום? האפליקציה Sophia מלמדת אותך ידע כללי מטורף תוך כמה דקות. תנסה אותה 👀",
    fi: "Haluatko oppia jotain uutta joka päivä? Sophia-sovellus opettaa sinulle huikeaa yleissivistystä muutamassa minuutissa. Kokeile 👀",
    et: "Tahad iga päev midagi uut õppida? Sophia äpp annab sulle mõne minutiga vägevaid üldteadmisi. Proovi järele 👀",
  };
  return par[langue] ?? par.en;
}

/** Langues cibles sans texte de repli — doit toujours être vide (test). */
export function languesSansPlacementParDefaut(
  languesCibles: readonly string[],
  slug = SLUG_SOPHIA,
): string[] {
  const reference = placementParDefaut("en", slug);
  return languesCibles.filter(
    (l) => l !== "en" && placementParDefaut(l, slug) === reference,
  );
}

export async function applicationParSlug(
  supabase: Supabase,
  slug: unknown,
): Promise<ApplicationRow | null> {
  const cle = normaliserSlug(slug) || SLUG_SOPHIA;
  const { data } = await supabase
    .from("applications")
    .select("id, slug, nom")
    .eq("slug", cle)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

export async function applicationParId(
  supabase: Supabase,
  id: string | null | undefined,
): Promise<ApplicationRow | null> {
  if (!id) return applicationParSlug(supabase, SLUG_SOPHIA);
  const { data } = await supabase
    .from("applications")
    .select("id, slug, nom")
    .eq("id", id)
    .maybeSingle();
  return (data as ApplicationRow | null) ?? null;
}

export async function applicationSophia(supabase: Supabase): Promise<ApplicationRow> {
  const app = await applicationParSlug(supabase, SLUG_SOPHIA);
  if (!app) throw new Error("Application Sophia introuvable");
  return app;
}

export async function resoudreApplication(
  supabase: Supabase,
  input: { application_id?: unknown; application_slug?: unknown },
): Promise<ApplicationRow> {
  const id = String(input.application_id ?? "").trim();
  if (id) {
    const parId = await applicationParId(supabase, id);
    if (parId) return parId;
  }
  const slug = normaliserSlug(input.application_slug);
  if (slug) {
    const parSlug = await applicationParSlug(supabase, slug);
    if (parSlug) return parSlug;
  }
  return applicationSophia(supabase);
}
