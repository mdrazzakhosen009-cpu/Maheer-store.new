import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const uploadDir = path.resolve(__dirname, process.env.UPLOAD_DIR || "public/uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const db = createClient({
  url: process.env.DATABASE_URL || "file:maheer.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(5).toString("hex")}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("শুধু JPG, PNG, WEBP বা GIF image upload করা যাবে।"), ok);
  }
});

async function initDb() {
  await db.batch([
    { sql: `CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)` },
    { sql: `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, phone TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)` },
    { sql: `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL, description TEXT NOT NULL, image_url TEXT NOT NULL, stock INTEGER DEFAULT 0, featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)` },
    { sql: `CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL, whatsapp TEXT, active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)` },
    { sql: `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_code TEXT UNIQUE NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, address TEXT NOT NULL, city TEXT NOT NULL, payment_method TEXT NOT NULL, transaction_id TEXT, total REAL NOT NULL, status TEXT DEFAULT 'Pending', payment_status TEXT DEFAULT 'Unpaid', created_at TEXT DEFAULT CURRENT_TIMESTAMP)` },
    { sql: `CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT NOT NULL, price REAL NOT NULL, quantity INTEGER NOT NULL)` },
    { sql: `CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, message TEXT NOT NULL, status TEXT DEFAULT 'New', created_at TEXT DEFAULT CURRENT_TIMESTAMP)` },
    { sql: `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)` }
  ]);

  const admin = await db.execute({ sql: "SELECT id FROM admins WHERE email = ?", args: [process.env.ADMIN_EMAIL || "admin@maheershop.com"] });
  if (!admin.rows.length) {
    const email = process.env.ADMIN_EMAIL || "admin@maheershop.com";
    const password = process.env.ADMIN_PASSWORD || "ChangeMe123!";
    const hash = await bcrypt.hash(password, 12);
    await db.execute({ sql: "INSERT INTO admins(email,password_hash) VALUES(?,?)", args: [email, hash] });
  }

  const count = await db.execute("SELECT COUNT(*) AS count FROM products");
  if (Number(count.rows[0].count) === 0) {
    for (let i = 0; i < productsSeed.length; i++) {
      const p = productsSeed[i];
      await db.execute({
        sql: "INSERT INTO products(name,category,price,description,image_url,stock,featured,active) VALUES(?,?,?,?,?,?,?,1)",
        args: [p.name,p.category,p.price,p.description,`/assets/product-${i+1}.svg`,50,i < 6 ? 1 : 0]
      });
    }
  }
  const defaults = {
    about_title: "MAHEER STORE",
    about_text: "MAHEER STORE-এ যত্নের প্রতিদিনের প্রয়োজনীয় skincare products বেছে নিন। সুন্দর, সহজ ও বিশ্বাসযোগ্য shopping experience আমাদের অগ্রাধিকার।",
    phone: "+880 1XXX-XXXXXX",
    email: "support@maheersstore.com",
    address: "Bangladesh",
    whatsapp: "",
    instagram: "",
    facebook: "",
    tiktok: "",
    bkash: "",
    nagad: "",
    rocket: "",
    delivery_inside: "60",
    delivery_outside: "120"
  };
  for (const [key,value] of Object.entries(defaults)) {
    await db.execute({ sql:"INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)", args:[key,value] });
  }
}

const productsSeed = [
  ["Glow Balance Cleanser","ক্লিনজার",790,"Gentle daily cleanser for a fresh, balanced feel."],
  ["Hydra Calm Serum","সিরাম",980,"Lightweight hydrating serum for everyday skincare."],
  ["Daily Barrier Cream","ময়েশ্চারাইজার",1150,"Comforting moisturizer for a soft skin barrier."],
  ["Radiance Vitamin C","সিরাম",920,"Brightening daily serum with a lightweight finish."],
  ["Soft Foam Face Wash","ক্লিনজার",650,"Refreshing foam cleanser for a clean, comfortable finish."],
  ["Pure Niacinamide 10%","সিরাম",840,"Minimal daily serum for a refined skincare routine."],
  ["Sun Veil SPF 50","সানস্ক্রিন",850,"Daily sunscreen with a smooth, wearable texture."],
  ["Deep Hydration Gel","ময়েশ্চারাইজার",890,"Cooling gel moisturizer for lightweight hydration."],
  ["Repair Night Cream","নাইট কেয়ার",1250,"Rich night cream for a calm overnight routine."],
  ["Scalp & Hair Serum","হেয়ার কেয়ার",980,"Lightweight scalp and hair care serum."],
  ["Silk Body Lotion","বডি কেয়ার",720,"Daily body lotion with a soft, silky feel."],
  ["Gentle Exfoliating Toner","টোনার",760,"A gentle toner to complete your skincare routine."]
].map(([name,category,price,description])=>({name,category,price,description}));

