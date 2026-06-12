import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dbPath = path.join(root, 'data', 'db.json');
const uploadsDir = path.join(root, 'uploads');
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
const SECRET = process.env.JWT_SECRET || 'epmi-gaming-dev-secret';
const PORT = process.env.PORT || 4000;

const keys = ['users','events','projects','media','messages','memberships','applications','participations','activity'];
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};

function ensure(){
  fs.mkdirSync(path.dirname(dbPath), {recursive:true});
  fs.mkdirSync(uploadsDir, {recursive:true});
  if(!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify(Object.fromEntries(keys.map(k=>[k,[]])), null, 2));
}
function read(){ ensure(); let db={}; try{ db=JSON.parse(fs.readFileSync(dbPath,'utf8')); }catch{ db={}; } keys.forEach(k=>{ if(!Array.isArray(db[k])) db[k]=[]; }); return db; }
function write(db){ ensure(); fs.writeFileSync(dbPath, JSON.stringify(db,null,2)); }
function id(){ return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(12).toString('hex'); }
function publicUser(u){ if(!u) return null; const {password, ...safe}=u; return safe; }
function log(db,label){ db.activity ||= []; db.activity.unshift({id:id(), label, date:new Date().toISOString()}); db.activity=db.activity.slice(0,200); }
function normalizeImage(body={}){ return {...body, image: typeof body.image === 'object' ? (body.image?.url || body.image?.path || '') : (body.image || '')}; }
function send(res, status, data, headers={}){ const isBuffer=Buffer.isBuffer(data); res.writeHead(status, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS', ...(isBuffer?{}:{'Content-Type':'application/json; charset=utf-8'}), ...headers}); res.end(isBuffer ? data : JSON.stringify(data)); }
function tokenFor(user){ const payload = Buffer.from(JSON.stringify({id:user.id,email:user.email,role:user.role,name:user.name,ts:Date.now()})).toString('base64url'); const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url'); return `${payload}.${sig}`; }
function verifyToken(raw){ if(!raw) return null; const [payload,sig] = raw.replace('Bearer ','').split('.'); if(!payload||!sig) return null; const expected=crypto.createHmac('sha256', SECRET).update(payload).digest('base64url'); if(sig!==expected) return null; try{return JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));}catch{return null;} }
function requireAuth(req,res){ const user=verifyToken(req.headers.authorization||''); if(!user){send(res,401,{message:'Non authentifié'}); return null;} return user; }
function requireAdmin(req,res){ const user=requireAuth(req,res); if(!user) return null; if(user.role!=='admin'){send(res,403,{message:'Admin requis'}); return null;} return user; }
function body(req){ return new Promise(resolve=>{ const chunks=[]; req.on('data',c=>chunks.push(c)); req.on('end',()=>resolve(Buffer.concat(chunks))); }); }
async function jsonBody(req){ const b=await body(req); if(!b.length) return {}; try{return JSON.parse(b.toString('utf8'));}catch{return {};} }
function serveFile(res, file){ if(!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false; const ext=path.extname(file).toLowerCase(); res.writeHead(200, {'Content-Type': mime[ext] || 'application/octet-stream'}); fs.createReadStream(file).pipe(res); return true; }
async function upload(req,res){
  const user=requireAuth(req,res); if(!user) return;
  const buf=await body(req); const ct=req.headers['content-type']||''; const boundary=ct.match(/boundary=(.+)$/)?.[1];
  if(!boundary) return send(res,400,{message:'Image manquante'});
  const raw=buf.toString('binary'); const filename=(raw.match(/filename="([^\"]+)"/)?.[1] || `upload-${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g,'-');
  const start=raw.indexOf('\r\n\r\n'); if(start<0) return send(res,400,{message:'Image invalide'});
  const end=raw.lastIndexOf(`\r\n--${boundary}`); const fileBuf=Buffer.from(raw.slice(start+4, end>0?end:undefined),'binary');
  const final=`${Date.now()}-${filename}`; fs.mkdirSync(uploadsDir,{recursive:true}); fs.writeFileSync(path.join(uploadsDir,final), fileBuf); send(res,200,{url:`/uploads/${final}`});
}

async function route(req,res){
  if(req.method==='OPTIONS') return send(res,204,{});
  const url=new URL(req.url, `http://${req.headers.host}`); const p=url.pathname;
  try{
    if(p==='/api/health') return send(res,200,{ok:true});
    if(p==='/api/auth/login' && req.method==='POST'){ const data=await jsonBody(req); const db=read(); const user=db.users.find(u=>u.email===data.email && u.password===data.password); if(!user) return send(res,401,{message:'Identifiants invalides'}); return send(res,200,{token:tokenFor(user), user:publicUser(user)}); }
    if(p==='/api/auth/register' && req.method==='POST'){ const data=await jsonBody(req); const db=read(); if(db.users.some(u=>u.email===data.email)) return send(res,409,{message:'Email déjà utilisé'}); const user={id:id(),name:data.name||'Membre',email:data.email,password:data.password,role:'member',avatar:'/uploads/logo-epmi-gaming.png',membership:'Aucune',createdAt:new Date().toISOString()}; db.users.push(user); log(db,`Nouvel utilisateur: ${user.name}`); write(db); return send(res,200,{token:tokenFor(user), user:publicUser(user)}); }
    if(p==='/api/auth/change-password' && req.method==='POST'){ const user=requireAuth(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db.users.findIndex(u=>u.id===user.id); if(i<0) return send(res,404,{message:'Utilisateur introuvable'}); if(db.users[i].password!==data.currentPassword) return send(res,400,{message:'Mot de passe actuel incorrect'}); if(!data.newPassword || String(data.newPassword).length<6) return send(res,400,{message:'Le nouveau mot de passe doit contenir au moins 6 caractères'}); db.users[i].password=data.newPassword; log(db,'Mot de passe membre modifié'); write(db); return send(res,200,{ok:true}); }
    if(p==='/api/me' && req.method==='GET'){ const user=requireAuth(req,res); if(!user)return; const db=read(); return send(res,200,publicUser(db.users.find(u=>u.id===user.id))); }
    if(p==='/api/me' && req.method==='PUT'){ const user=requireAuth(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db.users.findIndex(u=>u.id===user.id); if(i<0)return send(res,404,{message:'Utilisateur introuvable'}); db.users[i]={...db.users[i],...data,id:user.id,role:db.users[i].role}; write(db); return send(res,200,publicUser(db.users[i])); }
    if(p==='/api/upload' && req.method==='POST') return upload(req,res);

    for(const entity of ['events','projects','media']){
      if(p===`/api/${entity}` && req.method==='GET') return send(res,200,read()[entity]);
      if(p===`/api/${entity}` && req.method==='POST'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const item={id:id(),...normalizeImage(data)}; db[entity].unshift(item); log(db,`Création ${entity}: ${item.title||item.name||item.id}`); write(db); return send(res,200,item); }
      const m=p.match(new RegExp(`^/api/${entity}/([^/]+)$`));
      if(m && req.method==='PUT'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db[entity].findIndex(x=>x.id===m[1]); if(i<0)return send(res,404,{message:'Introuvable'}); db[entity][i]={...db[entity][i],...normalizeImage(data),id:m[1]}; write(db); return send(res,200,db[entity][i]); }
      if(m && req.method==='DELETE'){ const user=requireAdmin(req,res); if(!user)return; const db=read(); db[entity]=db[entity].filter(x=>x.id!==m[1]); write(db); return send(res,200,{ok:true}); }
    }

    if(p==='/api/admin/users' && req.method==='GET'){ const user=requireAdmin(req,res); if(!user)return; return send(res,200,read().users.map(publicUser)); }
    if(p==='/api/admin/users' && req.method==='POST'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); if(data.email && db.users.some(u=>u.email===data.email)) return send(res,409,{message:'Email déjà utilisé'}); const item={id:id(),password:data.password||'membre123',role:'member',membership:'Aucune',createdAt:new Date().toISOString(),...data}; db.users.unshift(item); write(db); return send(res,200,publicUser(item)); }
    const userMatch=p.match(/^\/api\/admin\/users\/([^/]+)$/);
    if(userMatch && req.method==='PUT'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db.users.findIndex(u=>u.id===userMatch[1]); if(i<0)return send(res,404,{message:'Utilisateur introuvable'}); db.users[i]={...db.users[i],...data,id:userMatch[1]}; write(db); return send(res,200,publicUser(db.users[i])); }
    if(userMatch && req.method==='DELETE'){ const user=requireAdmin(req,res); if(!user)return; const db=read(); db.users=db.users.filter(u=>u.id!==userMatch[1]); write(db); return send(res,200,{ok:true}); }

    if(p==='/api/messages' && req.method==='POST'){ const data=await jsonBody(req); const db=read(); const item={id:id(),...data,status:'new',date:new Date().toISOString()}; db.messages.unshift(item); write(db); return send(res,200,item); }
    if(p==='/api/messages' && req.method==='GET'){ const user=requireAdmin(req,res); if(!user)return; return send(res,200,read().messages); }
    const msgMatch=p.match(/^\/api\/messages\/([^/]+)$/);
    if(msgMatch && req.method==='PUT'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db.messages.findIndex(x=>x.id===msgMatch[1]); if(i<0)return send(res,404,{message:'Introuvable'}); db.messages[i]={...db.messages[i],...data,id:msgMatch[1]}; write(db); return send(res,200,db.messages[i]); }
    if(msgMatch && req.method==='DELETE'){ const user=requireAdmin(req,res); if(!user)return; const db=read(); db.messages=db.messages.filter(x=>x.id!==msgMatch[1]); write(db); return send(res,200,{ok:true}); }

    if(p==='/api/memberships' && req.method==='POST'){ const user=requireAuth(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const item={id:id(),userId:user.id,...data,status:'active',date:new Date().toISOString()}; db.memberships.unshift(item); const u=db.users.find(x=>x.id===user.id); if(u) u.membership=data.plan; write(db); return send(res,200,item); }
    if(p==='/api/memberships' && req.method==='GET'){ const user=requireAdmin(req,res); if(!user)return; return send(res,200,read().memberships); }
    if(p==='/api/memberships/admin' && req.method==='POST'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const item={id:id(),status:'active',date:new Date().toISOString(),...data}; db.memberships.unshift(item); write(db); return send(res,200,item); }
    const memMatch=p.match(/^\/api\/memberships\/([^/]+)$/);
    if(memMatch && req.method==='PUT'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db.memberships.findIndex(x=>x.id===memMatch[1]); if(i<0)return send(res,404,{message:'Introuvable'}); db.memberships[i]={...db.memberships[i],...data,id:memMatch[1]}; write(db); return send(res,200,db.memberships[i]); }
    if(memMatch && req.method==='DELETE'){ const user=requireAdmin(req,res); if(!user)return; const db=read(); db.memberships=db.memberships.filter(x=>x.id!==memMatch[1]); write(db); return send(res,200,{ok:true}); }

    const join=p.match(/^\/api\/events\/([^/]+)\/join$/); if(join && req.method==='POST'){ const user=requireAuth(req,res); if(!user)return; const db=read(); if(!db.participations.some(x=>x.userId===user.id&&x.eventId===join[1])) db.participations.push({id:id(),userId:user.id,eventId:join[1],date:new Date().toISOString()}); write(db); return send(res,200,{ok:true}); }
    const apply=p.match(/^\/api\/projects\/([^/]+)\/apply$/); if(apply && req.method==='POST'){ const user=requireAuth(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const item={id:id(),projectId:apply[1],userId:user.id,...data,status:'pending',date:new Date().toISOString()}; db.applications.unshift(item); write(db); return send(res,200,item); }
    if(p==='/api/applications' && req.method==='GET'){ const user=requireAdmin(req,res); if(!user)return; return send(res,200,read().applications); }
    if(p==='/api/applications' && req.method==='POST'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const item={id:id(),status:'pending',date:new Date().toISOString(),...data}; db.applications.unshift(item); write(db); return send(res,200,item); }
    const appMatch=p.match(/^\/api\/applications\/([^/]+)$/);
    if(appMatch && req.method==='PUT'){ const user=requireAdmin(req,res); if(!user)return; const data=await jsonBody(req); const db=read(); const i=db.applications.findIndex(x=>x.id===appMatch[1]); if(i<0)return send(res,404,{message:'Introuvable'}); db.applications[i]={...db.applications[i],...data,id:appMatch[1]}; write(db); return send(res,200,db.applications[i]); }
    if(appMatch && req.method==='DELETE'){ const user=requireAdmin(req,res); if(!user)return; const db=read(); db.applications=db.applications.filter(x=>x.id!==appMatch[1]); write(db); return send(res,200,{ok:true}); }
    if(p==='/api/member/overview' && req.method==='GET'){ const user=requireAuth(req,res); if(!user)return; const db=read(); const rows=db.participations.filter(x=>x.userId===user.id); const events=rows.map(row=>({...row,event:db.events.find(e=>e.id===row.eventId)||null})).filter(x=>x.event); const now=new Date(); return send(res,200,{participations:rows,events,upcomingEvents:events.filter(x=>!x.event.date||new Date(x.event.date)>=now),pastEvents:events.filter(x=>x.event.date&&new Date(x.event.date)<now),applications:db.applications.filter(x=>x.userId===user.id),memberships:db.memberships.filter(x=>x.userId===user.id)}); }
    if(p==='/api/admin/stats' && req.method==='GET'){ const user=requireAdmin(req,res); if(!user)return; const db=read(); return send(res,200,{users:db.users.length,events:db.events.length,projects:db.projects.length,media:db.media.length,messages:db.messages.length,applications:db.applications.length,memberships:db.memberships.length,participations:db.participations.length,activity:(db.activity||[]).slice(0,20)}); }

    if(p.startsWith('/uploads/')){ const file=path.normalize(path.join(root, p)); if(!file.startsWith(root)) return send(res,403,{message:'Interdit'}); if(serveFile(res,file)) return; }
    if(p.startsWith('/api/')) return send(res,404,{message:'Route API introuvable'});
    const clean=decodeURIComponent(p.split('?')[0]); const candidate=path.normalize(path.join(frontendDist, clean)); if(candidate.startsWith(frontendDist) && serveFile(res,candidate)) return;
    if(serveFile(res,path.join(frontendDist,'index.html'))) return;
    return send(res,404,{message:'Frontend dist introuvable'});
  } catch(e){ console.error(e); return send(res,500,{message:'Erreur serveur', detail: process.env.NODE_ENV==='production' ? undefined : String(e?.stack||e)}); }
}

http.createServer(route).listen(PORT, ()=>console.log(`EPMI Gaming running on port ${PORT}`));
