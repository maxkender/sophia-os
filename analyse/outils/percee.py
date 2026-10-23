"""Qu'est-ce qui fait percer un post (≥ 10 k vues à J+2) ? Heure, rang dans la journée,
compte (âge, warm-up, abonnés), contenu, qualité du post (relecture auto, fidélité du texte).
Usage : python3 -I analyse/outils/percee.py posts.json relectures.json  (exports de requetes/18_percee.sql)
Méthode : taux de percée brut par facteur, puis écart « à compte égal » : modèle linéaire de
probabilité avec effet fixe compte + contrôles (statut du contenu, original, semaine), IC 95 %
par bootstrap par compte.
"""
import json, sys, re, difflib, unicodedata
import numpy as np, pandas as pd
from zoneinfo import ZoneInfo

TZ = {'DE':'Europe/Berlin','TR':'Europe/Istanbul','PT':'Europe/Lisbon','ES':'Europe/Madrid','FR':'Europe/Paris','HU':'Europe/Budapest',
 'IT':'Europe/Rome','PL':'Europe/Warsaw','RO':'Europe/Bucharest','GR':'Europe/Athens','CZ':'Europe/Prague','RS':'Europe/Belgrade',
 'SI':'Europe/Ljubljana','HR':'Europe/Zagreb','NL':'Europe/Amsterdam','US':'America/New_York','BG':'Europe/Sofia','SK':'Europe/Bratislava',
 'SE':'Europe/Stockholm','NO':'Europe/Oslo','GB':'Europe/London','KZ':'Asia/Almaty','FI':'Europe/Helsinki','CA':'America/Toronto',
 'EE':'Europe/Tallinn','BR':'America/Sao_Paulo','AU':'Australia/Sydney','NZ':'Pacific/Auckland','AR':'America/Argentina/Buenos_Aires',
 'CO':'America/Bogota','IL':'Asia/Jerusalem','IE':'Europe/Dublin','UY':'America/Montevideo','AE':'Asia/Dubai'}
SEUIL = 10_000
rng = np.random.default_rng(0)

def to_md(t, floatfmt=None, index=True):
    """Tableau markdown sans tabulate. floatfmt : tuple par colonne (index compris si index=True) ou str."""
    t = t.copy()
    if index: t = t.reset_index()
    cols = list(t.columns)
    fmts = list(floatfmt) if isinstance(floatfmt, (tuple, list)) else [floatfmt or '.2f'] * len(cols)
    fmts += [fmts[-1]] * (len(cols) - len(fmts))
    def cell(v, f):
        if isinstance(v, (float, np.floating)):
            return '' if np.isnan(v) else format(v, f)
        return str(v)
    out = ['| ' + ' | '.join(str(c) for c in cols) + ' |', '| ' + ' | '.join('---' for _ in cols) + ' |']
    for _, row in t.iterrows():
        out.append('| ' + ' | '.join(cell(row[c], f) for c, f in zip(cols, fmts)) + ' |')
    return '\n'.join(out)

posts = pd.DataFrame(json.load(open(sys.argv[1])))
rel = pd.DataFrame(json.load(open(sys.argv[2]))) if len(sys.argv) > 2 else None

for c in ['vues','likes','partages','commentaires','prior_max','prior_n','n_jour_compte','rang_jour','min_depuis_prec','age_releve_h',
          'nb_slides','len_texte','pos_app','nb_hashtags','vues_source','pertinence_score','posts_par_jour','abonnes','n_rev','n_rem','ra_vues']:
    posts[c] = pd.to_numeric(posts[c], errors='coerce')
for c in ['publie_at','pub_at','compte_cree','warmup_started_at','warmup_ends_at','rc_warmup_at','rc_premier_post_at','contrat_signe_at']:
    posts[c] = pd.to_datetime(posts[c], utc=True, format='ISO8601', errors='coerce')