function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" }); }
function auth(requiredRole) {
  return async (req,res,next)=>{
    try {
      const header = req.headers.authorization || "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) return res.status(401).json({error:"Authentication required"});
      const decoded = jwt.verify(token, JWT_SECRET);
      if (requiredRole && decoded.role !== requiredRole) return res.status(403).json({error:"Access denied"});
      req.user = decoded; next();
    } catch { res.status(401).json({error:"Invalid or expired session"}); }
  };
}
function cleanProduct(row){ return {...row, price:Number(row.price), stock:Number(row.stock), featured:Boolean(row.featured), active:Boolean(row.active)}; }

app.get("/api/health", (_req,res)=>res.json({ok:true}));

app.post("/api/auth/register", authLimiter, async (req,res)=>{
  const {name,email,password,phone=""}=req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({error:"নাম, valid email এবং কমপক্ষে ৬ অক্ষরের password দিন।"});
  try {
    const hash=await bcrypt.hash(password,12);
    const r=await db.execute({sql:"INSERT INTO users(name,email,password_hash,phone) VALUES(?,?,?,?)",args:[name.trim(),email.toLowerCase().trim(),hash,phone.trim()]});
    res.status(201).json({token:signToken({id:Number(r.lastInsertRowid),role:"user",email:email.toLowerCase()}),user:{name,email,phone}});
  } catch { res.status(409).json({error:"এই email দিয়ে account আগে থেকেই আছে।"}); }
});
app.post("/api/auth/login", authLimiter, async (req,res)=>{
  const {email,password}=req.body;
  const r=await db.execute({sql:"SELECT * FROM users WHERE email=?",args:[(email||"").toLowerCase().trim()]});
  if(!r.rows.length || !(await bcrypt.compare(password||"",r.rows[0].password_hash))) return res.status(401).json({error:"Email বা password সঠিক নয়।"});
  const u=r.rows[0]; res.json({token:signToken({id:Number(u.id),role:"user",email:u.email}),user:{name:u.name,email:u.email,phone:u.phone}});
});
app.post("/api/admin/login", authLimiter, async (req,res)=>{
  const {email,password}=req.body;
  const r=await db.execute({sql:"SELECT * FROM admins WHERE email=?",args:[(email||"").toLowerCase().trim()]});
  if(!r.rows.length || !(await bcrypt.compare(password||"",r.rows[0].password_hash))) return res.status(401).json({error:"Admin credentials সঠিক নয়।"});
  res.json({token:signToken({id:Number(r.rows[0].id),role:"admin",email:r.rows[0].email}),admin:{email:r.rows[0].email}});
});
app.put("/api/admin/password",auth("admin"),async(req,res)=>{
  const {currentPassword,newPassword}=req.body;
  if(!newPassword || newPassword.length<8) return res.status(400).json({error:"নতুন password কমপক্ষে ৮ অক্ষরের হতে হবে।"});
  const r=await db.execute({sql:"SELECT * FROM admins WHERE id=?",args:[req.user.id]});
  if(!r.rows.length || !(await bcrypt.compare(currentPassword||"",r.rows[0].password_hash))) return res.status(400).json({error:"বর্তমান password সঠিক নয়।"});
  const hash=await bcrypt.hash(newPassword,12);
  await db.execute({sql:"UPDATE admins SET password_hash=? WHERE id=?",args:[hash,req.user.id]});
  res.json({ok:true});
});

