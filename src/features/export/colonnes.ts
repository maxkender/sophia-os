/**
 * Les colonnes de l'export : noms anglais en snake_case, et leur sens en une
 * ligne (repris dans « Copier pour Claude »).
 */

export const COLONNES_RESUME = {
  hm: "Hiring manager (first name).",
  poster_name: "Creator's full name.",
  country: "Account country code.",
  language: "Account language code.",
  tiktok_handle: "TikTok handle, without @.",
  tiktok_url: "Link to the TikTok profile.",
  cohort_monday: "Monday of the account's first posting week (YYYY-MM-DD).",
  posting_week_number: "Posting week number since the first post (1 = first week).",
  stage: "Stage, as shown in the OS (e.g. Posting · week 3, Warming up, Inactive).",
  quality: "Quality tag shown in the OS (Good, Poor views, Shadowban); empty if not posting yet.",
  accounts_count: "Active TikTok accounts of the creator.",
  posts_expected_week: "Posts planned over the export period, up to today.",
  posts_done_week: "Posts published (link pasted) over the export period.",
  posts_missed_week: "Posts with no link on a past day over the export period.",
  links_missing_week: "Posts with no link on days the creator published another post (forgotten link).",
  posts_done_today: "Posts published today.",
  posts_expected_today: "Posts planned today.",
  last_post_date: "Date of the last published post (YYYY-MM-DD).",
  views_median_7d: "Median views of measured posts over the last 7 days (up to yesterday).",
  views_best_7d: "Best views of a measured post over the last 7 days.",
  views_last_post: "Views of the last published post (empty if not measured yet).",
  dead_posts_7d: "Measured posts under the dead threshold (50 views) over the last 7 days.",
  country_median_views: "Median views of measured posts in the account's country over 28 days.",
  tiktok_account_created: "Date the TikTok account was created, according to TikTok (YYYY-MM-DD).",
  warmup_started_at: "When the creator pressed Start warmup (ISO UTC).",
  follows: "Accounts followed during the warm-up (highest reading).",
  likes: "Likes given during the warm-up (highest reading).",
  reposts_done: "yes if the creator ticked I did 2 reposts.",
  warmup_deadline: "Warm-up deadline: Monday 00:00 Paris of the first posting week (ISO UTC); empty once posting.",
  diagnostic: "Diagnostic of the last 7 days, as shown in the OS (OK, Missing posts, Low views, Shadowban).",
  suggested_action: "What the HM should do, as suggested by the OS.",
  decision_this_week: "Check, Kill or Double decision this week (Nudge, Recreate, Kill, Double, Keep…).",
  decision_done: "yes if that decision has been carried out.",
  pay_week_amount: "Pay amount in $ for the last finished week (on the creator's first account row only).",
  pay_deduction: "Deduction in $ for missed posts that week (on the first account row only).",
  pay_status: "Pay status for that week (OK, Check, Paid).",
  next_week_milestone: "What to do with next week's Upwork milestone.",
  upwork_contract_url: "Link to the creator's Upwork contract.",
  bonus_upcoming_amount: "Upcoming bonus in $ (referral, Comment Master), on the first account row only.",
  bonus_upcoming_date: "Bonus Monday of that upcoming bonus (YYYY-MM-DD).",
  bonus_detail: "What the upcoming bonus is for.",
} as const;

export const COLONNES_DETAIL = {
  date: "Day the post was planned for (YYYY-MM-DD).",
  tiktok_handle: "TikTok handle, without @.",
  poster_name: "Creator's full name.",
  slot: "Rank of the post in the day (1 = first post of the day).",
  status: "published (link pasted), missed (no link, past day) or planned (today or later).",
  published_at: "When the post was published (ISO UTC).",
  post_url: "Link to the TikTok post.",
  views: "Views at the last reading.",
  likes: "Likes at the last reading.",
  hours_measured_after: "Hours between publication and the last reading of views.",
} as const;

export type ColonneResume = keyof typeof COLONNES_RESUME;
export type ColonneDetail = keyof typeof COLONNES_DETAIL;
export type Niveau = "resume" | "detail";

export const PRESETS: Record<"suivi" | "paie" | "tout", ColonneResume[]> = {
  suivi: [
    "hm", "poster_name", "country", "tiktok_handle", "tiktok_url", "cohort_monday", "posting_week_number", "stage",
    "quality", "posts_expected_week", "posts_done_week", "posts_missed_week", "links_missing_week",
    "posts_done_today", "posts_expected_today", "last_post_date", "views_median_7d", "views_best_7d",
    "dead_posts_7d", "country_median_views", "follows", "likes", "reposts_done", "warmup_deadline", "diagnostic",
    "suggested_action", "decision_this_week", "decision_done",
  ],
  paie: [
    "hm", "poster_name", "tiktok_handle", "accounts_count", "posts_expected_week", "posts_done_week",
    "posts_missed_week", "pay_week_amount", "pay_deduction", "pay_status", "next_week_milestone",
    "upwork_contract_url", "bonus_upcoming_amount", "bonus_upcoming_date", "bonus_detail",
  ],
  tout: Object.keys(COLONNES_RESUME) as ColonneResume[],
};

export function colonnesDuNiveau(niveau: Niveau): string[] {
  return Object.keys(niveau === "resume" ? COLONNES_RESUME : COLONNES_DETAIL);
}

export function sensColonne(niveau: Niveau, c: string): string {
  return ((niveau === "resume" ? COLONNES_RESUME : COLONNES_DETAIL) as Record<string, string>)[c] ?? "";
}
