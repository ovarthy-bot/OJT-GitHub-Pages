const $ = id => document.getElementById(id);
const state = { records: [], connected: false, notesTimer: null, accessToken: null, tokenClient: null, driveContext: null, user: null, calendarMonth: '2026-07' };
const ROOT_FOLDER='OJT İş Takip', DATA_FILE='ojt-kayitlari.json', NOTES_FILE='ojt-notlar.json';
const CLIENT_ID=window.OJT_CONFIG?.GOOGLE_CLIENT_ID||'';
const SCOPES='https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const TOKEN_KEY='ojt_google_access_token';
const TASKS = [
  {id:'1',group:'1',name:'Uçak defterinde arıza kaydı'}, {id:'2',group:'1',name:"Uçak defterinde MEL'e göre sefere verme işlemleri"},
  {id:'3',group:'2',name:'Servis işlemleri (Yağlama)'}, {id:'4',group:'2',name:'Servis işlemleri (motor hidrolik ikmal)'}, {id:'5',group:'2',name:'Servis işlemleri (lastik değişimi)'},
  {id:'6',group:'3',name:'Günlük, haftalık kartlar, ETOPS servis kartları'}, {id:'7',group:'3',name:'Bakıma hazırlık / Bakım çıkış kartları'},
  {id:'8',group:'4',name:'TSM/FIM kullanma'}, {id:'9',group:'4',name:'Komponent söküm takımları'}, {id:'10',group:'4',name:'Sistem/komponent testleri'}, {id:'11',group:'4',name:'Yazılım / Medya / Yükleme / İndirme'},
  {id:'12',group:'optional',name:'Motor Söküm Takımları (Optional)'}, {id:'13',group:'optional',name:'Park / Depolama (Optional)'}
];
const SHIFT_CALENDAR = {
  '2026-07': {
    label: 'Temmuz 2026',
    shifts: {
      '2026-07-01':'Off','2026-07-02':'Off','2026-07-03':'Off','2026-07-04':'7-3','2026-07-05':'3-11',
      '2026-07-06':'3-11','2026-07-07':'11-7','2026-07-08':'11-7','2026-07-09':'Off','2026-07-10':'Off',
      '2026-07-11':'7-3','2026-07-12':'7-3','2026-07-13':'3-11','2026-07-14':'3-11','2026-07-15':'11-7',
      '2026-07-16':'Off','2026-07-17':'Off','2026-07-18':'Off','2026-07-19':'7-3','2026-07-20':'7-3',
      '2026-07-21':'3-11','2026-07-22':'3-11','2026-07-23':'11-7','2026-07-24':'11-7','2026-07-25':'Off',
      '2026-07-26':'Off','2026-07-27':'7-3','2026-07-28':'7-3','2026-07-29':'3-11','2026-07-30':'3-11',
      '2026-07-31':'11-7'
    }
  },
  '2026-08': {
    label: 'Ağustos 2026',
    shifts: {
      '2026-08-01':'11-7','2026-08-02':'Off','2026-08-03':'Off','2026-08-04':'Off','2026-08-05':'7-3',
      '2026-08-06':'3-11','2026-08-07':'3-11','2026-08-08':'11-7','2026-08-09':'11-7','2026-08-10':'Off',
      '2026-08-11':'Off','2026-08-12':'7-3','2026-08-13':'7-3','2026-08-14':'3-11','2026-08-15':'3-11',
      '2026-08-16':'11-7','2026-08-17':'Off','2026-08-18':'Off','2026-08-19':'Off','2026-08-20':'7-3',
      '2026-08-21':'7-3','2026-08-22':'3-11','2026-08-23':'3-11','2026-08-24':'11-7','2026-08-25':'11-7',
      '2026-08-26':'Off','2026-08-27':'Off','2026-08-28':'7-3','2026-08-29':'7-3','2026-08-30':'3-11',
      '2026-08-31':'3-11'
    }
  }
};
const SHIFT_MONTHS = Object.keys(SHIFT_CALENDAR);
const CALENDAR_DAY_LABELS = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'];
const fields = ['description','workOrder','nrc','taskCard','aml','date','aircraft','duration','group','taskType','documentType','stamp'];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const toast = message => { $('toast').textContent=message; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); };
const parseDuration = value => { const normalized=String(value||'').trim().replace(',','.'); return normalized===''?0:Number(normalized); };
const formatDuration = value => { const minutes=Math.max(0,Math.round(Number(value||0)*60)); return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`; };
const pad2 = value => String(value).padStart(2,'0');
const todayInputValue=()=>{const now=new Date();return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`};
$('month').value=todayInputValue().slice(0,7); $('date').value=todayInputValue();
function normalizeDate(value) {
  if(value instanceof Date&&!Number.isNaN(value.getTime())){
    return `${value.getFullYear()}-${pad2(value.getMonth()+1)}-${pad2(value.getDate())}`;
  }
  const raw=String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/\u00A0/g,' ').trim();
  if(!raw)return '';
  let year,month,day,match;
  const compact=raw.replace(/\s+/g,' ');
  if((match=compact.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))){
    [,year,month,day]=match;
  }else if((match=compact.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s].*)?$/))){
    [,day,month,year]=match;
  }else if((match=compact.match(/^(\d{4})(\d{2})(\d{2})$/))){
    [,year,month,day]=match;
  }else{
    return '';
  }
  const y=Number(year),m=Number(month),d=Number(day),date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
