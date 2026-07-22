const STORAGE_KEY = 'icsswh-occupational-exposures-v1';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const form = $('#accidentForm');
let currentStep = 0;
let selectedId = null;

const resultOptions = ['บวก', 'ลบ', 'ไม่ทราบ', 'ไม่ได้ตรวจ'];
const sourceLabNames = [['sourceHiv','Anti HIV'],['sourceHbsAg','HBs Ag'],['sourceHcv','Anti HCV']];
const staffLabNames = [['staffHiv','Anti HIV'],['staffHbsAg','HBs Ag'],['staffAntiHbs','Anti HBs'],['staffHcv','Anti HCV']];
const consentNames = [['understandsTesting','ทราบข้อดีและข้อเสียของการตรวจเลือด'],['consentBloodTest','ยินยอมให้ตรวจเลือด'],['consentHivPep','ยินดีรับการรักษาเบื้องต้นเพื่อป้องกัน HIV'],['consentHbvPep','ยินดีรับการรักษาเบื้องต้นเพื่อป้องกัน Hepatitis B']];
const baselineNames = [['hemoglobin','Hemoglobin (mg%)'],['hematocrit','Hematocrit (vol%)'],['redCellMorphology','Red cell morphology'],['plateletCount','Platelet count'],['wbc','WBC count / cu.mm.'],['neutrophil','Neutrophil (%)'],['lymphocyte','Lymphocyte (%)'],['monocyte','Monocyte (%)'],['basophil','Basophil (%)'],['eosinophil','Eosinophil (%)'],['bandForm','Band form (%)'],['creatinine','Creatinine (mg/dl)'],['sgpt','SGPT / ALT (U/L)'],['sgot','SGOT / AST (U/L)']];

function segmented(name, options = resultOptions) { return `<div class="segmented">${options.map(o => `<label><input type="radio" name="${name}" value="${o}"><span>${o}</span></label>`).join('')}</div>`; }
function buildDynamicFields() {
  $('#sourceLabs').innerHTML = sourceLabNames.map(([n,l]) => `<div class="lab-item"><span>${l}</span>${segmented(n)}</div>`).join('');
  $('#staffLabs').innerHTML = staffLabNames.map(([n,l]) => `<div class="lab-item"><span>${l}</span>${segmented(n)}</div>`).join('');
  $('#consents').innerHTML = consentNames.map(([n,l]) => `<div class="consent-row"><span>${l}</span>${segmented(n,['ใช่','ไม่ใช่'])}</div>`).join('');
  $('#baselineLabs').innerHTML = baselineNames.map(([n,l]) => `<label>${l}<input name="${n}"></label>`).join('');
  const groups = [{m:'1',labs:[['HIV','Anti HIV'],['HCV','Anti HCV']]},{m:'3',labs:[['HIV','Anti HIV']]},{m:'6',labs:[['HIV','Anti HIV'],['HbsAg','HBsAg'],['HCV','Anti HCV']]}];
  $('#followups').innerHTML = groups.map(g => `<section class="followup"><h3>เดือนที่ ${g.m} หลังเกิดอุบัติเหตุ</h3><div class="grid cols-2"><label>วันที่ตรวจ<input type="date" name="follow${g.m}Date"></label><label>เหตุผลที่ไม่ได้ตรวจ<input name="follow${g.m}Reason"></label></div><div class="lab-grid">${g.labs.map(([k,l])=>`<div class="lab-item"><span>${l}</span>${segmented(`follow${g.m}${k}`)}</div>`).join('')}</div></section>`).join('');
}

