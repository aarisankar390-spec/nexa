require('dotenv').config();
const express = require("express");
const serverless = require('serverless-http');
const path = require("path");
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn("WARNING: SUPABASE_URL or SUPABASE_KEY is missing. Database will not work.");
}

const branches = [
  ["TN01","Coimbatore","Coimbatore","coimbatore.manager@teamnexa.in"],
  ["TN02","Chennai","Chennai","chennai.manager@teamnexa.in"],
  ["TN03","Madurai","Madurai","madurai.manager@teamnexa.in"],
  ["TN04","Salem","Salem","salem.manager@teamnexa.in"],
  ["TN05","Tiruchirappalli","Tiruchirappalli","tiruchirappalli.manager@teamnexa.in"],
  ["TN06","Erode","Erode","erode.manager@teamnexa.in"],
  ["TN07","Tiruppur","Tiruppur","tiruppur.manager@teamnexa.in"],
  ["TN08","Vellore","Vellore","vellore.manager@teamnexa.in"],
  ["TN09","Thoothukudi","Thoothukudi","thoothukudi.manager@teamnexa.in"],
  ["TN10","Tirunelveli","Tirunelveli","tirunelveli.manager@teamnexa.in"]
].map(([id,name,district,email], index) => ({id,name,district,email,mobile:`+91 9${String(876543210 + index * 11111111).slice(0,9)}`}));

const users = [
  {email:"owner@teamnexa.in", password:"owner123", role:"owner", name:"TEAM NEXA Owner"},
  {email:"employee@teamnexa.in", password:"employee123", role:"employee", name:"Operations Employee"},
  ...branches.map(b=>({email:b.email,password:"manager123",role:"manager",name:`${b.district} Branch Manager`,branch:b.name}))
];

const actor = req => users.find(user => user.email.toLowerCase() === String(req.headers["x-user-email"] || "").toLowerCase());
const branchForContainer = container => branches.find(branch => branch.name === container.branch);

