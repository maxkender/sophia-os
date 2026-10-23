"""Valeur de chaque passage d un cycle tierlist selon son rang, et effet des longueurs de cycle.

Usage : python3 -I analyse/outils/cycles_tierlist.py cycles.json   (sortie de requetes/16_cycles_tierlist.sql)
Partie 1 : r par rang et par issue du cycle, scénarios « raccourcir ».
Partie 2 (mix) : la longueur d un rang est son poids dans le tirage (A, B, S, S+ sont dans la même
bande), donc r moyen du jour selon les longueurs, avec ou sans usure de l exposition répétée.
"""
import json, sys
import numpy as np, pandas as pd
d = pd.DataFrame(json.load(open(sys.argv[1])))
for c in ['vues','rr','rang','n_cycle','n_mesures','cycle_actuel','passages_prevus','n_cycle_suivant','tier_cycle']:
    d[c] = pd.to_numeric(d[c], errors='coerce')
d = d[d.rr.notna()].copy(); d['rc'] = d.rr.clip(upper=20)
N2T = {1:'C', 2:'B', 4:'A', 8:'S', 16:'S+'}
ORD = {'D':0,'C':1,'B':2,'A':3,'S':4,'S+':5}
def tier_cycle(r):
    if r.tier_cycle < r.cycle_actuel: return N2T.get(int(r.n_cycle))
    return r.tier_actuel
def tier_suivant(r):
    if r.tier_cycle >= r.cycle_actuel: return None
    if r.tier_cycle + 1 == r.cycle_actuel: return r.tier_actuel
    return N2T.get(int(r.n_cycle_suivant)) if pd.notna(r.n_cycle_suivant) else None
d['tier'] = d.apply(tier_cycle, axis=1)
d['suivant'] = d.apply(tier_suivant, axis=1)
d = d[d.tier.notna()].copy()
jours = d.jour.nunique()
print('posts', len(d), 'jours', jours, '| r moyen (cap 20)', round(d.rc.mean(),2), '| r médian', round(d.rr.median(),2))
print('\nposts par rang du cycle (cycles fermés + en cours) :')
t = d.groupby(['tier','rang']).agg(n=('rr','size'), r_med=('rr','median'), r_moy=('rc','mean'), pct10k=('vues', lambda s: 100*(s>=10000).mean()), vues_moy=('vues','mean')).round(2)
t = t.reset_index(); t['o']=t.tier.map(ORD); t=t.sort_values(['o','rang']).drop(columns='o')
print(t.to_string(index=False))

# issue des cycles fermés
f = d[d.suivant.notna()].copy()
f['issue'] = np.where(f.suivant.map(ORD) < f.tier.map(ORD), 'descend', np.where(f.suivant.map(ORD) > f.tier.map(ORD), 'monte', 'reste'))
print('\nissue des cycles fermés (par cycle) :')
cyc = f.drop_duplicates(['contenu_id','tier_cycle'])
print(pd.crosstab(cyc.tier, cyc.issue).to_string())

print('\nr par rang selon l issue du cycle (cycles fermés) :')
g = f.groupby(['tier','issue','rang']).agg(n=('rr','size'), r_med=('rr','median'), r_moy=('rc','mean')).round(2).reset_index()
g['o']=g.tier.map(ORD); g=g.sort_values(['o','issue','rang']).drop(columns='o')
print(g[g.tier.isin(['B','A','S','S+'])].to_string(index=False))

# scénarios
r_pool = d.rc.mean()
def scenario(tier, k_new, nom):
    sel_all = d[(d.tier==tier) & (d.rang > k_new)]
    sel_desc = f[(f.tier==tier) & (f.rang > k_new) & (f.issue=='descend')]
    # cycles fermés seulement pour la part "descend"
    ferm = f[(f.tier==tier) & (f.rang > k_new)]
    part_desc = len(sel_desc)/max(1,len(ferm))
    # gain = passages retirés × (r_pool - r_retiré) × vues_par_r ; on l'exprime via vues : vues * (r_pool/r_sel - 1)
    def gain(sel):
        if len(sel)==0: return 0.0, 0.0
        g = sel.vues.sum() * (r_pool / sel.rc.mean() - 1)
        return g/jours/1000, 100*g/d.vues.sum()
    ga, pa_ = gain(sel_all)
    # estimation "juste" : seuls les cycles qui finissent par descendre perdent vraiment ces passages ;
    # pour les cycles qui restent/montent, le contenu revient au cycle suivant (décalage, pas perte)
    gd, pd_ = gain(sel_desc)
    print(f"{nom:34s} retirés {len(sel_all)/jours:5.1f} posts/j ({100*len(sel_all)/len(d):4.1f} %) r moy {sel_all.rc.mean():.2f} méd {sel_all.rr.median():.2f} | "
          f"brut ≈ {ga:+5.0f} k vues/j ({pa_:+.1f} %) | cycles qui descendent ({100*part_desc:.0f} % des passages retirés) : r {sel_desc.rc.mean() if len(sel_desc) else float('nan'):.2f} → gain ≈ {gd:+5.0f} k/j ({pd_:+.1f} %)")

