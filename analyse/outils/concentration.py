"""Concentration des vues : moyenne contre médiane, Pareto par post, par compte, par contenu, viraux.

Usage : python3 -I analyse/outils/concentration.py rows.json   (sortie de requetes/17_concentration.sql)
"""
import json, sys
import numpy as np, pandas as pd
d = pd.DataFrame(json.load(open(sys.argv[1])))
for c in ['vues','likes','partages','age_releve_h']: d[c] = pd.to_numeric(d[c], errors='coerce')
d['jour'] = pd.to_datetime(d.jour); d['rappel'] = d.rappel.astype(bool); d['original'] = d.original.astype(bool)
tout = d.copy()
s = d[d.app == 'sophia'].copy()
print(f"TOUT : {len(tout)} posts, {tout.vues.sum()/1e6:.2f} M vues, apps : {tout.groupby('app').vues.sum().div(1e6).round(2).to_dict()}")
print(f"SOPHIA : {len(s)} posts, {s.vues.sum()/1e6:.2f} M vues, {s.compte_id.nunique()} comptes, {s.contenu_id.nunique()} contenus, {s.jour.nunique()} jours, rappels {s.rappel.mean()*100:.1f} %")

def gini(x):
    x = np.sort(np.asarray(x, float)); n = len(x); return (2*np.sum((np.arange(1,n+1))*x)/(n*x.sum()) - (n+1)/n)
def pareto(x, nom):
    x = np.sort(np.asarray(x, float))[::-1]; tot = x.sum(); cum = np.cumsum(x)/tot; n = len(x)
    parts = {p: cum[max(1,int(round(n*p/100)))-1]*100 for p in [1,2,5,10,20,30,50]}
    besoin = {q: (np.searchsorted(cum, q/100)+1)/n*100 for q in [50,80,90]}
    print(f"  {nom}: n={n} gini={gini(x):.2f} | part des vues du top " + ", ".join(f"{p} % → {v:.0f} %" for p,v in parts.items()) + " | " + ", ".join(f"{q} % des vues = {v:.1f} % des {nom}" for q,v in besoin.items()))
    return parts, besoin

v = s.vues.values
print("\n== Distribution des vues par post (Sophia)")
q = np.percentile(v, [10,25,50,75,90,95,99])
print(f"  moyenne {v.mean():.0f} · médiane {np.median(v):.0f} · ratio moyenne/médiane {v.mean()/np.median(v):.2f} · p10 {q[0]:.0f} p25 {q[1]:.0f} p75 {q[3]:.0f} p90 {q[4]:.0f} p95 {q[5]:.0f} p99 {q[6]:.0f} · max {v.max():.0f}")
print(f"  posts sous la moyenne : {100*(v < v.mean()).mean():.0f} %")
bins = [-1, 999, 2999, 9999, 49999, 99999, 10**9]; labels = ['< 1 k','1-3 k','3-10 k','10-50 k','50-100 k','≥ 100 k']
s['tranche'] = pd.cut(s.vues, bins, labels=labels)
t = s.groupby('tranche', observed=True).agg(posts=('vues','size'), vues=('vues','sum'), partages=('partages','sum'))
t['pct_posts'] = 100*t.posts/t.posts.sum(); t['pct_vues'] = 100*t.vues/t.vues.sum(); t['pct_partages'] = 100*t.partages/t.partages.sum()
t['posts_j'] = t.posts/s.jour.nunique()
print(t.round(1).to_string())
print("\n== Pareto posts")
pareto(v, 'posts')
mid = s[(s.vues >= q[1]) & (s.vues <= q[3])]
print(f"  la moitié 'médiane' des posts (entre p25 et p75) : {100*len(mid)/len(s):.0f} % des posts → {100*mid.vues.sum()/s.vues.sum():.1f} % des vues")
print(f"  posts sous la médiane : 50 % des posts → {100*s[s.vues < np.median(v)].vues.sum()/s.vues.sum():.1f} % des vues")
print(f"  posts ≥ 10 k : {100*(s.vues>=10000).mean():.1f} % des posts → {100*s[s.vues>=10000].vues.sum()/s.vues.sum():.1f} % des vues ; ≥ 50 k : {100*(s.vues>=50000).mean():.2f} % → {100*s[s.vues>=50000].vues.sum()/s.vues.sum():.1f} %")
print("  partages : top 10 % des posts par vues portent", f"{100*s.sort_values('vues',ascending=False).head(int(len(s)*0.1)).partages.sum()/s.partages.sum():.0f} % des partages")

