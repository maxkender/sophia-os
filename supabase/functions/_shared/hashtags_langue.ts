/**
 * Jeu de hashtags de repli, par langue de publication.
 *
 * Copie Deno de `src/features/moteur/hashtagsLangue.ts`, à garder synchro :
 * `hashtagsLangue.test.ts` compare les deux fichiers et échoue s'ils divergent.
 * Les tests vivent côté front.
 *
 * Sert UNIQUEMENT quand la traduction n'a pas rendu de légende (JSON modèle
 * illisible, deck cuit avant que les hashtags soient stockés). Le cas nominal
 * reste la légende produite avec le deck.
 *
 * ⚠️ Toute langue de `LANGUES_CIBLES` doit avoir son jeu. Une langue absente
 * retombait sur le français : des comptes tchèques, néerlandais, grecs,
 * hongrois, polonais, roumains et suédois ont publié `#apprendre
 * #culturegenerale #developpementpersonnel` sur TikTok.
 */

export const HASHTAGS_PAR_LANGUE: Record<string, string[]> = {
  fr: ["#apprendre", "#culturegenerale", "#developpementpersonnel", "#booktok", "#pourtoi", "#savoir", "#apprendresurtiktok", "#culture", "#motivation", "#connaissances", "#fyp", "#anecdotes"],
  en: ["#learning", "#selfimprovement", "#booktok", "#foryou", "#knowledge", "#learnontiktok", "#growthmindset", "#facts", "#motivation", "#studytok", "#fyp", "#smart"],
  de: ["#lernen", "#selbstverbesserung", "#booktok", "#fürdich", "#wissen", "#bildung", "#persönlichkeitsentwicklung", "#motivation", "#fakten", "#allgemeinwissen", "#fyp", "#lernenmittiktok"],
  it: ["#imparare", "#crescitapersonale", "#booktok", "#perte", "#cultura", "#conoscenza", "#sapere", "#motivazione", "#curiosità", "#studytok", "#fyp", "#impararesutiktok"],
  es: ["#aprender", "#desarrollopersonal", "#booktok", "#parati", "#cultura", "#conocimiento", "#superacionpersonal", "#motivacion", "#datoscuriosos", "#aprendeentiktok", "#fyp", "#sabiduria"],
  pt: ["#aprender", "#desenvolvimentopessoal", "#booktok", "#paravoce", "#cultura", "#conhecimento", "#crescimento", "#motivacao", "#curiosidades", "#aprendanotiktok", "#fyp", "#sabedoria"],
  cs: ["#učení", "#osobnírozvoj", "#booktok", "#proTebe", "#vědomosti", "#vzdělávání", "#motivace", "#zajímavosti", "#kultura", "#fyp", "#nauč_se", "#chytré"],
  nl: ["#leren", "#persoonlijkeontwikkeling", "#booktok", "#voorjou", "#kennis", "#lerenoptiktok", "#motivatie", "#weetjes", "#cultuur", "#fyp", "#slim", "#algemenekennis"],
  el: ["#μαθηση", "#αυτοβελτιωση", "#booktok", "#γιαεσενα", "#γνωση", "#μαθαινωστοtiktok", "#κινητρο", "#περιεργεια", "#πολιτισμος", "#fyp", "#συμβουλες", "#εξυπνο"],
  hu: ["#tanulás", "#önfejlesztés", "#booktok", "#neked", "#tudás", "#tanuljtiktokon", "#motiváció", "#érdekesség", "#kultúra", "#fyp", "#tippek", "#okos"],
  pl: ["#nauka", "#rozwojosobisty", "#booktok", "#dlaciebie", "#wiedza", "#uczsienatiktoku", "#motywacja", "#ciekawostki", "#kultura", "#fyp", "#porady", "#madrze"],
  ro: ["#invatare", "#dezvoltarepersonala", "#booktok", "#pentrutine", "#cunoastere", "#invatapetiktok", "#motivatie", "#curiozitati", "#cultura", "#fyp", "#sfaturi", "#inteligent"],
  sv: ["#lärande", "#personligutveckling", "#booktok", "#fördig", "#kunskap", "#lärpåtiktok", "#motivation", "#fakta", "#kultur", "#fyp", "#tips", "#smart"],
  tr: ["#öğrenme", "#kişiselgelişim", "#booktok", "#keşfet", "#bilgi", "#tiktokteöğren", "#motivasyon", "#bilgiler", "#kültür", "#fyp", "#ipuçları", "#zeka"],
  da: ["#laering", "#personligudvikling", "#booktok", "#foryou", "#viden", "#laerpaatiktok", "#motivation", "#fakta", "#kultur", "#fyp", "#videnontiktok", "#smart"],
  no: ["#laere", "#personligutvikling", "#booktok", "#foryou", "#kunnskap", "#laerpatiktok", "#motivasjon", "#fakta", "#kultur", "#fyp", "#laerontiktok", "#smart"],
  ru: ["#обучение", "#саморазвитие", "#букток", "#рек", "#знания", "#учисьвтикток", "#мотивация", "#факты", "#культура", "#fyp", "#полезное", "#умное"],
  hr: ["#ucenje", "#osobnirazvoj", "#booktok", "#zatijeb", "#znanje", "#ucinaTikToku", "#motivacija", "#cinjenice", "#kultura", "#fyp", "#savjeti", "#pametno"],
  sl: ["#ucenje", "#osebnirazvoj", "#booktok", "#zate", "#znanje", "#ucisenatiktoku", "#motivacija", "#dejstva", "#kultura", "#fyp", "#nasveti", "#pametno"],
  sk: ["#ucenie", "#osobnyrozvoj", "#booktok", "#preteba", "#vedomosti", "#ucsanatiktoku", "#motivacia", "#fakty", "#kultura", "#fyp", "#tipy", "#inteligentne"],
  sr: ["#ucenje", "#licnirazvoj", "#booktok", "#zatijeb", "#znanje", "#ucinaTikToku", "#motivacija", "#cinjenice", "#kultura", "#fyp", "#saveti", "#pametno"],
  ar: ["#تعلم", "#تطوير_ذاتي", "#booktok", "#fyp", "#معرفة", "#تعلم_على_تيك_توك", "#تحفيز", "#حقائق", "#ثقافة", "#معلومات", "#نصيحة", "#ذكاء"],
  he: ["#למידה", "#פיתוח_אישי", "#booktok", "#fyp", "#ידע", "#ללמוד_בטיקטוק", "#מוטיבציה", "#עובדות", "#תרבות", "#טיפ", "#חכם", "#foryou"],
  fi: ["#oppiminen", "#itsensakehittaminen", "#booktok", "#sinulle", "#tieto", "#opiTikTokissa", "#motivaatio", "#faktat", "#kulttuuri", "#fyp", "#vinkit", "#alykas"],
  et: ["#oppimine", "#eneseareng", "#booktok", "#sinule", "#teadmised", "#opitiktokis", "#motivatsioon", "#faktid", "#kultuur", "#fyp", "#nipid", "#nutikas"],
};

/**
 * MAX 3 hashtags de la langue demandée, variés par `graine` (offset déterministe)
 * — pas deux posts d'affilée avec exactement la même description.
 *
 * Une langue inconnue retombe sur l'anglais, jamais sur le français : un jeu
 * anglais sur un compte étranger passe encore, du français non.
 */
export function hashtagsPour(langue: string, graine: string): string {
  const pool = HASHTAGS_PAR_LANGUE[langue] ?? HASHTAGS_PAR_LANGUE.en;
  let h = 0;
  for (const c of graine) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const debut = h % pool.length;
  const choix: string[] = [];
  for (let i = 0; i < 3 && i < pool.length; i += 1) choix.push(pool[(debut + i) % pool.length]);
  return choix.join(" ");
}