posts['jour_paris'] = posts['pub_at'].dt.tz_convert('Europe/Paris').dt.date
posts['h_paris'] = posts['pub_at'].dt.tz_convert('Europe/Paris').dt.hour + posts['pub_at'].dt.tz_convert('Europe/Paris').dt.minute/60
posts['h_loc'] = np.nan
for pays, g in posts.groupby('pays'):
    tz = TZ.get(pays, 'Europe/Paris')
    loc = g['pub_at'].dt.tz_convert(tz)
    posts.loc[g.index, 'h_loc'] = loc.dt.hour + loc.dt.minute/60
    posts.loc[g.index, 'jour_loc'] = loc.dt.date
    posts.loc[g.index, 'jsem'] = loc.dt.dayofweek
posts['percee'] = (posts['vues'] >= SEUIL).astype(int)
posts['viral'] = (posts['vues'] >= 50_000).astype(int)

# Périmètre : Sophia, posts mûrs, hors rappels pour les comparaisons.
base = posts[(posts['app'] == 'sophia') & (posts['vues'].notna())].copy()
print(f"Posts Sophia 08/09→19/10 : {len(base)} ; age relevé médian {base['age_releve_h'].median():.0f} h ; p10 {base['age_releve_h'].quantile(.1):.0f} h")
base = base[base['age_releve_h'] >= 30]  # mûr
d = base[~base['rappel']].copy()
med = d.groupby('compte_id')['vues'].agg(['median','size'])
med = med[med['size'] >= 5]['median']
d['med_compte'] = d['compte_id'].map(med)
d['r'] = d['vues'] / d['med_compte']
d = d[d['med_compte'].notna() & (d['med_compte'] > 0)].copy()
d['semaine'] = pd.to_datetime(d['jour_paris']).dt.to_period('W').astype(str)
d['statut'] = np.select([d['prior_n'].fillna(0) == 0, d['prior_max'] >= 10_000, d['prior_max'] >= 3_000], ['1er passage','deja ≥10k','deja 3-10k'], 'deja <3k')
print(f"Périmètre : {len(d)} posts hors rappels, {d['compte_id'].nunique()} comptes, {d['contenu_id'].nunique()} contenus ; percée {d['percee'].mean()*100:.1f} % ; viral {d['viral'].mean()*100:.2f} %")

def fe_lpm(df, factor, baseline, controls=('statut','original','semaine'), y='percee', boot=200):
    """Écart de probabilité (points) de chaque catégorie vs baseline, à compte égal."""
    df = df[df[factor].notna()].copy()
    X = pd.get_dummies(df[factor].astype(str), prefix='f', dtype=float)
    keep = [c for c in X.columns if c != f'f_{baseline}']
    X = X[keep]
    for c in controls:
        D = pd.get_dummies(df[c].astype(str), prefix=c, dtype=float, drop_first=True)
        X = pd.concat([X, D], axis=1)
    yv = df[y].astype(float)
    g = df['compte_id'].values
    Xd = X - X.groupby(g).transform('mean'); yd = yv - yv.groupby(g).transform('mean')
    def fit(Xd, yd):
        b, *_ = np.linalg.lstsq(Xd.values, yd.values, rcond=None); return b[:len(keep)]
    b = fit(Xd, yd)
    comptes = np.unique(g); idx_by = {c: np.where(g == c)[0] for c in comptes}
    bs = []
    for _ in range(boot):
        pick = rng.choice(comptes, len(comptes), replace=True)
        ii = np.concatenate([idx_by[c] for c in pick])
        gg = np.repeat(np.arange(len(pick)), [len(idx_by[c]) for c in pick])
        Xb = X.iloc[ii].reset_index(drop=True); yb = yv.iloc[ii].reset_index(drop=True)
        Xb = Xb - Xb.groupby(gg).transform('mean'); yb = yb - yb.groupby(gg).transform('mean')
        bs.append(fit(Xb, yb))
    bs = np.array(bs); lo, hi = np.percentile(bs, [2.5, 97.5], axis=0)
    return {k[2:]: (b[i]*100, lo[i]*100, hi[i]*100) for i, k in enumerate(keep)}

