require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")
const multer = require("multer")
const path = require("path")
const Database = require("better-sqlite3")

const app = express()
const PORT = process.env.PORT || 3000

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
})

const upload = multer({ storage: multer.memoryStorage() })

app.use(express.json())

/* DATABASE */

const db = new Database("ideapilot.db")

db.prepare(`
CREATE TABLE IF NOT EXISTS chats (
 id TEXT PRIMARY KEY,
 title TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run()

db.prepare(`
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chat_id TEXT,
 role TEXT,
 content TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run()

/* AI TITLE GENERATOR */

async function generateAITitle(text){

 try{

 const completion = await openai.chat.completions.create({
 model:"gpt-4o-mini",
 messages:[
 {role:"system",content:"Create a short chat title (3-6 words)."},
 {role:"user",content:text}
 ],
 max_tokens:20
 })

 return completion.choices[0].message.content.trim()

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
 res.sendFile(path.join(__dirname,"index.html"))
})

/* CREATE CHAT */

app.post("/create-chat",(req,res)=>{

 const chatId = Date.now().toString()

 db.prepare(
 "INSERT INTO chats (id,title) VALUES (?,?)"
 ).run(chatId,"New Chat")

 res.json({chatId})

})

/* GENERATE PLAN */

app.post("/plan",async(req,res)=>{

 try{

 const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

 const prompt = `
You are IdeaPilot, an AI system helping people turn ideas into execution paths.

Idea: ${idea}
Why: ${why}
Skills: ${skills}
Resources: ${resources}
Hours: ${hours}
Income goal: ${incomeGoal} ${currency}

Write sections:

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

Avoid markdown symbols.
Write clean paragraphs.
`

 const completion = await openai.chat.completions.create({
 model:"gpt-4o-mini",
 messages:[
 {role:"system",content:"You are IdeaPilot, a calm startup advisor."},
 {role:"user",content:prompt}
 ]
 })

 const reply = completion.choices[0].message.content

 const chatId = Date.now().toString()

 db.prepare(
 "INSERT INTO chats (id,title) VALUES (?,?)"
 ).run(chatId,idea)

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

app.post("/followup",upload.single("file"),async(req,res)=>{

 try{

 const {chatId,question,mode}=req.body

 const messages = db.prepare(
 "SELECT role,content FROM messages WHERE chat_id=?"
 ).all(chatId)

 let systemPrompt="You are IdeaPilot."

 if(mode==="idea") systemPrompt="Help refine ideas and opportunities."
 if(mode==="research") systemPrompt="Act as a market researcher."
 if(mode==="build") systemPrompt="Act as a startup builder focusing on execution."

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

 const reply = completion.choices[0].message.content

 db.prepare(
 "INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
 ).run(chatId,"user",question)

 db.prepare(
 "INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
 ).run(chatId,"assistant",reply)

 const chat = db.prepare(
 "SELECT title FROM chats WHERE id=?"
 ).get(chatId)

 if(chat && chat.title==="New Chat" && question){

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

/* STREAMING FOLLOWUP */

app.post("/followup-stream",async(req,res)=>{

 try{

 const {chatId,question,mode}=req.body

 const messages = db.prepare(
 "SELECT role,content FROM messages WHERE chat_id=?"
 ).all(chatId)

 let systemPrompt="You are IdeaPilot."

 if(mode==="idea") systemPrompt="Help refine ideas and opportunities."
 if(mode==="research") systemPrompt="Act as a market researcher."
 if(mode==="build") systemPrompt="Act as a startup builder focusing on execution."

 let history = messages.map(m=>({
 role:m.role,
 content:m.content
 }))

 history.push({
 role:"user",
 content:question
 })

 res.setHeader("Content-Type","text/plain")
 res.setHeader("Transfer-Encoding","chunked")

 const stream = await openai.chat.completions.create({
 model:"gpt-4o-mini",
 stream:true,
 messages:[
 {role:"system",content:systemPrompt},
 ...history
 ]
 })

 let fullReply=""

 for await (const chunk of stream){

 const token = chunk.choices?.[0]?.delta?.content || ""

 fullReply += token
 res.write(token)

 }

 res.end()

 db.prepare(
 "INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
 ).run(chatId,"user",question)

 db.prepare(
 "INSERT INTO messages (chat_id,role,content) VALUES (?,?,?)"
 ).run(chatId,"assistant",fullReply)

 }catch(err){

 console.log(err)
 res.end("AI error")

 }

})

/* GET CHATS */

app.get("/chats",(req,res)=>{

 const chats = db.prepare(
 "SELECT * FROM chats ORDER BY created_at DESC"
 ).all()

 const result = chats.map(chat=>{

 const msgs = db.prepare(
 "SELECT role,content FROM messages WHERE chat_id=?"
 ).all(chat.id)

 return {...chat,messages:msgs}

 })

 res.json(result)

})

/* RENAME CHAT */

app.post("/rename-chat",(req,res)=>{

 const {id,title}=req.body

 db.prepare(
 "UPDATE chats SET title=? WHERE id=?"
 ).run(title,id)

 res.json({status:"renamed"})

})

/* DELETE CHAT */

app.post("/delete-chat",(req,res)=>{

 const {id}=req.body

 db.prepare("DELETE FROM chats WHERE id=?").run(id)
 db.prepare("DELETE FROM messages WHERE chat_id=?").run(id)

 res.json({status:"deleted"})

})

/* STATIC FILES */

app.use(express.static(path.join(__dirname)))

/* SERVER */

app.listen(PORT,"0.0.0.0",()=>{
 console.log("IdeaPilot running on port "+PORT)
})
