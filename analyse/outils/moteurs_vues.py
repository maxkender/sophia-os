"""Régression à effet fixe compte sur la sortie de requetes/15_moteurs_vues.sql (JSON).

Usage : python3 -I analyse/outils/moteurs_vues.py lignes.json
Effet de la période sur log(vues), puis le même effet une fois ajoutés le statut
du contenu, son type et son label : ce qui fait tomber l effet de période l explique.
Intervalles de confiance par bootstrap sur les comptes.
"""
import json, sys
import numpy as np, pandas as pd

rows = json.load(open(sys.argv[1]))
df = pd.DataFrame(rows)
df['jour'] = pd.to_datetime(df['jour'])
df = df[(df.app != 'micabo') & (~df.est_rappel.fillna(False).astype(bool))]
df = df[df.jour <= '2026-10-18'].copy()
df['y'] = np.log1p(df.vues.astype(float))

def periode(j):
    if j <= pd.Timestamp('2026-09-28'): return 'P0'
    if j <= pd.Timestamp('2026-10-08'): return 'A'
    if j <= pd.Timestamp('2026-10-15'): return 'B1'
    return 'B2'
df['per'] = df.jour.map(periode)

def statut(r):
    if r.prior_n == 0: return 'premier'
    if pd.isna(r.prior_max): return 'non_mesure'
    if r.prior_max >= 10000: return 'gagnant'
    if r.prior_max >= 3000: return 'moyen'
    return 'perdant'
df['statut'] = df.apply(statut, axis=1)
df['original'] = df.original.astype(bool)
cc = pd.to_datetime(df.contenu_cree)
df['cohorte_contenu'] = np.where(df.original, 'original', np.where(cc >= '2026-09-26', 'import_recent', np.where(cc >= '2026-09-01', 'import_sept', 'import_ancien')))
df['label'] = df.label.fillna('?')
# labels rares regroupés
top = df.label.value_counts()
df['label2'] = np.where(df.label.map(top) >= 150, df.label, 'autres')
df['app2'] = df.app

def fe_ols(d, cats):
    # effet fixe compte : on centre y et les indicatrices par compte
    X = pd.get_dummies(d[cats], drop_first=False).astype(float)
    # retirer une modalité de référence par variable
    refs = {'per': 'per_P0', 'statut': 'statut_moyen', 'cohorte_contenu': 'cohorte_contenu_import_ancien', 'label2': 'label2_smart_girl', 'app2': 'app2_sophia'}
    for c in cats:
        r = refs.get(c)
        if r in X.columns: X = X.drop(columns=r)
    g = d.compte_id
    Xd = X - X.groupby(g).transform('mean')
    yd = d.y - d.y.groupby(g).transform('mean')
    keep = Xd.columns[(Xd.abs().sum() > 0)]
    Xd = Xd[keep]
    beta, *_ = np.linalg.lstsq(Xd.values, yd.values, rcond=None)
    return pd.Series(beta, index=keep)

def boot(d, cats, n=200, seed=1):
    rng = np.random.default_rng(seed)
    comptes = d.compte_id.unique()
    idx = {c: np.where(d.compte_id.values == c)[0] for c in comptes}
    res = []
    for _ in range(n):
        pick = rng.choice(comptes, len(comptes), replace=True)
        parts = []
        for k, c in enumerate(pick):
            sub = d.iloc[idx[c]].copy(); sub['compte_id'] = f'{c}_{k}'; parts.append(sub)
        res.append(fe_ols(pd.concat(parts), cats))
    return pd.DataFrame(res)

# comptes avec au moins 10 posts dans la fenêtre
n = df.groupby('compte_id').size()
d = df[df.compte_id.map(n) >= 10].copy()
print('posts', len(d), 'comptes', d.compte_id.nunique())
print(d.groupby('per').size())

modeles = [
  ('M1 période seule', ['per']),
  ('M2 + statut du contenu (déjà gagnant…)', ['per', 'statut']),
  ('M3 + type de contenu (original, cohorte d import)', ['per', 'statut', 'cohorte_contenu']),
  ('M4 + label', ['per', 'statut', 'cohorte_contenu', 'label2']),
]
out = {}
for nom, cats in modeles:
    b = fe_ols(d, cats)
    out[nom] = b
    per = {k: round((np.exp(b[k]) - 1) * 100, 1) for k in ['per_A', 'per_B1', 'per_B2'] if k in b}
    print(nom, 'effet période en % vs 15-28/09 :', per)

b4 = out['M4 + label']
print('\nM4 coefficients (en % de vues, à compte égal) :')
for k, v in b4.sort_values().items():
    print(f'  {k:45s} {round((np.exp(v)-1)*100,1):>7}')

bs = boot(d, ['per'], n=150)
for k in ['per_A', 'per_B1', 'per_B2']:
    lo, hi = np.percentile(np.exp(bs[k]) - 1, [2.5, 97.5]) * 100
    print('IC95 M1', k, round(lo,1), round(hi,1))
bs2 = boot(d, ['per', 'statut', 'cohorte_contenu', 'label2'], n=150, seed=2)
for k in ['per_A', 'per_B1', 'per_B2', 'statut_gagnant', 'statut_perdant', 'statut_premier', 'cohorte_contenu_original', 'cohorte_contenu_import_recent']:
    if k in bs2:
        lo, hi = np.percentile(np.exp(bs2[k]) - 1, [2.5, 97.5]) * 100
        print('IC95 M4', k, round(lo,1), round(hi,1))

# parts du mix par période
print('\nmix statut (% des posts) :')
print((pd.crosstab(d.per, d.statut, normalize='index') * 100).round(1))
print('\nmix type (% des posts) :')
print((pd.crosstab(d.per, d.cohorte_contenu, normalize='index') * 100).round(1))
print('\nmix label (% des posts) :')
print((pd.crosstab(d.per, d.label2, normalize='index') * 100).round(1))