def tableau(df, factor, baseline, titre, ordre=None, controls=('statut','original','semaine'), boot=200, y='percee'):
    g = df[df[factor].notna()].groupby(factor)
    t = pd.DataFrame({'n': g.size(), '% ≥10k': g['percee'].mean()*100, '% ≥50k': g['viral'].mean()*100,
                      'r médian': g['r'].median(), 'vues méd': g['vues'].median()})
    eff = fe_lpm(df, factor, baseline, controls=controls, boot=boot, y=y) if len(df) > 200 else {}
    t['écart à compte égal (pts)'] = [('réf.' if str(k) == str(baseline) else (f"{eff[str(k)][0]:+.1f} [{eff[str(k)][1]:+.1f}, {eff[str(k)][2]:+.1f}]" if str(k) in eff else '')) for k in t.index]
    if ordre is not None: t = t.reindex([o for o in ordre if o in t.index])
    print(f"\n### {titre}  (réf. = {baseline})")
    print(to_md(t, ('', '.0f', '.1f', '.1f', '.2f', '.0f', '')))
    return t

# 1. Heure locale
d['heure'] = pd.cut(d['h_loc'], [0,6,9,12,15,18,21,24], right=False, labels=['0-6h','6-9h','9-12h','12-15h','15-18h','18-21h','21-24h'])
tableau(d, 'heure', '12-15h', 'Heure locale de publication (pays du compte)', ordre=['6-9h','9-12h','12-15h','15-18h','18-21h','21-24h','0-6h'])
d['heure_paris'] = pd.cut(d['h_paris'], [0,6,9,12,15,18,21,24], right=False, labels=['0-6h','6-9h','9-12h','12-15h','15-18h','18-21h','21-24h'])
tableau(d, 'heure_paris', '12-15h', 'Heure de Paris', ordre=['6-9h','9-12h','12-15h','15-18h','18-21h','21-24h','0-6h'])
# heure + rang dans la journée ensemble
d['rang'] = np.where(d['rang_jour'] >= 3, '3e et +', d['rang_jour'].astype(str) + 'er/e')
d['rang'] = d['rang'].replace({'1er/e':'1er du jour','2er/e':'2e du jour'})
tableau(d, 'heure', '12-15h', 'Heure locale, en contrôlant aussi le rang du post dans la journée', ordre=['6-9h','9-12h','12-15h','15-18h','18-21h','21-24h','0-6h'], controls=('statut','original','semaine','rang'))
d['jour_sem'] = d['jsem'].map({0:'lun',1:'mar',2:'mer',3:'jeu',4:'ven',5:'sam',6:'dim'})
tableau(d, 'jour_sem', 'mar', 'Jour de la semaine (local)', ordre=['lun','mar','mer','jeu','ven','sam','dim'])

# 2. Rythme de publication du compte
tableau(d, 'rang', '1er du jour', 'Rang du post dans la journée du compte')
d['n_jour'] = pd.cut(d['n_jour_compte'], [0,1,2,3,99], labels=['1 post','2 posts','3 posts','4 et +'])
tableau(d, 'n_jour', '2 posts', 'Nombre de posts du compte ce jour-là')
d['ecart_prec'] = pd.cut(d['min_depuis_prec'], [-1, 30, 120, 360, 1440, 1e9], labels=['< 30 min','30 min - 2 h','2-6 h','6-24 h','> 24 h'])
tableau(d, 'ecart_prec', '6-24 h', 'Temps depuis le post précédent du compte')
d['retard'] = np.where(d['prevue'].isna(), None, np.where(pd.to_datetime(d['jour_paris']) <= pd.to_datetime(d['prevue']), 'à l heure', 'en retard (≥ 1 j)'))
tableau(d, 'retard', 'à l heure', 'Publié le jour prévu ou en retard')