const formatDate = value => {
  const normalized=normalizeDate(value);
  if(!normalized)return String(value??'');
  const [y,m,d]=normalized.split('-');
  return `${d}.${m}.${y}`;
};

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function saveToken(response){
  const saved={accessToken:response.access_token,expiresAt:Date.now()+(Number(response.expires_in||3600)*1000)};
  localStorage.setItem(TOKEN_KEY,JSON.stringify(saved));
}
function restoreToken(){
  try{const saved=JSON.parse(localStorage.getItem(TOKEN_KEY)||'null');if(saved?.accessToken&&saved.expiresAt>Date.now()+60000){state.accessToken=saved.accessToken;state.connected=true;return true}}catch{}
  localStorage.removeItem(TOKEN_KEY);return false;
}
function clearToken(){localStorage.removeItem(TOKEN_KEY);state.accessToken=null;state.connected=false;state.driveContext=null}
async function waitForGoogle(){for(let i=0;i<80;i++){if(window.google?.accounts?.oauth2)return;if(i===79)throw new Error('Google giriş sistemi yüklenemedi.');await sleep(100)}}
async function connectGoogle(){
  if(!CLIENT_ID||CLIENT_ID.startsWith('BURAYA_'))throw new Error('Önce public/config.js dosyasına Google Client ID yazılmalıdır.');
  await waitForGoogle();
  return new Promise((resolve,reject)=>{
    if(!state.tokenClient)state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:SCOPES,callback:()=>{}});
    state.tokenClient.callback=response=>{
      if(response.error)return reject(new Error(response.error_description||response.error));
      state.accessToken=response.access_token;state.connected=true;state.driveContext=null;saveToken(response);localStorage.setItem('ojt_google_authorized','1');resolve(response);
    };
    state.tokenClient.requestAccessToken({prompt:localStorage.getItem('ojt_google_authorized')?'':'consent'});
  });
}
async function driveFetch(url,options={}){
  if(!state.accessToken)throw new Error('Google Drive bağlantısı gerekli.');
  const response=await fetch(url.startsWith('http')?url:`https://www.googleapis.com/drive/v3${url}`,{...options,headers:{Authorization:`Bearer ${state.accessToken}`,...(options.headers||{})}});
  if(response.status===401){clearToken();throw new Error('Google oturumunun süresi doldu. Drive’a yeniden bağlanın.');}
  if(!response.ok){let detail='';try{detail=(await response.json()).error?.message||''}catch{}throw new Error(detail||`Google Drive hatası (${response.status})`)}
  if(response.status===204)return null;const type=response.headers.get('content-type')||'';return type.includes('application/json')?response.json():response;
}
const qEscape=value=>String(value).replaceAll("'","\\'");
async function findChild(name,parentId,mimeType){
  const parts=[`name='${qEscape(name)}'`,`'${parentId}' in parents`,'trashed=false'];if(mimeType)parts.push(`mimeType='${mimeType}'`);
  const params=new URLSearchParams({q:parts.join(' and '),fields:'files(id,name)',spaces:'drive',pageSize:'1'});
  return (await driveFetch(`/files?${params}`)).files?.[0]||null;
}
async function createMetadata(metadata){return driveFetch('/files?fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(metadata)})}
async function ensureFolder(name,parentId='root'){const mimeType='application/vnd.google-apps.folder',found=await findChild(name,parentId,mimeType);return found?.id||(await createMetadata({name,mimeType,parents:[parentId]})).id}
async function getDriveContext(){if(state.driveContext)return state.driveContext;const folderId=await ensureFolder(ROOT_FOLDER),documentFolderId=await ensureFolder('Belgeler',folderId);return state.driveContext={folderId,documentFolderId}}
async function readJson(name,fallback){const {folderId}=await getDriveContext(),file=await findChild(name,folderId);if(!file)return fallback;const response=await driveFetch(`/files/${file.id}?alt=media`);return response instanceof Response?response.json():response}
async function uploadMultipart(metadata,data,mimeType){
  const boundary=`ojt_${crypto.randomUUID()}`,bytes=data instanceof Blob?await data.arrayBuffer():new TextEncoder().encode(String(data)).buffer;
  const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,bytes,`\r\n--${boundary}--`]);
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
}
async function writeJson(name,value){
  const {folderId}=await getDriveContext(),file=await findChild(name,folderId),body=JSON.stringify(value,null,2);
  if(file)return driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${file.id}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body});
  return uploadMultipart({name,parents:[folderId]},body,'application/json');
}
const safeFilePart=value=>String(value||'').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/\s+/g,'_').slice(0,80)||'Belirtilmedi';
function documentReference(record){if(record.documentType==='task'&&record.taskCard)return record.taskCard;if(record.nrc&&record.aml)return `${record.nrc}-${record.aml}`;return record.nrc||record.taskCard||record.aml||'Referans_Yok'}
async function uploadDocument(file,record){
  const {documentFolderId}=await getDriveContext(),isPdf=file.type==='application/pdf'||file.name.toLocaleLowerCase('tr-TR').endsWith('.pdf');
  const name=isPdf?`${new Date().toISOString().slice(0,10)}_${safeFilePart(record.workOrder)}_${safeFilePart(documentReference(record))}_${safeFilePart(record.description)}.pdf`:safeFilePart(file.name);
  return uploadMultipart({name,parents:[documentFolderId]},file,file.type||'application/octet-stream');
}
async function saveRecord(record,file){
  const normalizedDate=normalizeDate(record.date);
  if(!normalizedDate)throw new Error('Geçerli bir tarih seçin.');
  record.date=normalizedDate;
  const previous=record.id?state.records.find(item=>item.id===record.id):null;
  if(file){record.document=await uploadDocument(file,record);if(previous?.document?.id)await deleteDriveFile(previous.document.id).catch(()=>{})}
  record.id||=crypto.randomUUID();record.createdAt||=new Date().toISOString();record.updatedAt=new Date().toISOString();
  const records=[...state.records],index=records.findIndex(item=>item.id===record.id);if(index>=0)records[index]={...records[index],...record};else records.unshift(record);
  await writeJson(DATA_FILE,records);state.records=records;return record;
}
const deleteDriveFile=id=>driveFetch(`/files/${encodeURIComponent(id)}`,{method:'DELETE'});
async function deleteRecord(id){const record=state.records.find(item=>item.id===id);if(record?.document?.id)await deleteDriveFile(record.document.id).catch(()=>{});state.records=state.records.filter(item=>item.id!==id);await writeJson(DATA_FILE,state.records)}
async function openDocument(id){const response=await driveFetch(`/files/${encodeURIComponent(id)}?alt=media`),blob=await response.blob(),url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}
async function loadUser(){const response=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:`Bearer ${state.accessToken}`}});if(response.ok)state.user=await response.json()}