print("\n== Par semaine (stabilité)")
s['sem'] = s.jour.dt.to_period('W').astype(str)
w = s.groupby('sem').agg(posts=('vues','size'), vues=('vues','sum'), med=('vues','median'), ge10k=('vues', lambda x:(x>=10000).sum()), ge50k=('vues', lambda x:(x>=50000).sum()))
w['pct_vues_ge10k'] = s.groupby('sem').apply(lambda g: 100*g[g.vues>=10000].vues.sum()/g.vues.sum())
w['pct_vues_top5'] = s.groupby('sem').apply(lambda g: 100*g.vues.nlargest(5).sum()/g.vues.sum())
print(w.round(1).to_string())

print("\n== Jour par jour : qu'est-ce qui fait bouger le total ?")
j = s.groupby('jour').agg(total=('vues','sum'), top5=('vues', lambda x: x.nlargest(5).sum()), top1=('vues','max'), posts=('vues','size'), med=('vues','median'))
j['reste'] = j.total - j.top5
print(f"  jours {len(j)} · total moyen {j.total.mean()/1e3:.0f} k · top 5 posts du jour = {100*(j.top5/j.total).mean():.0f} % du total en moyenne · écart-type du total {j.total.std()/1e3:.0f} k, du top 5 {j.top5.std()/1e3:.0f} k, du reste {j.reste.std()/1e3:.0f} k")
print(f"  corrélation total ↔ top 5 : {j.total.corr(j.top5):.2f} · total ↔ médiane du jour : {j.total.corr(j.med):.2f} · total ↔ nb posts : {j.total.corr(j.posts):.2f}")
print(f"  jours : meilleur {j.total.max()/1e3:.0f} k (top5 {j.loc[j.total.idxmax(),'top5']/1e3:.0f} k), pire {j.total.min()/1e3:.0f} k")

