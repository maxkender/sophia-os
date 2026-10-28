import {createCanvas,loadImage} from "@napi-rs/canvas";
import fs from "node:fs";
const bk=JSON.parse(fs.readFileSync("donnees/images.json"));const B=Array.isArray(bk)?bk:bk.images;
const out="donnees/hash_accroches.json";const H=fs.existsSync(out)?JSON.parse(fs.readFileSync(out)):{};
const o=fs.readdirSync("originaux").map(f=>JSON.parse(fs.readFileSync("originaux/"+f)));
const usedHook=new Set(o.map(x=>x.slides[0].media_id));
const todo=B.filter(x=>(x.est_hook||usedHook.has(x.id))&&!H[x.id]);
async function hash(img){const c=createCanvas(9,8);const g=c.getContext("2d");g.drawImage(img,0,0,9,8);const d=g.getImageData(0,0,9,8).data;let bits="";
for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(y*9+x)*4,j=(y*9+x+1)*4;const a=d[i]+d[i+1]+d[i+2],b=d[j]+d[j+1]+d[j+2];bits+=a>b?"1":"0"}return bits}
let k=0;async function run(x){try{const p="donnees/cache/"+x.id+".jpg";let src;if(fs.existsSync(p))src=fs.readFileSync(p);else{const r=await fetch(x.url);src=Buffer.from(await r.arrayBuffer());}
const img=await loadImage(src);H[x.id]=await hash(img);}catch(e){H[x.id]=null}k++}
for(let i=0;i<todo.length;i+=12)await Promise.all(todo.slice(i,i+12).map(run));
fs.writeFileSync(out,JSON.stringify(H));
const ham=(a,b)=>{let n=0;for(let i=0;i<64;i++)if(a[i]!==b[i])n++;return n};
const usedH=[...usedHook].map(id=>H[id]).filter(Boolean);
const hooks=B.filter(x=>x.est_hook&&H[x.id]);
// clusters
const reps=[];for(const x of hooks){if(!reps.some(r=>ham(r,H[x.id])<=10))reps.push(H[x.id])}
const libres=hooks.filter(x=>!usedHook.has(x.id)&&!usedH.some(u=>ham(u,H[x.id])<=10));
const lr=[];for(const x of libres){if(!lr.some(r=>ham(H[r.id],H[x.id])<=10))lr.push(x)}
console.log("hashées",k,"| accroches",hooks.length,"visuellement distinctes",reps.length,"| déjà utilisées",usedHook.size,"| distinctes jamais vues chez nous",lr.length);
fs.writeFileSync("sortie/accroches-libres.txt",lr.map(x=>x.id).join("\n"));