app.get("/api/products",async(req,res)=>{
  const {q="",category="",featured=""}=req.query;
  const params=[]; let sql="SELECT * FROM products WHERE active=1";
  if(q){sql+=" AND (name LIKE ? OR category LIKE ?)";params.push(`%${q}%`,`%${q}%`);}
  if(category){sql+=" AND category=?";params.push(category);}
  if(featured==="1")sql+=" AND featured=1";
  sql+=" ORDER BY featured DESC, id DESC";
  const r=await db.execute({sql,args:params});res.json(r.rows.map(cleanProduct));
});
app.get("/api/products/:id",async(req,res)=>{
  const r=await db.execute({sql:"SELECT * FROM products WHERE id=? AND active=1",args:[req.params.id]});
  if(!r.rows.length)return res.status(404).json({error:"Product not found"});res.json(cleanProduct(r.rows[0]));
});

app.get("/api/settings/public",async(_req,res)=>{
  const r=await db.execute("SELECT key,value FROM settings");
  const out={};r.rows.forEach(x=>out[x.key]=x.value);res.json(out);
});
app.get("/api/agents/public",async(_req,res)=>{
  const r=await db.execute("SELECT id,name,phone,whatsapp FROM agents WHERE active=1 ORDER BY id");
  res.json(r.rows);
});
app.post("/api/contact",async(req,res)=>{
  const {name,email="",phone="",message}=req.body;
  if(!name || !message)return res.status(400).json({error:"নাম ও message দিন।"});
  await db.execute({sql:"INSERT INTO contact_messages(name,email,phone,message) VALUES(?,?,?,?)",args:[name,email,phone,message]});
  res.status(201).json({ok:true});
});

app.post("/api/orders",async(req,res)=>{
  const {customer_name,phone,email="",address,city,payment_method,transaction_id="",items}=req.body;
  if(!customer_name||!phone||!address||!city||!payment_method||!Array.isArray(items)||!items.length)return res.status(400).json({error:"Order information অসম্পূর্ণ।"});
  if(payment_method!=="COD" && !transaction_id.trim())return res.status(400).json({error:"Online payment হলে Transaction ID দিন।"});
  const ids=items.map(x=>Number(x.product_id)).filter(Boolean);
  if(ids.length!==items.length)return res.status(400).json({error:"Invalid cart item"});
  const placeholders=ids.map(()=>"?").join(",");
  const pr=await db.execute({sql:`SELECT * FROM products WHERE id IN (${placeholders}) AND active=1`,args:ids});
  const map=new Map(pr.rows.map(p=>[Number(p.id),p]));
  let total=0;const normalized=[];
  for(const item of items){
    const p=map.get(Number(item.product_id));const qty=Math.max(1,Math.min(20,Number(item.quantity)||1));
    if(!p)return res.status(400).json({error:"একটি product আর available নেই।"});
    if(Number(p.stock)<qty)return res.status(400).json({error:`${p.name} এর পর্যাপ্ত stock নেই।`});
    total+=Number(p.price)*qty;normalized.push({p,qty});
  }
  const code="SAR-"+String(Date.now()).slice(-6);
  await db.execute({sql:"INSERT INTO orders(order_code,customer_name,phone,email,address,city,payment_method,transaction_id,total,payment_status) VALUES(?,?,?,?,?,?,?,?,?,?)",args:[code,customer_name,phone,email,address,city,payment_method,transaction_id,total,payment_method==="COD"?"Unpaid":"Submitted"]});
  const oid=(await db.execute({sql:"SELECT id FROM orders WHERE order_code=?",args:[code]})).rows[0].id;
  for(const x of normalized){
    await db.execute({sql:"INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,?,?,?,?)",args:[oid,x.p.id,x.p.name,x.p.price,x.qty]});
    await db.execute({sql:"UPDATE products SET stock=stock-? WHERE id=?",args:[x.qty,x.p.id]});
  }
  res.status(201).json({ok:true,order_code:code,total});
});
app.get("/api/orders/track/:code",async(req,res)=>{
  const r=await db.execute({sql:"SELECT order_code,customer_name,total,status,payment_status,payment_method,created_at FROM orders WHERE order_code=?",args:[req.params.code.toUpperCase()]});
  if(!r.rows.length)return res.status(404).json({error:"Order পাওয়া যায়নি।"});
  const o=r.rows[0];const items=await db.execute({sql:"SELECT product_name,price,quantity FROM order_items WHERE order_id=(SELECT id FROM orders WHERE order_code=?)",args:[req.params.code.toUpperCase()]});
  res.json({...o,total:Number(o.total),items:items.rows});
});

