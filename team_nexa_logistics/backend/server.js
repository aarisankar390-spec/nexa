const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

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

const containerTypes = [["Dry Van","28,000 kg"],["High Cube","32,500 kg"],["Reefer","29,000 kg"],["Open Top","30,000 kg"]];
const containers = branches.flatMap((branch, branchIndex) => Array.from({length:10}, (_, index) => {
  const [type,maxWeight] = containerTypes[index % containerTypes.length];
  const size = index % 2 ? "40 ft" : "20 ft";
  const status = branchIndex === 0 && index === 0 ? "Reserved" : branchIndex === 1 && index === 1 ? "In Transit" : branchIndex === 2 && index === 2 ? "Maintenance" : "Available";
  return {id:`TNX-${branch.id.slice(2)}-${String(index + 1).padStart(3,"0")}`,size,type,maxWeight,status,branch:branch.name,updated:index % 2 ? "12 min ago" : "Just now"};
}));

let requests = [
  {id:"REQ-1007", customer:"Arun Industries", origin:"Coimbatore", destination:"Hyderabad", cargo:"Industrial Equipment", weight:"8,000 kg", volume:"28 m³", date:"2026-08-29", container:"Awaiting allocation", requestedSize:"40 ft", status:"Pending", employeeEmail:"employee@teamnexa.in", history:[{status:"Pending",at:"2026-08-26T08:00:00Z"}]},
  {id:"REQ-1008", customer:"Sri Lakshmi Textiles", origin:"Tiruppur", destination:"Bengaluru", cargo:"Textiles", weight:"12,000 kg", volume:"31 m³", date:"2026-08-30", container:"TNX-TN07-006", requestedSize:"40 ft", status:"Approved", employeeEmail:"employee@teamnexa.in", history:[{status:"Pending",at:"2026-08-25T08:00:00Z"},{status:"Approved",at:"2026-08-25T09:00:00Z"}]},
  {id:"REQ-1009", customer:"Delta Foods", origin:"Madurai", destination:"Pune", cargo:"Food Products", weight:"7,500 kg", volume:"24 m³", date:"2026-09-01", container:"TNX-TN03-004", requestedSize:"40 ft", status:"In Transit", employeeEmail:"employee@teamnexa.in", history:[{status:"Pending",at:"2026-08-24T08:00:00Z"},{status:"Approved",at:"2026-08-24T09:00:00Z"},{status:"In Transit",at:"2026-08-25T09:00:00Z"}]}
];