function records() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function persist(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function esc(v='') { return String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function thaiDate(v) { if(!v) return '—'; return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium'}).format(new Date(`${v}T00:00:00`)); }
function isComplete(r) { return Boolean(r.follow6Date && (r.follow6HIV || r.follow6HbsAg || r.follow6HCV)); }
function exposureLabel(r) { const value = Array.isArray(r.exposureType) ? r.exposureType.join(', ') : r.exposureType; return value || 'ไม่ระบุ'; }
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2600); }

function renderDashboard(query='') {
  const items = records().sort((a,b)=>(b.incidentDate||'').localeCompare(a.incidentDate||''));
  const q=query.trim().toLowerCase();
  const filtered=items.filter(r=>[r.staffName,r.staffHn,r.soundex,r.location,r.incidentDescription].join(' ').toLowerCase().includes(q));
  $('#statTotal').textContent=items.length;
  $('#statPending').textContent=items.filter(r=>!isComplete(r)).length;
  const ym=new Date().toISOString().slice(0,7); $('#statMonth').textContent=items.filter(r=>(r.createdAt||'').slice(0,7)===ym).length;
  $('#recordRows').innerHTML=filtered.map(r=>`<tr><td><b>${thaiDate(r.incidentDate)}</b><small>${esc(r.incidentTime||'')} น.</small></td><td><b>${esc(r.staffName||'ไม่ระบุชื่อ')}</b><small>${esc(r.staffType||'')} ${r.staffHn?'• HN '+esc(r.staffHn):''}</small></td><td>${esc(exposureLabel(r))}<small>${esc(r.location||'')}</small></td><td><span class="status ${isComplete(r)?'done':''}">${isComplete(r)?'ติดตามครบ':'รอติดตาม'}</span></td><td class="row-actions"><button data-view="${r.id}">ดูรายละเอียด →</button></td></tr>`).join('');
  $('#emptyState').classList.toggle('show',filtered.length===0);
}
function showView(name){ $$('.view').forEach(v=>v.classList.toggle('active',v.id===name)); window.scrollTo({top:0}); }
function showStep(n){ currentStep=Math.max(0,Math.min(4,n)); $$('.form-page').forEach((p,i)=>p.classList.toggle('active',i===currentStep)); $$('#steps button').forEach((b,i)=>b.classList.toggle('active',i===currentStep)); $('#prevBtn').classList.toggle('hidden',currentStep===0); $('#nextBtn').classList.toggle('hidden',currentStep===4); $('#saveBtn').classList.toggle('hidden',currentStep!==4); $('#stepLabel').textContent=`ขั้นตอน ${currentStep+1} จาก 5`; window.scrollTo({top:0,behavior:'smooth'}); }
function resetForm(){ form.reset(); form.department.value='โรงพยาบาลศรีสังวรสุโขทัย'; form.id.value=''; $('#formTitle').textContent='บันทึกเหตุการณ์ใหม่'; $('#saveState').textContent='ยังไม่บันทึก'; showStep(0); }
function formDataObject(){ const fd=new FormData(form), out={}; for(const [k,v] of fd){ if(k==='exposureType'){ (out[k]??=[]).push(v); } else out[k]=v.trim?.()??v; } if(!out.exposureType) out.exposureType=[]; return out; }
function fillForm(record){ resetForm(); Object.entries(record).forEach(([k,v])=>{ const els=$$(`[name="${CSS.escape(k)}"]`,form); if(!els.length)return; if(Array.isArray(v)){ els.forEach(e=>e.checked=v.includes(e.value)); } else if(els[0].type==='radio'){ els.forEach(e=>e.checked=e.value===v); } else els[0].value=v??''; }); $('#formTitle').textContent='แก้ไขบันทึกเหตุการณ์'; $('#saveState').textContent=`แก้ไขล่าสุด ${thaiDate((record.updatedAt||record.createdAt||'').slice(0,10))}`; }
function validateStep(){ const page=$$('.form-page')[currentStep]; const required=$$('input[required],textarea[required],select[required]',page); for(const el of required){ if(!el.checkValidity()){ el.reportValidity(); return false; } } return true; }

function detailHtml(r){ const item=(label,value)=>`<div><b>${label}</b>${esc(value||'—')}</div>`; const labs=(pairs)=>pairs.map(([k,l])=>item(l,r[k])).join(''); return `<span class="eyebrow">INCIDENT RECORD</span><h2 class="detail-title">${esc(r.staffName||'ไม่ระบุชื่อ')}</h2><div class="detail-meta">${thaiDate(r.incidentDate)} เวลา ${esc(r.incidentTime||'—')} น. • ${esc(r.location||'ไม่ระบุสถานที่')}</div><section class="detail-section"><h4>ข้อมูลเหตุการณ์</h4><div class="detail-grid">${item('HN บุคลากร',r.staffHn)}${item('Soundex',r.soundex)}${item('ประเภทบุคลากร',r.staffType)}${item('ลักษณะอุบัติเหตุ',exposureLabel(r))}${item('อวัยวะที่สัมผัส',r.bodySite)}${item('การปฐมพยาบาล',r.firstAid)}</div><p>${esc(r.incidentDescription||'')}</p></section><section class="detail-section"><h4>ผู้ป่วยต้นเหตุ</h4><div class="detail-grid">${item('ชื่อ / HN',[r.sourceName,r.sourceHn].filter(Boolean).join(' / '))}${labs(sourceLabNames)}</div></section><section class="detail-section"><h4>ผลบุคลากร Day 0</h4><div class="detail-grid">${labs(staffLabNames)}</div></section><section class="detail-section"><h4>การรักษา</h4><div class="detail-grid">${item('สูตรยา',r.pepRegimen)}${item('ขนาดยา',r.pepDose)}${item('เริ่มยา',thaiDate(r.pepStart))}${item('ผลการรับประทาน',r.pepOutcome)}</div></section><section class="detail-section"><h4>การติดตาม</h4><div class="detail-grid">${item('เดือนที่ 1',`${thaiDate(r.follow1Date)} • HIV ${r.follow1HIV||'—'} • HCV ${r.follow1HCV||'—'}`)}${item('เดือนที่ 3',`${thaiDate(r.follow3Date)} • HIV ${r.follow3HIV||'—'}`)}${item('เดือนที่ 6',`${thaiDate(r.follow6Date)} • HIV ${r.follow6HIV||'—'} • HBsAg ${r.follow6HbsAg||'—'} • HCV ${r.follow6HCV||'—'}`)}</div></section>`; }

function download(filename, content, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff',content],{type})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }
function csvExport(){ const items=records(); if(!items.length)return toast('ยังไม่มีข้อมูลสำหรับส่งออก'); const columns=['incidentDate','incidentTime','staffName','staffHn','soundex','staffType','location','exposureType','bodySite','sourceHiv','sourceHbsAg','sourceHcv','staffHiv','staffHbsAg','staffAntiHbs','staffHcv','pepRegimen','pepStart','follow1HIV','follow1HCV','follow3HIV','follow6HIV','follow6HbsAg','follow6HCV']; const quote=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`; download(`occupational-exposure-${new Date().toISOString().slice(0,10)}.csv`,[columns.join(','),...items.map(r=>columns.map(c=>quote(r[c])).join(','))].join('\n'),'text/csv;charset=utf-8'); }

buildDynamicFields(); renderDashboard();
function goHome(){ showView('home'); }
function openRecords(){ showView('dashboard'); renderDashboard($('#search').value); }
$('#homeLink').onclick=goHome;
$('#homeLink').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome();}};
$('#dashHome').onclick=goHome;
$$('.menu-card').forEach(card=>card.onclick=()=>{const go=card.dataset.go; if(go==='new'){resetForm();showView('editor');} else if(go==='records'){openRecords();}});
$('#newRecord').onclick=()=>{resetForm();showView('editor')};
$('#backBtn').onclick=()=>{showView('dashboard');renderDashboard($('#search').value)};
$('#nextBtn').onclick=()=>{if(validateStep())showStep(currentStep+1)};
$('#prevBtn').onclick=()=>showStep(currentStep-1);
$$('#steps button').forEach(b=>b.onclick=()=>showStep(Number(b.dataset.step)));
$('#search').oninput=e=>renderDashboard(e.target.value);
form.onsubmit=e=>{e.preventDefault(); const data=formDataObject(), list=records(), now=new Date().toISOString(); if(data.id){const i=list.findIndex(r=>r.id===data.id); data.createdAt=list[i]?.createdAt||now; data.updatedAt=now; if(i>=0)list[i]=data; else list.push(data);}else{data.id=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;data.createdAt=now;data.updatedAt=now;list.push(data)} persist(list); toast('บันทึกข้อมูลเรียบร้อย'); showView('dashboard'); renderDashboard();};
$('#recordRows').onclick=e=>{const btn=e.target.closest('[data-view]');if(!btn)return;selectedId=btn.dataset.view;const r=records().find(x=>x.id===selectedId);if(r){$('#detailContent').innerHTML=detailHtml(r);$('#detailDialog').showModal();}};
$('.dialog-close').onclick=()=>$('#detailDialog').close();
$('#editRecord').onclick=()=>{const r=records().find(x=>x.id===selectedId);if(r){$('#detailDialog').close();fillForm(r);showView('editor')}};
$('#deleteRecord').onclick=()=>{if(!confirm('ยืนยันการลบรายการนี้? ข้อมูลที่ลบไม่สามารถกู้คืนได้'))return;persist(records().filter(r=>r.id!==selectedId));$('#detailDialog').close();renderDashboard();toast('ลบรายการแล้ว')};
$('#printRecord').onclick=()=>window.print();
$('#exportJson').onclick=()=>{const data=records();if(!data.length)return toast('ยังไม่มีข้อมูลสำหรับสำรอง');download(`occupational-exposure-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json')};
$('#exportCsv').onclick=csvExport;