const notify = async (request, title, message) => {
  if (!supabase) return;
  const n = {
    id: `NT-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    requestId: request.id,
    email: request.employeeEmail,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
  await supabase.from('notifications').insert([n]);
};

// Seed containers if empty
async function initializeDB() {
  if (!supabase) return;
  try {
    const { data: existing } = await supabase.from('containers').select('id').limit(1);
    if (existing && existing.length === 0) {
      console.log("Seeding default containers into Supabase...");
      const containerTypes = [["Dry Van","28,000 kg"],["High Cube","32,500 kg"],["Reefer","29,000 kg"],["Open Top","30,000 kg"]];
      const defaultContainers = branches.flatMap((branch, branchIndex) => Array.from({length:10}, (_, index) => {
        const [type,maxWeight] = containerTypes[index % containerTypes.length];
        const size = index % 2 ? "40 ft" : "20 ft";
        const status = branchIndex === 0 && index === 0 ? "Reserved" : branchIndex === 1 && index === 1 ? "In Transit" : branchIndex === 2 && index === 2 ? "Maintenance" : "Available";
        return {id:`TNX-${branch.id.slice(2)}-${String(index + 1).padStart(3,"0")}`,size,type,maxWeight,status,branch:branch.name,updated:index % 2 ? "12 min ago" : "Just now"};
      }));
      for (let i = 0; i < defaultContainers.length; i += 20) {
        await supabase.from('containers').insert(defaultContainers.slice(i, i + 20));
      }
      console.log("Seeding complete.");
    }
  } catch(e) {
    console.error("Failed to seed:", e.message);
  }
}
initializeDB();

app.post("/api/login",(req,res)=>{
  const {email,password} = req.body || {};
  const user = users.find(u=>u.email.toLowerCase()===String(email||"").toLowerCase() && u.password===password);
  if(!user) return res.status(401).json({message:"Invalid credentials"});
  const {password:_,...safe} = user;
  res.json(safe);
});

app.get("/api/branches",(req,res)=>res.json(branches));

app.get("/api/containers", async (req,res) => {
  if (!supabase) return res.json([]);
  const { data } = await supabase.from('containers').select('*').order('id', { ascending: true });
  res.json(data || []);
});

app.get("/api/requests", async (req,res) => {
  if (!supabase) return res.json([]);
  const user = actor(req);
  let query = supabase.from('requests').select('*').order('id', { ascending: false });
  if (user?.role === "employee") query = query.eq('employeeEmail', user.email);
  const { data } = await query;
  res.json(data || []);
});

app.get("/api/notifications", async (req,res) => {
  if (!supabase) return res.json([]);
  const user = actor(req);
  let query = supabase.from('notifications').select('*').order('createdAt', { ascending: false });
  if (user?.role === "employee") query = query.eq('email', user.email);
  const { data } = await query;
  res.json(data || []);
});

app.patch("/api/notifications/read", async (req,res) => {
  const user=actor(req);
  if(!user) return res.status(401).json({message:"Login required"});
  if (supabase) {
    await supabase.from('notifications').update({ read: true }).eq('email', user.email);
  }
  res.json({updated:true});
});

app.post("/api/requests", async (req,res) => {
  const body=req.body||{};
  const user=actor(req);
  if (!user || user.role !== "employee") return res.status(403).json({message:"Only employees can create shipment requests"});
  if (!supabase) return res.status(500).json({message:"Database not configured"});
  
  const { count } = await supabase.from('requests').select('*', { count: 'exact', head: true });
  const id=`REQ-${1010 + (count || 0)}`;
  const request={
    id, customer:body.customer||"New Customer", origin:body.origin||"Coimbatore",
    destination:body.destination||"Chennai", cargo:body.cargo||"General Cargo",
    weight:body.weight||"0 kg", volume:body.volume||"0 m³",
    date:body.date||new Date().toISOString().slice(0,10), requestedSize:body.containerSize||"20 ft",
    container:"Awaiting allocation", status:"Pending", employeeEmail:user.email, history:[{status:"Pending",at:new Date().toISOString()}]
  };
  
  await supabase.from('requests').insert([request]);
  await notify(request,"Request submitted",`Your request ${request.id} is waiting for branch manager approval.`);
  res.status(201).json(request);
});

app.patch("/api/requests/:id", async (req,res) => {
  if (!supabase) return res.status(500).json({message:"Database not configured"});
  const { data: requests } = await supabase.from('requests').select('*').eq('id', req.params.id);
  const r = requests?.[0];
  if(!r) return res.status(404).json({message:"Request not found"});
  
  const user=actor(req);
  if(!user || !["manager","owner"].includes(user.role)) return res.status(403).json({message:"Only authorized managers can update requests"});
  
  const nextStatus=req.body.status;
  if (!["Approved","Rejected","Allocated","In Transit","Delivered"].includes(nextStatus)) return res.status(400).json({message:"Invalid request status"});
  
  let selected = null;
  if (req.body.container) {
    const { data: c } = await supabase.from('containers').select('*').eq('id', req.body.container);
    selected = c?.[0];
  }
  
  if (nextStatus === "Approved" || nextStatus === "Allocated") {
    if (!selected || selected.status !== "Available" || selected.size !== r.requestedSize) return res.status(409).json({message:"Select a suitable available container from your branch"});
    const branch=branchForContainer(selected);
    if (user.role === "manager" && branch?.name !== user.branch) return res.status(403).json({message:"Managers can only allocate from their own branch"});
    
    selected.status = nextStatus === "Allocated" ? "Allocated" : "Reserved";
    selected.updated = "Just now";
    r.container = selected.id;
    await supabase.from('containers').update({ status: selected.status, updated: selected.updated }).eq('id', selected.id);
  }
  
  if (nextStatus === "Rejected" && user.role === "manager") {
    const { data: avail } = await supabase.from('containers').select('id').eq('branch', user.branch).eq('status', 'Available').eq('size', r.requestedSize);
    if (!avail || avail.length === 0) return res.status(409).json({message:"This request can only be updated when a suitable container is available"});
  }
  
  if (nextStatus === "In Transit" && r.container !== "Awaiting allocation") { 
    await supabase.from('containers').update({ status: "In Transit", updated: "Just now" }).eq('id', r.container);
  }
  
  const previous=r.status; r.status=nextStatus;
  
  let eventBranch = "TEAM NEXA";
  if (selected) {
    eventBranch = branchForContainer(selected)?.name || "TEAM NEXA";
  } else if (r.container !== "Awaiting allocation") {
    const { data: c } = await supabase.from('containers').select('branch').eq('id', r.container);
    eventBranch = c?.[0]?.branch || user.branch || "TEAM NEXA";
  } else {
    eventBranch = user.branch || "TEAM NEXA";
  }
  
  const history = r.history || [];
  history.push({status:nextStatus,at:new Date().toISOString(),branch:eventBranch,by:user.name});
  r.history = history;
  
  await supabase.from('requests').update({ 
    status: r.status, 
    container: r.container, 
    history: r.history 
  }).eq('id', r.id);
  
  if (previous !== nextStatus) await notify(r,`Request ${nextStatus}`,`Your request has been ${nextStatus.toLowerCase()} by the ${eventBranch} Branch.${selected ? ` Container ${selected.id} has been reserved for your shipment.` : ""}`);
  res.json(r);
});

app.patch("/api/containers/:id", async (req,res) => {
  if (!supabase) return res.status(500).json({message:"Database not configured"});
  const { data: containers } = await supabase.from('containers').select('*').eq('id', req.params.id);
  const c = containers?.[0];
  if(!c) return res.status(404).json({message:"Container not found"});
  
  const user=actor(req);
  if(!user || !["manager","owner"].includes(user.role)) return res.status(403).json({message:"Only authorized users can update containers"});
  if(user.role === "manager" && c.branch !== user.branch) return res.status(403).json({message:"Managers can only update their own branch"});
  
  const updates = { updated: "Just now" };
  if(req.body.status) updates.status = req.body.status;
  if(req.body.branch) updates.branch = req.body.branch;
  
  await supabase.from('containers').update(updates).eq('id', c.id);
  res.json({ ...c, ...updates });
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"../frontend/index.html")));

module.exports.handler = serverless(app);