print(f"\nr moyen du pool (remplaçant) : {r_pool:.2f}\n")
scenario('A', 3, 'A : 4 → 3 passages')
scenario('A', 2, 'A : 4 → 2 passages')
scenario('S', 6, 'S : 8 → 6 passages')
scenario('S', 4, 'S : 8 → 4 passages')
scenario('S+', 12, 'S+ : 16 → 12 passages')
scenario('S+', 8, 'S+ : 16 → 8 passages')
scenario('B', 1, 'B : 2 → 1 passage')

# --- partie 2 : mix (cycles.json + coupe.json de 15_moteurs_vues dans le dossier courant)
c = pd.DataFrame(json.load(open('cycles.json')))
k = pd.DataFrame(json.load(open('coupe.json')))[['id','n_prev','max_prev']]
for col in ['vues','rr','rang','n_cycle','cycle_actuel','tier_cycle','n_cycle_suivant']:
    c[col] = pd.to_numeric(c[col], errors='coerce')
c = c[c.rr.notna()].copy(); c['rc'] = c.rr.clip(upper=20)
N2T = {1:'C', 2:'B', 4:'A', 8:'S', 16:'S+'}
c['tier'] = np.where(c.tier_cycle < c.cycle_actuel, c.n_cycle.map(N2T), c.tier_actuel)
c = c[c.tier.notna()]
d = c.merge(k, on='id', how='left')
for col in ['n_prev','max_prev']: d[col] = pd.to_numeric(d[col], errors='coerce')
jours = c.jour.nunique()
K = {'C':1,'B':2,'A':4,'S':8,'S+':16}

print('mix actuel des posts par rang du contenu (Sophia, 15/09-18/10) :')
m = c.groupby('tier').agg(posts_j=('rr', lambda s: len(s)/jours), part=('rr', lambda s: 100*len(s)/len(c)), r_moy=('rc','mean'), r_med=('rr','median'), vues_j=('vues', lambda s: s.sum()/jours/1000)).round(2)
m = m.loc[[t for t in ['C','B','A','S','S+'] if t in m.index]]
print(m.to_string())

print('\nusure avec l exposition cumulée (toutes cycles confondus) — contenus en A ou S au moment du post :')
e = d[d.tier.isin(['A','S','S+']) & d.n_prev.notna()].copy()
e['expo'] = pd.cut(e.n_prev, [-1,0,1,3,5,8,12,100], labels=['0','1','2-3','4-5','6-8','9-12','13+'])
print(e.groupby('expo', observed=True).agg(n=('rr','size'), r_med=('rr','median'), r_moy=('rc','mean'), pct10k=('vues', lambda s: 100*(s>=10000).mean())).round(2).to_string())

print('\nmême chose pour les contenus déjà gagnants (meilleur passage précédent ≥ 10 k), tous rangs :')
g = d[(d.max_prev >= 10000)].copy()
g['expo'] = pd.cut(g.n_prev, [0,1,3,5,8,12,100], labels=['1','2-3','4-5','6-8','9-12','13+'])
print(g.groupby('expo', observed=True).agg(n=('rr','size'), r_med=('rr','median'), r_moy=('rc','mean'), pct10k=('vues', lambda s: 100*(s>=10000).mean())).round(2).to_string())

# scénarios de mix : part_T ∝ posts_T × k'_T / k_T (le tirage est uniforme dans la bande B+ ; un contenu reste dans le pool k_T tirages)
base_r = (m.posts_j * m.r_moy).sum() / m.posts_j.sum()
def scen(nom, kk, usure=1.0):
    w = {t: m.loc[t,'posts_j'] * kk.get(t, K[t]) / K[t] for t in m.index}
    tot = sum(w.values()); shares = {t: w[t]/tot for t in w}
    # r des passages ajoutés : r_moy du rang × facteur d'usure pour les passages au-delà de l ancien cycle
    r = 0
    for t in m.index:
        r_t = m.loc[t,'r_moy']
        extra = max(0, kk.get(t, K[t]) - K[t]) / kk.get(t, K[t])  # part des passages du rang qui sont "en plus"
        r += shares[t] * (r_t * (1 - extra) + r_t * usure * extra)
    print(f"{nom:28s} parts {', '.join(f'{t} {100*shares[t]:.0f} %' for t in m.index)} → r moyen {r:.2f} ({100*(r/base_r-1):+.1f} %)")
print(f"\nscénarios de mix (r moyen du jour, base {base_r:.2f}) :")
scen('actuel', {})
scen('A 4→3', {'A':3})
scen('A 4→3, S 8→6', {'A':3,'S':6})
scen('A 4→6', {'A':6})
scen('A 4→6, usure -25 %', {'A':6}, usure=0.75)
scen('S 8→12', {'S':12})
scen('A 4→6, S 8→12, S+ 16→24', {'A':6,'S':12,'S+':24})
scen('idem, usure -25 %', {'A':6,'S':12,'S+':24}, usure=0.75)
scen('B 2→1', {'B':1})
scen('B 2→1, A 4→6', {'B':1,'A':6})
scen('B 2→1, A 4→6, usure -25 %', {'B':1,'A':6}, usure=0.75)