function openedTaskTypeIds() {
  const opened=new Set();
  state.records.forEach(record=>{
    const task=resolveTask(record);
    if(task)opened.add(task.id);
  });
  return opened;
}
function updateTaskTypeSelectColor() {
  const unopened=$('taskType').selectedOptions[0]?.dataset.unopened==='true';
  $('taskType').classList.toggle('unopened-task-selected',unopened);
}
function populateTaskTypes(group, selected='') {
  const available=TASKS.filter(task=>task.group===group),opened=openedTaskTypeIds(),canEvaluate=state.connected;
  $('taskType').innerHTML='<option value="">İş türünü seçin</option>'+available.map(task=>{
    const unopened=canEvaluate&&!opened.has(task.id);
    return `<option value="${task.id}"${unopened?' class="unopened-task-option" data-unopened="true" style="color:#b42318;font-weight:700"':''}>${task.id}. ${task.name}</option>`;
  }).join('');
  $('taskType').value=selected;
  updateTaskTypeSelectColor();
}
function updateStampVisibility() {
  const visible=Boolean($('taskCard').value.trim()||$('nrc').value.trim());
  $('stampField').classList.toggle('hidden',!visible);
  if(!visible) $('stamp').checked=false;
}
populateTaskTypes('1');
$('group').addEventListener('change',()=>populateTaskTypes($('group').value));
$('taskType').addEventListener('change',updateTaskTypeSelectColor);
$('taskCard').addEventListener('input',updateStampVisibility); $('nrc').addEventListener('input',updateStampVisibility);