print("\n== Par compte (30 jours)")
a = s.groupby('compte_id').agg(vues=('vues','sum'), posts=('vues','size'), med=('vues','median'), mx=('vues','max'), ge10k=('vues', lambda x:(x>=10000).sum()), langue=('langue','first'), compte=('compte','first'), classement=('classement','first'))
a = a[a.posts >= 5]
print(f"  comptes (≥ 5 posts) {len(a)} · vues/compte moyenne {a.vues.mean()/1e3:.0f} k, médiane {a.vues.median()/1e3:.0f} k, ratio {a.vues.mean()/a.vues.median():.2f} · p90 {a.vues.quantile(.9)/1e3:.0f} k, max {a.vues.max()/1e3:.0f} k")
pareto(a.vues.values, 'comptes')
print(f"  comptes sans aucun post ≥ 10 k sur 30 j : {100*(a.ge10k==0).mean():.0f} % · comptes avec ≥ 3 posts ≥ 10 k : {100*(a.ge10k>=3).mean():.0f} %")
print(f"  part des vues des comptes dont la MÉDIANE ≥ 3 k : comptes {100*(a.med>=3000).mean():.0f} % → vues {100*a[a.med>=3000].vues.sum()/a.vues.sum():.0f} %")
# top-compte : viral ou régularité ?
top = a.sort_values('vues', ascending=False).head(max(1,int(len(a)*0.1)))
print(f"  top 10 % comptes : part de leurs vues venant de leur meilleur post : {100*(top.mx/top.vues).mean():.0f} % en moyenne ; médiane de ces comptes {top.med.median():.0f} vs {a.med.median():.0f} pour tous")
print("  top 10 par vues :"); print(top.head(10)[['compte','langue','classement','posts','vues','med','mx','ge10k']].to_string())
# stabilité entre les deux quinzaines
s['moitie'] = np.where(s.jour < pd.Timestamp('2026-10-05'), 'q1', 'q2')
h = s.pivot_table(index='compte_id', columns='moitie', values='vues', aggfunc='sum').dropna()
hp = s.pivot_table(index='compte_id', columns='moitie', values='vues', aggfunc='size').dropna()
h = h[(hp.q1>=4)&(hp.q2>=4)]
print(f"  stabilité comptes (≥ 4 posts par quinzaine, n={len(h)}) : corrélation de rang q1↔q2 = {h.q1.rank().corr(h.q2.rank()):.2f}")
k = max(1,int(len(h)*0.2)); t1 = set(h.q1.nlargest(k).index); t2 = set(h.q2.nlargest(k).index)
print(f"  top 20 % comptes de la 1re quinzaine encore top 20 % en 2e : {100*len(t1&t2)/k:.0f} % · part des vues q2 des top-20 % de q1 : {100*h.loc[list(t1),'q2'].sum()/h.q2.sum():.0f} % (attendu si hasard : 20 %)")
hm = s.pivot_table(index='compte_id', columns='moitie', values='vues', aggfunc='median').dropna().loc[h.index]
print(f"  médiane par compte q1↔q2 : spearman {hm.q1.rank().corr(hm.q2.rank()):.2f}")

print("\n== Par contenu")
c = s.groupby('contenu_id').agg(vues=('vues','sum'), posts=('vues','size'), mx=('vues','max'), label=('label','first'), original=('original','first'))
pareto(c.vues.values, 'contenus')
print(f"  contenus ayant au moins un post ≥ 10 k : {100*(c.mx>=10000).mean():.0f} % des contenus → {100*c[c.mx>=10000].vues.sum()/c.vues.sum():.0f} % des vues ; ≥ 50 k : {100*(c.mx>=50000).mean():.1f} % → {100*c[c.mx>=50000].vues.sum()/c.vues.sum():.0f} %")
print(f"  contenus à 1 seul post dans la fenêtre : {100*(c.posts==1).mean():.0f} % des contenus, {100*c[c.posts==1].vues.sum()/c.vues.sum():.0f} % des vues")

print("\n== D'où viennent les posts ≥ 50 k (viraux) ?")
vir = s[s.vues>=50000]
print(f"  {len(vir)} viraux / {s.jour.nunique()} jours = {len(vir)/s.jour.nunique():.1f} par jour · {100*vir.vues.sum()/s.vues.sum():.0f} % des vues · rappels J+7 : {100*vir.rappel.mean():.0f} % · originaux : {100*vir.original.mean():.0f} % (vs {100*s.original.mean():.1f} % des posts)")
print("  par label (viraux vs posts) :", {l: f"{100*n/len(vir):.0f} % / {100*(s.label==l).mean():.0f} %" for l,n in vir.label.value_counts().head(6).items()})
print("  par langue :", {l: f"{100*n/len(vir):.0f} % / {100*(s.langue==l).mean():.0f} %" for l,n in vir.langue.value_counts().head(6).items()})
print("  comptes distincts :", vir.compte_id.nunique(), "sur", s.compte_id.nunique(), "· contenus distincts :", vir.contenu_id.nunique())

print("\n== Toutes applications confondues (même fenêtre)")
pareto(tout.vues.values, 'posts (tout)')
print(f"  moyenne {tout.vues.mean():.0f} · médiane {tout.vues.median():.0f} · ≥ 10 k : {100*(tout.vues>=10000).mean():.1f} % des posts → {100*tout[tout.vues>=10000].vues.sum()/tout.vues.sum():.0f} % des vues")