# 3. Compte
d['age_compte'] = (pd.to_datetime(d['jour_paris']).dt.tz_localize('Europe/Paris') - d['compte_cree']).dt.days
d['age_c'] = pd.cut(d['age_compte'], [-1,7,14,30,60,400], labels=['≤ 7 j','8-14 j','15-30 j','31-60 j','> 60 j'])
tableau(d, 'age_c', '31-60 j', 'Âge du compte au moment du post (depuis sa création dans l OS)')
d['pendant_warmup'] = np.where(d['warmup_ends_at'].isna(), None, np.where(d['pub_at'] < d['warmup_ends_at'], 'pendant le warm-up', 'après'))
tableau(d, 'pendant_warmup', 'après', 'Post publié pendant le warm-up ?')
d['warm_h'] = ((d['warmup_ends_at'] - d['warmup_started_at']).dt.total_seconds()/3600).round()
d['warm_c'] = pd.cut(d['warm_h'], [-1, 1, 30, 1000], labels=['0 h (sauté)','24 h','≥ 72 h'])
g = d.groupby('warm_c', observed=True)
print("\n### Durée du warm-up du compte (attribut du compte, comparaison brute entre comptes)")
print(to_md(pd.DataFrame({'comptes': g['compte_id'].nunique(), 'posts': g.size(), '% ≥10k': g['percee'].mean()*100, 'vues méd': g['vues'].median(),
                    'méd. des médianes de compte': g.apply(lambda x: x.groupby('compte_id')['vues'].median().median())}), ('', '.0f', '.0f', '.1f', '.0f', '.0f')))
# Abonnés aujourd'hui (22/10) vs percée du compte sur la fenêtre : corrélation, par tranche
ac = d.groupby('compte_id').agg(posts=('id','size'), percee=('percee','mean'), med=('vues','median'), abonnes=('abonnes','first'), age=('age_compte','max'), langue=('langue_compte','first'))
ac = ac[ac['posts'] >= 10]
ac['ab_c'] = pd.cut(ac['abonnes'], [-1, 300, 1000, 3000, 10000, 1e9], labels=['< 300','300-1 k','1-3 k','3-10 k','> 10 k'])
g = ac.groupby('ab_c', observed=True)
print("\n### Abonnés du compte au 22/10 (relevé compte_profils) vs percée sur la fenêtre, comptes ≥ 10 posts")
print(to_md(pd.DataFrame({'comptes': g.size(), '% posts ≥10k': g['percee'].mean()*100, 'médiane de compte (méd.)': g['med'].median(), 'âge méd (j)': g['age'].median()}), ('', '.0f', '.1f', '.0f', '.0f')))
print(f"corrélation de rang abonnés ~ % ≥10k : {ac['abonnes'].rank().corr(ac['percee'].rank()):.2f} (n={ac['abonnes'].notna().sum()}) ; abonnés ~ âge : {ac['abonnes'].rank().corr(ac['age'].rank()):.2f}")
tableau(d, 'classement', 'bien', 'Classement actuel du compte (endogène : calculé sur les vues)')

