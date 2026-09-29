/* برنامج المدونة - النسخة المعدلة */
const DB_NAME="almodawana_db", DB_VERSION=4, STORE="names", COMPANY_STORE="companyApprovals", SETTINGS_STORE="settings", OPERATIONS_STORE="operations";
const MAX_CREW=27;
const GOOGLE_EXPECTED_EMAIL="alfaw.soc@gmail.com";
const GOOGLE_ROOT_FOLDER="داتا برنامج المدونة";
const GOOGLE_FOLDERS={operational:"أرشيف المغادرات",names:"اسماء كادر الموانئ",companyReport:"تقرير موافقة الشركات",companyImport:"موافقة جميع الشركات",surveyReport:"تقرير استبيان عن موظف"};
const GOOGLE_SCOPES=["https://www.googleapis.com/auth/gmail.send","https://www.googleapis.com/auth/gmail.readonly","https://www.googleapis.com/auth/drive"].join(" ");
const GOOGLE_CLIENT_ID_KEY="googleOAuthClientId";
let googleTokenClient=null,googleAccessToken=null,googleAccountEmail="",googleTokenExpiry=0;
const DEFAULT_DESTINATION_OPTIONS=["ميناء البصرة","ميناء العمية","الموانئ النفطية"];
const DEFAULT_BOAT_CREW_OPTIONS=[
  "طاقم زورق الرميلة",
  "طاقم زورق الزبير",
  "طاقم زورق غرب القرنة 1",
  "طاقم زورق غرب القرنة 2",
  "طاقم زنزبار 1",
  "طاقم الساحبة السلام",
  "طاقم الساحبة ذو الفقار"
];
const DEFAULT_DEPARTURE_OPTIONS=[];
let DROPDOWN_DATA={destinations:DEFAULT_DESTINATION_OPTIONS.slice(),boatCrews:DEFAULT_BOAT_CREW_OPTIONS.slice(),departures:DEFAULT_DEPARTURE_OPTIONS.slice()};
const BOAT_CREW_OPTIONS=DEFAULT_BOAT_CREW_OPTIONS;

const CONFIG={
  basra:{title:"ميناء البصرة",icon:"⚓",employees:160,departures:["مغادرة كادر ميناء البصرة"],secondBoat:true},
  omya:{title:"ميناء العمية",icon:"⚓",employees:160,departures:["مغادرة كادر ميناء العمية"],secondBoat:false},
  catering:{title:"الاعاشة",icon:"🍱",employees:30,departures:["مغادرة كادر خدمات والاعاشة","مغادرة كادر خدمات والاعاشة البصرة","مغادرة كادر خدمات والاعاشة العمية"],secondBoat:false},
  tug:{title:"بدل الساحبات",icon:"🚢",employees:30,departures:["الساحبة السلام","الساحبة ذو الفقار","الساحبة صفوان","الجنيبة شناشيل","السفينة أبا الفضل","الجنيبة الفاو","المتفرقة"],secondBoat:false},
  delegations:{title:"الوفود",icon:"👥",employees:50,departures:["مغادرة الوفد","الوفد المغادر"],secondBoat:false}
};

DROPDOWN_DATA.departures=[...new Set(Object.values(CONFIG).flatMap(c=>c.departures||[]))];

async function initDropdownData(){
  const saved=await loadSetting("dropdownData");
  const legacy=await loadSetting("dropdownLists");
  const source=(saved&&typeof saved==="object")?saved:((legacy&&typeof legacy==="object")?legacy:null);
  const fallbackDepartures=[...new Set(Object.values(CONFIG).flatMap(c=>c.departures||[]))];
  DROPDOWN_DATA={
    destinations:Array.isArray(source?.destinations)?source.destinations.filter(Boolean):DEFAULT_DESTINATION_OPTIONS.slice(),
    boatCrews:Array.isArray(source?.boatCrews)?source.boatCrews.filter(Boolean):DEFAULT_BOAT_CREW_OPTIONS.slice(),
    departures:Array.isArray(source?.departures)?source.departures.filter(Boolean):fallbackDepartures
  };
  if(!DROPDOWN_DATA.destinations.length)DROPDOWN_DATA.destinations=DEFAULT_DESTINATION_OPTIONS.slice();
  if(!DROPDOWN_DATA.boatCrews.length)DROPDOWN_DATA.boatCrews=DEFAULT_BOAT_CREW_OPTIONS.slice();
  if(!DROPDOWN_DATA.departures.length)DROPDOWN_DATA.departures=fallbackDepartures;
  await saveDropdownData();
}
async function saveDropdownData(){await saveSetting("dropdownData",DROPDOWN_DATA)}
function dropdownList(type){return type==="destinations"?DROPDOWN_DATA.destinations:type==="boatCrews"?DROPDOWN_DATA.boatCrews:DROPDOWN_DATA.departures}
function datalistHTML(id,type){return `<datalist id="${id}">${dropdownList(type).map(x=>`<option value="${esc(x)}"></option>`).join("")}</datalist>`}
const state={page:"home",names:[],draft:null,survey:{employee:"",report:[],status:"",source:"computer",progress:0,searching:false},companies:{list:[],selected:"",showAdd:false,selectedPeople:[],search:""},mail:{file:null,files:[],recipients:[],customEmail:"",subject:"",status:"",messages:[],loading:false,driveFile:null,sendProgress:0,sendStatus:"",sendBusy:false},namesProgress:{active:false,percent:0,status:""},companyProgress:{active:false,percent:0,status:""},employeeUpdate:{folderName:"",files:0,processed:0,added:0,updated:0,duplicates:0,percent:0,status:"",busy:false}};
let deferredInstall=null;
let dbUnavailable=false;

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function normName(s){return String(s??"").trim().replace(/\s+/g," ").toLocaleLowerCase("ar-IQ")}
function toast(msg){const t=document.querySelector("#toast");if(!t)return;t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2400)}
function uid(){return crypto.randomUUID?.() || Date.now()+"-"+Math.random()}
function defaultDraft(type){
  const c=CONFIG[type];
  return {type,destination:"",fuelQty:"",fuelUnit:"طن",boatName:"",boatName2:c.secondBoat?"":null,departureType:c.departures[0]||"",crew:[""],boat2:c.secondBoat?[""]:null,departureNames:[""],departureData:c.departures.reduce((o,d)=>(o[d]=[""],o),{})};
}
function normalizeDraft(d){
  if(!d||!CONFIG[d.type])return null;
  const base=defaultDraft(d.type);
  const out=Object.assign(base,d);
  out.boatName=out.boatName||"";
  out.boatName2=CONFIG[d.type].secondBoat?(out.boatName2||""):null;out.departureType=out.departureType||(d.type==="delegations"?"الوفد المغادر":d.type==="catering"?"كادر خدمات والاعاشة":CONFIG[d.type].departures[0]);
  out.crew=Array.isArray(out.crew)&&out.crew.length?out.crew:[""];
  if(CONFIG[d.type].secondBoat)out.boat2=Array.isArray(out.boat2)&&out.boat2.length?out.boat2:[""];
  if(!Array.isArray(out.departureNames)){const legacyKey=CONFIG[d.type].departures[0];out.departureNames=Array.isArray(out.departureData?.[legacyKey])?out.departureData[legacyKey].slice():[""]}
  out.departureNames=out.departureNames.length?out.departureNames:[""];
  CONFIG[d.type].departures.forEach(dep=>{if(!Array.isArray(out.departureData?.[dep]))out.departureData[dep]=[""]});
  return out;
}
function operationStorageKey(type){return `almodawana_operation_${type}`}
function saveDraft(){
  if(!state.draft)return;
  const snapshot=JSON.parse(JSON.stringify(state.draft));
  try{localStorage.setItem(operationStorageKey(snapshot.type),JSON.stringify(snapshot));localStorage.setItem("almodawana_draft",JSON.stringify(snapshot))}catch(e){console.warn("local draft save failed",e)}
  saveOperationToDB(snapshot).catch(()=>{});
}
function loadDraft(type){
  try{
    const raw=localStorage.getItem(operationStorageKey(type))||localStorage.getItem("almodawana_draft");
    const d=raw?normalizeDraft(JSON.parse(raw)):null;
    return d?.type===type?d:null;
  }catch{return null}
}
async function saveOperationToDB(draft){
  if(!draft)return;
  try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(OPERATIONS_STORE,"readwrite");tx.objectStore(OPERATIONS_STORE).put(JSON.parse(JSON.stringify(draft)));tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){console.warn("operation DB save failed",e)}
}
async function loadOperationFromDB(type){
  try{const db=await openDB();const d=await new Promise((res,rej)=>{const q=db.transaction(OPERATIONS_STORE,"readonly").objectStore(OPERATIONS_STORE).get(type);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});return d?normalizeDraft(d):null}catch(e){return null}
}
function clearDraft(){const type=state.draft?.type;if(type)localStorage.removeItem(operationStorageKey(type));localStorage.removeItem("almodawana_draft");if(type)clearOperationFromDB(type).catch(()=>{});state.draft=null}
async function clearOperationFromDB(type){try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(OPERATIONS_STORE,"readwrite");tx.objectStore(OPERATIONS_STORE).delete(type);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){}}

function openDB(){return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});if(!db.objectStoreNames.contains(COMPANY_STORE))db.createObjectStore(COMPANY_STORE,{keyPath:"id"});if(!db.objectStoreNames.contains(SETTINGS_STORE))db.createObjectStore(SETTINGS_STORE,{keyPath:"key"});if(!db.objectStoreNames.contains(OPERATIONS_STORE))db.createObjectStore(OPERATIONS_STORE,{keyPath:"type"})};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
})}
function fallbackNames(){try{const a=JSON.parse(localStorage.getItem("almodawana_names_fallback")||"[]");return Array.isArray(a)?a:[]}catch{return []}}
function saveFallbackNames(list){localStorage.setItem("almodawana_names_fallback",JSON.stringify(list))}
async function allNames(){
  if(dbUnavailable)return fallbackNames().sort((a,b)=>a.name.localeCompare(b.name,"ar"));
  try{const db=await openDB();return await new Promise((res,rej)=>{const q=db.transaction(STORE,"readonly").objectStore(STORE).getAll();q.onsuccess=()=>res(q.result.sort((a,b)=>a.name.localeCompare(b.name,"ar")));q.onerror=()=>rej(q.error)})}
  catch(e){console.warn("IndexedDB unavailable; using localStorage fallback",e);dbUnavailable=true;return fallbackNames().sort((a,b)=>a.name.localeCompare(b.name,"ar"))}
}
async function addName(name){
  name=String(name||"").trim().replace(/\s+/g," ");
  if(!name)return false;
  const key=normName(name);
  if(dbUnavailable){
    const list=fallbackNames();
    if(list.some(x=>normName(x.name)===key))return false;
    list.push({id:uid(),name,createdAt:Date.now()});
    saveFallbackNames(list);
    state.names=list.sort((a,b)=>a.name.localeCompare(b.name,"ar"));
    return true;
  }
  try{
    const db=await openDB();
    const existing=await new Promise((res,rej)=>{
      const tx=db.transaction(STORE,"readonly"),q=tx.objectStore(STORE).getAll();
      q.onsuccess=()=>res(q.result||[]);
      q.onerror=()=>rej(q.error);
    });
    if(existing.some(x=>normName(x.name)===key)){
      state.names=existing.sort((a,b)=>a.name.localeCompare(b.name,"ar"));
      return false;
    }
    await new Promise((res,rej)=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).add({id:uid(),name,createdAt:Date.now()});
      tx.oncomplete=()=>res();
      tx.onerror=()=>rej(tx.error);
      tx.onabort=()=>rej(tx.error||new Error("IndexedDB transaction aborted"));
    });
    state.names=await allNames();
    return true;
  }catch(e){
    console.warn("IndexedDB add failed; using localStorage fallback",e);
    dbUnavailable=true;
    const list=fallbackNames();
    if(list.some(x=>normName(x.name)===key))return false;
    list.push({id:uid(),name,createdAt:Date.now()});
    saveFallbackNames(list);
    state.names=list.sort((a,b)=>a.name.localeCompare(b.name,"ar"));
    return true;
  }
}
async function updateName(id,name){
  name=String(name||"").trim().replace(/\s+/g," ");if(!name)return {ok:false,reason:"empty"};
  const duplicate=state.names.some(x=>x.id!==id&&normName(x.name)===normName(name));
  if(duplicate)return {ok:false,reason:"duplicate"};
  const old=state.names.find(x=>x.id===id);
  if(dbUnavailable){const list=fallbackNames().map(x=>x.id===id?{...x,name}:x);saveFallbackNames(list);state.names=list.sort((a,b)=>a.name.localeCompare(b.name,"ar"));return {ok:true}}
  try{const db=await openDB();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put({id,name,createdAt:old?.createdAt||Date.now()});tx.oncomplete=async()=>{state.names=await allNames();res({ok:true})};tx.onerror=()=>rej(tx.error)})}
  catch(e){dbUnavailable=true;const list=fallbackNames().map(x=>x.id===id?{...x,name}:x);saveFallbackNames(list);state.names=list.sort((a,b)=>a.name.localeCompare(b.name,"ar"));return {ok:true}}
}
async function deleteName(id){
  if(dbUnavailable){const list=fallbackNames().filter(x=>x.id!==id);saveFallbackNames(list);state.names=list.sort((a,b)=>a.name.localeCompare(b.name,"ar"));return}
  try{const db=await openDB();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=async()=>{state.names=await allNames();res()};tx.onerror=()=>rej(tx.error)})}
  catch(e){dbUnavailable=true;const list=fallbackNames().filter(x=>x.id!==id);saveFallbackNames(list);state.names=list.sort((a,b)=>a.name.localeCompare(b.name,"ar"))}
}
async function clearAllNames(){
  if(dbUnavailable){saveFallbackNames([]);state.names=[];return}
  try{
    const db=await openDB();
    await new Promise((res,rej)=>{
      const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete=()=>res();
      tx.onerror=()=>rej(tx.error);
      tx.onabort=()=>rej(tx.error||new Error("IndexedDB transaction aborted"));
    });
    state.names=[];
  }catch(e){
    console.warn("IndexedDB clear failed; using localStorage fallback",e);
    dbUnavailable=true;saveFallbackNames([]);state.names=[];
  }
}


async function saveSetting(key,value){
  try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(SETTINGS_STORE,"readwrite");tx.objectStore(SETTINGS_STORE).put({key,value});tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)});return true}catch(e){console.warn("saveSetting failed",e);return false}
}
async function loadSetting(key){
  try{const db=await openDB();return await new Promise((res,rej)=>{const q=db.transaction(SETTINGS_STORE,"readonly").objectStore(SETTINGS_STORE).get(key);q.onsuccess=()=>res(q.result?.value??null);q.onerror=()=>rej(q.error)})}catch(e){console.warn("loadSetting failed",e);return null}
}
async function restoreExportFolder(){
  if(exportDirectoryHandle)return exportDirectoryHandle;
  const handle=await loadSetting("exportDirectory");
  if(handle){exportDirectoryHandle=handle;return handle}
  return null
}
function formatNow(){const d=new Date();return `${d.toLocaleDateString("ar-IQ",{weekday:"long",year:"numeric",month:"long",day:"numeric"})} — ${d.toLocaleTimeString("ar-IQ",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`}
function startHomeClock(){const el=document.querySelector("#homeDateTime");if(!el)return;const tick=()=>{if(document.querySelector("#homeDateTime"))document.querySelector("#homeDateTime").textContent=formatNow()};tick();if(window.__homeClock)clearInterval(window.__homeClock);window.__homeClock=setInterval(tick,1000)}


function pageHome(){
  const items=Object.entries(CONFIG).map(([k,c])=>`<div class="card module-card" data-go="${k}"><div class="module-icon">${c.icon}</div><h3>${c.title}</h3><p>إدخال البيانات وتصدير نموذج Excel</p></div>`).join("");
  return `<section class="hero hero-home"><div class="hero-anchor">⚓</div><h1>برنامج المدونة الدولية</h1><h2>مدونة ارصفة الفاو النفطية</h2><div id="homeDateTime" class="home-datetime"></div></section>
  <div class="cards">${items}<div class="card module-card" data-go="names"><div class="module-icon">📋</div><h3>الأسماء</h3><p>إدارة قاعدة الأسماء والإكمال التلقائي.</p></div><div class="card module-card" data-go="survey"><div class="module-icon">🔎</div><h3>استبيان عن موظف</h3><p>بحث مؤقت عن رحلات الموظف داخل ملفات Excel.</p></div><div class="card module-card" data-go="companies"><div class="module-icon">🏢</div><h3>موافقة الشركات</h3><p>إدارة تصاريح الشركات والأشخاص وتواريخ سريانها.</p></div><div class="card module-card" data-go="mail"><div class="module-icon">✉️</div><h3>البريد والمراسلات</h3><p>إرسال البريد، البريد الوارد، وGoogle Drive.</p></div></div>`;
}

function dropdownSelectHTML(id,type,value,placeholder){
  const list=[...dropdownList(type)];
  const current=String(value||"");
  const options=[];
  if(!current) options.push(`<option value="" selected disabled>${esc(placeholder)}</option>`);
  else if(!list.some(x=>normName(x)===normName(current))) options.push(`<option value="${esc(current)}" selected>${esc(current)}</option>`);
  for(const x of list){
    options.push(`<option value="${esc(x)}" ${normName(x)===normName(current)?"selected":""}>${esc(x)}</option>`);
  }
  // قائمة أصلية مثل خانة "وحدة الوقود": نفس عرض الخانة، وتفتح قائمة Chrome/النظام،
  // مع دعم الكتابة على سطح المكتب لاختيار العنصر المطابق من قاعدة البيانات.
  return `<select id="${id}" class="styled-dropdown" data-dropdown-type="${esc(type)}" aria-label="${esc(placeholder)}">${options.join("")}</select>`;
}
function boatSelect(id,value){
  return `<div class="field"><label>اسم طاقم الزورق</label>${dropdownSelectHTML(id,"boatCrews",value,"اختر اسم طاقم الزورق")}</div>`;
}
function nameInput(value,index,kind,max){
  return `<div class="name-row"><div class="name-number">${index+1}</div><div class="name-input-wrap"><input class="name-input" data-kind="${esc(kind)}" data-index="${index}" value="${esc(value)}" autocomplete="off" placeholder="اكتب الاسم"><div class="suggestions hidden"></div></div><button type="button" class="secondary name-next" data-kind="${esc(kind)}" data-index="${index}" aria-label="اعتماد الاسم والانتقال">✓ التالي</button><button type="button" class="secondary save-name" data-save-kind="${esc(kind)}" data-index="${index}">حفظ</button><button type="button" class="secondary add-name-row" data-kind="${esc(kind)}" data-index="${index}" aria-label="إضافة صف أسفل هذا الصف" title="إضافة صف أسفل هذا الصف">إضافة ↓</button><button type="button" class="danger delete-name-row" data-kind="${esc(kind)}" data-index="${index}" aria-label="حذف الصف" title="حذف الصف">🗑️</button></div>`;
}
function renderNameList(arr,kind,max){
  const a=[...(arr||[])];while(a.length<1)a.push("");
  return `<div class="name-list">${a.map((v,i)=>nameInput(v,i,kind,max)).join("")}</div><small class="badge">الحد الأقصى: ${max}</small>`;
}
function nameListWithLabel(arr,kind,max){return `<div>${renderNameList(arr,kind,max)}</div>`}
function pageModule(type){
  const c=CONFIG[type];let d=state.draft;if(!d||d.type!==type){d=defaultDraft(type);state.draft=d}
  // نوع كادر المغادرة مستقل تماماً عن أسماء الكادر. تغيير الاختيار لا يبدّل مصفوفة الأسماء.
  const departures=type==="tug"
    ? c.departures.map(dep=>`<div class="subform section-card departure-card"><div class="section-title">${esc(dep)}</div>${nameListWithLabel(d.departureData[dep],`dep:${dep}`,c.employees)}</div>`).join("")
    : `<div class="subform section-card departure-card"><div class="section-title">${type==="delegations"?"المغادرة":"كادر المغادرة"}</div><div class="field" style="margin-bottom:14px"><label>${type==="delegations"?"نوع المغادرة":"نوع كادر المغادرة"}</label>${dropdownSelectHTML("departureType","departures",d.departureType||"","اختر نوع كادر المغادرة")}</div>${nameListWithLabel(d.departureNames,"employees",c.employees)}</div>`;
  const boat2=c.secondBoat?`<div class="card section-card boat-card"><div class="section-title">الزورق الثاني</div>${boatSelect("boatName2",d.boatName2||"")}<div class="section-title" style="margin-top:18px">أسماء أفراد طاقم الزورق الثاني (حتى 27)</div>${nameListWithLabel(d.boat2,"boat2",MAX_CREW)}</div>`:"";
  return `<div class="module-page module-${type}"><div class="page-head"><div><h2>${c.icon} ${c.title}</h2><p>بيانات العملية الحالية — لا يتم أرشفتها بعد التصدير.</p></div><div class="operation-top-actions"><button class="operation-action operation-print-action operation-export-btn" type="button">طباعة الاسماء وعمل نسخة</button><button class="operation-action operation-clear-action operation-reset-btn" type="button">مسح جميع الاسماء من الصفحة</button></div></div>
  <div class="card section-card general-card"><div class="section-title">البيانات العامة</div><div class="grid"><div class="field"><label>الوجهة</label>${dropdownSelectHTML("destination","destinations",d.destination||"","اختر الوجهة")}</div><div class="field"><label>كمية الوقود</label><input id="fuelQty" inputmode="decimal" value="${esc(d.fuelQty)}" placeholder="الكمية"></div><div class="field"><label>وحدة الوقود</label><select id="fuelUnit"><option ${d.fuelUnit==="طن"?"selected":""}>طن</option><option ${d.fuelUnit==="متر مكعب"?"selected":""}>متر مكعب</option></select></div></div></div>
  <div class="card section-card boat-card"><div class="section-title">طاقم الزورق</div>${boatSelect("boatName",d.boatName||"")}<div class="section-title" style="margin-top:18px">أسماء أفراد طاقم الزورق (حتى 27)</div>${nameListWithLabel(d.crew,"crew",MAX_CREW)}</div>
  ${boat2}${departures}<div class="actions export-actions"><button class="operation-action operation-print-action operation-export-btn" type="button">طباعة الاسماء وعمل نسخة</button><button class="operation-action operation-clear-action operation-reset-btn" type="button">مسح جميع الاسماء من الصفحة</button></div></div>`;
}
function setNamesProgress(percent,status,active=true){state.namesProgress={active,percent:Math.max(0,Math.min(100,Math.round(percent))),status:status||""};const bar=document.querySelector("#namesProgressBar"),val=document.querySelector("#namesProgressValue"),label=document.querySelector("#namesProgressLabel"),wrap=document.querySelector("#namesProgressWrap");if(wrap)wrap.classList.toggle("hidden",!active);if(bar)bar.style.width=state.namesProgress.percent+"%";if(val)val.textContent=state.namesProgress.percent+"%";if(label)label.textContent=state.namesProgress.status}
function setCompanyProgress(percent,status,active=true){state.companyProgress={active,percent:Math.max(0,Math.min(100,Math.round(percent))),status:status||""};const bar=document.querySelector("#companyProgressBar"),val=document.querySelector("#companyProgressValue"),label=document.querySelector("#companyProgressLabel"),wrap=document.querySelector("#companyProgressWrap");if(wrap)wrap.classList.toggle("hidden",!active);if(bar)bar.style.width=state.companyProgress.percent+"%";if(val)val.textContent=state.companyProgress.percent+"%";if(label)label.textContent=state.companyProgress.status}
function progressHTML(kind){const x=kind==="names"?state.namesProgress:state.companyProgress;const id=kind==="names"?"names":"company";return `<div id="${id}ProgressWrap" class="data-progress-wrap ${x.active?"":"hidden"}"><div class="data-progress-head"><strong id="${id}ProgressLabel">${esc(x.status||"")}</strong><span id="${id}ProgressValue">${x.percent||0}%</span></div><div class="data-progress-track"><div id="${id}ProgressBar" class="data-progress-bar" style="width:${x.percent||0}%"></div></div></div>`}
function pageNames(){
  const count=state.names.length;
  return `<div class="page-head"><div><h2>📋 الأسماء</h2><p>قاعدة الأسماء محفوظة على هذا الجهاز.</p></div></div>
  <div class="card">${progressHTML("names")}<div class="names-search-row"><div class="names-search-box"><label for="nameSearch">🔎 البحث في الأسماء</label><input id="nameSearch" class="field-input" type="text" inputmode="text" autocomplete="off" autocapitalize="words" enterkeyhint="search" spellcheck="false" placeholder="اكتب الاسم للبحث..."></div><button class="primary add-name-below-search" id="addNameBtn">+ إضافة اسم</button><div class="names-count-card" aria-label="عدد الأسماء المحفوظة"><span>عدد الأسماء المحفوظة</span><strong id="namesCount">${count}</strong></div></div></div>
  <div class="card"><div class="actions names-tools"><button class="primary" id="exportNamesBtn">📤 تصدير جميع الأسماء</button><button class="drive-sync-button" id="exportNamesDriveBtn" type="button">تصدير جميع الاسماء الى Google Drive</button><button class="secondary" id="importNamesBtn">📥 استيراد أسماء</button><button class="secondary" id="importNamesDriveBtn">☁️ استيراد من Google Drive</button><input id="namesFileInput" type="file" accept=".xlsx,.xls,.csv,.json" class="hidden"></div><p class="help-text">عند الاستيراد تتم مقارنة الأسماء الموجودة وإضافة الأسماء الجديدة فقط، مع تجاهل المكرر.</p></div>
  <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>الاسم</th><th>تاريخ الإضافة</th><th>إجراءات</th></tr></thead><tbody id="namesBody"></tbody></table></div></div>`;
}
function pageSurvey(){
  const r=state.survey?.report||[], searched=state.survey?.employee||"", status=state.survey?.status||"";
  const progress=Math.max(0,Math.min(100,Number(state.survey?.progress||0))), searching=!!state.survey?.searching, source=state.survey?.source||"computer";
  return `<div class="page-head"><div><h2>🔎 استبيان عن موظف</h2><p>اختر مصدر البحث: مجلد من الكمبيوتر أو مجلد Google Drive الثابت.</p></div></div>
  <div class="card survey-search-card"><div class="grid"><div class="field"><label>اسم الموظف</label><input id="surveyEmployee" value="${esc(searched)}" placeholder="اكتب اسم الموظف" ${searching?"disabled":""}></div></div>
  <div class="survey-source-grid"><label class="check-card"><input type="radio" name="surveySource" value="computer" ${source==="computer"?"checked":""}> فولدر من الكمبيوتر</label><label class="check-card"><input type="radio" name="surveySource" value="drive" ${source==="drive"?"checked":""}> فولدر Google Drive الثابت<br><small>داتا برنامج المدونة / أرشيف المغادرات</small></label></div>
  <div class="actions" style="margin-top:14px"><button class="primary" id="surveySearchBtn" ${searching?"disabled":""}>🔍 بحث</button><button class="secondary" id="surveyClearBtn" ${searching?"disabled":""}>↺ مسح الاستبيان</button>${r.length&&!searching?'<button class="primary" id="surveyExportBtn">📥 تصدير التقرير Excel</button>':''}</div>
  ${searching||progress>0?`<div class="survey-progress-wrap"><div class="survey-progress-head"><strong>${searching?"جاري البحث...":"اكتمل البحث"}</strong><span>${progress}%</span></div><div class="survey-progress-track"><div class="survey-progress-bar" style="width:${progress}%"></div></div><div class="survey-progress-status">${esc(status)}</div></div>`:""}
  <p class="help-text">${esc(status||"عند اختيار Google Drive سيتم البحث داخل فولدر أرشيف المغادرات كمرجع ثابت.")}</p></div>
  <div class="card"><div class="table-wrap"><table class="data-table"><thead><tr><th>التسلسل</th><th>اسم الموظف</th><th>كادر المغادرة</th><th>تاريخ الصعود</th><th>اسم الزورق</th><th>المصدر</th></tr></thead><tbody>${r.length?r.map(x=>`<tr><td>${x.seq}</td><td>${esc(x.employee)}</td><td>${esc(x.departure)}</td><td>${esc(x.date)}</td><td>${esc(x.boat)}</td><td>${esc(x.source||"")}</td></tr>`).join(""):'<tr><td colspan="6" class="empty">لا توجد نتائج بعد.</td></tr>'}</tbody></table></div></div>`;
}



