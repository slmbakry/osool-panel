/* MBM · تجهيز الداتا — كتابة الملفات
   applyDev: بيكتب النتيجة على نسخة ملف المطور (تصحيحات، علامات مراجعة، سطور جديدة، أشهر ملغاة، كشف المستحقات، السجل).
   reviewBook: ملف مراجعة لوحده (ملخص المستحقات، شهر بشهر، الإيجار للمراجعة، محتاج قرار).
   نفس الكود شغال في الإضافة وفي node. */
(function (root) {
  'use strict';
  var L = (typeof module !== 'undefined' && module.exports) ? require('../logic.js') : root.OsoolLogic;
  var SHEET = 'العقود Contracts', SKIP = 'أشهر ملغاة Skipped months', LOG = 'تغييرات MBM', DUES = 'كشف المستحقات Dues';
  var DATE_COLS = ['تاريخ الإنهاء', 'تاريخ التوقيع', 'بداية العقد', 'نهاية العقد', 'تاريخ أول دفعة', 'مسدد حتى'];
  var fill = function (argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; };
  var YELLOW = fill('FFFFE699'), GREEN = fill('FFE6F4EA'), BLUE = fill('FFE8EEFC'), ORANGE = fill('FFF8CBAD'), RED = fill('FFFADBD8'), HEAD = fill('FFF5EEDC');
  var STATE_FILL = { 'ناقص': RED, 'زايد': ORANGE, 'مقدم': BLUE, 'عليه ناقص': RED, 'مدفوع زيادة': ORANGE, 'فيه فروق شهور': YELLOW };
  var KIND = { fix: 'تصحيح', note: 'ملاحظة', review: 'محتاج قرار', flag: 'للمراجعة' };

  function cellVal(v) { if (v && typeof v === 'object') { if (v.formula !== undefined || v.sharedFormula !== undefined) return v.result; if (v instanceof Date) return L.dateToSerial(v); if (v.richText) return v.richText.map(function (x) { return x.text; }).join(''); } return v; }
  // كل خانة لازم ياخد ستايل لوحده، لأن ExcelJS بيشارك الستايل بين الخانات
  function paint(cell, f, date) { var st = JSON.parse(JSON.stringify(cell.style || {})); st.fill = JSON.parse(JSON.stringify(f)); if (date) st.numFmt = 'dd/mm/yyyy'; cell.style = st; }
  function out(col, v) { if (DATE_COLS.indexOf(col) !== -1 && typeof v === 'number' && v > 20000) return L.serialToDate(v); return v === '' ? null : v; }
  function shown(col, v) { if (v === null || v === undefined || v === '') return '—'; if (DATE_COLS.indexOf(col) !== -1 && typeof v === 'number' && v > 20000) return L.fmt(L.serialToDate(v)); return typeof v === 'number' ? v.toLocaleString('en-US') : String(v); }
  function d(s) { return s ? L.serialToDate(s) : null; }
  function lastRow(ws) { var last = 1; ws.eachRow(function (row, i) { var v = row.getCell(1).value; if (v !== null && v !== undefined && String(cellVal(v)).trim()) last = i; }); return last; }
  // شيت بيتجمع من كذا ملف: نشيل سطور نفس الملف ونحط الجديد
  function mergeSheet(wb, name, cols, rows, srcCol, src, keepIf) {
    var old = wb.getWorksheet(name), keep = [];
    if (old) {
      old.eachRow(function (row, i) { if (i < 2) return; var v = []; for (var c = 1; c <= cols.length; c++) v.push(cellVal(row.getCell(c).value)); if (v[srcCol] === src) return; if (keepIf && !keepIf(v)) return; keep.push(v); });
      wb.removeWorksheet(old.id);
    }
    var ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(function (c) { return { header: c[0], width: c[1], style: c[2] ? { numFmt: c[2] } : undefined }; });
    keep.forEach(function (v) { ws.addRow(v.map(function (x, i) { return cols[i][2] === 'dd/mm/yyyy' && typeof x === 'number' ? L.serialToDate(x) : x; })); });
    rows.forEach(function (v) { ws.addRow(v); });
    ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = HEAD;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  }
  var DUES_COLS = [['كود الوحدة', 14], ['رقم العقد', 15], ['الشهر', 12, 'dd/mm/yyyy'], ['رقم القسط', 10], ['بداية القسط', 12, 'dd/mm/yyyy'], ['المستحق', 12, '#,##0'], ['المدفوع', 12, '#,##0'], ['الفرق', 12, '#,##0'], ['الرصيد', 13, '#,##0'], ['الحالة', 10], ['ملف أصول', 16]];
  function duesRows(R, src) {
    var rows = [];
    R.dues.forEach(function (x) { x.months.forEach(function (m) { rows.push([x.code, m.no || null, d(m.month), m.inst, d(m.instDate), m.due, m.paid, m.diff, m.bal, m.state + (m.loose ? ' *' : ''), src]); }); });
    return rows;
  }

  function applyDev(wb, R, src) {
    var ws = wb.getWorksheet(SHEET), H = ws.getRow(1).values, colOf = function (h) { return H.indexOf(h); };
    R.changes.forEach(function (c) {
      if (!c.col || !c.row) return; var cell = ws.getRow(c.row).getCell(colOf(c.col)); if (!cell) return;
      if (c.kind === 'flag') { // منغيرش القيمة، بس نعلّمها
        paint(cell, ORANGE, DATE_COLS.indexOf(c.col) !== -1);
        cell.note = 'MBM للمراجعة: ' + c.why + '\nالشيت بيقول: ' + shown(c.col, c.val);
        return;
      }
      cell.value = out(c.col, c.val); paint(cell, c.kind === 'note' ? BLUE : YELLOW, DATE_COLS.indexOf(c.col) !== -1);
      cell.note = 'MBM: ' + c.why + '\nقبل: ' + shown(c.col, c.old);
    });
    var last = Math.max(2, lastRow(ws));
    R.newRows.forEach(function (n, k) {
      var ri = last + 1 + k, row = ws.getRow(ri);
      Object.keys(n.values).forEach(function (h) { var ci = colOf(h); if (ci < 1) return; var cell = row.getCell(ci); cell.value = out(h, n.values[h]); paint(cell, GREEN, DATE_COLS.indexOf(h) !== -1); });
      var pc = colOf('قيمة الدفعة'); if (pc > 0) row.getCell(pc).value = { formula: 'IF(OR(L' + ri + '="",M' + ri + '=""),"",L' + ri + '*IFERROR(VLOOKUP(M' + ri + ',Lists!$G$2:$H$6,2,FALSE),1))' };
      row.getCell(colOf('كود الوحدة')).note = 'MBM: ' + n.why;
    });
    var sk = wb.getWorksheet(SKIP);
    if (sk && R.skipped.length) {
      var sl = Math.max(2, lastRow(sk));
      R.skipped.forEach(function (x, k) { var row = sk.getRow(sl + 1 + k); row.getCell(1).value = x.code; row.getCell(2).value = x.no || null; row.getCell(3).value = L.serialToDate(x.month); row.getCell(4).value = x.why; [1, 2, 3, 4].forEach(function (i) { paint(row.getCell(i), YELLOW, i === 3); }); });
    }
    // السجل: بيتجمع من كل الملفات. "مش عندنا" بتفضل بس لو مش موجودة في أي ملف اتراجع
    var dev1 = {}; R.devOnly.forEach(function (c) { dev1[c] = 1; });
    var hadLog = !!wb.getWorksheet(LOG), logRows = [];
    R.changes.forEach(function (c) { logRows.push([KIND[c.kind], c.code, c.no, c.col, c.col ? shown(c.col, c.old) : '', c.col ? shown(c.col, c.val) : '', c.why, src]); });
    R.newRows.forEach(function (n) { logRows.push(['سطر جديد', n.code, '', '', '', '', n.why, src]); });
    R.skipped.forEach(function (x) { logRows.push(['شهر ملغي', x.code, x.no, 'أشهر ملغاة', '', L.fmt(L.serialToDate(x.month)), x.why, src]); });
    if (!hadLog) R.devOnly.forEach(function (c) { logRows.push(['مش عندنا', c, '', '', '', '', 'الوحدة في ملف المطور ومش في شيت الملاك في الملفات اللي اتراجعت', src]); });
    mergeSheet(wb, LOG, [['النوع', 12], ['كود الوحدة', 14], ['رقم العقد', 14], ['العمود', 26], ['قبل', 22], ['بعد', 22], ['السبب', 70], ['ملف أصول', 18]], logRows, 7, src,
      function (v) { return v[0] !== 'مش عندنا' || dev1[v[1]]; });
    var dw = mergeSheet(wb, DUES, DUES_COLS, duesRows(R, src), 10, src);
    dw.eachRow(function (row, i) { if (i < 2) return; var f = STATE_FILL[String(cellVal(row.getCell(10).value) || '').replace(' *', '')]; if (f) row.getCell(10).fill = f; });
    return wb;
  }

  // runs: [{ src, R }]
  function reviewBook(ExcelJS, runs) {
    var wb = new ExcelJS.Workbook();
    var sheet = function (name, cols) {
      var ws = wb.addWorksheet(name, { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
      ws.columns = cols.map(function (c) { return { header: c[0], width: c[1], style: c[2] ? { numFmt: c[2] } : undefined }; });
      ws.getRow(1).font = { bold: true }; ws.getRow(1).fill = HEAD; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
      return ws;
    };
    var S = sheet('ملخص المستحقات', [['الحالة', 13], ['كود الوحدة', 13], ['المشروع', 11], ['المالك', 26], ['رقم العقد', 15], ['الكشف من', 12, 'dd/mm/yyyy'], ['نهاية العقد', 12, 'dd/mm/yyyy'], ['يسدد كل', 8], ['المستحق', 13, '#,##0'], ['المدفوع', 13, '#,##0'], ['الفرق', 13, '#,##0'], ['شهور ناقصة', 12, '#,##0'], ['شهور زايدة', 12, '#,##0'], ['مقدم بعد الشهر الحالي', 14, '#,##0'], ['سداد من غير شهر', 13, '#,##0'], ['أول شهر فيه فرق', 13, 'dd/mm/yyyy'], ['مسدد حتى (الخزينة)', 14, 'dd/mm/yyyy'], ['مسدد حتى (المطور)', 14, 'dd/mm/yyyy'], ['ملف أصول', 16]]);
    var all = [];
    runs.forEach(function (r) { r.R.dues.forEach(function (x) { all.push([r.src, x]); }); });
    var rank = { 'عليه ناقص': 0, 'مدفوع زيادة': 1, 'فيه فروق شهور': 2, 'مظبوط': 3 };
    all.sort(function (a, b) { return (rank[a[1].state] - rank[b[1].state]) || (Math.abs(b[1].balance) - Math.abs(a[1].balance)); });
    all.forEach(function (p) {
      var x = p[1], row = S.addRow([x.state, x.code, x.project, x.owner, x.no || null, d(x.start), d(x.end), x.cycle, x.due, x.paid, x.balance, x.under || null, x.over || null, x.ahead || null, x.loose || null, d(x.first), d(x.trPaid), d(x.devPaid), p[0]]);
      if (STATE_FILL[x.state]) row.getCell(1).fill = STATE_FILL[x.state];
    });
    var M = sheet('شهر بشهر', DUES_COLS.slice(0, 10).concat([['ملف أصول', 16]]));
    runs.forEach(function (r) { duesRows(r.R, r.src).forEach(function (v) { var row = M.addRow(v); var f = STATE_FILL[String(v[9]).replace(' *', '')]; if (f) row.getCell(10).fill = f; }); });
    M.addRow([]); M.addRow(['* = فيه سداد في الخزينة من غير خانة شهر، اتوزع على أقدم شهور ناقصة من تاريخه']);
    var F2 = sheet('الإيجار للمراجعة', [['كود الوحدة', 13], ['رقم العقد', 15], ['العمود', 26], ['عند المطور', 22], ['الشيت بيقول', 22], ['السبب', 60], ['ملف أصول', 16]]);
    runs.forEach(function (r) { r.R.changes.filter(function (c) { return c.kind === 'flag'; }).forEach(function (c) { F2.addRow([c.code, c.no, c.col, shown(c.col, c.old), shown(c.col, c.val), c.why, r.src]); }); });
    var Q = sheet('محتاج قرار', [['كود الوحدة', 13], ['رقم العقد', 15], ['السبب', 90], ['ملف أصول', 16]]);
    runs.forEach(function (r) { r.R.changes.filter(function (c) { return c.kind === 'review'; }).forEach(function (c) { Q.addRow([c.code, c.no, c.why, r.src]); }); });
    return wb;
  }

  var api = { applyDev: applyDev, reviewBook: reviewBook, cellVal: cellVal, shown: shown, SHEET: SHEET, SKIP: SKIP, DATE_COLS: DATE_COLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OsoolBook = api;
})(this);
