require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")
const multer = require("multer")
const path = require("path")

const app = express()

const PORT = process.env.PORT || 3000

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
})

const upload = multer({ storage: multer.memoryStorage() })

app.use(express.json())
app.use(express.static(path.join(__dirname)))

let chats = {}

function generateTitle(text){
 const words = text.split(" ")
 return words.slice(0,6).join(" ")
}

app.get("/",(req,res)=>{
 res.sendFile(path.join(__dirname,"index.html"))
})

app.post("/plan",async(req,res)=>{

 try{

 const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

 const prompt = `
You are IdeaPilot, an AI system that helps people turn ideas into practical execution paths.

User Idea: ${idea}
Why it matters: ${why}
Skills: ${skills}
Resources: ${resources}
Hours weekly: ${hours}
Income goal: ${incomeGoal} ${currency}

Create a structured response with these sections.

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

Use weeks instead of days when describing timelines.

Avoid markdown symbols like ### or **.
Write clean readable paragraphs.
`

 const completion = await openai.chat.completions.create({
  model:"gpt-4o-mini",
  messages:[
   {role:"system",content:"You are IdeaPilot, a calm startup advisor helping people move from ideas to action."},
   {role:"user",content:prompt}
  ]
 })

 const reply = completion.choices[0].message.content

 const chatId = Date.now().toString()

 chats[chatId]={
  id:chatId,
  title:generateTitle(idea),
  messages:[
   {role:"assistant",content:reply}
  ]
 }

 res.json({chatId,reply})

 }catch(err){

 console.log(err)
 res.status(500).json({error:"AI error generating plan"})

 }

})

app.post("/followup",upload.single("file"),async(req,res)=>{

 try{

 const {chatId,question,mode}=req.body
 const chat = chats[chatId]

 if(!chat){
  return res.json({reply:"Chat not found"})
 }

 let systemPrompt="You are IdeaPilot."

 if(mode==="idea"){
  systemPrompt="Help refine ideas and explore opportunities."
 }

 if(mode==="research"){
  systemPrompt="Act as a market researcher providing insights, trends, and competitor awareness."
 }

 if(mode==="build"){
  systemPrompt="Act as a startup strategist focusing on execution steps and growth strategies."
 }

 let history = chat.messages.map(m=>({
  role:m.role==="assistant"?"assistant":"user",
  content:m.content
 }))

 let userMessage

 if(req.file){

  const base64Image = req.file.buffer.toString("base64")

  userMessage = {
   role:"user",
   content:[
    {
     type:"text",
     text: question || "Analyze this image and provide insights."
    },
    {
     type:"image_url",
     image_url:{
      url:`data:${req.file.mimetype};base64,${base64Image}`
     }
    }
   ]
  }

 } else {

  userMessage = {
   role:"user",
   content: question
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

 chat.messages.push({role:"user",content:question})
 chat.messages.push({role:"assistant",content:reply})

 res.json({reply})

 }catch(err){

 console.log(err)
 res.json({reply:"AI error generating response"})

 }

})

app.get("/chats",(req,res)=>{
 res.json(Object.values(chats))
})

app.post("/delete-chat",(req,res)=>{
 const {id}=req.body
 delete chats[id]
 res.json({status:"deleted"})
})

app.listen(PORT,()=>{
 console.log("IdeaPilot running on port " + PORT)
})