function googleStatusText(){return googleAccessToken&&googleAccountEmail?`متصل بالحساب: ${googleAccountEmail}`:"غير متصل بحساب Google."}
function googleCurrentOrigin(){return window.location.origin}
function googleOriginIsUsable(){return location.protocol==="https:" || location.hostname==="localhost" || location.hostname==="127.0.0.1"}
function googleClientId(){return(localStorage.getItem(GOOGLE_CLIENT_ID_KEY)||"").trim()}
function googleRequireClientId(){const id=googleClientId();if(!id){toast("أدخل Google OAuth Client ID من الإعدادات أولاً");navigate("settings");return null}return id}
function googleEnsureScript(){return new Promise((resolve,reject)=>{if(window.google?.accounts?.oauth2)return resolve();let sc=document.querySelector("script[data-google-gsi]");if(sc){sc.addEventListener("load",resolve,{once:true});sc.addEventListener("error",reject,{once:true});return}sc=document.createElement("script");sc.src="https://accounts.google.com/gsi/client";sc.async=true;sc.defer=true;sc.dataset.googleGsi="1";sc.onload=resolve;sc.onerror=reject;document.head.appendChild(sc)})}
async function googleConnect(){
  const id=googleRequireClientId();if(!id)return false;
  if(!googleOriginIsUsable()){toast(`يجب فتح التطبيق عبر HTTPS. العنوان الحالي: ${googleCurrentOrigin()}`);return false}
  try{
    await googleEnsureScript();
    googleTokenClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:GOOGLE_SCOPES,callback:"",error_callback:err=>console.error("Google OAuth error",err)});
    const token=await new Promise((resolve,reject)=>{
      googleTokenClient.callback=r=>r?.error?reject(r):resolve(r);
      try{googleTokenClient.requestAccessToken({prompt:googleAccessToken?"":"select_account"})}catch(err){reject(err)}
    });
    googleAccessToken=token.access_token;googleTokenExpiry=Date.now()+Number(token.expires_in||3600)*1000-60000;
    const profile=await googleApi("/gmail/v1/users/me/profile");
    googleAccountEmail=profile.emailAddress||"";
    if(googleAccountEmail.toLowerCase()!==GOOGLE_EXPECTED_EMAIL.toLowerCase()){googleDisconnect(false);throw new Error(`الحساب المسجل هو ${googleAccountEmail} وليس ${GOOGLE_EXPECTED_EMAIL}`)}
    const about=await googleApi("/drive/v3/about?fields=user(emailAddress,displayName),storageQuota");
    const driveEmail=about.user?.emailAddress||"";
    if(driveEmail && driveEmail.toLowerCase()!==googleAccountEmail.toLowerCase())throw new Error("حساب Google Drive مختلف عن حساب Gmail");
    mailServerStatus={configured:true,email:googleAccountEmail};
    toast("تم ربط Gmail وGoogle Drive بنجاح");render();setTimeout(()=>processDriveUploadQueue(),200);return true;
  }catch(e){
    console.error("Google connection failed",e);
    const raw=e?.error_description||e?.details||e?.message||"خطأ غير معروف";
    const extra=/origin|mismatch/i.test(raw)?` — تأكد أن Authorized JavaScript origins يحتوي: ${googleCurrentOrigin()}`:"";
    toast(`تعذر ربط Gmail وGoogle Drive: ${raw}${extra}`);
    return false
  }
}
function googleDisconnect(show=true){if(googleAccessToken&&window.google?.accounts?.oauth2)try{google.accounts.oauth2.revoke(googleAccessToken,()=>{})}catch{}googleAccessToken=null;googleAccountEmail="";googleTokenClient=null;googleTokenExpiry=0;mailServerStatus={configured:false,email:""};if(show){toast("تم تسجيل الخروج من Google");render()}}
async function googleEnsureAuth(){if(googleAccessToken&&Date.now()<googleTokenExpiry&&googleAccountEmail===GOOGLE_EXPECTED_EMAIL)return true;return await googleConnect()}
async function googleApi(url,options={}){
  if(!googleAccessToken)throw new Error("Google authentication required");
  const headers=new Headers(options.headers||{});headers.set("Authorization",`Bearer ${googleAccessToken}`);
  const res=await fetch(`https://www.googleapis.com${url}`,{...options,headers});
  if(!res.ok){let t="";try{t=await res.text()}catch{}let msg=t;try{const j=JSON.parse(t);msg=j.error?.message||t}catch{}throw new Error(`Google API ${res.status}: ${msg.slice(0,500)}`)}
  const ct=res.headers.get("content-type")||"";return ct.includes("application/json")?res.json():res;
}
function base64UrlEncodeBytes(bytes){let b="",chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)b+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function utf8Base64(s){const bytes=new TextEncoder().encode(String(s??""));let b="";for(let i=0;i<bytes.length;i+=0x8000)b+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(b)}
function utf8Base64Url(s){return utf8Base64(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function fileToBase64Url(file){return base64UrlEncodeBytes(new Uint8Array(await file.arrayBuffer()))}
function mailHeaderValue(headers,name){return headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value||""}
function buildMimeMessage({to,subject,body,attachments}){
  const boundary="----AlmodawanaBoundary"+Date.now().toString(36),encodedSubject=utf8Base64(subject),lines=[`From: ${GOOGLE_EXPECTED_EMAIL}`,`To: ${to}`,`Subject: =?UTF-8?B?${encodedSubject}?=`,`MIME-Version: 1.0`,`Content-Type: multipart/mixed; boundary="${boundary}"`,"",`--${boundary}`,`Content-Type: text/plain; charset="UTF-8"`,`Content-Transfer-Encoding: base64`,"",btoa(unescape(encodeURIComponent(body||"")))];
  for(const item of (attachments||[])){
    const file=item.file,filename=file.name.replace(/["\r\n]/g,"_"),attachmentBase64=item.base64||"";
    lines.push(`--${boundary}`,`Content-Type: ${file.type||"application/octet-stream"}; name="${filename}"`,`Content-Disposition: attachment; filename="${filename}"`,`Content-Transfer-Encoding: base64`,"");
    const b64=attachmentBase64.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-attachmentBase64.length%4)%4);
    lines.push((b64.match(/.{1,76}/g)||[]).join("\r\n"));
  }
  lines.push(`--${boundary}--`);return lines.join("\r\n");
}
function mailPreviewHTML(files){const list=Array.isArray(files)?files.filter(Boolean):(files?[files]:[]);if(!list.length)return'<div class="empty">لم يتم اختيار ملف بعد.</div>';return list.map((file,i)=>{const u=URL.createObjectURL(file),n=esc(file.name);if(file.type.startsWith("image/"))return`<div class="mail-preview-item"><img src="${u}" class="mail-preview-image" alt="${n}"><div class="mail-file-name">${i+1}. ${n}</div></div>`;if(file.type==="application/pdf")return`<div class="mail-preview-item"><iframe src="${u}" class="mail-preview-pdf" title="${n}"></iframe><div class="mail-file-name">${i+1}. ${n}</div></div>`;return`<div class="mail-preview-item mail-generic-preview"><div class="module-icon">📄</div><strong>${i+1}. ${n}</strong><span>${Math.max(1,Math.round(file.size/1024))} KB</span></div>`}).join("")}
function mailRecipientCard(label,email,selected){return`<div class="check-card"><label><input class="mail-recipient" type="checkbox" data-email="${esc(email)}" ${selected.includes(email)?"checked":""}> <span>${esc(label)}</span></label><small>${esc(email)}</small></div>`}
let mailServerStatus={configured:false,email:""};
async function refreshMailServerStatus(){mailServerStatus={configured:!!(googleAccessToken&&googleAccountEmail),email:googleAccountEmail||""};return mailServerStatus}


function employeeUpdateProgress(percent,status,busy=true){
  state.employeeUpdate.percent=Math.max(0,Math.min(100,Math.round(percent)));
  state.employeeUpdate.status=status||"";
  state.employeeUpdate.busy=busy;
  const bar=document.querySelector("#employeeUpdateProgressBar"),val=document.querySelector("#employeeUpdateProgressValue"),label=document.querySelector("#employeeUpdateProgressLabel");
  if(bar)bar.style.width=state.employeeUpdate.percent+"%";
  if(val)val.textContent=state.employeeUpdate.percent+"%";
  if(label)label.textContent=state.employeeUpdate.status;
}
function pageMailEmployeeUpdate(){
  const u=state.employeeUpdate||{};
  const p=Math.max(0,Math.min(100,Number(u.percent||0)));
  return `<div class="page-head"><div><h2>🔄 تحديث بيانات مغادرة الموظفين</h2><p>قراءة ملفات المغادرة من الكمبيوتر وتحديث ملف Search-for-an-employee.xlsx المركزي في Google Drive فقط.</p></div><button class="secondary" data-go="mail">← البريد والمراسلات</button></div>
  <div class="card">
    <div class="grid">
      <div class="field"><label>فولدر ملفات المغادرة</label><input id="employeeUpdateFolder" value="${esc(u.folderName||"D:\\ISPS archives")}" readonly></div>
    </div>
    <div class="actions">
      <button class="secondary" id="employeeUpdateChooseBtn" ${u.busy?"disabled":""}>📁 اختيار فولدر D:\\ISPS archives</button>
      <button class="primary" id="employeeUpdateBtn" ${u.busy?"disabled":""}>🔄 تحديث بيانات مغادرة الموظفين</button>
    </div>
    <p class="help-text">يجب اختيار فولدر ISPS archives من القسم D. لا يتم رفع ملفات المغادرة الأصلية إلى Google Drive؛ يتم تحديث ملف Search-for-an-employee.xlsx المركزي فقط.</p>
    <div class="data-progress-wrap ${u.busy||p>0?"":"hidden"}" id="employeeUpdateProgressWrap">
      <div class="data-progress-head"><strong id="employeeUpdateProgressLabel">${esc(u.status||"")}</strong><span id="employeeUpdateProgressValue">${p}%</span></div>
      <div class="data-progress-track"><div id="employeeUpdateProgressBar" class="data-progress-bar" style="width:${p}%"></div></div>
    </div>
    <div class="card" style="margin-top:14px;background:var(--panel-2,#f8fafc)">
      <div class="section-title">نتيجة آخر تحديث</div>
      <div class="help-text">الملفات المقروءة: <strong>${u.files||0}</strong> — تمت معالجتها: <strong>${u.processed||0}</strong> — سجلات جديدة: <strong>${u.added||0}</strong> — تم استكمال بيانات: <strong>${u.updated||0}</strong> — مكرر تم تجاهله: <strong>${u.duplicates||0}</strong></div>
    </div>
  </div>`;
}
function normalizeCentralDate(v){
  return surveyDateKey(v);
}
function employeeKey(name,date){
  return `${surveyNormalize(name)}|${normalizeCentralDate(date)}`;
}
function looksLikeHeaderRow(row){
  return (row||[]).some(v=>normName(v).includes("اسم الموظف")) || (row||[]).some(v=>normName(v)==="الاسم");
}
function headerIndex(row,aliases){
  const arr=row||[];
  return arr.findIndex(v=>aliases.some(a=>normName(v).includes(normName(a))));
}
function archiveDateFromFilename(name){
  return dateFromFilename(name);
}
function archiveCellIsIgnored(value){
  const v=String(value??'').trim().replace(/\s+/g,' ');
  if(!v)return true;
  const n=normName(v);
  // الأرقام والتواريخ والأوقات لا تعتبر أسماء موظفين.
  if(/^[-+]?\d+(?:[.,]\d+)?$/.test(v))return true;
  if(/^\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}(?:\s+\d{1,2}:\d{2})?$/.test(v))return true;
  if(/^\d{1,2}:\d{2}(?::\d{2})?$/.test(v))return true;
  const ignoredExact=[
    'ت','الاسم','اسم الموظف','اسم الشخص','الموظف','التسلسل','الترقيم',
    'الوجهة','العودة','عند المغادرة','المتفرقة','الساحبة','الزورق','السفينة',
    'الجنيبة','الوفد','مغادرة','عند','تاريخ الصعود','التاريخ','تاريخ المغادرة',
    'كادر المغادرة','نوع كادر المغادرة','نوع المغادرة','المغادرة','اسم الزورق','القارب'
  ];
  if(ignoredExact.some(x=>n===normName(x)))return true;
  // أي خلية تبدأ بالكلمات التالية تُعامل كعنوان/وصف وليس اسم موظف.
  const ignoredStarts=['كمية','الوجهة','طاقم','العودة','عند المغادرة','المتفرقة','الساحبة','الزورق','السفينة','الجنيبة','الوفد','مغادرة','عند'];
  if(ignoredStarts.some(x=>n.startsWith(normName(x))))return true;
  // عناوين وجداول شائعة أخرى لا نريدها كأسماء.
  if(/^(اسم|نوع|تاريخ|كادر|عدد|كم|المجموع|الملاحظات|ملاحظات|الجهة|الشركة|القسم|الصف|رقم)/u.test(n))return true;
  if(/^\d/.test(v))return true;
  return true === !/[\p{L}]/u.test(v);
}
function archiveEmployeeCandidate(value){
  const v=String(value??'').trim().replace(/\s+/g,' ');
  if(archiveCellIsIgnored(v))return '';
  // استبعاد خلايا تبدو كأرقام/معرّفات حتى لو احتوت رموزاً.
  if(!/[\p{L}]/u.test(v))return '';
  return v;
}
function extractArchiveRecords(buffer,fileName){
  if(typeof XLSX==='undefined')throw new Error("XLSX unavailable");
  const wb=XLSX.read(buffer,{type:'array',cellDates:false,cellNF:false,cellText:true});
  const date=archiveDateFromFilename(fileName);
  const fileTexts=[];
  for(const sn of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:false});
    fileTexts.push(...allWorkbookTexts(rows));
  }
  let boat=detectBoatName(fileTexts,fileName);
  if(boat)boat=boat.trim();
  const records=[];

  for(const sn of wb.SheetNames){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:false});
    let currentDeparture=detectDeparture(rows.flatMap(r=>rowText(r)))||'طاقم الزورق';
    let currentBoat=boat;

    for(let ri=0;ri<rows.length;ri++){
      const row=rows[ri]||[];
      const non=row.map((v,i)=>({v:String(v??'').trim(),i})).filter(x=>x.v);
      if(!non.length)continue;

      // نقرأ العناوين من أي مكان في الصف فقط لتحديد الكادر/الزورق كسياق للسجلات.
      const headerRow=non.some(x=>{
        const n=normName(x.v);
        return ['اسم الموظف','اسم الشخص','الموظف','الاسم','التسلسل','كادر المغادرة','نوع كادر المغادرة','نوع المغادرة','اسم الزورق','الزورق','القارب','تاريخ الصعود','التاريخ','تاريخ المغادرة'].some(h=>n===normName(h));
      });
      if(headerRow)continue;

      // عنوان قسم/زورق: لا نضيفه كاسم، وإنما نستخدمه كسياق للصفوف التالية.
      if(non.length===1 && !/^\d+$/.test(non[0].v)){
        const v=non[0].v;
        const n=normName(v);
        if(/مغادرة|وفد|كادر|ساحبة|اعاشة|الإعاشة|العمية|البصرة/u.test(v))currentDeparture=v;
        if(/^طاقم\s+/u.test(v) || /^زورق\s+/u.test(v)){
          currentBoat=cleanBoatName(v);
          if(!boat)boat=currentBoat;
        }
        // الكلمات التي حددها المستخدم لا تُسجل كأسماء مهما كان موقعها.
        if(archiveCellIsIgnored(v))continue;
        // عنوان غير معروف من خلية واحدة: لا نفترض أنه اسم إذا كان واضحاً أنه وصف.
        if(/^(اسم|نوع|تاريخ|كادر|عدد|المجموع|الملاحظات|ملاحظات|الجهة|الشركة|القسم|صف|رقم)/u.test(n))continue;
      }

      // القاعدة الجديدة: افحص كل خلية في كل الأعمدة، وليس عموداً محدداً.
      // أي خلية نصية تبدو اسماً تُضاف، مع تجاهل الأرقام والعناوين والكلمات المحددة.
      for(const cell of non){
        const candidate=archiveEmployeeCandidate(cell.v);
        if(candidate)records.push({employee:candidate,departure:currentDeparture,date,boat:currentBoat,source:fileName});
      }
    }
  }

  // إزالة السجلات الفارغة وتكرار الاسم/التاريخ داخل الملف نفسه.
  const seen=new Map(),out=[];
  for(const r of records){
    const n=String(r.employee||'').trim();
    if(!n||!r.date)continue;
    const k=employeeKey(n,r.date);
    if(!seen.has(k)){seen.set(k,out.length);out.push(r)}
    else{
      const i=seen.get(k),old=out[i];
      const score=x=>[x.departure,x.boat,x.date].filter(Boolean).length;
      if(score(r)>score(old))out[i]=r;
    }
  }
  return out;
}
function centralRowsFromWorkbook(buffer){
  const wb=XLSX.read(buffer,{type:"array",cellDates:false,cellNF:false,cellText:true});
  const sheet=wb.Sheets[wb.SheetNames[0]];
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i]||[];
    const employee=String(r[1]??"").trim();
    if(!employee)continue;
    const date=normalizeCentralDate(r[3]);
    out.push({employee,departure:String(r[2]??"").trim(),date,boat:String(r[4]??"").trim()});
  }
  return out;
}
function mergeCentralRecords(existing,incoming){
  const map=new Map(),order=[];
  const put=(r,isIncoming)=>{
    const employee=String(r.employee||"").trim(),date=normalizeCentralDate(r.date);
    if(!employee||!date)return "skip";
    const key=employeeKey(employee,date);
    const clean={employee,departure:String(r.departure||"").trim(),date,boat:String(r.boat||"").trim()};
    if(!map.has(key)){map.set(key,clean);order.push(key);return "add"}
    const old=map.get(key);let changed=false;
    for(const f of ["departure","boat"])if(!old[f]&&clean[f]){old[f]=clean[f];changed=true}
    if(isIncoming&&changed)return "update";
    return "duplicate";
  };
  for(const r of existing)put(r,false);
  let added=0,updated=0,duplicates=0;
  for(const r of incoming){const x=put(r,true);if(x==="add")added++;else if(x==="update")updated++;else if(x==="duplicate")duplicates++}
  const result=order.map(k=>map.get(k));
  result.sort((a,b)=>String(a.date).localeCompare(String(b.date))||surveyNormalize(a.employee).localeCompare(surveyNormalize(b.employee),"ar"));
  return {result,added,updated,duplicates};
}
function buildCentralSearchWorkbook(existing,incoming){
  const merged=mergeCentralRecords(existing,incoming);
  const aoa=[["التسلسل","اسم الموظف","كادر المغادرة","تاريخ الصعود","اسم الزورق"],...merged.result.map((r,i)=>[i+1,r.employee,r.departure,r.date,r.boat])];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws["!sheetView"]={rightToLeft:true,showGridLines:true};
  ws["!cols"]=[{wch:10},{wch:34},{wch:34},{wch:18},{wch:30}];
  ws["!rows"]=aoa.map(()=>({hpt:22}));
  const head={fill:{fgColor:{rgb:"1F4E78"}},font:{bold:true,color:{rgb:"FFFFFF"},sz:12},alignment:{horizontal:"center",vertical:"center"}};
  const body={alignment:{horizontal:"center",vertical:"center",wrapText:true}};
  for(let c=0;c<5;c++)if(ws[XLSX.utils.encode_cell({r:0,c})])ws[XLSX.utils.encode_cell({r:0,c})].s=head;
  for(let r=1;r<aoa.length;r++)for(let c=0;c<5;c++)if(ws[XLSX.utils.encode_cell({r,c})])ws[XLSX.utils.encode_cell({r,c})].s=body;
  const wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws,"استبيان الموظف");
  const out=XLSX.write(wb,{bookType:"xlsx",type:"array",cellStyles:true});
  return {blob:new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),...merged};
}
async function chooseEmployeeArchiveFolder(){
  if(!window.showDirectoryPicker){toast("اختيار المجلد يحتاج Chrome أو Edge على HTTPS أو localhost.");return null}
  try{
    const handle=await window.showDirectoryPicker({mode:"read",startIn:"downloads",id:"almodawana-employee-archives"});
    if((handle.name||"").trim().toLowerCase()!=="isps archives"){toast("⚠️ اختر الفولدر ISPS archives داخل القسم D");return null}
    state.employeeUpdate.folderName=handle.name||"ISPS archives";
    return handle;
  }catch(e){if(e?.name!=="AbortError")toast("تعذر اختيار فولدر ملفات المغادرة");return null}
}
async function updateEmployeeDepartureData(){
  if(state.employeeUpdate.busy)return;
  const dir=await chooseEmployeeArchiveFolder();
  if(!dir)return;
  try{
    state.employeeUpdate={...state.employeeUpdate,folderName:dir.name,files:0,processed:0,added:0,updated:0,duplicates:0,percent:1,status:"جاري قراءة فولدر ملفات المغادرة...",busy:true};
    render();
    const entries=await getExcelFilesFromDirectory(dir);
    state.employeeUpdate.files=entries.length;
    employeeUpdateProgress(5,`تم العثور على ${entries.length} ملف Excel...`,true);
    if(!entries.length)throw new Error("لم يتم العثور على ملفات Excel داخل فولدر ISPS archives");
    const incoming=[];
    for(let i=0;i<entries.length;i++){
      const e=entries[i];
      try{
        const f=await e.getFile(),date=archiveDateFromFilename(e.name);
        if(!date){console.warn("تجاهل ملف بدون تاريخ في الاسم:",e.name)}
        else incoming.push(...extractArchiveRecords(await f.arrayBuffer(),e.name));
      }catch(err){console.warn("تعذر قراءة",e.name,err)}
      state.employeeUpdate.processed=i+1;
      employeeUpdateProgress(5+Math.round(((i+1)/entries.length)*55),`جاري قراءة الملف ${i+1} من ${entries.length}: ${e.name}`,true);
      await new Promise(r=>setTimeout(r,0));
    }
    if(!(await googleEnsureAuth())){state.employeeUpdate.busy=false;render();return}
    employeeUpdateProgress(65,"جاري العثور على ملف Search-for-an-employee في Google Drive...",true);
    const archiveFolder=await driveFindFolder("أرشيف المغادرات",await driveFindFolder("داتا برنامج المدونة","root").then(x=>x?.id||"root"));
    if(!archiveFolder)throw new Error("لم يتم العثور على فولدر أرشيف المغادرات داخل داتا برنامج المدونة");
    const central=await driveFindFileByName("Search-for-an-employee.xlsx",archiveFolder.id);
    if(!central)throw new Error("لم يتم العثور على Search-for-an-employee.xlsx داخل أرشيف المغادرات");
    employeeUpdateProgress(70,"جاري قراءة الملف المركزي...",true);
    const centralBuffer=await driveDownloadFile(central.id);
    const existing=centralRowsFromWorkbook(centralBuffer);
    employeeUpdateProgress(78,"جاري دمج البيانات ومنع التكرار حسب الموظف والتاريخ...",true);
    const built=buildCentralSearchWorkbook(existing,incoming);
    state.employeeUpdate.added=built.added;state.employeeUpdate.updated=built.updated;state.employeeUpdate.duplicates=built.duplicates;
    employeeUpdateProgress(88,"جاري تحديث الملف المركزي مباشرة في Google Drive...",true);
    await driveUpdateBlob(central.id,built.blob,"Search-for-an-employee.xlsx",p=>employeeUpdateProgress(88+Math.round(p*.12),`جاري رفع التحديث إلى الملف المركزي... ${p}%`,true));
    state.employeeUpdate.percent=100;state.employeeUpdate.busy=false;state.employeeUpdate.status=`اكتمل التحديث — ${built.result.length} سجل في الملف المركزي`;
    render();
    showExportComplete(`تم إكمال تحديث بيانات مغادرة الموظفين — أضيف ${built.added}، استكمل ${built.updated}، وتجاهل ${built.duplicates} مكرر`);
  }catch(e){
    console.error("employee update failed",e);
    state.employeeUpdate.busy=false;
    state.employeeUpdate.status=`تعذر إكمال التحديث: ${e.message||"خطأ غير معروف"}`;
    render();toast(state.employeeUpdate.status);
  }
}
function searchCentralEmployee(reportEmployee,buffer){
  const rows=centralRowsFromWorkbook(buffer),target=surveyNormalize(reportEmployee);
  return rows.filter(r=>containsEmployee(r.employee,reportEmployee)).map((r,i)=>({...r,source:"Search-for-an-employee.xlsx"}));
}
function pageMail(){
 return `<div class="page-head"><div><h2>✉️ البريد والمراسلات</h2><p>الحساب: ${esc(googleAccountEmail||'غير متصل')}</p></div></div><div class="cards mail-actions"><div class="card module-card" data-go="mail-send"><div class="module-icon">📤</div><h3>إرسال بريد</h3><p>إرسال ملف إلى جهة أو أكثر.</p></div><div class="card module-card" data-go="mail-inbox"><div class="module-icon">📥</div><h3>البريد الوارد</h3><p>عرض البريد الوارد وتنزيل المرفقات.</p></div><div class="card module-card" data-go="mail-drive"><div class="module-icon">☁️</div><h3>Google Drive</h3><p>رفع ملف إلى Google Drive.</p></div><div class="card module-card" data-go="mail-employee-update"><div class="module-icon">🔄</div><h3>تحديث بيانات مغادرة الموظفين</h3><p>تجميع ملفات المغادرة المحلية وتحديث ملف الموظفين المركزي.</p></div></div><div class="card google-status-card"><div class="section-title">حالة بريد Gmail</div><div>${googleStatusText()}</div><div class="actions"><button class="primary" data-go="settings">⚙️ إعداد Gmail وGoogle Drive</button></div></div>`;
}
function pageMailSend(){
 const m=state.mail;return `<div class="page-head"><div><h2>📤 إرسال بريد</h2><p>المُرسل: ${esc(googleAccountEmail||'غير متصل')}</p></div><button class="secondary" data-go="mail">← البريد والمراسلات</button></div><div class="card"><div class="grid mail-grid"><div class="field"><label>اختيار الملف من الكمبيوتر</label><input id="mailFile" type="file" multiple></div><div class="field"><label>عنوان البريد الإلكتروني</label><input id="mailCustomEmail" type="email" value="${esc(m.customEmail||'')}" placeholder="name@example.com"></div></div><div class="section-title">الجهات المثبتة</div><div class="checkbox-grid mail-recipient-grid">${mailRecipientCard('الشعبة','cso.soc.isps@gmail.com',m.recipients)}${mailRecipientCard('ميناء البصرة','abot.soc@gmail.com',m.recipients)}${mailRecipientCard('ميناء العمية','akkot.soc@gmail.com',m.recipients)}</div><div class="field" style="margin-top:14px"><label>عنوان البريد</label><input id="mailSubject" value="${esc(m.subject||'')}" placeholder="اكتب عنوان البريد"></div><p class="help-text">يمكن استخدام البريد اليدوي أو الجهات المثبتة أو الجمع بينهما.</p>${mailProgressHTML(m)}<div class="mail-preview-wrap"><div class="section-title">معاينة الملف</div><div class="mail-file-preview">${mailPreviewHTML(m.files?.length?m.files:m.file)}</div></div><div class="actions mail-send-action"><button class="primary" id="mailSendBtn" ${m.sendBusy?"disabled":""}>📤 الإرسال</button></div></div>`;
}
function pageMailInbox(){const m=state.mail;const p=Math.max(0,Math.min(100,Number(m.inboxProgress||0)));const showProgress=!!m.loading||p>0;return `<div class="page-head"><div><h2>📥 البريد الوارد</h2><p>الحساب: ${esc(googleAccountEmail||'غير متصل')}</p></div><button class="secondary" data-go="mail">← البريد والمراسلات</button></div><div class="card"><div class="inbox-progress-wrap ${showProgress?'':'hidden'}" id="inboxProgressWrap"><div class="mail-progress-head"><strong id="inboxProgressLabel">${esc(m.inboxStatus||'جاري تحديث البريد الوارد...')}</strong><span id="inboxProgressValue">${p}%</span></div><div class="mail-progress-track"><div class="mail-progress-bar" id="inboxProgressBar" style="width:${p}%"></div></div></div><div class="actions"><button class="primary" id="mailRefreshInbox" ${m.loading?'disabled':''}>${m.loading?'جاري التحميل...':'🔄 تحديث البريد الوارد'}</button></div><div class="mail-inbox-list">${m.loading?'<div class="empty">جاري قراءة البريد الوارد...</div>':mailMessagesHTML(m.messages)}</div></div>`}
function mailMessagesHTML(messages){if(!messages?.length)return'<div class="empty">لا توجد رسائل معروضة.</div>';return messages.map((x,i)=>`<article class="mail-message"><div class="mail-message-head"><div><strong>${esc(x.subject||'(بدون عنوان)')}</strong><div class="help-text">${esc(x.from||'')} — ${esc(x.date||'')}</div></div><span class="badge">${i+1}</span></div><p>${esc(x.snippet||'')}</p>${x.attachments?.length?`<div class="attachment-list">${x.attachments.map(a=>`<div class="attachment-item"><span class="attachment-name">📎 ${esc(a.filename)}</span><div class="attachment-actions"><button class="secondary mail-preview-attachment" data-message-id="${esc(x.id)}" data-attachment-id="${esc(a.attachmentId||'')}" data-filename="${esc(a.filename)}" data-mime="${esc(a.mimeType||'application/octet-stream')}">👁️ معاينة</button><button class="secondary mail-download-attachment" data-message-id="${esc(x.id)}" data-attachment-id="${esc(a.attachmentId||'')}" data-filename="${esc(a.filename)}" data-mime="${esc(a.mimeType||'application/octet-stream')}">⬇️ تحميل</button></div></div>`).join('')}</div>`:'<small class="help-text">لا توجد مرفقات.</small>'}</article>`).join('')}
function pageMailDrive(){return `<div class="page-head"><div><h2>☁️ Google Drive</h2><p>إرسال ملف إلى Google Drive.</p></div><button class="secondary" data-go="mail">← البريد والمراسلات</button></div><div class="card"><div class="field"><label>اختيار الملف من الكمبيوتر</label><input id="driveSendFile" type="file"></div><div class="mail-file-preview">${mailPreviewHTML(state.mail.driveFile)}</div><div class="mail-progress-wrap hidden" id="driveProgressWrap"><div class="mail-progress-head"><strong id="driveProgressLabel">جاري تجهيز الملف...</strong><span id="driveProgressValue">0%</span></div><div class="mail-progress-track"><div class="mail-progress-bar" id="driveProgressBar" style="width:0%"></div></div></div><div class="actions"><button class="primary" id="driveSendBtn">☁️ إرسال الملف</button></div></div>`}
function fileToBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]||'');r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}
function mailProgressHTML(m){const p=Math.max(0,Math.min(100,Number(m.sendProgress||0)));if(!m.sendBusy&&p===0)return"";return `<div class="mail-progress-wrap" id="mailProgressWrap"><div class="mail-progress-head"><strong>${esc(m.sendStatus||"جاري التنفيذ...")}</strong><span id="mailProgressValue">${p}%</span></div><div class="mail-progress-track"><div class="mail-progress-bar" id="mailProgressBar" style="width:${p}%"></div></div></div>`}
function setMailProgress(percent,status){state.mail.sendProgress=Math.max(0,Math.min(100,Math.round(percent)));state.mail.sendStatus=status||"";const bar=document.querySelector('#mailProgressBar'),val=document.querySelector('#mailProgressValue'),label=document.querySelector('#mailProgressWrap strong');if(bar)bar.style.width=state.mail.sendProgress+'%';if(val)val.textContent=state.mail.sendProgress+'%';if(label)label.textContent=state.mail.sendStatus}
async function sendMailWithAttachment(){
 const files=state.mail.files?.length?state.mail.files:(state.mail.file?[state.mail.file]:[]),custom=(document.querySelector('#mailCustomEmail')?.value||'').trim(),checked=[...document.querySelectorAll('.mail-recipient:checked')].map(x=>x.dataset.email),recipients=[...new Set([...checked,...(custom?[custom]:[])])],subject=(document.querySelector('#mailSubject')?.value||'').trim();
 if(!(await googleEnsureAuth()))return;
 if(!files.length){toast('اختر ملفاً واحداً على الأقل');return}if(!recipients.length){toast('اكتب بريداً أو اختر جهة واحدة على الأقل');return}if(!subject){toast('اكتب عنوان البريد');return}if(!recipients.every(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))){toast('يوجد عنوان بريد غير صحيح');return}
 state.mail.sendBusy=true;state.mail.sendProgress=5;state.mail.sendStatus=`جاري تجهيز ${files.length} ملف...`;render();
 try{
   const attachments=[];
   for(let i=0;i<files.length;i++){setMailProgress(10+Math.round(i/files.length*25),`جاري تجهيز الملف ${i+1} من ${files.length}...`);attachments.push({file:files[i],base64:await fileToBase64Url(files[i])});}
   setMailProgress(40,'جاري تجهيز رسالة Gmail...');
   const to=recipients.join(', '),mime=buildMimeMessage({to,subject,body:`تم إرسال ${files.length} ملف من برنامج المدونة إلى: ${recipients.join('، ')}`,attachments});
   setMailProgress(65,'جاري إرسال البريد إلى Gmail...');
   await googleApi('/gmail/v1/users/me/messages/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:utf8Base64Url(mime)})});
   setMailProgress(100,'اكتمل إرسال البريد بنجاح');state.mail.sendBusy=false;showOperationComplete('تم إرسال البريد بنجاح',()=>{state.mail.file=null;state.mail.files=[];state.mail.recipients=[];state.mail.customEmail='';state.mail.subject='';state.mail.sendProgress=0;state.mail.sendStatus='';state.mail.sendBusy=false;render()});
 }catch(e){console.error(e);state.mail.sendBusy=false;setMailProgress(0,'');toast(`تعذر إرسال البريد: ${e.message||'خطأ غير معروف'}`)}
}
function decodeBase64UrlToText(data){if(!data)return"";const b64=String(data).replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-String(data).length%4)%4);try{return decodeURIComponent(escape(atob(b64)))}catch{try{return atob(b64)}catch{return""}}}
function walkGmailParts(part,out){if(!part)return;if(part.filename){out.attachments.push({filename:part.filename,mimeType:part.mimeType||'application/octet-stream',attachmentId:part.body?.attachmentId||null,data:part.body?.data||""})}if(part.parts)part.parts.forEach(p=>walkGmailParts(p,out));}
function extractGmailBody(payload){let text="",html="";const walk=p=>{if(!p)return;if(p.mimeType==='text/plain'&&p.body?.data&&!text)text=decodeBase64UrlToText(p.body.data);if(p.mimeType==='text/html'&&p.body?.data&&!html)html=decodeBase64UrlToText(p.body.data);(p.parts||[]).forEach(walk)};walk(payload);return text||html||""}
function setInboxProgress(percent,status){state.mail.inboxProgress=Math.max(0,Math.min(100,Math.round(percent)));state.mail.inboxStatus=status||"";const bar=document.querySelector('#inboxProgressBar'),val=document.querySelector('#inboxProgressValue'),label=document.querySelector('#inboxProgressLabel'),wrap=document.querySelector('#inboxProgressWrap');if(wrap)wrap.classList.remove('hidden');if(bar)bar.style.width=state.mail.inboxProgress+'%';if(val)val.textContent=state.mail.inboxProgress+'%';if(label)label.textContent=state.mail.inboxStatus}
async function listInbox(){
 if(state.mail.loading)return;
 if(!(await googleEnsureAuth()))return;
 state.mail.loading=true;state.mail.inboxProgress=3;state.mail.inboxStatus='جاري الاتصال بالبريد الوارد...';render();
 try{
   setInboxProgress(8,'جاري قراءة قائمة الرسائل...');
   const r=await googleApi('/gmail/v1/users/me/messages?maxResults=30&labelIds=INBOX');const ids=r.messages||[];const messages=[];
   if(!ids.length){state.mail.messages=[];state.mail.inboxProgress=100;state.mail.inboxStatus='اكتمل التحديث — لا توجد رسائل';state.mail.loading=false;render();return}
   for(let i=0;i<ids.length;i++){
     const item=ids[i];setInboxProgress(10+Math.round((i/ids.length)*85),`جاري قراءة الرسالة ${i+1} من ${ids.length}...`);
     const m=await googleApi(`/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`);const headers=m.payload?.headers||[];const h=n=>mailHeaderValue(headers,n);const parsed={id:m.id,threadId:m.threadId,subject:h('Subject'),from:h('From'),date:h('Date'),snippet:m.snippet||'',attachments:[]};walkGmailParts(m.payload,parsed);messages.push(parsed);
   }
   state.mail.messages=messages;state.mail.loading=false;state.mail.inboxProgress=100;state.mail.inboxStatus=`اكتمل التحديث — ${messages.length} رسالة`;render();
 }catch(e){console.error(e);state.mail.loading=false;state.mail.inboxProgress=0;state.mail.inboxStatus='';render();toast(`تعذر قراءة البريد الوارد: ${e.message||'خطأ غير معروف'}`)}
}
function base64ToBlob(data,mime){const bin=atob(data);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:mime||'application/octet-stream'})}
async function getGmailAttachmentData(messageId,attachmentId,inlineData){if(inlineData)return inlineData;if(!attachmentId)throw new Error('معرف المرفق غير متاح');const r=await googleApi(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);return r.data||''}
function normalizedBase64ToBlob(data,mime){let b64=String(data||'').replace(/-/g,'+').replace(/_/g,'/');b64+='='.repeat((4-b64.length%4)%4);const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:mime||'application/octet-stream'})}
async function downloadGmailAttachment(messageId,attachmentId,filename,mime,inlineData){try{if(!(await googleEnsureAuth()))return;const data=await getGmailAttachmentData(messageId,attachmentId,inlineData),blob=normalizedBase64ToBlob(data,mime),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename||'attachment';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)}catch(e){console.error(e);toast(`تعذر تنزيل المرفق: ${e.message||''}`)}}
async function printMailPreview(blob,filename,mime){
 const isImage=(mime||"").startsWith("image/"),isPdf=mime==="application/pdf";
 if(isPdf){
   try{
     const pdfUrl=URL.createObjectURL(blob);
     await ensurePdfJs();
     const pdf=await window.pdfjsLib.getDocument({url:pdfUrl}).promise;
     const printWin=window.open("","_blank","width=1000,height=900");
     if(!printWin){URL.revokeObjectURL(pdfUrl);toast("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");return}
     printWin.document.open();
     printWin.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طباعة - ${esc(filename||"المرفق")}</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e5e7eb;font-family:Arial,Tahoma,sans-serif}.toolbar{position:sticky;top:0;z-index:10;background:#fff;padding:10px;text-align:center;border-bottom:1px solid #ddd;margin-bottom:12px}.toolbar button{padding:9px 18px;font-weight:800;font-size:15px;cursor:pointer;margin:0 4px}.status{text-align:center;font-weight:800;padding:14px}.pdf-print-page{width:190mm;height:277mm;margin:12px auto;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;page-break-after:always;break-after:page}.pdf-print-page:last-child{page-break-after:auto;break-after:auto}.pdf-print-page canvas{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}@media print{@page{size:A4 portrait;margin:10mm}html,body{background:#fff;margin:0;padding:0}.toolbar,.status{display:none}.pdf-print-page{width:190mm;height:277mm;margin:0 auto;page-break-after:always;break-after:page}.pdf-print-page:last-child{page-break-after:auto;break-after:auto}.pdf-print-page canvas{max-width:190mm;max-height:277mm}}</style></head><body><div class="toolbar"><button onclick="window.print()">🖨️ طباعة</button><button onclick="window.close()">إغلاق</button></div><div class="status" id="status">جاري تجهيز صفحات PDF للطباعة...</div><div id="pages"></div></body></html>`);
     printWin.document.close();
     const pages=printWin.document.getElementById("pages"),status=printWin.document.getElementById("status");
     for(let i=1;i<=pdf.numPages;i++){
       if(status)status.textContent=`جاري تجهيز صفحة ${i} من ${pdf.numPages}...`;
       const page=await pdf.getPage(i),viewport=page.getViewport({scale:1});
       const maxW=190*96/25.4,maxH=277*96/25.4,scale=Math.min(maxW/viewport.width,maxH/viewport.height);
       const vp=page.getViewport({scale:Math.max(.1,scale)});
       const wrap=printWin.document.createElement("div");wrap.className="pdf-print-page";
       const canvas=printWin.document.createElement("canvas");canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);canvas.style.width=Math.ceil(vp.width)+"px";canvas.style.height=Math.ceil(vp.height)+"px";
       wrap.appendChild(canvas);pages.appendChild(wrap);
       await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
     }
     if(status)status.textContent="اكتملت المعاينة — اضغط طباعة";
     printWin.focus();
     return;
   }catch(e){console.error(e);toast(`تعذر تجهيز PDF للطباعة: ${e.message||"خطأ غير معروف"}`);return}
 }
 const printWin=window.open("","_blank","width=1000,height=800");if(!printWin){toast("تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.");return}
 const url=URL.createObjectURL(blob),safe=esc(filename||"المرفق");
 const content=isImage?`<div class="print-page"><img class="print-attachment-image" src="${url}" alt="${safe}"></div>`:`<div class="print-page unsupported"><div>لا توجد معاينة قابلة للطباعة لهذا النوع من الملفات.<br>${safe}</div></div>`;
 printWin.document.open();printWin.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طباعة - ${safe}</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#e5e7eb}body{font-family:Arial,Tahoma,sans-serif;direction:rtl}.toolbar{position:sticky;top:0;z-index:10;background:#fff;padding:10px;text-align:center;border-bottom:1px solid #ddd;margin-bottom:12px}.toolbar button{padding:9px 18px;font-weight:800;font-size:15px;cursor:pointer;margin:0 4px}.print-page{width:190mm;min-height:277mm;margin:12px auto;background:#fff;display:flex;align-items:flex-start;justify-content:center;overflow:hidden}.print-attachment-image{display:block;width:190mm;max-width:190mm;height:auto;max-height:277mm;object-fit:contain;margin:0 auto}.unsupported{align-items:center;text-align:center;font-weight:700;padding:30mm}@media print{@page{size:A4 portrait;margin:10mm}html,body{background:#fff;margin:0;padding:0}.toolbar{display:none}.print-page{width:190mm;height:277mm;min-height:277mm;max-height:277mm;margin:0 auto;page-break-after:always;break-after:page;overflow:hidden}.print-page:last-child{page-break-after:auto;break-after:auto}.print-attachment-image{width:190mm;max-width:190mm;max-height:277mm;height:auto;object-fit:contain}}</style></head><body><div class="toolbar"><button onclick="window.print()">🖨️ طباعة</button><button onclick="window.close()">إغلاق</button></div>${content}</body></html>`);printWin.document.close();printWin.onload=()=>printWin.focus();setTimeout(()=>printWin.focus(),500)
}
function ensurePdfJs(){return new Promise((resolve,reject)=>{if(window.pdfjsLib)return resolve();const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";s.onload=()=>{try{window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";resolve()}catch(e){reject(e)}};s.onerror=()=>reject(new Error("تعذر تحميل محرك PDF للطباعة"));document.head.appendChild(s)})}
async function previewGmailAttachment(messageId,attachmentId,filename,mime,inlineData){try{if(!(await googleEnsureAuth()))return;const data=await getGmailAttachmentData(messageId,attachmentId,inlineData),blob=normalizedBase64ToBlob(data,mime),url=URL.createObjectURL(blob);const modal=document.querySelector("#modal");if(!modal)return;const isImage=(mime||"").startsWith("image/"),isPdf=mime==="application/pdf";const content=isImage?`<img src="${url}" class="attachment-preview-image" alt="${esc(filename)}">`:isPdf?`<iframe src="${url}" class="attachment-preview-frame" title="${esc(filename)}"></iframe>`:`<div class="empty">لا توجد معاينة لهذا النوع من الملفات. استخدم زر التحميل.</div>`;modal.classList.remove("hidden");modal.innerHTML=`<div class="modal-box attachment-preview-modal"><h3>📎 ${esc(filename)}</h3>${content}<div class="actions"><button class="primary" id="attachmentPreviewPrint">🖨️ طباعة</button><button class="primary" id="attachmentPreviewDownload">⬇️ تحميل إلى الكمبيوتر</button><button class="secondary" id="closeAttachmentPreview">إغلاق</button></div></div>`;document.querySelector("#attachmentPreviewPrint").onclick=()=>printMailPreview(blob,filename,mime);document.querySelector("#attachmentPreviewDownload").onclick=()=>downloadGmailAttachment(messageId,attachmentId,filename,mime,data);document.querySelector("#closeAttachmentPreview").onclick=()=>{modal.classList.add("hidden");URL.revokeObjectURL(url)}}catch(e){console.error(e);toast(`تعذر معاينة المرفق: ${e.message||""}`)}}
async function driveFindFolder(name,parentId="root"){const q=`name = '${String(name).replace(/'/g,"\\\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and '${parentId}' in parents`;const r=await googleApi(`/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=20&fields=files(id,name,parents)`);return r.files?.[0]||null}
async function driveEnsureFolder(name,parentId="root"){const f=await driveFindFolder(name,parentId);if(f)return f;return await googleApi("/drive/v3/files",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,mimeType:"application/vnd.google-apps.folder",parents:[parentId]})})}
async function driveEnsurePath(names){let p="root";for(const n of names){p=(await driveEnsureFolder(n,p)).id}return p}
async function driveUploadBlob(blob,fileName,parentId="root",onProgress){const boundary="-------AlmodawanaDrive"+Date.now().toString(36),meta=JSON.stringify({name:fileName,parents:[parentId]}),prefix=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${blob.type||"application/octet-stream"}\r\n\r\n`]),suffix=new Blob([`\r\n--${boundary}--`]),body=new Blob([prefix,blob,suffix],{type:`multipart/related; boundary=${boundary}`});onProgress?.(1);return await new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('POST','https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink');x.setRequestHeader('Authorization',`Bearer ${googleAccessToken}`);x.setRequestHeader('Content-Type',`multipart/related; boundary=${boundary}`);x.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.max(1,Math.round(e.loaded/e.total*100)))};x.onload=()=>{if(x.status>=200&&x.status<300){try{resolve(JSON.parse(x.responseText))}catch{resolve({})}}else{let msg=x.responseText;try{msg=JSON.parse(msg).error?.message||msg}catch{}reject(new Error(`Google Drive API ${x.status}: ${String(msg).slice(0,500)}`))}};x.onerror=()=>reject(new Error('فشل الاتصال أثناء رفع الملف'));x.send(body)})}

async function driveFindFileByName(name,parentId){
  const q=`name = '${String(name).replace(/'/g,"\\\\'")}' and trashed = false and '${parentId}' in parents`;
  const r=await googleApi(`/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=20&fields=files(id,name,mimeType,modifiedTime,size)`);
  return r.files?.find(f=>f.name===name)||r.files?.[0]||null;
}
async function driveUpdateBlob(fileId,blob,fileName,onProgress){
  const boundary="-------AlmodawanaDriveUpdate"+Date.now().toString(36);
  const meta=JSON.stringify({name:fileName});
  const prefix=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${blob.type||"application/octet-stream"}\r\n\r\n`]);
  const suffix=new Blob([`\r\n--${boundary}--`]);
  const body=new Blob([prefix,blob,suffix],{type:`multipart/related; boundary=${boundary}`});
  onProgress?.(1);
  return await new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();
    x.open("PATCH",`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,modifiedTime,size,webViewLink`);
    x.setRequestHeader("Authorization",`Bearer ${googleAccessToken}`);
    x.setRequestHeader("Content-Type",`multipart/related; boundary=${boundary}`);
    x.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.max(1,Math.round(e.loaded/e.total*100)))};
    x.onload=()=>{
      if(x.status>=200&&x.status<300){try{resolve(JSON.parse(x.responseText))}catch{resolve({})}}
      else{let msg=x.responseText;try{msg=JSON.parse(msg).error?.message||msg}catch{}reject(new Error(`Google Drive API ${x.status}: ${String(msg).slice(0,500)}`))}
    };
    x.onerror=()=>reject(new Error("فشل الاتصال أثناء تحديث الملف المركزي"));
    x.send(body);
  });
}
async function driveListExcelFiles(parentId){const q=`'${parentId}' in parents and trashed = false and (name contains '.xlsx' or name contains '.xls')`;const r=await googleApi(`/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=files(id,name,mimeType,modifiedTime,size)`);return r.files||[]}
async function driveDownloadFile(id){return await(await googleApi(`/drive/v3/files/${encodeURIComponent(id)}?alt=media`)).arrayBuffer()}
const DRIVE_QUEUE_DB="almodawana-drive-queue";
function driveQueueOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DRIVE_QUEUE_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("files"))r.result.createObjectStore("files",{keyPath:"id",autoIncrement:true})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function queueDriveUpload(blob,fileName,folderName){try{const db=await driveQueueOpen();await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").add({blob,fileName,folderName,createdAt:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});toast("تم حفظ نسخة Google Drive مؤقتًا، وسيتم رفعها عند الاتصال وتسجيل الدخول إلى Google.");return true}catch(e){console.warn("drive queue failed",e);return false}}
async function processDriveUploadQueue(){if(!navigator.onLine||!googleClientId())return false;try{if(!(await googleEnsureAuth()))return false;const db=await driveQueueOpen();const items=await new Promise((resolve,reject)=>{const tx=db.transaction("files","readonly"),req=tx.objectStore("files").getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)});for(const item of items){try{const path=await driveEnsurePath([GOOGLE_ROOT_FOLDER,item.folderName]);await driveUploadBlob(item.blob,item.fileName,path);await new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").delete(item.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch(e){console.warn("queued drive upload failed",e);break}}return true}catch(e){console.warn("drive queue processing failed",e);return false}}
window.addEventListener("online",()=>{setTimeout(()=>processDriveUploadQueue(),500)});
async function uploadExportToDrive(blob,fileName,folderName){
  if(!googleClientId()){await queueDriveUpload(blob,fileName,folderName);return "queued"}
  if(!navigator.onLine){await queueDriveUpload(blob,fileName,folderName);return "queued"}
  try{
    const authPromise=googleEnsureAuth();
    const auth=await Promise.race([authPromise,new Promise(resolve=>setTimeout(()=>resolve(false),9000))]);
    if(!auth){await queueDriveUpload(blob,fileName,folderName);return "queued"}
    const p=await driveEnsurePath([GOOGLE_ROOT_FOLDER,folderName]);
    await driveUploadBlob(blob,fileName,p);return true;
  }catch(e){
    console.error("Drive upload deferred",e);await queueDriveUpload(blob,fileName,folderName);return "queued";
  }
}
function showOperationComplete(message,onOk=null){const modal=document.querySelector("#modal");if(!modal){toast(message);if(onOk)onOk();return}modal.classList.remove("hidden");modal.innerHTML=`<div class="modal-box" style="text-align:center"><div style="font-size:46px">✅</div><h3>${esc(message)}</h3><div class="actions" style="justify-content:center"><button class="primary" id="operationCompleteOk">موافق</button></div></div>`;document.querySelector("#operationCompleteOk").onclick=()=>{modal.classList.add("hidden");if(onOk)onOk()}}
async function sendDriveFile(){const f=state.mail.driveFile;if(!f){toast("اختر ملفاً أولاً");return}if(!(await googleEnsureAuth()))return;const btn=document.querySelector('#driveSendBtn');const wrap=document.querySelector('#driveProgressWrap');const bar=document.querySelector('#driveProgressBar');const val=document.querySelector('#driveProgressValue');const label=document.querySelector('#driveProgressLabel');if(btn)btn.disabled=true;if(wrap)wrap.classList.remove('hidden');const update=(p,t)=>{if(bar)bar.style.width=p+'%';if(val)val.textContent=p+'%';if(label)label.textContent=t};try{update(5,'جاري تجهيز الملف...');await driveUploadBlob(f,f.name,'root',p=>update(p,'جاري رفع الملف إلى Google Drive...'));update(100,'اكتمل رفع الملف');showOperationComplete('تم إكمال عملية إرسال الملف إلى Google Drive')}catch(e){console.error(e);toast(`تعذر إرسال الملف إلى Google Drive: ${e.message||''}`)}finally{if(btn)btn.disabled=false}}
async function syncNamesToGoogleDrive(){
  try{
    setNamesProgress(5,"جاري الاتصال بـ Google Drive...",true);
    if(!(await googleEnsureAuth())){setNamesProgress(0,"",false);return;}
    if(typeof XLSX==="undefined")throw new Error("مكتبة Excel غير متاحة");
    const rows=[["الاسم","تاريخ الإضافة"]];
    const seen=new Set();
    for(const n of state.names){const name=String(n?.name||"").trim().replace(/\s+/g," ");const key=normName(name);if(!name||seen.has(key))continue;seen.add(key);rows.push([name,new Date(n.createdAt||Date.now()).toLocaleDateString("ar-IQ")]);}
    setNamesProgress(25,"جاري إنشاء ملف Excel الموحد...",true);
    const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=[{wch:40},{wch:18}];ws["!sheetView"]={rightToLeft:true};
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"الأسماء");
    const out=XLSX.write(wb,{bookType:"xlsx",type:"array",cellStyles:true});
    const blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    setNamesProgress(50,"جاري الوصول إلى ملف empelooy name.xlsx...",true);
    const folderId=await driveEnsurePath([GOOGLE_ROOT_FOLDER,GOOGLE_FOLDERS.names]);
    let file=await driveFindFileByName("empelooy name.xlsx",folderId);
    if(file){
      await driveUpdateBlob(file.id,blob,"empelooy name.xlsx",p=>setNamesProgress(50+Math.round(p*.45),"جاري تحديث ملف الأسماء في Google Drive...",true));
    }else{
      await driveUploadBlob(blob,"empelooy name.xlsx",folderId,p=>setNamesProgress(50+Math.round(p*.45),"جاري إنشاء ملف الأسماء في Google Drive...",true));
    }
    setNamesProgress(100,"تم تحديث جميع الأسماء بدون تكرار",true);toast("تم تحديث empelooy name.xlsx في Google Drive بدون تكرار");setTimeout(()=>setNamesProgress(0,"",false),1800);
  }catch(e){console.error(e);setNamesProgress(0,"",false);toast(`تعذر تحديث ملف الأسماء في Google Drive: ${e.message||"خطأ غير معروف"}`)}
}

async function importNamesFromDrive(){try{setNamesProgress(5,"جاري الاتصال بـ Google Drive...",true);if(!(await googleEnsureAuth())){setNamesProgress(0,"",false);return;}const p=await driveEnsurePath([GOOGLE_ROOT_FOLDER,GOOGLE_FOLDERS.names]),files=await driveListExcelFiles(p);files.sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)));if(!files.length){toast("لا توجد ملفات Excel في فولدر اسماء كادر الموانئ");return}const f=files[0],imported=parseImportedNames(await driveDownloadFile(f.id),f.name),existing=new Set(state.names.map(n=>normName(n.name)));let added=0,dup=0;for(const raw of imported){const name=String(raw||"").trim().replace(/\\s+/g," ");if(!name)continue;if(existing.has(normName(name))){dup++;continue}if(await addName(name)){existing.add(normName(name));added++}}refreshNamesTable(document.querySelector("#nameSearch")?.value||"");setNamesProgress(100,`اكتمل الاستيراد — ${added} جديد`,true);toast(`تم الاستيراد من Google Drive: ${added} جديد، ${dup} مكرر`);setTimeout(()=>setNamesProgress(0,"",false),1500)}catch(e){console.error(e);toast("تعذر استيراد الأسماء من Google Drive")}}
async function syncCompaniesToGoogleDrive(){
  try{
    setCompanyProgress(5,"جاري الاتصال بـ Google Drive...",true);
    if(!(await googleEnsureAuth())){setCompanyProgress(0,"",false);return;}
    if(typeof XLSX==="undefined")throw new Error("مكتبة Excel غير متاحة");
    const rows=[["اسم الشركة","اسم الشخص","تاريخ بداية التصريح","تاريخ انتهاء التصريح","المدة","عدد الأيام المتبقية"]];
    const seen=new Set();
    for(const x of state.companies.list){
      const company=String(x?.company||"").trim().replace(/\s+/g," "),person=String(x?.person||"").trim().replace(/\s+/g," ");
      const key=`${normName(company)}|${normName(person)}`;
      if(!company||!person||seen.has(key))continue;seen.add(key);
      const st=companyStatus(x);rows.push([company,person,x.start||"",x.end||"",st.label,st.days]);
    }
    setCompanyProgress(25,"جاري إنشاء ملف Excel الموحد...",true);
    const ws=XLSX.utils.aoa_to_sheet(rows);ws["!sheetView"]={rightToLeft:true};ws["!cols"]=[{wch:34},{wch:30},{wch:20},{wch:20},{wch:16},{wch:20}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"موافقة الشركات");
    const header={fill:{fgColor:{rgb:"1F4E78"}},font:{bold:true,color:{rgb:"FFFFFF"},sz:13},alignment:{horizontal:"center",vertical:"center"}};for(let c=0;c<6;c++)ws[XLSX.utils.encode_cell({r:0,c})].s=header;
    const out=XLSX.write(wb,{bookType:"xlsx",type:"array",cellStyles:true});const blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    setCompanyProgress(50,"جاري الوصول إلى ملف company.xlsx...",true);
    const folderId=await driveEnsurePath([GOOGLE_ROOT_FOLDER,GOOGLE_FOLDERS.companyImport]);
    let file=await driveFindFileByName("company.xlsx",folderId);
    if(file){
      await driveUpdateBlob(file.id,blob,"company.xlsx",p=>setCompanyProgress(50+Math.round(p*.45),"جاري تحديث ملف الشركات في Google Drive...",true));
    }else{
      await driveUploadBlob(blob,"company.xlsx",folderId,p=>setCompanyProgress(50+Math.round(p*.45),"جاري إنشاء ملف الشركات في Google Drive...",true));
    }
    setCompanyProgress(100,"تم تحديث جميع الشركات والأشخاص بدون تكرار",true);toast("تم تحديث company.xlsx في Google Drive بدون تكرار");setTimeout(()=>setCompanyProgress(0,"",false),1800);
  }catch(e){console.error(e);setCompanyProgress(0,"",false);toast(`تعذر تحديث ملف الشركات في Google Drive: ${e.message||"خطأ غير معروف"}`)}
}

async function importCompaniesFromDrive(){try{setCompanyProgress(5,"جاري الاتصال بـ Google Drive...",true);if(!(await googleEnsureAuth())){setCompanyProgress(0,"",false);return;}const p=await driveEnsurePath([GOOGLE_ROOT_FOLDER,GOOGLE_FOLDERS.companyImport]),files=await driveListExcelFiles(p);files.sort((a,b)=>String(b.modifiedTime).localeCompare(String(a.modifiedTime)));if(!files.length){toast("لا توجد ملفات Excel في فولدر موافقة جميع الشركات");return}const f=files[0],wb=XLSX.read(await driveDownloadFile(f.id),{type:"array",cellDates:false});let rows=[];wb.SheetNames.forEach(sn=>rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:""})));const parsed=rows.map(normalizeImportedCompanyRow).filter(x=>x.company&&x.person&&x.start&&x.end);if(!parsed.length){toast("لا توجد بيانات شركات صالحة");return}if(dbUnavailable)saveFallbackCompanies([]);else{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(COMPANY_STORE,"readwrite");tx.objectStore(COMPANY_STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}state.companies.list=[];let added=0;for(const x of parsed){const r=await saveCompanyRecord(x.company,x.person,normalizeImportDate(x.start),normalizeImportDate(x.end));if(r.ok)added++}state.companies.selected=companyNames()[0]||"";render();setCompanyProgress(100,`اكتمل الاستيراد — ${added} سجل`,true);toast(`تم الاستيراد من Google Drive: ${added} سجل`);setTimeout(()=>setCompanyProgress(0,"",false),1500)}catch(e){console.error(e);toast("تعذر استيراد موافقة الشركات من Google Drive")}}

/* موافقة الشركات — قاعدة مستقلة عن قاعدة الأسماء */
function fallbackCompanies(){try{const a=JSON.parse(localStorage.getItem("almodawana_company_approvals")||"[]");return Array.isArray(a)?a:[]}catch{return []}}
function saveFallbackCompanies(list){localStorage.setItem("almodawana_company_approvals",JSON.stringify(list))}
async function allCompanies(){
  if(dbUnavailable)return fallbackCompanies();
  try{const db=await openDB();return await new Promise((res,rej)=>{const q=db.transaction(COMPANY_STORE,"readonly").objectStore(COMPANY_STORE).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error)})}
  catch(e){console.warn("Company store unavailable; using localStorage fallback",e);dbUnavailable=true;return fallbackCompanies()}
}
async function saveCompanyRecord(company,person,start,end,id=null){
  const companyName=String(company||"").trim().replace(/\s+/g," "), personName=String(person||"").trim().replace(/\s+/g," ");
  if(!companyName||!personName||!start||!end)return {ok:false,reason:"missing"};
  if(end<start)return {ok:false,reason:"dates"};
  const record={id:id||uid(),company:companyName,person:personName,start,end,createdAt:Date.now()};
  const list=await allCompanies();
  const duplicate=list.some(x=>x.id!==record.id&&normName(x.company)===normName(companyName)&&normName(x.person)===normName(personName));
  if(duplicate)return {ok:false,reason:"duplicate"};
  if(dbUnavailable){const next=id?list.map(x=>x.id===id?record:x):[...list,record];saveFallbackCompanies(next);state.companies.list=next;return {ok:true,record}}
  try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(COMPANY_STORE,"readwrite");tx.objectStore(COMPANY_STORE).put(record);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error("abort"))});state.companies.list=await allCompanies();return {ok:true,record}}
  catch(e){dbUnavailable=true;const next=id?list.map(x=>x.id===id?record:x):[...list,record];saveFallbackCompanies(next);state.companies.list=next;return {ok:true,record}}
}
async function deleteCompanyPerson(id){
  if(dbUnavailable){const next=fallbackCompanies().filter(x=>x.id!==id);saveFallbackCompanies(next);state.companies.list=next;return}
  try{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(COMPANY_STORE,"readwrite");tx.objectStore(COMPANY_STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});state.companies.list=await allCompanies()}
  catch(e){dbUnavailable=true;const next=fallbackCompanies().filter(x=>x.id!==id);saveFallbackCompanies(next);state.companies.list=next}
}
async function deleteCompanyAll(company){
  const key=normName(company);if(dbUnavailable){const next=fallbackCompanies().filter(x=>normName(x.company)!==key);saveFallbackCompanies(next);state.companies.list=next;return}
  try{const db=await openDB();const list=await allCompanies();await new Promise((res,rej)=>{const tx=db.transaction(COMPANY_STORE,"readwrite"),st=tx.objectStore(COMPANY_STORE);list.filter(x=>normName(x.company)===key).forEach(x=>st.delete(x.id));tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});state.companies.list=await allCompanies()}
  catch(e){dbUnavailable=true;const next=fallbackCompanies().filter(x=>normName(x.company)!==key);saveFallbackCompanies(next);state.companies.list=next}
}
function companyNames(){return [...new Set(state.companies.list.map(x=>x.company).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ar"))}
function companyStatus(row){const today=new Date();today.setHours(0,0,0,0);const s=new Date(row.start+"T00:00:00"),e=new Date(row.end+"T00:00:00");if(s<=today&&today<=e){const days=Math.max(0,Math.round((e-today)/86400000));return {active:true,label:"سارية",days}}return {active:false,label:"منتهية",days:0}}
function companySummary(company){const rows=state.companies.list.filter(x=>normName(x.company)===normName(company));let active=0,expired=0;rows.forEach(x=>companyStatus(x).active?active++:expired++);return {total:rows.length,active,expired}}
function companyDate(v){return v?new Date(v+"T00:00:00").toLocaleDateString("ar-IQ"):""}
function companySearchResultsHTML(q){
  const query=String(q||"").trim();
  if(!query)return "";
  const results=state.companies.list.filter(x=>normName(x.person).includes(normName(query))).slice(0,30);
  return results.length?results.map(x=>{const st=companyStatus(x);return `<div class="company-search-result"><div><strong>${esc(x.person)}</strong><span>الشركة: ${esc(x.company)}</span></div><div><span>بداية: ${companyDate(x.start)}</span><span>انتهاء: ${companyDate(x.end)}</span><span class="status-pill ${st.active?"active":"expired"}">${st.label}</span><span>الأيام المتبقية: ${st.days}</span></div></div>`}).join(""):'<div class="empty">لا توجد نتائج مطابقة.</div>';
}
function updateCompanySearchResults(){
  const wrap=document.querySelector("#companySearchResults");
  if(!wrap)return;
  const q=String(state.companies.search||"").trim();
  wrap.innerHTML=companySearchResultsHTML(q);
  wrap.classList.toggle("hidden",!q);
}
function pageCompanies(){
  const companies=companyNames(), selected=state.companies.selected&&companies.includes(state.companies.selected)?state.companies.selected:(companies[0]||"");state.companies.selected=selected;
  const rows=selected?state.companies.list.filter(x=>normName(x.company)===normName(selected)):[];
  const add=state.companies.showAdd, q=String(state.companies.search||"").trim();
  return `<div class="page-head"><div><h2>🏢 موافقة الشركات</h2><p>قاعدة مستقلة لتصاريح الشركات والأشخاص.</p></div><div class="company-top-actions"><button class="primary" id="companyAddBtn">+ إضافة</button><button class="secondary" id="companyExportBtn">📤 تصدير الشركة المحددة</button><button class="drive-sync-button" id="exportCompaniesDriveBtn" type="button">تصدير جميع الشركات الى Google Drive</button><button class="secondary" id="companyImportBtn">📥 استيراد Excel</button><button class="secondary" id="companyImportDriveBtn">☁️ استيراد من Google Drive</button><input id="companyImportInput" type="file" accept=".xlsx,.xls" class="hidden"></div></div>${progressHTML("company")}
  ${add?`<div class="card company-add-card"><div class="section-title">إضافة موافقة شركة</div><div class="grid"><div class="field"><label>اسم الشركة</label><input id="companyNameInput" placeholder="اسم الشركة"></div><div class="field"><label>اسم الشخص</label><input id="companyPersonInput" placeholder="اسم الشخص"></div><div class="field"><label>تاريخ بداية التصريح</label><input id="companyStartInput" type="date"></div><div class="field"><label>تاريخ انتهاء التصريح</label><input id="companyEndInput" type="date"></div></div><div class="actions"><button class="primary" id="companySaveBtn">💾 حفظ البيانات</button><button class="secondary" id="companyCancelAddBtn">إلغاء</button></div></div>`:""}
  <div class="card company-search-card"><div class="section-title">🔎 البحث عن اسم</div><div class="field"><label>اسم الشخص</label><input id="companyPersonSearch" value="${esc(state.companies.search||"")}" placeholder="اكتب اسم الشخص للبحث في جميع الشركات" autocomplete="off" autocapitalize="off" spellcheck="false"></div><div id="companySearchResults" class="company-search-results ${q?"":"hidden"}">${companySearchResultsHTML(q)}</div></div>
  <div class="card"><div class="company-select-row"><div class="field company-select-field"><label>اختر الشركة للعرض او التصدير او الحذف</label><select id="companySelect"><option value="">اختر الشركة</option>${companies.map(c=>`<option value="${esc(c)}" ${c===selected?"selected":""}>${esc(c)}</option>`).join("")}</select></div>${selected?`<button class="danger company-delete-btn" id="companyDeleteBtn">🗑️ حذف الشركة مع جميع الأشخاص</button>`:""}</div></div>
  ${companies.length?`<div class="company-counters-grid">${companies.map(c=>{const q=companySummary(c);return `<button class="company-counter-card ${c===selected?"selected":""}" data-company="${esc(c)}"><span class="company-counter-name">${esc(c)}</span><span class="company-counter-numbers"><span class="counter-stat"><small>عدد كادر الشركة</small><i class="counter-blue">${q.total}</i></span><span class="counter-stat"><small>التصريح الساري</small><i class="counter-green">${q.active}</i></span><span class="counter-stat"><small>التصريح المنتهي</small><i class="counter-red">${q.expired}</i></span></span></button>`}).join("")}</div>`:""}
  ${selected?`<div class="card company-report-card"><div class="company-report-head"><div><div class="section-title">تقرير ${esc(selected)}</div><small class="help-text">حدد الأشخاص من الخانات بجانب الأسماء لتنفيذ تعديل جماعي أو حذف جماعي.</small></div><div class="actions"><button class="secondary" id="companyBulkEditBtn">✏️ تعديل المحدد</button><button class="danger" id="companyBulkDeleteBtn">🗑️ حذف المحدد</button></div></div><div class="table-wrap"><table class="data-table company-table"><thead><tr><th>تحديد</th><th>اسم الشخص</th><th>تاريخ بداية التصريح</th><th>تاريخ انتهاء التصريح</th><th>المدة</th><th>عدد الأيام المتبقية</th><th>إجراءات</th></tr></thead><tbody>${rows.length?rows.map(x=>{const st=companyStatus(x);return `<tr data-company-person="${esc(x.id)}"><td><input type="checkbox" class="company-check" data-id="${esc(x.id)}" ${state.companies.selectedPeople.includes(x.id)?"checked":""}></td><td>${esc(x.person)}</td><td>${companyDate(x.start)}</td><td>${companyDate(x.end)}</td><td><span class="status-pill ${st.active?"active":"expired"}">${st.label}</span></td><td>${st.days}</td><td><button class="secondary company-edit-person" data-id="${esc(x.id)}">✏️ تعديل</button> <button class="danger company-delete-person" data-id="${esc(x.id)}">حذف</button></td></tr>`}).join(""):`<tr><td colspan="7" class="empty">لا يوجد أشخاص مسجلون لهذه الشركة.</td></tr>`}</tbody></table></div></div>`:`<div class="card"><div class="empty">أضف شركة ثم اخترها من القائمة لعرض الأشخاص والتصاريح.</div></div>`}`;
}
function selectedCompanyIds(){return [...document.querySelectorAll(".company-check:checked")].map(x=>x.dataset.id)}
async function editCompanyPerson(id){
  const x=state.companies.list.find(r=>r.id===id);if(!x)return;
  const modal=document.querySelector("#modal");modal.classList.remove("hidden");modal.innerHTML=`<div class="modal-box"><h3>تعديل موافقة</h3><div class="grid"><div class="field"><label>اسم الشركة</label><input id="editCompanyName" value="${esc(x.company)}"></div><div class="field"><label>اسم الشخص</label><input id="editCompanyPerson" value="${esc(x.person)}"></div><div class="field"><label>تاريخ بداية التصريح</label><input id="editCompanyStart" type="date" value="${esc(x.start)}"></div><div class="field"><label>تاريخ انتهاء التصريح</label><input id="editCompanyEnd" type="date" value="${esc(x.end)}"></div></div><div class="actions"><button class="primary" id="saveCompanyEdit">حفظ التعديل</button><button class="secondary" id="closeCompanyEdit">إلغاء</button></div></div>`;
  document.querySelector("#closeCompanyEdit").onclick=()=>modal.classList.add("hidden");document.querySelector("#saveCompanyEdit").onclick=async()=>{const r=await saveCompanyRecord(document.querySelector("#editCompanyName").value,document.querySelector("#editCompanyPerson").value,document.querySelector("#editCompanyStart").value,document.querySelector("#editCompanyEnd").value,id);if(!r.ok){toast(r.reason==="dates"?"تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية":r.reason==="duplicate"?"الشخص موجود مسبقًا في هذه الشركة":"أكمل جميع الخانات");return}state.companies.selected=r.record.company;modal.classList.add("hidden");render();toast("تم تعديل البيانات")};
}
async function exportCompanies(){const selected=state.companies.selected;if(!selected){toast("اختر شركة أولاً");return}const rows=state.companies.list.filter(x=>normName(x.company)===normName(selected));if(!rows.length){toast("الشركة المحددة لا تحتوي أشخاصًا");return}try{setCompanyProgress(5,"جاري تجهيز بيانات الشركة...",true);const aoa=[["اسم الشركة","اسم الشخص","تاريخ بداية التصريح","تاريخ انتهاء التصريح","المدة","عدد الأيام المتبقية"]];rows.forEach(x=>{const st=companyStatus(x);aoa.push([x.company,x.person,x.start,x.end,st.label,st.days])});setCompanyProgress(25,"جاري إنشاء ملف Excel...",true);const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!sheetView"]={rightToLeft:true};ws["!cols"]=[{wch:34},{wch:30},{wch:20},{wch:20},{wch:16},{wch:20}];const header={fill:{fgColor:{rgb:"1F4E78"}},font:{bold:true,color:{rgb:"FFFFFF"},sz:13},alignment:{horizontal:"center",vertical:"center"}};for(let c=0;c<6;c++)ws[XLSX.utils.encode_cell({r:0,c})].s=header;const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"موافقة الشركات");const out=XLSX.write(wb,{bookType:"xlsx",type:"array",cellStyles:true}),blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),fileName=`موافقة الشركات - ${selected} - ${localFileTimestamp()}.xlsx`;setCompanyProgress(55,"جاري حفظ نسخة Excel...",true);const ok=await downloadExportFile(blob,fileName);if(!ok){setCompanyProgress(0,"",false);return}setCompanyProgress(78,"جاري إكمال التصدير محلياً...",true);setCompanyProgress(100,"اكتمل التصدير",true);showExportComplete(`تم إكمال تصدير شركة ${selected}`);setTimeout(()=>setCompanyProgress(0,"",false),1500)}catch(e){console.error(e);setCompanyProgress(0,"",false);toast("تعذر إكمال تصدير موافقة الشركات")}}
function normalizeImportedCompanyRow(row){const vals=Object.values(row||{});const find=(names)=>{const k=Object.keys(row||{}).find(h=>names.some(n=>normName(h).includes(normName(n))));return k?row[k]:""};return {company:String(find(["اسم الشركة","الشركة"])||vals[0]||"").trim(),person:String(find(["اسم الشخص","الشخص"])||vals[1]||"").trim(),start:String(find(["تاريخ بداية التصريح","بداية"])||vals[2]||"").trim(),end:String(find(["تاريخ انتهاء التصريح","انتهاء"])||vals[3]||"").trim()}}
async function importCompanies(file){try{setCompanyProgress(5,"جاري قراءة ملف Excel...",true);const data=await file.arrayBuffer(),wb=XLSX.read(data,{type:"array",cellDates:false});let rows=[];wb.SheetNames.forEach(sn=>rows.push(...XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:""})));if(!rows.length){setCompanyProgress(0,"",false);toast("ملف Excel لا يحتوي بيانات");return}const parsed=rows.map(normalizeImportedCompanyRow).filter(x=>x.company&&x.person&&x.start&&x.end);if(!parsed.length){setCompanyProgress(0,"",false);toast("تعذر العثور على أعمدة الشركات والأشخاص والتواريخ");return}setCompanyProgress(25,"جاري استبدال بيانات الشركات...",true);if(dbUnavailable)saveFallbackCompanies([]);else{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(COMPANY_STORE,"readwrite");tx.objectStore(COMPANY_STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}state.companies.list=[];let added=0;for(let i=0;i<parsed.length;i++){const x=parsed[i],r=await saveCompanyRecord(x.company,x.person,normalizeImportDate(x.start),normalizeImportDate(x.end));if(r.ok)added++;if(i%2===0||i===parsed.length-1){setCompanyProgress(30+Math.round((i+1)/parsed.length*65),`جاري استيراد ${i+1} من ${parsed.length}...`,true);await new Promise(r=>setTimeout(r,0))}}state.companies.selected=companyNames()[0]||"";state.companies.showAdd=false;setCompanyProgress(100,`اكتمل الاستيراد — ${added} سجل`,true);render();toast(`تم تصفير بيانات الشركات واستيراد ${added} سجل`);setTimeout(()=>setCompanyProgress(0,"",false),1500)}catch(e){console.error(e);setCompanyProgress(0,"",false);toast("تعذر استيراد ملف Excel")}}
function normalizeImportDate(v){if(!v)return "";if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(String(v)))return String(v).replace(/(\d{4})-(\d{1,2})-(\d{1,2})/,(_,y,m,d)=>`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`);if(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(String(v))){const [d,m,y]=String(v).split(/[\/-]/);return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`}if(!isNaN(v)){const dt=new Date(Math.round((Number(v)-25569)*86400000));return dt.toISOString().slice(0,10)}const dt=new Date(v);return isNaN(dt)?"":dt.toISOString().slice(0,10)}
async function initCompanies(){state.companies.list=await allCompanies()}

