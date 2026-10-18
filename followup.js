/* لوحة أصول — المتابعة والتحصيل والنقل (بدون اعتماد على الإكسيل) */
(function (root) {
  'use strict';
  var L = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.OsoolLogic;
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = 86400000;

  var CAT = {
    rentIn: 'تحصيل ايجار', rentBack: 'رد ايجار للمستأجر',
    depIn: 'تحصيل تأمين', depBack: 'رد تأمين للمستأجر'
  };
  var TENANT_CATS = ['تحصيل ايجار', 'تحصيل تأمين', 'رد تأمين للمستأجر', 'رد ايجار للمستأجر'];
  var TENANT_MONTH = ['تحصيل ايجار', 'رد ايجار للمستأجر'];
  var OWNER_CATS = ['سداد ايجار', 'رد ايجار من مالك', 'سداد تأمين', 'رد تأمين من المالك'];
  var OWNER_MONTH = ['سداد ايجار', 'رد ايجار من مالك'];
  var DEFAULT_SETTINGS = { mode: 'exclude', projects: ['Village', 'Porto'] };
  var FOLLOW_FROM = 'Jan-25'; // نفس بداية شيت المتابعة

  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function num(v) { var n = Number(v); return isFinite(n) && v !== '' && v !== null ? n : 0; }
  function keyToDate(k) { var p = k.split('-'); return new Date(Date.UTC(2000 + Number(p[1]), MON.indexOf(p[0]), 1)); }
  function keyOf(v) { var d = L.serialToDate(v); return d ? L.monthKey(d) : null; }
  function cmpKey(a, b) { return keyToDate(a) - keyToDate(b); }
  function keyRange(from, to) {
    var out = [], d = keyToDate(from), end = keyToDate(to);
    while (d <= end) { out.push(L.monthKey(d)); d = L.addMonths(d, 1); }
    return out;
  }
  function endOfMonth(k) { var d = keyToDate(k); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); }
  function isForeign(cash) { return /دولار|ريال/.test(str(cash)); }

  // ---------- التجميع: ميفيدا، فيلدج، بورتو، والباقي كله "الخارج" ----------
  var GROUPS = ['Mivida', 'Village', 'Porto', 'الخارج'];
  function groupOf(project) {
    var p = str(project).toLowerCase();
    return p === 'mivida' ? 'Mivida' : p === 'village' ? 'Village' : p === 'porto' ? 'Porto' : 'الخارج';
  }
  function groupsIn(units) { var h = {}; units.forEach(function (u) { h[groupOf(u.project || (u.unit && u.unit.project))] = 1; }); return GROUPS.filter(function (g) { return h[g]; }); }

  // ---------- نطاق الملف ----------
  function inScope(unit, settings) {
    if (settings === 'all') return true;
    settings = settings || DEFAULT_SETTINGS;
    if (!unit) return settings.mode !== 'only';
    if (str(unit.settle).toUpperCase().replace(/[_\s]/g, '-') === 'N-F') return false; // N-F ليها ملف لوحدها
    var p = str(unit.project).toLowerCase();
    var list = (settings.projects || []).map(function (x) { return str(x).toLowerCase(); });
    return settings.mode === 'only' ? list.indexOf(p) !== -1 : list.indexOf(p) === -1;
  }
  function projectsOf(units) {
    var seen = {}, out = [];
    units.forEach(function (u) { var p = str(u.project); var k = p.toLowerCase(); if (p && !seen[k]) { seen[k] = 1; out.push(p); } });
    return out.sort();
  }

  // ---------- دفتر الخزينة لكل مستأجر ----------
  function buildLedger(t) {
    var c = t.cols, n = c['كود المستأجر'].length, led = {};
    function get(code) {
      return led[code] || (led[code] = { byMonth: {}, maxMonth: null, maxEnd: null, deposits: {}, lastDate: null, count: 0 });
    }
    for (var i = 0; i < n; i++) {
      var code = str(c['كود المستأجر'][i]); if (!code) continue;
      var cat = str(c['فئة'][i]);
      if (cat !== CAT.rentIn && cat !== CAT.rentBack && cat !== CAT.depIn && cat !== CAT.depBack) continue;
      var g = get(code), k = keyOf(c['شهر'][i]);
      if (cat === CAT.rentIn) {
        if (k) g.byMonth[k] = (g.byMonth[k] || 0) + num(c['ايراد'][i]);
        g.count++;
        var ms = num(c['شهر'][i]), es = effEnd(c, i);
        if (ms) {
          if (g.maxMonth === null || ms > g.maxMonth) { g.maxMonth = ms; g.maxEnd = es || null; }
          else if (ms === g.maxMonth && es && (!g.maxEnd || es > g.maxEnd)) g.maxEnd = es;
        }
        var ds = num(c['تاريخ'] ? c['تاريخ'][i] : 0);
        if (ds && (!g.lastDate || ds > g.lastDate)) g.lastDate = ds;
      } else if (cat === CAT.rentBack) {
        if (k) g.byMonth[k] = (g.byMonth[k] || 0) - num(c['مصروف'][i]);
      } else {
        var cash = str(c['كاش'][i]) || '—', sign = cat === CAT.depIn ? 1 : -1;
        var amt = cat === CAT.depIn ? num(c['ايراد'][i]) : num(c['مصروف'][i]);
        var d = g.deposits[cash] || (g.deposits[cash] = { egp: 0, fx: 0 });
        d.egp += sign * amt; d.fx += sign * num(c['العملة'][i]);
      }
    }
    return led;
  }

  // الدفعة الجزئية بتتسجل بفترة يوم واحد (من بداية الدورة لنفس اليوم) عشان "مسدد حتى" ميتحركش
  function isPartialRow(c, i) {
    var bs = num(c['بداية الايجار'] ? c['بداية الايجار'][i] : 0), es = num(c['نهاية الايجار'] ? c['نهاية الايجار'][i] : 0);
    return !!(bs && es && Math.floor(bs) === Math.floor(es));
  }
  function effEnd(c, i) {
    var es = num(c['نهاية الايجار'] ? c['نهاية الايجار'][i] : 0);
    return es && isPartialRow(c, i) ? es - 1 : es;
  }
  function duesOf(months, idx) {
    var out = {};
    Object.keys(months).forEach(function (k) { var v = num(months[k][idx]); if (v) out[k] = v; });
    return out;
  }

  // ---------- المتابعة ----------
  function followUp(ctx, settings, today) {
    today = today || L.todayUTC();
    var keys = keyRange(FOLLOW_FROM, L.monthKey(today));
    var unitsBy = {}; ctx.units.forEach(function (u) { unitsBy[u.code] = u; });
    var out = [];
    ctx.renters.forEach(function (r) {
      if (!r.code || r.idx < 0) return;
      var u = unitsBy[r.unit];
      if (!inScope(u, settings)) return;
      var dues = duesOf(ctx.months, r.idx), g = ctx.ledger[r.code] || { byMonth: {}, deposits: {} };
      var due = 0, coll = 0;
      keys.forEach(function (k) { due += dues[k] || 0; coll += g.byMonth[k] || 0; });
      var bal = Math.round((due - coll) * 100) / 100;
      var paid, paidNote = '';
      if (g.maxMonth) {
        if (g.maxEnd) paid = L.serialToDate(g.maxEnd);
        else { paid = endOfMonth(keyOf(g.maxMonth)); paidNote = 'تقديري'; }
      } else if (r.start) { paid = new Date(r.start.getTime() - DAY); paidNote = 'مفيش تحصيل'; }
      var late = bal > 1 && paid && paid < today;
      var dep = 0; Object.keys(g.deposits).forEach(function (c) { dep += g.deposits[c].egp; });
      out.push({
        r: r, unit: u, due: due, coll: coll, balance: bal, paidUntil: paid || null, paidNote: paidNote,
        daysLate: late ? L.daysBetween(paid, today) : 0, late: late, deposit: Math.round(dep), dues: dues, ledger: g
      });
    });
    return out;
  }

  // المتوقع تحصيله خلال فترة: مش متأخر، والمدفوع بيخلص جوه الفترة، والعقد مكمل بعده.
  // المبلغ = الأقساط اللي ميعادها جوه الفترة ولسه مش مدفوعة (نفس حساب رسالة الأوبريشن).
  function expectedIn(item, today, days) {
    today = today || L.todayUTC();
    var r = item.r, p = item.paidUntil;
    if (item.late || !p || !r.end) return null;
    var until = new Date(today.getTime() + days * DAY);
    if (p < today || p >= until || r.end <= p) return null;
    var ins = installments(item, today, until), amt = ins.reduce(function (a, x) { return a + x.left; }, 0);
    if (amt <= 1) return null;
    var next = new Date(p.getTime() + DAY);
    return { amount: amt, date: next, inDays: L.daysBetween(today, next) };
  }

  // الأقساط اللي عليه لحد تاريخ معين (الأقدم الأول، والمدفوع بيتخصم من الأقدم)
  function installments(item, today, until) {
    today = today || L.todayUTC(); until = until || today;
    var keys = Object.keys(item.dues).filter(function (k) { return cmpKey(k, FOLLOW_FROM) >= 0 && item.dues[k]; }).sort(cmpKey);
    var pool = 0; Object.keys(item.ledger.byMonth).forEach(function (k) { if (cmpKey(k, FOLLOW_FROM) >= 0) pool += item.ledger.byMonth[k] || 0; });
    var r = item.r, first = item.paidUntil ? new Date(item.paidUntil.getTime() + DAY) : (r.start || today), k0 = null, out = [];
    keys.forEach(function (k) {
      var due = item.dues[k], paid = Math.min(Math.max(pool, 0), due); pool -= due;
      var left = Math.round(due - paid); if (left <= 1) return;
      if (k0 === null) k0 = k;
      var gap = (keyToDate(k).getUTCFullYear() - keyToDate(k0).getUTCFullYear()) * 12 + keyToDate(k).getUTCMonth() - keyToDate(k0).getUTCMonth();
      var date = L.addMonths(first, gap);
      if (date > until) return;
      out.push({ key: k, date: date, amount: Math.round(due), paid: Math.round(paid), left: left });
    });
    return out;
  }
  function dmy(d) { return d ? L.fmt(d).replace(/\//g, '-') : '-'; }
  function nf(n) { return Math.round(n).toLocaleString('en-US'); }
  function shortDur(a, b) {
    if (!a || !b) return '';
    var md = L.monthsAndDays(a, b);
    if (!md.months) return (L.daysBetween(a, b)) + 'n';
    if (md.months % 12 === 0 && !md.days) return (md.months / 12) + 'y';
    return md.months + 'm' + (md.days ? ' ' + md.days + 'd' : '');
  }
  // رسالة الأوبريشن لمستأجر واحد
  function opsMessage(item, today, until) {
    var r = item.r, u = item.unit || {}, ins = installments(item, today, until);
    var unit = [u.project, u.building, u.apt].filter(function (x) { return str(x) && str(x) !== '0'; }).join(' - ');
    var lines = ['Code: ' + r.code, 'Unit: ' + (unit || r.unit), 'Tenant: ' + (r.name || '-'), '',
      'Contract: ' + dmy(r.start) + ' → ' + dmy(r.end) + '  (' + shortDur(r.start, r.end) + ')', '',
      'Paid until: ' + (item.paidNote === 'مفيش تحصيل' ? 'nothing paid yet' : dmy(item.paidUntil)), ''];
    var total = 0;
    ins.forEach(function (x) {
      total += x.left;
      lines.push('Due ' + dmy(x.date) + '    ' + nf(x.amount) + ' EGP' + (x.paid ? '  (paid ' + nf(x.paid) + ' · left ' + nf(x.left) + ')' : ''));
    });
    if (!ins.length) lines.push('No installment due in this period');
    lines.push('', 'Total due: ' + nf(total) + ' EGP');
    return { text: lines.join('\n'), total: total, count: ins.length };
  }
  function opsBulk(items, today, untilOf, title) {
    var parts = items.map(function (x) { return opsMessage(x, today, untilOf(x)); });
    var total = parts.reduce(function (a, p) { return a + p.total; }, 0);
    var head = (title ? title + '\n' : '') + items.length + ' tenants · Total due: ' + nf(total) + ' EGP';
    return head + '\n\n' + parts.map(function (p) { return p.text; }).join('\n\n———————\n\n');
  }

  // تفاصيل الشهور: مستحق ومحصل ومتبقي متجمع
  function monthsDetail(item, today) {
    var keys = keyRange(FOLLOW_FROM, L.monthKey(today || L.todayUTC()));
    var run = 0, rows = [];
    keys.forEach(function (k) {
      var d = item.dues[k] || 0, c = item.ledger.byMonth[k] || 0;
      run += d - c;
      if (d || c) rows.push({ key: k, due: d, coll: c, remaining: Math.round(run) });
    });
    return rows;
  }

  // اقتراح التحصيل الجاي: أول شهر فيه باقي (بالترتيب) + الفترة بعد آخر سداد
  function suggestCollection(item, today) {
    today = today || L.todayUTC();
    var keys = Object.keys(item.dues).filter(function (k) { return cmpKey(k, FOLLOW_FROM) >= 0; }).sort(cmpKey);
    var pool = 0; keys.forEach(function (k) { pool += item.ledger.byMonth[k] || 0; });
    var month = null, amount = 0;
    for (var i = 0; i < keys.length; i++) {
      pool -= item.dues[keys[i]];
      if (pool < -0.5) { month = keys[i]; amount = Math.min(-pool, item.dues[keys[i]]); break; }
    }
    if (!month) month = L.monthKey(today);
    var r = item.r, from;
    if (item.paidUntil && item.paidNote !== 'مفيش تحصيل') from = new Date(item.paidUntil.getTime() + DAY);
    else from = r.start || today;
    var to;
    if (r.start && r.end && L.daysBetween(r.start, r.end) < 30) to = r.end;
    else { to = new Date(L.addMonths(from, 1).getTime() - DAY); if (r.end && to > r.end) to = r.end; }
    return { month: month, amount: Math.round(amount), from: from, to: to };
  }

  // الباقي من شهر معين للمستأجر (المستحق ناقص المحصل عنه)
  function monthRemaining(item, key) { return Math.max(0, (item.dues[key] || 0) - ((item.ledger && item.ledger.byMonth[key]) || 0)); }

  // ---------- قيود الخزينة ----------
  function validateEntry(e, today) {
    today = today || L.todayUTC();
    var err = [];
    if (!e.date) err.push('حدد تاريخ الحركة.');
    else if (e.date > today) err.push('تاريخ الحركة مينفعش يكون بعد النهارده.');
    if (!(num(e.amount) > 0)) err.push('اكتب المبلغ.');
    if (!str(e.cash)) err.push('اختار الخزينة.');
    else if (isForeign(e.cash) && !(num(e.fx) > 0)) err.push('الخزينة دي بعملة أجنبية: اكتب المبلغ بالعملة كمان.');
    var cat = str(e.category);
    if (!cat) err.push('اختار الفئة.');
    if (TENANT_CATS.indexOf(cat) !== -1 && !str(e.tenantCode)) err.push('الفئة دي محتاجة كود المستأجر.');
    if ((TENANT_MONTH.indexOf(cat) !== -1 || OWNER_MONTH.indexOf(cat) !== -1) && !e.month) err.push('الفئة دي محتاجة الشهر.');
    if (OWNER_CATS.indexOf(cat) !== -1 && !(str(e.unitCode) && str(e.unitCode) !== '1')) err.push('الفئة دي محتاجة كود الوحدة.');
    if (e.from && e.to && e.to < e.from) err.push('نهاية الفترة قبل بدايتها.');
    if (e.to && e.contractEnd && e.to > e.contractEnd) err.push('نهاية الفترة بعد نهاية العقد (' + L.fmt(e.contractEnd) + ').');
    return err;
  }

  function entryValues(e) {
    var v = {};
    v['تاريخ'] = L.dateToSerial(e.date);
    if (e.side === 'out') v['مصروف'] = num(e.amount); else v['ايراد'] = num(e.amount);
    if (str(e.doc)) v['رقم المستند'] = /^\d+$/.test(str(e.doc)) ? Number(e.doc) : str(e.doc);
    v['كود'] = Number(e.unitCode) || str(e.unitCode);
    v['فئة'] = e.category;
    v['بيان'] = str(e.note);
    if (e.month) v['شهر'] = L.dateToSerial(keyToDate(e.month));
    if (e.from) v['بداية الايجار'] = L.dateToSerial(e.from);
    if (e.to) v['نهاية الايجار'] = L.dateToSerial(e.to);
    if (str(e.tenantCode)) v['كود المستأجر'] = str(e.tenantCode);
    v['كاش'] = str(e.cash);
    if (num(e.fx)) v['العملة'] = num(e.fx);
    if (str(e.notes)) v['ملاحظات'] = str(e.notes);
    if (str(e.chequeNo)) v['رقم الشيك'] = /^\d+$/.test(str(e.chequeNo)) ? Number(e.chequeNo) : str(e.chequeNo);
    if (e.chequeDate) v['تاريخ الشيك'] = L.dateToSerial(e.chequeDate);
    if (!str(e.unitCode)) v['كود'] = 1;
    return v;
  }

  // ---------- النقل ----------
  function modeAmount(vals) {
    var c = {}, best = 0, bv = 0;
    vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; if (c[v] > best) { best = c[v]; bv = v; } });
    return bv;
  }

  function nextKey(k, n) { return L.monthKey(L.addMonths(keyToDate(k), n || 1)); }
  function noteAdd(old, line) { old = str(old); return old ? old + ' — ' + line : line; }
  function isNightly(r) { return r.start && r.end && L.daysBetween(r.start, r.end) < 30; }

  // ---------- تمديد العقد: نفس السطر، النهاية بتتغير والشهور الجديدة بتتضاف ----------
  // r: العقد · months: {key: amount} من السطر · others: باقي عقود نفس الوحدة · headers: أعمدة الشهور الموجودة
  function planExtend(r, months, newEnd, rentIn, others, headers, notes, today) {
    today = today || L.todayUTC();
    var err = [];
    if (!newEnd) err.push('حدد النهاية الجديدة.');
    else if (newEnd <= r.end) err.push('النهاية الجديدة لازم تكون بعد النهاية الحالية (' + L.fmt(r.end) + ').');
    if (err.length) return { errors: err };
    var clash = (others || []).filter(function (o) { return o !== r && o.code !== r.code && o.start && o.end && o.start <= newEnd && o.end > r.end && !/ملغ[يى]/.test(str(o.name)); })
      .sort(function (a, b) { return a.start - b.start; })[0];
    if (clash) err.push('فيه حجز على نفس الشقة بيبدأ ' + L.fmt(clash.start) + ' (' + (clash.name || clash.code) + '). آخر نهاية ممكنة ' + L.fmt(new Date(clash.start.getTime() - DAY)) + '.');
    var keys = Object.keys(months).sort(cmpKey), changes = {}, rows = [];
    if (isNightly(r)) {
      var K = keys[0] || L.monthKey(r.start), cur = num(months[K]), nights = L.daysBetween(r.start, r.end);
      var rate = num(rentIn) || (cur && nights ? Math.round(cur / nights) : 0), extra = L.daysBetween(r.end, newEnd);
      if (!rate) err.push('اكتب سعر الليلة.');
      var f = cur ? '=' + cur + '+' + rate + '*' + extra : '=' + rate + '*' + extra;
      changes[K] = f;
      rows.push({ key: K, before: cur, after: cur + rate * extra, formula: f, note: extra + ' ليلة زيادة × ' + rate });
      var rr = { nightly: true, rate: rate, extra: extra };
    } else {
      var rent = num(rentIn) || num(r.rent) || modeAmount(keys.map(function (k) { return num(months[k]); })) || 0;
      if (!rent) err.push('اكتب قيمة الإيجار الشهري.');
      var from = new Date(r.end.getTime() + DAY), md = L.monthsAndDays(from, newEnd);
      var last = keys.length ? keys[keys.length - 1] : L.monthKey(r.end), k0 = nextKey(last);
      for (var i = 0; i < md.months; i++) { var k = nextKey(last, i + 1); changes[k] = rent; rows.push({ key: k, before: num(months[k]), after: rent, note: '' }); }
      if (md.days > 0) {
        var part = Math.round(rent / 30 * md.days), kp = nextKey(last, md.months + 1);
        changes[kp] = part; rows.push({ key: kp, before: num(months[kp]), after: part, note: md.days + ' يوم — تقديري' });
      }
      rr = { nightly: false, rent: rent, months: md.months, days: md.days };
    }
    var missing = Object.keys(changes).filter(function (k) { return headers && headers.indexOf(k) === -1; });
    if (missing.length) err.push('أعمدة الشهور دي مش موجودة في جدول العقود: ' + missing.join('، ') + '. زوّدها في الجدول الأول.');
    var fields = { 'نهاية العقد': L.dateToSerial(newEnd), 'ملاحظات': noteAdd(notes, 'تمديد: النهاية كانت ' + L.fmt(r.end) + ' واتمدت لـ ' + L.fmt(newEnd) + ' بتاريخ ' + L.fmt(today)) };
    if (isReceived(r) && str(r.receipt) && newEnd >= today) fields['موقف الاستلام'] = '';
    Object.keys(changes).forEach(function (k) { fields[k] = changes[k]; });
    return { errors: err, rows: rows, fields: fields, info: rr, added: rows.reduce(function (a, x) { return a + x.after - x.before; }, 0) };
  }

  // ---------- تسليم مبكر: النهاية بتتقدم، والشهور اللي بعدها بتتشال ----------
  // E: آخر يوم (للشهري) أو يوم الخروج (لليلي) · mode: 'days' الشهر الأخير بالأيام، 'full' كامل
  function planEarly(r, months, E, mode, notes, collected, receive, today) {
    today = today || L.todayUTC();
    var err = [];
    if (!E) err.push('حدد تاريخ التسليم.');
    else if (!(E >= r.start && E < r.end)) err.push('تاريخ التسليم لازم يكون بين بداية العقد ونهايته (' + L.fmt(r.start) + ' – ' + L.fmt(r.end) + ').');
    if (err.length) return { errors: err };
    var keys = Object.keys(months).sort(cmpKey), changes = {}, rows = [];
    if (isNightly(r)) {
      var K = keys[0], cur = num(months[K]), nights = L.daysBetween(r.start, r.end), used = L.daysBetween(r.start, E);
      if (used < 1) err.push('لازم ليلة واحدة على الأقل.');
      var rate = nights ? cur / nights : 0, isInt = Math.abs(rate - Math.round(rate)) < 0.001;
      if (K) { changes[K] = isInt ? '=' + Math.round(rate) + '*' + used : Math.round(rate * used); rows.push({ key: K, before: cur, after: Math.round(rate * used), note: used + ' ليلة بدل ' + nights }); }
      keys.slice(1).forEach(function (k) { changes[k] = null; rows.push({ key: k, before: num(months[k]), after: 0, note: 'هيتشال' }); });
    } else {
      var T = new Date(E.getTime() + DAY), k = L.monthsAndDays(r.start, E).months;
      var pStart = L.addMonths(r.start, k), pEnd = L.addMonths(r.start, k + 1);
      var frac = L.daysBetween(pStart, T) / L.daysBetween(pStart, pEnd);
      var Kk = keys.length ? nextKey(keys[0], k) : null; // شهر الاستحقاق اللي فيه يوم التسليم
      keys.forEach(function (key) {
        var a = num(months[key]), c = cmpKey(key, Kk);
        if (c < 0) return;
        if (c === 0) {
          var nv = mode === 'full' || frac >= 0.999 ? a : Math.round(a * frac);
          if (nv !== a) changes[key] = nv;
          rows.push({ key: key, before: a, after: nv, note: mode === 'full' ? 'الشهر كامل' : L.daysBetween(pStart, T) + ' يوم من ' + L.daysBetween(pStart, pEnd) });
        } else { changes[key] = null; rows.push({ key: key, before: a, after: 0, note: 'هيتشال' }); }
      });
    }
    var fields = { 'نهاية العقد': L.dateToSerial(E), 'ملاحظات': noteAdd(notes, 'تسليم مبكر: النهاية الأصلية ' + L.fmt(r.end) + '، واتسلمت ' + L.fmt(E) + ' (اتسجل ' + L.fmt(today) + ')') };
    if (receive) fields['موقف الاستلام'] = RECEIVED;
    Object.keys(changes).forEach(function (k) { fields[k] = changes[k]; });
    var totalAfter = 0; keys.filter(function (k) { return cmpKey(k, FOLLOW_FROM) >= 0; }).forEach(function (k) { totalAfter += k in changes ? (changes[k] === null ? 0 : rows.filter(function (x) { return x.key === k; })[0].after) : num(months[k]); });
    return { errors: err, rows: rows, fields: fields, totalAfter: Math.round(totalAfter), collected: Math.round(collected || 0), diff: Math.round((collected || 0) - totalAfter) };
  }

  /* old: {start,end,rent} · oldMonths: {key: amount} لكل أعمدة الشهور في السطر القديم */
  function planTransfer(old, oldMonths, T, newRent) {
    var err = [];
    if (!T) err.push('حدد تاريخ النقل.');
    else if (!(T > old.start && T < old.end)) err.push('تاريخ النقل لازم يكون بعد بداية العقد وقبل نهايته (' + L.fmt(old.start) + ' – ' + L.fmt(old.end) + ').');
    if (err.length) return { errors: err };
    var keys = Object.keys(oldMonths).filter(function (k) { return num(oldMonths[k]); }).sort(cmpKey);
    var amounts = keys.map(function (k) { return num(oldMonths[k]); });
    var oldChanges = {}, sched = [], frac, K = null;
    var total = L.daysBetween(old.start, old.end);
    if (total < 30) {
      var used = L.daysBetween(old.start, T); frac = used / total;
      K = keys[0] || null;
      var amt0 = amounts[0] || 0;
      if (K) oldChanges[K] = Math.round(amt0 * frac);
      keys.slice(1).forEach(function (k) { oldChanges[k] = null; });
      var rate = num(newRent) || (amt0 && total ? Math.round(amt0 / total) : 0);
      var rem = total - used;
      if (rate) sched.push({ key: L.monthKey(T), amount: rate * rem, formula: '=' + rate + '*' + rem, formulaAmount: rate * rem, note: rem + ' ليلة × ' + rate });
      return { errors: [], short: true, frac: frac, K: K, oldChanges: oldChanges, schedule: sched, rate: rate };
    }
    var k = L.monthsAndDays(old.start, new Date(T.getTime() - DAY)).months;
    var pStart = L.addMonths(old.start, k), pEnd = L.addMonths(old.start, k + 1);
    frac = L.daysBetween(pStart, T) / L.daysBetween(pStart, pEnd);
    var ref = num(old.rent) || modeAmount(amounts) || 0;
    var nr = num(newRent) || ref;
    keys.forEach(function (key, i) {
      if (i < k) return;
      if (i === k) {
        K = key;
        oldChanges[key] = Math.round(amounts[i] * frac);
        var first = Math.round((amounts[i] / (ref || amounts[i])) * nr * (1 - frac));
        if (first > 0) sched.push({ key: key, amount: first, note: 'باقي الشهر' });
      } else {
        oldChanges[key] = null;
        sched.push({ key: key, amount: Math.round(amounts[i] * (ref ? nr / ref : 1)), note: amounts[i] !== ref ? 'جزء شهر' : '' });
      }
    });
    return { errors: [], short: false, frac: frac, K: K, oldChanges: oldChanges, schedule: sched, rent: nr, oldRent: ref };
  }

  // أرصدة التأمين اللي هتتنقل (لكل خزينة لوحدها)
  function depositMoves(ledgerEntry) {
    var out = [];
    if (!ledgerEntry) return out;
    Object.keys(ledgerEntry.deposits).forEach(function (cash) {
      var d = ledgerEntry.deposits[cash];
      if (d.egp > 0.5) out.push({ cash: cash === '—' ? '' : cash, egp: Math.round(d.egp * 100) / 100, fx: Math.round(d.fx * 100) / 100 });
    });
    return out;
  }

  // ---------- المتاح (زي شيت Available) ----------
  var RECEIVED = 'تم الاستلام', PENDING_DAYS = 30;
  // الحجز الملغي ملوش خروج ولا استلام
  function isReceived(r) { return str(r.receipt) === RECEIVED || /ملغ[يى]/.test(str(r.name)); }
  // الخروج: النهارده وامبارح، واللي خرج قبل كده ولسه متستلمش (آخر ٣٠ يوم)
  function exits(units, renters, settings, today) {
    today = today || L.todayUTC();
    var ub = {}; units.forEach(function (u) { ub[u.code] = u; });
    var y = new Date(today.getTime() - DAY), by = {};
    renters.forEach(function (r) { if (r.unit && r.start && r.end) (by[r.unit] = by[r.unit] || []).push(r); });
    var out = { today: [], yesterday: [], older: [] };
    renters.forEach(function (r) {
      if (r.idx < 0 || !r.end || !r.start || r.end.getUTCFullYear() >= 2090) return;
      var u = ub[r.unit]; if (!u || (settings !== 'all' && !inScope(u, settings))) return;
      var mine = by[r.unit] || [];
      var moved = mine.some(function (o) { return o !== r && o.start > r.end && o.start <= today; }); // حد تاني دخل بعده
      var next = mine.filter(function (o) { return o.start > r.end; }).sort(function (a, b) { return a.start - b.start; })[0] || null;
      var it = { r: r, unit: u, next: next, received: isReceived(r) || moved };
      if (+r.end === +today) out.today.push(it);
      else if (+r.end === +y) out.yesterday.push(it);
      else if (r.end < y && !it.received && L.daysBetween(r.end, today) <= PENDING_DAYS) {
        var later = mine.some(function (o) { return o !== r && o.end > r.end && o.start <= today; });
        if (!later) out.older.push(it);
      }
    });
    out.older.sort(function (a, b) { return a.r.end - b.r.end; });
    return out;
  }

  function availability(units, renters, settings, today) {
    today = today || L.todayUTC();
    var by = {};
    renters.forEach(function (r) { if (r.unit && r.start && r.end) (by[r.unit] = by[r.unit] || []).push(r); });
    return units.filter(function (u) { return settings === 'all' || inScope(u, settings); }).map(function (u) {
      var mine = by[u.code] || [];
      var cur = mine.filter(function (r) { return r.start <= today && r.end >= today; }).sort(function (a, b) { return b.end - a.end; })[0] || null;
      var next = mine.filter(function (r) { return r.start > today; }).sort(function (a, b) { return a.start - b.start; })[0] || null;
      var freeFrom = cur ? cur.end : today;
      var rem = '';
      if (u.ownerEnd && u.ownerEnd > today) {
        var md = L.monthsAndDays(today, u.ownerEnd);
        rem = (md.months >= 12 ? Math.floor(md.months / 12) + ' سنة ' : '') + (md.months % 12 ? (md.months % 12) + ' شهر' : '');
      } else if (u.ownerEnd) rem = 'منتهي';
      // آخر عقد خلص ومتسجلش استلامه: الشقة لسه مش متاحة
      var pending = null;
      if (!cur) {
        var last = mine.filter(function (r) { return r.end < today && r.end.getUTCFullYear() < 2090; }).sort(function (a, b) { return b.end - a.end; })[0];
        if (last && !isReceived(last) && L.daysBetween(last.end, today) <= PENDING_DAYS) pending = last;
      }
      var status = cur ? 'مشغولة' : pending ? 'لم تستلم' : next ? 'محجوزة' : 'فاضية';
      var upcoming = mine.filter(function (r) { return r.start > today; }).length;
      return { unit: u, current: cur, pending: pending, next: next, upcoming: upcoming, freeFrom: freeFrom, daysToFree: cur ? L.daysBetween(today, cur.end) : 0, status: status, remaining: rem.trim() };
    }).sort(function (a, b) { return a.daysToFree - b.daysToFree || String(a.unit.project).localeCompare(String(b.unit.project)); });
  }

  // ---------- الخزينة العامة ----------
  // الجانب الغالب لكل فئة من تاريخ الخزينة (وارد ولا منصرف)
  function sideDefaults(t) {
    var c = t.cols, cnt = {};
    for (var i = 0; i < c['فئة'].length; i++) {
      var k = str(c['فئة'][i]); if (!k) continue;
      var x = cnt[k] || (cnt[k] = { in: 0, out: 0, n: 0 });
      if (num(c['ايراد'][i])) x.in++; else if (num(c['مصروف'][i])) x.out++;
      x.n++;
    }
    var out = {}; Object.keys(cnt).forEach(function (k) { out[k] = { side: cnt[k].in > cnt[k].out ? 'in' : 'out', n: cnt[k].n }; });
    return out;
  }
  // آخر شهر اتسدد للمالك (سداد ايجار) لكل وحدة
  function ownerPaid(t) {
    var c = t.cols, out = {};
    if (!c['كود']) return out;
    for (var i = 0; i < c['فئة'].length; i++) {
      if (str(c['فئة'][i]) !== 'سداد ايجار') continue;
      var u = str(c['كود'][i]), m = num(c['شهر'][i]); if (!u || !m) continue;
      var e = effEnd(c, i), amt = num(c['مصروف'][i]), k = keyOf(m), prev = out[u];
      var byMonth = prev ? prev.byMonth : {}; if (k) byMonth[k] = (byMonth[k] || 0) + amt;
      var part = isPartialRow(c, i);
      if (!prev || m > prev.m) out[u] = { m: m, amt: part ? (prev ? prev.amt : 0) : amt, end: e || (prev ? prev.end : 0), byMonth: byMonth, onlyPartial: part };
      else if (m === prev.m) { if (e > prev.end) prev.end = e; if (!part) { prev.onlyPartial = false; if (amt > prev.amt) prev.amt = amt; } }
    }
    return out;
  }
  // اقتراح سداد المالك: الشهر اللي بعد آخر شهر اتسدد، ومبلغه من أعمدة شهور عقد المالك
  // اقتراح سداد المالك: الفترة بتبدأ من اليوم اللي بعد نهاية آخر سداد (مش من أول الشهر)،
  // ولو الشهر الأخير اتدفع منه جزء بس، نكمل نفس الشهر بالباقي
  function ownerSuggest(unit, ownerMonths, paid, today, count) {
    today = today || L.todayUTC();
    var lp = paid[unit.code], last = lp ? lp.m : null, firstKey, from = null;
    var sheetAmt = function (key) { return ownerMonths && ownerMonths[key] ? num(ownerMonths[key][unit.idx]) : 0; };
    var full = function (key) { return sheetAmt(key) || (lp && lp.amt) || unit.rent || 0; };
    if (last) {
      var lk = L.monthKey(L.serialToDate(last)), paidIn = lp.byMonth && lp.byMonth[lk] || 0;
      // نكمل نفس الشهر بس لو آخر شهر اتسجل فيه دفعات جزئية بس (فترة يوم واحد)
      firstKey = lp.onlyPartial && full(lk) - paidIn > 1 ? lk : L.monthKey(L.addMonths(L.serialToDate(last), 1));
      if (lp.end) from = new Date(L.serialToDate(lp.end).getTime() + DAY);
    } else firstKey = L.monthKey(today);
    var rows = [];
    for (var k = 0; k < (count || 1); k++) {
      var key = k === 0 ? firstKey : L.monthKey(L.addMonths(keyToDate(firstKey), k));
      var f = from || keyToDate(key), to = new Date(L.addMonths(f, 1).getTime() - DAY);
      var amt = full(key);
      if (k === 0 && last && lp.onlyPartial && key === L.monthKey(L.serialToDate(last))) amt = Math.max(0, Math.round(amt - (lp.byMonth[key] || 0)));
      var src = sheetAmt(key) ? 'sheet' : lp && lp.amt ? 'last' : 'rent';
      rows.push({ key: key, from: f, to: to, fullTo: to, full: amt, amount: amt, source: src });
      from = new Date(to.getTime() + DAY);
    }
    return { lastPaid: last ? L.serialToDate(last) : null, lastAmount: lp ? lp.amt : 0, rows: rows };
  }
  // دفعة أقل من المطلوب للدورة: تتسجل بفترة يوم واحد من بداية الدورة
  function partialPeriod(from, to, amount, full) {
    if (full > 1 && amount > 0 && amount < full - 0.5) return { from: from, to: from, partial: true };
    return { from: from, to: to, partial: false };
  }

  // ---------- متابعة الملاك (زي شيت متابعة ملاك) ----------
  function ownerFollow(units, t, ownerMonths, settings, today, soonDays) {
    today = today || L.todayUTC();
    soonDays = soonDays > 0 ? soonDays : 7;
    var c = t.cols, n = c['فئة'].length, agg = {};
    var curKey = L.monthKey(today), keys = keyRange(FOLLOW_FROM, curKey);
    for (var i = 0; i < n; i++) {
      var cat = str(c['فئة'][i]); if (cat !== 'سداد ايجار' && cat !== 'رد ايجار من مالك') continue;
      var u = str(c['كود'] ? c['كود'][i] : ''); if (!u) continue;
      var g = agg[u] || (agg[u] = { byMonth: {}, m: 0, end: 0, date: 0, amt: 0, payments: [] });
      var k = keyOf(c['شهر'][i]);
      if (cat === 'رد ايجار من مالك') { if (k) g.byMonth[k] = (g.byMonth[k] || 0) - num(c['ايراد'][i]); continue; }
      var out = num(c['مصروف'][i]), m = num(c['شهر'][i]), e = effEnd(c, i), dt = Math.floor(num(c['تاريخ'][i]));
      if (k) g.byMonth[k] = (g.byMonth[k] || 0) + out;
      g.payments.push({ date: dt, amt: out });
      if (m > g.m) { g.m = m; g.end = e; g.date = dt; g.amt = out; }
      else if (m === g.m && m) { if (e > g.end) g.end = e; if (dt > g.date) g.date = dt; if (out > g.amt) g.amt = out; }
    }
    return units.filter(function (u) {
      return inScope(u, settings) && str(u.settle).toUpperCase() !== 'OUT' && (!u.ownerEnd || u.ownerEnd >= today);
    }).map(function (u) {
      var g = agg[u.code] || { byMonth: {}, m: 0, end: 0, date: 0, amt: 0, payments: [] };
      var paidUntil = g.end ? L.serialToDate(g.end) : null;
      var lastDate = g.date ? L.serialToDate(g.date) : null;
      var lastSum = g.date ? g.payments.filter(function (p) { return p.date === g.date; }).reduce(function (a, p) { return a + p.amt; }, 0) : 0;
      var monthAmt = ownerMonths && ownerMonths[curKey] ? num(ownerMonths[curKey][u.idx]) : 0;
      var per = monthAmt || g.amt || u.rent || 0;
      var due = 0, paid = 0;
      keys.forEach(function (k) { due += ownerMonths && ownerMonths[k] ? num(ownerMonths[k][u.idx]) : 0; paid += g.byMonth[k] || 0; });
      var daysLeft = paidUntil ? L.daysBetween(today, paidUntil) : null;
      return {
        unit: u, paidMonth: g.m ? L.serialToDate(g.m) : null, paidUntil: paidUntil, lastDate: lastDate, lastAmount: g.amt, lastSum: lastSum,
        every: u.every || 1, required: per * (u.every || 1), balance: Math.round(due - paid), daysLeft: daysLeft,
        nextByDate: lastDate ? new Date(lastDate.getTime() + (u.every || 1) * 30 * DAY) : null,
        status: daysLeft === null ? 'none' : daysLeft < 0 ? 'late' : daysLeft <= soonDays ? 'soon' : 'ok'
      };
    }).sort(function (a, b) { return (a.daysLeft === null ? 99999 : a.daysLeft) - (b.daysLeft === null ? 99999 : b.daysLeft); });
  }
  // ---------- كشف حساب: المستحق والمدفوع بالترتيب، والرصيد بعد كل سطر (من أول متابعة الشيت) ----------
  function finishStatement(lines) {
    lines.sort(function (a, b) { return (a.date - b.date) || (a.kind === 'due' ? -1 : 1); });
    var bal = 0, due = 0, paid = 0;
    lines.forEach(function (x) { bal += (x.debit || 0) - (x.credit || 0); due += x.debit || 0; paid += x.credit || 0; x.balance = Math.round(bal); });
    return { lines: lines, due: Math.round(due), paid: Math.round(paid), balance: Math.round(bal) };
  }
  function tenantStatement(r, dues, t, today) {
    today = today || L.todayUTC();
    var cur = L.monthKey(today), lines = [], c = t.cols, n = c['فئة'].length;
    var keys = Object.keys(dues).filter(function (k) { return num(dues[k]); }).sort(cmpKey), k0 = keys[0];
    keys.forEach(function (k) {
      if (cmpKey(k, FOLLOW_FROM) < 0 || cmpKey(k, cur) > 0) return;
      var gap = (keyToDate(k).getUTCFullYear() - keyToDate(k0).getUTCFullYear()) * 12 + keyToDate(k).getUTCMonth() - keyToDate(k0).getUTCMonth();
      var date = r.start ? (isNightly(r) ? r.start : L.addMonths(r.start, gap)) : keyToDate(k);
      lines.push({ date: date, kind: 'due', desc: 'إيجار ' + L.monthLabel(k), debit: num(dues[k]) });
    });
    var deps = [];
    for (var i = 0; i < n; i++) {
      if (str(c['كود المستأجر'][i]) !== r.code) continue;
      var cat = str(c['فئة'][i]), d = L.serialToDate(Math.floor(num(c['تاريخ'][i]))), k = keyOf(c['شهر'][i]);
      var note = str(c['بيان'] ? c['بيان'][i] : '');
      if (cat === CAT.rentIn || cat === CAT.rentBack) {
        if (!k || cmpKey(k, FOLLOW_FROM) < 0 || cmpKey(k, cur) > 0) continue;
        if (cat === CAT.rentIn) lines.push({ date: d, kind: 'pay', desc: 'سداد عن ' + L.monthLabel(k) + (note ? ' · ' + note : ''), credit: num(c['ايراد'][i]), row: i });
        else lines.push({ date: d, kind: 'back', desc: 'رد إيجار عن ' + L.monthLabel(k), debit: num(c['مصروف'][i]), row: i });
      } else if (cat === CAT.depIn || cat === CAT.depBack) {
        deps.push({ date: d, desc: cat + ' · ' + str(c['كاش'][i]), amount: cat === CAT.depIn ? num(c['ايراد'][i]) : -num(c['مصروف'][i]) });
      }
    }
    var st = finishStatement(lines);
    st.deposits = deps.sort(function (a, b) { return a.date - b.date; });
    st.depTotal = Math.round(deps.reduce(function (a, x) { return a + x.amount; }, 0));
    var upcoming = Object.keys(dues).filter(function (k) { return cmpKey(k, cur) > 0 && num(dues[k]); });
    st.future = { count: upcoming.length, total: Math.round(upcoming.reduce(function (a, k) { return a + num(dues[k]); }, 0)) };
    return st;
  }
  function ownerStatement(u, ownerMonths, t, today) {
    today = today || L.todayUTC();
    var cur = L.monthKey(today), lines = [], c = t.cols, n = c['فئة'].length;
    keyRange(FOLLOW_FROM, cur).forEach(function (k) {
      var a = ownerMonths && ownerMonths[k] ? num(ownerMonths[k][u.idx]) : 0;
      if (a) lines.push({ date: keyToDate(k), kind: 'due', desc: 'إيجار ' + L.monthLabel(k), debit: a });
    });
    for (var i = 0; i < n; i++) {
      if (str(c['كود'] ? c['كود'][i] : '') !== u.code) continue;
      var cat = str(c['فئة'][i]); if (cat !== 'سداد ايجار' && cat !== 'رد ايجار من مالك') continue;
      var k = keyOf(c['شهر'][i]); if (!k || cmpKey(k, FOLLOW_FROM) < 0 || cmpKey(k, cur) > 0) continue;
      var d = L.serialToDate(Math.floor(num(c['تاريخ'][i]))), note = str(c['بيان'] ? c['بيان'][i] : '');
      if (cat === 'سداد ايجار') lines.push({ date: d, kind: 'pay', desc: 'سداد عن ' + L.monthLabel(k) + (note ? ' · ' + note : ''), credit: num(c['مصروف'][i]), row: i });
      else lines.push({ date: d, kind: 'back', desc: 'رد من المالك عن ' + L.monthLabel(k), debit: num(c['ايراد'][i]), row: i });
    }
    return finishStatement(lines);
  }
  // ---------- منع التكرار: حركة بنفس اليوم والفئة والمبلغ والكود (والشهر لو موجود) ----------
  function findDuplicates(t, vals) {
    var c = t.cols, n = c['فئة'].length, out = [];
    vals.forEach(function (v) {
      var amt = num(v['ايراد']) || num(v['مصروف']), side = num(v['ايراد']) ? 'ايراد' : 'مصروف';
      for (var i = n - 1; i >= 0; i--) {
        if (Math.floor(num(c['تاريخ'][i])) !== v['تاريخ']) continue;
        if (str(c['فئة'][i]) !== str(v['فئة']) || Math.abs(num(c[side][i]) - amt) > 0.5) continue;
        if (str(v['كود المستأجر']) ? str(c['كود المستأجر'][i]) !== str(v['كود المستأجر']) : str(c['كود'] ? c['كود'][i] : '') !== str(v['كود'])) continue;
        if (v['شهر'] && num(c['شهر'][i]) && Math.floor(num(c['شهر'][i])) !== v['شهر']) continue;
        out.push({ row: i, amount: amt, cat: str(v['فئة']), note: str(c['بيان'] ? c['بيان'][i] : '') }); break;
      }
    });
    return out;
  }

  // ---------- مقارنة المالك والمستأجر (مستحق) ----------
  // لكل وحدة في شهر: مستحق المستأجرين (مجموعهم) قصاد مستحق المالك.
  // خانة المالك الفاضية: آخر قيمة متسجلة قبل الشهر ده (مفترضة).
  function compareMonth(units, renters, rMonths, oMonths, key, settings) {
    var ks = Object.keys(oMonths || {}).sort(cmpKey), ki = ks.indexOf(key), mStart = keyToDate(key);
    var mEnd = new Date(L.addMonths(mStart, 1).getTime() - DAY);
    var ten = {}, cnt = {}, rm = (rMonths || {})[key] || [];
    renters.forEach(function (r) { if (!r.code || r.idx < 0) return; var v = num(rm[r.idx]); if (!v) return; ten[r.unit] = (ten[r.unit] || 0) + v; cnt[r.unit] = (cnt[r.unit] || 0) + 1; });
    var out = [];
    units.forEach(function (u) {
      if (!inScope(u, settings) || str(u.settle).toUpperCase() === 'OUT') return;
      if (u.ownerEnd && u.ownerEnd < mStart) return;
      var o = num(((oMonths || {})[key] || [])[u.idx]), assumed = false;
      if (!o && ki > 0) {
        for (var j = ki - 1; j >= 0; j--) { var v = num((oMonths[ks[j]] || [])[u.idx]); if (v) { o = v; assumed = true; break; } }
      }
      var t = ten[u.code] || 0;
      if (!o && !t) return;
      out.push({ unit: u, group: groupOf(u.project), beds: num(u.bedrooms) || 0, tenant: Math.round(t), tenants: cnt[u.code] || 0, owner: Math.round(o), assumed: assumed,
        diff: Math.round(t - o), pct: o ? (t - o) / o : null });
    });
    return out;
  }
  // ملخص إيجارات الملاك حسب عدد الغرف
  function ownerByBeds(rows) {
    var g = {};
    rows.forEach(function (x) { if (!x.owner) return; var b = x.beds || 0, a = g[b] || (g[b] = { beds: b, n: 0, sum: 0, min: Infinity, max: 0 }); a.n++; a.sum += x.owner; a.min = Math.min(a.min, x.owner); a.max = Math.max(a.max, x.owner); });
    return Object.keys(g).map(function (k) { var a = g[k]; a.avg = Math.round(a.sum / a.n); return a; }).sort(function (a, b) { return a.beds - b.beds; });
  }

  // ---------- الإشغال ----------
  // لكل وحدة في الفترة: الأيام المتاحة (عقد المالك ساري، ومش خارج التشغيل) والأيام المشغولة من عقود المستأجرين.
  // عقود الليالي (أقل من ٣٠ يوم): يوم الخروج مش محسوب ليلة. العقود الملغية مش محسوبة.
  function occupancy(units, renters, from, to, settings) {
    var F0 = Math.floor(from.getTime() / DAY), T0 = Math.floor(to.getTime() / DAY);
    var byU = {}; renters.forEach(function (r) { if (r.unit && r.start && r.end && !/ملغ[يى]/.test(str(r.name))) (byU[r.unit] = byU[r.unit] || []).push(r); });
    var out = [];
    units.forEach(function (u) {
      if (!inScope(u, settings) || str(u.settle).toUpperCase() === 'OUT') return;
      var a0 = F0, a1 = T0;
      if (u.ownerStart) a0 = Math.max(a0, Math.floor(u.ownerStart.getTime() / DAY));
      if (u.ownerEnd) a1 = Math.min(a1, Math.floor(u.ownerEnd.getTime() / DAY));
      if (a1 < a0) return;
      var iv = [], blk = [];
      (byU[u.code] || []).forEach(function (r) {
        var s0 = Math.floor(r.start.getTime() / DAY), e0 = Math.floor(r.end.getTime() / DAY);
        if (r.end.getUTCFullYear() >= 2090) { blk.push([s0, a1]); return; }
        if (e0 - s0 < 30) e0 -= 1;
        if (e0 < s0) return;
        iv.push([Math.max(s0, a0), Math.min(e0, a1)]);
      });
      var merge = function (l) { l = l.filter(function (x) { return x[1] >= x[0]; }).sort(function (x, y) { return x[0] - y[0]; }); var m = []; l.forEach(function (x) { var t = m[m.length - 1]; if (t && x[0] <= t[1] + 1) t[1] = Math.max(t[1], x[1]); else m.push([x[0], x[1]]); }); return m; };
      var bl = merge(blk.map(function (x) { return [Math.max(x[0], a0), Math.min(x[1], a1)]; })), blocked = 0;
      bl.forEach(function (x) { blocked += x[1] - x[0] + 1; });
      var avail = a1 - a0 + 1 - blocked; if (avail <= 0) return;
      var oc = merge(iv), occ = 0;
      oc.forEach(function (x) {   // الأيام المشغولة اللي مش جوه فترة خارج التشغيل
        var d = x[1] - x[0] + 1;
        bl.forEach(function (b) { var o = Math.min(x[1], b[1]) - Math.max(x[0], b[0]) + 1; if (o > 0) d -= o; });
        occ += Math.max(0, d);
      });
      out.push({ unit: u, group: groupOf(u.project), beds: num(u.bedrooms) || 0, avail: avail, occ: Math.min(occ, avail), idle: avail - Math.min(occ, avail), pct: Math.min(occ, avail) / avail,
        contracts: (byU[u.code] || []).filter(function (r) { var s0 = Math.floor(r.start.getTime() / DAY), e0 = Math.floor(r.end.getTime() / DAY); return r.end.getUTCFullYear() < 2090 && s0 <= a1 && e0 >= a0; }).length });
    });
    return out;
  }
  function occSum(rows) { var a = 0, o = 0; rows.forEach(function (x) { a += x.avail; o += x.occ; }); return { units: rows.length, avail: a, occ: o, idle: a - o, pct: a ? o / a : 0 }; }

  // ---------- تأمينات لسه مترجعتش ----------
  // عقود خلصت وصافي التأمين (تحصيل - رد) لسه موجب في أي خزينة
  function heldDeposits(units, renters, ledger, settings, today) {
    today = today || L.todayUTC();
    var ub = {}; units.forEach(function (u) { ub[u.code] = u; });
    var out = [];
    renters.forEach(function (r) {
      if (!r.code || !r.end || r.end >= today || r.end.getUTCFullYear() >= 2090) return;
      var u = ub[r.unit]; if (!inScope(u, settings)) return;
      var g = ledger[r.code]; if (!g || !g.deposits) return;
      var list = [], egp = 0;
      Object.keys(g.deposits).forEach(function (c) { var d = g.deposits[c]; if (d.egp > 0.5 || d.fx > 0.5) { list.push({ cash: c, egp: Math.round(d.egp), fx: Math.round(d.fx) }); egp += d.egp; } });
      if (!list.length) return;
      out.push({ r: r, unit: u, list: list, total: Math.round(egp), days: L.daysBetween(r.end, today), received: isReceived(r) });
    });
    return out.sort(function (a, b) { return b.days - a.days; });
  }

  // ---------- عقود الملاك ----------
  // الزيادة السنوية مكتوبة في الملف بأشكال مختلفة: 10 أو 0.1 أو "10%" → نسبة مئوية
  function parseIncrease(v) {
    var t = str(v).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }), m = t.match(/[\d.]+/);
    if (!m) return null;
    var n = Number(m[0]); if (!(n > 0)) return null;
    return n < 1 ? Math.round(n * 1000) / 10 : n;
  }
  // عدد الدورات الشهرية بين البداية والنهاية (عقد 15/10 → 14/10 السنة الجاية = 12)
  function cyclesBetween(start, end) {
    var e1 = new Date(end.getTime() + DAY), n = (e1.getUTCFullYear() - start.getUTCFullYear()) * 12 + (e1.getUTCMonth() - start.getUTCMonth());
    if (e1.getUTCDate() < start.getUTCDate()) n--;
    return Math.max(1, n + (e1.getUTCDate() > start.getUTCDate() ? 1 : 0));
  }
  // شهور عقد المالك: أول ١٢ شهر بالإيجار، وبعدين الزيادة كل سنة (زيادة على الزيادة) لحد النهاية
  // inc: {pct} نسبة أو {amt} مبلغ ثابت كل سنة. الشهر بياخد مفتاح شهر بداية الدورة
  function planOwnerMonths(start, end, rent, inc, firstYear) {
    var n = cyclesBetween(start, end), out = [], k0 = L.monthKey(start), y0 = firstYear || 0;
    for (var i = 0; i < n; i++) {
      var y = Math.floor(i / 12) + y0, v = rent;
      if (inc && inc.pct) v = rent * Math.pow(1 + inc.pct / 100, y);
      else if (inc && inc.amt) v = rent + inc.amt * y;
      out.push({ key: L.monthKey(L.addMonths(keyToDate(k0), i)), amount: Math.round(v), year: y + 1 });
    }
    return out;
  }
  // كود الوحدة الجديدة: بيتعلم القاعدة من وحدات نفس الكمبوند (بادئة + رقم العمارة + رقم الشقة)
  function suggestUnitCode(units, project, building, apt) {
    // العمارة لو حرف لوحده (A أو B) بتتحول لرقمها (1 أو 2) زي بورتو
    var dg = function (x) { var t = str(x), d = t.replace(/\D/g, ''); return d || (/^[A-Za-z]$/.test(t) ? String(t.toUpperCase().charCodeAt(0) - 64) : ''); }, pad = function (x, w) { while (x.length < w) x = '0' + x; return x; };
    var p = str(project).toLowerCase(), same = units.filter(function (u) { return str(u.project).toLowerCase() === p; });
    var votes = {};
    same.forEach(function (u) {
      var c = str(u.code), bd = dg(u.building), ad = dg(u.apt);
      for (var wb = 0; wb <= 3; wb++) for (var wa = 1; wa <= 4; wa++) {
        if (bd.length > wb || ad.length > wa || (wb && !bd)) continue;
        var suf = (wb ? pad(bd, wb) : '') + pad(ad, wa);
        if (c.length > suf.length && c.slice(-suf.length) === suf) { var k = c.slice(0, c.length - suf.length) + '|' + wb + '|' + wa; votes[k] = (votes[k] || 0) + 1; }
      }
    });
    var best = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a] || b.split('|')[0].length - a.split('|')[0].length; })[0];
    if (!best) return { code: '', rule: '' };
    var pr = best.split('|'), wb2 = +pr[1], wa2 = +pr[2], bd2 = dg(building), ad2 = dg(apt);
    var rule = 'بادئة ' + pr[0] + (wb2 ? ' + العمارة ' + wb2 + ' رقم' : '') + ' + الشقة ' + wa2 + ' رقم (من ' + votes[best] + ' وحدة)';
    if (!ad2 || ad2.length > wa2 || (wb2 && (!bd2 || bd2.length > wb2))) return { code: '', rule: rule };
    var code = pr[0] + (wb2 ? pad(bd2, wb2) : '') + pad(ad2, wa2);
    var taken = units.some(function (u) { return str(u.code) === code; });
    return { code: code, rule: rule, taken: taken };
  }

  // ---------- مصروفات بالجملة ----------
  // كل سطر: كود الوحدة والمبلغ (وأي كلام زيادة يبقى بيان). بيقبل اللصق من الإكسيل أو الواتساب
  function parseBulk(text, units) {
    var byCode = {}; (units || []).forEach(function (u) { byCode[str(u.code)] = u; });
    var ar = function (x) { return String(x).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/٫/g, '.'); };
    var out = [];
    String(text || '').split(/\r?\n/).forEach(function (line, li) {
      var raw = line.trim(); if (!raw) return;
      var t = ar(raw).replace(/(\d)[,٬،](?=\d{3}(\D|$))/g, '$1');
      var toks = t.split(/[\t,;|،]+|\s+/).filter(Boolean), unit = null, amount = null, words = [];
      toks.forEach(function (k) {
        var clean = k.replace(/^[^\d]+|[^\d.]+$/g, '');
        if (!unit && byCode[clean]) { unit = byCode[clean]; return; }
        if (amount === null && /^\d+(\.\d+)?$/.test(clean) && (unit || !byCode[clean]) && !(!unit && clean.length >= 6)) { amount = Number(clean); return; }
        if (/[\u0600-\u06FFa-zA-Z0-9]/.test(k)) words.push(k);
      });
      var guess = '';
      if (!unit) words = words.filter(function (w) { var d = w.replace(/\D/g, ''); if (!guess && d.length >= 5 && d === w) { guess = d; return false; } return true; });
      var row = { line: li + 1, raw: raw, unit: unit, code: unit ? unit.code : guess, amount: amount || 0, note: words.join(' ').trim(), err: '' };
      if (!unit) row.err = 'مش لاقي الوحدة دي';
      else if (!(row.amount > 0)) row.err = 'اكتب المبلغ';
      out.push(row);
    });
    return out;
  }

  // بيانات تحويل الإيجار للمالك (للبنك أو المحاسب)
  function ownerTransfer(x) {
    var u = x.unit;
    var unit = [u.project, u.building, u.apt].filter(function (v) { return str(v) && str(v) !== '0'; }).join(' - ');
    return {
      // لو مفيش مستفيد، المالك نفسه هو المستفيد
      name: u.benName || u.owner || '', acc: u.benAcc || '', bank: u.bank || '', method: u.payMethod || '', amount: Math.round(x.required || 0),
      text: ['المستفيد: ' + (u.benName || u.owner || '-'), 'رقم الحساب: ' + (u.benAcc || '-'), 'البنك: ' + (u.bank || '-'), 'طريقة الدفع: ' + (u.payMethod || '-'),
        'المبلغ: ' + nf(x.required || 0) + ' EGP', 'عن: ' + (x.every || 1) + ' شهر', 'الوحدة: ' + (unit || u.code) + ' · كود ' + u.code, 'المالك: ' + (u.owner || '-')].join('\n')
    };
  }
  // نفس نص رسالة الشيت بالظبط
  function ownerMessage(x) {
    var u = x.unit, p = x.paidUntil;
    return 'نحيط سيادتكم علما  أ-' + u.owner + '- انه تم سداد مبلغ' + '  ' + x.lastSum + ' ج ' + ' من حساب ايجار الوحدة رقم' + '  ' + u.building + '-' + u.apt + '  ' + 'كمبوند ' + u.project +
      ' حتى ' + (p ? p.getUTCDate() + '-' + (p.getUTCMonth() + 1) + '-' + p.getUTCFullYear() : '') + ' . هذه رسالة تلقائية , شكرا لتفهمكم ';
  }
  function waLink(phone, text) {
    var d = str(phone).replace(/[^\d]/g, '');
    if (/^01\d{9}$/.test(d)) d = '2' + d;
    if (phone === null) return 'https://web.whatsapp.com/send?text=' + encodeURIComponent(text); // من غير رقم: تختار الشات
    return d ? 'https://web.whatsapp.com/send?phone=' + d + '&text=' + encodeURIComponent(text) : '';
  }

  var api = {
    CAT: CAT, TENANT_CATS: TENANT_CATS, TENANT_MONTH: TENANT_MONTH, OWNER_CATS: OWNER_CATS, OWNER_MONTH: OWNER_MONTH,
    ownerFollow: ownerFollow, ownerMessage: ownerMessage, ownerTransfer: ownerTransfer, tenantStatement: tenantStatement, ownerStatement: ownerStatement, findDuplicates: findDuplicates, waLink: waLink, sideDefaults: sideDefaults, parseBulk: parseBulk, occupancy: occupancy, occSum: occSum, heldDeposits: heldDeposits, parseIncrease: parseIncrease, cyclesBetween: cyclesBetween, planOwnerMonths: planOwnerMonths, suggestUnitCode: suggestUnitCode, compareMonth: compareMonth, ownerByBeds: ownerByBeds, ownerPaid: ownerPaid, ownerSuggest: ownerSuggest, partialPeriod: partialPeriod, monthRemaining: monthRemaining, DEFAULT_SETTINGS: DEFAULT_SETTINGS, FOLLOW_FROM: FOLLOW_FROM,
    keyToDate: keyToDate, keyRange: keyRange, cmpKey: cmpKey, isForeign: isForeign,
    inScope: inScope, projectsOf: projectsOf, buildLedger: buildLedger, followUp: followUp, GROUPS: GROUPS, groupOf: groupOf, groupsIn: groupsIn, expectedIn: expectedIn, keyToDate: keyToDate, isNightly: isNightly, planExtend: planExtend, planEarly: planEarly, installments: installments, opsMessage: opsMessage, opsBulk: opsBulk, exits: exits, isReceived: isReceived, RECEIVED: RECEIVED, PENDING_DAYS: PENDING_DAYS,
    monthsDetail: monthsDetail, suggestCollection: suggestCollection, validateEntry: validateEntry,
    entryValues: entryValues, availability: availability, planTransfer: planTransfer, depositMoves: depositMoves
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OsoolFollow = api;
})(this);
