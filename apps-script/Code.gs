var IC_VERSION='2568-09-28.9';
var IC_SHEET_ID='1MREAXB4CB5LMKc5LliTep45iUahomoYnid3JABh-bxM';   // เปิดชีตด้วย ID ตรง (ใช้ได้ทั้งสคริปต์แบบผูกชีตและสแตนด์อโลน)
function getSS(){ try{ return SpreadsheetApp.openById(IC_SHEET_ID); }catch(e){ return SpreadsheetApp.getActive(); } }
// หาคอลัมน์จากชื่อหัวตาราง (ตัดช่องว่างหน้า-หลัง เผื่อหัวตารางมีเว้นวรรค)
function icHcol(HH, name){ for (var i=0;i<HH.length;i++){ if (String(HH[i]).trim()===name) return i; } return -1; }
// ค่านี้ผ่าน dropdown/validation ของช่องได้ไหม (ลิสต์/ช่วงเซลล์); ชนิดอื่นปล่อยผ่าน
function icDvAllows(dv, val){
  var crit, args;
  try { crit = String(dv.getCriteriaType()); args = dv.getCriteriaValues(); } catch(e){ return true; }
  if (crit === 'VALUE_IN_LIST'){ var list = args[0] || []; for (var i=0;i<list.length;i++){ if (String(list[i]).trim() === String(val).trim()) return true; } return false; }
  if (crit === 'VALUE_IN_RANGE'){ try { var vs = args[0].getValues(); for (var i=0;i<vs.length;i++){ for (var j=0;j<vs[i].length;j++){ if (String(vs[i][j]).trim() === String(val).trim()) return true; } } return false; }catch(e){ return true; } }
  return true;
}
// เขียนแถวใหม่ต่อท้ายแท็บทะเบียน — จับคู่ค่าตามชื่อหัวคอลัมน์ + รันเลขลำดับที่
function icAppend(ss, name, vals){
  var sh = ss.getSheetByName(name);
  if (!sh) return {ok:false, error:'ไม่พบแท็บ '+name};
  var rdata = sh.getDataRange().getValues();
  var hi=-1; for (var i=0;i<Math.min(rdata.length,8);i++){ if (icHcol(rdata[i],'ชื่อบุคลากร')>=0){ hi=i; break; } }
  if (hi<0) return {ok:false, error:'ไม่พบหัวตาราง (ชื่อบุคลากร)'};
  var HH = rdata[hi];
  // สร้างคอลัมน์ระบบท้ายตารางอัตโนมัติถ้ายังไม่มี: JSON (ข้อมูลเต็ม) + ลายเซ็น/ลายเซ็นVCT (รูปลายเซ็นแยกเซลล์ ไม่ถูกตัด)
  ['JSON','ลายเซ็น','ลายเซ็นVCT'].forEach(function(k){ if (icHcol(HH,k) < 0){ sh.getRange(hi+1, HH.length+1).setValue(k); HH = HH.concat([k]); } });
  var newRow=[]; for (var c=0;c<HH.length;c++) newRow.push('');
  Object.keys(vals).forEach(function(k){ var ci=icHcol(HH,k); if (ci>=0 && newRow[ci]==='') newRow[ci]=vals[k]; });
  var seqCol=icHcol(HH,'ลำดับที่'); if (seqCol<0) seqCol=icHcol(HH,'ลำดับ');
  if (seqCol>=0){ var mx=0; for (var r=hi+1;r<rdata.length;r++){ var n=parseInt(rdata[r][seqCol],10); if(!isNaN(n)&&n>mx) mx=n; } newRow[seqCol]=mx+1; }
  var nameCol=icHcol(HH,'ชื่อบุคลากร');
  var lastRow=hi+1; for (var r=hi+1;r<rdata.length;r++){ if (String(rdata[r][nameCol]||'').trim()!=='' || (seqCol>=0 && String(rdata[r][seqCol]||'').trim()!=='')) lastRow=r+1; }
  var rng = sh.getRange(lastRow+1, 1, 1, newRow.length);
  var skipped=[];
  // อ่าน validation ของแถวใหม่ครั้งเดียว → ล้างเฉพาะช่องที่ค่าไม่ตรง (เช่น หน่วยงาน) ให้เขียนค่าจริงได้ ช่องอื่น dropdown คงเดิม
  var dvs; try { dvs = rng.getDataValidations()[0]; } catch(e){ dvs = null; }
  if (dvs){ var cleared=false;
    for (var c=0;c<newRow.length;c++){ if (newRow[c]==='') continue; if (dvs[c] && !icDvAllows(dvs[c], newRow[c])){ sh.getRange(lastRow+1, c+1).clearDataValidations(); cleared=true; } }
    if (cleared) SpreadsheetApp.flush();   // commit การล้างก่อนเขียน
  }
  try { rng.setValues([newRow]); SpreadsheetApp.flush(); }
  catch(e){
    // ถ้ายังถูกปฏิเสธ (ล้างไม่ติด) → ข้ามเฉพาะช่องที่ยังไม่ผ่าน แล้วเขียนรวดเดียว (เร็ว ไม่วนทีละเซลล์)
    var dvs2; try { dvs2 = rng.getDataValidations()[0]; } catch(e3){ dvs2 = null; }
    for (var c2=0;c2<newRow.length;c2++){ if (newRow[c2]==='') continue; if (dvs2 && dvs2[c2] && !icDvAllows(dvs2[c2], newRow[c2])){ skipped.push(String(HH[c2]).trim()); newRow[c2]=''; } }
    try { rng.setValues([newRow]); SpreadsheetApp.flush(); }
    catch(e2){ return {ok:false, error:'เขียนไม่สำเร็จ: '+String(e2)}; }
  }
  return {ok:true, version:IC_VERSION, sheet:name, seq:(seqCol>=0?newRow[seqCol]:''), row:lastRow+1, skipped:skipped};
}
// เปิด URL นี้ในเบราว์เซอร์เพื่อทดสอบ: จะเห็นชื่อชีต + รายชื่อแท็บ + เวอร์ชันโค้ด / รองรับ appendRow ผ่าน JSONP ด้วย
function doGet(e){
  var p = (e && e.parameter) || {};
  var out;
  if (p.action === 'appendRow'){
    try{ var vals = JSON.parse(p.payload || '{}'); out = icAppend(getSS(), p.sheet || '01-บันชีรายชื่อ', vals); }
    catch(err){ out = {ok:false, error:String(err)}; }
  } else {
    out = { ok:true, version:IC_VERSION };
    try{ var ss = getSS(); out.spreadsheet = ss.getName(); out.sheets = ss.getSheets().map(function(s){ return s.getName(); }); }
    catch(err){ out.ok=false; out.error=String(err); }
  }
  var js = JSON.stringify(out);
  var cb = p.callback;   // JSONP: อ่านผลข้ามโดเมนได้ (ไม่ติด CORS)
  if (cb) return ContentService.createTextOutput(cb + '(' + js + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(js).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e){
  try{
    var body = JSON.parse(e.postData.contents);
    var ss = getSS();
    var name = body.sheet || 'fields';
    var sh = ss.getSheetByName(name);

    // append a new incident row to the registry — handled first so it never touches the fields-style header logic below
    if (body.action === 'appendRow'){
      var outA = icAppend(ss, name, body.values || {});
      return ContentService.createTextOutput(JSON.stringify(outA)).setMimeType(ContentService.MimeType.JSON);
    }

    if (!sh){ sh = ss.insertSheet(name); sh.getRange(1,1,1,8).setValues([['ส่วน','ลำดับ','key','คำถาม','ประเภท','ตัวเลือก','จำเป็น','สถานะ']]); }
    var data = sh.getDataRange().getValues();
    var head = data[0];
    function col(name){ var i = head.indexOf(name); if(i<0){ i = head.length; head.push(name); sh.getRange(1, i+1).setValue(name); } return i; }
    var keyCol = head.indexOf('key');
    if (keyCol < 0){ keyCol = col('key'); }

    // 1) update only the สถานะ column (matched by key)
    if (body.action === 'setFieldStatus'){
      var stCol = col('สถานะ'), st = body.statuses || {};
      for (var r=1; r<data.length; r++){
        var k = data[r][keyCol];
        if (k && st.hasOwnProperty(k)) sh.getRange(r+1, stCol+1).setValue(st[k]||'');
      }
      return ContentService.createTextOutput(JSON.stringify({ok:true}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2) upsert every column for each field (matched by key; new keys appended)
    if (body.action === 'saveFields'){
      var cSec=col('ส่วน'), cOrd=col('ลำดับ'), cQ=col('คำถาม'), cType=col('ประเภท'), cOpt=col('ตัวเลือก'), cReq=col('จำเป็น'), cSt=col('สถานะ');
      var idx = {};
      for (var r=1; r<data.length; r++){ var kk=data[r][keyCol]; if(kk) idx[kk]=r+1; }
      var fields = body.fields || [];
      fields.forEach(function(f){
        var row = idx[f.key];
        if (!row){ row = sh.getLastRow()+1; sh.getRange(row, keyCol+1).setValue(f.key); }
        sh.getRange(row, cSec+1).setValue(f.section==null?'':f.section);
        sh.getRange(row, cOrd+1).setValue(f.order==null?'':f.order);
        sh.getRange(row, cQ+1).setValue(f.label||'');
        sh.getRange(row, cType+1).setValue(f.type||'');
        sh.getRange(row, cOpt+1).setValue(f.options||'');
        sh.getRange(row, cReq+1).setValue(f.required?'✓':'');
        sh.getRange(row, cSt+1).setValue(f.status||'');
      });
      // delete rows whose key was removed in the app
      var del = body.deleteKeys || [];
      if (del.length){
        var d2 = sh.getDataRange().getValues();
        for (var r=d2.length-1; r>=1; r--){ var dk=d2[r][keyCol]; if (dk && del.indexOf(dk)>=0) sh.deleteRow(r+1); }
      }
      return ContentService.createTextOutput(JSON.stringify({ok:true, version:IC_VERSION, sheet:name, updated:fields.length, deleted:del.length}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ok:false, error:'unknown action'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}