# 4. Contenu
tableau(d, 'statut', 'deja 3-10k', 'Statut du contenu au moment du post (meilleur passage connu 2 j avant)', controls=('original','semaine'))
d['orig'] = np.where(d['original'], 'original (pod)', 'import')
tableau(d, 'orig', 'import', 'Original de pod ou import', controls=('statut','semaine'))
d['slides_c'] = pd.cut(d['nb_slides'], [0,4,6,8,30], labels=['≤ 4','5-6','7-8','9 et +'])
tableau(d, 'slides_c', '5-6', 'Nombre de slides')
d['hook_len'] = d['hook'].fillna('').str.replace(r'\s+',' ',regex=True).str.strip().str.len()
d['hook_c'] = pd.cut(d['hook_len'], [-1, 30, 50, 80, 1000], labels=['≤ 30 car.','31-50','51-80','> 80'])
tableau(d, 'hook_c', '31-50', 'Longueur de l accroche (slide 1)')
d['texte_c'] = pd.cut(d['len_texte'], [-1, 200, 400, 700, 1e6], labels=['≤ 200 car.','200-400','400-700','> 700'])
tableau(d, 'texte_c', '200-400', 'Longueur totale du texte')
d['hash_c'] = pd.cut(d['nb_hashtags'], [-1, 0, 3, 5, 100], labels=['0','1-3','4-5','6 et +'])
tableau(d, 'hash_c', '4-5', 'Nombre de hashtags')
d['mus'] = np.where(d['a_musique'], 'musique fournie', 'sans')
tableau(d, 'mus', 'musique fournie', 'Musique fournie dans le brief')
d['pos_app_c'] = np.select([d['pos_app'].isna(), d['pos_app'] == d['nb_slides'], d['pos_app'] <= 3], ['aucune','dernière','début (≤ 3)'], 'milieu')
tableau(d, 'pos_app_c', 'dernière', 'Position de la slide appli')
d['vsrc'] = pd.cut(d['vues_source'], [-1, 50_000, 200_000, 1_000_000, 1e12], labels=['< 50 k','50-200 k','200 k - 1 M','> 1 M'])
tableau(d[~d['original']], 'vsrc', '200 k - 1 M', 'Vues du TikTok source (imports)')
d['age_contenu'] = (pd.to_datetime(d['jour_paris']) - pd.to_datetime(d['contenu_cree'])).dt.days
d['age_ct'] = pd.cut(d['age_contenu'], [-1, 7, 21, 45, 1000], labels=['≤ 7 j','8-21 j','22-45 j','> 45 j'])
tableau(d, 'age_ct', '22-45 j', 'Âge du contenu (depuis son import / sa création)')
tableau(d, 'label', 'smart_girl', 'Label (brut ; l effet fixe compte absorbe presque tout)', controls=('statut','original','semaine'))