function validation(record) {
  const warnings=[];
  if(!record.workOrder) warnings.push('W/O numarası zorunludur.');
  if(!normalizeDate(record.date)) warnings.push('Geçerli bir tarih seçilmelidir.');
  if(!Number.isFinite(record.duration)||record.duration<0) warnings.push('Süre 0,75 gibi geçerli ve pozitif bir sayı olmalıdır.');
  if(record.documentType==='task'&&!record.taskCard) warnings.push('Bakım kartına göre yapılan işlemde kart numarası yazılmalıdır.');
  if(record.documentType==='nrc'&&!record.nrc) warnings.push('NRC/item işleminde NRC numarası yazılmalıdır.');
  if(record.documentType==='release'&&(!record.nrc||!record.aml)) warnings.push('Servise verme işleminde NRC ve AML numarası birlikte yazılmalıdır.');
  if(record.documentType!=='release'&&(record.taskCard||record.nrc)&&!record.stamp) warnings.push('Bakım kartı veya NRC işleminde TT sicil kaşesi gereklidir.');
  return warnings;
}
function monthRecords() {
  const selectedMonth=$('month').value;
  return state.records.filter(record=>{
    const date=normalizeDate(record.date);
    return !selectedMonth||date.startsWith(selectedMonth);
  });
}
function recordQuality(record) {
  return (record?.document?30:0)+(validation(record).length===0?20:0)+(record?.taskCard||record?.nrc||record?.aml?10:0)+(Number(record?.duration)>0?2:0);
}
function duplicateDateInfo(records) {
  const byDate=new Map();
  records.forEach(record=>{
    const date=normalizeDate(record?.date);
    if(!date)return;
    if(!byDate.has(date))byDate.set(date,[]);
    byDate.get(date).push(record);
  });
  const duplicateRecords=new Set(),preferredRecords=new Set(),rejectedRecords=new Set(),counts=new Map(),duplicateDates=new Set(),preferredByDate=new Map();
  byDate.forEach((items,date)=>{
    counts.set(date,items.length);
    if(items.length>1){
      duplicateDates.add(date);
      items.forEach(item=>duplicateRecords.add(item));
    }
  });

  // Her iş türü için her tarihteki en güçlü kaydı belirle. Böylece aynı gün içindeki
  // seçim, belge/eksik bilgi kalitesini ve iş türünün başka günlerde bulunup bulunmadığını dikkate alır.
  const taskDateRecords=new Map();
  records.forEach(record=>{
    const date=normalizeDate(record?.date),taskId=resolveTask(record)?.id||String(record?.taskType||'').trim();
    if(!date||!taskId)return;
    if(!taskDateRecords.has(taskId))taskDateRecords.set(taskId,new Map());
    const dateMap=taskDateRecords.get(taskId),current=dateMap.get(date);
    if(!current||recordQuality(record)>recordQuality(current))dateMap.set(date,record);
  });
  const outsideDuplicateDateCount=taskId=>{
    const dateMap=taskDateRecords.get(taskId);
    if(!dateMap)return Number.POSITIVE_INFINITY;
    return [...dateMap.keys()].filter(date=>!duplicateDates.has(date)).length;
  };

  // Mükerrer günleri iş türleriyle eşleştirirken, başka bir tekil tarihte hiç açılmamış
  // iş türleri önce işlenir. Artırmalı eşleştirme aynı iş türünün bütün günleri kapmasını önler.
  const duplicateCandidatesByTask=new Map();
  duplicateDates.forEach(date=>{
    (byDate.get(date)||[]).forEach(record=>{
      const taskId=resolveTask(record)?.id||String(record?.taskType||'').trim();
      if(!taskId)return;
      if(!duplicateCandidatesByTask.has(taskId))duplicateCandidatesByTask.set(taskId,[]);
      duplicateCandidatesByTask.get(taskId).push(record);
    });
  });
  duplicateCandidatesByTask.forEach((items,taskId)=>items.sort((a,b)=>{
    const dateA=normalizeDate(a.date),dateB=normalizeDate(b.date);
    const optionA=(byDate.get(dateA)||[]).length,optionB=(byDate.get(dateB)||[]).length;
    return optionA-optionB||recordQuality(b)-recordQuality(a)||dateA.localeCompare(dateB)||String(a.createdAt||a.id||'').localeCompare(String(b.createdAt||b.id||''));
  }));
  const dateMatch=new Map();
  const assign=(taskId,seenTasks,seenDates)=>{
    if(seenTasks.has(taskId))return false;
    seenTasks.add(taskId);
    for(const candidate of duplicateCandidatesByTask.get(taskId)||[]){
      const date=normalizeDate(candidate.date);
      if(seenDates.has(date))continue;
      seenDates.add(date);
      const occupied=dateMatch.get(date),occupiedTask=occupied&&(resolveTask(occupied)?.id||String(occupied.taskType||'').trim());
      if(!occupied||(occupiedTask&&assign(occupiedTask,seenTasks,seenDates))){dateMatch.set(date,candidate);return true}
    }
    return false;
  };
  [...duplicateCandidatesByTask.keys()].sort((a,b)=>{
    const outsideOrder=outsideDuplicateDateCount(a)-outsideDuplicateDateCount(b);
    if(outsideOrder)return outsideOrder;
    const candidateOrder=(duplicateCandidatesByTask.get(a)?.length||0)-(duplicateCandidatesByTask.get(b)?.length||0);
    return candidateOrder||String(a).localeCompare(String(b),'tr',{numeric:true});
  }).forEach(taskId=>assign(taskId,new Set(),new Set()));

  duplicateDates.forEach(date=>{
    const items=byDate.get(date)||[];
    let preferred=dateMatch.get(date);
    if(!preferred){
      preferred=[...items].sort((a,b)=>{
        const taskA=resolveTask(a)?.id||String(a.taskType||'').trim(),taskB=resolveTask(b)?.id||String(b.taskType||'').trim();
        const outsideOrder=outsideDuplicateDateCount(taskA)-outsideDuplicateDateCount(taskB);
        if(outsideOrder)return outsideOrder;
        const dateOptionOrder=(taskDateRecords.get(taskA)?.size||999)-(taskDateRecords.get(taskB)?.size||999);
        return dateOptionOrder||recordQuality(b)-recordQuality(a)||String(a.createdAt||a.id||'').localeCompare(String(b.createdAt||b.id||''));
      })[0];
    }
    if(preferred){
      preferredByDate.set(date,preferred);
      preferredRecords.add(preferred);
      items.forEach(item=>{if(item!==preferred)rejectedRecords.add(item)});
    }
  });
  return {byDate,duplicateRecords,preferredRecords,rejectedRecords,preferredByDate,counts,duplicateDates};
}
function sameDayRecords(value,excludeId='') {
  const date=normalizeDate(value);
  if(!date)return [];
  return state.records.filter(record=>{
    if(excludeId&&record.id===excludeId)return false;
    return normalizeDate(record.date)===date;
  });
}
function updateDuplicateDateHint() {
  const hint=$('dateDuplicateHint');
  if(!hint)return;
  const date=normalizeDate($('date').value),excludeId=$('recordId').value||'';
  const sameDay=sameDayRecords(date,excludeId);
  if(!date||!sameDay.length){
    hint.textContent='';
    hint.classList.add('hidden');
    $('date').classList.remove('duplicate-input');
    return;
  }
  hint.textContent=`${formatDate(date)} tarihinde ${sameDay.length} başka kayıt var. Aynı tarih kaydedilebilir; bu tarihte yalnızca bir kayıt uygun sayılır ve seçimde başka bir tarihte henüz açılmamış iş türüne öncelik verilir.`;
  hint.classList.remove('hidden');
  $('date').classList.add('duplicate-input');
}
function eligibility(records,duplicates=duplicateDateInfo(records)) {
  const result=new Map(),groups=new Map();
  records.forEach(r=>{
    result.set(r,false);
    // Mükerrer günün yalnızca otomatik seçilen kaydı değerlendirmeye alınır.
    if(duplicates.rejectedRecords?.has(r))return;
    const group=resolveTask(r)?.group||r.group;
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push(r);
  });
  groups.forEach((groupRecords,group)=>{
    const byType=new Map();
    groupRecords.forEach(r=>{
      const date=normalizeDate(r.date);
      const taskId=resolveTask(r)?.id||String(r.taskType||'').trim();
      if(!taskId||!date)return;
      if(!byType.has(taskId))byType.set(taskId,new Map());
      const dateMap=byType.get(taskId),current=dateMap.get(date);
      if(!current||recordQuality(r)>recordQuality(current))dateMap.set(date,r);
    });
    const candidates=new Map([...byType].map(([type,dateMap])=>[type,[...dateMap.values()].sort((a,b)=>recordQuality(b)-recordQuality(a)||normalizeDate(a.date).localeCompare(normalizeDate(b.date)))]));
    const dateMatch=new Map();
    const assign=(type,seenTypes,seenDates)=>{
      if(seenTypes.has(type))return false;
      seenTypes.add(type);
      for(const candidate of candidates.get(type)||[]){
        const date=normalizeDate(candidate.date);
        if(seenDates.has(date))continue;
        seenDates.add(date);
        const occupied=dateMatch.get(date);
        if(!occupied||assign(resolveTask(occupied)?.id||String(occupied.taskType||'').trim(),seenTypes,seenDates)){dateMatch.set(date,candidate);return true}
      }
      return false;
    };
    [...candidates.keys()].sort((a,b)=>candidates.get(a).length-candidates.get(b).length).forEach(type=>assign(type,new Set(),new Set()));
    const usedDates=new Set(dateMatch.keys()),remainingByDate=new Map();
    groupRecords.forEach(r=>{
      const date=normalizeDate(r.date);
      if(!date||usedDates.has(date))return;
      const current=remainingByDate.get(date);
      if(!current||recordQuality(r)>recordQuality(current))remainingByDate.set(date,r);
    });
    const matched=[...dateMatch.values()];
    const remaining=[...remainingByDate.values()].sort((a,b)=>recordQuality(b)-recordQuality(a)||normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
    const limit=group==='optional'?Number.POSITIVE_INFINITY:10;
    const selected=new Set([...matched,...remaining.slice(0,Math.max(0,limit-matched.length))]);
    const mandatory=groupRecords.filter(r=>duplicates.preferredRecords?.has(r));
    // Her mükerrer tarihten seçilen kayıt mutlaka uygun kalır. Gerekirse daha düşük
    // öncelikli, mükerrer olmayan bir kayıt 10 işlik görünümün dışına çıkarılır.
    mandatory.forEach(record=>{
      if(selected.has(record))return;
      if(Number.isFinite(limit)&&selected.size>=limit){
        const removable=[...selected].filter(item=>!duplicates.preferredRecords?.has(item)).sort((a,b)=>recordQuality(a)-recordQuality(b))[0];
        if(removable)selected.delete(removable);
      }
      selected.add(record);
    });
    selected.forEach(r=>result.set(r,true));
  });
  return result;
}
function resolveTask(record) {
  const idCandidates=[record?.taskType,record?.taskId,record?.task_type,record?.workTypeId,record?.isTuruId];
  for(const candidate of idCandidates){
    const text=String(candidate??'').trim(),match=text.match(/^(\d{1,2})(?:\D|$)/),id=match?.[1]||text;
    const task=TASKS.find(item=>item.id===id);
    if(task)return task;
  }
  const nameCandidates=[record?.taskName,record?.workType,record?.task,record?.task_type_name,record?.isTuru];
  for(const candidate of nameCandidates){
    const name=String(candidate??'').trim().replace(/^\d{1,2}[.)\-:]?\s*/,'').toLocaleLowerCase('tr-TR');
    if(!name)continue;
    const task=TASKS.find(item=>item.name.toLocaleLowerCase('tr-TR')===name);
    if(task)return task;
  }
  return null;
}
function taskHeading(record) {
  const task=resolveTask(record);
  if(task)return `${task.id}. ${task.name}`;
  const id=String(record?.taskType??record?.taskId??'').trim(),name=String(record?.taskName??record?.workType??record?.isTuru??'').trim();
  if(id&&name)return `${id}. ${name}`;
  if(name)return name;
  if(id)return id;
  return 'İş türü belirtilmemiş';
}
function recordGroupLabel(record) {
  const task=resolveTask(record),group=task?.group||record.group;
  return group==='optional'?'Optional':group?`Grup ${group}`:'Grup belirtilmemiş';
}
function filteredRecords() {
  const query=$('search').value.trim().toLocaleLowerCase('tr-TR');
  return monthRecords().filter(r=>!query||[r.description,r.workOrder,r.nrc,r.aml,r.taskCard,r.aircraft,taskHeading(r),recordGroupLabel(r)].some(v=>String(v||'').toLocaleLowerCase('tr-TR').includes(query)));
}
function unopenedArchiveTasks() {
  if(!state.connected)return [];
  const opened=openedTaskTypeIds(),query=$('search').value.trim().toLocaleLowerCase('tr-TR');
  return TASKS.filter(task=>!opened.has(task.id))
    .filter(task=>!query||[task.id,task.name,task.group==='optional'?'optional':`grup ${task.group}`].some(value=>String(value).toLocaleLowerCase('tr-TR').includes(query)));
}
function taskGroupLabel(task) { return task.group==='optional'?'Optional':`Grup ${task.group}`; }
function taskText(r) {
  const refs=[`W/O: ${r.workOrder||'-'}`];
  if(r.taskCard)refs.push(`KART: ${r.taskCard}`);
  if(r.nrc)refs.push(`NRC: ${r.nrc}`);
  if(r.aml)refs.push(`AML: ${r.aml}`);
  return `${r.description||'İş açıklaması girilmemiş'} ${refs.join(' ')}`;
}
function recordsByDate(records=state.records) {
  const map=new Map();
  records.forEach(record=>{
    const date=normalizeDate(record?.date);
    if(!date)return;
    if(!map.has(date))map.set(date,[]);
    map.get(date).push(record);
  });
  return map;
}
function monthGrid(dateText) {
  const [year,month]=dateText.split('-').map(Number);
  const totalDays=new Date(year,month,0).getDate();
  const firstWeekday=(new Date(year,month-1,1).getDay()+6)%7;
  const cells=[];
  for(let i=0;i<firstWeekday;i++)cells.push(null);
  for(let day=1;day<=totalDays;day++)cells.push(day);
  while(cells.length%7!==0)cells.push(null);
  return cells;
}
function renderShiftCalendar() {
  const widget=$('shiftCalendarWidget');
  if(!widget)return;
  const selected=SHIFT_CALENDAR[state.calendarMonth] ? state.calendarMonth : SHIFT_MONTHS[0];
  state.calendarMonth=selected;
  const monthInfo=SHIFT_CALENDAR[selected];
  const recordMap=recordsByDate();
  const days=Object.keys(monthInfo.shifts).sort();
  const workingDays=days.filter(date=>monthInfo.shifts[date]!=='Off');
  const filledCount=workingDays.filter(date=>(recordMap.get(date)||[]).length>0).length;
  const missingCount=workingDays.length-filledCount;
  const buttons=SHIFT_MONTHS.map(month=>`<button type="button" class="calendar-tab ${month===selected?'active':''}" data-calendar-month="${month}">${esc(SHIFT_CALENDAR[month].label)}</button>`).join('');
  const weekdayHeader=CALENDAR_DAY_LABELS.map(label=>`<span>${label}</span>`).join('');
  const cells=monthGrid(selected).map(day=>{
    if(!day)return '<div class="shift-day spacer" aria-hidden="true"></div>';
    const date=`${selected}-${pad2(day)}`;
    const shift=monthInfo.shifts[date]||'';
    const dayRecords=recordMap.get(date)||[];
    const isOff=shift==='Off';
    const isMissing=!isOff&&!dayRecords.length;
    const isFilled=!isOff&&dayRecords.length>0;
    const classes=['shift-day'];
    if(isOff)classes.push('off');
    if(isMissing)classes.push('missing');
    if(isFilled)classes.push('filled');
    const badge=isMissing?'<span class="shift-state">Boş</span>':isFilled?`<span class="shift-state">${dayRecords.length} kayıt</span>`:'<span class="shift-state">Off</span>';
    return `<div class="${classes.join(' ')}" title="${esc(`${formatDate(date)} · ${shift||'Plan yok'}${isMissing?' · Boş geçildi':isFilled?` · ${dayRecords.length} kayıt var`:''}`)}"><span class="shift-day-number">${day}</span><span class="shift-code">${esc(shift||'—')}</span>${badge}</div>`;
  }).join('');
  widget.innerHTML=`<div class="shift-calendar-card"><div class="shift-calendar-head"><div><span class="eyebrow">ÇALIŞMA TAKVİMİ</span><h3>${esc(monthInfo.label)}</h3><p>Yalnızca Temmuz ve Ağustos 2026 için, Off dışındaki boş günler kırmızı gösterilir.</p></div><div class="shift-calendar-stats"><span><strong>${workingDays.length}</strong> planlı gün</span><span><strong>${filledCount}</strong> dolu</span><span class="missing"><strong>${missingCount}</strong> boş</span></div></div><div class="calendar-tabs">${buttons}</div><div class="shift-calendar-weekdays">${weekdayHeader}</div><div class="shift-calendar-grid">${cells}</div></div>`;
}
function render() {
  populateTaskTypes($('group').value,$('taskType').value);
  if(SHIFT_CALENDAR[$('month').value]) state.calendarMonth=$('month').value;
  renderShiftCalendar();
  const monthly=monthRecords();
  const globalDuplicates=duplicateDateInfo(state.records);
  const eligible=eligibility(monthly,globalDuplicates);
  const usable=monthly.filter(r=>eligible.get(r)!==false);
  const days=new Set(usable.map(r=>normalizeDate(r.date)).filter(Boolean)).size;
  const complete=usable.filter(r=>validation(r).length===0&&r.document).length;
  const hours=usable.reduce((sum,r)=>sum+Number(r.duration||0),0);
  const selectedMonth=$('month').value;
  const duplicateDays=[...globalDuplicates.duplicateDates].filter(date=>!selectedMonth||date.startsWith(selectedMonth)).length;
  $('metrics').innerHTML=[
    ['Bu ay kullanılabilir',usable.length,usable.length>=40?'good':'warn'],
    ['Farklı gün',`${days} / 13`,days>=12?'good':'warn'],
    ['Mükerrer gün',duplicateDays,duplicateDays===0?'good':'bad'],
    ['Belgeli ve uygun',complete,complete===usable.length&&complete>0?'good':'warn'],
    ['Toplam süre',`${hours.toLocaleString('tr-TR',{maximumFractionDigits:2})} sa.`,hours>0?'good':'warn']
  ].map(([label,value,status])=>`<div class="metric ${status}"><span>${label}</span><strong>${value}</strong></div>`).join('');

  const groupSummaries=['1','2','3','4','optional'].map(group=>{
    const items=usable.filter(r=>(resolveTask(r)?.group||r.group)===group);
    const types=new Set(items.map(r=>resolveTask(r)?.id||String(r.taskType||'').trim()).filter(Boolean));
    const expected=TASKS.filter(t=>t.group===group),missing=expected.filter(t=>!types.has(t.id));
    const ok=group==='optional'?true:items.length>=10&&!missing.length;
    const detail=group==='optional'?`${items.length} iş · zorunlu değil`:`${items.length}/10 iş · ${missing.length?`${missing.length} tür eksik`:'tüm türler mevcut'}`;
    return `<span class="archive-overview-item ${ok?'ok':''}" title="${esc(missing.map(t=>t.name).join(', '))}"><strong>${group==='optional'?'Optional':`Grup ${group}`}</strong> ${esc(detail)}</span>`;
  }).join('');
  $('compliance').innerHTML=`<section class="archive-overview"><div><strong>Birleşik arşiv</strong><span>Seçilen aydaki bütün iş grupları tek listede gösterilir.</span></div><div class="archive-overview-items">${groupSummaries}</div></section>`;

  const records=filteredRecords().sort((a,b)=>{
    const dateOrder=normalizeDate(b.date).localeCompare(normalizeDate(a.date));
    if(dateOrder)return dateOrder;
    const preferredOrder=Number(globalDuplicates.preferredRecords.has(b))-Number(globalDuplicates.preferredRecords.has(a));
    if(preferredOrder)return preferredOrder;
    const duplicateOrder=Number(globalDuplicates.duplicateRecords.has(b))-Number(globalDuplicates.duplicateRecords.has(a));
    if(duplicateOrder)return duplicateOrder;
    return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
  const unopenedTasks=unopenedArchiveTasks();
  if(!records.length&&!unopenedTasks.length){
    $('records').innerHTML=`<div class="empty">${state.connected?'Bu filtreye uygun kayıt bulunamadı.':'Drive bağlantısı bekleniyor.'}</div>`;
    updateDuplicateDateHint();
    return;
  }
  const recordRows=records.map((r,index)=>{
    const date=normalizeDate(r.date),duplicateCount=globalDuplicates.counts.get(date)||0,duplicateDay=duplicateCount>1;
    const preferredDuplicate=duplicateDay&&globalDuplicates.preferredRecords.has(r),rejectedDuplicate=duplicateDay&&globalDuplicates.rejectedRecords.has(r);
    const preferredRecord=duplicateDay?globalDuplicates.preferredByDate.get(date):null;
    const usableRow=eligible.get(r)!==false,issues=validation(r);
    const unsuitableText='Bu iş için uygun değil - 10 işlik taslak dışında kaldı';
    const preferredText=`Bu tarih için uygun kayıt olarak seçildi. Henüz başka bir tarihte açılmamış veya daha az açılmış iş türlerine öncelik verildi.`;
    const rejectedText=`Bu iş için uygun değil - aynı tarih kullanıldı. ${formatDate(date)} için uygun kayıt: ${taskHeading(preferredRecord)}.`;
    const rowClass=preferredDuplicate?'duplicate-date duplicate-preferred':rejectedDuplicate?'duplicate-date duplicate-rejected':usableRow?'':'ineligible';
    const duplicateMessage=preferredDuplicate?`<span class="duplicate-warning accepted">${esc(preferredText)}</span>`:rejectedDuplicate?`<span class="duplicate-warning">${esc(rejectedText)}</span>`:'';
    const duplicateBadge=preferredDuplicate?'<span class="date-duplicate-badge accepted">MÜKERRER · UYGUN</span>':rejectedDuplicate?'<span class="date-duplicate-badge">MÜKERRER · UYGUN DEĞİL</span>':'';
    return `<tr class="${rowClass}">
      <td data-label="NO">${index+1}</td>
      <td data-label="İŞ TÜRÜ / YAPILAN İŞ">
        <span class="task-type-label">İŞ TÜRÜ</span>
        <span class="task-type-heading">${esc(taskHeading(r))}</span>
        <strong class="task-description">${esc(taskText(r))}</strong>
        <span class="task-meta">${esc(recordGroupLabel(r))}</span>
        ${duplicateMessage||(!usableRow?`<span class="unsuitable">${unsuitableText}</span>`:'')}
        ${issues.length?`<span class="row-warning">${issues.length} eksik bilgi</span>`:''}
      </td>
      <td data-label="UÇAK / KOMPONENT">${esc(r.aircraft||'-')}</td>
      <td data-label="TARİH"><span>${esc(formatDate(r.date)||'-')}</span>${duplicateBadge}</td>
      <td data-label="SÜRE">${formatDuration(r.duration)}</td>
      <td data-label="İŞLEM"><div class="record-actions">${r.document?`<button class="icon" data-document="${esc(r.document.id)}">Belge</button>`:''}<button class="icon" data-edit="${esc(r.id)}">Düzenle</button><button class="icon danger" data-delete="${esc(r.id)}">Sil</button></div></td>
    </tr>`;
  }).join('');
  const unopenedRows=unopenedTasks.map(task=>`<tr class="unopened-archive-row">
    <td data-label="NO">—</td>
    <td data-label="İŞ TÜRÜ / YAPILAN İŞ"><span class="task-type-label">İŞ TÜRÜ</span><span class="task-type-heading">${task.id}. ${esc(task.name)}</span><span class="unopened-archive-note">Tüm kayıt geçmişinde henüz açılmadı · ${taskGroupLabel(task)}</span></td>
    <td data-label="UÇAK / KOMPONENT">—</td><td data-label="TARİH">—</td><td data-label="SÜRE">—</td>
    <td data-label="İŞLEM"><span class="unopened-archive-status">Kayıt yok</span></td>
  </tr>`).join('');
  $('records').innerHTML=`<div class="table-wrap"><table class="ojt-table"><thead><tr><th>NO</th><th>İŞ TÜRÜ / YAPILAN İŞ <em>TASK TYPE / TASKS PERFORMED</em></th><th>UÇAK / ATÖLYE / KOMPONENT</th><th>TARİH</th><th>SÜRE</th><th>İŞLEM</th></tr></thead><tbody>${recordRows}${unopenedRows}</tbody></table></div>`;
  updateDuplicateDateHint();
}
async function load() {
  $('authButton').textContent=state.connected?'Bağlantıyı kes':'Drive’a bağlan';$('syncStatus').textContent=state.connected?`● ${state.user?.email||'Google Drive bağlı'}`:'Drive bağlı değil';
  if(!CLIENT_ID||CLIENT_ID.startsWith('BURAYA_')){$('setupNotice').classList.remove('hidden');$('setupNotice').innerHTML='<strong>Google Client ID gerekli.</strong> public/config.js dosyasındaki örnek değeri Google Cloud Web Client ID ile değiştirin.'}else $('setupNotice').classList.add('hidden');
  if(!state.connected){$('notes').disabled=true;render();return}
  const [records,notes]=await Promise.all([readJson(DATA_FILE,[]),readJson(NOTES_FILE,{text:'',updatedAt:null})]);
  state.records=(Array.isArray(records)?records:[]).map(record=>{
    const task=resolveTask(record);
    return {...record,id:record.id||crypto.randomUUID(),date:normalizeDate(record.date)||record.date,taskType:task?.id||record.taskType,taskName:task?.name||record.taskName,group:task?.group||record.group};
  });$('notes').value=notes.text||'';$('notes').disabled=false;$('notesStatus').textContent='Drive ile eşitlendi';render();
}
$('authButton').addEventListener('click',async()=>{try{if(state.connected){if(state.accessToken)google.accounts.oauth2.revoke(state.accessToken);localStorage.removeItem('ojt_google_authorized');clearToken();state.user=null;state.records=[];await load()}else{await connectGoogle();await loadUser();await load()}}catch(error){toast(error.message)}});
$('recordForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!state.connected)return toast('Önce Google Drive’a bağlanın.');
  const record=Object.fromEntries(fields.map(id=>[id,id==='stamp'?$(id).checked:$(id).value.trim()]));
  record.duration=parseDuration(record.duration);
  record.id=$('recordId').value||undefined;
  record.date=normalizeDate(record.date);
  const task=TASKS.find(t=>t.id===record.taskType);
  if(task){record.group=task.group;record.taskName=task.name}
  const sameDay=sameDayRecords(record.date,record.id||'');
  if(record.date&&sameDay.length&&!confirm(`${formatDate(record.date)} tarihinde ${sameDay.length} başka kayıt bulunuyor.

Aynı tarih kaydedilebilir. Bu tarihteki kayıtlardan yalnızca biri uygun sayılacak; uygun kayıt, başka bir tarihte henüz açılmamış iş türlerine öncelik verilerek otomatik seçilecektir.

Yine de kaydedilsin mi?`)){
    $('date').focus();
    return;
  }
  const issues=validation(record);
  if(issues.length&&!confirm(`Bu kayıtta eksikler var:\n\n• ${issues.join('\n• ')}\n\nYine de kaydedilsin mi?`))return;
  const button=event.submitter;
  button.disabled=true;
  button.textContent='Kaydediliyor…';
  try{
    const saved=await saveRecord(record,$('document').files[0]);
    const duplicateCount=sameDayRecords(saved.date).length,duplicateInfo=duplicateDateInfo(state.records);
    const duplicateMessage=duplicateCount>1?(duplicateInfo.preferredRecords.has(saved)?'Kayıt kaydedildi ve bu tarih için uygun kayıt olarak seçildi.':'Kayıt kaydedildi; aynı tarihteki başka bir kayıt uygun olarak seçildi.'):'Kayıt Drive’a kaydedildi.';
    toast(duplicateMessage);
    reset();render();
  }catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Kaydı Drive’a kaydet'}
});
function reset(){$('recordForm').reset();$('recordId').value='';$('date').value=todayInputValue();$('group').value='1';populateTaskTypes('1');updateStampVisibility();updateDuplicateDateHint()}
$('resetButton').addEventListener('click',reset); $('search').addEventListener('input',render); $('month').addEventListener('change',render); $('date').addEventListener('input',updateDuplicateDateHint); $('date').addEventListener('change',updateDuplicateDateHint);
$('shiftCalendarWidget')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-calendar-month]');
  if(!button)return;
  state.calendarMonth=button.dataset.calendarMonth;
  renderShiftCalendar();
});
$('records').addEventListener('click',async event=>{
  const edit=event.target.dataset.edit,del=event.target.dataset.delete,documentId=event.target.dataset.document;
  if(documentId){try{await openDocument(documentId)}catch(error){toast(error.message)}}
  if(edit){const r=state.records.find(x=>x.id===edit),task=resolveTask(r);$('group').value=task?.group||r.group||'1';populateTaskTypes($('group').value,task?.id||r.taskType||'');fields.filter(id=>!['group','taskType'].includes(id)).forEach(id=>{if(id==='stamp')$(id).checked=Boolean(r[id]);else if(id==='duration')$(id).value=String(r[id]??'').replace('.',',');else if(id==='date')$(id).value=normalizeDate(r[id]);else $(id).value=r[id]??''});$('recordId').value=r.id;updateStampVisibility();updateDuplicateDateHint();scrollTo({top:0,behavior:'smooth'})}
  if(del&&confirm('Kayıt ve bağlı belge Google Drive’dan silinsin mi?')){try{await deleteRecord(del);toast('Kayıt silindi.');render()}catch(error){toast(error.message)}}
});
$('notes').addEventListener('input',()=>{if(!state.connected)return;clearTimeout(state.notesTimer);$('notesStatus').textContent='Kaydediliyor…';state.notesTimer=setTimeout(async()=>{try{await writeJson(NOTES_FILE,{text:$('notes').value.slice(0,50000),updatedAt:new Date().toISOString()});$('notesStatus').textContent='Drive’a kaydedildi'}catch(error){$('notesStatus').textContent='Kaydedilemedi';toast(error.message)}},700)});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{}));
(async()=>{try{if(restoreToken())await loadUser();await load()}catch(error){clearToken();state.user=null;await load();toast(error.message)}})();
