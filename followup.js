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
    if (e.category === CAT.rentIn) {
      if (!str(e.tenantCode)) err.push('كود المستأجر ناقص.');
      if (!e.month) err.push('حدد الشهر.');
      if (e.from && e.to && e.to < e.from) err.push('نهاية الفترة قبل بدايتها.');
      if (e.to && e.contractEnd && e.to > e.contractEnd) err.push('نهاية الفترة بعد نهاية العقد (' + L.fmt(e.contractEnd) + ').');
    }
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

  var api = {
    CAT: CAT, DEFAULT_SETTINGS: DEFAULT_SETTINGS, FOLLOW_FROM: FOLLOW_FROM,
    keyToDate: keyToDate, keyRange: keyRange, cmpKey: cmpKey, isForeign: isForeign,
    inScope: inScope, projectsOf: projectsOf, buildLedger: buildLedger, followUp: followUp,
    monthsDetail: monthsDetail, suggestCollection: suggestCollection, validateEntry: validateEntry,
    entryValues: entryValues, availability: availability, planTransfer: planTransfer, depositMoves: depositMoves
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OsoolFollow = api;
})(this);
