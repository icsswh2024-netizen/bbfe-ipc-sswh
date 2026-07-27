const STORAGE_KEY = 'icsswh-occupational-exposures-v1';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const form = $('#accidentForm');
let currentStep = 0;
let selectedId = null;

// ---- Dropdown options (loaded from a public Google Sheet, with built-in fallback) ----
const SHEET_ID = '1MREAXB4CB5LMKc5LliTep45iUahomoYnid3JABh-bxM';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=index`;
const FIELDS_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=fields`;
const OPT_CACHE_KEY = 'icsswh-options-cache-v1';
const FIELDS_CACHE_KEY = 'icsswh-fields-cache-v1';
const DEFAULT_OPTIONS = {
  department: ['กลุ่มงานการพยาบาลด้านการควบคุมและป้องกันการติดเชื้อ', 'งานจ่ายกลาง', 'ห้องผ่าตัด', 'ตรวจรักษาพิเศษ (Scope)', 'สูติกรรม/นรีเวชกรรม', 'วิสัญญี', 'ตรวจรักษาพิเศษ (เคมีบำบัด)', 'ผู้ป่วยนอก ชั้น 1', 'ผู้ป่วยนอก ชั้น 2', 'อุบัติเหตุและฉุกเฉิน', 'ศูนย์เปล', 'ผู้ป่วยหนัก', 'อายุรกรรมชาย', 'โรคหลอดเลือดสมอง', 'อายุรกรรมหญิง', 'ศัลยกรรมชาย', 'ศัลยกรรมหญิง', 'Cohort', 'กุมารเวชกรรม', 'ทารกวิกฤต', 'หอผู้ป่วยพิเศษ 6/1', 'หอผู้ป่วยพิเศษ 6/2', 'หอผู้ป่วยพิเศษ 6/3', 'หอผู้ป่วยพิเศษ 6/4', 'หอผู้ป่วยพิเศษ 6/5', 'จิตต์โกศล', 'รพ.สต.', 'อื่นๆ'],
  workGroup: ['กลุ่มงานการพยาบาล', 'องค์กรแพทย์', 'กลุ่มงานทันตกรรม', 'กลุ่มงานรังสีวิทยา (ไม่รวมแพทย์)', 'กลุ่มงานเทคนิคการแพทย์และพยาธิวิทยาคลินิก', 'งานซักฟอก', 'งานศูนย์สะอาด', 'กลุ่มงานเวชกรรมสังคม', 'กลุ่มงานอาชีวเวชกรรม', 'กลุ่มงานการแพทย์แผนไทยฯ', 'กลุ่มงานเภสัชกรรม', 'กลุ่มงานเวชกรรมฟื้นฟู', 'กลุ่มงานจิตเวชและยาเสพติด', 'สสอ.ศรีสำโรง', 'อื่นๆ'],
  staffType: ['พยาบาลวิชาชีพ', 'ช่างตัดเย็บผ้า', 'ช่างทันตกรรม', 'ทันตแพทย์', 'นักกายภาพบำบัด', 'นักกิจกรรมบำบัด', 'นักจิตวิทยาคลินิก', 'นักรังสีการแพทย์', 'นักวิชาการสาธารณสุข', 'นักวิทยาศาสตร์การแพทย์', 'นักเทคนิคการแพทย์', 'นักเทคโนโลยีหัวใจและทรวงอก', 'นายแพทย์', 'ผู้ช่วยทันตแพทย์', 'ผู้ช่วยนักกายภาพบำบัด', 'ผู้ช่วยพยาบาล', 'ผู้ช่วยแพทย์แผนไทยด้านการนวดไทย', 'พนักงานการแพทย์และรังสี', 'พนักงานช่วยการพยาบาล', 'พนักงานช่วยเหลือคนไข้', 'พนักงานซักฟอก', 'พนักงานบริการ', 'พนักงานบริการทำความสะอาด', 'พนักงานประจำห้องทดลอง', 'พนักงานวิทยาศาสตร์', 'พยาบาลเทคนิค', 'เจ้าพนักงานวิทยาศาสตร์การแพทย์', 'เจ้าพนักงานเภสัชกรรม', 'เภสัชกร', 'แพทย์แผนไทย', 'อื่นๆ'],
  gender: ['หญิง', 'ชาย', 'ไม่ระบุ'],
  sharpType: ['มีด', 'แก้ว', 'เข็มมีรู', 'เข็มแบบตัน', 'อื่น ๆ'],
  riskHistory: ['มี', 'ไม่มี', 'ไม่ทราบ', 'ไม่ได้ถาม'],
  pepRegimen: ['TDF/3TC/DTG', 'AZT/3TC/DTG', 'อื่น ๆ'],
  pepOutcome: ['ครบ 4 สัปดาห์ ไม่มีผลข้างเคียง', 'ครบ 4 สัปดาห์ มีผลข้างเคียง', 'รับประทานไม่ครบ'],
  testResult: ['บวก', 'ลบ', 'ไม่ทราบ', 'ไม่ได้ตรวจ'],
  consent: ['ใช่', 'ไม่ใช่'],
};
// Thai column headers in the sheet -> internal option key (compared lower-cased & trimmed)
const HEADER_MAP = {
  'ชื่อหน่วยงาน': 'department', 'ชื่อกลุ่มงาน': 'workGroup', 'ตำแหน่ง': 'staffType',
  'เพศ': 'gender', 'ประเภทบุคลากร': 'staffType', 'ชนิดของแหลมคม': 'sharpType',
  'ประวัติพฤติกรรมเสี่ยง': 'riskHistory', 'สูตรยา pep': 'pepRegimen',
  'ผลการรับประทานยา': 'pepOutcome', 'ผลตรวจเลือด': 'testResult', 'ความยินยอม': 'consent',
};
// <select> fields -> option key + its leading placeholder (kept as the first option)
const SELECT_FIELDS = [
  { name: 'department', key: 'department', placeholder: 'เลือกหน่วยงาน' },
  { name: 'workGroup', key: 'workGroup', placeholder: 'เลือกกลุ่มงาน' },
  { name: 'gender', key: 'gender', placeholder: 'เลือก' },
  { name: 'staffType', key: 'staffType', placeholder: 'เลือกตำแหน่ง' },
  { name: 'sharpType', key: 'sharpType', placeholder: 'ไม่เกี่ยวข้อง' },
  { name: 'sourceRisk', key: 'riskHistory', placeholder: 'เลือก' },
  { name: 'staffRisk', key: 'riskHistory', placeholder: 'เลือก' },
  { name: 'pepRegimen', key: 'pepRegimen', placeholder: 'ไม่ได้รับยา' },
  { name: 'pepOutcome', key: 'pepOutcome', placeholder: 'เลือก' },
];
function loadCachedOptions() { try { return JSON.parse(localStorage.getItem(OPT_CACHE_KEY)) || {}; } catch { return {}; } }
let OPTIONS = { ...DEFAULT_OPTIONS, ...loadCachedOptions() };
// Per-field config from the "fields" sheet tab: { fieldKey: {label, options[], required} }
function loadCachedFields() { try { return JSON.parse(localStorage.getItem(FIELDS_CACHE_KEY)) || {}; } catch { return {}; } }
let FIELD_CFG = loadCachedFields();
function fieldOptions(name) { const c = FIELD_CFG[name]; return (c && c.options && c.options.length) ? c.options : null; }