# 5. Qualité du post : relecture automatique
if rel is not None:
    rel = rel[rel['statut'] == 'fait'].copy()
    def norm(s):
        s = unicodedata.normalize('NFKC', (s or '')).lower()
        s = re.sub(r'[^\w]+', '', s); return s
    def fidelite(row):
        comp = row['comp'] if isinstance(row['comp'], list) else (json.loads(row['comp']) if row['comp'] else [])
        att = row['attendu'] if isinstance(row['attendu'], list) else (json.loads(row['attendu']) if row['attendu'] else [])
        att = {int(a['position']): a['texte'] for a in att if a.get('position') is not None}
        ratios = []
        for c in comp:
            p = c.get('position'); pub = norm(c.get('pub')); exp = norm(att.get(int(p), '')) if p is not None else ''
            if exp and pub: ratios.append(difflib.SequenceMatcher(None, exp, pub).ratio())
        return pd.Series({'fid_min': min(ratios) if ratios else np.nan, 'fid_moy': np.mean(ratios) if ratios else np.nan, 'n_cmp': len(ratios)})
    fid = rel.apply(fidelite, axis=1)
    rel = pd.concat([rel, fid], axis=1)
    def codes(x):
        x = x if isinstance(x, list) else (json.loads(x) if x else [])
        return [(c.get('code'), c.get('niveau')) for c in x]
    rel['codes'] = rel['defauts'].apply(codes)
    REMARQUE = {'texte_absent','justification','hierarchie','largeur','taille','alignement','couleur','effet'}
    rel['n_remarque'] = rel['codes'].apply(lambda cs: sum(1 for c, n in cs if c in REMARQUE))
    rel['n_info'] = rel['codes'].apply(lambda cs: sum(1 for c, n in cs if c not in REMARQUE))
    for code in ['justification','taille','largeur','alignement','hierarchie','couleur','effet','texte_absent','nb_slides','musique','police','placement','gras']:
        rel['d_' + code] = rel['codes'].apply(lambda cs: any(c == code for c, n in cs))
    m = d.merge(rel.drop(columns=['defauts','statut']), left_on='id', right_on='passage_id', how='inner')
    print(f"\n## Relecture automatique : {len(m)} posts mûrs relus (jours {m['jour'].min()} → {m['jour'].max()}), {m['compte_id'].nunique()} comptes ; percée {m['percee'].mean()*100:.1f} %")
    m['defauts_c'] = np.select([m['n_remarque'] == 0, m['n_remarque'] == 1], ['aucun défaut', '1 défaut'], '2 et +')
    tableau(m, 'defauts_c', 'aucun défaut', 'Défauts de mise en forme relevés (justification, taille, alignement, couleur, hiérarchie…)', ordre=['aucun défaut','1 défaut','2 et +'], controls=('statut','original'), boot=150)
    rows = []
    for code in ['justification','taille','largeur','alignement','hierarchie','couleur','effet','texte_absent','nb_slides','musique','police','placement']:
        col = 'd_' + code
        if m[col].sum() < 15: continue
        eff = fe_lpm(m, col, 'False', controls=('statut','original'), boot=150)
        a, s = m[m[col]], m[~m[col]]
        rows.append({'défaut': code, 'posts': int(m[col].sum()), '% ≥10k avec': a['percee'].mean()*100, '% ≥10k sans': s['percee'].mean()*100,
                     'r méd avec': a['r'].median(), 'r méd sans': s['r'].median(), 'écart à compte égal (pts)': f"{eff['True'][0]:+.1f} [{eff['True'][1]:+.1f}, {eff['True'][2]:+.1f}]"})
    print("\n### Par type de défaut")
    print(to_md(pd.DataFrame(rows), ('', '.0f', '.1f', '.1f', '.2f', '.2f', ''), index=False))
    m['fid_c'] = pd.cut(m['fid_min'], [-0.01, 0.7, 0.85, 0.95, 1.01], labels=['< 0,70 (texte changé)','0,70-0,85','0,85-0,95','≥ 0,95 (fidèle)'])
    tableau(m[m['n_cmp'] >= 2], 'fid_c', '≥ 0,95 (fidèle)', 'Fidélité du texte publié au texte fourni (pire slide des 3 comparées, ratio de similarité)', controls=('statut','original'), boot=150)
    m['mus_pub'] = np.where(m['d_musique'], 'son différent du brief', 'son du brief')
    m['sl_pub'] = np.where(m['d_nb_slides'], 'nb de slides différent', 'nb de slides conforme')
    # Légende : hashtags publiés vs fournis
    def hs(s): return set(re.findall(r'#\w+', (s or '').lower()))
    m['hash_ok'] = [len(hs(a) & hs(b)) / max(1, len(hs(b))) if hs(b) else np.nan for a, b in zip(m['legende'], m['hashtags_x'] if 'hashtags_x' in m else m['hashtags'])]
    m['hash_c2'] = pd.cut(m['hash_ok'], [-0.01, 0.5, 0.99, 1.01], labels=['< 50 % des hashtags','50-99 %','tous les hashtags'])
    tableau(m, 'hash_c2', 'tous les hashtags', 'Hashtags publiés par rapport aux hashtags fournis', controls=('statut','original'), boot=150)
    # Combinaison : post « parfait »
    m['parfait'] = np.where((m['n_remarque'] == 0) & (m['fid_min'] >= 0.85) & (~m['d_musique']) & (~m['d_nb_slides']), 'parfait', 'au moins un écart')
    tableau(m[m['n_cmp'] >= 2], 'parfait', 'au moins un écart', 'Post « parfait » (aucun défaut, texte fidèle, son et nb de slides conformes)', controls=('statut','original'), boot=150)
    print(f"\nPart de posts parfaits : {(m['parfait']=='parfait').mean()*100:.0f} % ; part avec ≥ 1 défaut de mise en forme : {(m['n_remarque']>0).mean()*100:.0f} % ; texte infidèle (< 0,85) : {(m['fid_min']<0.85).mean()*100:.0f} % ; son différent : {m['d_musique'].mean()*100:.0f} % ; nb slides différent : {m['d_nb_slides'].mean()*100:.0f} %")
    # Qui fait des posts parfaits ? par créateur : % parfait vs % percée (niveau compte)
    pc = m.groupby('compte_id').agg(n=('id','size'), parfait=('parfait', lambda x: (x=='parfait').mean()), percee=('percee','mean'), r=('r','median'))
    pc = pc[pc['n'] >= 5]
    print(f"Niveau compte (≥ 5 posts relus, n={len(pc)}) : corrélation de rang % parfait ~ % ≥10k : {pc['parfait'].rank().corr(pc['percee'].rank()):.2f} ; ~ r médian : {pc['parfait'].rank().corr(pc['r'].rank()):.2f}")

