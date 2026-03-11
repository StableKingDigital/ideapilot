require("dotenv").config()

const express=require("express")
const multer=require("multer")
const path=require("path")
const {OpenAI}=require("openai")

const app=express()
const upload=multer()

app.use(express.json())
app.use(express.static(path.join(__dirname)))

const openai=new OpenAI({
apiKey:process.env.OPENAI_API_KEY
})

const PORT=process.env.PORT||3000

let chats={}

function id(){
return Math.random().toString(36).substring(2,9)
}

function systemPrompt(mode){

let text=`
You are IdeaPilot.

IdeaPilot helps users turn ideas into real businesses.

Important rules:

• When answering follow-up questions DO NOT restart the entire plan.
• Continue the previous discussion logically.
• Only answer the specific follow-up.

Use clean paragraphs and numbered steps.
Do not output HTML like <br>.
Do not output markdown like **.
`

if(mode==="research"){
text+=" Focus on market research and competitors."
}

if(mode==="build"){
text+=" Focus on execution and launching the business."
}

return text
}

app.post("/plan",async(req,res)=>{

try{

const chatId=id()

const {idea,why,skills,resources,hours,incomeGoal,currency}=req.body

const prompt=`
Idea: ${idea}
Why: ${why}
Skills: ${skills}
Resources: ${resources}
Hours per week: ${hours}
Income goal: ${incomeGoal} ${currency}

Create a structured startup plan.
`

const completion=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:systemPrompt("idea")},
{role:"user",content:prompt}
]
})

const reply=completion.choices[0].message.content

chats[chatId]={
title:idea,
messages:[
{role:"user",content:prompt},
{role:"assistant",content:reply}
]
}

res.json({chatId,reply})

}catch(e){

console.log(e)
res.json({reply:"AI error"})

}

})

app.post("/followup",upload.single("file"),async(req,res)=>{

try{

const {chatId,question,mode}=req.body

if(!chats[chatId]){
return res.json({reply:"Chat not found"})
}

let message

if(req.file){

const base64=req.file.buffer.toString("base64")

message={
role:"user",
content:[
{
type:"text",
text:question||"Analyze this image"
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

message={
role:"user",
content:question
}

}

const completion=await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"system",content:systemPrompt(mode)},
...chats[chatId].messages,
message
]
})

const reply=completion.choices[0].message.content

chats[chatId].messages.push({role:"user",content:question})
chats[chatId].messages.push({role:"assistant",content:reply})

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

app.post("/rename-chat",(req,res)=>{

const {id,title}=req.body

if(chats[id]){
chats[id].title=title
}

res.json({ok:true})

})

app.listen(PORT,()=>{
console.log("IdeaPilot running on port "+PORT)
})