const sourceLabNames =[['sourceHiv','Anti HIV'],['sourceHbsAg','HBs Ag'],['sourceHcv','Anti HCV']];
const staffLabNames = [['staffHiv','Anti HIV'],['staffHbsAg','HBs Ag'],['staffAntiHbs','Anti HBs'],['staffHcv','Anti HCV']];
const consentNames = [['understandsTesting','ทราบข้อดีและข้อเสียของการตรวจเลือด'],['consentBloodTest','ยินยอมให้ตรวจเลือด'],['consentHivPep','ยินดีรับการรักษาเบื้องต้นเพื่อป้องกัน HIV'],['consentHbvPep','ยินดีรับการรักษาเบื้องต้นเพื่อป้องกัน Hepatitis B']];
const baselineNames = [['hemoglobin','Hemoglobin (mg%)'],['hematocrit','Hematocrit (vol%)'],['redCellMorphology','Red cell morphology'],['plateletCount','Platelet count'],['wbc','WBC count / cu.mm.'],['neutrophil','Neutrophil (%)'],['lymphocyte','Lymphocyte (%)'],['monocyte','Monocyte (%)'],['basophil','Basophil (%)'],['eosinophil','Eosinophil (%)'],['bandForm','Band form (%)'],['creatinine','Creatinine (mg/dl)'],['sgpt','SGPT / ALT (U/L)'],['sgot','SGOT / AST (U/L)']];