app.get("/api/admin/dashboard",auth("admin"),async(_req,res)=>{
  const [o,p,a,c]=await Promise.all([db.execute("SELECT COUNT(*) count, COALESCE(SUM(total),0) revenue FROM orders"),db.execute("SELECT COUNT(*) count FROM products WHERE active=1"),db.execute("SELECT COUNT(*) count FROM agents WHERE active=1"),db.execute("SELECT COUNT(*) count FROM contact_messages WHERE status='New'")]);
  res.json({orders:Number(o.rows[0].count),revenue:Number(o.rows[0].revenue),products:Number(p.rows[0].count),agents:Number(a.rows[0].count),newMessages:Number(c.rows[0].count)});
});
app.get("/api/admin/orders",auth("admin"),async(_req,res)=>{
  const r=await db.execute("SELECT * FROM orders ORDER BY id DESC");res.json(r.rows.map(x=>({...x,total:Number(x.total)})));
});
app.put("/api/admin/orders/:id",auth("admin"),async(req,res)=>{
  const {status,payment_status}=req.body;
  await db.execute({sql:"UPDATE orders SET status=COALESCE(?,status), payment_status=COALESCE(?,payment_status) WHERE id=?",args:[status||null,payment_status||null,req.params.id]});
  res.json({ok:true});
});
app.get("/api/admin/products",auth("admin"),async(_req,res)=>{const r=await db.execute("SELECT * FROM products ORDER BY id DESC");res.json(r.rows.map(cleanProduct));});
app.post("/api/admin/products",auth("admin"),upload.single("image"),async(req,res)=>{
  const {name,category,price,description,stock=0,featured=0}=req.body;
  if(!name||!category||!price||!description)return res.status(400).json({error:"সব required field দিন।"});
  const image=req.file?`/uploads/${req.file.filename}`:"/assets/product-1.svg";
  const r=await db.execute({sql:"INSERT INTO products(name,category,price,description,image_url,stock,featured) VALUES(?,?,?,?,?,?,?)",args:[name,category,Number(price),description,image,Number(stock)||0,Number(featured)?1:0]});
  res.status(201).json({id:Number(r.lastInsertRowid)});
});
app.put("/api/admin/products/:id",auth("admin"),upload.single("image"),async(req,res)=>{
  const {name,category,price,description,stock=0,featured=0,active=1}=req.body;
  const old=await db.execute({sql:"SELECT image_url FROM products WHERE id=?",args:[req.params.id]});
  const image=req.file?`/uploads/${req.file.filename}`:(old.rows[0]?.image_url||"/assets/product-1.svg");
  await db.execute({sql:"UPDATE products SET name=?,category=?,price=?,description=?,image_url=?,stock=?,featured=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",args:[name,category,Number(price),description,image,Number(stock)||0,Number(featured)?1:0,Number(active)?1:0,req.params.id]});
  res.json({ok:true});
});
app.delete("/api/admin/products/:id",auth("admin"),async(req,res)=>{await db.execute({sql:"UPDATE products SET active=0 WHERE id=?",args:[req.params.id]});res.json({ok:true});});

app.get("/api/admin/agents",auth("admin"),async(_req,res)=>{const r=await db.execute("SELECT * FROM agents ORDER BY id DESC");res.json(r.rows);});
app.post("/api/admin/agents",auth("admin"),async(req,res)=>{const {name,phone,whatsapp=""}=req.body;if(!name||!phone)return res.status(400).json({error:"Agent name ও phone দিন।"});await db.execute({sql:"INSERT INTO agents(name,phone,whatsapp) VALUES(?,?,?)",args:[name,phone,whatsapp]});res.status(201).json({ok:true});});
app.put("/api/admin/agents/:id",auth("admin"),async(req,res)=>{const {name,phone,whatsapp="",active=1}=req.body;await db.execute({sql:"UPDATE agents SET name=?,phone=?,whatsapp=?,active=? WHERE id=?",args:[name,phone,whatsapp,Number(active)?1:0,req.params.id]});res.json({ok:true});});
app.delete("/api/admin/agents/:id",auth("admin"),async(req,res)=>{await db.execute({sql:"DELETE FROM agents WHERE id=?",args:[req.params.id]});res.json({ok:true});});