function pageSettings(){
 const clientId=localStorage.getItem(GOOGLE_CLIENT_ID_KEY)||'';
 const origin=googleCurrentOrigin();
 return `<div class="settings-page"><div class="page-head"><div><h2>⚙️ الإعدادات</h2><p>إعدادات المظهر، Gmail، Google Drive والتصدير.</p></div></div>
 <div class="card"><div class="section-title">المظهر</div><button class="secondary" id="themeSettings">تبديل Dark / Light</button></div>
 <div class="card"><div class="section-title">📧☁️ ربط Gmail وGoogle Drive</div><p class="help-text">يستخدم Gmail وGoogle Drive نفس Google OAuth. لا تستخدم Redirect URI في هذا الإصدار. أضف عنوان الموقع الحالي أدناه إلى Authorized JavaScript origins في Google Cloud.</p>
 <div class="field"><label>Google OAuth Client ID</label><input id="googleClientId" value="${esc(clientId)}" placeholder="1234567890-xxxxxxxx.apps.googleusercontent.com"></div>
 <div class="card-mini" style="margin-top:10px"><strong>Authorized JavaScript origin المطلوب لهذا الجهاز</strong><div class="code-like">${esc(origin)}</div><small>على Render يجب أن يكون https://modawana-app.onrender.com. على الكمبيوتر المحلي يمكن استخدام http://localhost:8787.</small></div>
 <div class="actions"><button class="primary" id="saveGoogleClientId">💾 حفظ Client ID</button><button class="primary" id="googleConnectBtn">🔐 ربط Gmail وGoogle Drive</button><button class="secondary" id="googleDisconnectBtn">تسجيل الخروج</button></div>
 <div class="help-text" style="margin-top:10px">${esc(googleStatusText())}</div></div>
 <div class="card dropdown-management-card"><div class="section-title">إدارة القوائم المنسدلة</div><p class="help-text">إدارة بيانات الوجهة واسم طاقم الزورق وجهة المغادرة. هذه الأزرار محمية بكلمة المرور.</p><div class="actions dropdown-management-actions"><button class="secondary protected-dropdown-btn" data-dropdown-type="destinations">📍 بيانات الوجهة</button><button class="secondary protected-dropdown-btn" data-dropdown-type="boatCrews">🚤 بيانات اسم طاقم الزورق</button><button class="secondary protected-dropdown-btn" data-dropdown-type="departures">↗️ بيانات جهة المغادرة</button></div></div>
 <div class="card"><div class="section-title">البيانات</div><p class="help-text">قاعدة الأسماء محفوظة محليًا، وبيانات العمليات لا تُحذف بالتصدير.</p></div>
 <div class="card export-folder-card"><div class="section-title">مجلد تصدير Excel</div><p class="help-text">المجلد المحلي الرسمي المقترح هو D:\ISPS archives.</p><button class="secondary" id="chooseExportFolderBtn">📁 تحديد مجلد التصدير</button><div id="exportFolderStatus" class="help-text"></div></div></div>`;
}
function render(){
  const app=document.querySelector("#app");
  if(state.page==="home")app.innerHTML=pageHome();else if(state.page==="names")app.innerHTML=pageNames();else if(state.page==="settings")app.innerHTML=pageSettings();else if(state.page==="survey")app.innerHTML=pageSurvey();else if(state.page==="companies")app.innerHTML=pageCompanies();else if(state.page==="mail")app.innerHTML=pageMail();else if(state.page==="mail-send")app.innerHTML=pageMailSend();else if(state.page==="mail-inbox")app.innerHTML=pageMailInbox();else if(state.page==="mail-drive")app.innerHTML=pageMailDrive();else if(state.page==="mail-employee-update")app.innerHTML=pageMailEmployeeUpdate();else app.innerHTML=pageModule(state.page);
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===state.page));bindPage();if(state.page==="home")startHomeClock();requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:"auto"}));
}
async function refreshNamesTable(filter=""){
  const body=document.querySelector("#namesBody");if(!body)return;
  const q=String(filter||"").trim();const list=q?state.names.filter(x=>x.name.startsWith(q)):state.names.slice();
  body.innerHTML=list.length?list.map(x=>`<tr data-name-row="${esc(x.id)}"><td><span class="name-display" data-display="${esc(x.id)}">${esc(x.name)}</span><input class="name-edit-input hidden" data-edit="${esc(x.id)}" value="${esc(x.name)}"></td><td>${new Date(x.createdAt||Date.now()).toLocaleDateString("ar-IQ")}</td><td><button class="secondary edit-name" data-id="${esc(x.id)}">✏️ تعديل</button> <button class="primary save-edit-name hidden" data-id="${esc(x.id)}">حفظ</button> <button class="secondary cancel-edit-name hidden" data-id="${esc(x.id)}">إلغاء</button> <button class="danger delete-name" data-id="${esc(x.id)}">حذف</button></td></tr>`).join(""):`<tr><td colspan="3" class="empty">لا توجد أسماء مطابقة.</td></tr>`;
  const countEl=document.querySelector("#namesCount");if(countEl)countEl.textContent=state.names.length;
  bindNamesTable();
}
function bindNamesTable(){
  document.querySelectorAll(".edit-name").forEach(b=>b.onclick=()=>toggleNameEdit(b.dataset.id,true));
  document.querySelectorAll(".cancel-edit-name").forEach(b=>b.onclick=()=>toggleNameEdit(b.dataset.id,false));
  document.querySelectorAll(".save-edit-name").forEach(b=>b.onclick=async()=>{const input=document.querySelector(`[data-edit="${CSS.escape(b.dataset.id)}"]`);const result=await updateName(b.dataset.id,input.value);if(!result.ok){toast(result.reason==="duplicate"?"الاسم موجود مسبقًا":"أدخل اسمًا صحيحًا");return}toast("تم تعديل الاسم");refreshNamesTable(document.querySelector("#nameSearch")?.value||"")});
  document.querySelectorAll(".delete-name").forEach(b=>b.onclick=async()=>{if(confirm("حذف الاسم؟")){await deleteName(b.dataset.id);refreshNamesTable(document.querySelector("#nameSearch")?.value||"")}});
}
function toggleNameEdit(id,editing){
  const row=document.querySelector(`[data-name-row="${CSS.escape(id)}"]`);if(!row)return;
  row.querySelector(".name-display")?.classList.toggle("hidden",editing);row.querySelector(".name-edit-input")?.classList.toggle("hidden",!editing);
  row.querySelector(".edit-name")?.classList.toggle("hidden",editing);row.querySelector(".save-edit-name")?.classList.toggle("hidden",!editing);row.querySelector(".cancel-edit-name")?.classList.toggle("hidden",!editing);
  if(editing)row.querySelector(".name-edit-input")?.focus();
}
function bindAutocomplete(){
  document.querySelectorAll(".name-next").forEach(btn=>btn.addEventListener("click",()=>{const inp=document.querySelector(`.name-input[data-kind="${CSS.escape(btn.dataset.kind)}"][data-index="${btn.dataset.index}"]`);if(inp?.__commitAndNext)inp.__commitAndNext()}));
  document.querySelectorAll(".delete-name-row").forEach(btn=>btn.addEventListener("click",()=>deleteOperationNameRow(btn.dataset.kind,+btn.dataset.index)));
  document.querySelectorAll(".add-name-row").forEach(btn=>btn.addEventListener("click",()=>addOperationNameRowBelow(btn.dataset.kind,+btn.dataset.index)));
  document.querySelectorAll(".name-input").forEach(inp=>{
    inp.addEventListener("input",()=>{
      const wrap=inp.parentElement,box=wrap.querySelector(".suggestions"),q=inp.value,matches=q?state.names.filter(n=>n.name.startsWith(q)).slice(0,10):[];
      box.innerHTML=matches.map(n=>`<div class="suggestion" data-value="${esc(n.name)}">${esc(n.name)}</div>`).join("");box.classList.toggle("hidden",!matches.length);
      inp.classList.add("typing-active");
      // أثناء الكتابة: احفظ القيمة فقط بدون إضافة خانة جديدة أو إعادة بناء DOM.
      // إضافة الخانة الجديدة تتم حصريًا عند اعتماد الاسم بـ Enter/التالي.
      const typingArray=getArray(inp.dataset.kind);
      if(Array.isArray(typingArray)){
        typingArray[+inp.dataset.index]=inp.value;
        saveDraft();
      }
      refreshDuplicateVisuals(false);
      if(isDuplicateOperationName(inp.value,inp.dataset.kind,+inp.dataset.index) && q.length>=2) toast("⚠️ الاسم مكرر في هذه العملية");
    });
    const commitAndNext=()=>{
      const kind=inp.dataset.kind,index=+inp.dataset.index;
      const box=inp.parentElement.querySelector(".suggestions");
      const first=box?.querySelector(".suggestion");
      let value=inp.value.trim();
      if(first){value=first.dataset.value||value;inp.value=value}
      if(!value){toast("اكتب الاسم أولاً");inp.focus();return false}
      // لا نعيد بناء الصفحة أثناء الكتابة/الانتقال؛ هذا يمنع اختفاء لوحة الهاتف وتغيّر موضع الحقل.
      const beforeScroll=window.scrollY;
      const a=getArray(kind);
      const needsNewRow=Array.isArray(a) && index===a.length-1 && a.length<(kind==="crew"||kind==="boat2"?MAX_CREW:CONFIG[state.draft.type].employees);
      setArrayValue(kind,index,value,false);
      inp.parentElement.querySelector(".suggestions")?.classList.add("hidden");
      if(needsNewRow){
        // نحتاج إعادة رسم واحدة فقط عند إنشاء السطر التالي، ثم نعيد الموضع والتركيز.
        render();
        requestAnimationFrame(()=>{
          window.scrollTo({top:beforeScroll,behavior:"instant"});
          const target=document.querySelector(`.name-input[data-kind="${CSS.escape(kind)}"][data-index="${index+1}"]`) ||
            document.querySelector(`.name-input[data-kind="${CSS.escape(kind)}"][data-index="${index}"]`);
          if(target){target.focus();try{target.setSelectionRange(target.value.length,target.value.length)}catch{}}
          refreshDuplicateVisuals(false);
        });
      }else{
        refreshDuplicateVisuals(false);
        requestAnimationFrame(()=>focusNextName(kind,index));
      }
      return true;
    };
    inp.__commitAndNext=commitAndNext;
    inp.addEventListener("keydown",e=>{
      if(e.key==="Enter"||e.key==="NumpadEnter"){e.preventDefault();e.stopPropagation();commitAndNext();}
      else if(e.key==="Tab" && !e.shiftKey && inp.value.trim()){e.preventDefault();e.stopPropagation();commitAndNext();}
    });
    inp.addEventListener("blur",()=>setTimeout(()=>inp.parentElement.querySelector(".suggestions")?.classList.add("hidden"),150));
    inp.parentElement.querySelector(".suggestions").addEventListener("mousedown",e=>{const s=e.target.closest(".suggestion");if(!s)return;e.preventDefault();inp.value=s.dataset.value;setArrayValue(inp.dataset.kind,+inp.dataset.index,inp.value,false);inp.parentElement.querySelector(".suggestions").classList.add("hidden");refreshDuplicateVisuals(false);requestAnimationFrame(()=>focusNextName(inp.dataset.kind,+inp.dataset.index))});
  });
}
function focusNextName(kind,index){
  const next=document.querySelector(`.name-input[data-kind="${CSS.escape(kind)}"][data-index="${index+1}"]`);
  if(next){next.focus();try{next.setSelectionRange(next.value.length,next.value.length)}catch{};return next}
  const current=document.querySelector(`.name-input[data-kind="${CSS.escape(kind)}"][data-index="${index}"]`);
  if(current){current.focus();try{current.setSelectionRange(current.value.length,current.value.length)}catch{};return current}
  return null;
}
function allCurrentOperationNames(){
  const d=state.draft||{};
  const out=[];
  if(Array.isArray(d.crew))out.push(...d.crew);
  if(Array.isArray(d.boat2))out.push(...d.boat2);
  if(d.type==="tug"){for(const arr of Object.values(d.departureData||{}))if(Array.isArray(arr))out.push(...arr)} else if(Array.isArray(d.departureNames))out.push(...d.departureNames);
  return out.map(x=>String(x||"").trim()).filter(Boolean);
}
function isDuplicateOperationName(value,kind,index){
  const key=normName(value);if(!key)return false;
  const d=state.draft||{};
  const currentKind=kind;
  const lists=[];
  if(Array.isArray(d.crew))lists.push(["crew",d.crew]);
  if(Array.isArray(d.boat2))lists.push(["boat2",d.boat2]);
  if(d.type==="tug"){for(const [dep,arr] of Object.entries(d.departureData||{}))if(Array.isArray(arr))lists.push([`dep:${dep}`,arr]);}
  else if(Array.isArray(d.departureNames))lists.push(["employees",d.departureNames]);
  let count=0;
  for(const [k,arr] of lists){for(const [i,v] of arr.entries()){if(k===currentKind&&i===index)continue;if(normName(v)===key)count++;}}
  return count>0;
}
function updateDuplicateVisual(inp,showMessage=false){
  const dup=isDuplicateOperationName(inp.value,inp.dataset.kind,+inp.dataset.index);
  inp.classList.toggle("duplicate-name",dup);
  if(dup&&showMessage)toast("⚠️ الاسم مكرر في هذه العملية، يرجى مراجعة الاسم");
  return dup;
}
function refreshDuplicateVisuals(showMessage=false){
  document.querySelectorAll(".name-input").forEach(inp=>updateDuplicateVisual(inp,showMessage));
}
function setArrayValue(kind,index,value,rerender=true){
  const a=getArray(kind);if(!a)return;a[index]=value;
  const max=kind==="crew"||kind==="boat2"?MAX_CREW:CONFIG[state.draft.type].employees;
  if(String(value).trim()&&index===a.length-1&&a.length<max)a.push("");
  while(a.length>1&&String(a[a.length-1]).trim()===""&&String(a[a.length-2]).trim()==="")a.pop();
  saveDraft();if(rerender)render();
}
function getArray(kind){if(kind==="crew")return state.draft.crew;if(kind==="boat2")return state.draft.boat2;if(kind==="employees")return state.draft.departureNames;if(kind.startsWith("dep:"))return state.draft.departureData[kind.slice(4)];return state.draft.departureNames}

