/* لوحة أصول — شاشات التحصيلات والنقل وإعداد الملف */
(function () {
  'use strict';
  var App = window.OsoolApp, F = window.OsoolFollow, L = App.L, S = App.S, A = App.A;
  var $ = App.$, esc = App.esc, money = App.money, digits = App.digits;
  var MONTH_RE = /^[A-Z][a-z]{2}-\d{2}$/;
  var ENTRY_COLS = ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'شهر', 'نهاية الايجار', 'كود المستأجر', 'كاش', 'العملة', 'رقم المستند', 'كود', 'بيان'];
  var COPY_FIELDS = ['الاسم', 'Special', 'Rate', 'الجنسية', 'رقم البطاقة - جواز السفر', 'التليفون', 'التأمين', 'تحصيل كل', 'Operation', 'الاستهلاكات', 'موقف الاستلام'];
  var C = { view: 'late', op: '', sort: 'amount', q: '', flash: '' };

  function loadingHtml(t) { return '<div class="loading"><div class="spin"></div>' + t + '</div>'; }
  function errHtml(e) { return '<div class="msg err">' + esc(e.message || e) + '</div>'; }
  function ctx() { return { units: S.units, renters: S.renters, months: S.months, ledger: S.ledger }; }
  function unitOf(code) { return S.units.filter(function (u) { return u.code === String(code); })[0]; }
  function today() { return L.todayUTC(); }

  function ensureSettings() {
    if (S.settingsLoaded) return Promise.resolve();
    return A.getSettings().then(function (s) { S.settings = s; S.settingsLoaded = true; });
  }
  function ensureTreasury() {
    if (S.ledger) return Promise.resolve();
    return A.loadTreasury().then(function (t) { S.treasury = t; S.ledger = F.buildLedger(t); });
  }
  function appendTreasury(values) {
    if (!S.treasury) return;
    ENTRY_COLS.forEach(function (k) { if (S.treasury.cols[k]) S.treasury.cols[k].push(values[k] === undefined ? '' : values[k]); });
    S.ledger = F.buildLedger(S.treasury);
  }
  function scopeText(s) {
    if (!s) return '';
    return (s.mode === 'only' ? 'المشاريع دي بس: ' : 'كل المشاريع ما عدا: ') + (s.projects.length ? s.projects.join('، ') : '—');
  }

  // ======================= إعداد الملف =======================
  function openSettings() {
    var cur = S.settings || F.DEFAULT_SETTINGS;
    var projects = F.projectsOf(S.units);
    App.openSheet('<h2>نطاق الملف ده</h2><p class="r2">المتابعة هتحسب الوحدات اللي جوه النطاق بس. الإعداد بيتحفظ جوه الملف، فكل الفريق هيشوف نفس النطاق.</p>' +
      '<label class="radio"><input type="radio" name="mode" value="exclude"' + (cur.mode !== 'only' ? ' checked' : '') + '> كل المشاريع ما عدا اللي هتختارها</label>' +
      '<label class="radio"><input type="radio" name="mode" value="only"' + (cur.mode === 'only' ? ' checked' : '') + '> المشاريع اللي هتختارها بس</label>' +
      '<div class="chks">' + projects.map(function (p) {
        var on = cur.projects.some(function (x) { return x.trim().toLowerCase() === p.toLowerCase(); });
        return '<label class="chk"><input type="checkbox" value="' + esc(p) + '"' + (on ? ' checked' : '') + '> ' + esc(p) + '</label>';
      }).join('') + '</div>' +
      '<p class="r2">وحدات التسويات <span dir="ltr">N-F</span> مستبعدة دايماً من كل الملفات.</p>' +
      '<div id="setMsg"></div><div style="display:flex;gap:8px"><button class="btn ghost" id="setBack">إلغاء</button><button class="btn primary" id="setSave">حفظ</button></div>');
    $('setBack').onclick = App.closeSheet;
    $('setSave').onclick = function () {
      var mode = document.querySelector('input[name=mode]:checked').value;
      var list = Array.prototype.slice.call(document.querySelectorAll('.chks input:checked')).map(function (i) { return i.value; });
      if (mode === 'only' && !list.length) { $('setMsg').innerHTML = '<div class="msg err">اختار مشروع واحد على الأقل.</div>'; return; }
      var obj = { mode: mode, projects: list };
      this.disabled = true;
      A.saveSettings(obj).then(function () {
        S.settings = obj; S.settingsLoaded = true; App.closeSheet();
        if (S.tab === 'coll') drawColl();
      }).catch(function (e) { $('setMsg').innerHTML = errHtml(e); $('setSave').disabled = false; });
    };
  }
  $('gear').addEventListener('click', function () { ensureSettings().then(openSettings); });

  // ======================= التحصيلات =======================
  function renderColl() {
    var box = $('tab-coll');
    box.innerHTML = loadingHtml('بيقرا الخزينة ويحسب المتابعة…');
    ensureSettings().then(ensureTreasury).then(function () {
      if (!S.settings) {
        box.innerHTML = '<div class="card"><h3>قبل ما نبدأ</h3><p style="margin:0 0 10px">حدد الملف ده بيتابع أنهي مشاريع. ده بيتعمل مرة واحدة للملف كله.</p>' +
          '<button class="btn primary" id="firstSet" style="width:100%">تحديد النطاق</button></div>';
        $('firstSet').onclick = openSettings; return;
      }
      drawColl();
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }

  function drawColl() {
    var items = F.followUp(ctx(), S.settings, today());
    S.fu = items;
    var late = items.filter(function (x) { return x.late; });
    var bal = items.filter(function (x) { return x.balance > 1; });
    var ops = {}; bal.forEach(function (x) { var o = x.r.operation; if (o) ops[o] = 1; });
    var box = $('tab-coll');
    box.innerHTML = (C.flash ? '<div class="msg ok">' + esc(C.flash) + '</div>' : '') +
      '<div class="sum"><div class="box"><div class="v late">' + late.length + '</div><div class="k">متأخر</div></div>' +
      '<div class="box"><div class="v">' + money(Math.round(late.reduce(function (a, x) { return a + x.balance; }, 0))) + '</div><div class="k">إجمالي المتأخرات</div></div></div>' +
      '<div class="r2" style="margin-bottom:8px">' + esc(scopeText(S.settings)) + ' · <button class="link" id="chgScope">تغيير</button></div>' +
      '<div class="seg" id="vSeg"><button data-v="late">المتأخرين</button><button data-v="all">كل اللي عليهم رصيد (' + bal.length + ')</button></div>' +
      '<div class="filters"><select id="fOp"><option value="">كل المسؤولين</option>' + Object.keys(ops).sort().map(function (o) { return '<option' + (o === C.op ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      '<select id="fSort"><option value="amount">الأكبر مبلغ</option><option value="days"' + (C.sort === 'days' ? ' selected' : '') + '>الأقدم تأخير</option></select></div>' +
      '<input id="fQ" placeholder="بحث بالاسم أو الكود" value="' + esc(C.q) + '" autocomplete="off" style="margin-bottom:8px">' +
      exportBar('collExp') +
      '<div id="collList"></div>';
    C.flash = '';
    document.querySelectorAll('#vSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === C.view);
      b.onclick = function () { C.view = b.dataset.v; document.querySelectorAll('#vSeg button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawList(); };
    });
    $('fOp').onchange = function () { C.op = this.value; drawList(); };
    $('fSort').onchange = function () { C.sort = this.value; drawList(); };
    $('fQ').oninput = function () { C.q = this.value; drawList(); };
    $('chgScope').onclick = openSettings;
    bindExport('collExp', function () {
      var list = S.collView || [];
      return { name: (C.view === 'late' ? 'المتأخرات ' : 'الأرصدة ') + L.toISO(today()),
        headers: ['الاسم', 'كود المستأجر', 'المشروع', 'عمارة', 'شقة', 'المسؤول', 'التليفون', 'الرصيد', 'مسدد لحد', 'ملاحظة', 'أيام التأخير', 'بداية العقد', 'نهاية العقد', 'رصيد التأمين'],
        rows: list.map(function (x) { var u = x.unit || {}; return [x.r.name, x.r.code, u.project || '', u.building || '', u.apt || '', x.r.operation, x.r.phone, Math.round(x.balance), x.paidUntil, x.paidNote, x.daysLate, x.r.start, x.r.end, x.deposit]; }) };
    });
    drawList();
  }

  function statusLine(x) {
    if (x.late) return '<span class="late">متأخر ' + x.daysLate + ' يوم</span> · ' + (x.paidNote === 'مفيش تحصيل' ? 'مفيش تحصيل من البداية' : 'مسدد لحد ' + L.fmt(x.paidUntil) + (x.paidNote ? ' (' + x.paidNote + ')' : ''));
    return '<span class="okc">مسدد لحد ' + L.fmt(x.paidUntil) + '</span>';
  }
  function drawList() {
    var list = (S.fu || []).filter(function (x) { return C.view === 'late' ? x.late : x.balance > 1; });
    if (C.op) list = list.filter(function (x) { return x.r.operation === C.op; });
    var q = L.norm(C.q);
    if (q) list = list.filter(function (x) { return L.norm(x.r.name + ' ' + x.r.code).indexOf(q) !== -1; });
    list.sort(C.sort === 'days' ? function (a, b) { return b.daysLate - a.daysLate; } : function (a, b) { return b.balance - a.balance; });
    S.collView = list;
    $('collList').innerHTML = list.length ? list.map(function (x) {
      return '<div class="rcard click" data-code="' + esc(x.r.code) + '"><div class="top2"><div><div class="r1">' + esc(x.r.name || '—') + '</div>' +
        '<div class="r2">' + esc(x.unit ? App.unitTitle(x.unit) : x.r.unit) + '</div></div><div class="amt">' + money(x.balance) + '</div></div>' +
        '<div class="r2" style="margin-top:4px">' + statusLine(x) + '</div>' +
        '<div style="margin-top:4px"><span class="pill" dir="ltr">' + esc(x.r.code) + '</span> ' + (x.r.operation ? '<span class="pill">' + esc(x.r.operation) + '</span>' : '') + '</div></div>';
    }).join('') : '<div class="empty" style="padding:8px">مفيش حد هنا.</div>';
    document.querySelectorAll('#collList .rcard').forEach(function (c) { c.onclick = function () { openDetail(c.dataset.code); }; });
  }

  function cashOptions(sel) {
    var list = S.cash.length ? S.cash : ['جنيه  خزينة'];
    return list.map(function (c) { return '<option value="' + esc(c) + '"' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
  }

  function openDetail(code) {
    var x = (S.fu || []).filter(function (i) { return i.r.code === code; })[0]; if (!x) return;
    var sg = F.suggestCollection(x, today()), rows = F.monthsDetail(x, today()), r = x.r;
    var keys = Object.keys(x.dues).filter(function (k) { return F.cmpKey(k, F.FOLLOW_FROM) >= 0; });
    if (keys.indexOf(sg.month) === -1) keys.push(sg.month);
    keys.sort(F.cmpKey);
    var depLines = Object.keys(x.ledger.deposits || {}).filter(function (c) { return Math.abs(x.ledger.deposits[c].egp) > 0.5; })
      .map(function (c) { return money(x.ledger.deposits[c].egp) + ' في ' + esc(c); }).join('<br>') || 'مفيش';
    App.openSheet('<h2 style="margin-bottom:2px">' + esc(r.name || '—') + '</h2><div class="r2" dir="ltr" style="text-align:right">' + esc(r.code) + '</div>' +
      '<dl class="kv"><dt>الوحدة</dt><dd>' + esc(x.unit ? App.unitTitle(x.unit) : r.unit) + '</dd><dt>العقد</dt><dd>' + L.fmt(r.start) + ' ← ' + L.fmt(r.end) + '</dd>' +
      (r.phone ? '<dt>التليفون</dt><dd dir="ltr" style="text-align:right">' + esc(r.phone) + '</dd>' : '') +
      '<dt>الرصيد</dt><dd><b>' + money(x.balance) + '</b></dd><dt>الحالة</dt><dd>' + statusLine(x) + '</dd><dt>التأمين</dt><dd>' + depLines + '</dd></dl>' +
      '<div class="card" style="margin-top:10px;padding:10px"><table class="mt"><tr><th>الشهر</th><th class="n">مستحق</th><th class="n">محصل</th><th class="n">متبقي</th></tr>' +
      rows.slice(-8).map(function (m) { return '<tr><td>' + L.monthLabel(m.key) + '</td><td class="n">' + money(m.due) + '</td><td class="n">' + money(m.coll) + '</td><td class="n' + (m.remaining > 0 ? ' late' : '') + '">' + money(m.remaining) + '</td></tr>'; }).join('') +
      '</table>' + (rows.length > 8 ? '<div class="r2" style="margin-top:4px">آخر ٨ شهور من ' + rows.length + '</div>' : '') + '</div>' +
      '<h2 style="font-size:15px;margin:14px 0 4px">تسجيل تحصيل</h2>' +
      '<div class="grid2"><div><label>التاريخ</label><input type="date" id="cDate" value="' + L.toISO(today()) + '" max="' + L.toISO(today()) + '"></div>' +
      '<div><label>المبلغ بالجنيه</label><input id="cAmt" class="ltr" inputmode="decimal" value="' + (sg.amount || '') + '"></div></div>' +
      '<div class="grid2"><div><label>الخزينة</label><select id="cCash">' + cashOptions('جنيه  خزينة') + '</select></div>' +
      '<div id="cFxBox" class="hide"><label>المبلغ بالعملة</label><input id="cFx" class="ltr" inputmode="decimal"></div></div>' +
      '<label>عن شهر</label><select id="cMonth">' + keys.map(function (k) { return '<option value="' + k + '"' + (k === sg.month ? ' selected' : '') + '>' + L.monthLabel(k) + (x.dues[k] ? ' — ' + money(x.dues[k]) : '') + '</option>'; }).join('') + '</select>' +
      '<div class="grid2"><div><label>من</label><input type="date" id="cFrom" value="' + L.toISO(sg.from) + '"></div><div><label>إلى</label><input type="date" id="cTo" value="' + L.toISO(sg.to) + '"></div></div>' +
      '<div class="grid2"><div><label>رقم المستند</label><input id="cDoc" class="ltr"></div><div><label>البيان</label><input id="cNote" value="' + esc(r.name) + '"></div></div>' +
      '<div id="cMsg" style="margin-top:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" id="cBack">رجوع</button>' +
      (r.idx >= 0 ? '<button class="btn ghost" id="cGo">سطر العقد</button>' : '') + '<button class="btn primary" id="cSave">تسجيل</button></div>');
    var fx = function () { $('cFxBox').classList.toggle('hide', !F.isForeign($('cCash').value)); };
    $('cCash').onchange = fx; fx();
    $('cBack').onclick = App.closeSheet;
    if ($('cGo')) $('cGo').onclick = function () { A.goToRow(r.idx); };
    var armed = false;
    ['cDate', 'cAmt', 'cCash', 'cFx', 'cMonth', 'cFrom', 'cTo'].forEach(function (id) { $(id).addEventListener('input', function () { armed = false; $('cSave').textContent = 'تسجيل'; $('cMsg').innerHTML = ''; }); });
    $('cSave').onclick = function () {
      var e = {
        date: L.parseISO($('cDate').value), amount: digits($('cAmt').value), cash: $('cCash').value, fx: F.isForeign($('cCash').value) ? digits($('cFx').value) : '',
        category: F.CAT.rentIn, side: 'in', tenantCode: r.code, unitCode: r.unit, month: $('cMonth').value,
        from: L.parseISO($('cFrom').value), to: L.parseISO($('cTo').value), contractEnd: r.end, doc: $('cDoc').value, note: $('cNote').value
      };
      var errs = F.validateEntry(e, today());
      if (errs.length) { $('cMsg').innerHTML = errs.map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join(''); return; }
      if (!armed) {
        armed = true; this.textContent = 'تأكيد التسجيل';
        $('cMsg').innerHTML = '<div class="msg warn">هيتسجل ' + money(e.amount) + ' ج تحصيل إيجار عن ' + L.monthLabel(e.month) + ' في ' + esc(e.cash) + '. اضغط تأكيد.</div>';
        return;
      }
      var btn = this; btn.disabled = true; btn.textContent = 'بيسجل…';
      var vals = F.entryValues(e);
      A.writeEntries([vals]).then(function (res) {
        appendTreasury(vals);
        App.closeSheet();
        C.flash = 'اتسجل تحصيل ' + money(e.amount) + ' لـ ' + (r.name || r.code) + ' في سطر الخزينة ' + res.rows[0] + '.';
        drawColl();
      }).catch(function (err) { btn.disabled = false; btn.textContent = 'تأكيد التسجيل'; $('cMsg').innerHTML = errHtml(err); });
    };
  }

  // ======================= النقل =======================
  var T = null;
  function monthsFromRow(row) {
    var o = {};
    Object.keys(row).forEach(function (h) { if (MONTH_RE.test(h)) { var v = Number(row[h]); if (row[h] !== '' && row[h] !== null && isFinite(v) && v) o[h] = v; } });
    return o;
  }
  function startTransfer(idx) {
    var r = S.renters.filter(function (x) { return x.idx === idx; })[0]; if (!r) return;
    App.showTab('transfer');
    var box = $('tab-transfer'); box.innerHTML = loadingHtml('بيقرا العقد والخزينة…');
    Promise.all([A.readRenterRow(idx), ensureTreasury()]).then(function (res) {
      var row = res[0];
      if (String(row['كود المستأجر']).trim() !== r.code) throw new Error('السطر اتغير. اضغط تحديث وجرب تاني.');
      var d = today(); if (d <= r.start) d = new Date(r.start.getTime() + 86400000);
      T = { r: r, row: row, oldMonths: monthsFromRow(row), date: d, unit: null, rent: '', oldEdits: {}, newEdits: {} };
      drawTransfer();
    }).catch(function (e) { box.innerHTML = '<button class="back" id="tBack0">→ رجوع للبحث</button>' + errHtml(e); $('tBack0').onclick = function () { App.showTab('search'); }; });
  }

  function drawTransfer() {
    var r = T.r, u = unitOf(r.unit);
    var deps = F.depositMoves(S.ledger[r.code]);
    var short = L.daysBetween(r.start, r.end) < 30;
    $('tab-transfer').innerHTML = '<button class="back" id="tBack">→ رجوع للبحث</button>' +
      '<div class="card"><h3>العقد الحالي</h3><div class="r1">' + esc(r.name) + '</div><div class="r2" dir="ltr" style="text-align:right">' + esc(r.code) + '</div>' +
      '<dl class="kv"><dt>الوحدة</dt><dd>' + esc(u ? App.unitTitle(u) : r.unit) + '</dd><dt>الفترة</dt><dd>' + L.fmt(r.start) + ' ← ' + L.fmt(r.end) + '</dd>' +
      '<dt>التأمين</dt><dd>' + (deps.length ? deps.map(function (d) { return money(d.egp) + ' في ' + esc(d.cash) + (d.fx ? ' (' + money(d.fx) + ' عملة)' : ''); }).join('<br>') : 'مفيش رصيد تأمين') + '</dd></dl></div>' +
      '<div class="card"><h3>النقل</h3><label>تاريخ النقل</label><input type="date" id="tDate" value="' + L.toISO(T.date) + '">' +
      '<label>الوحدة الجديدة</label><div id="tPick"><input id="tUnitQ" placeholder="ابحث بالكود أو العمارة أو الشقة" autocomplete="off"><div id="tUnitRes" class="results hide"></div></div><div id="tUnitCard"></div>' +
      '<label>' + (short ? 'سعر الليلة في الوحدة الجديدة' : 'الإيجار الشهري في الوحدة الجديدة') + '</label><input id="tRent" class="ltr" inputmode="decimal" value="' + esc(T.rent) + '"></div>' +
      '<div id="tPreview"></div>';
    $('tBack').onclick = function () { App.showTab('search'); };
    $('tDate').onchange = function () { T.date = L.parseISO(this.value); T.oldEdits = {}; T.newEdits = {}; drawPreview(); };
    $('tRent').oninput = function () { T.rent = digits(this.value); T.newEdits = {}; drawPreview(); };
    $('tUnitQ').oninput = function () {
      var res = L.searchUnits(S.units, this.value).filter(function (x) { return x.code !== r.unit; }), box = $('tUnitRes');
      if (!this.value.trim()) { box.classList.add('hide'); return; }
      box.classList.remove('hide');
      box.innerHTML = res.length ? res.map(function (x) { return '<button data-code="' + esc(x.code) + '"><div class="r1">' + esc(App.unitTitle(x) || x.code) + '</div><div class="r2">كود ' + esc(x.code) + '</div></button>'; }).join('') : '<div class="r2" style="padding:10px">مفيش وحدة بالبيانات دي.</div>';
    };
    $('tUnitRes').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; T.unit = unitOf(b.dataset.code); drawUnit(); drawPreview(); };
    if (T.unit) drawUnit();
    drawPreview();
  }
  function drawUnit() {
    var x = T.unit, st = L.unitStatus(x.code, S.renters);
    $('tPick').classList.add('hide');
    $('tUnitCard').innerHTML = '<div class="unit"><div class="head"><div><div class="t">' + esc(App.unitTitle(x) || x.code) + '</div><div class="r2">' +
      (st.current ? 'ساكن: ' + esc(st.current.name) + ' لحد ' + L.fmt(st.current.end) : 'فاضية دلوقتي') + '</div></div><button class="link" id="tChg">تغيير</button></div>' +
      '<div class="code"><span class="r2">الكود الجديد</span><b>' + esc(L.nextTenantCode(x.code, S.renters.map(function (q) { return q.code; }))) + '</b></div></div>';
    $('tChg').onclick = function () { T.unit = null; $('tUnitCard').innerHTML = ''; $('tPick').classList.remove('hide'); $('tUnitQ').value = ''; $('tUnitRes').classList.add('hide'); drawPreview(); };
  }

  function currentPlan() {
    var r = T.r;
    var p = F.planTransfer({ start: r.start, end: r.end, rent: T.row['قيمة الايجار'] }, T.oldMonths, T.date, T.rent);
    if (p.errors.length) return p;
    Object.keys(T.oldEdits).forEach(function (k) { if (k in p.oldChanges && p.oldChanges[k] !== null) p.oldChanges[k] = T.oldEdits[k]; });
    p.schedule.forEach(function (s, i) { if (i in T.newEdits) s.amount = T.newEdits[i]; });
    return p;
  }

  function checks(p) {
    var r = T.r, errs = p.errors.slice(), warns = [];
    if (!errs.length) {
      if (!T.unit) errs.push('اختار الوحدة الجديدة.');
      var miss = p.schedule.filter(function (s) { return S.monthHeaders.indexOf(s.key) === -1; });
      if (miss.length) errs.push('شهور مش موجودة في الجدول: ' + miss.map(function (s) { return L.monthLabel(s.key); }).join('، ') + '.');
      if (!p.schedule.length) warns.push('مفيش استحقاق للسطر الجديد. اتأكد من التاريخ والإيجار.');
      if (T.unit) {
        L.findOverlaps(T.unit.code, T.date, r.end, S.renters).forEach(function (o) {
          warns.push('الوحدة الجديدة فيها ' + (o.name || 'عقد') + ' (' + o.code + ') من ' + L.fmt(o.start) + ' إلى ' + L.fmt(o.end) + '.');
        });
        if (T.unit.ownerEnd && r.end > T.unit.ownerEnd) warns.push('العقد بيخلص بعد نهاية عقد مالك الوحدة الجديدة (' + L.fmt(T.unit.ownerEnd) + ').');
      }
    }
    return { errors: errs, warnings: warns };
  }

  function drawPreview() {
    var box = $('tPreview'), p = currentPlan(), ck = checks(p), r = T.r;
    if (p.errors.length) { box.innerHTML = p.errors.map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join(''); return; }
    var oldKeys = Object.keys(p.oldChanges).sort(F.cmpKey);
    var deps = F.depositMoves(S.ledger[r.code]);
    var dDate = T.date > today() ? today() : T.date;
    box.innerHTML =
      '<div class="card"><h3>السطر القديم بعد النقل</h3><dl class="kv"><dt>النهاية</dt><dd><span class="strike">' + L.fmt(r.end) + '</span> ← <b>' + L.fmt(T.date) + '</b></dd><dt>الملاحظات</dt><dd class="r2">هيتكتب فيها النهاية الأصلية والكود الجديد</dd></dl>' +
      (oldKeys.length ? '<table class="mt" style="margin-top:8px"><tr><th>الشهر</th><th class="n">قبل</th><th class="n">بعد</th></tr>' + oldKeys.map(function (k) {
        var v = p.oldChanges[k];
        return '<tr><td>' + L.monthLabel(k) + '</td><td class="n">' + money(T.oldMonths[k]) + '</td><td class="n">' + (v === null ? '<span class="strike">هيتشال</span>' : '<input class="ltr" data-old="' + k + '" value="' + v + '" style="width:96px;padding:4px 6px">') + '</td></tr>';
      }).join('') + '</table>' : '<div class="r2">مفيش شهور هتتغير.</div>') + '</div>' +
      '<div class="card"><h3>السطر الجديد</h3><dl class="kv"><dt>الفترة</dt><dd>' + L.fmt(T.date) + ' ← ' + L.fmt(r.end) + '</dd><dt>البيانات</dt><dd class="r2">نفس بيانات المستأجر من السطر القديم</dd></dl>' +
      (p.schedule.length ? '<table class="mt" style="margin-top:8px"><tr><th>الشهر</th><th class="n">المبلغ</th></tr>' + p.schedule.map(function (s, i) {
        return '<tr><td>' + L.monthLabel(s.key) + (s.note ? '<div class="r2">' + esc(s.note) + '</div>' : '') + '</td><td class="n"><input class="ltr" data-new="' + i + '" value="' + s.amount + '" style="width:96px;padding:4px 6px"></td></tr>';
      }).join('') + '</table>' : '') + '</div>' +
      '<div class="card"><h3>التأمين</h3>' + (deps.length ? deps.map(function (d) { return '<div>' + money(d.egp) + ' ج في ' + esc(d.cash) + (d.fx ? ' (' + money(d.fx) + ' عملة)' : '') + '</div>'; }).join('') +
        '<div class="r2" style="margin-top:6px">هيتسجل في الخزينة بتاريخ ' + L.fmt(dDate) + ': رد تأمين على الكود القديم، وتحصيل تأمين بنفس المبلغ على الكود الجديد.</div>' : '<div class="r2">مفيش رصيد تأمين على الكود القديم، فمفيش حركات خزينة.</div>') + '</div>' +
      ck.errors.map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join('') +
      ck.warnings.map(function (m) { return '<div class="msg warn">' + esc(m) + '</div>'; }).join('') +
      '<button class="btn primary" id="tGo" style="width:100%;margin-top:4px"' + (ck.errors.length ? ' disabled' : '') + '>مراجعة وتنفيذ النقل</button>';
    box.querySelectorAll('input[data-old]').forEach(function (i) { i.oninput = function () { T.oldEdits[i.dataset.old] = Number(digits(i.value)) || 0; }; });
    box.querySelectorAll('input[data-new]').forEach(function (i) { i.oninput = function () { T.newEdits[+i.dataset.new] = Number(digits(i.value)) || 0; }; });
    $('tGo').onclick = confirmTransfer;
  }

  function confirmTransfer() {
    var p = currentPlan(), ck = checks(p), r = T.r;
    if (ck.errors.length) return drawPreview();
    var deps = F.depositMoves(S.ledger[r.code]);
    var code = L.nextTenantCode(T.unit.code, S.renters.map(function (q) { return q.code; }));
    App.openSheet('<h2>تأكيد النقل</h2><dl class="kv"><dt>المستأجر</dt><dd>' + esc(r.name) + '</dd><dt>من</dt><dd dir="ltr" style="text-align:right">' + esc(r.code) + '</dd>' +
      '<dt>إلى</dt><dd>' + esc(App.unitTitle(T.unit)) + '<br><b dir="ltr">' + esc(code) + '</b></dd><dt>تاريخ النقل</dt><dd>' + L.fmt(T.date) + '</dd>' +
      '<dt>الخزينة</dt><dd>' + (deps.length ? (deps.length * 2) + ' حركات نقل تأمين' : 'مفيش') + '</dd></dl>' +
      ck.warnings.map(function (m) { return '<div class="msg warn">' + esc(m) + '</div>'; }).join('') +
      '<p class="r2">هيتعدل السطر القديم، ويتضاف سطر جديد في عقود المستأجرين' + (deps.length ? '، وحركات التأمين في الخزينة' : '') + '.</p>' +
      '<div id="tMsg"></div><div style="display:flex;gap:8px"><button class="btn ghost" id="tNo">رجوع</button><button class="btn primary" id="tYes">تنفيذ</button></div>');
    $('tNo').onclick = App.closeSheet;
    $('tYes').onclick = function () {
      var btn = this; btn.disabled = true; btn.textContent = 'بينفذ…';
      var monthChanges = {}; Object.keys(p.oldChanges).forEach(function (k) { monthChanges[k] = p.oldChanges[k]; });
      var newMonths = {}; p.schedule.forEach(function (s) { if (Number(s.amount)) newMonths[s.key] = (s.formula && s.amount === s.formulaAmount) ? s.formula : Number(s.amount); });
      var nf = {};
      COPY_FIELDS.forEach(function (k) { var v = T.row[k]; if (v !== '' && v !== null && v !== undefined) nf[k] = v; });
      nf['بداية العقد'] = L.dateToSerial(T.date); nf['نهاية العقد'] = L.dateToSerial(r.end);
      if (!p.short && p.rent) nf['قيمة الايجار'] = p.rent;
      nf['ملاحظات'] = 'منقول من ' + r.code + ' بتاريخ ' + L.fmt(T.date);
      var prev = String(T.row['ملاحظات'] || '').trim();
      var dDate = T.date > today() ? today() : T.date;
      var plan = {
        oldIdx: r.idx, oldCode: r.code, oldUnit: r.unit, oldEndSerial: L.dateToSerial(T.date),
        oldNote: (prev ? prev + ' | ' : '') + 'نهاية العقد الأصلية ' + L.fmt(r.end) + ' — اتنقل لـ {NEW} بتاريخ ' + L.fmt(T.date),
        monthChanges: monthChanges, newUnit: T.unit.code, newFields: nf, newMonths: newMonths,
        deposits: deps, dateSerial: L.dateToSerial(dDate), name: r.name
      };
      A.writeTransfer(plan).then(function (res) {
        App.closeSheet();
        var origEnd = r.end;
        Object.keys(monthChanges).forEach(function (k) { if (S.months[k]) S.months[k][r.idx] = monthChanges[k] === null ? '' : monthChanges[k]; });
        Object.keys(newMonths).forEach(function (k) { if (S.months[k]) S.months[k][res.idx] = typeof newMonths[k] === 'number' ? newMonths[k] : p.schedule.filter(function (s) { return s.key === k; })[0].amount; });
        r.end = T.date;
        S.renters.push({ idx: res.idx, unit: T.unit.code, code: res.code, start: T.date, end: origEnd, name: r.name, phone: r.phone, idNo: r.idNo, nationality: r.nationality, special: r.special, operation: r.operation, broker: '' });
        deps.forEach(function (d) {
          appendTreasury({ 'تاريخ': plan.dateSerial, 'مصروف': d.egp, 'فئة': 'رد تأمين للمستأجر', 'كود المستأجر': r.code, 'كاش': d.cash, 'العملة': d.fx || '' });
          appendTreasury({ 'تاريخ': plan.dateSerial, 'ايراد': d.egp, 'فئة': 'تحصيل تأمين', 'كود المستأجر': res.code, 'كاش': d.cash, 'العملة': d.fx || '' });
        });
        $('tab-transfer').innerHTML = '<div class="card done"><div class="big">✓</div><h2 style="margin:4px 0">اتنقل المستأجر</h2>' +
          '<div class="r2">السطر الجديد رقم ' + res.sheetRow + ' في عقود المستأجرين</div>' +
          '<div class="code" style="margin:14px 0;border:1px solid var(--line)"><span class="r2">الكود الجديد</span><b>' + esc(res.code) + '</b></div>' +
          (res.entryRows && res.entryRows.length ? '<div class="r2" style="margin-bottom:10px">حركات التأمين في سطور الخزينة: ' + res.entryRows.join('، ') + '</div>' : '') +
          (res.duplicate ? '<div class="msg err">الكود ده ظهر مرتين. غالباً حد سجل في نفس اللحظة، راجع السطر.</div>' : '') +
          (res.skipped.length ? '<div class="msg warn">خانات متكتبتش لأن عمودها مش موجود: ' + esc(res.skipped.join('، ')) + '</div>' : '') +
          '<div style="display:flex;gap:8px"><button class="btn ghost" id="tOld">السطر القديم</button><button class="btn primary" id="tDone">تمام</button></div></div>';
        $('tOld').onclick = function () { A.goToRow(r.idx); };
        $('tDone').onclick = function () { App.showTab('search'); };
        $('stat').textContent = S.units.length + ' وحدة · ' + S.renters.length + ' عقد';
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'تنفيذ'; $('tMsg').innerHTML = errHtml(e); });
    };
  }

  // ======================= التصدير =======================
  function exportBar(id) {
    return '<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px"><button class="link" id="' + id + '">تصدير إكسيل</button>' +
      '<button class="link" id="' + id + 'C" style="color:var(--muted)">نسخ الجدول</button><span class="r2" id="' + id + 'M"></span></div>';
  }
  function bindExport(id, getData) {
    $(id).onclick = function () {
      var d = getData();
      if (!d.rows.length) { $(id + 'M').textContent = 'مفيش بيانات.'; return; }
      try { downloadXlsx(d); $(id + 'M').textContent = d.rows.length + ' سطر'; }
      catch (e) { $(id + 'M').textContent = 'التحميل مش متاح هنا، استخدم نسخ الجدول.'; }
    };
    $(id + 'C').onclick = function () {
      var d = getData();
      var tsv = [d.headers].concat(d.rows).map(function (r) { return r.map(function (v) { return v instanceof Date ? L.fmt(v) : String(v === null || v === undefined ? '' : v).replace(/[\t\n]/g, ' '); }).join('\t'); }).join('\n');
      App.copyText(tsv, { set textContent(t) { $(id + 'M').textContent = t === 'اتنسخ' ? 'اتنسخ، الصقه في أي شيت' : ''; } });
    };
  }
  function downloadXlsx(d) {
    if (!window.XLSX) throw new Error('no lib');
    // التاريخ يوم صافي من غير ساعات، والأكواد أرقام (إلا اللي بيبدأ بصفر زي التليفون)
    var rows = d.rows.map(function (r) { return r.map(function (v) {
      if (v instanceof Date) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
      if (typeof v === 'string' && /^[1-9]\d{0,14}$/.test(v.trim())) return Number(v);
      return v === null || v === undefined ? '' : v;
    }); });
    var ws = XLSX.utils.aoa_to_sheet([d.headers].concat(rows), { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = d.headers.map(function (h, i) {
      var w = String(h).length;
      d.rows.slice(0, 300).forEach(function (r) { var v = r[i]; var n = v instanceof Date ? 10 : String(v === null || v === undefined ? '' : v).length; if (n > w) w = n; });
      return { wch: Math.min(45, w + 2) };
    });
    var wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'تقرير');
    var out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
    var blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = d.name + '.xlsx';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    window.__lastExport = d;
  }

  // ======================= المتاح =======================
  var AV = { status: 'active', project: '', beds: '', q: '' };
  function renderAvail() {
    var box = $('tab-avail');
    box.innerHTML = loadingHtml('بيحسب الوحدات…');
    ensureSettings().then(function () {
      var list = F.availability(S.units, S.renters, S.settings || F.DEFAULT_SETTINGS, today());
      list.forEach(function (x) {
        if (x.unit.settle.toUpperCase() === 'OUT' || (x.current && x.current.end.getUTCFullYear() >= 2090)) x.status = 'خارج التشغيل';
      });
      S.avail = list;
      var cnt = function (f) { return list.filter(f).length; };
      var projects = {}, beds = {};
      list.forEach(function (x) { if (x.unit.project) projects[x.unit.project] = 1; if (x.unit.bedrooms) beds[x.unit.bedrooms] = 1; });
      box.innerHTML = '<div class="sum"><div class="box"><div class="v okc">' + cnt(function (x) { return x.status === 'فاضية' || x.status === 'محجوزة'; }) + '</div><div class="k">فاضية النهارده</div></div>' +
        '<div class="box"><div class="v">' + cnt(function (x) { return x.status === 'مشغولة' && x.daysToFree <= 7; }) + '</div><div class="k">هتفضى خلال أسبوع</div></div></div>' +
        (S.settings ? '' : '<div class="msg warn">نطاق الملف لسه متحددش، فالقايمة بالنطاق الافتراضي. حدده من الترس.</div>') +
        '<div class="filters"><select id="aSt"><option value="active">كل الوحدات الشغالة</option><option value="free">فاضية النهارده</option><option value="week">هتفضى خلال أسبوع</option><option value="busy">مشغولة</option><option value="booked">عليها حجز جاي</option><option value="out">خارج التشغيل</option></select>' +
        '<select id="aPr"><option value="">كل المشاريع</option>' + Object.keys(projects).sort().map(function (p) { return '<option' + (p === AV.project ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
        '<div class="filters"><select id="aBd"><option value="">كل الغرف</option>' + Object.keys(beds).sort().map(function (b) { return '<option value="' + esc(b) + '"' + (b === AV.beds ? ' selected' : '') + '>' + esc(b) + ' غرف</option>'; }).join('') + '</select>' +
        '<input id="aQ" placeholder="بحث" value="' + esc(AV.q) + '" autocomplete="off"></div>' +
        exportBar('avExp') + '<div id="avList"></div>';
      $('aSt').value = AV.status;
      $('aSt').onchange = function () { AV.status = this.value; drawAvail(); };
      $('aPr').onchange = function () { AV.project = this.value; drawAvail(); };
      $('aBd').onchange = function () { AV.beds = this.value; drawAvail(); };
      $('aQ').oninput = function () { AV.q = this.value; drawAvail(); };
      bindExport('avExp', function () {
        return { name: 'المتاح ' + L.toISO(today()),
          headers: ['كود', 'المشروع', 'غرف', 'Info', 'بلوك', 'عمارة', 'شقة', 'الحالة', 'مشغول حتى', 'الساكن', 'كود المستأجر', 'محجوز من', 'محجوز إلى', 'اسم العميل', 'نهاية عقد المالك', 'المدة المتبقية', 'تسويات'],
          rows: (S.availView || []).map(function (x) { var u = x.unit, c = x.current, n = x.next;
            return [u.code, u.project, u.bedrooms, u.info, u.block, u.building, u.apt, x.status, c ? c.end : '', c ? c.name : '', c ? c.code : '', n ? n.start : '', n ? n.end : '', n ? n.name : '', u.ownerEnd || '', x.remaining, u.settle]; }) };
      });
      drawAvail();
    });
  }
  function drawAvail() {
    var q = L.norm(AV.q);
    var list = (S.avail || []).filter(function (x) {
      if (AV.status === 'out') { if (x.status !== 'خارج التشغيل') return false; }
      else if (x.status === 'خارج التشغيل') return false;
      if (AV.status === 'free' && x.status === 'مشغولة') return false;
      if (AV.status === 'week' && !(x.status === 'مشغولة' && x.daysToFree <= 7)) return false;
      if (AV.status === 'busy' && x.status !== 'مشغولة') return false;
      if (AV.status === 'booked' && !x.next) return false;
      if (AV.project && x.unit.project !== AV.project) return false;
      if (AV.beds && x.unit.bedrooms !== AV.beds) return false;
      if (q && L.norm([x.unit.code, x.unit.project, x.unit.building, x.unit.apt, x.unit.owner, x.current ? x.current.name : ''].join(' ')).indexOf(q) === -1) return false;
      return true;
    });
    S.availView = list;
    $('avList').innerHTML = list.length ? list.map(function (x) {
      var u = x.unit, c = x.current, n = x.next, st;
      if (x.status === 'خارج التشغيل') st = '<span class="badge done">خارج التشغيل</span>';
      else if (c) st = '<span class="badge book">مشغولة ' + (x.daysToFree === 0 ? 'لحد النهارده' : x.daysToFree + ' يوم') + '</span>';
      else st = '<span class="badge live">فاضية</span>';
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2"><span dir="ltr">' + esc(u.code) + '</span>' + (u.bedrooms ? ' · ' + esc(u.bedrooms) + ' غرف' : '') + (u.info && u.info !== '0' ? ' · ' + esc(u.info) : '') + '</div></div>' + st + '</div>' +
        '<dl class="kv">' + (c && x.status !== 'خارج التشغيل' ? '<dt>الساكن</dt><dd>' + esc(c.name || '—') + ' لحد ' + L.fmt(c.end) + '</dd>' : '') +
        (n ? '<dt>حجز جاي</dt><dd>' + esc(n.name || '—') + ' · ' + L.fmt(n.start) + ' ← ' + L.fmt(n.end) + '</dd>' : '') +
        '<dt>عقد المالك</dt><dd>' + L.fmt(u.ownerEnd) + (x.remaining ? ' · ' + esc(x.remaining) : '') + '</dd></dl></div>';
    }).join('') : '<div class="empty" style="padding:8px">مفيش وحدات بالفلتر ده.</div>';
  }

  // ======================= الخزينة =======================
  var TR = null;
  function renderTreas() {
    var box = $('tab-treas');
    box.innerHTML = loadingHtml('بيقرا الخزينة…');
    ensureTreasury().then(function () {
      var c = S.treasury.cols;
      if (!TR) { var t = today(); TR = { from: new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)), to: t, cash: '', cat: '', side: '', q: '' }; }
      var cats = {}; c['فئة'].forEach(function (v) { v = String(v || '').trim(); if (v) cats[v] = 1; });
      var cashes = {}; c['كاش'].forEach(function (v) { v = String(v || ''); if (v.trim()) cashes[v] = 1; });
      box.innerHTML = '<div class="grid2"><div><label>من</label><input type="date" id="tFrom" value="' + L.toISO(TR.from) + '"></div><div><label>إلى</label><input type="date" id="tTo" value="' + L.toISO(TR.to) + '"></div></div>' +
        '<div class="filters"><select id="tCash"><option value="">كل الخزائن</option>' + Object.keys(cashes).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === TR.cash ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' +
        '<select id="tCat"><option value="">كل الفئات</option>' + Object.keys(cats).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === TR.cat ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="filters"><select id="tSide"><option value="">وارد ومنصرف</option><option value="in">وارد بس</option><option value="out">منصرف بس</option></select>' +
        '<input id="tQ" placeholder="بيان أو كود" value="' + esc(TR.q) + '" autocomplete="off"></div>' +
        '<div id="tSum"></div>' + exportBar('trExp') + '<div id="tList"></div>';
      $('tSide').value = TR.side;
      $('tFrom').onchange = function () { TR.from = L.parseISO(this.value); drawTreas(); };
      $('tTo').onchange = function () { TR.to = L.parseISO(this.value); drawTreas(); };
      $('tCash').onchange = function () { TR.cash = this.value; drawTreas(); };
      $('tCat').onchange = function () { TR.cat = this.value; drawTreas(); };
      $('tSide').onchange = function () { TR.side = this.value; drawTreas(); };
      var tm; $('tQ').oninput = function () { TR.q = this.value; clearTimeout(tm); tm = setTimeout(drawTreas, 200); };
      bindExport('trExp', function () {
        var c = S.treasury.cols, idx = S.treasView || [];
        var g = function (k, i) { return c[k] ? c[k][i] : ''; };
        var d = function (v) { return L.serialToDate(v) || ''; };
        return { name: 'الخزينة ' + L.toISO(TR.from || today()) + ' - ' + L.toISO(TR.to || today()),
          headers: ['التاريخ', 'وارد', 'منصرف', 'رقم المستند', 'الكود', 'الفئة', 'البيان', 'الشهر', 'كود المستأجر', 'الخزينة', 'العملة'],
          rows: idx.map(function (i) { return [d(g('تاريخ', i)), g('ايراد', i), g('مصروف', i), g('رقم المستند', i), g('كود', i), g('فئة', i), g('بيان', i), d(g('شهر', i)), g('كود المستأجر', i), g('كاش', i), g('العملة', i)]; }) };
      });
      drawTreas();
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function drawTreas() {
    var c = S.treasury.cols, n = c['تاريخ'].length, out = [];
    var f = TR.from ? L.dateToSerial(TR.from) : -Infinity, t = TR.to ? L.dateToSerial(TR.to) : Infinity;
    var q = L.norm(TR.q), sin = 0, sout = 0;
    for (var i = 0; i < n; i++) {
      var d = Number(c['تاريخ'][i]); if (!d || d < f || d >= t + 1) continue;
      if (TR.cash && String(c['كاش'][i]) !== TR.cash) continue;
      if (TR.cat && String(c['فئة'][i] || '').trim() !== TR.cat) continue;
      var vin = Number(c['ايراد'][i]) || 0, vout = Number(c['مصروف'][i]) || 0;
      if (TR.side === 'in' && !vin) continue;
      if (TR.side === 'out' && !vout) continue;
      if (q && L.norm([c['بيان'] ? c['بيان'][i] : '', c['كود'] ? c['كود'][i] : '', c['كود المستأجر'][i]].join(' ')).indexOf(q) === -1) continue;
      out.push(i); sin += vin; sout += vout;
    }
    out.sort(function (a, b) { return (Number(c['تاريخ'][b]) - Number(c['تاريخ'][a])) || (b - a); });
    S.treasView = out;
    $('tSum').innerHTML = '<div class="sum"><div class="box"><div class="v okc">' + money(Math.round(sin)) + '</div><div class="k">وارد</div></div><div class="box"><div class="v late">' + money(Math.round(sout)) + '</div><div class="k">منصرف</div></div></div>' +
      '<div class="r2" style="margin:-4px 0 6px">' + out.length + ' حركة · الصافي ' + money(Math.round(sin - sout)) + '</div>';
    var shown = out.slice(0, 100);
    $('tList').innerHTML = shown.length ? shown.map(function (i) {
      var vin = Number(c['ايراد'][i]) || 0, vout = Number(c['مصروف'][i]) || 0;
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(String(c['فئة'][i] || '—')) + '</div><div class="r2">' + esc(String(c['بيان'] ? c['بيان'][i] || '' : '')) + '</div></div>' +
        '<div class="amt ' + (vin ? 'okc' : 'late') + '">' + (vin ? '+' + money(vin) : '−' + money(vout)) + '</div></div>' +
        '<div class="r2" style="margin-top:4px">' + L.fmt(L.serialToDate(c['تاريخ'][i])) + ' · ' + esc(String(c['كاش'][i] || '')) + (c['كود'] && c['كود'][i] ? ' · <span dir="ltr">' + esc(String(c['كود'][i])) + '</span>' : '') + '</div></div>';
    }).join('') + (out.length > 100 ? '<div class="r2" style="padding:6px">ظاهر أحدث ١٠٠ حركة من ' + out.length + '. التصدير فيه الكل.</div>' : '') : '<div class="empty" style="padding:8px">مفيش حركات بالفلتر ده.</div>';
  }

  window.OsoolScreens = {
    onTab: function (t) { if (t === 'coll') renderColl(); else if (t === 'avail') renderAvail(); else if (t === 'treas') renderTreas(); },
    startTransfer: startTransfer, openSettings: openSettings
  };
})();