app.get("/api/admin/messages",auth("admin"),async(_req,res)=>{const r=await db.execute("SELECT * FROM contact_messages ORDER BY id DESC");res.json(r.rows);});
app.put("/api/admin/messages/:id",auth("admin"),async(req,res)=>{await db.execute({sql:"UPDATE contact_messages SET status=? WHERE id=?",args:[req.body.status||"Read",req.params.id]});res.json({ok:true});});
app.get("/api/admin/settings",auth("admin"),async(_req,res)=>{const r=await db.execute("SELECT key,value FROM settings");const o={};r.rows.forEach(x=>o[x.key]=x.value);res.json(o);});
app.put("/api/admin/settings",auth("admin"),async(req,res)=>{
  const allowed=["about_title","about_text","phone","email","address","whatsapp","instagram","facebook","tiktok","bkash","nagad","rocket","delivery_inside","delivery_outside"];
  for(const key of allowed) if(Object.prototype.hasOwnProperty.call(req.body,key)) await db.execute({sql:"INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",args:[key,String(req.body[key]??"")]});
  res.json({ok:true});
});

app.post("/api/chat",chatLimiter,async(req,res)=>{
  const {message,history=[]}=req.body;
  if(!message)return res.status(400).json({error:"Message দিন।"});
  if(!process.env.GEMINI_API_KEY)return res.status(503).json({error:"Chat service এখন configure করা হয়নি।"});
  const settingsRows=await db.execute("SELECT key,value FROM settings");
  const s={};settingsRows.rows.forEach(x=>s[x.key]=x.value);
  const pr=await db.execute("SELECT name,category,price,description,stock FROM products WHERE active=1 ORDER BY featured DESC,id DESC LIMIT 20");
  const catalog=pr.rows.map(p=>`${p.name} | ${p.category} | ৳${p.price} | stock ${p.stock} | ${p.description}`).join("\n");
  const system=`You are MAHEER STORE's friendly Bengali skincare shopping assistant. Only discuss the store, skincare products, orders, delivery, payments, contact and skincare shopping guidance. Do not invent prices, products, discounts, policies or availability. If unsure, say you can connect the customer with an agent. Keep replies concise and helpful. Store info: ${s.about_text}; phone ${s.phone}; address ${s.address}; delivery inside ${s.delivery_inside} BDT, outside ${s.delivery_outside} BDT. Catalog:\n${catalog}`;
  const contents=[{role:"user",parts:[{text:system}]}];
  for(const h of Array.isArray(history)?history.slice(-8):[]) contents.push({role:h.role==="assistant"?"model":"user",parts:[{text:String(h.text).slice(0,1000)}]});
  contents.push({role:"user",parts:[{text:String(message).slice(0,1500)}]});
  try{
    const model=process.env.GEMINI_MODEL||"gemini-3.1-flash-lite";
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents,generationConfig:{temperature:0.35,maxOutputTokens:400}})});
    const data=await r.json();
    if(!r.ok){ console.error("Gemini API error",r.status,data?.error?.message||data?.error||"unknown"); return res.status(502).json({error:"Chat service সাময়িকভাবে unavailable।"});}
    const text=data.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join("").trim();
    res.json({reply:text||"দুঃখিত, এখন উত্তর দিতে পারছি না।"});
  }catch(err){console.error("Gemini request failed",err?.message||err);res.status(502).json({error:"Chat service সাময়িকভাবে unavailable।"});}
});

app.use((err,_req,res,_next)=>{ console.error(err); res.status(400).json({error:err.message||"Request failed"}); });

initDb().then(()=>app.listen(PORT,()=>console.log(`MAHEER STORE running on ${PORT}`))).catch(err=>{console.error(err);process.exit(1);});
