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

db.exec(`
CREATE TABLE IF NOT EXISTS chats(
 id TEXT PRIMARY KEY,
 title TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE IF NOT EXISTS messages(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chat_id TEXT,
 role TEXT,
 content TEXT,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`)

/* AI TITLE GENERATOR */

async function generateAITitle(text){

 try{

 const completion = await openai.chat.completions.create({
 model:"gpt-4o-mini",
 messages:[
 {role:"system",content:"Create a short clean chat title (3-6 words). No punctuation."},
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
 "INSERT INTO chats(id,title) VALUES(?,?)"
 ).run(chatId,"New Chat")

 res.json({chatId})

})


/* GENERATE PLAN */

app.post("/plan",async(req,res)=>{

 try{

 const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

 const prompt = `
You are IdeaPilot, an AI system helping people turn ideas into practical execution paths.

Idea: ${idea}
Why: ${why}
Skills: ${skills}
Resources: ${resources}
Hours: ${hours}
Income goal: ${incomeGoal} ${currency}

Write sections:

Idea Clarified
Who This Helps
Core Problem Being Solved
Market Reality Check
Simplest Version To Start
Monetization Model
First 3 Real Actions
30 Day Validation Plan
Long Term Expansion
Feasibility Score
Risk Level
Startup Capital Estimate
Execution Difficulty

Avoid markdown symbols like ### or **.
Write clean readable paragraphs.
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
 "INSERT INTO chats(id,title) VALUES(?,?)"
 ).run(chatId,idea)

 db.prepare(
 "INSERT INTO messages(chat_id,role,content) VALUES(?,?,?)"
 ).run(chatId,"assistant",reply)

 res.json({chatId,reply})

 }catch(err){

 console.log(err)
 res.status(500).json({error:"AI error"})

 }

})


/* FOLLOW UP CHAT */

app.post("/followup",upload.single("file"),async(req,res)=>{

 try{

 const {chatId,question,mode}=req.body

 const rows = db.prepare(
 "SELECT role,content FROM messages WHERE chat_id=?"
 ).all(chatId)

 let systemPrompt="You are IdeaPilot."

 if(mode==="idea") systemPrompt="Help refine ideas and opportunities."
 if(mode==="research") systemPrompt="Act as a market researcher."
 if(mode==="build") systemPrompt="Act as a startup builder focusing on execution."

 let history = rows.map(m=>({
 role:m.role,
 content:m.content
 }))

 let userMessage

 if(req.file){

 const base64Image = req.file.buffer.toString("base64")

 userMessage={
 role:"user",
 content:[
 {type:"text",text:question || "Analyze this image."},
 {
 type:"image_url",
 image_url:{url:`data:${req.file.mimetype};base64,${base64Image}`}
 }
 ]
 }

 }else{

 userMessage={
 role:"user",
 content:question
 }

 }

 history.push(userMessage)

 const completion = await openai.chat.completions.create({
 model:"gpt-4o-mini",
 messages:[
 {role:"system",content:systemPrompt},
 ...history
 ]
 })

 const reply = completion.choices[0].message.content

 db.prepare(
 "INSERT INTO messages(chat_id,role,content) VALUES(?,?,?)"
 ).run(chatId,"user",question || "[image uploaded]")

 db.prepare(
 "INSERT INTO messages(chat_id,role,content) VALUES(?,?,?)"
 ).run(chatId,"assistant",reply)

 /* AI TITLE */

 const chat = db.prepare(
 "SELECT title FROM chats WHERE id=?"
 ).get(chatId)

 if(chat && chat.title==="New Chat" && question){

 const aiTitle = await generateAITitle(question)

 db.prepare(
 "UPDATE chats SET title=? WHERE id=?"
 ).run(aiTitle,chatId)

 }

 res.json({reply})

 }catch(err){

 console.log(err)
 res.json({reply:"AI error"})
 }

})


/* GET CHATS */

app.get("/chats",(req,res)=>{

 const chats = db.prepare(
 "SELECT * FROM chats ORDER BY created_at DESC"
 ).all()

 const result = chats.map(chat=>{
 const messages = db.prepare(
 "SELECT role,content FROM messages WHERE chat_id=?"
 ).all(chat.id)

 return {...chat,messages}
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


app.listen(PORT,()=>{
 console.log("IdeaPilot running on http://localhost:"+PORT)
})