# 6. Variance expliquée : qui explique quoi ? R² d'un modèle de percée
def r2(df, cols):
    X = pd.get_dummies(df[cols].astype(str), dtype=float, drop_first=True)
    X.insert(0, 'c', 1.0); y = df['percee'].astype(float).values
    b, *_ = np.linalg.lstsq(X.values, y, rcond=None); res = y - X.values @ b
    return 1 - res.var() / y.var()
print("\n### Part de la variance de « percée » expliquée (R², modèle linéaire)")
for nom, cols in [('compte seul', ['compte_id']), ('statut du contenu seul', ['statut']), ('contenu seul (id)', ['contenu_id']), ('heure locale seule', ['heure']),
                  ('compte + statut + original', ['compte_id','statut','orig']), ('compte + contenu', ['compte_id','contenu_id'])]:
    print(f"- {nom} : {r2(d, cols)*100:.1f} %")

# 7. Modèle complet : tous les facteurs ensemble, à compte égal
print("\n### Modèle complet (tous les facteurs ensemble, effet fixe compte) : écart en points vs la référence de chaque facteur")
d['vsrc2'] = np.where(d['original'], 'original', d['vsrc'].astype(str))
facteurs = [('statut','deja 3-10k'), ('vsrc2','200 k - 1 M'), ('age_ct','22-45 j'), ('slides_c','5-6'), ('pos_app_c','dernière'), ('hook_c','31-50'),
            ('heure','12-15h'), ('jour_sem','mar'), ('ecart_prec','6-24 h')]
dd = d.dropna(subset=[f for f, _ in facteurs]).copy()
X = pd.concat([pd.get_dummies(dd[f].astype(str), prefix=f, dtype=float).drop(columns=[f'{f}_{b}']) for f, b in facteurs] + [pd.get_dummies(dd['semaine'], prefix='sem', dtype=float, drop_first=True)], axis=1)
yv = dd['percee'].astype(float); g = dd['compte_id'].values
Xd = X - X.groupby(g).transform('mean'); yd = yv - yv.groupby(g).transform('mean')
b, *_ = np.linalg.lstsq(Xd.values, yd.values, rcond=None)
comptes = np.unique(g); idx_by = {c: np.where(g == c)[0] for c in comptes}; bs = []
for _ in range(150):
    pick = rng.choice(comptes, len(comptes), replace=True); ii = np.concatenate([idx_by[c] for c in pick])
    gg = np.repeat(np.arange(len(pick)), [len(idx_by[c]) for c in pick])
    Xb = X.iloc[ii].reset_index(drop=True); yb = yv.iloc[ii].reset_index(drop=True)
    Xb = Xb - Xb.groupby(gg).transform('mean'); yb = yb - yb.groupby(gg).transform('mean')
    bb, *_ = np.linalg.lstsq(Xb.values, yb.values, rcond=None); bs.append(bb)
