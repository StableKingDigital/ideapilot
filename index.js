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

// -----------------------------
// SYSTEM PROMPT (Strong AI)
// -----------------------------
const BASE_PROMPT = `
You are IdeaPilot — an advanced AI strategy engine that helps people turn ideas into real opportunities.

Capabilities:
- idea validation
- market analysis
- startup strategy
- brand development
- side-hustle design
- product feedback
- visual analysis of uploaded images
- competitor awareness
- growth strategy

You think like:
startup advisor + market researcher + execution strategist.

Rules:
- give actionable advice
- avoid generic answers
- no markdown symbols like ** or ###
- write clearly structured sections
`

function generateTitle(text){
  if(!text) return "New Chat"
  return text.split(" ").slice(0,6).join(" ")
}

// -----------------------------
// LOAD PAGE
// -----------------------------
app.get("/",(req,res)=>{
  res.sendFile(path.join(__dirname,"index.html"))
})

// -----------------------------
// GENERATE PLAN
// -----------------------------
app.post("/plan", async(req,res)=>{

  try{

    const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

    const prompt = `
Idea: ${idea}
Why: ${why}
Skills: ${skills}
Resources: ${resources}
Hours per week: ${hours}
Income goal: ${incomeGoal} ${currency}

Create a practical startup direction plan.
`

    const completion = await openai.chat.completions.create({

      model:"gpt-4o-mini",

      messages:[
        {role:"system",content:BASE_PROMPT},
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
    res.status(500).json({error:"AI error"})

  }

})

// -----------------------------
// FOLLOW UP CHAT
// -----------------------------
app.post("/followup", upload.single("file"), async(req,res)=>{

  try{

    const {chatId,question,mode}=req.body

    if(!chats[chatId]){
      return res.json({reply:"Chat not found"})
    }

    const chat = chats[chatId]

    let history = chat.messages.map(m=>({
      role:m.role,
      content:m.content
    }))

    let userMessage

    if(req.file){

      const base64 = req.file.buffer.toString("base64")

      userMessage = {
        role:"user",
        content:[
          {type:"text", text:question || "Analyze this image"},
          {
            type:"image_url",
            image_url:{
              url:`data:${req.file.mimetype};base64,${base64}`
            }
          }
        ]
      }

    }else{

      userMessage = {
        role:"user",
        content:question
      }

    }

    history.push(userMessage)

    const completion = await openai.chat.completions.create({

      model:"gpt-4o-mini",

      messages:[
        {role:"system",content:BASE_PROMPT},
        ...history
      ]

    })

    const reply = completion.choices[0].message.content

    chat.messages.push({role:"user",content:question})
    chat.messages.push({role:"assistant",content:reply})

    res.json({reply})

  }catch(err){

    console.log(err)
    res.json({reply:"AI error"})

  }

})

// -----------------------------
// LOAD CHATS
// -----------------------------
app.get("/chats",(req,res)=>{
  res.json(Object.values(chats))
})

// -----------------------------
app.listen(PORT,()=>{
  console.log("IdeaPilot running on port "+PORT)
}
