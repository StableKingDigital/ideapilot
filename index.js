require("dotenv").config()
const express = require("express")
const OpenAI = require("openai")
const path = require("path")

const app = express()
const PORT = process.env.PORT || 3000

const openai = new OpenAI({
 apiKey: process.env.OPENAI_API_KEY
})

app.use(express.json({limit:"10mb"}))
app.use(express.static(path.join(__dirname)))

app.get("/",(req,res)=>{
 res.sendFile(path.join(__dirname,"index.html"))
})

app.post("/plan",async(req,res)=>{

 try{

 const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

 const prompt = `
You are IdeaPilot, an AI system that helps people turn ideas into practical execution paths.

Idea: ${idea}
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

Use weeks instead of days.
Avoid markdown symbols like ### or **.
`

 const completion = await openai.chat.completions.create({

 model:"gpt-4o-mini",

 messages:[
 {role:"system",content:"You are IdeaPilot, a calm startup advisor helping people move from ideas to action."},
 {role:"user",content:prompt}
 ]

 })

 const reply = completion.choices[0].message.content

 res.json({reply})

 }catch(err){

 console.log(err)
 res.status(500).json({error:"AI error"})

 }

})

app.post("/followup",async(req,res)=>{

 try{

 const {messages,mode}=req.body

 let systemPrompt="You are IdeaPilot."

 if(mode==="idea"){
 systemPrompt="Help refine ideas and explore opportunities."
 }

 if(mode==="research"){
 systemPrompt="Act as a market researcher providing insights and market trends."
 }

 if(mode==="build"){
 systemPrompt="Act as a startup strategist focusing on execution steps."
 }

 const completion = await openai.chat.completions.create({

 model:"gpt-4o-mini",

 messages:[
 {role:"system",content:systemPrompt},
 ...messages
 ]

 })

 const reply = completion.choices[0].message.content

 res.json({reply})

 }catch(err){

 console.log(err)
 res.status(500).json({error:"AI error"})

 }

})

app.listen(PORT,()=>{
 console.log("IdeaPilot running on port "+PORT)
})
