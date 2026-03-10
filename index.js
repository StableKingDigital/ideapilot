require("dotenv").config()

const express = require("express")
const multer = require("multer")
const path = require("path")
const { OpenAI } = require("openai")

const app = express()
const upload = multer()

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

app.use(express.json())
app.use(express.static(path.join(__dirname)))

const PORT = process.env.PORT || 3000

let chats = {}

function createId(){
return Math.random().toString(36).substring(2,10)
}

function getSystemPrompt(mode){

let base = `
You are IdeaPilot.

IdeaPilot helps people turn ideas into real businesses.

Write clear structured sections with titles.
Use paragraphs and lists.
Do not use markdown symbols like ** or ---.

If the user uploads an image:
- describe what you see
- explain branding or business opportunity
- connect the image to their idea.
`

if(mode==="research"){
base += " Focus on market research, trends, competitors."
}

if(mode==="build"){
base += " Focus on execution steps and launch strategy."
}

return base
}

app.post("/plan", async (req,res)=>{

try{

const id=createId()

const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

const system=getSystemPrompt("idea")

const prompt=`
User Idea: ${idea}
Why: ${why}
Skills: ${skills}
Resources: ${resources}
Hours: ${hours}
Income Goal: ${incomeGoal} ${currency}

Create a structured startup direction plan.
`

const completion = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:system},
{role:"user",content:prompt}
]
})

const reply=completion.choices[0].message.content

chats[id]={
title:idea,
messages:[
{role:"user",content:prompt},
{role:"assistant",content:reply}
]
}

res.json({
chatId:id,
reply
})

}catch(e){

console.log(e)
res.json({reply:"Error generating plan"})

}

})

app.post("/followup",upload.single("file"),async(req,res)=>{

try{

const {chatId,question,mode}=req.body

if(!chats[chatId]){
return res.json({reply:"Chat not found"})
}

const system=getSystemPrompt(mode)

let history = chats[chatId].messages.map(m=>({
role:m.role,
content:m.content
}))

let userMessage

if(req.file){

const base64=req.file.buffer.toString("base64")

userMessage={
role:"user",
content:[
{
type:"text",
text:question || "Analyze this image"
},
{
type:"image_url",
image_url:{
url:`data:${req.file.mimetype};base64,${base64}`
}
}
]
}

}else{

userMessage={
role:"user",
content:question
}

}

const completion = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:system},
...history,
userMessage
]
})

const reply=completion.choices[0].message.content

chats[chatId].messages.push({
role:"user",
content:question
})

chats[chatId].messages.push({
role:"assistant",
content:reply
})

res.json({reply})

}catch(e){

console.log(e)
res.json({reply:"AI error"})

}

})

app.get("/chats",(req,res)=>{

const list=Object.keys(chats).map(id=>({
id,
title:chats[id].title,
messages:chats[id].messages
}))

res.json(list)

})

app.post("/delete-chat",(req,res)=>{

const {id}=req.body

delete chats[id]

res.json({ok:true})

})

app.listen(PORT,()=>{
console.log("IdeaPilot running on port "+PORT)
})
