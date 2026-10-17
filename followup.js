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
        var ms = num(c['شهر'][i]), es = num(c['نهاية الايجار'][i]);
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
      var status = cur ? 'مشغولة' : next ? 'محجوزة' : 'فاضية';
      var upcoming = mine.filter(function (r) { return r.start > today; }).length;
      return { unit: u, current: cur, next: next, upcoming: upcoming, freeFrom: freeFrom, daysToFree: cur ? L.daysBetween(today, cur.end) : 0, status: status, remaining: rem.trim() };
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
      if (!out[u] || m >= out[u].m) out[u] = { m: m, amt: num(c['مصروف'][i]) || (out[u] && out[u].m === m ? out[u].amt : 0) };
    }
    return out;
  }
  // اقتراح سداد المالك: الشهر اللي بعد آخر شهر اتسدد، ومبلغه من أعمدة شهور عقد المالك
  function ownerSuggest(unit, ownerMonths, paid, today, count) {
    today = today || L.todayUTC();
    var lp = paid[unit.code], last = lp ? lp.m : null, first;
    if (last) first = L.addMonths(new Date(Date.UTC(L.serialToDate(last).getUTCFullYear(), L.serialToDate(last).getUTCMonth(), 1)), 1);
    else first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    var rows = [];
    for (var k = 0; k < (count || 1); k++) {
      var m = L.addMonths(first, k), key = L.monthKey(m);
      var amt = ownerMonths && ownerMonths[key] ? num(ownerMonths[key][unit.idx]) : 0;
      rows.push({ key: key, from: m, to: new Date(L.addMonths(m, 1).getTime() - DAY), amount: amt || (lp && lp.amt) || unit.rent || 0, source: amt ? 'sheet' : lp && lp.amt ? 'last' : 'rent' });
    }
    return { lastPaid: last ? L.serialToDate(last) : null, lastAmount: lp ? lp.amt : 0, rows: rows };
  }

  // ---------- متابعة الملاك (زي شيت متابعة ملاك) ----------
  function ownerFollow(units, t, ownerMonths, settings, today) {
    today = today || L.todayUTC();
    var c = t.cols, n = c['فئة'].length, agg = {};
    var curKey = L.monthKey(today), keys = keyRange(FOLLOW_FROM, curKey);
    for (var i = 0; i < n; i++) {
      var cat = str(c['فئة'][i]); if (cat !== 'سداد ايجار' && cat !== 'رد ايجار من مالك') continue;
      var u = str(c['كود'] ? c['كود'][i] : ''); if (!u) continue;
      var g = agg[u] || (agg[u] = { byMonth: {}, m: 0, end: 0, date: 0, amt: 0, payments: [] });
      var k = keyOf(c['شهر'][i]);
      if (cat === 'رد ايجار من مالك') { if (k) g.byMonth[k] = (g.byMonth[k] || 0) - num(c['ايراد'][i]); continue; }
      var out = num(c['مصروف'][i]), m = num(c['شهر'][i]), e = num(c['نهاية الايجار'][i]), dt = Math.floor(num(c['تاريخ'][i]));
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
        status: daysLeft === null ? 'none' : daysLeft < 0 ? 'late' : daysLeft <= 7 ? 'soon' : 'ok'
      };
    }).sort(function (a, b) { return (a.daysLeft === null ? 99999 : a.daysLeft) - (b.daysLeft === null ? 99999 : b.daysLeft); });
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
    return d ? 'https://web.whatsapp.com/send?phone=' + d + '&text=' + encodeURIComponent(text) : '';
  }

  var api = {
    CAT: CAT, TENANT_CATS: TENANT_CATS, TENANT_MONTH: TENANT_MONTH, OWNER_CATS: OWNER_CATS, OWNER_MONTH: OWNER_MONTH,
    ownerFollow: ownerFollow, ownerMessage: ownerMessage, waLink: waLink, sideDefaults: sideDefaults, ownerPaid: ownerPaid, ownerSuggest: ownerSuggest, DEFAULT_SETTINGS: DEFAULT_SETTINGS, FOLLOW_FROM: FOLLOW_FROM,
    keyToDate: keyToDate, keyRange: keyRange, cmpKey: cmpKey, isForeign: isForeign,
    inScope: inScope, projectsOf: projectsOf, buildLedger: buildLedger, followUp: followUp,
    monthsDetail: monthsDetail, suggestCollection: suggestCollection, validateEntry: validateEntry,
    entryValues: entryValues, availability: availability, planTransfer: planTransfer, depositMoves: depositMoves
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OsoolFollow = api;
})(this);
