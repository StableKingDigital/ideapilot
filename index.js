require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")
const multer = require("multer")
const path = require("path")
const Database = require("better-sqlite3")
const bcrypt = require("bcrypt")
const session = require("express-session")

const app = express()
const PORT = process.env.PORT || 3000

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

const upload = multer({ storage: multer.memoryStorage() })

app.use(express.json())

/* SESSION */

app.use(session({
secret: "ideapilot-secret",
resave: false,
saveUninitialized: false,
cookie:{
maxAge:1000*60*60*24
}
}))

/* DATABASE */

const db = new Database("ideapilot.db")

/* USERS */

db.prepare(`CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE,
 password TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run()

/* CHATS */

db.prepare(`CREATE TABLE IF NOT EXISTS chats (
 id TEXT PRIMARY KEY,
 user_id INTEGER,
 title TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run()

/* MESSAGES */

db.prepare(`CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chat_id TEXT,
 role TEXT,
 content TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run()

/* LOGIN CHECK */

function requireLogin(req,res,next){

if(!req.session.userId){
return res.redirect("/login.html")
}

next()
}

/* AI TITLE GENERATOR */

async function generateAITitle(text){

try{

const completion = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:"Create a short chat title (3–6 words)."},
{role:"user",content:text}
],
max_tokens:20
})

return completion?.choices?.[0]?.message?.content?.trim() || "New Chat"

}catch(err){

return text.split(" ").slice(0,6).join(" ")

}

}

/* LANDING PAGE */

app.get("/",(req,res)=>{
res.sendFile(path.join(__dirname,"landing.html"))
})

/* DASHBOARD */

app.get("/dashboard",(req,res)=>{

if(!req.session.userId){
return res.redirect("/login.html")
}

res.sendFile(path.join(__dirname,"index.html"))

})

/* SIGNUP */

app.post("/signup", async (req,res)=>{

try{

const {email,password} = req.body

if(!email || !password){
return res.json({error:"Missing email or password"})
}

const hash = await bcrypt.hash(password,10)

db.prepare(
"INSERT INTO users (email,password) VALUES (?,?)"
).run(email,hash)

res.json({status:"account created"})

}catch(err){

res.json({error:"email already exists"})

}

})

/* LOGIN */

app.post("/login", async (req,res)=>{

const {email,password} = req.body

const user = db.prepare(
"SELECT * FROM users WHERE email=?"
).get(email)

if(!user){
return res.json({error:"user not found"})
}

const valid = await bcrypt.compare(password,user.password)

if(!valid){
return res.json({error:"invalid password"})
}

req.session.userId = user.id

res.json({
status:"logged in",
redirect:"/dashboard"
})

})

/* LOGOUT */

app.get("/logout",(req,res)=>{
req.session.destroy(()=>{
res.redirect("/")
})
})

/* FORGOT PASSWORD */

app.post("/reset-password", async (req,res)=>{

try{

const {email,password} = req.body

if(!email || !password){
return res.json({error:"Missing email or password"})
}

const user = db.prepare(
"SELECT * FROM users WHERE email=?"
).get(email)

if(!user){
return res.json({error:"Email not found"})
}

const hash = await bcrypt.hash(password,10)

db.prepare(
"UPDATE users SET password=? WHERE email=?"
).run(hash,email)

res.json({status:"Password updated"})

}catch(err){

res.json({error:"Reset failed"})

}

})

/* CHANGE PASSWORD (SETTINGS PANEL) */

app.post("/change-password", requireLogin, async (req,res)=>{

try{

const {password} = req.body

if(!password){
return res.json({error:"Password required"})
}

const hash = await bcrypt.hash(password,10)

db.prepare(
"UPDATE users SET password=? WHERE id=?"
).run(hash,req.session.userId)

res.json({status:"Password updated"})

}catch{

res.json({error:"Update failed"})

}

})

/* CREATE CHAT */

app.post("/create-chat", requireLogin, (req,res)=>{

const chatId = Date.now().toString()

db.prepare(
"INSERT INTO chats (id,user_id,title) VALUES (?,?,?)"
).run(chatId,req.session.userId,"New Chat")

res.json({chatId})

})

/* GENERATE PLAN */

app.post("/plan", requireLogin, async(req,res)=>{

try{

const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

const prompt = `
You are IdeaPilot — an AI startup analyst.

Analyze the user's business idea carefully.

Idea: ${idea}
Why it matters: ${why}
User skills: ${skills}
Resources available: ${resources}
Hours available weekly: ${hours}
Income goal: ${incomeGoal} ${currency}

Provide a clear startup evaluation using these sections:

Idea Clarified
Who This Helps
Core Problem
Market Reality
Simplest Version To Start
Monetization Model
First 3 Actions
30 Day Validation
Long Term Expansion
Feasibility Score
Risk Level
Startup Capital
Execution Difficulty
Success Potential
`

const completion = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:"You are IdeaPilot, an experienced startup advisor."},
{role:"user",content:prompt}
]
})

const reply = completion?.choices?.[0]?.message?.content || "AI could not generate response."

const chatId = Date.now().toString()

db.prepare(
"INSERT INTO chats (id,user_id,title) VALUES (?,?,?)"
).run(chatId,req.session.userId,idea)

db.prepare(
"INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
).run(chatId,"assistant",reply)

res.json({chatId,reply})

}catch(err){

console.log(err)
res.status(500).json({error:"AI error"})

}

})

/* FOLLOWUP CHAT */

app.post("/followup", requireLogin, upload.single("file"), async(req,res)=>{

try{

const {chatId,question,mode}=req.body

const messages = db.prepare(
"SELECT role,content FROM messages WHERE chat_id=?"
).all(chatId)

let systemPrompt = `
You are IdeaPilot, an AI startup advisor.

Use the conversation history to understand the user's business ideas.
`

let history = messages.map(m=>({
role:m.role,
content:m.content
}))

history.push({
role:"user",
content:question
})

const completion = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:systemPrompt},
...history
]
})

const reply = completion?.choices?.[0]?.message?.content || "AI response failed."

db.prepare(
"INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
).run(chatId,"user",question)

db.prepare(
"INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
).run(chatId,"assistant",reply)

const chat = db.prepare(
"SELECT title FROM chats WHERE id=?"
).get(chatId)

if(chat && chat.title==="New Chat"){

const title = await generateAITitle(question)

db.prepare(
"UPDATE chats SET title=? WHERE id=?"
).run(title,chatId)

}

res.json({reply})

}catch(err){

console.log(err)
res.json({reply:"AI error"})
}

})

/* GET USER CHATS */

app.get("/chats", requireLogin, (req,res)=>{

const chats = db.prepare(
"SELECT * FROM chats WHERE user_id=? ORDER BY created_at DESC"
).all(req.session.userId)

const result = chats.map(chat=>{

const msgs = db.prepare(
"SELECT role,content FROM messages WHERE chat_id=?"
).all(chat.id)

return {...chat,messages:msgs}

})

res.json(result)

})

/* RENAME CHAT */

app.post("/rename-chat", requireLogin, (req,res)=>{

const {id,title}=req.body

db.prepare(
"UPDATE chats SET title=? WHERE id=? AND user_id=?"
).run(title,id,req.session.userId)

res.json({status:"renamed"})

})

/* DELETE CHAT */

app.post("/delete-chat", requireLogin, (req,res)=>{

const {id}=req.body

db.prepare("DELETE FROM chats WHERE id=? AND user_id=?").run(id,req.session.userId)
db.prepare("DELETE FROM messages WHERE chat_id=?").run(id)

res.json({status:"deleted"})

})

/* STATIC FILES */

app.use(express.static(path.join(__dirname)))

/* SERVER */

app.listen(PORT,"0.0.0.0",()=>{
console.log("IdeaPilot running on port "+PORT)
})