const notifications = [];
const actor = req => users.find(user => user.email.toLowerCase() === String(req.headers["x-user-email"] || "").toLowerCase());
const notify = (request, title, message) => notifications.unshift({id:`NT-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,requestId:request.id,email:request.employeeEmail,title,message,read:false,createdAt:new Date().toISOString()});
const branchForContainer = container => branches.find(branch => branch.name === container.branch);

const users = [
  {email:"owner@teamnexa.in", password:"owner123", role:"owner", name:"TEAM NEXA Owner"},
  {email:"employee@teamnexa.in", password:"employee123", role:"employee", name:"Operations Employee"},
  ...branches.map(b=>({email:b.email,password:"manager123",role:"manager",name:`${b.district} Branch Manager`,branch:b.name}))
];

requests.forEach(request => (request.history || []).slice(1).forEach(event => {
  const container = containers.find(item => item.id === request.container);
  const branch = container ? branchForContainer(container)?.name : "TEAM NEXA";
  notify(request,`Request ${event.status}`,`Your request has been ${event.status.toLowerCase()} by the ${branch} Branch.${container ? ` Container ${container.id} has been reserved for your shipment.` : ""}`);
}));

app.post("/api/login",(req,res)=>{
  const {email,password} = req.body || {};
  const user = users.find(u=>u.email.toLowerCase()===String(email||"").toLowerCase() && u.password===password);
  if(!user) return res.status(401).json({message:"Invalid credentials"});
  const {password:_,...safe} = user;
  res.json(safe);
});

app.get("/api/branches",(req,res)=>res.json(branches));
app.get("/api/containers",(req,res)=>res.json(containers));
app.get("/api/requests",(req,res)=>{const user=actor(req);res.json(user?.role === "employee" ? requests.filter(request=>request.employeeEmail===user.email) : requests)});
app.get("/api/notifications",(req,res)=>res.json(notifications.filter(n=>!req.headers["x-user-email"] || n.email === req.headers["x-user-email"] || actor(req)?.role !== "employee")));
app.patch("/api/notifications/read",(req,res)=>{const user=actor(req);if(!user)return res.status(401).json({message:"Login required"});notifications.filter(n=>n.email===user.email).forEach(n=>n.read=true);res.json({updated:true})});

app.post("/api/requests",(req,res)=>{
  const body=req.body||{};
  const user=actor(req);
  if (!user || user.role !== "employee") return res.status(403).json({message:"Only employees can create shipment requests"});
  const id=`REQ-${1010+requests.length}`;
  const request={
    id, customer:body.customer||"New Customer", origin:body.origin||"Coimbatore",
    destination:body.destination||"Chennai", cargo:body.cargo||"General Cargo",
    weight:body.weight||"0 kg", volume:body.volume||"0 m³",
    date:body.date||new Date().toISOString().slice(0,10), requestedSize:body.containerSize||"20 ft",
    container:"Awaiting allocation", status:"Pending", employeeEmail:user.email, history:[{status:"Pending",at:new Date().toISOString()}]
  };
  requests.unshift(request);
  notify(request,"Request submitted",`Your request ${request.id} is waiting for branch manager approval.`);
  res.status(201).json(request);
});

app.patch("/api/requests/:id",(req,res)=>{
  const r=requests.find(x=>x.id===req.params.id);
  if(!r) return res.status(404).json({message:"Request not found"});
  const user=actor(req);
  if(!user || !["manager","owner"].includes(user.role)) return res.status(403).json({message:"Only authorized managers can update requests"});
  const nextStatus=req.body.status;
  if (!["Approved","Rejected","Allocated","In Transit","Delivered"].includes(nextStatus)) return res.status(400).json({message:"Invalid request status"});
  let selected = req.body.container && containers.find(c=>c.id===req.body.container);
  if (nextStatus === "Approved" || nextStatus === "Allocated") {
    if (!selected || selected.status !== "Available" || selected.size !== r.requestedSize) return res.status(409).json({message:"Select a suitable available container from your branch"});
    const branch=branchForContainer(selected);
    if (user.role === "manager" && branch?.name !== user.branch) return res.status(403).json({message:"Managers can only allocate from their own branch"});
    selected.status=nextStatus === "Allocated" ? "Allocated" : "Reserved";
    selected.updated="Just now";
    r.container=selected.id;
  }
  if (nextStatus === "Rejected" && user.role === "manager" && !containers.some(c=>c.branch===user.branch && c.status==="Available" && c.size===r.requestedSize)) return res.status(409).json({message:"This request can only be updated when a suitable container is available"});
  if (nextStatus === "In Transit" && r.container !== "Awaiting allocation") { const current=containers.find(c=>c.id===r.container); if(current) current.status="In Transit"; }
  const previous=r.status; r.status=nextStatus;
  const eventBranch=selected ? branchForContainer(selected)?.name : (containers.find(c=>c.id===r.container)?.branch || user.branch || "TEAM NEXA");
  r.history.push({status:nextStatus,at:new Date().toISOString(),branch:eventBranch,by:user.name});
  const branch=eventBranch;
  if (previous !== nextStatus) notify(r,`Request ${nextStatus}`,`Your request has been ${nextStatus.toLowerCase()} by the ${branch} Branch.${selected ? ` Container ${selected.id} has been reserved for your shipment.` : ""}`);
  res.json(r);
});

app.patch("/api/containers/:id",(req,res)=>{
  const c=containers.find(x=>x.id===req.params.id);
  if(!c) return res.status(404).json({message:"Container not found"});
  const user=actor(req);
  if(!user || !["manager","owner"].includes(user.role)) return res.status(403).json({message:"Only authorized users can update containers"});
  if(user.role === "manager" && c.branch !== user.branch) return res.status(403).json({message:"Managers can only update their own branch"});
  if(req.body.status) c.status=req.body.status;
  if(req.body.branch) c.branch=req.body.branch;
  c.updated="Just now";
  res.json(c);
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"../frontend/index.html")));

app.listen(5000,()=>console.log("TEAM NEXA running at http://localhost:5000"));
