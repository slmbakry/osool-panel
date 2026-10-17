/* لوحة أصول — شاشات التحصيلات والنقل وإعداد الملف */
(function () {
  'use strict';
  var App = window.OsoolApp, F = window.OsoolFollow, L = App.L, S = App.S, A = App.A;
  var $ = App.$, esc = App.esc, money = App.money, digits = App.digits;
  var MONTH_RE = /^[A-Z][a-z]{2}-\d{2}$/;
  var ENTRY_COLS = ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'شهر', 'نهاية الايجار', 'كود المستأجر', 'كاش', 'العملة', 'رقم المستند', 'كود', 'بيان', 'بداية الايجار', 'مراجعة'];
  var COPY_FIELDS = ['الاسم', 'Special', 'Rate', 'الجنسية', 'رقم البطاقة - جواز السفر', 'التليفون', 'التأمين', 'تحصيل كل', 'Operation', 'الاستهلاكات', 'موقف الاستلام'];
  var C = { view: 'late', op: '', sort: 'amount', q: '', flash: '', st: 'live', days: 7 };
  try { var savedCD = +localStorage.getItem('osoolPanel.collDays'); if (savedCD > 0) C.days = savedCD; } catch (e) {}
  var DAY_CHOICES = [3, 5, 7, 10, 14, 15, 21, 30];
  function daysSelect(id, cur) {
    var l = DAY_CHOICES.indexOf(cur) === -1 ? DAY_CHOICES.concat([cur]).sort(function (a, b) { return a - b; }) : DAY_CHOICES;
    return '<select id="' + id + '" style="width:auto;padding:1px 4px;font-size:12px;display:inline-block">' + l.map(function (d) { return '<option value="' + d + '"' + (d === cur ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>';
  }
  // حالة العقد: ساري (نهايته النهارده أو بعد كده، ومعاه الجاي) أو منتهي
  function isLive(end) { return !end || end >= today(); }
  function stOk(st, end) { return st === 'all' || (st === 'live') === isLive(end); }
  function stSeg(id, cur) {
    return '<div class="seg" id="' + id + '" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">' + [['live', 'ساري'], ['ended', 'منتهي'], ['all', 'الكل']].map(function (o) {
      return '<button data-st="' + o[0] + '"' + (o[0] === cur ? ' class="on"' : '') + '>' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function bindSeg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.onclick = function () { fn(b.dataset.st); }; }); }

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
      '<label class="chk" style="margin:4px 0 12px;font-size:13px;color:var(--ink)"><input type="checkbox" id="setAuto"' + (cur.autoOpen ? ' checked' : '') + '> افتح البانل لوحده أول ما الملف يتفتح</label>' +
      '<div id="setMsg"></div><div style="display:flex;gap:8px"><button class="btn ghost" id="setBack">إلغاء</button><button class="btn primary" id="setSave">حفظ</button></div>' +
      '<button class="btn ghost" id="setRows" style="width:100%;margin-top:10px">إضافة سطور فاضية للجداول</button>');
    $('setBack').onclick = App.closeSheet;
    $('setRows').onclick = openAddRows;
    $('setSave').onclick = function () {
      var mode = document.querySelector('input[name=mode]:checked').value;
      var list = Array.prototype.slice.call(document.querySelectorAll('.chks input:checked')).map(function (i) { return i.value; });
      if (mode === 'only' && !list.length) { $('setMsg').innerHTML = '<div class="msg err">اختار مشروع واحد على الأقل.</div>'; return; }
      var obj = { mode: mode, projects: list, autoOpen: $('setAuto').checked };
      this.disabled = true;
      A.saveSettings(obj).then(function () {
        S.settings = obj; S.settingsLoaded = true; App.closeSheet();
        if (S.tab === 'coll') drawColl();
      }).catch(function (e) { $('setMsg').innerHTML = errHtml(e); $('setSave').disabled = false; });
    };
  }
  // ======================= إضافة سطور فاضية =======================
  function openAddRows() {
    App.openSheet('<h2>إضافة سطور فاضية</h2>' +
      '<p class="r2">الإكسيل مش بيكبّر الجدول والشيت محمي. فك حماية الشيت، وزوّد السطور من هنا، وبعدين رجّع الحماية.</p>' +
      '<div id="arInfo">' + loadingHtml('بيعد السطور الفاضية…') + '</div>' +
      '<div style="margin-bottom:10px"><label>الجدول</label><select id="arT"><option value="entry">الخزينة</option><option value="renter">عقود المستأجرين</option></select></div>' +
      '<div style="margin-bottom:10px"><label>عدد السطور</label><input id="arN" class="ltr" value="500" inputmode="numeric"></div>' +
      '<div id="arMsg"></div><div style="display:flex;gap:8px"><button class="btn ghost" id="arBack">رجوع</button><button class="btn primary" id="arGo">إضافة</button></div>');
    var show = function () {
      $('arInfo').innerHTML = loadingHtml('بيعد السطور الفاضية…');
      return Promise.all([A.tableInfo('entry'), A.tableInfo('renter')]).then(function (l) {
        $('arInfo').innerHTML = '<div class="card">' + l.map(function (i) {
          return '<div class="r2" style="margin:3px 0"><b>' + esc(i.title) + ':</b> ' + money(i.empty) + ' سطر فاضي من ' + money(i.total) + ' · ' +
            (i.protected ? '<span class="late">الشيت محمي</span>' : '<span class="okc">الحماية مفكوكة</span>') + '</div>';
        }).join('') + '</div>';
      }).catch(function (e) { $('arInfo').innerHTML = errHtml(e); });
    };
    show();
    $('arBack').onclick = function () { App.closeSheet(); };
    $('arGo').onclick = function () {
      var btn = this, n = +digits($('arN').value), name = $('arT').value;
      if (!(n >= 1 && n <= 2000)) { $('arMsg').innerHTML = '<div class="msg err">اكتب عدد من ١ لـ ٢٠٠٠.</div>'; return; }
      btn.disabled = true; btn.textContent = 'بيضيف…'; $('arMsg').innerHTML = '';
      A.addRows(name, n).then(function (r) {
        $('arMsg').innerHTML = '<div class="msg ok">اتضاف ' + money(r.added) + ' سطر لجدول ' + esc(r.title) + '. فيه دلوقتي ' + money(r.empty) + ' سطر فاضي. متنساش ترجّع الحماية.</div>';
        btn.disabled = false; btn.textContent = 'إضافة'; show();
      }).catch(function (e) { $('arMsg').innerHTML = errHtml(e); btn.disabled = false; btn.textContent = 'إضافة'; });
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
    var all = F.followUp(ctx(), S.settings, today());
    S.fuAll = all;
    var items = all.filter(function (x) { return stOk(C.st, x.r.end); });
    items.forEach(function (x) { x.exp = F.expectedIn(x, today(), C.days); });
    S.fu = items;
    var soon = items.filter(function (x) { return x.exp; });
    var late = items.filter(function (x) { return x.late; });
    var bal = items.filter(function (x) { return x.balance > 1; });
    var ops = {}; bal.forEach(function (x) { var o = x.r.operation; if (o) ops[o] = 1; });
    var box = $('tab-coll');
    box.innerHTML = (C.flash ? '<div class="msg ok">' + esc(C.flash) + '</div>' + (C.check || '') : '') +
      '<div class="sum"><div class="box"><div class="v late">' + late.length + '</div><div class="k">متأخر</div></div>' +
      '<div class="box"><div class="v">' + money(Math.round(late.reduce(function (a, x) { return a + x.balance; }, 0))) + '</div><div class="k">إجمالي المتأخرات</div></div>' +
      '<div class="box"><div class="v">' + soon.length + '</div><div class="k">مستحقين خلال ' + daysSelect('collDays', C.days) + ' يوم</div></div>' +
      '<div class="box"><div class="v">' + money(soon.reduce(function (a, x) { return a + x.exp.amount; }, 0)) + '</div><div class="k">المتوقع تحصيله</div></div></div>' +
      '<div class="r2" style="margin-bottom:8px">' + esc(scopeText(S.settings)) + ' · <button class="link" id="chgScope">تغيير</button></div>' +
      stSeg('stSeg', C.st) +
      '<div class="seg" id="vSeg" style="grid-template-columns:repeat(3,1fr)"><button data-v="late">المتأخرين</button><button data-v="soon">المستحقين</button><button data-v="all">الأرصدة (' + bal.length + ')</button></div>' +
      '<div class="filters"><select id="fOp"><option value="">كل المسؤولين</option>' + Object.keys(ops).sort().map(function (o) { return '<option' + (o === C.op ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      '<select id="fSort"><option value="amount">الأكبر مبلغ</option><option value="days"' + (C.sort === 'days' ? ' selected' : '') + '>' + (C.view === 'soon' ? 'الأقرب ميعاد' : 'الأقدم تأخير') + '</option></select></div>' +
      '<input id="fQ" placeholder="بحث بالاسم أو الكود" value="' + esc(C.q) + '" autocomplete="off" style="margin-bottom:8px">' +
      exportBar('collExp') +
      '<div id="collList"></div>';
    C.flash = ''; C.check = '';
    document.querySelectorAll('#vSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === C.view);
      b.onclick = function () { C.view = b.dataset.v; drawColl(); };
    });
    bindSeg('stSeg', function (v) { C.st = v; drawColl(); });
    $('collDays').onchange = function () { C.days = +this.value; try { localStorage.setItem('osoolPanel.collDays', C.days); } catch (e) {} drawColl(); };
    $('fOp').onchange = function () { C.op = this.value; drawList(); };
    $('fSort').onchange = function () { C.sort = this.value; drawList(); };
    $('fQ').oninput = function () { C.q = this.value; drawList(); };
    $('chgScope').onclick = openSettings;
    bindExport('collExp', function () {
      var list = S.collView || [];
      if (C.view === 'soon') return { name: 'المتوقع تحصيله خلال ' + C.days + ' يوم ' + L.toISO(today()),
        headers: ['الاسم', 'كود المستأجر', 'المشروع', 'عمارة', 'شقة', 'المسؤول', 'التليفون', 'المتوقع', 'مستحق يوم', 'مسدد لحد', 'بداية العقد', 'نهاية العقد'],
        rows: list.map(function (x) { var u = x.unit || {}; return [x.r.name, x.r.code, u.project || '', u.building || '', u.apt || '', x.r.operation, x.r.phone, x.exp.amount, x.exp.date, x.paidUntil, x.r.start, x.r.end]; }) };
      return { name: (C.view === 'late' ? 'المتأخرات ' : 'الأرصدة ') + ({ live: 'ساري ', ended: 'منتهي ', all: '' })[C.st] + L.toISO(today()),
        headers: ['الاسم', 'كود المستأجر', 'المشروع', 'عمارة', 'شقة', 'المسؤول', 'التليفون', 'الرصيد', 'مسدد لحد', 'ملاحظة', 'أيام التأخير', 'بداية العقد', 'نهاية العقد', 'رصيد التأمين'],
        rows: list.map(function (x) { var u = x.unit || {}; return [x.r.name, x.r.code, u.project || '', u.building || '', u.apt || '', x.r.operation, x.r.phone, Math.round(x.balance), x.paidUntil, x.paidNote, x.daysLate, x.r.start, x.r.end, x.deposit]; }) };
    });
    drawList();
  }

  function statusLine(x) {
    if (C.view === 'soon' && x.exp) return '<span class="okc">مستحق ' + L.fmt(x.exp.date) + (x.exp.inDays ? ' (بعد ' + x.exp.inDays + ' يوم)' : ' (النهارده)') + '</span>' + (x.paidNote === 'مفيش تحصيل' ? ' · أول تحصيل' : ' · مسدد لحد ' + L.fmt(x.paidUntil));
    if (x.late) return '<span class="late">متأخر ' + x.daysLate + ' يوم</span> · ' + (x.paidNote === 'مفيش تحصيل' ? 'مفيش تحصيل من البداية' : 'مسدد لحد ' + L.fmt(x.paidUntil) + (x.paidNote ? ' (' + x.paidNote + ')' : ''));
    return '<span class="okc">مسدد لحد ' + L.fmt(x.paidUntil) + '</span>';
  }
  function drawList() {
    var list = (S.fu || []).filter(function (x) { return C.view === 'late' ? x.late : C.view === 'soon' ? !!x.exp : x.balance > 1; });
    if (C.op) list = list.filter(function (x) { return x.r.operation === C.op; });
    var q = L.norm(C.q);
    if (q) list = list.filter(function (x) { return L.norm(x.r.name + ' ' + x.r.code).indexOf(q) !== -1; });
    if (C.view === 'soon') list.sort(C.sort === 'days' ? function (a, b) { return a.exp.date - b.exp.date; } : function (a, b) { return b.exp.amount - a.exp.amount; });
    else list.sort(C.sort === 'days' ? function (a, b) { return b.daysLate - a.daysLate; } : function (a, b) { return b.balance - a.balance; });
    S.collView = list;
    $('collList').innerHTML = list.length ? list.map(function (x) {
      return '<div class="rcard click" data-code="' + esc(x.r.code) + '"><div class="top2"><div><div class="r1">' + esc(x.r.name || '—') + '</div>' +
        '<div class="r2">' + esc(x.unit ? App.unitTitle(x.unit) : x.r.unit) + '</div></div><div class="amt">' + money(C.view === 'soon' && x.exp ? x.exp.amount : x.balance) + '</div></div>' +
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
    var x = (S.fuAll || S.fu || []).filter(function (i) { return i.r.code === code; })[0]; if (!x) return;
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
        C.check = App.checkHtml(res);
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
          (res.duplicate ? '<div class="msg err">الكود ده ظهر مرتين. غالباً حد سجل في نفس اللحظة، راجع السطر.</div>' : '') + App.checkHtml(res) +
          (res.skipped.length ? '<div class="msg warn">خانات متكتبتش لأن عمودها مش موجود: ' + esc(res.skipped.join('، ')) + '</div>' : '') +
          '<div style="display:flex;gap:8px"><button class="btn ghost" id="tOld">السطر القديم</button><button class="btn primary" id="tDone">تمام</button></div></div>';
        $('tOld').onclick = function () { A.goToRow(r.idx); };
        $('tDone').onclick = function () { App.showTab('search'); };
        $('stat').textContent = S.units.length + ' وحدة · ' + S.renters.length + ' عقد';
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'تنفيذ'; $('tMsg').innerHTML = errHtml(e); });
    };
  }

  // ======================= متابعة الملاك =======================
  var OW = { view: 'due', q: '', flash: '', check: '', days: 7 };
  try { var savedDays = +localStorage.getItem('osoolPanel.ownerDays'); if (savedDays > 0) OW.days = savedDays; } catch (e) {}
  var DAY_OPTS = [3, 5, 7, 10, 14, 15, 21, 30];
  function renderOwners() {
    var box = $('tab-owners');
    box.innerHTML = loadingHtml('بيقرا الخزينة ويحسب سدادات الملاك…');
    ensureSettings().then(ensureTreasury).then(function () {
      var list = F.ownerFollow(S.units, S.treasury, S.ownerMonths, S.settings || F.DEFAULT_SETTINGS, today(), OW.days);
      S.ow = list;
      var late = list.filter(function (x) { return x.status === 'late'; }), soon = list.filter(function (x) { return x.status === 'soon'; });
      var sumReq = late.concat(soon).reduce(function (a, x) { return a + x.required; }, 0);
      box.innerHTML = (OW.flash ? '<div class="msg ok">' + esc(OW.flash) + '</div>' + (OW.check || '') : '') +
        '<div class="sum"><div class="box"><div class="v late">' + late.length + '</div><div class="k">متأخر سدادهم</div></div>' +
        '<div class="box"><div class="v">' + soon.length + '</div><div class="k">مستحقين خلال <select id="owDays" style="width:auto;padding:1px 4px;font-size:12px;display:inline-block">' +
          (DAY_OPTS.indexOf(OW.days) === -1 ? DAY_OPTS.concat([OW.days]).sort(function (a, b) { return a - b; }) : DAY_OPTS).map(function (d) { return '<option value="' + d + '"' + (d === OW.days ? ' selected' : '') + '>' + d + '</option>'; }).join('') +
          '</select> يوم</div></div></div>' +
        '<div class="r2" style="margin:-4px 0 8px">المطلوب للمتأخرين والمستحقين: <b>' + money(sumReq) + '</b></div>' +
        '<div class="seg" id="owSeg" style="grid-template-columns:1fr 1fr 1fr"><button data-v="due">متأخر ومستحق</button><button data-v="late">المتأخرين</button><button data-v="all">الكل</button></div>' +
        '<input id="owQ" placeholder="بحث باسم المالك أو الوحدة" value="' + esc(OW.q) + '" autocomplete="off" style="margin:8px 0 10px"><div id="owList"></div>';
      OW.flash = ''; OW.check = '';
      document.querySelectorAll('#owSeg button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.v === OW.view);
        b.onclick = function () { OW.view = b.dataset.v; document.querySelectorAll('#owSeg button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawOwners(); };
      });
      $('owQ').oninput = function () { OW.q = this.value; drawOwners(); };
      $('owDays').onchange = function () { OW.days = +this.value; try { localStorage.setItem('osoolPanel.ownerDays', OW.days); } catch (e) {} renderOwners(); };
      drawOwners();
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function drawOwners() {
    var q = L.norm(OW.q);
    var list = (S.ow || []).filter(function (x) {
      if (OW.view === 'due' && x.status !== 'late' && x.status !== 'soon') return false;
      if (OW.view === 'late' && x.status !== 'late') return false;
      if (q && L.norm([x.unit.owner, x.unit.code, x.unit.project, x.unit.building, x.unit.apt].join(' ')).indexOf(q) === -1) return false;
      return true;
    });
    $('owList').innerHTML = list.length ? list.map(function (x, i) {
      var u = x.unit, st;
      if (x.status === 'none') st = '<span class="badge done">مفيش سداد متسجل</span>';
      else if (x.status === 'late') st = '<span class="badge book" style="background:var(--err-bg);color:var(--err)">متأخر ' + (-x.daysLeft) + ' يوم</span>';
      else st = '<span class="badge ' + (x.status === 'soon' ? 'book' : 'live') + '">باقي ' + x.daysLeft + ' يوم</span>';
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(u.owner || '—') + '</div><div class="r2">' + esc(App.unitTitle(u) || u.code) + ' · <span dir="ltr">' + esc(u.code) + '</span></div></div>' + st + '</div>' +
        '<dl class="kv"><dt>مسدد لحد</dt><dd>' + L.fmt(x.paidUntil) + '</dd><dt>يسدد كل</dt><dd>' + x.every + ' شهر · المطلوب <b>' + money(x.required) + '</b></dd>' +
        (x.lastDate ? '<dt>آخر سداد</dt><dd>' + L.fmt(x.lastDate) + ' · ' + money(x.lastSum) + '</dd>' : '') +
        (x.balance > 1 ? '<dt>متبقي من ٢٠٢٥</dt><dd class="late">' + money(x.balance) + '</dd>' : '') + '</dl>' +
        '<div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap"><button class="link" data-pay="' + i + '">تسجيل سداد</button>' +
        (x.lastDate ? '<button class="link" data-wa="' + i + '">رسالة واتساب</button><button class="link" data-cp="' + i + '" style="color:var(--muted)">نسخ الرسالة</button>' : '') + '</div></div>';
    }).join('') : '<div class="empty" style="padding:8px">مفيش ملاك هنا.</div>';
    $('owList').querySelectorAll('button[data-pay]').forEach(function (b) { b.onclick = function () { var x = list[+b.dataset.pay]; openEntry({ cat: 'سداد ايجار', unit: x.unit, n: x.every }); }; });
    $('owList').querySelectorAll('button[data-wa]').forEach(function (b) {
      b.onclick = function () {
        var x = list[+b.dataset.wa], url = F.waLink(x.unit.phone, F.ownerMessage(x));
        if (!url) { b.textContent = 'مفيش تليفون للمالك'; return; }
        try { if (window.Office && Office.context && Office.context.ui && Office.context.ui.openBrowserWindow) Office.context.ui.openBrowserWindow(url); else window.open(url, '_blank'); }
        catch (e) { window.open(url, '_blank'); }
      };
    });
    $('owList').querySelectorAll('button[data-cp]').forEach(function (b) { b.onclick = function () { App.copyText(F.ownerMessage(list[+b.dataset.cp]), { set textContent(t) { b.textContent = t === 'اتنسخ' ? 'اتنسخت' : 'نسخ الرسالة'; } }); }; });
  }

  // ======================= المراجعة =======================
  var RV = { open: {}, st: 'live' };
  function renderReview() {
    var box = $('tab-review');
    box.innerHTML = loadingHtml('بيراجع الخزينة والعقود…');
    ensureSettings().then(ensureTreasury).then(function () {
      var st = S.settings || F.DEFAULT_SETTINGS, t = today(), tS = L.dateToSerial(t);
      var ub = {}; S.units.forEach(function (u) { ub[u.code] = u; });
      var inS = function (code) { var u = ub[String(code)]; return !u || F.inScope(u, st); };
      var rb = {}; S.renters.forEach(function (r) { if (r.code) rb[String(r.code)] = r; });
      // حالة الحركة من عقدها: المستأجر لو فيه كوده، وإلا عقد المالك. الحركة اللي ملهاش عقد معروف تتحسب مع الساري.
      var entOk = function (i) {
        if (RV.st === 'all') return true;
        var r = rb[String(c['كود المستأجر'][i] || '').trim()];
        if (r) return stOk(RV.st, r.end);
        var u = ub[String(c['كود'] ? c['كود'][i] : '')];
        if (u && u.ownerEnd) return stOk(RV.st, u.ownerEnd);
        return RV.st === 'live';
      };
      var c = S.treasury.cols, n = c['تاريخ'].length, flags = {}, dates = [], both = [];
      for (var i = 0; i < n; i++) {
        var code = c['كود'] ? c['كود'][i] : '';
        if (!inS(code) || !entOk(i)) continue;
        var f = String(c['مراجعة'] ? c['مراجعة'][i] || '' : '').trim();
        if (f) (flags[f] = flags[f] || []).push(i);
        var d = Number(c['تاريخ'][i]);
        if (d && (d < 44197 || Math.floor(d) > tS)) dates.push(i);
        if ((Number(c['ايراد'][i]) || 0) && (Number(c['مصروف'][i]) || 0)) both.push(i);
      }
      // العقود حسب فلتر الحالة: تداخل حقيقي، أو بتعدّي عقد المالك
      var act = S.renters.filter(function (r) { return r.idx >= 0 && r.start && r.end && stOk(RV.st, r.end) && r.end.getUTCFullYear() < 2090 && inS(r.unit); });
      var byU = {}; act.forEach(function (r) { (byU[r.unit] = byU[r.unit] || []).push(r); });
      var overlaps = [];
      Object.keys(byU).forEach(function (u) {
        var l = byU[u].sort(function (a, b) { return a.start - b.start; });
        for (var a = 0; a < l.length; a++) for (var b = a + 1; b < l.length; b++) if (l[b].start < l[a].end && l[a].start < l[b].end) overlaps.push([l[a], l[b]]);
      });
      var beyond = act.filter(function (r) { var u = ub[r.unit]; return u && u.ownerEnd && r.end > u.ownerEnd; });
      var sec = [];
      Object.keys(flags).sort(function (a, b) { return flags[b].length - flags[a].length; }).forEach(function (k) {
        sec.push({ id: 'f' + k, title: 'الخزينة: ' + k, why: k === 'خطأ مالك' ? 'سداد للمالك ناقصه الشهر، أو فترته بتعدّي نهاية العقد.' : k === 'خطأ مستأجر' ? 'حركة مستأجر ناقصها كود المستأجر أو الشهر، أو فترتها بتعدّي نهاية عقده.' : k === 'خطأ عملة' ? 'خزينة بعملة أجنبية من غير المبلغ بالعملة.' : 'معادلة مرجعها مكسور.', kind: 'entry', items: flags[k] });
      });
      if (overlaps.length) sec.push({ id: 'ov', title: 'عقود متداخلة على نفس الوحدة', why: 'عقدين على نفس الوحدة بيتقاطعوا في يوم واحد على الأقل.', kind: 'pair', items: overlaps });
      if (beyond.length) sec.push({ id: 'be', title: 'عقود بتعدّي نهاية عقد المالك', why: 'نهاية عقد المستأجر بعد نهاية عقد المالك.', kind: 'renter', items: beyond });
      if (dates.length) sec.push({ id: 'dt', title: 'تواريخ غريبة في الخزينة', why: 'قبل ٢٠٢١ أو بعد النهارده.', kind: 'entry', items: dates });
      if (both.length) sec.push({ id: 'bo', title: 'سطور فيها وارد ومنصرف مع بعض', why: 'السطر الواحد المفروض يا وارد يا منصرف.', kind: 'entry', items: both });
      var total = sec.reduce(function (a, x) { return a + x.items.length; }, 0);
      box.innerHTML = stSeg('rvSeg', RV.st) + '<div class="sum"><div class="box"><div class="v ' + (total ? 'late' : 'okc') + '">' + total + '</div><div class="k">ملاحظة محتاجة مراجعة</div></div>' +
        '<div class="box"><div class="v">' + sec.length + '</div><div class="k">نوع</div></div></div>' +
        (sec.length ? sec.map(function (x) {
          return '<div class="card"><h3 style="cursor:pointer" data-sec="' + x.id + '"><span style="flex:1">' + esc(x.title) + '</span><span class="badge ' + (x.items.length ? 'book' : 'live') + '">' + x.items.length + '</span></h3>' +
            '<div class="r2" style="margin-top:-4px">' + esc(x.why) + '</div><div id="sec-' + x.id + '" class="' + (RV.open[x.id] ? '' : 'hide') + '" style="margin-top:8px">' + secItems(x) + '</div></div>';
        }).join('') : '<div class="msg ok">مفيش ملاحظات. كله تمام.</div>');
      bindSeg('rvSeg', function (v) { RV.st = v; renderReview(); });
      box.querySelectorAll('h3[data-sec]').forEach(function (h) { h.onclick = function () { var id = h.dataset.sec; RV.open[id] = !RV.open[id]; $('sec-' + id).classList.toggle('hide', !RV.open[id]); }; });
      box.querySelectorAll('button[data-go]').forEach(function (b) { b.onclick = function () { var p = b.dataset.go.split(':'); (p[0] === 'entry' ? A.goTo('entry', +p[1]) : A.goToRow(+p[1])).catch(function (e) { alert(e.message); }); }; });
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function secItems(x) {
    var c = S.treasury.cols, list = x.items.slice();
    if (x.kind === 'entry') list.sort(function (a, b) { return b - a; });
    var more = list.length > 60 ? '<div class="r2">ظاهر ٦٠ من ' + list.length + '.</div>' : '';
    return list.slice(0, 60).map(function (it) {
      if (x.kind === 'entry') {
        var vin = Number(c['ايراد'][it]) || 0, vout = Number(c['مصروف'][it]) || 0;
        return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(String(c['فئة'][it] || '—')) + '</div><div class="r2">' + esc(String(c['بيان'] ? c['بيان'][it] || '' : '')) + '</div></div><div class="amt">' + money(vin || vout) + '</div></div>' +
          '<div class="r2" style="margin-top:4px">' + L.fmt(L.serialToDate(c['تاريخ'][it])) + (c['كود'] && c['كود'][it] ? ' · <span dir="ltr">' + esc(String(c['كود'][it])) + '</span>' : '') + (c['كود المستأجر'][it] ? ' · <span dir="ltr">' + esc(String(c['كود المستأجر'][it])) + '</span>' : '') +
          ' · <button class="link" data-go="entry:' + it + '">روح للسطر</button></div></div>';
      }
      if (x.kind === 'pair') {
        return '<div class="rcard">' + it.map(function (r) { return '<div class="r2"><b>' + esc(r.name || '—') + '</b> <span dir="ltr">' + esc(r.code) + '</span> · ' + L.fmt(r.start) + ' ← ' + L.fmt(r.end) + ' · <button class="link" data-go="renter:' + r.idx + '">روح للسطر</button></div>'; }).join('') + '</div>';
      }
      var u = unitOf(it.unit);
      return '<div class="rcard"><div class="r2"><b>' + esc(it.name || '—') + '</b> <span dir="ltr">' + esc(it.code) + '</span> · لحد ' + L.fmt(it.end) + ' · المالك لحد ' + L.fmt(u && u.ownerEnd) + ' · <button class="link" data-go="renter:' + it.idx + '">روح للسطر</button></div></div>';
    }).join('') + more;
  }

  // ======================= حركة خزينة جديدة =======================
  var EN = null;
  function tenantItem(r) {
    var one = F.followUp({ units: S.units, renters: [r], months: S.months, ledger: S.ledger }, 'all', today());
    return one[0] || null;
  }
  function openEntry(preset) {
    if (!TR) { var t0 = today(); TR = { from: new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), 1)), to: t0, cash: '', cat: '', side: '', q: '' }; }
    var sd = F.sideDefaults(S.treasury);
    var cats = (S.categories && S.categories.length) ? S.categories.slice() : Object.keys(sd).sort();
    var top = Object.keys(sd).sort(function (a, b) { return sd[b].n - sd[a].n; }).slice(0, 10);
    EN = { side: 'out', cat: '', unit: null, sd: sd, ownerN: 1, ownerRows: [] };
    var opt = function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; };
    App.openSheet('<h2>حركة خزينة جديدة</h2>' +
      '<div class="seg" id="eSide"><button data-s="in">وارد</button><button data-s="out" class="on">منصرف</button></div>' +
      '<label>الفئة <span class="req">*</span></label><select id="eCat"><option value="">اختار الفئة…</option><optgroup label="الأكثر استخدام">' + top.map(opt).join('') + '</optgroup><optgroup label="كل الفئات">' + cats.map(opt).join('') + '</optgroup></select>' +
      '<label>الوحدة <span class="r2" id="eUnitHint">(سيبها فاضية للمصروفات العامة)</span></label>' +
      '<div id="ePick"><input id="eUnitQ" placeholder="ابحث بالكود أو العمارة أو الشقة" autocomplete="off"><div id="eUnitRes" class="results hide"></div></div><div id="eUnitCard"></div>' +
      '<div id="eTen" class="hide"><label>المستأجر <span class="req">*</span></label><select id="eTenant"></select></div>' +
      '<div id="eOwn" class="hide"><div class="r2" id="eOwnInfo" style="margin-top:8px"></div><label>عدد الشهور</label><input id="eOwnN" class="ltr" inputmode="numeric" value="1" style="width:70px"><div id="eOwnRows" style="margin-top:6px"></div></div>' +
      '<div id="ePeriod" class="hide"><label>عن شهر</label><select id="eMonth"></select><div class="grid2"><div><label>من</label><input type="date" id="eFrom"></div><div><label>إلى</label><input type="date" id="eTo"></div></div></div>' +
      '<div class="grid2"><div><label>التاريخ</label><input type="date" id="eDate" value="' + L.toISO(today()) + '" max="' + L.toISO(today()) + '"></div>' +
      '<div id="eAmtBox"><label>المبلغ بالجنيه <span class="req">*</span></label><input id="eAmt" class="ltr" inputmode="decimal"></div></div>' +
      '<div class="grid2"><div><label>الخزينة</label><select id="eCash">' + cashOptions('جنيه  خزينة') + '</select></div><div id="eFxBox" class="hide"><label>المبلغ بالعملة</label><input id="eFx" class="ltr" inputmode="decimal"></div></div>' +
      '<div class="grid2"><div><label>رقم المستند</label><input id="eDoc" class="ltr"></div><div><label>البيان</label><input id="eNote"></div></div>' +
      '<details class="more"><summary>شيك وملاحظات</summary><div class="grid2"><div><label>رقم الشيك</label><input id="eChq" class="ltr"></div><div><label>تاريخ الشيك</label><input type="date" id="eChqD"></div></div><label>ملاحظات</label><input id="eNotes"></details>' +
      '<div id="eMsg" style="margin-top:10px"></div><div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" id="eBack">رجوع</button><button class="btn primary" id="eSave">تسجيل</button></div>');
    var setSide = function (sd2) { EN.side = sd2; document.querySelectorAll('#eSide button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === sd2); }); };
    document.querySelectorAll('#eSide button').forEach(function (b) { b.onclick = function () { setSide(b.dataset.s); disarm(); }; });
    $('eCat').onchange = function () { EN.cat = this.value; if (EN.sd[EN.cat]) setSide(EN.sd[EN.cat].side); refreshEntry(); };
    $('eUnitQ').oninput = function () {
      var res = L.searchUnits(S.units, this.value), box = $('eUnitRes');
      if (!this.value.trim()) { box.classList.add('hide'); return; }
      box.classList.remove('hide');
      box.innerHTML = res.length ? res.map(function (u) { return '<button data-code="' + esc(u.code) + '"><div class="r1">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2">كود ' + esc(u.code) + ' · ' + esc(u.owner) + '</div></button>'; }).join('') : '<div class="r2" style="padding:10px">مفيش وحدة بالبيانات دي.</div>';
    };
    $('eUnitRes').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; EN.unit = unitOf(b.dataset.code); drawEntryUnit(); refreshEntry(); };
    $('eTenant').onchange = function () { refreshTenant(); };
    $('eOwnN').oninput = function () { EN.ownerN = Math.max(1, Math.min(24, parseInt(digits(this.value), 10) || 1)); refreshOwner(); };
    $('eCash').onchange = function () { $('eFxBox').classList.toggle('hide', !F.isForeign(this.value)); disarm(); };
    ['eDate', 'eAmt', 'eFx', 'eMonth', 'eFrom', 'eTo'].forEach(function (id) { $(id).addEventListener('input', disarm); });
    $('eBack').onclick = App.closeSheet;
    $('eSave').onclick = saveEntry;
    if (preset && preset.cat) {
      $('eCat').value = preset.cat; EN.cat = preset.cat; if (EN.sd[EN.cat]) setSide(EN.sd[EN.cat].side);
      if (preset.unit) { EN.unit = preset.unit; drawEntryUnit(); }
      if (preset.n) { EN.ownerN = preset.n; $('eOwnN').value = preset.n; }
      refreshEntry();
    }
  }
  function disarm() { if (EN) { EN.armed = false; $('eSave').textContent = 'تسجيل'; } }
  function drawEntryUnit() {
    var u = EN.unit;
    $('ePick').classList.add('hide');
    $('eUnitCard').innerHTML = '<div class="unit"><div class="head"><div><div class="t">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2">كود ' + esc(u.code) + ' · المالك: ' + esc(u.owner || '—') + '</div></div><button class="link" id="eChg">تغيير</button></div></div>';
    $('eChg').onclick = function () { EN.unit = null; $('eUnitCard').innerHTML = ''; $('ePick').classList.remove('hide'); $('eUnitQ').value = ''; $('eUnitRes').classList.add('hide'); refreshEntry(); };
  }
  function monthOptions(keys, sel) { return keys.map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + L.monthLabel(k) + '</option>'; }).join(''); }
  function recentKeys() { var t = today(), base = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)), out = []; for (var k = -12; k <= 3; k++) out.push(L.monthKey(L.addMonths(base, k))); return out; }
  function refreshEntry() {
    disarm();
    var cat = EN.cat, isTen = F.TENANT_CATS.indexOf(cat) !== -1, isOwn = F.OWNER_CATS.indexOf(cat) !== -1;
    var ownerMonthly = cat === 'سداد ايجار';
    $('eUnitHint').textContent = isTen || isOwn ? '(لازم)' : '(سيبها فاضية للمصروفات العامة)';
    $('eTen').classList.toggle('hide', !(isTen && EN.unit));
    $('eOwn').classList.toggle('hide', !(ownerMonthly && EN.unit));
    $('eAmtBox').classList.toggle('hide', ownerMonthly && !!EN.unit);
    var needPeriod = (F.TENANT_MONTH.indexOf(cat) !== -1 || cat === 'رد ايجار من مالك') && EN.unit;
    $('ePeriod').classList.toggle('hide', !needPeriod);
    if (isTen && EN.unit) {
      var list = S.renters.filter(function (r) { return r.unit === EN.unit.code && r.code; }).sort(function (a, b) { return (b.start || 0) - (a.start || 0); });
      var t = today(), cur = list.filter(function (r) { return r.start <= t && r.end >= t; })[0];
      $('eTenant').innerHTML = list.length ? list.slice(0, 30).map(function (r) {
        return '<option value="' + esc(r.code) + '"' + (cur && r.code === cur.code ? ' selected' : '') + '>' + esc((r.name || '—') + ' · ' + r.code + ' · ' + L.fmt(r.start) + ' ← ' + L.fmt(r.end)) + '</option>';
      }).join('') : '<option value="">مفيش عقود على الوحدة دي</option>';
      if (!$('eNote').value && cur) $('eNote').value = cur.name;
      refreshTenant();
    } else if (ownerMonthly && EN.unit) {
      refreshOwner();
      if (!$('eNote').value) $('eNote').value = EN.unit.owner || '';
    } else if (needPeriod) {
      $('eMonth').innerHTML = monthOptions(recentKeys(), L.monthKey(today()));
      if (!$('eNote').value && isOwn) $('eNote').value = EN.unit.owner || '';
    }
  }
  function refreshTenant() {
    var code = $('eTenant').value, r = S.renters.filter(function (x) { return x.code === code; })[0];
    EN.tenant = r || null;
    if (!r || F.TENANT_MONTH.indexOf(EN.cat) === -1) return;
    var it = tenantItem(r);
    if (!it) { $('eMonth').innerHTML = monthOptions(recentKeys(), L.monthKey(today())); return; }
    var sg = F.suggestCollection(it, today());
    var keys = Object.keys(it.dues).filter(function (k) { return F.cmpKey(k, F.FOLLOW_FROM) >= 0; });
    if (keys.indexOf(sg.month) === -1) keys.push(sg.month);
    keys.sort(F.cmpKey);
    $('eMonth').innerHTML = monthOptions(keys, sg.month);
    $('eFrom').value = L.toISO(sg.from); $('eTo').value = L.toISO(sg.to);
    if (EN.cat === 'تحصيل ايجار' && sg.amount && !$('eAmt').value) $('eAmt').value = sg.amount;
    $('eNote').value = r.name || $('eNote').value;
  }
  function refreshOwner() {
    var sg = F.ownerSuggest(EN.unit, S.ownerMonths, F.ownerPaid(S.treasury), today(), EN.ownerN);
    EN.ownerRows = sg.rows;
    $('eOwnInfo').innerHTML = sg.lastPaid ? 'آخر شهر اتسدد: <b>' + L.monthLabel(L.monthKey(sg.lastPaid)) + '</b>' + (sg.lastAmount ? ' بمبلغ ' + money(sg.lastAmount) : '') : 'مفيش سداد ايجار متسجل للوحدة دي.';
    var src = { sheet: 'من عقد المالك', last: 'زي آخر سداد', rent: 'قيمة الإيجار' };
    $('eOwnRows').innerHTML = '<table class="sch">' + sg.rows.map(function (r, i) {
      return '<tr><td class="m">' + L.monthLabel(r.key) + '<div class="note">' + L.fmt(r.from) + ' ← ' + L.fmt(r.to) + ' · ' + src[r.source] + '</div></td><td><input class="ltr" data-orow="' + i + '" value="' + (r.amount || '') + '"></td></tr>';
    }).join('') + '</table><div class="total"><span>الإجمالي</span><span id="eOwnTot">' + money(sg.rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0)) + '</span></div>';
    document.querySelectorAll('#eOwnRows input[data-orow]').forEach(function (inp) {
      inp.oninput = function () { EN.ownerRows[+inp.dataset.orow].amount = Number(digits(inp.value)) || 0; $('eOwnTot').textContent = money(EN.ownerRows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0)); disarm(); };
    });
  }
  function saveEntry() {
    var cat = EN.cat, cash = $('eCash').value;
    var base = {
      date: L.parseISO($('eDate').value), cash: cash, fx: F.isForeign(cash) ? digits($('eFx').value) : '', category: cat, side: EN.side,
      unitCode: EN.unit ? EN.unit.code : '', doc: $('eDoc').value, note: $('eNote').value,
      chequeNo: $('eChq').value, chequeDate: L.parseISO($('eChqD').value), notes: $('eNotes').value
    };
    var list = [];
    var clone = function (extra) { var o = {}; for (var k in base) o[k] = base[k]; for (var j in extra) o[j] = extra[j]; return o; };
    if (cat === 'سداد ايجار' && EN.unit) {
      if (base.fx && EN.ownerRows.length > 1) { $('eMsg').innerHTML = '<div class="msg err">في الخزينة الأجنبية سجّل شهر واحد في المرة.</div>'; return; }
      EN.ownerRows.forEach(function (r) { list.push(clone({ amount: r.amount, month: r.key, from: r.from, to: r.to, contractEnd: EN.unit.ownerEnd })); });
    } else {
      var extra = { amount: digits($('eAmt').value) };
      if (!$('ePeriod').classList.contains('hide')) { extra.month = $('eMonth').value; extra.from = L.parseISO($('eFrom').value); extra.to = L.parseISO($('eTo').value); }
      if (F.TENANT_CATS.indexOf(cat) !== -1) { extra.tenantCode = EN.tenant ? EN.tenant.code : ''; if (EN.tenant && extra.month) extra.contractEnd = EN.tenant.end; }
      if (cat === 'رد ايجار من مالك' && EN.unit) extra.contractEnd = EN.unit.ownerEnd;
      list.push(clone(extra));
    }
    var errs = [];
    list.forEach(function (e) { F.validateEntry(e, today()).forEach(function (m) { if (errs.indexOf(m) === -1) errs.push(m); }); });
    if (errs.length) { $('eMsg').innerHTML = errs.map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join(''); return; }
    var total = list.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    if (!EN.armed) {
      EN.armed = true; $('eSave').textContent = 'تأكيد التسجيل';
      $('eMsg').innerHTML = '<div class="msg warn">هيتسجل ' + (list.length > 1 ? list.length + ' سطور بإجمالي ' : '') + money(total) + ' ج ' + (EN.side === 'in' ? 'وارد' : 'منصرف') + ' · ' + esc(cat) + ' · ' + esc(cash) + '. اضغط تأكيد.</div>';
      return;
    }
    var btn = $('eSave'); btn.disabled = true; btn.textContent = 'بيسجل…';
    var vals = list.map(function (e) { return F.entryValues(e); });
    A.writeEntries(vals).then(function (res) {
      vals.forEach(appendTreasury);
      App.closeSheet();
      TR.flash = 'اتسجل ' + (vals.length > 1 ? vals.length + ' سطور' : 'السطر') + ' في الخزينة (' + res.rows.join('، ') + ').';
      TR.check = App.checkHtml(res);
      if (S.tab === 'owners') { OW.flash = TR.flash; OW.check = TR.check; TR.flash = ''; TR.check = ''; renderOwners(); } else renderTreas();
    }).catch(function (err) { btn.disabled = false; btn.textContent = 'تأكيد التسجيل'; $('eMsg').innerHTML = errHtml(err); });
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
  var AV = { projects: null, settles: null };
  var R = window.OsoolReports;
  function settleLabel(v) { return v ? v : 'بدون'; }
  function renderAvail() {
    var box = $('tab-avail');
    box.innerHTML = loadingHtml('بيحسب الوحدات…');
    ensureSettings().then(function () {
      var list = F.availability(S.units, S.renters, 'all', today());
      S.availAll = list;
      var projects = {}, settles = {};
      list.forEach(function (x) { var p = String(x.unit.project).trim(); if (p) projects[p] = 1; settles[x.unit.settle || ''] = 1; });
      projects = Object.keys(projects).sort(); settles = Object.keys(settles).sort();
      if (!AV.projects) {
        var st = S.settings || F.DEFAULT_SETTINGS, lst = st.projects.map(function (x) { return x.trim().toLowerCase(); });
        AV.projects = projects.filter(function (p) { var k = p.toLowerCase(); return st.mode === 'only' ? lst.indexOf(k) !== -1 : lst.indexOf(k) === -1; });
      }
      if (!AV.settles) AV.settles = settles.slice();
      var chips = function (group, vals, sel, label) {
        return '<div class="tgs">' + vals.map(function (v) { return '<button class="tg' + (sel.indexOf(v) !== -1 ? ' on' : '') + '" data-g="' + group + '" data-v="' + esc(v) + '">' + esc(label ? label(v) : v) + '</button>'; }).join('') + '</div>';
      };
      box.innerHTML = '<div id="avSum"></div>' +
        '<div class="card"><h3>الكمبوند <button class="link" id="avAllP" style="margin-inline-start:auto;font-size:11px">الكل</button></h3>' + chips('p', projects, AV.projects) +
        '<h3 style="margin-top:12px">التسويات</h3>' + chips('s', settles, AV.settles, settleLabel) + '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:6px"><button class="btn primary" id="avPdf">PDF المتاح</button><button class="btn ghost" id="avPrint">طباعة</button></div>' +
        '<div class="r2" id="avMsg" style="margin-bottom:8px"></div><div id="avList"></div>';
      box.querySelectorAll('.tg').forEach(function (b) {
        b.onclick = function () {
          var arr = b.dataset.g === 'p' ? AV.projects : AV.settles, v = b.dataset.v, i = arr.indexOf(v);
          if (i === -1) arr.push(v); else arr.splice(i, 1);
          b.classList.toggle('on', i === -1); drawAvail();
        };
      });
      $('avAllP').onclick = function () {
        var all = AV.projects.length === projects.length;
        AV.projects = all ? [] : projects.slice();
        box.querySelectorAll('.tg[data-g=p]').forEach(function (b) { b.classList.toggle('on', !all); });
        drawAvail();
      };
      var report = function () {
        var txt = AV.projects.length === projects.length ? 'كل الكمبوندات' : AV.projects.length > 4 ? AV.projects.length + ' كمبوند' : AV.projects.join('، ');
        return R.availHtml(S.availView || [], today(), txt);
      };
      $('avPdf').onclick = function () {
        var b = this; b.disabled = true; $('avMsg').textContent = 'بيجهز الـ PDF…';
        R.toPdf(report(), 'المتاح ' + L.toISO(today())).then(function () { $('avMsg').textContent = 'اتحمل.'; }, function (e) { $('avMsg').textContent = (e && e.message) || 'التحميل مش متاح هنا، استخدم الطباعة.'; })
          .then(function () { b.disabled = false; });
      };
      $('avPrint').onclick = function () { R.printHtml(report(), 'المتاح'); };
      drawAvail();
    });
  }
  function drawAvail() {
    var list = (S.availAll || []).filter(function (x) {
      return AV.projects.indexOf(String(x.unit.project).trim()) !== -1 && AV.settles.indexOf(x.unit.settle || '') !== -1;
    });
    S.availView = list;
    var free = list.filter(function (x) { return !x.current; }).length;
    var soon = list.filter(function (x) { return x.current && x.daysToFree <= 7 && x.current.end.getUTCFullYear() < 2090; }).length;
    $('avSum').innerHTML = '<div class="sum"><div class="box"><div class="v okc">' + free + '</div><div class="k">فاضية النهارده</div></div>' +
      '<div class="box"><div class="v">' + soon + '</div><div class="k">هتفضى خلال أسبوع</div></div></div>';
    $('avList').innerHTML = list.length ? list.slice(0, 150).map(function (x) {
      var u = x.unit, c = x.current, n = x.next, st;
      if (c && c.end.getUTCFullYear() >= 2090) st = '<span class="badge done">خارج التشغيل</span>';
      else if (c) st = '<span class="badge book">لحد ' + L.fmt(c.end) + '</span>';
      else st = '<span class="badge live">Available</span>';
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2"><span dir="ltr">' + esc(u.code) + '</span>' + (u.bedrooms ? ' · ' + esc(u.bedrooms) + ' غرف' : '') + (u.settle ? ' · ' + esc(u.settle) : '') + '</div></div>' + st + '</div>' +
        ((c && c.end.getUTCFullYear() < 2090) || n ? '<dl class="kv">' + (c && c.end.getUTCFullYear() < 2090 ? '<dt>الساكن</dt><dd>' + esc(c.name || '—') + '</dd>' : '') +
        (n ? '<dt>حجز جاي</dt><dd>' + esc(n.name || '—') + ' · ' + L.fmt(n.start) + ' ← ' + L.fmt(n.end) + '</dd>' : '') + '</dl>' : '') + '</div>';
    }).join('') + (list.length > 150 ? '<div class="r2" style="padding:6px">ظاهر ١٥٠ من ' + list.length + '. الـ PDF فيه الكل.</div>' : '') : '<div class="empty" style="padding:8px">مفيش وحدات بالفلتر ده.</div>';
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
      box.innerHTML = (TR.flash ? '<div class="msg ok">' + esc(TR.flash) + '</div>' + (TR.check || '') : '') + '<button class="btn primary addbtn" id="eNew">+ حركة خزينة جديدة</button>' +
        '<div class="card"><h3>طباعة اليومية</h3><div style="display:flex;gap:8px;align-items:center"><input type="date" id="dDate" value="' + L.toISO(TR.day || today()) + '" max="' + L.toISO(today()) + '">' +
        '<button class="btn primary" id="dPdf" style="flex:0 0 auto;padding:8px 14px">PDF</button><button class="btn ghost" id="dPrint">طباعة</button></div><div class="r2" id="dMsg" style="margin-top:6px"></div></div>' +
        '<h3 style="font-size:13px;color:var(--muted);margin:4px 0">بحث في الحركات</h3>' +
        '<div class="grid2"><div><label>من</label><input type="date" id="tFrom" value="' + L.toISO(TR.from) + '"></div><div><label>إلى</label><input type="date" id="tTo" value="' + L.toISO(TR.to) + '"></div></div>' +
        '<div class="filters"><select id="tCash"><option value="">كل الخزائن</option>' + Object.keys(cashes).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === TR.cash ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select>' +
        '<select id="tCat"><option value="">كل الفئات</option>' + Object.keys(cats).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === TR.cat ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="filters"><select id="tSide"><option value="">وارد ومنصرف</option><option value="in">وارد بس</option><option value="out">منصرف بس</option></select>' +
        '<input id="tQ" placeholder="بيان أو كود" value="' + esc(TR.q) + '" autocomplete="off"></div>' +
        '<div id="tSum"></div><div id="tList"></div>';
      $('tSide').value = TR.side;
      $('tFrom').onchange = function () { TR.from = L.parseISO(this.value); drawTreas(); };
      $('tTo').onchange = function () { TR.to = L.parseISO(this.value); drawTreas(); };
      $('tCash').onchange = function () { TR.cash = this.value; drawTreas(); };
      $('tCat').onchange = function () { TR.cat = this.value; drawTreas(); };
      $('tSide').onchange = function () { TR.side = this.value; drawTreas(); };
      var tm; $('tQ').oninput = function () { TR.q = this.value; clearTimeout(tm); tm = setTimeout(drawTreas, 200); };
      TR.flash = ''; TR.check = '';
      $('eNew').onclick = openEntry;
      var daily = function () { var dd = L.parseISO($('dDate').value) || today(); TR.day = dd; return { d: dd, html: R.dailyHtml(S.treasury, S.units, S.cash, dd) }; };
      $('dPdf').onclick = function () {
        var b = this, x = daily(); b.disabled = true; $('dMsg').textContent = 'بيجهز الـ PDF…';
        R.toPdf(x.html, 'يومية الخزينة ' + L.toISO(x.d)).then(function () { $('dMsg').textContent = 'اتحمل.'; }, function (e) { $('dMsg').textContent = (e && e.message) || 'التحميل مش متاح هنا، استخدم الطباعة.'; })
          .then(function () { b.disabled = false; });
      };
      $('dPrint').onclick = function () { var x = daily(); R.printHtml(x.html, 'يومية الخزينة ' + L.fmt(x.d)); };
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
    onTab: function (t) { if (t === 'coll') renderColl(); else if (t === 'avail') renderAvail(); else if (t === 'treas') renderTreas(); else if (t === 'owners') renderOwners(); else if (t === 'review') renderReview(); },
    startTransfer: startTransfer, openSettings: openSettings
  };
})();
