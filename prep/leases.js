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
      out.push(v ? Math.round(v * 100) / 100 : null);
    }
    return out;
  }
  function gapsFor(u, start, end, today) {
    var out = []; if (!start || !end) return out;
    var d = L.serialToDate(start), last = L.serialToDate(Math.min(end, today));
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    var seen = 0;
    while (d <= last) { var k = L.monthKey(d); if (u.has(k)) { seen++; if (!u.val(k)) out.push(L.dateToSerial(d)); } d = L.addMonths(d, 1); }
    out.seen = seen; return out;
  }
  function methodOf(v) { v = str(v); if (!v) return ''; for (var i = 0; i < METHOD.length; i++) if (METHOD[i][0].test(v)) return METHOD[i][1]; return ''; }
  function cycleOf(label) { label = str(label); for (var k in CYCLE) if (CYCLE[k] === label) return Number(k); return 0; }

  // ---------- المقارنة ----------
  var R0 = { push: function (x) { if (R0.R) R0.R.changes.push(x); } };
  function reconcile(o) {
    var today = day(o.today || L.dateToSerial(L.todayUTC()));
    var paid = F.ownerPaid(o.treasury);
    var ours = ourContracts(o.owner, o.settings, paid);
    var dev = o.devRows, byU = {};
    // الكود بيتقارن من غير شَرطة أو مسافة: 60005-318 هي نفسها 60005318
    var ck = function (x) { return str(x).replace(/[\s\-_\/]/g, '').toUpperCase(); };
    dev.forEach(function (r) { var k = ck(r[C.code]); (byU[k] = byU[k] || []).push(r); });
    var R = R0.R = { changes: [], newRows: [], skipped: [], devOnly: [], segs: [], counts: { matched: 0, fixed: 0, flagged: 0, review: 0, renewals: 0, added: 0, outSkipped: 0 } };
    var fix = function (r, col, oldV, newV, why, kind) { R.changes.push({ row: r._row, code: str(r[C.code]), no: str(r[C.no]), col: col, old: oldV, val: newV, why: why, kind: kind || 'fix' }); };
    // الإيجار والزيادات: منغيرش القيمة، بنعلّم الخانة ونكتب اقتراح الشيت جنبها للمراجعة
    var flag = function (r, col, oldV, newV, why) { R.changes.push({ row: r._row, code: str(r[C.code]), no: str(r[C.no]), col: col, old: oldV, val: newV, why: why, kind: 'flag' }); };
    var review = function (r, why) { R.changes.push({ row: r._row, code: str(r[C.code]), no: str(r[C.no]), col: '', old: '', val: '', why: why, kind: 'review' }); };

    ours.forEach(function (u) {
      var rows = (byU[ck(u.code)] || []).slice().sort(function (a, b) { return day(a[C.start]) - day(b[C.start]); });
      var live = rows.filter(function (r) { return str(r[C.status]) !== 'مسودة / Draft'; });
      var sg = segments(u, today);
      if (sg && !u.out) R.segs.push({ code: u.code, project: u.project, owner: u.owner, end: u.end, cur: sg.cur, prev: sg.prev, mid: sg.mid, after: sg.after, rentCur: u.val(L.monthKey(L.serialToDate(sg.cur.rs))), rentPrev: sg.prev ? u.val(L.monthKey(L.serialToDate(sg.prev.rs))) : 0, dev: live.length });
      if (!live.length) {
        if (u.out) { R.counts.outSkipped++; return; }
        if (!sg) { R.newRows.push(newRow(u, null, u.start, u.end, today, 'وحدة في ملف أصول ومش في ملف المطور (البداية من شيت الملاك، وهي أول عقد)')); R.counts.added++; addGaps(u, '', u.start, u.end); return; }
        if (sg.prev) { R.newRows.push(newRow(u, null, sg.prev.s, sg.prev.e, today, 'وحدة مش عند المطور: العقد اللي مغطي 1/7/2026 (من شهور الشيت)', ST.renewed, sg.prev.rs)); R.counts.added++; R.counts.renewals++; addGaps(u, '', sg.prev.s, sg.prev.e); }
        R.newRows.push(newRow(u, null, sg.cur.s, sg.cur.e, today, 'وحدة مش عند المطور: العقد الحالي من ' + fmtS(sg.cur.s) + ' (آخر تغيير في الإيجار)', null, sg.cur.rs));
        R.counts.added++; addGaps(u, '', sg.cur.s, sg.cur.e); midReview(null, u, sg); return;
      }
      R.counts.matched += live.length;
      if (!sg) { // مفيش نهاية أو شهور: الطريقة القديمة
        live.forEach(function (r, ri) { var isLast = ri === live.length - 1, st = day(r[C.start]), en = day(r[C.end]); rentFix(r, u, st, en, flag); if (isLast) lastRow(r, u, st, en); addGaps(u, str(r[C.no]), st, isLast && u.end > en ? u.end : en); });
        return;
      }
      // آخر سنة سليمة: العقد الحالي بيبدأ من آخر أول-سنة الإيجار اتغير فيه، ونهايته نهاية الشيت.
      // ولو بدأ بعد 1/7/2026 بنسجل كمان العقد اللي كان مغطي يوم القطع. السطر بيتعدل في مكانه.
      var last = live[live.length - 1], before = live.length > 1 ? live[live.length - 2] : null, cur = last;
      if (sg.prev) {
        if (before) { setSeg(before, u, sg.prev, ST.renewed); setSeg(last, u, sg.cur, null); }
        else {
          setSeg(last, u, sg.prev, ST.renewed); cur = null;
          R.newRows.push(newRow(u, last, sg.cur.s, sg.cur.e, today, 'تجديد من ' + fmtS(sg.cur.s) + ': الإيجار في الشيت اتغير لـ ' + money(u.val(L.monthKey(L.serialToDate(sg.cur.rs)))) + ' بعد ' + str(last[C.no]), null, sg.cur.rs));
          R.counts.renewals++;
        }
        addGaps(u, str((before || last)[C.no]), sg.prev.s, sg.prev.e);
      } else setSeg(last, u, sg.cur, null);
      if (cur) { extras(cur, u); addGaps(u, str(cur[C.no]), sg.cur.s, sg.cur.e); }
      else addGaps(u, '', sg.cur.s, sg.cur.e);
      midReview(cur || last, u, sg);
    });
    // يعدّل سطر المطور على فترة العقد: البداية والنهاية وأول دفعة والإيجار وزيادات السنين من الشهور
    function setSeg(r, u, sgm, status) {
      var st = day(r[C.start]), en = day(r[C.end]), why = sgm.why;
      if (Math.abs(st - sgm.s) > 1) fix(r, C.start, r[C.start], sgm.s, why);
      if (Math.abs(en - sgm.e) > 1) fix(r, C.end, r[C.end], sgm.e, 'نهاية العقد' + (status === ST.renewed ? ' (اليوم اللي قبل التجديد)' : ' في شيت الملاك'));
      if (Math.abs(day(r[C.firstPay]) - sgm.s) > 1) fix(r, C.firstPay, r[C.firstPay], sgm.s, 'أول دفعة = بداية العقد الحالي');
      var Y = yearsFor(u, sgm.rs, sgm.e);
      if (Y[0] && Math.abs(num(r[C.rent]) - Y[0]) > 0.5) fix(r, C.rent, r[C.rent], Y[0], 'إيجار ' + L.monthLabel(L.monthKey(L.serialToDate(sgm.rs))) + ' في شيت الملاك');
      var base = Y[0] || num(r[C.rent]), known = Y.filter(function (v) { return v; }).length;
      var differs = Y.some(function (v) { return v && base && Math.abs(v - base) > 0.5; });
      var type = str(r[C.incType]);
      if (Y.length <= 1) { // سنة واحدة: مفيش زيادات
        if (type && type !== INC.none) fix(r, C.incType, r[C.incType], INC.none, 'العقد الحالي سنة واحدة');
        YEARS.forEach(function (h) { if (str(r[h]) !== '') fix(r, h, r[h], '', 'العقد الحالي سنة واحدة'); });
      } else if (differs && known >= 2) {
        if (type !== INC.amt) fix(r, C.incType, r[C.incType], INC.amt, 'الإيجار بيتغير جوه العقد في شيت الملاك');
        for (var y = 1; y < 8; y++) { var h = YEARS[y - 1], v = y < Y.length ? (Y[y] || '') : ''; if (v !== '' ? Math.abs(num(r[h]) - v) > 0.5 : str(r[h]) !== '') fix(r, h, r[h], v, v ? 'إيجار السنة ' + (y + 1) + ' في شيت الملاك' : 'بعد نهاية العقد'); }
      } else if (type && type !== INC.none) flag(r, C.incType, r[C.incType], type, 'العقد ' + Y.length + ' سنين والزيادة للسنين الجاية مش باينة في الشيت، راجعها');
      if (status && str(r[C.status]) !== status) fix(r, C.status, r[C.status], status, 'اتجدد من ' + fmtS(sgm.e + 1));
      else if (!status && sgm.e >= today && str(r[C.status]) !== ST.active) fix(r, C.status, r[C.status], ST.active, 'العقد ساري لحد ' + fmtS(sgm.e));
    }
    function midReview(r, u, sg) {
      if (sg.after) { var w = 'الشيت لسه بيحسب ' + sg.after + ' شهر بعد نهاية العقد ' + fmtS(sg.cur.e) + '، عدّل النهاية في الشيت'; if (r) review(r, w); else R.changes.push({ row: null, code: u.code, no: '', col: '', old: '', val: '', why: w, kind: 'review' }); }
      if (!sg.mid.length) return;
      var why = 'الإيجار اتغير في نص سنة العقد: ' + sg.mid.map(function (k) { return L.monthLabel(k); }).join('، ');
      if (r) review(r, why); else R.changes.push({ row: null, code: u.code, no: '', col: '', old: '', val: '', why: why, kind: 'review' });
    }
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
      extras(r, u);
    }
    function extras(r, u) {
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
      var g = gapsFor(u, st, en, today);
      // لو أغلب الشهور فاضية يبقى الشيت مش متملي، مش أشهر ملغاة
      if (g.length >= 6 && g.length > g.seen / 2) { R.changes.push({ row: null, code: u.code, no: no, col: '', old: '', val: '', why: g.length + ' شهر من ' + g.seen + ' فاضيين في شيت الملاك' + (no ? ' في ' + no : '') + '، يا الشيت مش متملي يا الوحدة مش شغالة. مسجلناش أشهر ملغاة', kind: 'review' }); return; }
      g.forEach(function (g) { R.skipped.push({ code: u.code, no: no, month: g, why: 'الشهر فاضي في شيت الملاك (MBM)' }); });
    }
    // وحدات عند المطور ومش في نطاق الملف ده (بنسيبها زي ما هي)
    var mine = {}; ours.forEach(function (u) { mine[u.code] = 1; });
    var all = {}; (o.owner.cols['كود'] || []).forEach(function (c) { all[ck(c)] = 1; });
    Object.keys(byU).forEach(function (k) { if (!all[k]) R.devOnly.push(str(byU[k][0][C.code])); });
    R.dues = duesAll(ours, byU, ck, o.treasury, today);
    // المهم: من 1/7/2026 لحد "مسدد حتى" المدفوع عن كل شهر يساوي المستحق. فترة الشهر بتبدأ يوم دورة العقد (زي 10 أو 15)
    R.dues.forEach(function (x) {
      if (!x.trPaid) return;
      var cd = L.serialToDate(x.start).getUTCDate();
      var bad = x.months.filter(function (m) { var ps = m.month + cd - 1; return m.month >= CUTOFF && ps <= x.trPaid && Math.abs(m.due - m.paid - (m.rule && !/^قبل مسدد/.test(m.rule) ? m.closed : 0)) > 1; });
      if (bad.length) R.changes.push({ row: null, code: x.code, no: x.no, col: '', old: '', val: '', kind: 'note',
        why: 'ملاحظة: مسدد حتى ' + fmtS(x.trPaid) + ' ومعتبر مسدد، بس المدفوع مش مساوي المستحق: ' + bad.map(function (m) { return L.monthLabel(m.key) + ' مستحق ' + money(m.due) + ' ومدفوع ' + money(m.paid); }).join('، ') });
    });
    R.counts.flagged = R.changes.filter(function (x) { return x.kind === 'flag'; }).length;
    R.counts.fixed = R.changes.filter(function (x) { return x.kind === 'fix' || x.kind === 'note'; }).length;
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
      var fx = [], odd = false;
      for (var y = 1; y < Y.length && y <= 7; y++) {
        if (!Y[y] || !Y[y - 1]) continue;
        var pct = Math.round((Y[y] / Y[y - 1] - 1) * 10000) / 100, cur = num(r[YEARS[y - 1]]);
        if (Math.abs(pct - cur) > 0.5) { fx.push([y, pct]); if (Math.abs(pct - Math.round(pct)) > 0.05) odd = true; }
      }
      // نسبة مش رقم صحيح (زي 26.48%) معناها إن الإيجار اتحدد بمبلغ، فنحوّل العقد لـ "إيجار جديد"
      if (odd) {
        fix(r, C.incType, r[C.incType], INC.amt, 'الزيادة في شيت الملاك بمبلغ مش بنسبة ثابتة');
        var prevA = base;
        for (var q = 1; q < 8; q++) {
          var curP = num(r[YEARS[q - 1]]), amt = 0;
          if (q < Y.length) amt = Y[q] || (prevA ? Math.round(prevA * (1 + curP / 100)) : 0);
          if (amt) { fix(r, YEARS[q - 1], r[YEARS[q - 1]], amt, Y[q] ? 'إيجار السنة ' + (q + 1) + ' في شيت الملاك' : 'محسوب من نسبة المطور ' + curP + '% (السنة دي مش في الشيت)'); prevA = amt; }
          else if (str(r[YEARS[q - 1]]) !== '') fix(r, YEARS[q - 1], r[YEARS[q - 1]], '', 'بعد نهاية العقد');
        }
      } else fx.forEach(function (x) { fix(r, YEARS[x[0] - 1], r[YEARS[x[0] - 1]], x[1], 'الإيجار في شيت الملاك ' + money(Y[x[0] - 1]) + ' ← ' + money(Y[x[0]])); });
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

  // ---------- فترة العقد من الشهور ----------
  // بنرجع من تاريخ النهاية سنة بسنة. أول-سنة الإيجار اتغير فيه (أو بدأ بعد شهر فاضي) = بداية عقد.
  // العقد الحالي = آخر تغيير لحد النهارده. لو مفيش تغيير: آخر سنة بتبدأ في 1/7/2026 أو قبله.
  function segments(u, today) {
    var E = u.end; if (!E) return null;
    var key = function (d) { return L.monthKey(d); };
    var at = function (d) { return u.val(key(d)); };
    // تغيير في الشهر ده عن اللي قبله (أو أول شهر بعد شهر فاضي)
    var changedAt = function (d) { var p = L.addMonths(d, -1), r1 = at(d), r0 = at(p); return r1 > 0 && (r0 <= 0 ? u.has(key(p)) : Math.abs(r1 - r0) > 0.5); };
    var an = [], floor = L.dateToSerial(new Date(Date.UTC(2015, 0, 1)));
    for (var k = 1; k < 30; k++) { var a = L.dateToSerial(L.addMonths(L.serialToDate(E + 1), -12 * k)); if (a < floor) break; an.push(a); }
    if (!an.length) return null;
    // شهر الإيجار لأول-سنة: شهرها (ولو بتبدأ آخر الشهر، الشهر اللي بعده). ولو بتبدأ في نص الشهر والتغيير ظهر الشهر اللي بعده، ناخده
    var rentMonth = function (a) { var m0 = firstOf(a + 3); if (changedAt(m0)) return m0; var dd = L.serialToDate(a).getUTCDate(); var m1 = L.addMonths(m0, 1); return dd > 1 && dd < 28 && changedAt(m1) ? m1 : null; };
    var ch = []; an.forEach(function (a) { if (a > today) return; var m = rentMonth(a); if (m) ch.push({ a: a, rs: L.dateToSerial(m) }); }); // من الأحدث للأقدم
    var lastYear = function (lim) { for (var i = 0; i < an.length; i++) if (an[i] <= lim) return an[i]; return an[an.length - 1]; };
    var lbl = function (rs) { return L.monthLabel(key(L.serialToDate(rs))); };
    var cur, prev = null;
    if (!ch.length) { var ly = lastYear(Math.min(CUTOFF, E)); cur = { s: ly, e: E, rs: ly + 3, why: 'آخر سنة في العقد (الإيجار متغيرش)' }; }
    else {
      cur = { s: ch[0].a, e: E, rs: ch[0].rs, why: 'العقد الحالي: الإيجار اتغير في ' + lbl(ch[0].rs) };
      if (ch[0].a > CUTOFF) {
        if (ch[1]) prev = { s: ch[1].a, e: ch[0].a - 1, rs: ch[1].rs, why: 'العقد اللي مغطي 1/7/2026: الإيجار اتغير في ' + lbl(ch[1].rs) };
        else { var p0 = lastYear(CUTOFF); prev = { s: p0, e: ch[0].a - 1, rs: p0 + 3, why: 'العقد اللي مغطي 1/7/2026 (آخر سنة قبل التجديد)' }; }
      }
    }
    // العقد اللي قبل التجديد لازم يكون ليه شهور في الشيت، وإلا تبقى الوحدة جديدة من التجديد ده
    if (prev) { var any = false; for (var q = firstOf(prev.rs), qe = firstOf(cur.rs); q < qe; q = L.addMonths(q, 1)) if (at(q) > 0) { any = true; break; } if (!any) prev = null; }
    if (u.start && cur.s < u.start) { cur.s = u.start; if (cur.rs < u.start) cur.rs = u.start; }
    // تغيير الإيجار في نص السنة (مش في أول-سنة) من بداية الفترة لحد النهارده
    var mid = [], ok = {}; ch.forEach(function (c) { ok[key(L.serialToDate(c.rs))] = 1; }); an.forEach(function (a) { ok[key(L.serialToDate(a + 3))] = 1; });
    for (var d = L.addMonths(firstOf((prev || cur).rs), 1), last = firstOf(Math.min(today, E)); d <= last; d = L.addMonths(d, 1)) {
      if (changedAt(d) && at(L.addMonths(d, -1)) > 0 && !ok[key(d)]) mid.push(key(d));
    }
    var after = 0; for (var d2 = L.addMonths(firstOf(E), 1), lim = firstOf(today); d2 <= lim; d2 = L.addMonths(d2, 1)) if (at(d2) > 0) after++;
    return { cur: cur, prev: prev, mid: mid, after: after };
  }

  // ---------- كشف المستحقات ----------
  // من أول آخر سنة في العقد (بالعد لورا من تاريخ النهاية)، وبشرط إنها تبدأ في 1/7/2026 أو قبله.
  // المستحق من خانات الشهور، والمدفوع من الخزينة (سداد ايجار ناقص رد ايجار) حسب خانة الشهر.
  var CUTOFF = L.dateToSerial(new Date(Date.UTC(2026, 6, 1))), FLOOR = L.dateToSerial(new Date(Date.UTC(2025, 0, 1)));
  function treasuryByUnit(t) {
    var c = t.cols, out = {}; if (!c['كود'] || !c['فئة']) return out;
    for (var i = 0; i < c['فئة'].length; i++) {
      var cat = str(c['فئة'][i]); if (cat !== 'سداد ايجار' && cat !== 'رد ايجار من مالك') continue;
      var u = str(c['كود'][i]); if (!u) continue;
      var g = out[u] || (out[u] = { m: {}, loose: 0, looseN: 0, list: [] });
      var amt = cat === 'سداد ايجار' ? num(c['مصروف'][i]) : -num(c['ايراد'][i]);
      var mv = num(c['شهر'] && c['شهر'][i]) || num(c['بداية الايجار'] && c['بداية الايجار'][i]);
      if (mv) { var k = L.monthKey(L.serialToDate(mv)); g.m[k] = (g.m[k] || 0) + amt; } else { g.loose += amt; g.looseN++; g.list.push({ date: day(c['تاريخ'] && c['تاريخ'][i]), amt: amt }); }
    }
    return out;
  }
  // اتفاقات محمد (20-10-2026): شهور ناقصة بتتقفل كأنها مسددة
  // 1) وحدات التسويات (F و N-F): لحد أغسطس 2026، وبعده عادي
  // 2) بورتو والملف الرئيسي (كله ما عدا فيلدج): من سبتمبر 2025 لحد مارس 2026 (الخزينة ناقصة في الفترة دي)
  var CLOSE = [
    { test: function (u, d) { var st = str(u.settle).toUpperCase().replace(/[_\s]/g, '-'); return (st === 'F' || st === 'N-F') && d <= Date.UTC(2026, 7, 1); }, why: 'تسويات: مقفول لحد 8/2026' },
    { test: function (u, d) { return F.groupOf(u.project) !== 'Village' && d >= Date.UTC(2025, 8, 1) && d <= Date.UTC(2026, 2, 1); }, why: 'مسدد (مش في الخزينة) 9/2025 لـ 3/2026' }
  ];
  function closeRule(u, key) { var d = F.keyToDate(key).getTime(); for (var i = 0; i < CLOSE.length; i++) if (CLOSE[i].test(u, d)) return CLOSE[i].why; return ''; }
  function firstOf(s) { var d = L.serialToDate(s); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  function duesAll(ours, byU, ck, treasury, today) {
    var T = treasuryByUnit(treasury || { cols: {} }), res = [], curM = firstOf(today);
    ours.forEach(function (u) {
      if (u.out) return;
      var rows = (byU[ck(u.code)] || []).slice().sort(function (a, b) { return day(a[C.start]) - day(b[C.start]); });
      var devEnd = rows.length ? day(rows[rows.length - 1][C.end]) : 0, E = u.end || devEnd; if (!E) return;
      // أول آخر سنة: يوم بعد النهاية ناقص 12 شهر، ونرجع سنة سنة لحد ما تبقى في 1/7/2026 أو قبله
      var S = L.dateToSerial(L.addMonths(L.serialToDate(E + 1), -12));
      while (S > CUTOFF) S = L.dateToSerial(L.addMonths(L.serialToDate(S), -12));
      if (S < FLOOR) S = FLOOR; // الكشف مبيبدأش قبل أول 2025
      var g = T[u.code] || { m: {}, loose: 0, looseN: 0, list: [] };
      // آخر الكشف: الشهر الحالي، أو شهر النهاية لو قبله، وبعدها أي شهر متدفع مقدم
      var last = firstOf(Math.min(E, L.dateToSerial(curM)));
      var lastSheet = null; for (var d0 = firstOf(E + 1); d0 <= curM; d0 = L.addMonths(d0, 1)) if (u.val(L.monthKey(d0))) lastSheet = d0;
      if (lastSheet && lastSheet > last) last = lastSheet; // لسه بيتحسب بعد النهاية في الشيت
      var paidMax = null; Object.keys(g.m).forEach(function (k) { var dk = F.keyToDate(k); if (dk > last && g.m[k] > 0 && (!paidMax || dk > paidMax)) paidMax = dk; });
      var stop = paidMax || last, months = [], tDue = 0, tPaid = 0, under = 0, over = 0, ahead = 0, first = null, bal = 0;
      for (var d = firstOf(S), i = 0; d <= stop; d = L.addMonths(d, 1), i++) {
        var k = L.monthKey(d), future = d > last, due = u.val(k), paid = Math.round((g.m[k] || 0) * 100) / 100;
        var no = ''; rows.forEach(function (r) { var a = day(r[C.start]), b = day(r[C.end]); if (a && L.dateToSerial(d) >= L.dateToSerial(firstOf(a)) && (!b || L.dateToSerial(d) <= b)) no = str(r[C.no]); });
        if (!no && rows.length) no = str(rows[rows.length - 1][C.no]);
        var inst = Math.floor(i / u.cycle) + 1, instDate = L.dateToSerial(L.addMonths(L.serialToDate(S), (inst - 1) * u.cycle));
        var diff = future ? 0 : Math.round(due - paid), state;
        if (future) { state = 'مقدم'; ahead += paid; }
        else if (Math.abs(diff) <= 1) state = 'مظبوط';
        else if (diff > 0) { state = 'ناقص'; under += diff; }
        else { state = 'زايد'; over -= diff; }
        if (!future) { tDue += due; tPaid += paid; bal += due - paid; }
        if (!first && state !== 'مظبوط' && state !== 'مقدم') first = L.dateToSerial(d);
        months.push({ key: k, month: L.dateToSerial(d), no: no, inst: inst, instDate: instDate, due: due, paid: paid, diff: diff, bal: Math.round(bal), state: state });
      }
      // سداد من غير شهر: يتوزع على أقدم شهور ناقصة من تاريخه، والباقي يفضل "من غير شهر"
      var left = 0, spread = 0;
      g.list.slice().sort(function (a, b) { return a.date - b.date; }).forEach(function (p) {
        if (!p.date || p.date < S - 31 || p.amt <= 0) { if (p.date >= S - 31) left += p.amt; return; }
        var rest = p.amt;
        months.forEach(function (m) { if (rest <= 0 || m.state === 'مقدم') return; var need = m.due - m.paid; if (need <= 1) return; var t = Math.min(need, rest); m.paid += t; rest -= t; spread += t; m.loose = true; });
        left += rest;
      });
      // إعادة الحساب بعد التوزيع والاتفاقات: الشهر الناقص اللي عليه اتفاق بيتقفل "مقفول" ومبيدخلش في الفرق
      tPaid = 0; under = 0; over = 0; bal = 0; first = null; var closed = 0, cd = L.serialToDate(S).getUTCDate();
      months.forEach(function (m) {
        if (m.state === 'مقدم') return;
        m.diff = Math.round(m.due - m.paid); m.closed = 0;
        var rule = m.diff > 1 ? closeRule(u, m.key) : '';
        // أي شهر فترته قبل "مسدد حتى" بيتعتبر مسدد، والفرق بيطلع ملاحظة بس
        if (!rule && Math.abs(m.diff) > 1 && u.paid && m.month + cd - 1 <= u.paid) rule = m.diff > 0 ? 'قبل مسدد حتى: معتبر مسدد (ناقص ' + money(m.diff) + ')' : 'قبل مسدد حتى: مدفوع زيادة ' + money(-m.diff);
        if (rule) { m.closed = m.diff; m.diff = 0; m.rule = rule; closed += m.closed; }
        tPaid += m.paid; bal += m.due - m.paid - m.closed; m.bal = Math.round(bal);
        m.state = rule ? (/^قبل مسدد/.test(rule) ? 'مسدد بملاحظة' : 'مقفول') : Math.abs(m.diff) <= 1 ? 'مظبوط' : m.diff > 0 ? 'ناقص' : 'زايد';
        if (m.state === 'ناقص') under += m.diff; else if (m.state === 'زايد') over -= m.diff;
        if (!first && (m.state === 'ناقص' || m.state === 'زايد')) first = m.month;
      });
      g = { loose: left, looseN: left ? g.looseN : 0, spread: spread };
      var balance = Math.round(tDue - tPaid - closed);
      res.push({ code: u.code, project: u.project, owner: u.owner, title: u.unitTitle, no: rows.length ? str(rows[rows.length - 1][C.no]) : '', start: S, end: E, cycle: u.cycle, settle: u.settle,
        months: months, due: Math.round(tDue), paid: Math.round(tPaid), closed: Math.round(closed), balance: balance, under: Math.round(under), over: Math.round(over), ahead: Math.round(ahead),
        loose: Math.round(g.loose), looseN: g.looseN, spread: Math.round(g.spread), first: first, devPaid: rows.length ? day(rows[rows.length - 1][C.paid]) : 0, trPaid: u.paid,
        state: Math.abs(balance) <= 1 && !under && !over ? 'مظبوط' : balance > 1 ? 'عليه ناقص' : balance < -1 ? 'مدفوع زيادة' : 'فيه فروق شهور' });
    });
    return res;
  }

  // سطر جديد بنفس أعمدة المطور (من غير lease_id)
  function newRow(u, prev, st, en, today, why, status, rs) {
    var v = {}, Y = yearsFor(u, rs || (st ? st + 3 : st), en);
    v[C.code] = u.code; v[C.unit] = u.unitTitle; v[C.owner] = u.owner;
    v[C.prev] = prev ? str(prev[C.no]) : '';
    v[C.status] = status || (en && en < today ? ST.ended : ST.active);
    v[C.start] = st || ''; v[C.end] = en || ''; v[C.signed] = st || ''; v[C.firstPay] = st || '';
    v[C.rent] = Y[0] || ''; v[C.cycle] = CYCLE[u.cycle];
    var base = Y[0], differs = Y.some(function (x) { return x && base && Math.abs(x - base) > 0.5; });
    v[C.incType] = differs ? INC.amt : INC.none;
    if (differs) for (var y = 1; y < Y.length && y <= 7; y++) if (Y[y]) v[YEARS[y - 1]] = Y[y];
    if (u.deposit) v[C.deposit] = u.deposit;
    v[C.auto] = 'لا / No';
    // مسدد حتى من الخزينة (مظبوط بنسبة كبيرة حتى لو فيه شهور ناقصة قبله). العقد اللي اتجدد لحد نهايته بالكتير، والعقد اللي لسه مبدأش مبيتحطلوش
    if (u.paid && (!st || u.paid >= st)) v[C.paid] = en && u.paid > en ? en : u.paid;
    if (u.method) v[C.method] = u.method;
    v[C.notes] = 'اتضاف من ملف أصول (MBM)' + (u.settle ? ' · ' + u.settle : '');
    if (!Y[0]) R0.push({ row: null, code: u.code, no: '', col: '', old: '', val: '', why: 'إيجار العقد اللي من ' + fmtS(st) + ' فاضي في شيت الملاك، اكتبه في الشيت', kind: 'review' });
    return { code: u.code, values: v, why: why };
  }

  var api = { reconcile: reconcile, CUTOFF: CUTOFF, ourContracts: ourContracts, COLS: C, YEARS: YEARS, CYCLE: CYCLE, INC: INC, ST: ST };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.OsoolPrep = api;
})(this);