function addOperationNameRowBelow(kind,index){
  const a=getArray(kind);
  if(!Array.isArray(a))return;
  const max=kind==="crew"||kind==="boat2"?MAX_CREW:CONFIG[state.draft.type].employees;
  if(a.length>=max){toast(`الحد الأقصى ${max} اسم`);return}
  const at=Math.max(0,Math.min(Number(index)||0,a.length-1));
  a.splice(at+1,0,"");
  saveDraft();
  const scroll=window.scrollY;
  render();
  requestAnimationFrame(()=>{
    window.scrollTo({top:scroll,behavior:"instant"});
    const input=document.querySelector(`.name-input[data-kind="${CSS.escape(kind)}"][data-index="${at+1}"]`);
    if(input){input.focus();try{input.setSelectionRange(0,0)}catch{}}
    refreshDuplicateVisuals(false);
  });
}

async function deleteOperationNameRow(kind,index){
  const a=getArray(kind);
  if(!Array.isArray(a))return;
  const oldIndex=Number(index)||0;
  if(a.length<=1){
    a[0]="";
  }else{
    a.splice(oldIndex,1);
    if(!a.length)a.push("");
  }
  while(a.length>1 && String(a[a.length-1]||"").trim()==="" && String(a[a.length-2]||"").trim()==="")a.pop();
  saveDraft();
  render();
  requestAnimationFrame(()=>{
    const targetIndex=Math.max(0,Math.min(oldIndex-1,a.length-1));
    const input=document.querySelector(`.name-input[data-kind="${CSS.escape(kind)}"][data-index="${targetIndex}"]`);
    if(input){input.focus();try{input.setSelectionRange(input.value.length,input.value.length)}catch{}}
  });
}
async function saveCurrentName(kind,index){
  const a=getArray(kind),value=(a[index]||"").trim();
  if(!value){toast("اكتب الاسم أولاً");return}
  if(isDuplicateOperationName(value,kind,index)){toast("⚠️ لا يمكن تثبيت الاسم لأنه مكرر في هذه العملية");refreshDuplicateVisuals(true);return}
  const added=await addName(value);
  saveDraft();
  if(state.page==="names")await refreshNamesTable(document.querySelector("#nameSearch")?.value||"");
  toast(added?"تم حفظ الاسم":"الاسم موجود مسبقًا");
}
function collectNonEmpty(a){return(a||[]).map(x=>String(x||"").trim()).filter(Boolean)}
function distributeThree(names){const n=names.length,base=Math.floor(n/3),rem=n%3,sizes=[base+(rem>0?1:0),base+(rem>1?1:0),base];return[names.slice(0,sizes[0]),names.slice(sizes[0],sizes[0]+sizes[1]),names.slice(sizes[0]+sizes[1])]}
function sizesNumber(groups,groupIndex,i){return groups.slice(0,groupIndex).reduce((n,g)=>n+g.length,0)+i+1}

