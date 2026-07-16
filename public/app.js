const $ = id => document.getElementById(id);
const state = { records: [], connected: false, notesTimer: null, accessToken: null, tokenClient: null, driveContext: null, user: null };
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
const fields = ['description','workOrder','nrc','taskCard','aml','date','aircraft','duration','group','taskType','documentType','stamp'];
$('month').value = new Date().toISOString().slice(0,7); $('date').value = new Date().toISOString().slice(0,10);
const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const toast = message => { $('toast').textContent=message; $('toast').classList.add('show'); setTimeout(()=>$('toast').classList.remove('show'),2500); };
const parseDuration = value => { const normalized=String(value||'').trim().replace(',','.'); return normalized===''?0:Number(normalized); };
const formatDuration = value => { const minutes=Math.max(0,Math.round(Number(value||0)*60)); return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`; };
const pad2 = value => String(value).padStart(2,'0');
function normalizeDate(value) {
  const raw=String(value??'').trim();
  if(!raw)return '';
  let year,month,day,match;
  if((match=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))){
    [,year,month,day]=match;
  }else if((match=raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))){
    [,day,month,year]=match;
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
  const collision=state.records.find(item=>item.id!==record.id&&normalizeDate(item.date)===normalizedDate);
  if(collision)throw new Error(`${formatDate(normalizedDate)} tarihinde zaten kayıt var. Mükerrer gün kaydedilemez.`);
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
    const directId=String(record.taskType??'').trim();
    if(TASKS.some(task=>task.id===directId)){opened.add(directId);return}
    const savedName=String(record.taskName??'').trim().toLocaleLowerCase('tr-TR');
    const matched=TASKS.find(task=>task.name.toLocaleLowerCase('tr-TR')===savedName);
    if(matched)opened.add(matched.id);
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
function duplicateDateInfo(records) {
  const byDate=new Map();
  records.forEach(record=>{
    const date=normalizeDate(record.date);
    if(!date)return;
    if(!byDate.has(date))byDate.set(date,[]);
    byDate.get(date).push(record);
  });
  const duplicateIds=new Set(),counts=new Map(),duplicateDates=new Set();
  byDate.forEach((items,date)=>{
    counts.set(date,items.length);
    if(items.length>1){
      duplicateDates.add(date);
      items.forEach(item=>duplicateIds.add(item.id));
    }
  });
  return {byDate,duplicateIds,counts,duplicateDates};
}
function eligibility(records) {
  const result=new Map(),duplicates=duplicateDateInfo(records);
  const quality=r=>(r.document?30:0)+(validation(r).length===0?20:0)+(r.taskCard||r.nrc||r.aml?10:0);
  const groups=new Map();
  records.forEach(r=>{
    result.set(r.id,false);
    if(duplicates.duplicateIds.has(r.id))return;
    if(!groups.has(r.group))groups.set(r.group,[]);
    groups.get(r.group).push(r);
  });
  groups.forEach((groupRecords,group)=>{
    const byType=new Map();
    groupRecords.forEach(r=>{
      const date=normalizeDate(r.date);
      if(!r.taskType||!date)return;
      if(!byType.has(r.taskType))byType.set(r.taskType,new Map());
      const dateMap=byType.get(r.taskType),current=dateMap.get(date);
      if(!current||quality(r)>quality(current))dateMap.set(date,r);
    });
    const candidates=new Map([...byType].map(([type,dateMap])=>[type,[...dateMap.values()].sort((a,b)=>quality(b)-quality(a)||normalizeDate(a.date).localeCompare(normalizeDate(b.date)))]));
    const dateMatch=new Map();
    const assign=(type,seenTypes,seenDates)=>{
      if(seenTypes.has(type))return false;
      seenTypes.add(type);
      for(const candidate of candidates.get(type)||[]){
        const date=normalizeDate(candidate.date);
        if(seenDates.has(date))continue;
        seenDates.add(date);
        const occupied=dateMatch.get(date);
        if(!occupied||assign(occupied.taskType,seenTypes,seenDates)){dateMatch.set(date,candidate);return true}
      }
      return false;
    };
    [...candidates.keys()].sort((a,b)=>candidates.get(a).length-candidates.get(b).length).forEach(type=>assign(type,new Set(),new Set()));
    const usedDates=new Set(dateMatch.keys()),remainingByDate=new Map();
    groupRecords.forEach(r=>{
      const date=normalizeDate(r.date);
      if(!date||usedDates.has(date))return;
      const current=remainingByDate.get(date);
      if(!current||quality(r)>quality(current))remainingByDate.set(date,r);
    });
    const matched=[...dateMatch.values()];
    const remaining=[...remainingByDate.values()].sort((a,b)=>quality(b)-quality(a)||normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
    const limit=group==='optional'?Number.POSITIVE_INFINITY:10;
    [...matched,...remaining.slice(0,Math.max(0,limit-matched.length))].forEach(r=>result.set(r.id,true));
  });
  return result;
}
function resolveTask(record) {
  const directId=String(record.taskType??'').trim();
  const byId=TASKS.find(task=>task.id===directId);
  if(byId)return byId;
  const savedName=String(record.taskName??'').trim().toLocaleLowerCase('tr-TR');
  return TASKS.find(task=>task.name.toLocaleLowerCase('tr-TR')===savedName)||null;
}
function taskHeading(record) {
  const task=resolveTask(record);
  if(task)return `${task.id}. ${task.name}`;
  const id=String(record.taskType??'').trim(),name=String(record.taskName??'').trim();
  if(id&&name)return `${id}. ${name}`;
  return name||'İş türü belirtilmemiş';
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
function render() {
  populateTaskTypes($('group').value,$('taskType').value);
  const monthly=monthRecords(),duplicates=duplicateDateInfo(monthly),eligible=eligibility(monthly);
  const usable=monthly.filter(r=>eligible.get(r.id)!==false);
  const days=new Set(usable.map(r=>normalizeDate(r.date)).filter(Boolean)).size;
  const complete=usable.filter(r=>validation(r).length===0&&r.document).length;
  const hours=usable.reduce((sum,r)=>sum+Number(r.duration||0),0);
  const duplicateDays=duplicates.duplicateDates.size;
  $('metrics').innerHTML=[
    ['Bu ay kullanılabilir',usable.length,usable.length>=40?'good':'warn'],
    ['Farklı gün',`${days} / 13`,days>=12?'good':'warn'],
    ['Mükerrer gün',duplicateDays,duplicateDays===0?'good':'bad'],
    ['Belgeli ve uygun',complete,complete===usable.length&&complete>0?'good':'warn'],
    ['Toplam süre',`${hours.toLocaleString('tr-TR',{maximumFractionDigits:2})} sa.`,hours>0?'good':'warn']
  ].map(([label,value,status])=>`<div class="metric ${status}"><span>${label}</span><strong>${value}</strong></div>`).join('');

  $('compliance').innerHTML=['1','2','3','4','optional'].map(group=>{
    const items=usable.filter(r=>(resolveTask(r)?.group||r.group)===group);
    const types=new Set(items.map(r=>String(r.taskType||resolveTask(r)?.id||'')).filter(Boolean));
    const expected=TASKS.filter(t=>t.group===group),missing=expected.filter(t=>!types.has(t.id));
    const ok=group==='optional'?items.length>0:items.length>=10&&!missing.length;
    const detail=group==='optional'?`${items.length} iş · zorunlu değil`:`${items.length}/10 iş · ${missing.length?`${missing.length} tür eksik`:'tüm türler mevcut'}`;
    return `<article class="group-card ${ok?'ok':''}" title="${esc(missing.map(t=>t.name).join(', '))}"><strong>${group==='optional'?'Optional':`Grup ${group}`}</strong><span>${detail}</span></article>`;
  }).join('');

  const records=filteredRecords().sort((a,b)=>{
    const dateOrder=normalizeDate(b.date).localeCompare(normalizeDate(a.date));
    if(dateOrder)return dateOrder;
    const duplicateOrder=Number(duplicates.duplicateIds.has(b.id))-Number(duplicates.duplicateIds.has(a.id));
    if(duplicateOrder)return duplicateOrder;
    return String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  });
  const unopenedTasks=unopenedArchiveTasks();
  if(!records.length&&!unopenedTasks.length){
    $('records').innerHTML=`<div class="empty">${state.connected?'Bu filtreye uygun kayıt bulunamadı.':'Drive bağlantısı bekleniyor.'}</div>`;
    return;
  }
  const recordRows=records.map((r,index)=>{
    const date=normalizeDate(r.date),duplicateCount=duplicates.counts.get(date)||0,duplicateDay=duplicateCount>1;
    const usableRow=eligible.get(r.id)!==false,issues=validation(r);
    const unsuitableText='Bu iş için uygun değil - 10 işlik taslak dışında kaldı';
    const duplicateText=`Mükerrer gün: ${formatDate(date)} tarihinde ${duplicateCount} kayıt var. Bu tarihteki kayıtların hiçbiri uygun sayılmaz.`;
    const rowClass=duplicateDay?'duplicate-date':usableRow?'':'ineligible';
    return `<tr class="${rowClass}">
      <td data-label="NO">${index+1}</td>
      <td data-label="İŞ TÜRÜ / YAPILAN İŞ">
        <span class="task-type-heading">${esc(taskHeading(r))}</span>
        <strong class="task-description">${esc(taskText(r))}</strong>
        <span class="task-meta">${esc(recordGroupLabel(r))}</span>
        ${duplicateDay?`<span class="duplicate-warning">${esc(duplicateText)}</span>`:!usableRow?`<span class="unsuitable">${unsuitableText}</span>`:''}
        ${issues.length?`<span class="row-warning">${issues.length} eksik bilgi</span>`:''}
      </td>
      <td data-label="UÇAK / KOMPONENT">${esc(r.aircraft||'-')}</td>
      <td data-label="TARİH">${esc(formatDate(r.date)||'-')}</td>
      <td data-label="SÜRE">${formatDuration(r.duration)}</td>
      <td data-label="İŞLEM"><div class="record-actions">${r.document?`<button class="icon" data-document="${esc(r.document.id)}">Belge</button>`:''}<button class="icon" data-edit="${esc(r.id)}">Düzenle</button><button class="icon danger" data-delete="${esc(r.id)}">Sil</button></div></td>
    </tr>`;
  }).join('');
  const unopenedRows=unopenedTasks.map(task=>`<tr class="unopened-archive-row">
    <td data-label="NO">—</td>
    <td data-label="İŞ TÜRÜ / YAPILAN İŞ"><span class="task-type-heading">${task.id}. ${esc(task.name)}</span><span class="unopened-archive-note">Tüm kayıt geçmişinde henüz açılmadı · ${taskGroupLabel(task)}</span></td>
    <td data-label="UÇAK / KOMPONENT">—</td><td data-label="TARİH">—</td><td data-label="SÜRE">—</td>
    <td data-label="İŞLEM"><span class="unopened-archive-status">Kayıt yok</span></td>
  </tr>`).join('');
  $('records').innerHTML=`<div class="table-wrap"><table class="ojt-table"><thead><tr><th>NO</th><th>İŞ TÜRÜ / YAPILAN İŞ <em>TASK TYPE / TASKS PERFORMED</em></th><th>UÇAK / ATÖLYE / KOMPONENT</th><th>TARİH</th><th>SÜRE</th><th>İŞLEM</th></tr></thead><tbody>${recordRows}${unopenedRows}</tbody></table></div>`;
}
async function load() {
  $('authButton').textContent=state.connected?'Bağlantıyı kes':'Drive’a bağlan';$('syncStatus').textContent=state.connected?`● ${state.user?.email||'Google Drive bağlı'}`:'Drive bağlı değil';
  if(!CLIENT_ID||CLIENT_ID.startsWith('BURAYA_')){$('setupNotice').classList.remove('hidden');$('setupNotice').innerHTML='<strong>Google Client ID gerekli.</strong> public/config.js dosyasındaki örnek değeri Google Cloud Web Client ID ile değiştirin.'}else $('setupNotice').classList.add('hidden');
  if(!state.connected){$('notes').disabled=true;render();return}
  const [records,notes]=await Promise.all([readJson(DATA_FILE,[]),readJson(NOTES_FILE,{text:'',updatedAt:null})]);
  state.records=Array.isArray(records)?records:[];$('notes').value=notes.text||'';$('notes').disabled=false;$('notesStatus').textContent='Drive ile eşitlendi';render();
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
  const sameDay=state.records.filter(item=>item.id!==record.id&&normalizeDate(item.date)===record.date);
  if(record.date&&sameDay.length){
    alert(`${formatDate(record.date)} tarihinde zaten ${sameDay.length} kayıt bulunuyor.\n\nMükerrer günlere izin verilmez. Kaydı oluşturmak için farklı bir tarih seçin veya mevcut kaydın tarihini düzeltin.`);
    $('date').focus();
    return;
  }
  const issues=validation(record);
  if(issues.length&&!confirm(`Bu kayıtta eksikler var:\n\n• ${issues.join('\n• ')}\n\nYine de kaydedilsin mi?`))return;
  const button=event.submitter;
  button.disabled=true;
  button.textContent='Kaydediliyor…';
  try{await saveRecord(record,$('document').files[0]);toast('Kayıt Drive’a kaydedildi.');reset();render()}catch(error){toast(error.message)}finally{button.disabled=false;button.textContent='Kaydı Drive’a kaydet'}
});
function reset(){$('recordForm').reset();$('recordId').value='';$('date').value=new Date().toISOString().slice(0,10);$('group').value='1';populateTaskTypes('1');updateStampVisibility()}
$('resetButton').addEventListener('click',reset); $('search').addEventListener('input',render); $('month').addEventListener('change',render);
$('records').addEventListener('click',async event=>{
  const edit=event.target.dataset.edit,del=event.target.dataset.delete,documentId=event.target.dataset.document;
  if(documentId){try{await openDocument(documentId)}catch(error){toast(error.message)}}
  if(edit){const r=state.records.find(x=>x.id===edit);$('group').value=r.group||'1';populateTaskTypes($('group').value,r.taskType||'');fields.filter(id=>!['group','taskType'].includes(id)).forEach(id=>{if(id==='stamp')$(id).checked=Boolean(r[id]);else if(id==='duration')$(id).value=String(r[id]??'').replace('.',',');else if(id==='date')$(id).value=normalizeDate(r[id]);else $(id).value=r[id]??''});$('recordId').value=r.id;updateStampVisibility();scrollTo({top:0,behavior:'smooth'})}
  if(del&&confirm('Kayıt ve bağlı belge Google Drive’dan silinsin mi?')){try{await deleteRecord(del);toast('Kayıt silindi.');render()}catch(error){toast(error.message)}}
});
$('notes').addEventListener('input',()=>{if(!state.connected)return;clearTimeout(state.notesTimer);$('notesStatus').textContent='Kaydediliyor…';state.notesTimer=setTimeout(async()=>{try{await writeJson(NOTES_FILE,{text:$('notes').value.slice(0,50000),updatedAt:new Date().toISOString()});$('notesStatus').textContent='Drive’a kaydedildi'}catch(error){$('notesStatus').textContent='Kaydedilemedi';toast(error.message)}},700)});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
(async()=>{try{if(restoreToken())await loadUser();await load()}catch(error){clearToken();state.user=null;await load();toast(error.message)}})();
