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
const SOUNDEX_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=code`;
const LOGO_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=logo`;
const FLOW_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=flow`;
const FLOW_CACHE_KEY = 'icsswh-flow-cache-v1';
// ICN workflow steps from the "flow" tab (คอลัมน์: ส่วนที่ | ลำดับ | รายการ). Falls back to DEFAULT_FLOW.
const DEFAULT_FLOW = [
  { section:1, order:1, item:'เลือกรายการอุบัติเหตุรายใหม่|คลิกรายการด้านล่างเพื่อเข้าฟอร์มส่วนที่ 4 ทันที' },
  { section:1, order:2, item:'กรอกการรักษาเพื่อป้องกัน|ผลตรวจเลือด Day 0, การรักษา PEP และผล CBC/ตับ-ไต' },
  { section:1, order:3, item:'ตรวจทานและบันทึก|ดูใบรายงาน แล้วบันทึก / พิมพ์ / บันทึก PDF' },
];
function loadCachedFlow(){ try { const v=JSON.parse(localStorage.getItem(FLOW_CACHE_KEY)); return (Array.isArray(v)&&v.length)?v:null; } catch { return null; } }
let FLOW_STEPS = loadCachedFlow();
function parseFlowRows(rows){
  if(!rows||rows.length<2)return null;
  const H=rows[0].map(h=>String(h).trim()), cs=H.indexOf('ส่วนที่'), cn=H.indexOf('ลำดับ'), ci=H.indexOf('รายการ'), cd=H.indexOf('คำอธิบาย');
  if(ci<0)return null;
  const out=[];
  for(let r=1;r<rows.length;r++){ const row=rows[r]||[]; let item=(row[ci]||'').trim(); if(!item)continue; const detail=cd>=0?(row[cd]||'').trim():''; if(detail&&!item.includes('|')) item=item+'|'+detail; out.push({ section:(cs>=0?(row[cs]||'').trim():'')||'1', order:parseFloat(row[cn])||0, item }); }
  return out.length?out:null;
}
async function loadFlowFromSheet(){
  try {
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),6000);
    const res=await fetch(FLOW_CSV_URL,{signal:ctrl.signal}); clearTimeout(timer);
    if(!res.ok)return;
    const flow=parseFlowRows(parseCSV(await res.text()));
    if(flow){ FLOW_STEPS=flow; localStorage.setItem(FLOW_CACHE_KEY,JSON.stringify(flow)); if(dashMode==='icn'&&$('#dashboard').classList.contains('active')) $('#adminHint').innerHTML=icnFlowHtml(); }
  } catch { /* keep DEFAULT_FLOW / cache */ }
}
// Header logos from the "logo" tab (col A=name, col B=file). Keeps the static assets/ images as fallback.
function driveImg(u) { u = String(u || '').trim(); const m = u.match(/\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/); return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w480` : u; }
function applyLogos(map) { if (!map) return; Object.entries(map).forEach(([name, url]) => { const img = document.querySelector(`img[data-logo="${name}"]`); if (img && url) img.src = driveImg(url); }); }
function loadCachedLogoMap() { try { return JSON.parse(localStorage.getItem(LOGO_CACHE_KEY)) || null; } catch { return null; } }
async function loadLogoFromSheet() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(LOGO_CSV_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const map = {};
    parseCSV(await res.text()).forEach(r => { const name = (r[0] || '').trim(), url = (r[1] || '').trim(); if (name && /^https?:\/\//.test(url)) map[name] = url; });
    if (Object.keys(map).length) { localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(map)); applyLogos(map); }
  } catch (e) { /* keep the static assets/ logos */ }
}
const OPT_CACHE_KEY = 'icsswh-options-cache-v1';
const FIELDS_CACHE_KEY = 'icsswh-fields-cache-v1';
const SOUNDEX_CACHE_KEY = 'icsswh-soundex-cache-v1';
// Thai consonant -> digit group (from the "code" sheet tab; this is the built-in fallback)
const DEFAULT_SOUNDEX = (() => { const g = { 1: 'กขคฆงจ', 2: 'มวศษส', 3: 'ฉชซหอฮฌ', 4: 'ญยนณลฬรฤ', 5: 'ดตฎฏฐฑฒถทธ', 6: 'บปผฝพฟภ' }; const m = {}; for (const d in g)[...g[d]].forEach(c => m[c] = d); return m; })();
function loadCachedSoundex() { try { return JSON.parse(localStorage.getItem(SOUNDEX_CACHE_KEY)) || {}; } catch { return {}; } }
let SOUNDEX_MAP = { ...DEFAULT_SOUNDEX, ...loadCachedSoundex() };
// Keep only Thai consonants (ก–ฮ); skip vowels, tone marks, spaces, etc.
function consonants(s) { return [...(s || '')].filter(c => c >= 'ก' && c <= 'ฮ'); }
// Format A.000.00 — A = 1st consonant of surname; 3 digits from surname consonants 2-4; 2 digits from first-name consonants 1-2 (missing/unmapped = 0)
function soundexCode(first, last) {
  const L = consonants(last), F = consonants(first);
  if (!L.length && !F.length) return '';
  const val = ch => (ch && SOUNDEX_MAP[ch]) || '0';
  return `${L[0] || ''}.${val(L[1])}${val(L[2])}${val(L[3])}.${val(F[0])}${val(F[1])}`;
}
function updateSoundex() {
  const s = form.elements.soundex; if (!s) return;
  s.value = soundexCode(form.elements.staffName ? form.elements.staffName.value : '', form.elements.staffName2 ? form.elements.staffName2.value : '');
}
async function loadSoundexFromSheet() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(SOUNDEX_CSV_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const map = {};
    parseCSV(await res.text()).forEach(r => { const ch = (r[0] || '').trim(), dg = (r[1] || '').trim(); if ([...ch].length === 1 && /^\d$/.test(dg)) map[ch] = dg; });
    if (Object.keys(map).length) { SOUNDEX_MAP = map; localStorage.setItem(SOUNDEX_CACHE_KEY, JSON.stringify(map)); if (!$('#editor').classList.contains('active')) updateSoundex(); }
  } catch (e) { /* keep built-in / cached map */ }
}
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
function labLabel(n, def) { return (FIELD_CFG[n] && FIELD_CFG[n].label) || def; }
function labItem(n, def) { return `<div class="lab-item"><span>${esc(labLabel(n, def))}</span>${segmented(n, fieldOptions(n) || OPTIONS.testResult)}</div>`; }
function buildDynamicFields() {
  $('#staffLabs').innerHTML = staffLabNames.map(([n,l]) => labItem(n,l)).join('');
  $('#consents').innerHTML = consentNames.map(([n,l]) => `<div class="consent-row"><span>${esc(labLabel(n,l))}</span>${segmented(n, fieldOptions(n) || OPTIONS.consent)}</div>`).join('');
  $('#baselineLabs').innerHTML = baselineNames.map(([n,l]) => `<label>${esc(labLabel(n,l))}<input name="${n}"></label>`).join('');
  const groups = [{m:'1',labs:[['HIV','Anti HIV'],['HCV','Anti HCV']]},{m:'3',labs:[['HIV','Anti HIV']]},{m:'6',labs:[['HIV','Anti HIV'],['HbsAg','HBsAg'],['HCV','Anti HCV']]}];
  $('#followups').innerHTML = groups.map(g => `<section class="followup"><h3>เดือนที่ ${g.m} หลังเกิดอุบัติเหตุ</h3><div class="grid cols-2"><label>วันที่ตรวจ<input type="date" name="follow${g.m}Date"></label><label>เหตุผลที่ไม่ได้ตรวจ<input name="follow${g.m}Reason"></label></div><div class="lab-grid">${g.labs.map(([k,l])=>labItem(`follow${g.m}${k}`,l)).join('')}</div></section>`).join('');
}
// ---- Source patient (repeatable) ----
// Handled by the repeatable patient cards — must NOT be auto-generated from the "fields" sheet tab
const SOURCE_KEYS = new Set(['sourceName','sourceHn','sourceHiv','sourceHbsAg','sourceHcv','sourceRisk','sourceRiskDetail']);
function srcSeg(key, i, val){ const o=fieldOptions(key)||OPTIONS.testResult; return `<div class="segmented">${o.map(x=>`<label><input type="radio" name="sp_${key}_${i}" value="${esc(x)}"${x===val?' checked':''}><span>${esc(x)}</span></label>`).join('')}</div>`; }
function patientCard(p, i, total){ const risk=fieldOptions('sourceRisk')||OPTIONS.riskHistory; return `<div class="patient-card" data-idx="${i}"><div class="patient-head"><b>ผู้ป่วย/ผู้รับบริการ คนที่ ${i+1}</b><button type="button" class="btn ghost dark sp-remove"${total>1?'':' style="display:none"'}>ลบ</button></div><div class="grid cols-2"><label>ชื่อผู้ป่วย<input data-sp="name" value="${esc(p.name||'')}"></label><label>HN ผู้ป่วย<input data-sp="hn" value="${esc(p.hn||'')}"></label></div><div class="lab-grid"><div class="lab-item"><span>${esc(labLabel('sourceHiv','Anti HIV'))}</span>${srcSeg('sourceHiv',i,p.hiv)}</div><div class="lab-item"><span>${esc(labLabel('sourceHbsAg','HBs Ag'))}</span>${srcSeg('sourceHbsAg',i,p.hbsAg)}</div><div class="lab-item"><span>${esc(labLabel('sourceHcv','Anti HCV'))}</span>${srcSeg('sourceHcv',i,p.hcv)}</div></div><div class="grid cols-2"><label>ประวัติพฤติกรรมเสี่ยง<select data-sp="risk"><option value="">เลือก</option>${risk.map(x=>`<option${x===p.risk?' selected':''}>${esc(x)}</option>`).join('')}</select></label><label>รายละเอียดความเสี่ยง<input data-sp="riskDetail" value="${esc(p.riskDetail||'')}"></label></div></div>`; }
function renderSourcePatients(list){ const box=$('#sourcePatients'); if(!box)return; const arr=(list&&list.length)?list:[{}]; box.innerHTML=arr.map((p,i)=>patientCard(p,i,arr.length)).join(''); }
function collectSourcePatients(){ return $$('#sourcePatients .patient-card').map(card=>{ const val=s=>{ const el=card.querySelector(s); return el?(el.value||'').trim():''; }; const rv=key=>{ const c=card.querySelector(`input[name^="sp_${key}_"]:checked`); return c?c.value:''; }; const rs=card.querySelector('[data-sp="risk"]'); return { name:val('[data-sp="name"]'), hn:val('[data-sp="hn"]'), hiv:rv('sourceHiv'), hbsAg:rv('sourceHbsAg'), hcv:rv('sourceHcv'), risk:rs?rs.value:'', riskDetail:val('[data-sp="riskDetail"]') }; }); }
const BODYSITE_DEFAULT = ['มือซ้าย','มือขวา','ตาซ้าย','ตาขวา','ใบหน้า','อื่นๆ'];
function populateChecks() {
  const box = $('#bodySiteChoices'); if (!box) return;
  const opts = fieldOptions('bodySite') || BODYSITE_DEFAULT;
  const checked = new Set([...box.querySelectorAll('input:checked')].map(i => i.value));
  box.innerHTML = opts.map(o => `<label class="choice"><input type="checkbox" name="bodySite" value="${esc(o)}"${checked.has(o) ? ' checked' : ''}><span><b>${esc(o)}</b></span></label>`).join('');
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
function refreshOptionUI() { buildDynamicFields(); populateSelects(); populateChecks(); addDynamicFields(); reorderFieldsBySheet(); applyFieldConfig(); applySectionTitles(); setupOtherInputs(); updateDurationNote(); updateSoundex(); }
// "อื่นๆ" free-text: a select whose value — or a checkbox group whose "อื่นๆ" box —
// is chosen reveals a companion text input ({name}Other)
const OTHER_RE = /^อื่น\s*ๆ$/;
function otherCandidates() {
  const names = new Set();
  $$('select', form).forEach(s => { if (s.name && [...s.options].some(o => OTHER_RE.test((o.value || '').trim()))) names.add(s.name); });
  $$('input[type=checkbox]', form).forEach(c => { if (c.name && OTHER_RE.test((c.value || '').trim())) names.add(c.name); });
  return [...names];
}
function isOtherActive(name) {
  const el = form.elements[name];
  if (!el) return false;
  if (el.tagName === 'SELECT') return OTHER_RE.test((el.value || '').trim());
  const nodes = el.tagName ? [el] : [...el];
  return nodes.some(n => n.type === 'checkbox' && n.checked && OTHER_RE.test((n.value || '').trim()));
}
function setupOtherInputs() {
  $$('.dyn-other').forEach(n => n.remove());
  otherCandidates().forEach(name => {
    const cn = name + 'Other';
    if (!form.elements[cn]) {
      const anchor = ctrlWrapper(name);
      if (!anchor) return;
      const lab = document.createElement('label');
      lab.className = 'wide dyn-other';
      lab.innerHTML = `โปรดระบุ<input name="${esc(cn)}">`;
      anchor.insertAdjacentElement('afterend', lab);
    }
  });
  updateAllOther();
}
function updateOtherVisibility(name) {
  const comp = form.elements[name + 'Other'];
  if (!comp || !comp.closest) return;
  const w = comp.closest('label') || comp;
  w.classList.toggle('other-hidden', !isOtherActive(name));
}
function updateAllOther() { otherCandidates().forEach(updateOtherVisibility); }
function updateDurationNote() { const el = $('#durNote'); if (!el) return; const m = (FIELD_CFG.workMonths && FIELD_CFG.workMonths.label) || ''; el.textContent = (m && m !== 'เดือน') ? m : ''; }
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
// Outer flow-level wrapper of a field control (handles single controls and radio/checkbox groups)
function ctrlWrapper(name) {
  const el = form.elements[name];
  if (!el) return null;
  if (el.tagName) return el.closest('label,.lab-item,fieldset'); // single control
  const node = el[0]; if (!node) return null;                    // group: use its outer container, not the inner choice label
  return node.closest('fieldset,.lab-item,.consent-row,.followup') || node.closest('label');
}
// The wrapping element of an existing field with the largest order <= the new field's order (same section)
function referenceElementFor(f) {
  const cand = Object.entries(FIELD_CFG)
    .filter(([k, c]) => c.type !== 'section' && String(c.section) === String(f.section) && k !== f.key && (c.order || 0) <= (f.order || 0) && ctrlWrapper(k))
    .sort((a, b) => (b[1].order || 0) - (a[1].order || 0));
  for (const [k] of cand) { const w = ctrlWrapper(k); if (w) return w; }
  return null;
}
// Create form controls for sheet keys that have no matching field in the static form, inserted by ลำดับ
function addDynamicFields() {
  $$('.dyn-extra').forEach(n => n.remove());
  const news = Object.entries(FIELD_CFG)
    .filter(([k, c]) => c.type !== 'section' && !SOURCE_KEYS.has(k) && !form.elements[k])
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
// Reorder the field controls inside every grid to follow the sheet's ลำดับ (order) exactly.
// Runs after fields are built so both static and dynamic fields end up in sheet sequence.
function reorderFieldsBySheet() {
  const ord = key => { const c = FIELD_CFG[key]; return (c && c.order != null) ? c.order : Infinity; };
  $$('.form-page').forEach(page => {
    $$('.grid', page).forEach(grid => {
      const decorated = [...grid.children].map((el, i) => {
        const named = el.matches('[name]') ? el : el.querySelector('[name]');
        const key = named ? named.getAttribute('name') : null;
        return { el, i, ord: key ? ord(key) : Infinity };
      });
      decorated.sort((a, b) => {
        if (a.ord === b.ord) return a.i - b.i;
        if (a.ord === Infinity) return 1;
        if (b.ord === Infinity) return -1;
        return a.ord - b.ord;
      });
      decorated.forEach(d => grid.appendChild(d.el));
    });
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
    if (!$('#editor').classList.contains('active')) { buildDynamicFields(); populateSelects(); populateChecks(); addDynamicFields(); reorderFieldsBySheet(); applyFieldConfig(); applySectionTitles(); setupOtherInputs(); updateDurationNote(); updateSoundex(); }
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

let dashMode='records';      // dashboard viewing mode: 'records' | 'admin' | 'icn'
// section 4 (การรักษาเพื่อป้องกัน) not started yet -> a "new" incident awaiting ICN
function icnPending(r){ return !(r.staffHiv||r.staffHbsAg||r.staffAntiHbs||r.staffHcv||r.pepRegimen||r.hemoglobin||r.otherTreatment||r.noTreatmentReason); }
// ---- Overview charts (inline SVG/CSS, no external libraries) ----
const THMON_SHORT=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const CAT_COLORS=['#c8102e','#f2857f','#f6b26b','#8e7cc3','#3d85c6','#2e9e5b','#e53935'];
function svgBars(data,color='#c8102e'){
  const w=460,h=210,pl=24,pr=12,pt=18,pb=30,iw=w-pl-pr,ih=h-pt-pb,max=Math.max(1,...data.map(d=>d.value)),bw=iw/data.length;
  const body=data.map((d,i)=>{ const bh=Math.round(ih*d.value/max),rw=Math.min(46,bw*0.6),x=pl+i*bw+(bw-rw)/2,y=pt+ih-bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${rw.toFixed(1)}" height="${bh}" rx="6" fill="${color}"/>`
      +(d.value?`<text x="${(x+rw/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle" class="cval">${d.value}</text>`:'')
      +`<text x="${(x+rw/2).toFixed(1)}" y="${pt+ih+18}" text-anchor="middle" class="clbl">${d.label}</text>`; }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" preserveAspectRatio="xMidYMid meet"><line x1="${pl}" y1="${pt+ih}" x2="${w-pr}" y2="${pt+ih}" class="axis"/>${body}</svg>`;
}
function svgDonut(data,cap='รายการ'){
  const size=170,thick=32,r=(size-thick)/2,cx=size/2,cy=size/2,C=2*Math.PI*r,total=data.reduce((s,d)=>s+d.value,0);
  let off=0; const src=total?data:[{value:1,color:'#eee'}];
  const segs=src.map(d=>{ const len=C*(total?d.value:1)/(total||1),s=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${d.color}" stroke-width="${thick}" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`; off+=len; return s; }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="donut-svg">${segs}<text x="${cx}" y="${cy-2}" text-anchor="middle" class="donut-num">${total}</text><text x="${cx}" y="${cy+16}" text-anchor="middle" class="donut-cap">${cap}</text></svg>`;
}
function chartLegend(data){ return `<div class="legend">${data.map(d=>`<div class="li"><span class="sw" style="background:${d.color}"></span><span>${esc(d.label)}</span><span class="lv">${d.value}</span></div>`).join('')}</div>`; }
function chartHBars(data,color='#c8102e'){ if(!data.length)return '<p class="chart-empty">ไม่มีข้อมูล</p>'; const max=Math.max(1,...data.map(d=>d.value)); return `<div class="hbars">${data.map(d=>`<div class="hbar"><span class="hbar-lbl" title="${esc(d.label)}">${esc(d.label)}</span><div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(12,d.value/max*100)}%">${d.value}</div></div></div>`).join('')}</div>`; }
function renderCharts(){
  const box=$('#dashCharts'); if(!box)return; const items=records();
  if(!items.length){ box.innerHTML='<div class="chart-card" style="grid-column:1/-1"><p class="chart-empty">ยังไม่มีข้อมูลสำหรับสรุปภาพรวม</p></div>'; return; }
  const now=new Date(), months=[];
  for(let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({y:d.getFullYear(),m:d.getMonth(),label:THMON_SHORT[d.getMonth()],value:0}); }
  const expo=[['ของแหลมคม','แหลมคม'],['ผิวหนังมีบาดแผล','ผิวหนัง'],['เยื่อบุ/เนื้อเยื่ออ่อน','เยื่อบุ'],['อื่น ๆ','อื่น']].map(([label,kw],i)=>({label,kw,color:CAT_COLORS[i],value:0}));
  const deptMap={};
  items.forEach(r=>{
    if(r.incidentDate){ const d=new Date(r.incidentDate+'T00:00:00'); if(!isNaN(d)){ const mo=months.find(x=>x.y===d.getFullYear()&&x.m===d.getMonth()); if(mo)mo.value++; } }
    const arr=Array.isArray(r.exposureType)?r.exposureType:(r.exposureType?[r.exposureType]:[]); expo.forEach(e=>{ if(arr.some(a=>String(a).includes(e.kw))) e.value++; });
    const dep=((r.department||'').trim())||'ไม่ระบุ'; deptMap[dep]=(deptMap[dep]||0)+1;
  });
  const topDept=Object.entries(deptMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,value])=>({label,value}));
  const done=items.filter(isComplete).length;
  const status=[{label:'ติดตามครบ',color:'#2e9e5b',value:done},{label:'รอติดตาม',color:'#f0a500',value:items.length-done}];
  box.innerHTML =
     `<div class="chart-card"><h3>แนวโน้มอุบัติเหตุรายเดือน (6 เดือน)</h3>${svgBars(months)}</div>`
    +`<div class="chart-card"><h3>ชนิดการสัมผัส</h3><div class="donut-wrap">${svgDonut(expo,'ครั้ง')}${chartLegend(expo)}</div></div>`
    +`<div class="chart-card"><h3>หน่วยงาน 5 อันดับ</h3>${chartHBars(topDept)}</div>`
    +`<div class="chart-card"><h3>สถานะการติดตาม</h3><div class="donut-wrap">${svgDonut(status)}${chartLegend(status)}</div></div>`;
}
function renderDashboard(query='') {
  let items = records().sort((a,b)=>(b.incidentDate||'').localeCompare(a.incidentDate||''));
  if(dashMode==='icn') items = items.slice().sort((a,b)=>(icnPending(b)?1:0)-(icnPending(a)?1:0)); // ICN: unsaved (new) first, saved stay in list
  const q=query.trim().toLowerCase();
  const filtered=items.filter(r=>[r.staffName,r.staffHn,r.soundex,r.location,r.incidentDescription].join(' ').toLowerCase().includes(q));
  $('#statTotal').textContent=items.length;
  $('#statPending').textContent=items.filter(r=>!isComplete(r)).length;
  const ym=new Date().toISOString().slice(0,7); $('#statMonth').textContent=items.filter(r=>(r.createdAt||'').slice(0,7)===ym).length;
  const statusCell=r=>dashMode==='icn'
    ? (icnPending(r)?'<span class="status">รอบันทึก</span>':'<span class="status done">บันทึกแล้ว</span>')
    : `<span class="status ${isComplete(r)?'done':''}">${isComplete(r)?'ติดตามครบ':'รอติดตาม'}</span>`;
  const actionLabel=r=>dashMode==='icn'?(icnPending(r)?'กรอกส่วนที่ 4 →':'แก้ไขส่วนที่ 4 →'):'ดูรายละเอียด →';
  $('#recordRows').innerHTML=filtered.map(r=>`<tr><td><b>${thaiDate(r.incidentDate)}</b><small>${esc(r.incidentTime||'')} น.</small></td><td><b>${esc(r.staffName||'ไม่ระบุชื่อ')}</b><small>${esc(r.staffType||'')} ${r.staffHn?'• HN '+esc(r.staffHn):''}</small></td><td>${esc(exposureLabel(r))}<small>${esc(r.location||'')}</small></td><td>${statusCell(r)}</td><td class="row-actions"><button data-view="${r.id}">${actionLabel(r)}</button></td></tr>`).join('');
  $('#emptyState').innerHTML = dashMode==='icn'
    ? '<b>ยังไม่มีรายการอุบัติเหตุ</b><span>เมื่อเจ้าหน้าที่บันทึกเหตุการณ์ใหม่ จะปรากฏที่นี่</span>'
    : '<b>ยังไม่มีรายการ</b><span>เริ่มบันทึกเหตุการณ์แรกเพื่อสร้างทะเบียนติดตาม</span>';
  $('#emptyState').classList.toggle('show',filtered.length===0);
  const showCharts = dashMode==='records';
  $('#dashCharts').classList.toggle('hidden',!showCharts);
  if(showCharts) renderCharts();
}
function showView(name){ $$('.view').forEach(v=>v.classList.toggle('active',v.id===name)); window.scrollTo({top:0}); }
const STAFF_PAGES=[0,1,2], ADMIN_PAGES=[0,1,2,3,4], ICN_PAGES=[3];
const PAGES_BY_MODE={staff:STAFF_PAGES,admin:ADMIN_PAGES,icn:ICN_PAGES};
let formMode='staff';
function applyMode(mode){ formMode=mode; const pages=PAGES_BY_MODE[mode]||STAFF_PAGES; $$('.form-page').forEach((p,i)=>p.classList.toggle('active',pages.includes(i))); ['#steps','#prevBtn','#nextBtn'].forEach(s=>$(s).classList.add('hidden')); $('#saveBtn').classList.remove('hidden'); $('#viewPrevDoc').classList.toggle('hidden',mode!=='icn'); const eyebrow={admin:'ส่วนแอดมิน • ทุกส่วน (1-5)',icn:'ICN / เวรตรวจการ • ส่วนที่ 4'}[mode]||'FORM IC 1 • เจ้าหน้าที่ • ขั้นตอน 1-3'; const label={admin:'แก้ไข/จัดการข้อมูลได้ทุกส่วน (แอดมิน)',icn:'การรักษาเพื่อป้องกัน (ICN / เวรตรวจการ)'}[mode]||'กรอกข้อมูลให้ครบแล้วกดบันทึก (เจ้าหน้าที่)'; $('#formEyebrow').textContent=eyebrow; $('#stepLabel').textContent=label; window.scrollTo({top:0}); }
function resetForm(){ form.reset(); form.id.value='';$('#formTitle').textContent='บันทึกเหตุการณ์ใหม่'; $('#saveState').textContent='ยังไม่บันทึก'; applyMode('staff'); renderSourcePatients([]); updateAllOther(); updateSoundex(); }
let MULTI_FIELDS = new Set(['exposureType', 'bodySite']); // fields whose value is an array (checkbox groups)
function formDataObject(){ const fd=new FormData(form), out={}; for(const [k,v] of fd){ if(MULTI_FIELDS.has(k)){ (out[k]??=[]).push(v); } else out[k]=v.trim?.()??v; } MULTI_FIELDS.forEach(k=>{ if(!out[k]) out[k]=[]; }); out.sourcePatients=collectSourcePatients(); const p0=out.sourcePatients[0]||{}; out.sourceName=p0.name||''; out.sourceHn=p0.hn||''; out.sourceHiv=p0.hiv||''; out.sourceHbsAg=p0.hbsAg||''; out.sourceHcv=p0.hcv||''; out.sourceRisk=p0.risk||''; out.sourceRiskDetail=p0.riskDetail||''; return out; }
function fillForm(record){ resetForm(); Object.entries(record).forEach(([k,v])=>{ const els=$$(`[name="${CSS.escape(k)}"]`,form); if(!els.length)return; if(Array.isArray(v)){ els.forEach(e=>e.checked=v.includes(e.value)); } else if(els[0].type==='radio'){ els.forEach(e=>e.checked=e.value===v); } else { if(els[0].tagName==='SELECT'&&v&&![...els[0].options].some(o=>o.value===v)) els[0].add(new Option(v,v)); els[0].value=v??''; } }); $('#formTitle').textContent='แก้ไขบันทึกเหตุการณ์'; $('#saveState').textContent=`แก้ไขล่าสุด ${thaiDate((record.updatedAt||record.createdAt||'').slice(0,10))}`; renderSourcePatients((record.sourcePatients&&record.sourcePatients.length)?record.sourcePatients:[{name:record.sourceName,hn:record.sourceHn,hiv:record.sourceHiv,hbsAg:record.sourceHbsAg,hcv:record.sourceHcv,risk:record.sourceRisk,riskDetail:record.sourceRiskDetail}]); updateAllOther(); updateSoundex(); }

// ---- Signature pad: sign with finger / mouse in section 3, stored as a PNG data URL in field "sign" ----
let signCtx=null, signDrawing=false, signHasInk=false, signLast=null;
function signCanvas(){ return $('#signPad'); }
function signPos(c,e){ const r=c.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
function signSave(){ const c=signCanvas(); if(c&&form.elements.sign) form.elements.sign.value = signHasInk ? c.toDataURL('image/png') : ''; }
function clearSignPad(){ const c=signCanvas(); if(!c||!signCtx) return; signCtx.clearRect(0,0,c.clientWidth,c.clientHeight); signHasInk=false; if(form.elements.sign) form.elements.sign.value=''; }
function initSignPad(){
  const c=signCanvas(); if(!c) return;
  const cssW=c.clientWidth, cssH=c.clientHeight||200;
  if(!cssW) return;                    // canvas not visible yet (e.g. admin mode) — keep stored value untouched
  const dpr=window.devicePixelRatio||1;
  c.width=Math.round(cssW*dpr); c.height=Math.round(cssH*dpr);
  signCtx=c.getContext('2d');
  signCtx.setTransform(dpr,0,0,dpr,0,0);
  signCtx.lineWidth=2.2; signCtx.lineJoin='round'; signCtx.lineCap='round'; signCtx.strokeStyle='#1a1a1a';
  signCtx.clearRect(0,0,cssW,cssH);
  signHasInk=false;
  const data=form.elements.sign&&form.elements.sign.value;
  if(data){ signHasInk=true; const img=new Image(); img.onload=()=>{ try{ signCtx.drawImage(img,0,0,cssW,cssH); }catch(e){} }; img.src=data; }
}
function setupSignPad(){
  const c=signCanvas(); if(!c) return;
  if(form.elements.sign) form.elements.sign.required=false;
  c.addEventListener('pointerdown', e=>{ if(!signCtx) initSignPad(); if(!signCtx) return; signDrawing=true; signLast=signPos(c,e); signHasInk=true; c.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  c.addEventListener('pointermove', e=>{ if(!signDrawing||!signCtx) return; const p=signPos(c,e); signCtx.beginPath(); signCtx.moveTo(signLast.x,signLast.y); signCtx.lineTo(p.x,p.y); signCtx.stroke(); signLast=p; e.preventDefault(); });
  const stop=()=>{ if(!signDrawing) return; signDrawing=false; signSave(); };
  c.addEventListener('pointerup',stop); c.addEventListener('pointercancel',stop); c.addEventListener('pointerleave',stop);
  const btn=$('#signClear'); if(btn) btn.onclick=clearSignPad;
  let rt; window.addEventListener('resize', ()=>{ clearTimeout(rt); rt=setTimeout(()=>{ if($('#editor').classList.contains('active')&&formMode!=='admin') initSignPad(); },200); });
}

// Detail view for ICN / เวรตรวจการ — focuses on ส่วนที่ 4 (การรักษาเพื่อป้องกัน)
function icnDetailHtml(r){ const item=(label,value)=>`<div><b>${label}</b>${esc(value||'—')}</div>`; const labs=(pairs)=>pairs.map(([k,l])=>item(l,r[k])).join('');
  return `<span class="eyebrow">ICN / เวรตรวจการ • ส่วนที่ 4</span><h2 class="detail-title">${esc(r.staffName||'ไม่ระบุชื่อ')}</h2>`
    + `<div class="detail-meta">${thaiDate(r.incidentDate)} เวลา ${esc(r.incidentTime||'—')} น. • ${esc(r.location||'ไม่ระบุสถานที่')}</div>`
    + `<section class="detail-section"><h4>ข้อมูลบุคลากร</h4><div class="detail-grid">${item('HN soundex code',r.hn)}${item('HN บุคลากร',r.staffHn)}${item('Soundex',r.soundex)}${item('หน่วยงาน',r.department)}</div></section>`
    + `<section class="detail-section"><h4>ผลตรวจเลือดบุคลากรทันที (Day 0)</h4><div class="detail-grid">${labs(staffLabNames)}${item('ประวัติพฤติกรรมเสี่ยง',[r.staffRisk,r.staffRiskDetail].filter(Boolean).join(' — '))}</div></section>`
    + `<section class="detail-section"><h4>การรักษาป้องกันด้วยยา (PEP)</h4><div class="detail-grid">${item('สูตรยา',r.pepRegimen)}${item('ขนาดยา / สูตรอื่น',r.pepDose)}${item('วันที่เริ่มยา',thaiDate(r.pepStart))}${item('หลังเกิดเหตุ (ชม.)',r.pepHours)}${item('วันที่สิ้นสุด',thaiDate(r.pepEnd))}${item('ผลการรับประทาน',r.pepOutcome)}${item('จำนวนวันที่รับประทาน',r.pepDays)}${item('ผลข้างเคียง / เหตุผลที่หยุดยา',r.pepNote)}</div></section>`
    + `<section class="detail-section"><h4>การรักษาอื่น / กรณีไม่ได้รับยา</h4><div class="detail-grid">${item('การรักษาอื่น ๆ',r.otherTreatment)}${item('เหตุผลที่ไม่ได้รับการรักษา',r.noTreatmentReason)}</div></section>`
    + `<section class="detail-section"><h4>ผล CBC และการทำงานของตับ/ไต</h4><div class="detail-grid">${baselineNames.map(([k,l])=>item(l,r[k])).join('')}</div></section>`;
}
function detailHtml(r){ const item=(label,value)=>`<div><b>${label}</b>${esc(value||'—')}</div>`; const labs=(pairs)=>pairs.map(([k,l])=>item(l,r[k])).join(''); return `<span class="eyebrow">INCIDENT RECORD</span><h2 class="detail-title">${esc(r.staffName||'ไม่ระบุชื่อ')}</h2><div class="detail-meta">${thaiDate(r.incidentDate)} เวลา ${esc(r.incidentTime||'—')} น. • ${esc(r.location||'ไม่ระบุสถานที่')}</div><section class="detail-section"><h4>ข้อมูลเหตุการณ์</h4><div class="detail-grid">${item('HN บุคลากร',r.staffHn)}${item('Soundex',r.soundex)}${item('หน่วยงาน',r.department)}${item('กลุ่มงาน',r.workGroup)}${item('ตำแหน่ง',r.staffType)}${item('ระยะเวลาปฏิบัติงาน',(r.workYears||r.workMonths)?`${r.workYears||0} ปี ${r.workMonths||0} เดือน`:'')}${item('ลักษณะอุบัติเหตุ',exposureLabel(r))}${item('อวัยวะที่สัมผัส',r.bodySite)}${item('การปฐมพยาบาล',r.firstAid)}</div><p>${esc(r.incidentDescription||'')}</p></section>${(()=>{const pl=(r.sourcePatients&&r.sourcePatients.length)?r.sourcePatients:[{name:r.sourceName,hn:r.sourceHn,hiv:r.sourceHiv,hbsAg:r.sourceHbsAg,hcv:r.sourceHcv,risk:r.sourceRisk,riskDetail:r.sourceRiskDetail}];return `<section class="detail-section"><h4>ผู้ป่วยต้นเหตุ (${pl.length})</h4>${pl.map((p,i)=>`<div class="detail-grid">${item('คนที่ '+(i+1)+' • ชื่อ/HN',[p.name,p.hn].filter(Boolean).join(' / '))}${item('Anti HIV',p.hiv)}${item('HBs Ag',p.hbsAg)}${item('Anti HCV',p.hcv)}${item('พฤติกรรมเสี่ยง',[p.risk,p.riskDetail].filter(Boolean).join(' — '))}</div>`).join('')}</section>`;})()}<section class="detail-section"><h4>ผลบุคลากร Day 0</h4><div class="detail-grid">${labs(staffLabNames)}</div></section><section class="detail-section"><h4>การรักษา</h4><div class="detail-grid">${item('สูตรยา',r.pepRegimen)}${item('ขนาดยา',r.pepDose)}${item('เริ่มยา',thaiDate(r.pepStart))}${item('ผลการรับประทาน',r.pepOutcome)}</div></section><section class="detail-section"><h4>การติดตาม</h4><div class="detail-grid">${item('เดือนที่ 1',`${thaiDate(r.follow1Date)} • HIV ${r.follow1HIV||'—'} • HCV ${r.follow1HCV||'—'}`)}${item('เดือนที่ 3',`${thaiDate(r.follow3Date)} • HIV ${r.follow3HIV||'—'}`)}${item('เดือนที่ 6',`${thaiDate(r.follow6Date)} • HIV ${r.follow6HIV||'—'} • HBsAg ${r.follow6HbsAg||'—'} • HCV ${r.follow6HCV||'—'}`)}</div></section>${r.sign?`<section class="detail-section sign-detail"><h4>ลงชื่อผู้ให้ความยินยอม</h4><img class="sign-img" src="${r.sign}" alt="ลายเซ็น">${r.consentDate?`<div class="detail-meta" style="margin-top:8px">วันที่ ${thaiDate(r.consentDate)}</div>`:''}</section>`:''}`; }

// ---- Official A4 document (Form IC 1) — one continuous form: page 1 (items 1–10, staff) + page 2 (items 11–16, admin) ----
const THAI_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const rHas = x => x!=null && x!=='';
const rT = s => `<span class="t">${s}</span>`;
const rFx = (v,fill) => `<span class="fx${fill?' fill':''}">${rHas(v)?esc(String(v)):''}</span>`;
const rFxN = v => `<span class="fx num">${rHas(v)?esc(String(v)):''}</span>`;
const rCk = on => `<span class="ck">(${on?'✓':'&nbsp;&nbsp;'})</span>`;
const rEq = (v,o) => String(v||'').trim()===o;
const rOpt = (val,o) => `<span class="opt">${rCk(rEq(val,o))} ${o}</span>`;
const rLabRow = (no,label,val) => `<div class="lrow"><span class="llbl">${no} ${label}</span>${['บวก','ลบ','ไม่ทราบ','ไม่ได้ตรวจ'].map(o=>rOpt(val,o)).join('')}</div>`;
const cbcCell = (label,val,unit,cls='') => `<div class="cbc-cell ${cls}"><span class="cl">${label}</span>${rFx(val)}<span class="cu">${unit}</span></div>`;
const rDparts = v => { if(!rHas(v)) return {d:'',m:'',y:''}; const d=new Date(v+'T00:00:00'); if(isNaN(d)) return {d:'',m:'',y:''}; return {d:d.getDate(), m:THAI_MONTHS[d.getMonth()], y:d.getFullYear()+543}; };
// Keys already placed by hand in the official Form IC 1 layout. Any sheet key NOT here is a
// field the user added later — it is auto-appended to the preview so nothing gets lost (realtime).
const DOC_KEYS = new Set(['department','workGroup','staffName','staffName2','soundex','staffHn','phone','line','age','gender','workYears','workMonths','staffType','staffTypeOther','incidentDate','incidentTime','location','exposureType','sharpType','exposureOther','incidentDescription','bodySite','fingerSite','firstAid','sourceName','sourceHn','sourceHiv','sourceHbsAg','sourceHcv','sourceRisk','sourceRiskDetail','understandsTesting','consentBloodTest','consentHivPep','consentHbvPep','staffRisk','staffRiskDetail','consentDate','sign','hn','staffHiv','staffHbsAg','staffAntiHbs','staffHcv','pepRegimen','pepDose','pepStart','pepHours','pepEnd','pepOutcome','pepDays','pepNote','otherTreatment','noTreatmentReason','hemoglobin','hematocrit','redCellMorphology','plateletCount','wbc','neutrophil','lymphocyte','monocyte','basophil','eosinophil','bandForm','creatinine','sgpt','sgot','follow1Date','follow1Reason','follow1HIV','follow1HCV','follow3Date','follow3Reason','follow3HIV','follow6Date','follow6Reason','follow6HIV','follow6HbsAg','follow6HCV','notes','doctorName']);
function extraFieldsBlock(r){
  const rows = Object.entries(FIELD_CFG||{})
    .filter(([k,c]) => c && c.type!=='section' && !DOC_KEYS.has(k) && !SOURCE_KEYS.has(k) && !/Other$/.test(k))
    .map(([k,c]) => ({ key:k, label:c.label||k, section:c.section||'', order:parseFloat(c.order)||0 }))
    .filter(f => { const v=r[f.key]; return rHas(v) && !(Array.isArray(v)&&v.length===0); })
    .sort((a,b) => String(a.section).localeCompare(String(b.section)) || a.order-b.order);
  if(!rows.length) return '';
  return `<div class="ln sub" style="margin-top:6px">${rT('ข้อมูลเพิ่มเติม')}</div>`
    + rows.map(f => { const v=r[f.key]; return `<div class="ln in1">${rT(f.label)}${rFx(Array.isArray(v)?v.join(', '):v,true)}</div>`; }).join('');
}
// Official document uses the committed same-origin logo assets so both A4 pages render reliably
function docHead(sub){ return `<div class="doc-head"><span class="doc-formno">Form IC 1</span><img class="doc-logo-top" src="assets/logo-sswh.png" alt="" loading="eager"></div><h1 class="doc-title">แบบบันทึกและรายงานอุบัติเหตุในการให้บริการทางการแพทย์และสาธารณสุข${sub?` <span class="doc-sub">(${sub})</span>`:''}</h1>`; }
function docFoot(){ return `<div class="doc-logo-bottom"><img src="assets/logo-ic.png" alt="" loading="eager"><div class="ic-caption">กลุ่มงานการพยาบาลด้านการควบคุมและป้องกันการติดเชื้อ</div></div><div class="doc-foot">Version 2.0 วันที่ 04 สิงหาคม 2568</div>`; }
// scope 'admin' -> page 2 (items 11–16); anything else -> page 1 (items 1–10)
function reportA4Html(r, scope){ return scope==='admin' ? docPage2(r) : docPage1(r); }
// whole continuous case (both pages) for printing
function fullDocHtml(r){ return `<div class="a4-page">${docPage1(r)}</div><div class="a4-page">${docPage2(r)}</div>`; }
function docPage1(r){
  const t=rT, fx=rFx, ck=rCk, eq=rEq, has=rHas, opt=rOpt, labRow=rLabRow;
  const exposure = Array.isArray(r.exposureType) ? r.exposureType : (r.exposureType?[r.exposureType]:[]);
  const hasExp = s => exposure.some(e => String(e).includes(s));
  const body = Array.isArray(r.bodySite) ? r.bodySite.join(', ') : (r.bodySite||'');
  const finger = Array.isArray(r.fingerSite) ? r.fingerSite.join(', ') : (r.fingerSite||'');
  const sharp = r.sharpType||'';
  const inc = rDparts(r.incidentDate), cd = rDparts(r.consentDate);
  const fullName = ((r.staffName||'')+' '+(r.staffName2||'')).trim();
  const stdTypes = [['แพทย์',/แพทย์|นายแพทย์/],['พยาบาล',/พยาบาล/],['พนักงานช่วยเหลือคนไข้',/พนักงานช่วยเหลือคนไข้/],['พนักงานช่วยการพยาบาล',/พนักงานช่วยการพยาบาล/]];
  const typeMatch = stdTypes.find(([k,re]) => re.test(r.staffType||''));
  const crow = (label,val) => `<div class="crow"><span class="clbl">${label}</span><span class="opt">${ck(eq(val,'ใช่'))} ใช่</span><span class="opt">${ck(eq(val,'ไม่ใช่'))} ไม่ใช่</span></div>`;
  return `<div class="doc">`
    + docHead('')
    + `<div class="doc-body">`
    + `<div class="ln">${t('1. ชื่อหน่วยงาน')}${fx(r.department,true)}${t('โรงพยาบาลศรีสังวรสุโขทัย')}</div>`
    + `<div class="ln">${t('2. ชื่อบุคลากร')}${fx(r.staffName,true)}${t('นามสกุล')}${fx(r.staffName2,true)}</div>`
    + `<div class="ln in1">${t('Soundex code')}${fx(r.soundex)}${t('HN บุคลากร (ถ้าทราบ)')}${fx(r.staffHn)}${t('HN soundex code')}${fx(r.hn)}</div>`
    + `<div class="ln in1">${t('อายุ')}${fx(r.age)}${t('ปี  เพศ')}${fx(r.gender)}${t('ระยะเวลาปฏิบัติงาน')}${fx(r.workYears)}${t('ปี')}${fx(r.workMonths)}${t('เดือน')}</div>`
    + `<div class="ln in1">${t('เบอร์โทรศัพท์')}${fx(r.phone)}${t('ID Line')}${fx(r.line,true)}</div>`
    + `<div class="ln">${t('3. ประเภทบุคลากร')}</div>`
    + `<div class="ln in1 nowrap">${stdTypes.map(([ty])=>`<span class="opt">${ck(!!typeMatch&&typeMatch[0]===ty)} ${ty}</span>`).join('')}</div>`
    + `<div class="ln in1">${ck(!typeMatch&&has(r.staffType))} ${t('อื่น ๆ (ระบุ)')}${fx(!typeMatch?r.staffType:'',true)}</div>`
    + `<div class="ln">${t('4. อุบัติเหตุฯ ที่เกิดขึ้น วันที่')}${fx(inc.d)}${t('เดือน')}${fx(inc.m)}${t('พ.ศ')}${fx(inc.y)}${t('เวลา')}${fx(r.incidentTime)}${t('น.')}</div>`
    + `<div class="ln in1">${t('สถานที่')}${fx(r.location,true)}</div>`
    + `<div class="ln">${t('5. ลักษณะอุบัติเหตุฯ')}</div>`
    + `<div class="ln in1">${ck(hasExp('ของแหลมคม'))} ${t('ของแหลมคมที่ปนเปื้อนเลือดหรือสารคัดหลั่งจากผู้ป่วย ทิ่ม ตำ หรือ บาด')}</div>`
    + `<div class="ln in2 nowrap">${t('ระบุ')}<span class="opt">${ck(eq(sharp,'มีด'))} มีด</span><span class="opt">${ck(eq(sharp,'แก้ว'))} แก้ว</span><span class="opt">${ck(/เข็ม/.test(sharp))} เข็ม</span><span class="opt">${ck(eq(sharp,'เข็มมีรู'))} มีรู</span><span class="opt">${ck(eq(sharp,'เข็มแบบตัน'))} แบบตัน</span><span class="opt">${ck(eq(sharp,'อื่น ๆ'))} อื่น ๆ</span></div>`
    + `<div class="ln in1">${ck(hasExp('ผิวหนัง'))} ${t('ผิวหนังที่มีบาดแผล สัมผัสถูกเลือดหรือสารคัดหลั่งจากผู้ป่วย')}</div>`
    + `<div class="ln in1">${ck(hasExp('เยื่อบุ')||hasExp('เนื้อเยื่อ'))} ${t('เยื่อบุตา เนื้อเยื่ออ่อน สัมผัสถูกเลือดหรือสารคัดหลั่งจากผู้ป่วย')}</div>`
    + `<div class="ln in1">${ck(hasExp('อื่น'))} ${t('อื่น ๆ ระบุ')}${fx(r.exposureOther,true)}</div>`
    + `<div class="ln">${t('6. บรรยายลักษณะงานที่ปฏิบัติและอุบัติเหตุฯ ที่เกิดขึ้น')}</div>`
    + `<div class="ln in1">${fx(r.incidentDescription,true)}</div>`
    + `<div class="ln">${t('7. ตำแหน่งอวัยวะที่เกิดอุบัติเหตุฯ')}</div>`
    + `<div class="ln in1">${fx(body,true)}</div>`
    + (rHas(finger) ? `<div class="ln in1">${t('ตำแหน่งนิ้ว')}${fx(finger,true)}</div>` : '')
    + `<div class="ln">${t('8. การปฐมพยาบาลที่ได้รับ คือ')}</div>`
    + `<div class="ln in1">${fx(r.firstAid,true)}</div>`
    + `<div class="ln">${t('9. ผู้ป่วย/ผู้รับบริการมีผลการตรวจเลือดและประวัติ หลังเกิดอุบัติเหตุ')}</div>`
    + ((r.sourcePatients&&r.sourcePatients.length)?r.sourcePatients:[{name:r.sourceName,hn:r.sourceHn,hiv:r.sourceHiv,hbsAg:r.sourceHbsAg,hcv:r.sourceHcv,risk:r.sourceRisk,riskDetail:r.sourceRiskDetail}]).map((p,idx,a)=>`<div class="ln in1">${t((a.length>1?`(คนที่ ${idx+1}) `:'')+'ชื่อผู้ป่วย')}${fx(p.name)}${t('HN')}${fx(p.hn)}</div><div class="labs">${labRow('9.1','Anti HIV',p.hiv)}${labRow('9.2','HBs Ag',p.hbsAg)}${labRow('9.3','Anti HCV',p.hcv)}</div><div class="ln in1">${t('9.4 ประวัติพฤติกรรมเสี่ยง')}<span class="opt">${ck(eq(p.risk,'มี'))} มี ระบุ</span>${fx(p.riskDetail,true)}<span class="opt">${ck(eq(p.risk,'ไม่มี'))} ไม่มี</span><span class="opt">${ck(eq(p.risk,'ไม่ทราบ'))} ไม่ทราบ</span><span class="opt">${ck(eq(p.risk,'ไม่ได้ถาม'))} ไม่ได้ถาม</span></div>`).join('')
    + `<div class="cst">`
    +   `<div class="crow"><span class="clbl">${t('10. บุคลากรฯ ทราบถึงข้อดี ข้อเสีย ของการตรวจเลือด')}</span><span class="opt">${ck(eq(r.understandsTesting,'ใช่'))} ใช่</span><span class="opt">${ck(eq(r.understandsTesting,'ไม่ใช่'))} ไม่ใช่</span></div>`
    +   crow('บุคลากรฯ ยินยอมที่จะให้ตรวจเลือด', r.consentBloodTest)
    +   crow('บุคลากรฯ ยินดีรับการรักษาเบื้องต้นเพื่อป้องกันเชื้อ HIV', r.consentHivPep)
    +   crow('บุคลากรฯ ยินดีรับการรักษาเบื้องต้นเพื่อป้องกันเชื้อ Hepatitis B', r.consentHbvPep)
    + `</div>`
    + `<div class="sig-row">`
    +   `<div class="sig-col"><div class="sig-sign">${r.sign?`<img src="${r.sign}" alt="">`:''}</div><div class="sig-cap">ลงชื่อ ............................................. (บุคลากร)</div><div class="sig-cap">( ${has(fullName)?esc(fullName):'............................................'} )</div><div class="sig-cap">วันที่ ${cd.d||'.....'} / ${cd.m||'..........'} / ${cd.y||'........'}</div></div>`
    +   `<div class="sig-col"><div class="sig-sign"></div><div class="sig-cap">ลงชื่อ ............................................. (แพทย์ผู้ดูแล)</div><div class="sig-cap">( ${has(r.doctorName)?esc(r.doctorName):'............................................'} )</div><div class="sig-cap">&nbsp;</div></div>`
    + `</div>`
    + `<div class="doc-note"><b>หมายเหตุ</b> &nbsp; การให้ยาป้องกัน ควรได้รับยาเร็วที่สุด (1 – 4 ชั่วโมง หลังเกิดเหตุการณ์) อย่างช้าไม่ควรเกิน 48 – 72 ชั่วโมง หลังเกิดอุบัติเหตุ</div>`
    + docFoot()
    + `</div></div>`;
}
function docPage2(r){
  const t=rT, fx=rFx, ck=rCk, eq=rEq, has=rHas, opt=rOpt, labRow=rLabRow;
  const ps=rDparts(r.pepStart), pe=rDparts(r.pepEnd), f1=rDparts(r.follow1Date), f3=rDparts(r.follow3Date), f6=rDparts(r.follow6Date);
  const complete4=/ครบ 4 สัปดาห์/.test(r.pepOutcome||''), sideEffect=eq(r.pepOutcome,'ครบ 4 สัปดาห์ มีผลข้างเคียง'), notComplete=eq(r.pepOutcome,'รับประทานไม่ครบ');
  return `<div class="doc">`
    + docHead('ต่อ')
    + `<div class="doc-body">`
    + `<div class="ln">${t('11. บุคลากรฯ มีผลการตรวจเลือดและประวัติหลังเกิดอุบัติเหตุทันที (Day 0)')}</div>`
    + `<div class="labs">${labRow('11.1','Anti HIV',r.staffHiv)}${labRow('11.2','HBs Ag',r.staffHbsAg)}${labRow('11.3','Anti HBs',r.staffAntiHbs)}${labRow('11.4','Anti HCV',r.staffHcv)}</div>`
    + `<div class="ln in1">${t('11.5 ประวัติพฤติกรรมเสี่ยง')}<span class="opt">${ck(eq(r.staffRisk,'มี'))} มี ระบุ</span>${fx(r.staffRiskDetail,true)}<span class="opt">${ck(eq(r.staffRisk,'ไม่มี'))} ไม่มี</span><span class="opt">${ck(eq(r.staffRisk,'ไม่ทราบ'))} ไม่ทราบ</span><span class="opt">${ck(eq(r.staffRisk,'ไม่ได้ถาม'))} ไม่ได้ถาม</span></div>`
    + `<div class="ln">${t('12. บุคลากรได้รับการรักษาเพื่อป้องกันการติดเชื้อคือ')}</div>`
    + `<div class="ln in1">${t('12.1 ยาที่ได้รับ')}<span class="opt">${ck(eq(r.pepRegimen,'TDF/3TC/DTG'))} TDF/3TC/DTG</span><span class="opt">${ck(eq(r.pepRegimen,'AZT/3TC/DTG'))} AZT/3TC/DTG</span><span class="opt">${ck(eq(r.pepRegimen,'อื่น ๆ'))} อื่น ๆ</span>${t('ระบุขนาดยา')}${fx(r.pepDose,true)}</div>`
    + `<div class="ln in2 nowrap">${t('วันที่เริ่มรับประทานยา วันที่')}${rFxN(ps.d)}${t('เดือน')}${fx(ps.m)}${t('พ.ศ')}${rFxN(ps.y)}${t('หลังเกิดอุบัติเหตุ')}${rFxN(r.pepHours)}${t('ชม.')}</div>`
    + `<div class="ln in2 nowrap">${t('ถึง วันที่')}${rFxN(pe.d)}${t('เดือน')}${fx(pe.m)}${t('พ.ศ')}${rFxN(pe.y)}</div>`
    + `<div class="ln in1">${t('12.2 ผลการรับประทานยา')}<span class="opt">${ck(complete4)} รับประทานครบ 4 สัปดาห์</span><span class="opt">${ck(eq(r.pepOutcome,'ครบ 4 สัปดาห์ ไม่มีผลข้างเคียง'))} ไม่มีผลข้างเคียง</span><span class="opt">${ck(sideEffect)} มีผลข้างเคียง ระบุ</span>${fx(sideEffect?r.pepNote:'',true)}</div>`
    + `<div class="ln in2">${ck(notComplete)} ${t('ไม่ครบ รับประทานได้')}${fx(notComplete?r.pepDays:'')}${t('วัน เหตุผลที่หยุดยา')}${fx(notComplete?r.pepNote:'',true)}</div>`
    + `<div class="ln in1">${t('12.3 การรักษาอื่น ๆ ระบุ')}${fx(r.otherTreatment,true)}</div>`
    + `<div class="ln in1">${t('12.4 ไม่ได้รับการรักษาเพื่อการป้องกัน เพราะ')}${fx(r.noTreatmentReason,true)}</div>`
    + `<div class="ln">${t('13. ในกรณีให้ยา ผลการตรวจเลือด')}</div>`
    + `<div class="ln in1">${t('13.1 เมื่อเริ่มได้รับยา (Day 0)')}</div>`
    + `<div class="ln in2 sub">${t('ผล CBC')}</div>`
    + `<div class="cbc-grid">`
      + cbcCell('Hemoglobin',r.hemoglobin,'mg%') + cbcCell('Hematocrit',r.hematocrit,'vol%') + cbcCell('WBC Count',r.wbc,'/cu.mm.')
      + cbcCell('Neutrophil',r.neutrophil,'%') + cbcCell('Lymphocyte',r.lymphocyte,'%') + cbcCell('Monocyte',r.monocyte,'%')
      + cbcCell('Basophil',r.basophil,'%') + cbcCell('Eosinophil',r.eosinophil,'%') + cbcCell('Band form',r.bandForm,'%')
      + cbcCell('Red cell morphology',r.redCellMorphology,'','free') + cbcCell('Platelet count',r.plateletCount,'/cu.mm.') + cbcCell('Creatinine',r.creatinine,'mg/dl (0.5–1.2)','free span2')
    + `</div>`
    + `<div class="ln in2 sub">${t('Liver function test')}</div>`
    + `<div class="cbc-grid">`
      + cbcCell('SGPT (ALT)',r.sgpt,'U/L (0–41)') + cbcCell('SGOT (AST)',r.sgot,'U/L (0–38)') + `<div class="cbc-cell"></div>`
    + `</div>`
    + `<div class="ln">${t('14. ผลการตรวจเลือดบุคลากร ในเดือนที่ 1 หลังเกิดอุบัติเหตุ วันที่')}${fx(f1.d)}${t('เดือน')}${fx(f1.m)}${t('พ.ศ')}${fx(f1.y)}</div>`
    + `<div class="labs">${labRow('14.1','Anti HIV',r.follow1HIV)}${labRow('14.2','Anti HCV',r.follow1HCV)}</div>`
    + `<div class="ln">${t('15. ผลการตรวจเลือดบุคลากร ในเดือนที่ 3 หลังเกิดอุบัติเหตุ วันที่')}${fx(f3.d)}${t('เดือน')}${fx(f3.m)}${t('พ.ศ')}${fx(f3.y)}</div>`
    + `<div class="labs">${labRow('15.1','Anti HIV',r.follow3HIV)}</div>`
    + `<div class="ln">${t('16. ผลการตรวจเลือดบุคลากร ในเดือนที่ 6 หลังเกิดอุบัติเหตุ วันที่')}${fx(f6.d)}${t('เดือน')}${fx(f6.m)}${t('พ.ศ')}${fx(f6.y)}</div>`
    + `<div class="labs">${labRow('16.1','Anti HIV',r.follow6HIV)}${labRow('16.2','HBsAg',r.follow6HbsAg)}${labRow('16.3','Anti HCV',r.follow6HCV)}</div>`
    + extraFieldsBlock(r)
    + docFoot()
    + `</div></div>`;
}
let pendingSave = null;
function commitSave(data){
  const list = records(), now = new Date().toISOString();
  if (data.id) { const i = list.findIndex(r => r.id === data.id); data.createdAt = list[i]?.createdAt || now; data.updatedAt = now; if (i >= 0) list[i] = data; else list.push(data); }
  else { data.id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; data.createdAt = now; data.updatedAt = now; list.push(data); }
  persist(list);
}

function download(filename, content, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff',content],{type})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),500); }
function csvExport(){ const items=records(); if(!items.length)return toast('ยังไม่มีข้อมูลสำหรับส่งออก'); const columns=['incidentDate','incidentTime','staffName','staffHn','soundex','department','workGroup','staffType','location','exposureType','bodySite','sourceHiv','sourceHbsAg','sourceHcv','staffHiv','staffHbsAg','staffAntiHbs','staffHcv','pepRegimen','pepStart','follow1HIV','follow1HCV','follow3HIV','follow6HIV','follow6HbsAg','follow6HCV']; const quote=v=>`"${String(Array.isArray(v)?v.join('|'):v??'').replaceAll('"','""')}"`; download(`occupational-exposure-${new Date().toISOString().slice(0,10)}.csv`,[columns.join(','),...items.map(r=>columns.map(c=>quote(r[c])).join(','))].join('\n'),'text/csv;charset=utf-8'); }

buildDynamicFields(); populateSelects(); populateChecks(); addDynamicFields(); reorderFieldsBySheet(); applyFieldConfig(); applySectionTitles(); setupOtherInputs(); updateDurationNote(); updateSoundex(); renderSourcePatients([]); setupSignPad(); applyLogos(loadCachedLogoMap()); renderDashboard(); loadOptionsFromSheet(); loadFieldsFromSheet(); loadSoundexFromSheet(); loadLogoFromSheet(); loadFlowFromSheet();
form.addEventListener('change', e => { if (e.target.matches('select,input[type=checkbox]')) updateOtherVisibility(e.target.name); });
form.addEventListener('input', e => { if (e.target.name === 'staffName' || e.target.name === 'staffName2') updateSoundex(); });
let editorReturn='home';     // where the editor's back/save should return to
function goHome(){ showView('home'); }
function icnFlowHtml(){
  const steps=(FLOW_STEPS&&FLOW_STEPS.length?FLOW_STEPS:DEFAULT_FLOW).slice()
    .sort((a,b)=>((parseFloat(a.section)||0)-(parseFloat(b.section)||0))||(a.order-b.order));
  const cell=(n,item)=>{ const parts=String(item).split('|'); const t=(parts[0]||'').trim(), d=(parts[1]||'').trim(); return `<div class="flow-step"><span class="n">${n}</span><div><b>${esc(t)}</b>${d?`<small>${esc(d)}</small>`:''}</div></div>`; };
  const groups=[], idx={};
  steps.forEach(s=>{ const key=String(s.section); if(!(key in idx)){ idx[key]=groups.length; groups.push({section:s.section,items:[]}); } groups[idx[key]].items.push(s); });
  const single=groups.length<=1;
  const body=groups.map(g=>{
    const flow=`<div class="flow">${g.items.map((s,i)=>cell(i+1,s.item)).join('<span class="flow-arrow">→</span>')}</div>`;
    if(single) return flow;
    const head=/^\d+$/.test(String(g.section).trim())?`ส่วนที่ ${esc(g.section)}`:esc(g.section);
    return `<div class="flow-group"><div class="flow-sub">${head}</div>${flow}</div>`;
  }).join('');
  return `<div class="flow-title">ขั้นตอนการทำงาน ICN / เวรตรวจการ</div>${body}`;
}
function openDashboard(mode){ dashMode=mode||'records'; const admin=dashMode==='admin', icn=dashMode==='icn';
  $('#adminBar').classList.toggle('hidden',!admin);
  const hint=$('#adminHint');
  hint.classList.toggle('hidden',dashMode==='records');
  hint.className = icn ? 'admin-hint icn-flow' : ('notice admin-hint'+(dashMode==='records'?' hidden':''));
  hint.innerHTML = admin ? '<b>โหมดแอดมิน</b><span>แสดงรายการทั้งหมด เลือกรายการเพื่อแก้ไข/จัดการข้อมูลได้ทุกส่วน (1-5)</span>' : (icn ? icnFlowHtml() : '');
  $('#dashEyebrow').textContent=admin?'ADMIN':(icn?'ICN':'RECORDS');
  $('#dashTitle').textContent=admin?'ส่วนแอดมิน — การรักษาและติดตามผล':(icn?'ICN / เวรตรวจการ — การรักษาเพื่อป้องกัน (ส่วนที่ 4)':'ทะเบียนอุบัติเหตุ');
  $('#panelEyebrow').textContent=icn?'ICN':'RECORDS';
  $('#panelTitle').textContent=icn?'รายการอุบัติเหตุ (ส่วนที่ 4)':'รายการอุบัติเหตุ';
  $('.stats').classList.toggle('hidden',icn); // hide the overview stat tiles in ICN mode
  showView('dashboard'); renderDashboard($('#search').value); }
function openStaffNew(){ editorReturn='home'; resetForm(); showView('editor'); initSignPad(); }
function openStaffEdit(r){ editorReturn='records'; fillForm(r); applyMode('staff'); showView('editor'); initSignPad(); }
function openAdminEdit(r){ editorReturn='admin'; fillForm(r); applyMode('admin'); $('#formTitle').textContent='แก้ไข/จัดการข้อมูลทั้งหมด'; showView('editor'); initSignPad(); }
function openIcnEdit(r){ editorReturn='icn'; fillForm(r); applyMode('icn'); $('#formTitle').textContent='การรักษาเพื่อป้องกัน (ส่วนที่ 4)'; showView('editor'); }
function editorBack(){ if(editorReturn==='home') goHome(); else openDashboard(editorReturn); }
// ---- Sample-data filler (fills ONLY the sections active in the current mode) ----
function drawDemoSignature(){
  const c=signCanvas(); if(!c||!c.getContext) return; initSignPad(); if(!signCtx) return;
  const w=c.clientWidth||600, h=c.clientHeight||200;
  signCtx.beginPath(); signCtx.moveTo(w*0.14,h*0.62);
  signCtx.bezierCurveTo(w*0.26,h*0.15,w*0.34,h*0.9,w*0.46,h*0.5);
  signCtx.bezierCurveTo(w*0.56,h*0.18,w*0.62,h*0.85,w*0.74,h*0.52);
  signCtx.lineTo(w*0.84,h*0.4); signCtx.stroke();
  signCtx.beginPath(); signCtx.moveTo(w*0.2,h*0.8); signCtx.lineTo(w*0.72,h*0.8); signCtx.stroke();
  signHasInk=true; signSave();
}
function fillDemo(){
  const el=n=>form.elements[n];
  const setV=(n,v)=>{ const e=el(n); if(!e||!e.tagName)return; if(e.tagName==='SELECT'&&v&&![...e.options].some(o=>o.value===v))e.add(new Option(v,v)); e.value=v; };
  const setRadio=(n,v)=>{ const g=el(n); if(!g)return; [...(g.length?g:[g])].forEach(x=>{ if(x.type==='radio')x.checked=(x.value===v); }); };
  const setChecks=(n,vals)=>{ const g=el(n); if(!g)return; [...(g.length?g:[g])].forEach(x=>{ if(x.type==='checkbox')x.checked=vals.includes(x.value); }); };
  const today=new Date().toISOString().slice(0,10), plus=d=>{ const t=new Date(); t.setDate(t.getDate()+d); return t.toISOString().slice(0,10); };
  const pages=PAGES_BY_MODE[formMode]||STAFF_PAGES, has=pg=>pages.includes(pg);
  if(has(0)){
    setV('department','ห้องผ่าตัด'); setV('workGroup','กลุ่มงานการพยาบาล'); setV('staffName','สมหญิง'); setV('staffName2','ใจดี');
    setV('staffHn','456789'); setV('phone','081-234-5678'); setV('line','@somying'); setV('age','29'); setV('gender','หญิง');
    setV('workYears','5'); setV('workMonths','3'); setV('staffType','พยาบาลวิชาชีพ');
    setV('incidentDate',today); setV('incidentTime','14:20'); setV('location','ห้องผ่าตัดที่ 3');
  }
  if(has(1)){
    setChecks('exposureType',['ของแหลมคม']); setV('sharpType','เข็มมีรู');
    setV('incidentDescription','ถูกเข็มฉีดยาตำที่นิ้วหัวแม่มือขวาขณะปิดปลอกเข็มหลังทำหัตถการ');
    setChecks('bodySite',['มือขวา']); setChecks('fingerSite',['หัวแม่มือ']); setV('firstAid','บีบเลือดออก ล้างด้วยน้ำสะอาดและสบู่');
    renderSourcePatients([{name:'ผู้ป่วยชาย ตัวอย่าง',hn:'778899',hiv:'บวก',hbsAg:'ลบ',hcv:'ลบ',risk:'ไม่ทราบ',riskDetail:'ไม่มีข้อมูลประวัติ'}]);
  }
  if(has(2)){
    setRadio('understandsTesting','ใช่'); setRadio('consentBloodTest','ใช่'); setRadio('consentHivPep','ใช่'); setRadio('consentHbvPep','ใช่');
    setV('staffRisk','ไม่มี'); setV('staffRiskDetail','-'); setV('consentDate',today); drawDemoSignature();
  }
  if(has(3)){
    setV('hn','000456'); setRadio('staffHiv','ลบ'); setRadio('staffHbsAg','ลบ'); setRadio('staffAntiHbs','บวก'); setRadio('staffHcv','ลบ');
    setV('pepRegimen','TDF/3TC/DTG'); setV('pepDose','1x1 หลังอาหารเช้า'); setV('pepStart',today); setV('pepHours','2');
    setV('pepEnd',plus(28)); setV('pepOutcome','ครบ 4 สัปดาห์ ไม่มีผลข้างเคียง'); setV('pepDays','28'); setV('pepNote','ไม่มีผลข้างเคียง'); setV('otherTreatment','-');
    Object.entries({hemoglobin:'12.5',hematocrit:'38',redCellMorphology:'ปกติ',plateletCount:'250000',wbc:'7500',neutrophil:'60',lymphocyte:'32',monocyte:'5',basophil:'1',eosinophil:'2',bandForm:'0',creatinine:'0.8',sgpt:'22',sgot:'25'}).forEach(([k,v])=>setV(k,v));
  }
  if(has(4)){
    setV('follow1Date',plus(30)); setRadio('follow1HIV','ลบ'); setRadio('follow1HCV','ลบ');
    setV('follow3Date',plus(90)); setRadio('follow3HIV','ลบ');
    setV('follow6Date',plus(180)); setRadio('follow6HIV','ลบ'); setRadio('follow6HbsAg','ลบ'); setRadio('follow6HCV','ลบ');
    setV('notes','ข้อมูลตัวอย่างสำหรับทดสอบระบบ'); setV('doctorName','นพ.วิชัย รักษาดี');
  }
  updateAllOther(); updateSoundex();
  toast('กรอกข้อมูลตัวอย่างเฉพาะส่วนของโหมดนี้แล้ว');
}
$('#fillDemo').onclick=fillDemo;
$('#homeLink').onclick=goHome;
$('#homeLink').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome();}};
$('#dashHome').onclick=goHome;
$$('.menu-card').forEach(card=>card.onclick=()=>{const go=card.dataset.go; if(go==='new'){openStaffNew();} else if(go==='records'){openDashboard('records');} else if(go==='admin'){openDashboard('admin');} else if(go==='icn'){openDashboard('icn');}});
$('#newRecord').onclick=openStaffNew;
$('#backBtn').onclick=editorBack;
$('#search').oninput=e=>renderDashboard(e.target.value);
$('#addPatient').onclick=()=>{ const l=collectSourcePatients(); l.push({}); renderSourcePatients(l); };
$('#sourcePatients').onclick=e=>{ const btn=e.target.closest('.sp-remove'); if(!btn)return; const l=collectSourcePatients(); l.splice(+btn.closest('.patient-card').dataset.idx,1); renderSourcePatients(l); };
form.onsubmit=e=>{e.preventDefault(); pendingSave=formDataObject(); $('#warnDialog').showModal();};
$('#warnCancel').onclick=()=>{ $('#warnDialog').close(); pendingSave=null; };
function fitPreview(){ const vp=$('.a4-viewport'); if(!vp)return; const avail=vp.clientWidth-20; const scale=Math.min(1, avail/794); vp.querySelectorAll('.a4-page').forEach(pg=>{ pg.style.zoom=scale; }); }
// preview dialog states: 'save' (edit + confirm), 'ref' (read-only close), 'report' (edit + print/PDF + close)
let previewState='save', reportRecord=null, reportEditFn=null;
function setPreviewMode(state){ previewState=state; const report=state==='report', ref=state==='ref';
  $('#previewPrint').classList.toggle('hidden',!report);
  $('#previewConfirm').classList.toggle('hidden',ref);
  $('#previewEdit').classList.toggle('hidden', report && !reportEditFn);
  $('#previewEdit').textContent = report ? '✎ แก้ไขข้อมูล' : (ref ? 'ปิด' : '← แก้ไข');
  $('#previewConfirm').textContent = report ? 'ปิด' : 'ยืนยันบันทึก';
}
function openReport(r, editFn){ reportRecord=r; reportEditFn=editFn||null; setPreviewMode('report'); $('#previewBody').innerHTML=fullDocHtml(r); $('#previewDialog').showModal(); requestAnimationFrame(fitPreview); const vp=$('.a4-viewport'); if(vp)vp.scrollTop=0; }
function printReport(){ if(!reportRecord)return; $('#printArea').innerHTML=fullDocHtml(reportRecord); $('#previewDialog').close(); document.body.classList.add('printing'); setTimeout(()=>window.print(),60); }
$('#warnOk').onclick=()=>{ if(!pendingSave){ $('#warnDialog').close(); return; } setPreviewMode('save'); $('#warnDialog').close(); $('#previewBody').innerHTML = formMode==='icn' ? fullDocHtml(pendingSave) : reportA4Html(pendingSave, formMode==='admin'?'admin':'staff'); $('#previewDialog').showModal(); requestAnimationFrame(fitPreview); const vp=$('.a4-viewport'); if(vp)vp.scrollTop=0; };
$('#viewPrevDoc').onclick=()=>{ setPreviewMode('ref'); $('#previewBody').innerHTML=docPage1(formDataObject()); $('#previewDialog').showModal(); requestAnimationFrame(fitPreview); const vp=$('.a4-viewport'); if(vp)vp.scrollTop=0; };
$('#viewReport').onclick=()=>{ openReport(formDataObject(), null); };
$('#viewReportDetail').onclick=()=>{ const r=records().find(x=>x.id===selectedId); if(!r)return; openReport(r, ()=>{ $('#detailDialog').close(); if(dashMode==='admin')openAdminEdit(r); else if(dashMode==='icn')openIcnEdit(r); else openStaffEdit(r); }); };
$('#previewPrint').onclick=()=>printReport();
window.addEventListener('resize',()=>{ if($('#previewDialog').open) fitPreview(); });
$('#previewEdit').onclick=()=>{ $('#previewDialog').close(); if(previewState==='report'){ if(reportEditFn) reportEditFn(); } else if(previewState!=='ref'){ pendingSave=null; } };
$('#previewConfirm').onclick=()=>{ if(previewState==='report'){ $('#previewDialog').close(); return; } if(!pendingSave)return; commitSave(pendingSave); pendingSave=null; $('#previewDialog').close(); toast('บันทึกข้อมูลเรียบร้อย'); editorBack(); };
$('#warnDialog').addEventListener('cancel',()=>{ pendingSave=null; });
$('#previewDialog').addEventListener('cancel',()=>{ pendingSave=null; });
$('#recordRows').onclick=e=>{const btn=e.target.closest('[data-view]');if(!btn)return;selectedId=btn.dataset.view;const r=records().find(x=>x.id===selectedId);if(!r)return;if(dashMode==='icn'){openIcnEdit(r);return;}$('#detailContent').innerHTML=detailHtml(r);$('#editRecord').textContent=dashMode==='admin'?'แก้ไข/จัดการทั้งหมด':'แก้ไข';$('#detailDialog').showModal();};
$('.dialog-close').onclick=()=>$('#detailDialog').close();
$('#editRecord').onclick=()=>{const r=records().find(x=>x.id===selectedId);if(r){$('#detailDialog').close(); if(dashMode==='admin')openAdminEdit(r); else if(dashMode==='icn')openIcnEdit(r); else openStaffEdit(r);}};
$('#deleteRecord').onclick=()=>{if(!confirm('ยืนยันการลบรายการนี้? ข้อมูลที่ลบไม่สามารถกู้คืนได้'))return;persist(records().filter(r=>r.id!==selectedId));$('#detailDialog').close();renderDashboard();toast('ลบรายการแล้ว')};
$('#printRecord').onclick=()=>{ const r=records().find(x=>x.id===selectedId); if(!r)return; $('#printArea').innerHTML=fullDocHtml(r); $('#detailDialog').close(); document.body.classList.add('printing'); setTimeout(()=>window.print(),60); };
window.addEventListener('afterprint',()=>{ document.body.classList.remove('printing'); $('#printArea').innerHTML=''; });
$('#exportJson').onclick=()=>{const data=records();if(!data.length)return toast('ยังไม่มีข้อมูลสำหรับสำรอง');download(`occupational-exposure-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json')};
$('#exportCsv').onclick=csvExport;