let exportDirectoryHandle=null;
const EXPORT_FOLDER_HINT="D:\\ISPS archives";
async function verifyExportDirectory(handle){
  if(!handle)return false;
  try{
    let permission=await handle.queryPermission?.({mode:"readwrite"});
    if(permission!=="granted") permission=await handle.requestPermission?.({mode:"readwrite"});
    return permission==="granted";
  }catch(e){console.warn("export folder permission check failed",e);return false}
}
async function chooseExportFolder(){
  if(!window.showDirectoryPicker){
    toast("اختيار مجلد ثابت يحتاج Chrome أو Edge عبر HTTPS أو localhost. افتح البرنامج من عنوان localhost/HTTPS.");
    return null;
  }
  try{
    const handle=await window.showDirectoryPicker({mode:"readwrite",startIn:"downloads",id:"almodawana-export-folder"});
    if((handle.name||"").trim().toLowerCase()!=="isps archives"){toast("⚠️ اختر الفولدر ISPS archives داخل القسم D");return null}
    const ok=await verifyExportDirectory(handle);
    if(!ok){toast("لم يتم منح صلاحية الكتابة إلى المجلد المختار");return null}
    exportDirectoryHandle=handle;
    const saved=await saveSetting("exportDirectory",handle);
    const status=document.querySelector("#exportFolderStatus");
    if(status)status.textContent=`المجلد الرسمي: ${handle.name||EXPORT_FOLDER_HINT}${saved?" — محفوظ":" — تعذر حفظ الاختيار، سيبقى لهذه الجلسة"}`;
    toast(`تم تثبيت مجلد التصدير: ${handle.name||EXPORT_FOLDER_HINT}`);
    return handle;
  }catch(e){
    if(e?.name!=="AbortError") console.error(e);
    if(e?.name!=="AbortError") toast("تعذر فتح اختيار مجلد التصدير. استخدم Chrome أو Edge عبر HTTPS أو localhost.");
    return null;
  }
}
function xmlEsc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
function colLetter(n){let s="";while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s}
function crc32(bytes){let table=crc32.table;if(!table){table=crc32.table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);table[n]=c>>>0}}let c=0xFFFFFFFF;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function catBytes(...parts){let total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total),o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
function zipStore(entries){const enc=new TextEncoder(),local=[],central=[];let offset=0;for(const entry of entries){const name=enc.encode(entry.name),data=typeof entry.data==="string"?enc.encode(entry.data):entry.data,crc=crc32(data);const lh=catBytes(new Uint8Array([80,75,3,4]),u16(20),u16(0x800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name);local.push(lh,data);const ch=catBytes(new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0x800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name);central.push(ch);offset+=lh.length+data.length}const lb=catBytes(...local),cb=catBytes(...central),e=catBytes(new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(cb.length),u32(lb.length),u16(0));return new Blob([lb,cb,e],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}
const XS={general:1,boat:2,departure:3,header:4,body:5,number:6,titleBoat:7,titleDeparture:8};
function xlsxStyles(){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="12"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="12"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="14"/><name val="Arial"/><family val="2"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="DDEBF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="E2F0D9"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FCE4D6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="D9E1F2"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="808080"/></left><right style="thin"><color rgb="808080"/></right><top style="thin"><color rgb="808080"/></top><bottom style="thin"><color rgb="808080"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="5" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="5" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>`}
function cellXml(ref,value,style=0){if(value===null||value===undefined||value==="")return `<c r="${ref}" s="${style}"/>`;const isNum=typeof value==="number";return isNum?`<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`}
function buildExcelBlob(type,d){
  if(typeof XLSX==='undefined') throw new Error('XLSX library unavailable');
  const c=CONFIG[type];
  const border={top:{style:'thin',color:{rgb:'A6A6A6'}},bottom:{style:'thin',color:{rgb:'A6A6A6'}},left:{style:'thin',color:{rgb:'A6A6A6'}},right:{style:'thin',color:{rgb:'A6A6A6'}}};
  const base={alignment:{horizontal:'center',vertical:'center',wrapText:true},border,font:{bold:true,color:{rgb:'111827'},sz:11}};
  const headerStyle={...base,fill:{fgColor:{rgb:'D9E2F3'}},font:{bold:true,color:{rgb:'1F2937'},sz:11}};
  const numberStyle={...base,fill:{fgColor:{rgb:'EEF2F7'}},font:{bold:true,color:{rgb:'374151'},sz:11}};
  const bodyStyle={...base,fill:{fgColor:{rgb:'FFFFFF'}},font:{bold:true,color:{rgb:'111827'},sz:11}};
  const topStyle={...base,fill:{fgColor:{rgb:'EAF2F8'}},font:{bold:true,color:{rgb:'1F2937'},sz:11}};
  const titleStyle={...base,fill:{fgColor:{rgb:'DDEBF7'}},font:{bold:true,color:{rgb:'1F4E78'},sz:11}};

  function makeSheet({includeTop=true,includeBoat2=false,includeDeparture=true,boat2Only=false}){
    const aoa=[];const merges=[];const headerRows=[];const bodyRows=[];const titleRows=[];
    const addRow=row=>aoa.push(row);
    if(includeTop){
      // RTL order: rightmost cell is the first logical field. The boat name stays in the middle.
      addRow([d.destination?`الوجهة ${d.destination}`:"","",d.boatName||"","",d.fuelQty?`كمية الوقود ${d.fuelQty} ${d.fuelUnit}`:"",""]);
      merges.push({s:{r:0,c:0},e:{r:0,c:1}},{s:{r:0,c:2},e:{r:0,c:3}},{s:{r:0,c:4},e:{r:0,c:5}});
      addRow(["","","","","",""]);
    }
    const addTable=(names)=>{
      const groups=distributeThree(collectNonEmpty(names));
      const h=Math.max(0,...groups.map(g=>g.length));
      const headerIndex=aoa.length;
      addRow(["ت","الاسم","ت","الاسم","ت","الاسم"]);headerRows.push(headerIndex);
      for(let i=0;i<h;i++){
        const rowIndex=aoa.length;
        addRow([
          groups[0][i]?sizesNumber(groups,0,i):"",groups[0][i]||"",
          groups[1][i]?sizesNumber(groups,1,i):"",groups[1][i]||"",
          groups[2][i]?sizesNumber(groups,2,i):"",groups[2][i]||""
        ]);
        bodyRows.push(rowIndex);
      }
    };
    addTable(d.crew);
    if(includeBoat2&&d.boat2&&collectNonEmpty(d.boat2).length){
      addRow(["","","","","",""]);
      const titleRow=aoa.length;
      addRow([d.boatName2||"","","","","",""]);titleRows.push(titleRow);
      merges.push({s:{r:titleRow,c:0},e:{r:titleRow,c:5}});
      addTable(d.boat2);
    }
    if(!boat2Only&&includeDeparture){
      const addDeparture=(title,names)=>{
        const a=collectNonEmpty(names);if(!a.length)return;
        addRow(["","","","","",""]);
        const titleRow=aoa.length;
        addRow([title,"","","","",""]);titleRows.push(titleRow);
        merges.push({s:{r:titleRow,c:0},e:{r:titleRow,c:5}});
        addTable(a);
      };
      if(type==='tug') c.departures.forEach(dep=>addDeparture(dep,d.departureData[dep]));
      else addDeparture(d.departureType||c.departures[0],d.departureNames);
    }
    if(!aoa.length)addRow(["","","","","",""]);
    const ws=XLSX.utils.aoa_to_sheet(aoa);
    ws['!sheetView']={rightToLeft:true,showGridLines:true};
    ws['!merges']=merges;
    ws['!cols']=[{wch:4},{wch:24},{wch:4},{wch:24},{wch:4},{wch:24}];
    // Requested Excel row height: 17 for every row.
    ws['!rows']=aoa.map(()=>({hpt:17,hpx:17}));
    // إعدادات الطباعة: جميع الأعمدة الستة في صفحة واحدة، وجميع الصفوف المستخدمة في ورقة واحدة.
    // عند وجود 160 كادر + 21 طاقم مثل ميناء العمية يكون النطاق عادةً A1:F70،
    // وإذا زاد عدد الصفوف عن ذلك يتم توسيع النطاق تلقائياً مع إبقاءه في صفحة واحدة.
    const printLastRow=Math.max(70,aoa.length);
    ws['!printArea']=`A1:F${printLastRow}`;
    ws['!pageSetup']={orientation:'landscape',paperSize:9,fitToWidth:1,fitToHeight:1};
    ws['!pageMargins']={left:0.25,right:0.25,top:0.35,bottom:0.35,header:0.15,footer:0.15};
    ws['!sheetPr']={pageSetUpPr:{fitToPage:true,autoPageBreaks:false}};
    const setStyle=(r,cidx,style)=>{const ref=XLSX.utils.encode_cell({r,c:cidx});if(ws[ref])ws[ref].s=style};
    if(includeTop){for(let cidx=0;cidx<6;cidx++)setStyle(0,cidx,topStyle)}
    headerRows.forEach(r=>{for(let cidx=0;cidx<6;cidx++)setStyle(r,cidx,headerStyle)});
    bodyRows.forEach(r=>{for(let cidx=0;cidx<6;cidx++)setStyle(r,cidx,cidx%2===0?numberStyle:bodyStyle)});
    titleRows.forEach(r=>{for(let cidx=0;cidx<6;cidx++)setStyle(r,cidx,titleStyle)});
    return ws;
  }

  const wb=XLSX.utils.book_new();
  wb.Workbook={Views:[{RTL:true}]};
  if(type==='basra'&&c.secondBoat&&(String(d.boatName2||'').trim()||collectNonEmpty(d.boat2).length)){
    // Basra with two boats: both boat crews on sheet 1, departure crew on sheet 2.
    XLSX.utils.book_append_sheet(wb,makeSheet({includeTop:true,includeBoat2:true,includeDeparture:false}),"أطقم الزورقين");
    XLSX.utils.book_append_sheet(wb,makeSheet({includeTop:false,includeBoat2:false,includeDeparture:true}),"كادر المغادرة");
  }else{
    // All other sections: keep all names, regardless of count, on one worksheet.
    XLSX.utils.book_append_sheet(wb,makeSheet({includeTop:true,includeBoat2:false,includeDeparture:true}),c.title.slice(0,31));
  }
  const out=XLSX.write(wb,{bookType:'xlsx',type:'array',cellStyles:true});
  return new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function localFileTimestamp(date=new Date()){
  const pad=n=>String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
function showExportComplete(message='تم إكمال التصدير بنجاح'){
  const modal=document.querySelector('#modal');if(!modal){toast(message);return}
  modal.classList.remove('hidden');
  modal.innerHTML=`<div class="modal-box" style="text-align:center"><div style="font-size:46px;margin-bottom:8px">✅</div><h3>${esc(message)}</h3><p class="help-text">تم إنشاء ملف Excel بنجاح.</p><div class="actions" style="justify-content:center"><button class="primary" id="exportCompleteOk">موافق</button></div></div>`;
  document.querySelector('#exportCompleteOk').onclick=()=>modal.classList.add('hidden');
}

function showExportProgress(percent,status){
  const modal=document.querySelector('#modal'); if(!modal)return;
  modal.classList.remove('hidden');
  modal.innerHTML=`<div class="modal-box" style="text-align:center;min-width:360px"><div style="font-size:38px;margin-bottom:8px">📤</div><h3>جاري التصدير</h3><p class="help-text" id="exportProgressLabel">${esc(status||'جاري تجهيز التصدير...')}</p><div style="height:18px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:16px 0 8px"><div id="exportProgressBar" style="height:100%;width:${Math.max(0,Math.min(100,percent))}%;background:#2563eb;transition:width .25s ease"></div></div><strong id="exportProgressValue">${Math.round(percent)}%</strong></div>`;
}
function updateExportProgress(percent,status){
  const bar=document.querySelector('#exportProgressBar'),val=document.querySelector('#exportProgressValue'),label=document.querySelector('#exportProgressLabel');
  if(bar)bar.style.width=Math.max(0,Math.min(100,percent))+'%'; if(val)val.textContent=Math.round(percent)+'%'; if(label)label.textContent=status||'';
}

function surveyNormalize(s){return normName(s)}
function arabicDigitsToLatin(s){return String(s||"").replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d))}
function dateFromFilename(name){
  const n=arabicDigitsToLatin(name);
  let m=n.match(/(20\d{2})[\-_\.](\d{1,2})[\-_\.](\d{1,2})/);if(m)return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  m=n.match(/(\d{1,2})[\-_\.](\d{1,2})[\-_\.](20\d{2})/);if(m)return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  m=n.match(/(20\d{2})(\d{2})(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
}
function cleanBoatName(s){return String(s||"").trim().replace(/^طاقم\s+/u,"").trim()}
function rowText(row){return (row||[]).map(v=>String(v??"").trim()).filter(Boolean)}
function allWorkbookTexts(rows){const out=[];for(const row of rows||[])for(const cell of row||[]){const v=String(cell??"").trim();if(v)out.push(v)}return out}
function detectBoatName(texts,fileName){
  const fn=String(fileName||"").replace(/\.[^.]+$/u,"").trim();
  const fnMatch=fn.match(/^(طاقم\s+[^_]+?)(?:__|$)/u);
  if(fnMatch)return cleanBoatName(fnMatch[1]);
  const candidates=[...texts];
  for(const text of candidates){
    const v=String(text).trim();
    const m=v.match(/^(طاقم\s+(?:زورق\s+)?[^|\n\r,،;؛]+)$/u);
    if(m)return cleanBoatName(m[1]);
    const inline=v.match(/(طاقم\s+(?:زورق\s+)?[^|\n\r,،;؛]+)/u);
    if(inline)return cleanBoatName(inline[1]);
  }
  return "";
}
function detectDeparture(texts){
  const preferred=[
    /مغادرة\s+كادر\s+ميناء\s+البصرة/u,
    /مغادرة\s+كادر\s+ميناء\s+العمية/u,
    /مغادرة\s+كادر\s+خدمات\s+والاعاشة(?:\s+البصرة|\s+العمية)?/u,
    /الوفد\s+المغادر/u,
    /مغادرة\s+الوفد/u
  ];
  for(const re of preferred)for(const text of texts){const m=String(text).match(re);if(m)return m[0].trim()}
  for(const text of texts){const v=String(text).trim();if(/^مغادرة\s+كادر\s+/u.test(v)||/^الوفد\s+المغادر$/u.test(v)||/^مغادرة\s+الوفد$/u.test(v))return v}
  return "";
}
function containsEmployee(text,employee){
  const a=surveyNormalize(text),b=surveyNormalize(employee);if(!a||!b)return false;
  return a===b || (b.length>=3 && a.includes(b));
}
function surveyDateKey(value){
  const v=String(value||"").trim();
  if(!v)return "";
  const n=arabicDigitsToLatin(v);
  const m=n.match(/(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if(m)return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  const d=n.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})/);
  if(d)return `${d[3]}-${String(d[2]).padStart(2,"0")}-${String(d[1]).padStart(2,"0")}`;
  return v.toLocaleLowerCase();
}
function dedupeSurveyResultsByDate(results){
  const seen=new Map(),out=[];
  for(const item of results||[]){
    const key=surveyDateKey(item.date);
    if(!key){out.push(item);continue}
    if(!seen.has(key)){seen.set(key,out.length);out.push(item);continue}
    const idx=seen.get(key),existing=out[idx];
    const score=x=>(x?Object.values({departure:x.departure,boat:x.boat,source:x.source}).filter(Boolean).length:0);
    if(score(item)>score(existing))out[idx]=item;
  }
  return out;
}

function findEmployeeTripsInWorkbook(buffer,fileName,employee){
  if(typeof XLSX==="undefined")throw new Error("XLSX unavailable");
  const wb=XLSX.read(buffer,{type:"array",cellDates:false,cellNF:false,cellText:true});
  const date=dateFromFilename(fileName),target=surveyNormalize(employee),results=[];
  let found=false;
  let boat="",departure="";
  for(const sheetName of wb.SheetNames){
    const sheet=wb.Sheets[sheetName],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});
    const texts=allWorkbookTexts(rows);
    if(!boat)boat=detectBoatName(texts,fileName);
    if(!departure)departure=detectDeparture(texts);
    for(const row of rows){for(const cell of row||[]){if(containsEmployee(cell,employee)){found=true;break}}if(found)break}
    if(found)break;
  }
  if(found)results.push({employee,departure,date,boat,source:fileName});
  return results;
}
async function getExcelFilesFromDirectory(dir){
  const out=[];for await(const entry of dir.values()){if(entry.kind==="file"&&/\.(xlsx|xls)$/i.test(entry.name))out.push(entry);else if(entry.kind==="directory"){const nested=await getExcelFilesFromDirectory(entry);out.push(...nested)}}return out;
}
async function searchSurveyInFolder(){
  const employee=document.querySelector("#surveyEmployee")?.value.trim()||"";if(!employee){toast("اكتب اسم الموظف أولاً");return}
  const source=document.querySelector('input[name="surveySource"]:checked')?.value||"computer";state.survey={employee,report:[],status:"جاري بدء البحث...",source,progress:0,searching:true};render();
  try{
    let report=[];
    if(source==="computer"){
      if(!window.showDirectoryPicker)throw new Error("directory-picker");
      const dir=await window.showDirectoryPicker({mode:"read"}),files=await getExcelFilesFromDirectory(dir),total=files.length||1;state.survey.status=`تم العثور على ${files.length} ملف Excel`;render();
      for(let i=0;i<files.length;i++){const e=files[i];try{const f=await e.getFile();report.push(...findEmployeeTripsInWorkbook(await f.arrayBuffer(),f.name,employee))}catch(err){console.warn(err)}state.survey.progress=Math.round((i+1)/total*100);state.survey.status=`جاري البحث في الملف ${i+1} من ${files.length}: ${e.name}`;render();await new Promise(r=>setTimeout(r,0))}
    }else{
      if(!(await googleEnsureAuth())){state.survey.searching=false;render();return}
      const rootFolder=await driveFindFolder(GOOGLE_ROOT_FOLDER,"root");
      if(!rootFolder)throw new Error("لم يتم العثور على فولدر داتا برنامج المدونة في Google Drive");
      const archiveFolder=await driveFindFolder(GOOGLE_FOLDERS.operational,rootFolder.id);
      if(!archiveFolder)throw new Error("لم يتم العثور على فولدر أرشيف المغادرات في Google Drive");
      const central=await driveFindFileByName("Search-for-an-employee.xlsx",archiveFolder.id);
      if(!central)throw new Error("لم يتم العثور على Search-for-an-employee.xlsx في Google Drive");
      state.survey.status="جاري قراءة ملف الموظفين المركزي...";state.survey.progress=20;render();
      const centralBuffer=await driveDownloadFile(central.id);
      report=searchCentralEmployee(employee,centralBuffer);
      state.survey.progress=90;state.survey.status="جاري تجهيز نتائج الاستعلام...";render();
    }
    report=dedupeSurveyResultsByDate(report);
    report=report.map((x,i)=>({...x,seq:i+1}));
    state.survey={employee,report,status:`اكتمل البحث. عدد الرحلات المطابقة بعد دمج التكرار حسب التاريخ فقط: ${report.length}`,source,progress:100,searching:false};render();if(!report.length)toast("لم يتم العثور على اسم الموظف");
  }catch(e){if(e?.name==="AbortError"){state.survey={employee,report:[],status:"تم إلغاء اختيار المجلد.",source,progress:0,searching:false};render();return}console.error(e);state.survey={employee,report:[],status:e?.message==="directory-picker"?"ميزة اختيار المجلد تحتاج Chrome أو Edge على HTTPS أو localhost":"تعذر تنفيذ البحث",source,progress:0,searching:false};render();toast("تعذر تنفيذ البحث")}
}
function buildSurveyExcelBlob(report,employee){
  const rows=[["التسلسل","اسم الموظف","كادر المغادرة","تاريخ الصعود","اسم الزورق"],...report.map(x=>[x.seq,x.employee,x.departure,x.date,x.boat])];
  const rowXml=rows.map((row,ri)=>{const r=ri+1;return `<row r="${r}" ht="28" customHeight="1">${row.map((v,ci)=>cellXml(`${colLetter(ci+1)}${r}`,v,ri===0?4:9)).join("")}</row>`}).join("");
  const cols=[10,32,34,18,30].map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join("");
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:E${rows.length}"/><sheetViews><sheetView workbookViewId="0" rightToLeft="1" showGridLines="1"/></sheetViews><sheetFormatPr defaultRowHeight="28"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/></worksheet>`;
  const title=`استبيان عن موظف - ${xmlEsc(employee)}`;const files=[
    {name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`},
    {name:"_rels/.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`},
    {name:"xl/workbook.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="استبيان الموظف" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:"xl/_rels/workbook.xml.rels",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:"xl/styles.xml",data:xlsxStyles()},{name:"xl/worksheets/sheet1.xml",data:sheet},{name:"docProps/core.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>برنامج المدونة</dc:creator></cp:coreProperties>`},{name:"docProps/app.xml",data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>برنامج المدونة</Application></Properties>`}
  ];return zipStore(files)
}
async function exportSurvey(){const r=state.survey?.report||[];if(!r.length){toast("لا توجد نتائج لتصديرها");return}const blob=buildSurveyExcelBlob(r,state.survey.employee);const fileName=`استبيان عن موظف - ${state.survey.employee} - ${localFileTimestamp()}.xlsx`;const ok=await downloadExportFile(blob,fileName);if(!ok)return;state.survey={employee:"",report:[],status:"تم تصدير التقرير وتم مسح نتائج الاستبيان.",source:state.survey.source};render();showExportComplete("تم إكمال تصدير تقرير الاستبيان")}

function validateBeforeExport(d){
  const missing=[];
  if(!String(d.destination||"").trim())missing.push("الوجهة");
  if(!String(d.boatName||"").trim())missing.push("اسم طاقم الزورق");
  if(!String(d.fuelQty||"").trim())missing.push("كمية الوقود");
  const fallbackDeparture=CONFIG[d.type]?.departures?.[0]||"";
  if(!String(d.departureType||"").trim()) d.departureType=fallbackDeparture;
  if(!String(d.departureType||"").trim())missing.push("نوع كادر المغادرة");
  if(missing.length){toast(`⚠️ يرجى إكمال: ${missing.join("، " )}`);return false}
  return true;
}
async function pickExportFolderForExport(){
  // استخدم المجلد المحفوظ أولاً حتى لا نفقد صلاحية الاختيار عند التصدير.
  const saved=await restoreExportFolder();
  if(saved){
    const ok=await verifyExportDirectory(saved);
    if(ok && (saved.name||"").trim().toLowerCase()==="isps archives") return saved;
    exportDirectoryHandle=null;
  }

  // بعض طرق تشغيل الـPWA (خصوصاً file://) لا تسمح بفتح Directory Picker.
  // في هذه الحالة لا نوقف التصدير؛ نستخدم تنزيل الملف كحل احتياطي.
  if(!window.showDirectoryPicker){
    toast("⚠️ متصفح التشغيل لا يدعم اختيار المجلد هنا؛ سيتم تنزيل ملف Excel تلقائياً.");
    return {__downloadFallback:true};
  }
  try{
    const handle=await window.showDirectoryPicker({mode:"readwrite",startIn:"downloads",id:"almodawana-export-every-time"});
    if((handle.name||"").trim().toLowerCase()!=="isps archives"){toast("⚠️ يجب اختيار الفولدر ISPS archives داخل القسم D");return null}
    const ok=await verifyExportDirectory(handle);
    if(!ok){toast("لم يتم منح صلاحية الكتابة إلى مجلد التصدير");return null}
    exportDirectoryHandle=handle;
    await saveSetting("exportDirectory",handle);
    return handle;
  }catch(e){
    if(e?.name==="AbortError") return null;
    console.error("Directory picker failed",e);
    toast("⚠️ تعذر فتح اختيار مجلد التصدير؛ سيتم تنزيل ملف Excel تلقائياً.");
    return {__downloadFallback:true};
  }
}
async function downloadExportFile(blob,fileName){
  try{
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=fileName;
    a.style.display="none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    return true;
  }catch(e){console.error("download export failed",e);toast("تعذر تنزيل ملف Excel إلى مجلد التنزيلات");return false}
}

async function writeExportFile(blob,fileName,forcePick=false){
  let handle=forcePick?await pickExportFolderForExport():await restoreExportFolder();

  // وضع التنزيل الاحتياطي عند تشغيل التطبيق بدون HTTPS/localhost.
  if(handle?.__downloadFallback){
    const a=document.createElement("a");
    const url=URL.createObjectURL(blob);
    a.href=url;a.download=fileName;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    return true;
  }

  if(handle){
    try{
      const ok=await verifyExportDirectory(handle);
      if(ok){
        const fh=await handle.getFileHandle(fileName,{create:true});
        const w=await fh.createWritable();
        await w.write(blob);
        await w.close();
        return true;
      }
    }catch(e){
      console.warn("direct folder export failed",e);
      exportDirectoryHandle=null;
      if(forcePick){
        const a=document.createElement("a");
        const url=URL.createObjectURL(blob);
        a.href=url;a.download=fileName;
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        toast("⚠️ تعذر الكتابة إلى مجلد التصدير؛ تم تنزيل ملف Excel تلقائياً.");
        return true;
      }
    }
  }
  if(forcePick)return false;
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);return true
}


function buildPrintSheetHTML(type,d,{includeTop=true,includeBoat2=false,includeDeparture=true}={}){
  const c=CONFIG[type];
  const groupsHTML=(names,role='crew')=>{
    const groups=distributeThree(collectNonEmpty(names));
    const h=Math.max(0,...groups.map(g=>g.length));
    let html=`<table class="print-table ${role}-table"><thead><tr><th>ت</th><th>الاسم</th><th>ت</th><th>الاسم</th><th>ت</th><th>الاسم</th></tr></thead><tbody>`;
    for(let i=0;i<h;i++) html+=`<tr><td class="num">${groups[0][i]?sizesNumber(groups,0,i):''}</td><td>${esc(groups[0][i]||'')}</td><td class="num">${groups[1][i]?sizesNumber(groups,1,i):''}</td><td>${esc(groups[1][i]||'')}</td><td class="num">${groups[2][i]?sizesNumber(groups,2,i):''}</td><td>${esc(groups[2][i]||'')}</td></tr>`;
    return html+'</tbody></table>';
  };
  let html='<section class="print-sheet">';
  if(includeTop){
    html+=`<div class="print-top"><div class="print-destination">الوجهة ${esc(d.destination||'')}</div><div class="print-fuel">كمية الوقود ${esc(d.fuelQty||'')} ${esc(d.fuelUnit||'')}</div><div class="print-boat-name">${esc(d.boatName||'')}</div></div>`;
  }
  html+=groupsHTML(d.crew,'crew');
  if(includeBoat2&&d.boat2&&collectNonEmpty(d.boat2).length){
    html+=`<div class="print-section-title">${esc(d.boatName2||'')}</div>`+groupsHTML(d.boat2,'boat2');
  }
  if(includeDeparture){
    const addDeparture=(title,names)=>{if(!collectNonEmpty(names).length)return '';return `<div class="print-section-title departure-title">${esc(title)}</div>`+groupsHTML(names,'departure')};
    if(type==='tug') c.departures.forEach(dep=>{html+=addDeparture(dep,d.departureData[dep])});
    else html+=addDeparture(d.departureType||c.departures[0],d.departureData[d.departureType||c.departures[0]]);
  }
  return html+'</section>';
}
async function buildPrintSheetHTMLAsync(type,d,{includeTop=true,includeBoat2=false,includeDeparture=true,onProgress=null}={}){
  const c=CONFIG[type];
  let total=collectNonEmpty(d.crew).length;
  if(includeBoat2&&d.boat2) total+=collectNonEmpty(d.boat2).length;
  if(includeDeparture){if(type==='tug') Object.values(d.departureData||{}).forEach(a=>{total+=collectNonEmpty(a).length}); else total+=collectNonEmpty(d.departureNames).length;}
  total=Math.max(1,total); let done=0;
  const update=()=>onProgress?.(Math.min(95,70+Math.round(done/total*25)),`جاري تجهيز صفوف الطباعة ${done} من ${total}...`);
  const groupsHTML=async(names,role='crew')=>{
    const groups=distributeThree(collectNonEmpty(names));
    const h=Math.max(0,...groups.map(g=>g.length));
    let html=`<table class="print-table ${role}-table"><thead><tr><th>ت</th><th>الاسم</th><th>ت</th><th>الاسم</th><th>ت</th><th>الاسم</th></tr></thead><tbody>`;
    for(let i=0;i<h;i++){
      html+=`<tr><td class="num">${groups[0][i]?sizesNumber(groups,0,i):''}</td><td>${esc(groups[0][i]||'')}</td><td class="num">${groups[1][i]?sizesNumber(groups,1,i):''}</td><td>${esc(groups[1][i]||'')}</td><td class="num">${groups[2][i]?sizesNumber(groups,2,i):''}</td><td>${esc(groups[2][i]||'')}</td></tr>`;
      done += [groups[0][i],groups[1][i],groups[2][i]].filter(Boolean).length; update();
      if(i%5===4) await new Promise(r=>setTimeout(r,0));
    }
    return html+'</tbody></table>';
  };
  let html='<section class="print-sheet">';
  if(includeTop) html+=`<div class="print-top"><div class="print-destination">الوجهة ${esc(d.destination||'')}</div><div class="print-fuel">كمية الوقود ${esc(d.fuelQty||'')} ${esc(d.fuelUnit||'')}</div><div class="print-boat-name">${esc(d.boatName||'')}</div></div>`;
  html+=await groupsHTML(d.crew,'crew');
  if(includeBoat2&&d.boat2&&collectNonEmpty(d.boat2).length){
    html+=`<div class="print-section-title">${esc(d.boatName2||'')}</div>`+await groupsHTML(d.boat2,'boat2');
  }
  if(includeDeparture){
    const addDeparture=async(title,names)=>{if(!collectNonEmpty(names).length)return '';return `<div class="print-section-title departure-title">${esc(title)}</div>`+await groupsHTML(names,'departure')};
    if(type==='tug') for(const dep of c.departures) html+=await addDeparture(dep,d.departureData[dep]);
    else html+=await addDeparture(d.departureType||c.departures[0],d.departureNames);
  }
  onProgress?.(96,'اكتمل تجهيز محتوى الطباعة');
  return html+'</section>';
}

function setPrintPreparation(win,percent,status,done=false){
  try{
    const doc=win?.document;if(!doc)return;
    const bar=doc.getElementById('printPrepBar'),val=doc.getElementById('printPrepValue'),label=doc.getElementById('printPrepLabel'),wrap=doc.getElementById('printPrepWrap');
    if(bar)bar.style.width=Math.max(0,Math.min(100,percent))+'%';
    if(val)val.textContent=Math.round(percent)+'%';
    if(label)label.textContent=status||'';
    if(done&&wrap)wrap.style.display='none';
  }catch(e){console.warn('print progress update failed',e)}
}

function initPrintPreparationPage(win){
  if(!win)return;
  win.document.open();
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تجهيز صفحة الطباعة</title><style>body{font-family:Arial,Tahoma,sans-serif;background:#f1f5f9;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;color:#0f172a}.box{width:min(620px,88vw);background:#fff;border-radius:18px;padding:32px;box-shadow:0 8px 30px rgba(0,0,0,.12);text-align:center}.title{font-size:24px;font-weight:800;margin-bottom:20px}.status{font-size:16px;font-weight:700;margin:12px 0;color:#334155}.track{height:18px;background:#e2e8f0;border-radius:999px;overflow:hidden}.bar{height:100%;width:0;background:#2563eb;transition:width .15s ease}.percent{font-size:18px;font-weight:900;margin-top:10px;color:#1d4ed8}</style></head><body><div class="box" id="printPrepWrap"><div class="title">🖨️ جاري تجهيز صفحة الطباعة...</div><div class="status" id="printPrepLabel">جاري البدء...</div><div class="track"><div class="bar" id="printPrepBar"></div></div><div class="percent" id="printPrepValue">0%</div></div></body></html>`);
  win.document.close();
}

function openPrintPage(type,d,existingWin=null){
  const win=existingWin||window.open('','_blank');
  if(!win){toast('⚠️ لم يسمح المتصفح بفتح صفحة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.');return null}
  const c=CONFIG[type];
  const sheets=arguments.length>=4&&arguments[3] ? arguments[3] : buildPrintSheetHTML(type,d,{includeTop:true,includeBoat2:type==='basra'&&c.secondBoat,includeDeparture:true});
  win.document.open();
  win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>طباعة - برنامج المدونة - ${esc(c.title)}</title><style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#e5e7eb;color:#111827;font-family:Calibri,Arial,"Tahoma",sans-serif}
  body{direction:rtl;font-family:Calibri,Arial,"Tahoma",sans-serif}
  .print-toolbar{position:sticky;top:0;z-index:20;background:#fff;border-bottom:1px solid #cbd5e1;padding:12px 16px;display:flex;gap:10px;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .print-toolbar button{border:0;border-radius:10px;padding:10px 20px;font-weight:800;font-size:15px;cursor:pointer}
  .print-btn{background:#2563eb;color:#fff}.close-btn{background:#e5e7eb;color:#111827}
  .print-hint{text-align:center;font-weight:700;color:#475569;font-size:13px;margin:10px}

  /* A4 حقيقية: 297mm ارتفاع. يتم حجز 40mm من أسفل الورقة نفسها، وليس بعد منطقة المحتوى. */
  .print-sheet{
    --row-h:5mm;--name-font:10pt;--serial-font:9pt;--head-font:10pt;
    --top-h:5mm;--top-gap:3mm;--title-h:6mm;--head-h:5mm;--row-line:3.5mm;
    width:195mm;height:297mm;min-height:297mm;max-height:297mm;
    margin:12px auto;background:#fff;padding:7.5mm 0 40mm;
    overflow:hidden;transform-origin:top center;break-inside:avoid;page-break-inside:avoid;
  }
  .print-top{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:var(--top-h) var(--top-h);direction:rtl;margin:0 auto var(--top-gap);border:1px solid #808080;font-weight:800;text-align:center;width:183mm;max-width:183mm}
  .print-top>div{font-family:Calibri,Arial,"Tahoma",sans-serif;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;align-items:center;justify-content:center;padding:1mm;border-left:1px solid #808080;font-size:11pt;line-height:1.1;overflow:hidden;white-space:nowrap}
  .print-top .print-destination{grid-column:1;grid-row:1;border-left:1px solid #808080;justify-content:flex-start;text-align:left;direction:rtl}
  .print-top .print-fuel{grid-column:2;grid-row:1;border-left:0;justify-content:flex-end;text-align:right;direction:rtl}
  .print-top .print-boat-name{grid-column:1 / span 2;grid-row:2;background:#d9e2f3;border-top:1px solid #808080;border-left:0;height:var(--top-h)}
  .print-table{width:183mm;max-width:183mm;margin:0 auto;border-collapse:collapse;table-layout:fixed;direction:rtl;font-weight:700;font-family:Calibri,Arial,"Tahoma",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid;page-break-inside:avoid}
  .print-table th,.print-table td{font-family:Calibri,Arial,"Tahoma",sans-serif;font-weight:700;border:1px solid #a6a6a6;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0;text-align:center;vertical-align:middle;white-space:nowrap;overflow:hidden;box-sizing:border-box}
  .print-table th{height:var(--head-h);min-height:var(--head-h);max-height:var(--head-h);background:#d9e2f3 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color:#1f2937;font-size:var(--head-font);line-height:var(--head-h)}
  .print-table tbody tr{height:var(--row-h);break-inside:avoid;page-break-inside:avoid}
  .print-table td{height:var(--row-h);min-height:var(--row-h);max-height:var(--row-h);font-size:var(--name-font);line-height:var(--row-line)}
  .print-table td.num,.print-table td:nth-child(1),.print-table td:nth-child(3),.print-table td:nth-child(5){background:#eef2f7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:var(--serial-font);line-height:var(--row-line);font-weight:800}
  .print-table th:nth-child(1),.print-table th:nth-child(3),.print-table th:nth-child(5){background:#cbd5e1 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-table th:nth-child(1),.print-table th:nth-child(3),.print-table th:nth-child(5),.print-table td:nth-child(1),.print-table td:nth-child(3),.print-table td:nth-child(5){width:6mm;min-width:6mm;max-width:6mm}
  .print-table th:nth-child(2),.print-table th:nth-child(4),.print-table th:nth-child(6),.print-table td:nth-child(2),.print-table td:nth-child(4),.print-table td:nth-child(6){width:55mm;min-width:55mm;max-width:55mm}
  .print-section-title{background:#ddebf7 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color:#1f4e78;border:1px solid #808080;font-weight:700;font-family:Calibri,Arial,"Tahoma",sans-serif;text-align:center;padding:0;margin:0 auto;font-size:var(--head-font);height:var(--title-h);min-height:var(--title-h);max-height:var(--title-h);line-height:var(--title-h);width:183mm;overflow:hidden;white-space:nowrap;break-inside:avoid;page-break-inside:avoid}
  .print-section-title.departure-title{--title-h:6mm;background:#fff !important;color:#111827 !important}
  @media print{
    @page{size:A4 portrait;margin:0}
    html,body{background:#fff;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .print-toolbar,.print-hint{display:none}
    .print-sheet{margin:0;width:195mm;height:297mm;min-height:297mm;max-height:297mm;padding:7.5mm 0 40mm;overflow:hidden;page-break-after:auto;break-after:auto}.print-top{width:183mm;max-width:183mm}
  }
  </style></head><body><div class="print-toolbar"><button class="print-btn" onclick="window.print()">🖨️ طباعة الصفحة</button><button class="close-btn" onclick="window.close()">✕ إغلاق</button></div><div class="print-hint">صفحة واحدة — جميع الأسماء تظهر، مع حجز 4 سم فعلية من أسفل ورقة A4، وأول 6 صفوف بارتفاع 4 مم، وبقية الصفوف تتكيف تلقائيًا بحد أقصى 5 مم.</div>${sheets}<div id="printExportOverlay" style="position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:99999;display:flex;align-items:center;justify-content:center"><div id="printProgressBox" style="width:min(560px,90vw);background:#fff;border-radius:18px;padding:28px;box-shadow:0 18px 60px rgba(0,0,0,.28);text-align:center;font-family:Calibri,Arial,Tahoma,sans-serif;direction:rtl"><div style="font-size:40px">📤</div><h2 style="margin:8px 0 12px">جاري التصدير</h2><div id="printProgressLabel" style="font-weight:700;margin-bottom:12px">جاري تجهيز البيانات...</div><div style="height:20px;background:#e5e7eb;border-radius:999px;overflow:hidden"><div id="printProgressBar" style="height:100%;width:0%;background:#2563eb;transition:width .25s ease"></div></div><div id="printProgressValue" style="font-weight:900;font-size:20px;margin-top:10px">0%</div></div></div><script>
  function updatePrintExportOverlay(percent,status,done){var b=document.getElementById("printProgressBar"),v=document.getElementById("printProgressValue"),l=document.getElementById("printProgressLabel"),o=document.getElementById("printExportOverlay");if(b)b.style.width=Math.max(0,Math.min(100,percent))+"%";if(v)v.textContent=Math.round(percent)+"%";if(l)l.textContent=status||"";if(done){var box=document.getElementById("printProgressBox");if(box)box.innerHTML="<div style=\\"font-size:46px;margin-bottom:8px\\">✅</div><h2 style=\\"margin:8px 0\\">تم إكمال التصدير</h2><p style=\\"font-weight:700;color:#475569\\">تم إنشاء ملف Excel بنجاح.</p><button id=\\"printExportOk\\" style=\\"border:0;border-radius:10px;padding:11px 28px;background:#2563eb;color:#fff;font-weight:800;font-size:16px;cursor:pointer\\">موافق</button>";var ok=document.getElementById("printExportOk");if(ok)ok.onclick=function(){if(o)o.style.display="none";};}}

  function fitPrintSheet(){
    document.querySelectorAll('.print-sheet').forEach(function(sheet){
      var PAGE_H=297, BOTTOM=40, TOP=7.5, FIRST_COUNT=6, FIRST_H=4, MAX_H=5;
      var mmPerPx=25.4/96;
      var mm=function(px){return px*mmPerPx};
      var rows=[].slice.call(sheet.querySelectorAll('.print-table tbody tr'));
      var top=sheet.querySelector('.print-top');
      var titles=[].slice.call(sheet.querySelectorAll('.print-section-title'));
      var heads=[].slice.call(sheet.querySelectorAll('.print-table thead tr'));

      /* أولاً نضع الصفوف على ارتفاعاتها المطلوبة، ثم نقيس الواقع الفعلي. */
      rows.forEach(function(tr,i){
        var h=i<FIRST_COUNT?FIRST_H:MAX_H;
        tr.style.height=h+'mm';
        [].forEach.call(tr.cells,function(td){td.style.height=h+'mm';td.style.minHeight=h+'mm';td.style.maxHeight=h+'mm';});
      });

      function h(el){return el?mm(el.getBoundingClientRect().height):0;}
      var fixed=0;
      if(top)fixed+=h(top);
      titles.forEach(function(el){fixed+=h(el);});
      heads.forEach(function(el){fixed+=h(el);});

      /* المساحة الداخلية الفعلية بين أعلى المحتوى وأسفل منطقة الـ4cm. */
      var usable=PAGE_H-TOP-BOTTOM;
      var firstCount=Math.min(FIRST_COUNT,rows.length);
      var firstTotal=firstCount*FIRST_H;
      var rest=Math.max(0,rows.length-firstCount);
      var available=Math.max(0,usable-fixed-firstTotal);
      var dyn=rest?Math.min(MAX_H,available/rest):FIRST_H;

      /* لا نسمح للـline-height أو الخط بأن يصنع حدًا أكبر من الصف المحسوب. */
      dyn=Math.max(0.8,dyn);
      var font=Math.max(5.4,Math.min(10,6.0+dyn*0.9));
      var serial=Math.max(6.5,Math.min(9,7.0+dyn*0.4));
      var line=Math.max(1.15,Math.min(4.2,dyn*0.72));
      sheet.style.setProperty('--name-font',font.toFixed(2)+'pt');
      sheet.style.setProperty('--serial-font',serial.toFixed(2)+'pt');
      sheet.style.setProperty('--row-line',line.toFixed(3)+'mm');
      sheet.style.setProperty('--head-font','10.5pt');
      sheet.style.setProperty('--head-h','5mm');
      sheet.style.setProperty('--title-h','6mm');
      sheet.style.setProperty('--top-h','5mm');
      sheet.style.setProperty('--top-gap','3mm');

      rows.forEach(function(tr,i){
        var rh=i<FIRST_COUNT?FIRST_H:dyn;
        tr.style.display='table-row';tr.style.height=rh.toFixed(3)+'mm';
        [].forEach.call(tr.cells,function(td){td.style.height=rh.toFixed(3)+'mm';td.style.minHeight=rh.toFixed(3)+'mm';td.style.maxHeight=rh.toFixed(3)+'mm';});
      });

      /* فحص فعلي بعد التطبيق. نعيد القياس عدة مرات لأن table layout قد يتغير بعد تغيير الخط. */
      for(var pass=0;pass<3;pass++){
        var fixedNow=0;if(top)fixedNow+=h(top);titles.forEach(function(el){fixedNow+=h(el);});heads.forEach(function(el){fixedNow+=h(el);});
        var bodyNow=rows.reduce(function(sum,tr){return sum+h(tr);},0);
        var allowedBody=Math.max(0,usable-fixedNow);
        if(bodyNow<=allowedBody+0.02)break;
        var firstNow=Math.min(FIRST_COUNT,rows.length)*FIRST_H;
        var remainingNow=Math.max(0,rows.length-FIRST_COUNT);
        if(!remainingNow)break;
        dyn=Math.max(0.8,Math.min(dyn,(allowedBody-firstNow)/remainingNow));
        font=Math.max(5.1,Math.min(9.5,6.0+dyn*0.9));
        serial=Math.max(6.2,Math.min(8.8,7.0+dyn*0.4));
        line=Math.max(1.05,Math.min(4.0,dyn*0.68));
        sheet.style.setProperty('--name-font',font.toFixed(2)+'pt');sheet.style.setProperty('--serial-font',serial.toFixed(2)+'pt');sheet.style.setProperty('--row-line',line.toFixed(3)+'mm');
        rows.forEach(function(tr,i){var rh=i<FIRST_COUNT?FIRST_H:dyn;tr.style.height=rh.toFixed(3)+'mm';[].forEach.call(tr.cells,function(td){td.style.height=rh.toFixed(3)+'mm';td.style.minHeight=rh.toFixed(3)+'mm';td.style.maxHeight=rh.toFixed(3)+'mm';});});
      }

      /* مهم: لا نسمح أبدًا للجدول أن يصنع صفحة ثانية. إذا بقي فرق طفيف من
         حدود الجدول، نستخدم ضغطًا طفيفًا جدًا للصفوف الديناميكية فقط. */
      rows.forEach(function(tr,i){
        tr.style.breakInside='avoid';tr.style.pageBreakInside='avoid';
      });
    });
  }
  window.addEventListener('load',function(){setTimeout(fitPrintSheet,50);setTimeout(fitPrintSheet,250);});
  window.addEventListener('beforeprint',function(){fitPrintSheet();});
  </script></body></html>`);
  win.document.close();
  return win;
}

async function exportExcel(){
  const type=state.draft.type,d=JSON.parse(JSON.stringify(state.draft)),c=CONFIG[type];
  if(!validateBeforeExport(d))return;
  refreshDuplicateVisuals(false);
  const dup=allCurrentOperationNames();
  const counts=new Map();dup.forEach(n=>counts.set(normName(n),(counts.get(normName(n))||0)+1));
  if([...counts.values()].some(n=>n>1)){toast("⚠️ لا يمكن التصدير: توجد أسماء مكررة في العملية");refreshDuplicateVisuals(true);return;}
  const hasData=collectNonEmpty(d.crew).length||(d.boat2&&collectNonEmpty(d.boat2).length)||Object.values(d.departureData||{}).some(a=>collectNonEmpty(a).length);
  if(!hasData){toast("لا توجد بيانات لتصديرها");return;}
  const printWin=window.open('','_blank');
  if(!printWin){toast('⚠️ لم يسمح المتصفح بفتح صفحة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد التصدير.');return;}
  try{
    showExportProgress(5,'جاري تجهيز بيانات التصدير...');
    await new Promise(r=>setTimeout(r,30));
    printWin.document.title=`طباعة - برنامج المدونة - ${c.title}`;
    updateExportProgress(20,'جاري إنشاء ملف Excel...');
    let blob; try{blob=buildExcelBlob(type,d)}catch(e){console.error(e);try{printWin.close()}catch{};document.querySelector('#modal')?.classList.add('hidden');toast("تعذر إنشاء ملف Excel. تأكد من تحميل مكتبة Excel ثم أعد المحاولة.");return;}
    updateExportProgress(45,'جاري حفظ ملف Excel...');
    const fileName=`برنامج المدونة - ${c.title} - ${localFileTimestamp()}.xlsx`;
    const direct=await writeExportFile(blob,fileName,true);
    if(!direct){try{printWin.close()}catch{};document.querySelector('#modal')?.classList.add('hidden');return;}
    updateExportProgress(70,'جاري تجهيز صفحة الطباعة...');
    saveDraft();
    const sheets=await buildPrintSheetHTMLAsync(type,d,{includeTop:true,includeBoat2:type==='basra'&&c.secondBoat,includeDeparture:true});
    updateExportProgress(90,'جاري فتح صفحة الطباعة...');
    openPrintPage(type,d,printWin,sheets);
    document.querySelector('#modal')?.classList.add('hidden');
    // تحديث نافذة التقدم مباشرة من DOM صفحة الطباعة نفسها؛ لا نعتمد على دالة داخل نافذة جديدة.
    const updatePrintOverlayDirect=(percent,status,done=false)=>{
      try{
        if(!printWin || printWin.closed) return false;
        const doc=printWin.document;
        const bar=doc.getElementById('printProgressBar');
        const val=doc.getElementById('printProgressValue');
        const label=doc.getElementById('printProgressLabel');
        const overlay=doc.getElementById('printExportOverlay');
        const p=Math.max(0,Math.min(100,Number(percent)||0));
        if(bar) bar.style.width=p+'%';
        if(val) val.textContent=Math.round(p)+'%';
        if(label) label.textContent=status||'';
        if(done){
          const box=doc.getElementById('printProgressBox');
          if(box){
            box.innerHTML='<div style=\"font-size:46px;margin-bottom:8px\">✅</div><h2 style=\"margin:8px 0\">تم إكمال التصدير</h2><p style=\"font-weight:700;color:#475569\">تم إنشاء ملف Excel بنجاح.</p><button id=\"printExportOk\" style=\"border:0;border-radius:10px;padding:11px 28px;background:#2563eb;color:#fff;font-weight:800;font-size:16px;cursor:pointer\">موافق</button>';
            const ok=doc.getElementById('printExportOk');
            if(ok) ok.onclick=()=>{ if(overlay) overlay.style.display='none'; };
          }
        }
        return true;
      }catch(e){console.warn('print overlay update failed',e);return false}
    };
    // نعطي صفحة الطباعة دورة رسم واحدة قبل تحديث الشريط حتى لا يبقى عند 0%.
    await new Promise(r=>setTimeout(r,120));
    updatePrintOverlayDirect(90,'جاري تجهيز صفحة الطباعة...',false);
    await new Promise(r=>setTimeout(r,450));
    updatePrintOverlayDirect(100,`تم إكمال تصدير ${c.title}`,true);
    updateExportProgress(100,'اكتمل التصدير بنجاح');
  }catch(e){
    console.error(e); try{printWin.close()}catch{}; document.querySelector('#modal')?.classList.add('hidden'); toast(`تعذر إكمال التصدير: ${e.message||'خطأ غير معروف'}`);
  }
}
function resetOperation(){if(confirm("هل تريد تصفير بيانات العملية الحالية؟")){state.draft=defaultDraft(state.page);saveDraft();render();toast("تم التصفير.")}}

async function exportAllNames(){try{setNamesProgress(5,"جاري تجهيز الأسماء...",true);const rows=[["الاسم","تاريخ الإضافة"],...state.names.map(n=>[n.name,new Date(n.createdAt||Date.now()).toLocaleDateString("ar-IQ")])];if(typeof XLSX==="undefined"){setNamesProgress(0,"",false);toast("مكتبة Excel غير متاحة");return}setNamesProgress(35,"جاري إنشاء ملف Excel...",true);const ws=XLSX.utils.aoa_to_sheet(rows);ws["!cols"]=[{wch:40},{wch:18}];ws["!sheetView"]={rightToLeft:true};const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"الأسماء");const out=XLSX.write(wb,{bookType:"xlsx",type:"array",cellStyles:true}),blob=new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),fileName=`جميع الأسماء - ${localFileTimestamp()}.xlsx`;setNamesProgress(60,"جاري حفظ نسخة Excel...",true);const ok=await downloadExportFile(blob,fileName);if(!ok){setNamesProgress(0,"",false);return}setNamesProgress(78,"جاري إكمال التصدير محلياً...",true);setNamesProgress(100,"اكتمل التصدير",true);showExportComplete("تم إكمال تصدير جميع الأسماء");setTimeout(()=>setNamesProgress(0,"",false),1500)}catch(e){console.error(e);setNamesProgress(0,"",false);toast("تعذر تصدير الأسماء")}}
function parseImportedNames(data,fileName){
  const lower=fileName.toLowerCase();
  if(lower.endsWith(".json")){const parsed=JSON.parse(data);const arr=Array.isArray(parsed)?parsed:(parsed.names||[]);return arr.map(x=>typeof x==="string"?x:x?.name).filter(Boolean)}
  if(lower.endsWith(".csv")){const text=typeof data==="string"?data:new TextDecoder("utf-8").decode(data);return text.replace(/^\ufeff/,"").split(/\r?\n/).map(line=>line.split(",")[0].replace(/^"|"$/g,"").replace(/""/g,'"').trim()).filter((x,i)=>x&&!(i===0&&/^الاسم$/i.test(x)))}
  if(typeof XLSX==="undefined")throw new Error("XLSX unavailable");
  const wb=XLSX.read(data,{type:"array"});const sheet=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:""});return rows.map(row=>String(row?.[0]??"").trim()).filter((x,i)=>x&&!(i===0&&/^الاسم$/i.test(x)));
}
async function importNamesFromFile(file){try{setNamesProgress(5,"جاري قراءة ملف الأسماء...",true);const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);if(/\.json$/i.test(file.name))r.readAsText(file,"utf-8");else r.readAsArrayBuffer(file)});const imported=parseImportedNames(data,file.name),existing=new Set(state.names.map(n=>normName(n.name)));let added=0,duplicates=0;if(!imported.length){setNamesProgress(0,"",false);toast("لم توجد أسماء صالحة في الملف");return}for(let i=0;i<imported.length;i++){const name=String(imported[i]||"").trim().replace(/\s+/g," ");if(!name||normName(name)==="الاسم")continue;const key=normName(name);if(existing.has(key)){duplicates++;continue}if(await addName(name)){existing.add(key);added++}if(i%2===0||i===imported.length-1){setNamesProgress(10+Math.round((i+1)/imported.length*85),`جاري استيراد ${i+1} من ${imported.length}...`,true);await new Promise(r=>setTimeout(r,0))}}refreshNamesTable(document.querySelector("#nameSearch")?.value||"");setNamesProgress(100,`اكتمل الاستيراد — ${added} جديد`,true);toast(`تم الاستيراد: ${added} جديد، ${duplicates} مكرر`);setTimeout(()=>setNamesProgress(0,"",false),1500)}catch(e){console.error(e);setNamesProgress(0,"",false);toast("تعذر قراءة ملف الأسماء. تأكد من أن الملف Excel أو CSV أو JSON.")}}

function dropdownTypeTitle(type){return type==="destinations"?"بيانات الوجهة":type==="boatCrews"?"بيانات اسم طاقم الزورق":"بيانات جهة المغادرة"}
function openDropdownManager(type){
  const modal=document.querySelector("#modal"); if(!modal)return;
  const items=[...dropdownList(type)];
  const renderRows=()=>items.map((v,i)=>`<div class="dropdown-manager-row"><input class="dropdown-manager-input" data-i="${i}" value="${esc(v)}"><button class="secondary dropdown-edit-row" data-i="${i}">✏️ تعديل</button><button class="danger dropdown-delete-row" data-i="${i}">🗑️ حذف</button></div>`).join("");
  const renderModal=()=>{modal.innerHTML=`<div class="modal-box dropdown-manager-modal"><div class="modal-head"><h3>${dropdownTypeTitle(type)}</h3><button class="secondary" id="closeDropdownManager">✕</button></div><p class="help-text">يمكنك إضافة عنصر جديد أو تعديل وحذف العناصر الحالية.</p><div class="actions"><button class="primary" id="addDropdownItem">➕ إضافة</button></div><div id="dropdownManagerRows" class="dropdown-manager-rows">${renderRows()||'<div class="empty">لا توجد بيانات.</div>'}</div><div class="actions"><button class="primary" id="saveDropdownManager">💾 حفظ</button><button class="secondary" id="cancelDropdownManager">إلغاء</button></div></div>`;
    modal.querySelector("#closeDropdownManager").onclick=()=>modal.classList.add("hidden");
    modal.querySelector("#cancelDropdownManager").onclick=()=>modal.classList.add("hidden");
    modal.querySelector("#addDropdownItem").onclick=()=>{items.push("");renderModal();const inputs=modal.querySelectorAll(".dropdown-manager-input");inputs[inputs.length-1]?.focus()};
    modal.querySelectorAll(".dropdown-delete-row").forEach(b=>b.onclick=()=>{items.splice(Number(b.dataset.i),1);renderModal()});
    modal.querySelectorAll(".dropdown-edit-row").forEach(b=>b.onclick=()=>modal.querySelector(`.dropdown-manager-input[data-i="${b.dataset.i}"]`)?.focus());
    modal.querySelector("#saveDropdownManager").onclick=async()=>{
      const vals=[...modal.querySelectorAll(".dropdown-manager-input")].map(x=>x.value.trim()).filter(Boolean);
      const unique=[];for(const x of vals)if(!unique.some(y=>normName(y)===normName(x)))unique.push(x);
      if(!unique.length){toast("يجب الاحتفاظ بعنصر واحد على الأقل");return}
      DROPDOWN_DATA[type]=unique;await saveDropdownData();modal.classList.add("hidden");render();toast("تم حفظ بيانات القائمة");
    };
  };
  modal.classList.remove("hidden");renderModal();
}
function protectDropdownManager(type){const pass=prompt("أدخل كلمة المرور لإدارة هذه القائمة:");if(pass===null)return;if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return}openDropdownManager(type)}
function bindPage(){
  document.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>navigate(x.dataset.go));
  document.querySelector("#googleConnectBtn")?.addEventListener("click",googleConnect);
  document.querySelector("#googleDisconnectBtn")?.addEventListener("click",()=>googleDisconnect(true));
  document.querySelector("#saveGoogleClientId")?.addEventListener("click",()=>{const v=document.querySelector("#googleClientId")?.value.trim();if(!v){toast("أدخل Client ID");return}localStorage.setItem(GOOGLE_CLIENT_ID_KEY,v);toast("تم حفظ Client ID");render()});
  const bindDropdown=(id,key)=>{
    const el=document.querySelector(`#${id}`);
    if(!el)return;
    el.onchange=()=>{
      state.draft[key]=el.value;
      saveDraft();
    };
  };
  bindDropdown("destination","destination");
  bindDropdown("boatName","boatName");
  bindDropdown("boatName2","boatName2");
  bindDropdown("departureType","departureType");
  const fuelQty=document.querySelector("#fuelQty");
  if(fuelQty)fuelQty.oninput=()=>{state.draft.fuelQty=fuelQty.value;saveDraft()};
  const fuelUnit=document.querySelector("#fuelUnit");
  if(fuelUnit)fuelUnit.onchange=()=>{state.draft.fuelUnit=fuelUnit.value;saveDraft()};
  bindAutocomplete();refreshDuplicateVisuals(false);document.querySelectorAll(".save-name").forEach(b=>b.onclick=()=>saveCurrentName(b.dataset.saveKind,+b.dataset.index));
  document.querySelectorAll(".operation-export-btn").forEach(b=>b.onclick=exportExcel);
  const folder=document.querySelector("#chooseExportFolderBtn");
  if(folder)folder.onclick=async()=>{
    const pass=prompt("أدخل كلمة المرور لتحديد مجلد التصدير:");
    if(pass===null)return;
    if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return}
    await chooseExportFolder();
  };
  if(state.page==="companies"){
    document.querySelector("#companyAddBtn")?.addEventListener("click",()=>{state.companies.showAdd=!state.companies.showAdd;render()});
    document.querySelector("#companyCancelAddBtn")?.addEventListener("click",()=>{state.companies.showAdd=false;render()});
    document.querySelector("#companySelect")?.addEventListener("change",e=>{state.companies.selected=e.target.value;state.companies.selectedPeople=[];render()});
    const companySearch=document.querySelector("#companyPersonSearch");
    if(companySearch){
      companySearch.addEventListener("input",e=>{state.companies.search=e.target.value;updateCompanySearchResults();});
      companySearch.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();updateCompanySearchResults();}});
    }
    document.querySelectorAll(".company-counter-card").forEach(b=>b.onclick=()=>{state.companies.selected=b.dataset.company;state.companies.selectedPeople=[];render()});
    document.querySelector("#companySaveBtn")?.addEventListener("click",async()=>{const r=await saveCompanyRecord(document.querySelector("#companyNameInput").value,document.querySelector("#companyPersonInput").value,document.querySelector("#companyStartInput").value,document.querySelector("#companyEndInput").value);if(!r.ok){toast(r.reason==="dates"?"تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية":r.reason==="duplicate"?"الشخص موجود مسبقًا في هذه الشركة":"أكمل جميع الخانات");return}state.companies.selected=r.record.company;state.companies.showAdd=true;render();toast("تم حفظ البيانات")});
    document.querySelectorAll(".company-check").forEach(c=>c.onchange=()=>{state.companies.selectedPeople=selectedCompanyIds()});
    document.querySelectorAll(".company-edit-person").forEach(b=>b.onclick=()=>editCompanyPerson(b.dataset.id));
    document.querySelectorAll(".company-delete-person").forEach(b=>b.onclick=async()=>{if(confirm("حذف هذا الشخص وتصريحه؟")){await deleteCompanyPerson(b.dataset.id);state.companies.selectedPeople=state.companies.selectedPeople.filter(id=>id!==b.dataset.id);render();toast("تم حذف الشخص")}});
    document.querySelector("#companyDeleteBtn")?.addEventListener("click",async()=>{if(!state.companies.selected)return;const pass=prompt("أدخل كلمة المرور لحذف الشركة مع جميع الأشخاص:");if(pass===null)return;if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return}if(confirm(`حذف الشركة ${state.companies.selected} وجميع الأشخاص التابعين لها؟`)){const n=state.companies.selected;await deleteCompanyAll(n);state.companies.selected="";state.companies.selectedPeople=[];render();toast("تم حذف الشركة وجميع الأشخاص")}});
    document.querySelector("#companyBulkDeleteBtn")?.addEventListener("click",async()=>{const ids=selectedCompanyIds();if(!ids.length){toast("حدد الأشخاص أولاً");return}const pass=prompt("أدخل كلمة المرور لحذف الأشخاص المحددين:");if(pass===null)return;if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return}if(confirm(`حذف ${ids.length} شخص؟`)){for(const id of ids)await deleteCompanyPerson(id);state.companies.selectedPeople=[];render();toast("تم حذف الأشخاص المحددين")}});
    document.querySelector("#companyBulkEditBtn")?.addEventListener("click",async()=>{const ids=selectedCompanyIds();if(!ids.length){toast("حدد الأشخاص أولاً");return}const pass=prompt("أدخل كلمة المرور لتعديل الأشخاص المحددين:");if(pass===null)return;if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return}const modal=document.querySelector("#modal");modal.classList.remove("hidden");modal.innerHTML=`<div class="modal-box"><h3>تعديل تواريخ الأشخاص المحددين</h3><p class="help-text">سيتم تطبيق التاريخين على جميع الأشخاص المحددين (${ids.length}).</p><div class="grid"><div class="field"><label>تاريخ بداية التصريح</label><input id="bulkStart" type="date"></div><div class="field"><label>تاريخ انتهاء التصريح</label><input id="bulkEnd" type="date"></div></div><div class="actions"><button class="primary" id="saveBulkEdit">حفظ</button><button class="secondary" id="closeBulkEdit">إلغاء</button></div></div>`;document.querySelector("#closeBulkEdit").onclick=()=>modal.classList.add("hidden");document.querySelector("#saveBulkEdit").onclick=async()=>{const st=document.querySelector("#bulkStart").value,en=document.querySelector("#bulkEnd").value;if(!st||!en||en<st){toast("أدخل تاريخين صحيحين");return}for(const id of ids){const x=state.companies.list.find(r=>r.id===id);if(x)await saveCompanyRecord(x.company,x.person,st,en,id)}state.companies.selectedPeople=[];modal.classList.add("hidden");render();toast("تم تعديل تواريخ الأشخاص المحددين")}});
    document.querySelector("#companyExportBtn")?.addEventListener("click",exportCompanies);
    document.querySelector("#exportCompaniesDriveBtn")?.addEventListener("click",syncCompaniesToGoogleDrive);
    document.querySelector("#companyImportBtn")?.addEventListener("click",()=>document.querySelector("#companyImportInput")?.click());
    document.querySelector("#companyImportInput")?.addEventListener("change",async e=>{const f=e.target.files?.[0];if(f)await importCompanies(f);e.target.value=""});
     document.querySelector("#companyImportDriveBtn")?.addEventListener("click",importCompaniesFromDrive);
  }
  if(state.page==="settings"){
    restoreExportFolder().then(async h=>{
      const el=document.querySelector("#exportFolderStatus");
      if(!el)return;
      if(h){
        const ok=await verifyExportDirectory(h);
        el.textContent=ok?`المجلد الرسمي: ${h.name||EXPORT_FOLDER_HINT}`:`المجلد محفوظ: ${h.name||EXPORT_FOLDER_HINT} — اضغط تحديد مجلد التصدير لإعادة منح الصلاحية.`;
      }else el.textContent=`المجلد الرسمي المقترح: ${EXPORT_FOLDER_HINT}. اضغط تحديد مجلد التصدير واختره مرة واحدة.`;
    });
  }
  document.querySelectorAll(".protected-dropdown-btn").forEach(b=>b.addEventListener("click",()=>protectDropdownManager(b.dataset.dropdownType)));
  document.querySelector("#mailFile")?.addEventListener("change",e=>{state.mail.files=[...(e.target.files||[])];state.mail.file=state.mail.files[0]||null;render()});
  document.querySelector("#mailCustomEmail")?.addEventListener("input",e=>state.mail.customEmail=e.target.value);
  document.querySelector("#mailSubject")?.addEventListener("input",e=>state.mail.subject=e.target.value);
  document.querySelectorAll(".mail-recipient").forEach(x=>x.addEventListener("change",()=>state.mail.recipients=[...document.querySelectorAll(".mail-recipient:checked")].map(x=>x.dataset.email)));
  document.querySelector("#mailSendBtn")?.addEventListener("click",sendMailWithAttachment);
  document.querySelector("#mailRefreshInbox")?.addEventListener("click",listInbox);
  document.querySelectorAll(".mail-download-attachment").forEach(b=>b.addEventListener("click",async()=>{const msg=state.mail.messages.find(x=>x.id===b.dataset.messageId),a=msg?.attachments?.find(x=>x.filename===b.dataset.filename);await downloadGmailAttachment(b.dataset.messageId,b.dataset.attachmentId,b.dataset.filename,b.dataset.mime,a?.data||"")}));
  document.querySelectorAll(".mail-preview-attachment").forEach(b=>b.addEventListener("click",async()=>{const msg=state.mail.messages.find(x=>x.id===b.dataset.messageId),a=msg?.attachments?.find(x=>x.filename===b.dataset.filename);await previewGmailAttachment(b.dataset.messageId,b.dataset.attachmentId,b.dataset.filename,b.dataset.mime,a?.data||"")}));
  document.querySelector("#driveSendFile")?.addEventListener("change",e=>{state.mail.driveFile=e.target.files?.[0]||null;render()});
  document.querySelector("#driveSendBtn")?.addEventListener("click",sendDriveFile);
  document.querySelector("#employeeUpdateChooseBtn")?.addEventListener("click",async()=>{const h=await chooseEmployeeArchiveFolder();if(h){document.querySelector("#employeeUpdateFolder").value=h.name||"ISPS archives";toast("تم اختيار فولدر ISPS archives")}}); 
  document.querySelector("#employeeUpdateBtn")?.addEventListener("click",updateEmployeeDepartureData);
  document.querySelectorAll(".operation-reset-btn").forEach(b=>b.onclick=resetOperation);
  const search=document.querySelector("#nameSearch");if(search){search.oninput=()=>refreshNamesTable(search.value);refreshNamesTable()}
  document.querySelector("#addNameBtn")?.addEventListener("click",()=>openNameModal());
  document.querySelector("#exportNamesBtn")?.addEventListener("click",exportAllNames);
  document.querySelector("#exportNamesDriveBtn")?.addEventListener("click",syncNamesToGoogleDrive);
  document.querySelector("#importNamesBtn")?.addEventListener("click",()=>document.querySelector("#namesFileInput")?.click());
  document.querySelector("#namesFileInput")?.addEventListener("change",async e=>{const file=e.target.files?.[0];if(file)await importNamesFromFile(file);e.target.value=""});
  document.querySelector("#importNamesDriveBtn")?.addEventListener("click",importNamesFromDrive);
  document.querySelector("#clearNames")?.addEventListener("click",async()=>{const pass=prompt("أدخل كلمة المرور لحذف جميع الأسماء:");if(pass===null)return;if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return}if(confirm("سيتم حذف قاعدة الأسماء بالكامل. هل أنت متأكد؟")){await clearAllNames();refreshNamesTable();toast("تم حذف جميع الأسماء")}});
  document.querySelector("#themeSettings")?.addEventListener("click",toggleTheme);
  document.querySelector("#surveySearchBtn")?.addEventListener("click",searchSurveyInFolder);
  document.querySelectorAll('input[name="surveySource"]').forEach(r=>r.addEventListener("change",e=>{state.survey.source=e.target.value;render()}));
  document.querySelector("#surveyClearBtn")?.addEventListener("click",()=>{state.survey={employee:"",report:[],status:""};render()});
  document.querySelector("#surveyExportBtn")?.addEventListener("click",exportSurvey);
  document.querySelector("#surveyEmployee")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();searchSurveyInFolder()}});
}
function openNameModal(){const m=document.querySelector("#modal");m.classList.remove("hidden");m.innerHTML=`<div class="modal-box"><h3>إضافة اسم</h3><input id="newName" class="name-input" style="width:100%;margin:10px 0" placeholder="الاسم"><div class="actions"><button class="primary" id="confirmNew">حفظ</button><button class="secondary" id="cancelNew">إلغاء</button></div></div>`;document.querySelector("#newName").focus();document.querySelector("#cancelNew").onclick=()=>m.classList.add("hidden");document.querySelector("#confirmNew").onclick=async()=>{const ok=await addName(document.querySelector("#newName").value);toast(ok?"تمت إضافة الاسم":"الاسم موجود مسبقًا");m.classList.add("hidden");refreshNamesTable(document.querySelector("#nameSearch")?.value||"")}}
function protectedPage(page){return page==="survey"}
async function navigate(page){
  if(protectedPage(page)){
    const pass=prompt("أدخل كلمة مرور استبيان عن موظف:");
    if(pass===null)return;
    if(pass!=="1945"){toast("كلمة المرور غير صحيحة");return;}
  }
  state.page=page;if(CONFIG[page]){let stored=loadDraft(page);if(!stored)stored=await loadOperationFromDB(page);state.draft=stored?.type===page?stored:defaultDraft(page);saveDraft()}render();document.querySelector("#sidebar")?.classList.remove("open");
  if(page==="mail-inbox")setTimeout(()=>{if(state.page==="mail-inbox")listInbox()},80);
}
function updateThemeSwitch(){
  const dark=document.body.classList.contains("dark"),btn=document.querySelector("#themeBtn");
  if(!btn)return;
  btn.classList.toggle("is-dark",dark);
  btn.setAttribute("aria-checked",dark?"true":"false");
}
function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("theme",document.body.classList.contains("dark")?"dark":"light");updateThemeSwitch()}
function initTheme(){if(localStorage.getItem("theme")==="dark")document.body.classList.add("dark");else document.body.classList.remove("dark");updateThemeSwitch()}
function installKeyboardStability(){
  // Enter داخل حقول الإدخال يجب ألا يرسل نموذجًا أو يعيد تحميل الصفحة.
  // استثناء حقول الأسماء التي لديها معالجها الخاص للانتقال للسطر التالي.
  document.addEventListener("keydown",e=>{
    if(e.key!=="Enter"&&e.key!=="NumpadEnter")return;
    const el=e.target;
    if(!(el instanceof HTMLElement))return;
    const tag=el.tagName;
    if(tag==="INPUT" || tag==="TEXTAREA"){
      // اترك Enter لحقول الأسماء؛ معالج bindAutocomplete يتولى
      // اختيار أول نتيجة وإنشاء الخانة التالية وتركيز المؤشر عليها.
      if(el.classList.contains("name-input")) return;
      e.preventDefault();
      e.stopPropagation();
    }
  },true);
}
async function init(){try{state.names=await allNames()}catch(e){console.error(e);state.names=[]}try{await initCompanies()}catch(e){console.error(e);state.companies.list=[]}await restoreExportFolder();await initDropdownData();state.draft=null;initTheme();render();document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>navigate(b.dataset.page));document.querySelector("#menuBtn").onclick=()=>document.querySelector("#sidebar").classList.toggle("open");document.querySelector("#themeBtn").onclick=toggleTheme;window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;document.querySelector("#installBtn").classList.remove("hidden")});document.querySelector("#installBtn").onclick=async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null};if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js?v=20260929-ui-v31").catch(()=>{})}
init();