lo, hi = np.percentile(np.array(bs), [2.5, 97.5], axis=0)
rows = [{'facteur': c.split('_', 1)[0], 'valeur': c.split('_', 1)[1], 'n': int(X[c].sum()), 'écart (pts)': f"{b[i]*100:+.1f} [{lo[i]*100:+.1f}, {hi[i]*100:+.1f}]", 'net': '●' if lo[i] > 0 or hi[i] < 0 else ''}
        for i, c in enumerate(X.columns) if not c.startswith('sem_')]
print(to_md(pd.DataFrame(rows), ('', '', '.0f', '', ''), index=False))
res = yd.values - Xd.values @ b
print(f"n = {len(dd)} ; R² intra-compte = {1 - res.var()/yd.var():.3f}")

# 8. Heure locale par pays (robustesse) : r médian et % ≥10k, 5 grands pays
print("\n### Heure locale par pays : % ≥10k (n)")
top = d['pays'].value_counts().head(6).index
t = d[d['pays'].isin(top)].groupby(['pays','heure'], observed=True).agg(n=('id','size'), p=('percee','mean'))
t['cell'] = t.apply(lambda r: f"{r['p']*100:.0f} % ({int(r['n'])})", axis=1)
print(to_md(t['cell'].unstack('heure').reindex(columns=['6-9h','9-12h','12-15h','15-18h','18-21h','21-24h','0-6h']), ''))

# 9. Contributions : d'où viennent les percées ?
print("\n### D'où viennent les percées (posts ≥ 10 k) ?")
for f in ['statut', 'vsrc2', 'age_ct', 'slides_c']:
    g = d.groupby(f, observed=True).agg(posts=('id','size'), percees=('percee','sum'), virales=('viral','sum'))
    g['% posts'] = g['posts']/g['posts'].sum()*100; g['% percées'] = g['percees']/g['percees'].sum()*100; g['% virales'] = g['virales']/g['virales'].sum()*100
    g['taux'] = g['percees']/g['posts']*100
    print(f"\n{f}"); print(to_md(g[['posts','% posts','percees','% percées','% virales','taux']], ('', '.0f', '.0f', '.0f', '.0f', '.0f', '.1f')))
fp = d[(d['statut'] == '1er passage') & (~d['original'])]
print(f"\n1er passage hors originaux : n={len(fp)}, % ≥10k = {fp['percee'].mean()*100:.1f}, r médian {fp['r'].median():.2f}, vues méd {fp['vues'].median():.0f}")

# 10. La qualité du compte persiste-t-elle ? médiane de la 1re quinzaine → percée de la 2e
j = pd.to_datetime(d['jour_paris'])
q1 = d[(j >= '2026-09-20') & (j < '2026-10-05')].groupby('compte_id')['vues'].agg(['median','size'])
q2 = d[(j >= '2026-10-05') & (j < '2026-10-20')].groupby('compte_id').agg(percee=('percee','mean'), n=('id','size'), med=('vues','median'))
qq = q1[q1['size'] >= 8].join(q2[q2['n'] >= 8], how='inner')
qq['tercile q1'] = pd.qcut(qq['median'], 3, labels=['tiers bas','tiers milieu','tiers haut'])
g = qq.groupby('tercile q1', observed=True)
print("\n### Comptes : médiane du 20/09-04/10 → percée du 05/10-19/10")
print(to_md(pd.DataFrame({'comptes': g.size(), 'médiane q1 (méd.)': g['median'].median(), '% ≥10k en q2': g['percee'].mean()*100, 'médiane q2 (méd.)': g['med'].median()}), ('', '.0f', '.0f', '.1f', '.0f')))