function segmented(name, options) { options = options || OPTIONS.testResult; return `<div class="segmented">${options.map(o => `<label><input type="radio" name="${name}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join('')}</div>`; }
function buildDynamicFields() {
  $('#sourceLabs').innerHTML = sourceLabNames.map(([n,l]) => `<div class="lab-item"><span>${l}</span>${segmented(n)}</div>`).join('');
  $('#staffLabs').innerHTML = staffLabNames.map(([n,l]) => `<div class="lab-item"><span>${l}</span>${segmented(n)}</div>`).join('');
  $('#consents').innerHTML = consentNames.map(([n,l]) => `<div class="consent-row"><span>${l}</span>${segmented(n,OPTIONS.consent)}</div>`).join('');
  $('#baselineLabs').innerHTML = baselineNames.map(([n,l]) => `<label>${l}<input name="${n}"></label>`).join('');
  const groups = [{m:'1',labs:[['HIV','Anti HIV'],['HCV','Anti HCV']]},{m:'3',labs:[['HIV','Anti HIV']]},{m:'6',labs:[['HIV','Anti HIV'],['HbsAg','HBsAg'],['HCV','Anti HCV']]}];
  $('#followups').innerHTML = groups.map(g => `<section class="followup"><h3>เดือนที่ ${g.m} หลังเกิดอุบัติเหตุ</h3><div class="grid cols-2"><label>วันที่ตรวจ<input type="date" name="follow${g.m}Date"></label><label>เหตุผลที่ไม่ได้ตรวจ<input name="follow${g.m}Reason"></label></div><div class="lab-grid">${g.labs.map(([k,l])=>`<div class="lab-item"><span>${l}</span>${segmented(`follow${g.m}${k}`)}</div>`).join('')}</div></section>`).join('');
}

function populateSelects() {
  SELECT_FIELDS.forEach(f => {
    const el = form.elements[f.name]; if (!el || !el.tagName) return;
    const cur = el.value;
    const opts = fieldOptions(f.name) || OPTIONS[f.key] || [];
    el.innerHTML = `<option value="">${esc(f.placeholder)}</option>` + opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    if (cur && ![...el.options].some(o => o.value === cur)) el.add(new Option(cur, cur));
    el.value = cur;
  });
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function optionsFromRows(rows) {
  if (!rows || rows.length < 2) return null;
  const keys = rows[0].map(h => HEADER_MAP[String(h).trim().toLowerCase()] || null);
  const cols = {};
  for (let r = 1; r < rows.length; r++) {
    keys.forEach((key, ci) => {
      if (!key) return;
      const v = (rows[r][ci] || '').trim();
      if (v) { (cols[key] ??= []); if (!cols[key].includes(v)) cols[key].push(v); }
    });
  }
  return Object.keys(cols).length ? cols : null;
}
function refreshOptionUI() { buildDynamicFields(); populateSelects(); addDynamicFields(); applyFieldConfig(); applySectionTitles(); }
const PAGE_BY_SECTION = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
function renderField(f) {
  const label = esc(f.label || f.key), name = esc(f.key), t = f.type || 'text';
  const req = f.required ? ' required' : '';
  if (t === 'select') { const opts = fieldOptions(f.key) || f.options || OPTIONS[f.key] || []; return `<label class="dyn-extra">${label}<select name="${name}"${req}><option value="">เลือก</option>${opts.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label>`; }
  if (t === 'textarea') { return `<label class="wide dyn-extra">${label}<textarea name="${name}" rows="3"${req}></textarea></label>`; }
  if (t === 'radio') { const opts = f.options || OPTIONS.testResult; return `<div class="lab-item wide dyn-extra"><span>${label}</span>${segmented(name, opts)}</div>`; }
  if (t === 'checkbox') { MULTI_FIELDS.add(f.key); const opts = f.options || []; return `<fieldset class="wide dyn-extra"><legend>${label}</legend><div class="choice-grid">${opts.map(o => `<label class="choice"><input type="checkbox" name="${name}" value="${esc(o)}"><span><b>${esc(o)}</b></span></label>`).join('')}</div></fieldset>`; }
  const it = (t === 'number' || t === 'date' || t === 'time') ? t : 'text';
  return `<label class="dyn-extra">${label}<input name="${name}" type="${it}"${req}></label>`;
}
// The wrapping element of an existing field with the largest order <= the new field's order (same section)
function referenceElementFor(f) {
  const cand = Object.entries(FIELD_CFG)
    .filter(([k, c]) => c.type !== 'section' && String(c.section) === String(f.section) && k !== f.key && form.elements[k] && form.elements[k].tagName && (c.order || 0) <= (f.order || 0))
    .sort((a, b) => (b[1].order || 0) - (a[1].order || 0));
  for (const [k] of cand) { const w = form.elements[k].closest('label,fieldset,.lab-item'); if (w) return w; }
  return null;
}
// Create form controls for sheet keys that have no matching field in the static form, inserted by ลำดับ
function addDynamicFields() {
  $$('.dyn-extra').forEach(n => n.remove());
  const news = Object.entries(FIELD_CFG)
    .filter(([k, c]) => c.type !== 'section' && !form.elements[k])
    .map(([k, c]) => ({ key: k, ...c }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  news.forEach(f => {
    const page = $$('.form-page')[PAGE_BY_SECTION[String(f.section)] ?? 0];
    if (!page) return;
    const ref = referenceElementFor(f);
    if (ref) { ref.insertAdjacentHTML('afterend', renderField(f)); }
    else { // no earlier field to anchor to -> start of the page's first grid, else end of page
      const grid = page.querySelector('.grid');
      if (grid) grid.insertAdjacentHTML('afterbegin', renderField(f));
      else page.insertAdjacentHTML('beforeend', renderField(f));
    }
  });
}
// Override section headings (title + subtitle) from rows whose ประเภท = "section"
function applySectionTitles() {
  Object.values(FIELD_CFG).forEach(c => {
    if (c.type !== 'section' || !c.section) return;
    const page = $$('.form-page')[PAGE_BY_SECTION[String(c.section)]];
    if (!page) return;
    const h2 = page.querySelector('.section-title h2'), pEl = page.querySelector('.section-title p');
    if (c.label && h2) h2.textContent = c.label;
    if (pEl && c.options && c.options.length) pEl.textContent = c.options.join(' ');
  });
}
function parseFieldsRows(rows) {
  if (!rows || rows.length < 2) return null;
  const H = rows[0].map(h => String(h).trim());
  const ck = H.indexOf('key'), cl = H.indexOf('คำถาม'), co = H.indexOf('ตัวเลือก'), cr = H.indexOf('จำเป็น'), cs = H.indexOf('ส่วน'), cn = H.indexOf('ลำดับ'), ct = H.indexOf('ประเภท');
  if (ck < 0) return null;
  const cfg = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r], key = (row[ck] || '').trim(); if (!key) continue;
    const c = {};
    if (cl >= 0) { const l = (row[cl] || '').trim(); if (l) c.label = l; }
    if (co >= 0) { const raw = (row[co] || '').trim(); if (raw && raw !== '(จากรายการในชีต)') { const o = raw.split('|').map(s => s.trim()).filter(Boolean); if (o.length) c.options = o; } }
    if (cr >= 0) c.required = /^(✓|ใช่|yes|true|1|จำเป็น|y)$/i.test((row[cr] || '').trim());
    if (cs >= 0) c.section = (row[cs] || '').trim();
    if (cn >= 0) c.order = Number(row[cn]) || 0;
    if (ct >= 0) c.type = ((row[ct] || 'text').trim() || 'text').toLowerCase();
    cfg[key] = c;
  }
  return Object.keys(cfg).length ? cfg : null;
}
function applyFieldConfig() {
  Object.entries(FIELD_CFG).forEach(([key, cfg]) => {
    const el = form.elements[key];
    if (!el || !el.tagName) return; // skip radio/checkbox groups (RadioNodeList)
    if (cfg.label) {
      const lab = el.closest('label');
      if (lab) {
        const t = [...lab.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        if (t) t.textContent = cfg.label; else lab.insertBefore(document.createTextNode(cfg.label), lab.firstChild);
      }
    }
    if (cfg.required != null) el.required = !!cfg.required;
  });
}
async function loadFieldsFromSheet() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(FIELDS_CSV_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const cfg = parseFieldsRows(parseCSV(await res.text()));
    if (!cfg) return;
    FIELD_CFG = cfg;
    localStorage.setItem(FIELDS_CACHE_KEY, JSON.stringify(cfg));
    if (!$('#editor').classList.contains('active')) { populateSelects(); addDynamicFields(); applyFieldConfig(); applySectionTitles(); }
  } catch (e) { /* keep static labels / cached config */ }
}
async function loadOptionsFromSheet() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(SHEET_CSV_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const cols = optionsFromRows(parseCSV(await res.text()));
    if (!cols) return;
    OPTIONS = { ...DEFAULT_OPTIONS, ...cols };
    localStorage.setItem(OPT_CACHE_KEY, JSON.stringify(OPTIONS));
    if (!$('#editor').classList.contains('active')) refreshOptionUI(); // don't disrupt an open form
  } catch (e) { /* keep built-in defaults / cached options */ }
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
const STAFF_PAGES=[0,1,2], ADMIN_PAGES=[3,4];
let formMode='staff';
function applyMode(mode){ formMode=mode; const pages=mode==='admin'?ADMIN_PAGES:STAFF_PAGES; $$('.form-page').forEach((p,i)=>p.classList.toggle('active',pages.includes(i))); ['#steps','#prevBtn','#nextBtn'].forEach(s=>$(s).classList.add('hidden')); $('#saveBtn').classList.remove('hidden'); $('#formEyebrow').textContent=mode==='admin'?'ส่วนแอดมิน • ขั้นตอน 4-5':'FORM IC 1 • เจ้าหน้าที่ • ขั้นตอน 1-3'; $('#stepLabel').textContent=mode==='admin'?'การรักษาและติดตามผล (แอดมิน)':'กรอกข้อมูลให้ครบแล้วกดบันทึก (เจ้าหน้าที่)'; window.scrollTo({top:0}); }
function resetForm(){ form.reset(); form.id.value='';$('#formTitle').textContent='บันทึกเหตุการณ์ใหม่'; $('#saveState').textContent='ยังไม่บันทึก'; applyMode('staff'); }
let MULTI_FIELDS = new Set(['exposureType']); // fields whose value is an array (checkbox groups)
function formDataObject(){ const fd=new FormData(form), out={}; for(const [k,v] of fd){ if(MULTI_FIELDS.has(k)){ (out[k]??=[]).push(v); } else out[k]=v.trim?.()??v; } MULTI_FIELDS.forEach(k=>{ if(!out[k]) out[k]=[]; }); return out; }
function fillForm(record){ resetForm(); Object.entries(record).forEach(([k,v])=>{ const els=$$(`[name="${CSS.escape(k)}"]`,form); if(!els.length)return; if(Array.isArray(v)){ els.forEach(e=>e.checked=v.includes(e.value)); } else if(els[0].type==='radio'){ els.forEach(e=>e.checked=e.value===v); } else { if(els[0].tagName==='SELECT'&&v&&![...els[0].options].some(o=>o.value===v)) els[0].add(new Option(v,v)); els[0].value=v??''; } }); $('#formTitle').textContent='แก้ไขบันทึกเหตุการณ์'; $('#saveState').textContent=`แก้ไขล่าสุด ${thaiDate((record.updatedAt||record.createdAt||'').slice(0,10))}`; }

function detailHtml(r){ const item=(label,value)=>`<div><b>${label}</b>${esc(value||'—')}</div>`; const labs=(pairs)=>pairs.map(([k,l])=>item(l,r[k])).join(''); return `<span class="eyebrow">INCIDENT RECORD</span><h2 class="detail-title">${esc(r.staffName||'ไม่ระบุชื่อ')}</h2><div class="detail-meta">${thaiDate(r.incidentDate)} เวลา ${esc(r.incidentTime||'—')} น. • ${esc(r.location||'ไม่ระบุสถานที่')}</div><section class="detail-section"><h4>ข้อมูลเหตุการณ์</h4><div class="detail-grid">${item('HN บุคลากร',r.staffHn)}${item('Soundex',r.soundex)}${item('หน่วยงาน',r.department)}${item('กลุ่มงาน',r.workGroup)}${item('ตำแหน่ง',r.staffType)}${item('ลักษณะอุบัติเหตุ',exposureLabel(r))}${item('อวัยวะที่สัมผัส',r.bodySite)}${item('การปฐมพยาบาล',r.firstAid)}</div><p>${esc(r.incidentDescription||'')}</p></section><section class="detail-section"><h4>ผู้ป่วยต้นเหตุ</h4><div class="detail-grid">${item('ชื่อ / HN',[r.sourceName,r.sourceHn].filter(Boolean).join(' / '))}${labs(sourceLabNames)}</div></section><section class="detail-section"><h4>ผลบุคลากร Day 0</h4><div class="detail-grid">${labs(staffLabNames)}</div></section><section class="detail-section"><h4>การรักษา</h4><div class="detail-grid">${item('สูตรยา',r.pepRegimen)}${item('ขนาดยา',r.pepDose)}${item('เริ่มยา',thaiDate(r.pepStart))}${item('ผลการรับประทาน',r.pepOutcome)}</div></section><section class="detail-section"><h4>การติดตาม</h4><div class="detail-grid">${item('เดือนที่ 1',`${thaiDate(r.follow1Date)} • HIV ${r.follow1HIV||'—'} • HCV ${r.follow1HCV||'—'}`)}${item('เดือนที่ 3',`${thaiDate(r.follow3Date)} • HIV ${r.follow3HIV||'—'}`)}${item('เดือนที่ 6',`${thaiDate(r.follow6Date)} • HIV ${r.follow6HIV||'—'} • HBsAg ${r.follow6HbsAg||'—'} • HCV ${r.follow6HCV||'—'}`)}</div></section>`; }

function download(filename, content, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff',content],{type})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }
function csvExport(){ const items=records(); if(!items.length)return toast('ยังไม่มีข้อมูลสำหรับส่งออก'); const columns=['incidentDate','incidentTime','staffName','staffHn','soundex','department','workGroup','staffType','location','exposureType','bodySite','sourceHiv','sourceHbsAg','sourceHcv','staffHiv','staffHbsAg','staffAntiHbs','staffHcv','pepRegimen','pepStart','follow1HIV','follow1HCV','follow3HIV','follow6HIV','follow6HbsAg','follow6HCV']; const quote=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`; download(`occupational-exposure-${new Date().toISOString().slice(0,10)}.csv`,[columns.join(','),...items.map(r=>columns.map(c=>quote(r[c])).join(','))].join('\n'),'text/csv;charset=utf-8'); }

buildDynamicFields(); populateSelects(); addDynamicFields(); applyFieldConfig(); applySectionTitles(); renderDashboard(); loadOptionsFromSheet(); loadFieldsFromSheet();
let isAdmin=false;           // dashboard viewing mode
let editorReturn='home';     // where the editor's back/save should return to
function goHome(){ showView('home'); }
function openDashboard(admin){ isAdmin=admin; $('#adminBar').classList.toggle('hidden',!admin); $('#adminHint').classList.toggle('hidden',!admin); $('#dashEyebrow').textContent=admin?'ADMIN':'RECORDS'; $('#dashTitle').textContent=admin?'ส่วนแอดมิน — การรักษาและติดตามผล':'ทะเบียนอุบัติเหตุ'; showView('dashboard'); renderDashboard($('#search').value); }
function openStaffNew(){ editorReturn='home'; resetForm(); showView('editor'); }
function openStaffEdit(r){ editorReturn='records'; fillForm(r); applyMode('staff'); showView('editor'); }
function openAdminEdit(r){ editorReturn='admin'; fillForm(r); applyMode('admin'); $('#formTitle').textContent='บันทึกการรักษาและติดตามผล'; showView('editor'); }
function editorBack(){ if(editorReturn==='home') goHome(); else openDashboard(editorReturn==='admin'); }
$('#homeLink').onclick=goHome;
$('#homeLink').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome();}};
$('#dashHome').onclick=goHome;
$$('.menu-card').forEach(card=>card.onclick=()=>{const go=card.dataset.go; if(go==='new'){openStaffNew();} else if(go==='records'){openDashboard(false);} else if(go==='admin'){openDashboard(true);}});
$('#newRecord').onclick=openStaffNew;
$('#backBtn').onclick=editorBack;
$('#search').oninput=e=>renderDashboard(e.target.value);
form.onsubmit=e=>{e.preventDefault(); const data=formDataObject(), list=records(), now=new Date().toISOString(); if(data.id){const i=list.findIndex(r=>r.id===data.id); data.createdAt=list[i]?.createdAt||now; data.updatedAt=now; if(i>=0)list[i]=data; else list.push(data);}else{data.id=crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`;data.createdAt=now;data.updatedAt=now;list.push(data)} persist(list); toast('บันทึกข้อมูลเรียบร้อย'); editorBack();};
$('#recordRows').onclick=e=>{const btn=e.target.closest('[data-view]');if(!btn)return;selectedId=btn.dataset.view;const r=records().find(x=>x.id===selectedId);if(r){$('#detailContent').innerHTML=detailHtml(r);$('#editRecord').textContent=isAdmin?'บันทึกการรักษา/ติดตาม':'แก้ไข';$('#detailDialog').showModal();}};
$('.dialog-close').onclick=()=>$('#detailDialog').close();
$('#editRecord').onclick=()=>{const r=records().find(x=>x.id===selectedId);if(r){$('#detailDialog').close(); isAdmin?openAdminEdit(r):openStaffEdit(r);}};
$('#deleteRecord').onclick=()=>{if(!confirm('ยืนยันการลบรายการนี้? ข้อมูลที่ลบไม่สามารถกู้คืนได้'))return;persist(records().filter(r=>r.id!==selectedId));$('#detailDialog').close();renderDashboard();toast('ลบรายการแล้ว')};
$('#printRecord').onclick=()=>window.print();
$('#exportJson').onclick=()=>{const data=records();if(!data.length)return toast('ยังไม่มีข้อมูลสำหรับสำรอง');download(`occupational-exposure-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json')};
$('#exportCsv').onclick=csvExport;
