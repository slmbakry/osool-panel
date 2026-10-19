/* MBM · تجهيز الداتا — عقود الملاك
   بيقارن ملف المطور (سطر لكل عقد) بشيت الملاك والخزينة في ملف أصول المفتوح،
   ويطلّع: تصحيحات، وسطور جديدة، وتجديدات، وأشهر ملغاة، وحاجات محتاجة قرار.
   مفيش هنا أي كتابة على الإكسيل: الشغل كله على نسخة ملف المطور. */
(function (root) {
  'use strict';
  var L = (typeof module !== 'undefined' && module.exports) ? require('../logic.js') : root.OsoolLogic;
  var F = (typeof module !== 'undefined' && module.exports) ? require('../followup.js') : root.OsoolFollow;
  var DAY = 86400000;

  // أعمدة ملف المطور (الصف الأول بالعربي)
  var C = {
    code: 'كود الوحدة', unit: 'الوحدة', owner: 'المالك', no: 'رقم العقد', prev: 'رقم العقد السابق', status: 'الحالة',
    endedOn: 'تاريخ الإنهاء', signed: 'تاريخ التوقيع', start: 'بداية العقد', end: 'نهاية العقد', after: 'أشهر بعد النهاية',
    rent: 'الإيجار الشهري (السنة الأولى)', cycle: 'دورة السداد', perPay: 'قيمة الدفعة', firstPay: 'تاريخ أول دفعة',
    incType: 'نوع الزيادة السنوية', deposit: 'التأمين', auto: 'تجديد تلقائي', paid: 'مسدد حتى', method: 'طريقة السداد', notes: 'ملاحظات'
  };
  var YEARS = ['السنة 2', 'السنة 3', 'السنة 4', 'السنة 5', 'السنة 6', 'السنة 7', 'السنة 8'];
  var CYCLE = { 1: 'شهري / Monthly', 2: 'كل شهرين / Every 2 months', 3: 'ربع سنوي / Quarterly', 6: 'نصف سنوي / Every 6 months', 12: 'سنوي / Annual' };
  var INC = { none: 'بدون زيادة / None', pct: 'نسبة % / Percentage', amt: 'إيجار جديد / New amount' };
  var ST = { active: 'ساري / Active', renewed: 'تم تجديده / Renewed', ended: 'منتهي / Ended' };
  var METHOD = [[/تحويل|بنك|bank|transfer|instapay|انستا/i, 'تحويل بنكي / Bank transfer'], [/شيك|cheque|check/i, 'شيك / Cheque'], [/كاش|نقد|cash/i, 'نقدي / Cash'], [/بطاق|card|فيزا|visa/i, 'بطاقة / Card']];

  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function num(v) { var n = Number(v); return isFinite(n) && v !== '' && v !== null ? n : 0; }
  function day(v) { return v ? Math.floor(Number(v)) : 0; } // سيريال الإكسيل باليوم
  function fmtS(s) { return s ? L.fmt(L.serialToDate(s)) : '—'; }
  function money(n) { return Math.round(n).toLocaleString('en-US'); }

  // ---------- عقودنا من شيت الملاك ----------
  // سطر لكل وحدة: بداية ونهاية العقد الحالي، والإيجار سنة بسنة من خانات الشهور
  function ourContracts(owner, settings, paid) {
    var c = owner.cols, m = owner.months || {}, keys = Object.keys(m), out = [];
    var hasKey = {}; keys.forEach(function (k) { hasKey[k] = m[k].some(function (v) { return num(v) > 0; }); });
    for (var i = 0; i < c['كود'].length; i++) {
      var code = str(c['كود'][i]); if (!code || code === '1') continue;
      var u = { code: code, project: str(c['المشروع'] && c['المشروع'][i]), settle: str(c['تسويات'] && c['تسويات'][i]) };
      if (!u.project && !str(c['شقة'] && c['شقة'][i])) continue;
      // وحدات N-F بتدخل هنا (ليها عقود ملاك برضه)، وOUT بنعدّيها تحت
      if (!F.inScope(u, Object.assign({}, settings || F.DEFAULT_SETTINGS, { nf: true }), true)) continue;
      var start = day(c['بداية العقد'] && c['بداية العقد'][i]), end = day(c['نهاية العقد'] && c['نهاية العقد'][i]);
      var val = (function (ii) { return function (k) { return m[k] ? num(m[k][ii]) : 0; }; })(i);
      var every = num(c['يسدد كل'] && c['يسدد كل'][i]);
      var p = paid[code];
      out.push({
        idx: i, code: code, project: u.project, settle: u.settle, owner: str(c['الاسم'] && c['الاسم'][i]),
        unitTitle: [u.project, str(c['عمارة'] && c['عمارة'][i]) && 'عمارة ' + str(c['عمارة'][i]), str(c['شقة'] && c['شقة'][i]) && 'شقة ' + str(c['شقة'][i])].filter(Boolean).join(' · '),
        start: start, end: end, val: val, has: function (k) { return !!m[k] && hasKey[k]; },
        cycle: CYCLE[every] ? every : 1, cycleBad: every && !CYCLE[every] ? str(c['يسدد كل'][i]) : '',
        deposit: c['التأمين'] ? num(c['التأمين'][i]) : null,
        method: methodOf(c['الدفع'] && c['الدفع'][i]),
        paid: p && p.end ? day(p.end) : 0,
        out: u.settle.toUpperCase() === 'OUT'
      });
    }
    return out;
  }
  // إيجار كل سنة من سنين العقد: أول شهر في السنة، ولو فاضي الأكتر تكرار في السنة (لو نصها على الأقل في الملف)
  function yearsFor(u, start, end) {
    var out = []; if (!start) return out;
    var sd = L.serialToDate(start), months = end ? Math.max(1, Math.round((end - start + 1) / 30.4375)) : 12, ny = Math.min(8, Math.ceil(months / 12));
    for (var y = 0; y < ny; y++) {
      var k0 = L.monthKey(L.addMonths(sd, 12 * y)), v = u.has(k0) ? u.val(k0) : 0;
      if (!v) {
        var cnt = {}, best = 0, bestN = 0, seen = 0;
        for (var j = 0; j < 12; j++) { var kk = L.monthKey(L.addMonths(sd, 12 * y + j)); if (!u.has(kk)) continue; seen++; var vv = u.val(kk); if (vv) { cnt[vv] = (cnt[vv] || 0) + 1; if (cnt[vv] > bestN) { bestN = cnt[vv]; best = vv; } } }
        v = seen >= 6 ? best : 0;
      }
      out.push(v || null);
    }
    return out;
  }
  function gapsFor(u, start, end, today) {
    var out = []; if (!start || !end) return out;
    var d = L.serialToDate(start), last = L.serialToDate(Math.min(end, today));
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    while (d <= last) { var k = L.monthKey(d); if (u.has(k) && !u.val(k)) out.push(L.dateToSerial(d)); d = L.addMonths(d, 1); }
    return out;
  }
  function methodOf(v) { v = str(v); if (!v) return ''; for (var i = 0; i < METHOD.length; i++) if (METHOD[i][0].test(v)) return METHOD[i][1]; return ''; }
  function cycleOf(label) { label = str(label); for (var k in CYCLE) if (CYCLE[k] === label) return Number(k); return 0; }

  // ---------- المقارنة ----------
  function reconcile(o) {
    var today = day(o.today || L.dateToSerial(L.todayUTC()));
    var paid = F.ownerPaid(o.treasury);
    var ours = ourContracts(o.owner, o.settings, paid);
    var dev = o.devRows, byU = {};
    dev.forEach(function (r) { var k = str(r[C.code]); (byU[k] = byU[k] || []).push(r); });
    var R = { changes: [], newRows: [], skipped: [], devOnly: [], counts: { matched: 0, fixed: 0, review: 0, renewals: 0, added: 0, outSkipped: 0 } };
    var fix = function (r, col, oldV, newV, why, kind) { R.changes.push({ row: r._row, code: str(r[C.code]), no: str(r[C.no]), col: col, old: oldV, val: newV, why: why, kind: kind || 'fix' }); };
    var review = function (r, why) { R.changes.push({ row: r._row, code: str(r[C.code]), no: str(r[C.no]), col: '', old: '', val: '', why: why, kind: 'review' }); };

    ours.forEach(function (u) {
      var rows = (byU[u.code] || []).slice().sort(function (a, b) { return day(a[C.start]) - day(b[C.start]); });
      if (!rows.length) {
        if (u.out) { R.counts.outSkipped++; return; }
        var nr = newRow(u, null, u.start, u.end, today, 'وحدة في ملف أصول ومش في ملف المطور (البداية من شيت الملاك، وهي أول عقد)');
        R.newRows.push(nr); R.counts.added++; addGaps(u, '', u.start, u.end); return;
      }
      // بداية العقد في شيت الملاك بتاعة أول عقد بس، فالفترات بناخدها من ملف المطور ونراجع عليها خانات الشهور
      rows.forEach(function (r, ri) {
        if (str(r[C.status]) === 'مسودة / Draft') return;
        R.counts.matched++;
        var isLast = ri === rows.length - 1, st = day(r[C.start]), en = day(r[C.end]);
        rentFix(r, u, st, en, fix);
        if (isLast) lastRow(r, u, st, en);
        addGaps(u, str(r[C.no]), st, isLast && u.end > en ? u.end : en);
      });
    });
    function lastRow(r, u, st, en) {
      // نهاية العقد: لو الشيت أبعد، يا اتمد يا اتجدد. لو الإيجار اتغير بعد نهاية المطور يبقى تجديد
      if (u.end && en && u.end > en + 1) {
        var after = L.monthKey(new Date(L.serialToDate(en).getTime() + DAY)), before = L.monthKey(L.serialToDate(en));
        var vA = u.has(after) ? u.val(after) : 0, vB = u.has(before) ? u.val(before) : 0;
        if (vA && vB && Math.abs(vA - vB) > 0.5) {
          var ns = en + 1;
          R.newRows.push(newRow(u, r, ns, u.end, today, 'تجديد: الإيجار في شيت الملاك اتغير من ' + money(vB) + ' لـ ' + money(vA) + ' بعد نهاية ' + str(r[C.no])));
          if (str(r[C.status]) !== ST.renewed) fix(r, C.status, r[C.status], ST.renewed, 'اتجدد من ' + fmtS(ns) + ' لحد ' + fmtS(u.end));
          R.counts.renewals++;
        } else fix(r, C.end, r[C.end], u.end, 'العقد اتمد: نهايته في شيت الملاك ' + fmtS(u.end));
      } else if (u.end && en && u.end < en - 1) review(r, 'نهاية العقد عند المطور ' + fmtS(en) + ' وفي شيت الملاك ' + fmtS(u.end));
      else if (num(r[C.after]) && en < today) review(r, 'العقد خلص ' + fmtS(en) + ' ولسه بيتحسب ' + num(r[C.after]) + ' شهر بعده، ومفيش تجديد في شيت الملاك');
      var cy = cycleOf(r[C.cycle]);
      if (u.cycleBad) review(r, 'دورة السداد في شيت الملاك مكتوبة "' + u.cycleBad + '"');
      else if (cy !== u.cycle) fix(r, C.cycle, r[C.cycle], CYCLE[u.cycle], 'يسدد كل ' + u.cycle + ' شهر في شيت الملاك');
      if (u.deposit && num(r[C.deposit]) !== u.deposit) fix(r, C.deposit, r[C.deposit], u.deposit, 'التأمين في شيت الملاك');
      if (u.method && !str(r[C.method])) fix(r, C.method, r[C.method], u.method, 'طريقة الدفع في شيت الملاك');
      // مسدد حتى: ممنوع نرجّعه لورا، ولو الخزينة أقل نكتب ملاحظة
      var dp = day(r[C.paid]);
      if (u.paid && u.paid > dp) fix(r, C.paid, r[C.paid], u.paid, 'آخر سداد ايجار في الخزينة لحد ' + fmtS(u.paid));
      else if (u.paid && dp && u.paid < dp) {
        var note = 'حسب الخزينة: مسدد حتى ' + fmtS(u.paid) + ' (MBM)';
        if (str(r[C.notes]).indexOf('حسب الخزينة') === -1) fix(r, C.notes, r[C.notes], (str(r[C.notes]) ? str(r[C.notes]) + ' | ' : '') + note, 'مسدد حتى عند المطور ' + fmtS(dp) + ' أبعد من الخزينة، ومينفعش نرجّعه', 'note');
      } else if (!u.paid && !dp) review(r, 'مفيش سداد ايجار للوحدة في الخزينة، ومسدد حتى فاضي');
    }
    function addGaps(u, no, st, en) {
      gapsFor(u, st, en, today).forEach(function (g) { R.skipped.push({ code: u.code, no: no, month: g, why: 'الشهر فاضي في شيت الملاك (MBM)' }); });
    }
    // وحدات عند المطور ومش في نطاق الملف ده (بنسيبها زي ما هي)
    var mine = {}; ours.forEach(function (u) { mine[u.code] = 1; });
    var all = {}; (o.owner.cols['كود'] || []).forEach(function (c) { all[str(c)] = 1; });
    Object.keys(byU).forEach(function (k) { if (!all[k]) R.devOnly.push(k); });
    R.counts.fixed = R.changes.filter(function (x) { return x.kind !== 'review'; }).length;
    R.counts.review = R.changes.filter(function (x) { return x.kind === 'review'; }).length;
    R.scope = ours.length;
    return R;

  }

  // الإيجار سنة بسنة: نصحح اللي نعرفه بس، واللي الشهور بتاعته مش في الملف بنسيبه
  function rentFix(r, u, st, en, fix) {
    var Y = yearsFor(u, st, en); if (!Y.length) return;
    var known = Y.filter(function (v) { return v; }).length;
    if (Y[0] && Math.abs(num(r[C.rent]) - Y[0]) > 0.5) fix(r, C.rent, r[C.rent], Y[0], 'إيجار ' + L.monthLabel(L.monthKey(L.serialToDate(st))) + ' في شيت الملاك');
    var base = Y[0] || num(r[C.rent]);
    var type = str(r[C.incType]);
    var differs = Y.some(function (v) { return v && base && Math.abs(v - base) > 0.5; });
    if (type === INC.pct) {
      for (var y = 1; y < Y.length && y <= 7; y++) {
        if (!Y[y] || !Y[y - 1]) continue;
        var pct = Math.round((Y[y] / Y[y - 1] - 1) * 10000) / 100, cur = num(r[YEARS[y - 1]]);
        if (Math.abs(pct - cur) > 0.5) fix(r, YEARS[y - 1], r[YEARS[y - 1]], pct, 'الإيجار في شيت الملاك ' + money(Y[y - 1]) + ' ← ' + money(Y[y]));
      }
    } else if (type === INC.amt) {
      for (var z = 1; z < Y.length && z <= 7; z++) {
        if (Y[z] && Math.abs(num(r[YEARS[z - 1]]) - Y[z]) > 0.5) fix(r, YEARS[z - 1], r[YEARS[z - 1]], Y[z], 'إيجار السنة ' + (z + 1) + ' في شيت الملاك');
      }
    } else if (differs && known >= 2) {
      // عند المطور بدون زيادة، والشيت فيه زيادات: نحولها "إيجار جديد" بالمبالغ
      fix(r, C.incType, r[C.incType], INC.amt, 'الإيجار بيتغير في شيت الملاك');
      for (var w = 1; w < Y.length && w <= 7; w++) if (Y[w]) fix(r, YEARS[w - 1], r[YEARS[w - 1]], Y[w], 'إيجار السنة ' + (w + 1) + ' في شيت الملاك');
    }
  }

  // سطر جديد بنفس أعمدة المطور (من غير lease_id)
  function newRow(u, prev, st, en, today, why) {
    var v = {}, Y = yearsFor(u, st, en);
    v[C.code] = u.code; v[C.unit] = u.unitTitle; v[C.owner] = u.owner;
    v[C.prev] = prev ? str(prev[C.no]) : '';
    v[C.status] = en && en < today ? ST.ended : ST.active;
    v[C.start] = st || ''; v[C.end] = en || ''; v[C.signed] = st || ''; v[C.firstPay] = st || '';
    v[C.rent] = Y[0] || ''; v[C.cycle] = CYCLE[u.cycle];
    var base = Y[0], differs = Y.some(function (x) { return x && base && Math.abs(x - base) > 0.5; });
    v[C.incType] = differs ? INC.amt : INC.none;
    if (differs) for (var y = 1; y < Y.length && y <= 7; y++) if (Y[y]) v[YEARS[y - 1]] = Y[y];
    if (u.deposit) v[C.deposit] = u.deposit;
    v[C.auto] = 'لا / No';
    if (u.paid) v[C.paid] = u.paid;
    if (u.method) v[C.method] = u.method;
    v[C.notes] = 'اتضاف من ملف أصول (MBM)' + (u.settle ? ' · ' + u.settle : '');
    return { code: u.code, values: v, why: why };
  }

  var api = { reconcile: reconcile, ourContracts: ourContracts, COLS: C, YEARS: YEARS, CYCLE: CYCLE, INC: INC, ST: ST };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OsoolPrep = api;
})(this);
