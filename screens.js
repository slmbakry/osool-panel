/* لوحة أصول — شاشات التحصيلات والنقل وإعداد الملف */
(function () {
  'use strict';
  var App = window.OsoolApp, F = window.OsoolFollow, L = App.L, S = App.S, A = App.A;
  var $ = App.$, esc = App.esc, money = App.money, digits = App.digits;
  var MONTH_RE = /^[A-Z][a-z]{2}-\d{2}$/;
  var ENTRY_COLS = ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'شهر', 'نهاية الايجار', 'كود المستأجر', 'كاش', 'العملة', 'رقم المستند', 'كود', 'بيان', 'بداية الايجار', 'مراجعة'];
  var COPY_FIELDS = ['الاسم', 'Special', 'Rate', 'الجنسية', 'رقم البطاقة - جواز السفر', 'التليفون', 'التأمين', 'تحصيل كل', 'Operation', 'الاستهلاكات', 'موقف الاستلام'];
  var C = { view: 'due', op: '', sort: 'days', q: '', flash: '', st: 'live', days: 7, grp: '' };
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
  // شرايح المكان: الكل + ميفيدا/فيلدج/بورتو/الخارج (اللي موجود بس)
  function grpChips(id, groups, cur) {
    if (groups.length < 2) return '';
    return '<div class="tgs" id="' + id + '" style="margin-bottom:8px"><button class="tg' + (!cur ? ' on' : '') + '" data-g="">الكل</button>' +
      groups.map(function (g) { return '<button class="tg' + (cur === g ? ' on' : '') + '" data-g="' + esc(g) + '">' + esc(g) + '</button>'; }).join('') + '</div>';
  }
  function bindGrp(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.onclick = function () { fn(b.dataset.g); }; }); }
  function bindSeg(id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.onclick = function () { fn(b.dataset.st); }; }); }

  function loadingHtml(t) { return '<div class="loading"><div class="spin"></div>' + t + '</div>'; }
  function errHtml(e) { return '<div class="msg err">' + esc(e.message || e) + '</div>'; }
  function ctx() { return { units: S.units, renters: S.renters, months: S.months, ledger: S.ledger }; }
  // ---------- أسامي ملفات التصدير: التقرير + الفلتر + التاريخ ----------
  var GRP_AR = { Mivida: 'ميفيدا', Village: 'فيلدج', Porto: 'بورتو', 'الخارج': 'الخارج' };
  function grpName(list) { return (list || []).map(function (g) { return GRP_AR[g] || g; }).join(' و'); }
  function scopeName() {
    var st = S.settings || F.DEFAULT_SETTINGS, gs = F.groupsIn(S.units.filter(function (u) { return F.inScope(u, st); }));
    return gs.length >= F.GROUPS.length ? '' : grpName(gs);
  }
  function fdate(d) { d = d || today(); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCDate()) + '-' + p(d.getUTCMonth() + 1) + '-' + d.getUTCFullYear(); }
  function fileName() { return [].slice.call(arguments).filter(function (x) { return x; }).join(' '); }
  function unitOf(code) { return S.units.filter(function (u) { return u.code === String(code); })[0]; }
  function today() { return L.todayUTC(); }

  function ensureSettings() {
    if (S.settingsLoaded) return Promise.resolve();
    return A.getSettings().then(function (s) { S.settings = s; S.settingsLoaded = true; if (A.ensureAutoOpen) A.ensureAutoOpen(s); });
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
      '<div class="unit" style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="flex:1;min-width:0"><div class="r2">ده ملف</div><b style="font-size:17px">' + esc(scopeName() || 'كل المشاريع') + '</b>' +
      '<div class="r2" style="margin-top:2px">' + esc(scopeText(cur)) + '</div></div><button class="act" id="setEditBtn">تعديل</button></div>' +
      '<div id="setEdit" class="hide">' +
      '<label class="radio"><input type="radio" name="mode" value="exclude"' + (cur.mode !== 'only' ? ' checked' : '') + '> كل المشاريع ما عدا اللي هتختارها</label>' +
      '<label class="radio"><input type="radio" name="mode" value="only"' + (cur.mode === 'only' ? ' checked' : '') + '> المشاريع اللي هتختارها بس</label>' +
      '<div style="display:flex;gap:12px;margin:6px 0 6px"><button class="link" id="setAll">اختار الكل</button><button class="link" id="setNone">شيل الكل</button><span class="r2" id="setCnt" style="margin-inline-start:auto"></span></div>' +
      '<div class="tgs" id="setPj">' + projects.map(function (p) {
        var on = cur.projects.some(function (x) { return x.trim().toLowerCase() === p.toLowerCase(); });
        return '<button type="button" class="tg' + (on ? ' on' : '') + '" data-pj="' + esc(p) + '">' + esc(p) + '</button>';
      }).join('') + '</div></div>' +
      '<p class="r2">وحدات التسويات <span dir="ltr">N-F</span> مستبعدة دايماً من كل الملفات.</p>' +
      '<label class="chk" style="margin:4px 0 12px;font-size:13px;color:var(--ink)"><input type="checkbox" id="setAuto"' + (cur.autoOpen !== false ? ' checked' : '') + '> افتح البانل لوحده أول ما الملف يتفتح</label>' +
      '<details class="more" style="margin:0 0 12px"><summary>أسماء الموظفين (' + ((cur.people || []).length) + ')</summary><div class="r2" style="margin:6px 0 4px">اسم في كل سطر، أو الصق عمود الأسامي من الإكسيل. بتظهر في خانة "موظف" في أي حركة خزينة.</div><textarea id="setPeople" style="min-height:120px">' + esc((cur.people || []).join('\n')) + '</textarea></details>' +
      '<div id="setMsg"></div><div style="display:flex;gap:8px"><button class="btn ghost" id="setBack">إلغاء</button><button class="btn primary" id="setSave">حفظ</button></div>' +
      '<button class="btn ghost" id="setRole" style="width:100%;margin-top:10px">دور الجهاز ده: ' + esc(window.OsoolHome ? OsoolHome.roleName() : '') + '</button>' +
      '<button class="btn ghost" id="setReview" style="width:100%;margin-top:8px">المراجعة</button>' +
      '<button class="btn ghost" id="setRows" style="width:100%;margin-top:8px">إضافة سطور فاضية للجداول</button>');
    var pjs = function () { return Array.prototype.slice.call(document.querySelectorAll('#setPj .tg')); };
    var cnt = function () { $('setCnt').textContent = 'مختار ' + pjs().filter(function (b) { return b.classList.contains('on'); }).length + ' من ' + projects.length; };
    pjs().forEach(function (b) { b.onclick = function () { b.classList.toggle('on'); cnt(); }; });
    $('setAll').onclick = function () { pjs().forEach(function (b) { b.classList.add('on'); }); cnt(); };
    $('setNone').onclick = function () { pjs().forEach(function (b) { b.classList.remove('on'); }); cnt(); };
    cnt();
    $('setEditBtn').onclick = function () { var on = $('setEdit').classList.toggle('hide'); this.textContent = on ? 'تعديل' : 'خلاص'; };
    $('setBack').onclick = App.closeSheet;
    $('setRows').onclick = openAddRows;
    $('setRole').onclick = function () { if (window.OsoolHome) OsoolHome.pickRole(); };
    $('setReview').onclick = function () { App.closeSheet(); App.showTab('review'); };
    $('setSave').onclick = function () {
      var mode = document.querySelector('input[name=mode]:checked').value;
      var list = pjs().filter(function (b) { return b.classList.contains('on'); }).map(function (b) { return b.dataset.pj; });
      if (mode === 'only' && !list.length) { $('setMsg').innerHTML = '<div class="msg err">اختار مشروع واحد على الأقل.</div>'; return; }
      var people = []; $('setPeople').value.split(/\n/).forEach(function (x) { x = x.trim(); if (x && people.indexOf(x) === -1) people.push(x); });
      var obj = { mode: mode, projects: list, autoOpen: $('setAuto').checked, people: people };
      this.disabled = true;
      A.saveSettings(obj).then(function () {
        S.settings = obj; S.settingsLoaded = true; App.closeSheet();
        App.showTab(S.tab || 'home'); // النطاق الجديد يتطبق على الشاشة المفتوحة
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
          return '<div class="r2" style="margin:3px 0"><b>' + esc(i.title) + ':</b> ' + money(i.empty) + ' سطر فاضي ' + (i.settle ? 'قبل سطور التسويات' : 'من ' + money(i.total)) + ' · ' +
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
        $('arMsg').innerHTML = '<div class="msg ok">اتضاف ' + money(r.added) + ' سطر لجدول ' + esc(r.title) + '. فيه دلوقتي ' + money(r.empty) + ' سطر فاضي' + (r.settle ? ' فوق التسويات، والتسويات نزلت لتحت زي ما هي' : '') + '. متنساش ترجّع الحماية.</div>' +
          (r.fixedTotals ? '<div class="msg err">الإجماليات اللي تحت الجدول معادلاتها على نطاق ثابت، فمش هتحسب السطور الجديدة. وسّع نطاقها لحد آخر سطر في الجدول.</div>' : '');
        btn.disabled = false; btn.textContent = 'إضافة'; show();
      }).catch(function (e) { $('arMsg').innerHTML = errHtml(e); btn.disabled = false; btn.textContent = 'إضافة'; show(); });
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
      (function () { if (!App.cmpOn()) return ''; var h = F.heldDeposits(S.units, S.renters, S.ledger || {}, S.settings || F.DEFAULT_SETTINGS, today()); return h.length ? '<button class="depbar" id="depOpen"><b>' + h.length + ' تأمين لسه مترجعش</b><span>' + money(h.reduce(function (a, x) { return a + x.total; }, 0)) + ' ج · عقود خلصت</span></button>' : ''; })() +
      stSeg('stSeg', C.st) + grpChips('cGrp', F.groupsIn(items.map(function (x) { return x.unit || {}; })), C.grp) +
      '<div class="seg" id="vSeg" style="grid-template-columns:repeat(4,1fr);font-size:12px"><button data-v="due">متأخر ومستحق</button><button data-v="late">المتأخرين</button><button data-v="soon">المستحقين</button><button data-v="all">الأرصدة (' + bal.length + ')</button></div>' +
      '<div class="filters"><select id="fOp"><option value="">كل المسؤولين</option>' + Object.keys(ops).sort().map(function (o) { return '<option' + (o === C.op ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      '<select id="fSort"><option value="days">' + ({ due: 'حسب الأيام', late: 'الأكتر تأخير', soon: 'الأقرب ميعاد', all: 'الأكتر تأخير' })[C.view] + '</option><option value="amount"' + (C.sort === 'amount' ? ' selected' : '') + '>الأكبر مبلغ</option></select></div>' +
      '<input id="fQ" placeholder="بحث بالاسم أو الكود" value="' + esc(C.q) + '" autocomplete="off" style="margin-bottom:8px">' +
      exportBar('collExp') +
      '<div id="opsBar" class="r2" style="display:flex;gap:12px;align-items:center;margin:2px 0 8px"></div>' +
      '<div id="collList"></div>';
    C.flash = ''; C.check = '';
    document.querySelectorAll('#vSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.v === C.view);
      b.onclick = function () { C.view = b.dataset.v; drawColl(); };
    });
    bindSeg('stSeg', function (v) { C.st = v; drawColl(); });
    bindGrp('cGrp', function (g) { C.grp = g; drawColl(); });
    $('collDays').onchange = function () { C.days = +this.value; try { localStorage.setItem('osoolPanel.collDays', C.days); } catch (e) {} drawColl(); };
    $('fOp').onchange = function () { C.op = this.value; drawList(); };
    $('fSort').onchange = function () { C.sort = this.value; drawList(); };
    $('fQ').oninput = function () { C.q = this.value; drawList(); };
    $('chgScope').onclick = openSettings;
    if ($('depOpen')) $('depOpen').onclick = openDeposits;
    bindExport('collExp', function () {
      var list = S.collView || [];
      var nm = ({ due: 'المتأخرين والمستحقين ', late: 'المتأخرات ', soon: 'المتوقع تحصيله ', all: 'الأرصدة ' })[C.view] + ({ live: 'ساري ', ended: 'منتهي ', all: '' })[C.st];
      var ttl = fileName(nm.trim(), C.grp ? grpName([C.grp]) : scopeName()); nm = fileName(ttl, fdate());
      return { name: nm, title: ttl, sheet: 'التحصيلات', sub: (C.grp || 'كل الأماكن') + (C.op ? ' · ' + C.op : ''),
        kinds: ['text', 'text', 'text', 'text', 'text', 'text', 'phone', 'text', 'money', 'date', 'date', 'num', 'date', 'date', 'money'], sums: [8],
        headers: ['الاسم', 'كود المستأجر', 'المشروع', 'عمارة', 'شقة', 'المسؤول', 'التليفون', 'الحالة', 'المطلوب', 'ميعاد القسط', 'مسدد لحد', 'أيام التأخير', 'بداية العقد', 'نهاية العقد', 'رصيد التأمين'],
        rows: list.map(function (x) { var u = x.unit || {}, sn = !x.late && x.exp;
          return [x.r.name, x.r.code, u.project || '', u.building || '', u.apt || '', x.r.operation, x.r.phone, x.late ? 'متأخر' : sn ? 'مستحق' : 'رصيد',
            Math.round(sn ? x.exp.amount : x.balance), sn ? x.exp.date : (x.paidUntil ? new Date(x.paidUntil.getTime() + 864e5) : ''), x.paidUntil, x.daysLate, x.r.start, x.r.end, x.deposit]; }) };
    });
    drawList();
  }

  function statusLine(x) {
    if (!x.late && x.exp && C.view !== 'all') return '<span class="okc">مستحق ' + L.fmt(x.exp.date) + (x.exp.inDays ? ' (بعد ' + x.exp.inDays + ' يوم)' : ' (النهارده)') + '</span>' + (x.paidNote === 'مفيش تحصيل' ? ' · أول تحصيل' : ' · مسدد لحد ' + L.fmt(x.paidUntil));
    if (x.late) return '<span class="late">متأخر ' + x.daysLate + ' يوم</span> · ' + (x.paidNote === 'مفيش تحصيل' ? 'مفيش تحصيل من البداية' : 'مسدد لحد ' + L.fmt(x.paidUntil) + (x.paidNote ? ' (' + x.paidNote + ')' : ''));
    return '<span class="okc">مسدد لحد ' + L.fmt(x.paidUntil) + '</span>';
  }
  function untilOf(x) { return x.late ? today() : new Date(today().getTime() + C.days * 864e5); }
  function openUrl(url) {
    try { if (window.Office && Office.context && Office.context.ui && Office.context.ui.openBrowserWindow) Office.context.ui.openBrowserWindow(url); else window.open(url, '_blank'); }
    catch (e) { window.open(url, '_blank'); }
  }
  function drawList() {
    var list = (S.fu || []).filter(function (x) {
      return C.view === 'due' ? (x.late || !!x.exp) : C.view === 'late' ? x.late : C.view === 'soon' ? !!x.exp && !x.late : x.balance > 1;
    });
    if (C.op) list = list.filter(function (x) { return x.r.operation === C.op; });
    if (C.grp) list = list.filter(function (x) { return F.groupOf(x.unit && x.unit.project) === C.grp; });
    var q = L.norm(C.q);
    if (q) list = list.filter(function (x) { return L.norm(x.r.name + ' ' + x.r.code).indexOf(q) !== -1; });
    var amt = function (x) { return !x.late && x.exp ? x.exp.amount : x.balance; };
    // المتأخرين الأول (الأكتر تأخير الأول)، وبعدهم المستحقين (الأقرب ميعاد الأول)
    list.sort(function (a, b) {
      if (a.late !== b.late) return a.late ? -1 : 1;
      if (C.sort === 'amount') return amt(b) - amt(a);
      return a.late ? b.daysLate - a.daysLate : (a.exp && b.exp ? a.exp.date - b.exp.date : 0);
    });
    S.collView = list;
    var canMsg = C.view !== 'all';
    $('opsBar').innerHTML = canMsg && list.length ? '<b>رسالة مجمعة للأوبريشن (' + list.length + ')</b><button class="link" id="opsWa">واتساب</button><button class="link" id="opsCp">نسخ</button>' : '';
    if (canMsg && list.length) {
      var bulk = function () { return F.opsBulk(list, today(), untilOf, C.op ? 'Operation: ' + C.op : ''); };
      $('opsWa').onclick = function () { openUrl(F.waLink(null, bulk())); };
      $('opsCp').onclick = function () { App.copyText(bulk(), this); };
    }
    var firstSoon = -1; list.forEach(function (x, i) { if (firstSoon === -1 && !x.late) firstSoon = i; });
    $('collList').innerHTML = list.length ? list.map(function (x, i) {
      return (C.view === 'due' && i === firstSoon ? '<div class="r2" style="margin:12px 2px 6px;font-weight:700">المستحقين خلال ' + C.days + ' يوم</div>' : '') +
        (C.view === 'due' && i === 0 && x.late ? '<div class="r2" style="margin:2px 2px 6px;font-weight:700">المتأخرين</div>' : '') +
        '<div class="rcard click" data-code="' + esc(x.r.code) + '"><div class="top2"><div><div class="r1">' + esc(x.r.name || '—') + '</div>' +
        '<div class="r2">' + esc(x.unit ? App.unitTitle(x.unit) : x.r.unit) + '</div></div><div class="amt">' + money(C.view === 'all' ? x.balance : amt(x)) + '</div></div>' +
        '<div class="r2" style="margin-top:4px">' + statusLine(x) + '</div>' +
        '<div style="margin-top:4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="pill" dir="ltr">' + esc(x.r.code) + '</span>' + (x.r.operation ? '<span class="pill">' + esc(x.r.operation) + '</span>' : '') +
        (canMsg ? '<span style="margin-inline-start:auto"></span><button class="link" data-ow="' + i + '">رسالة للأوبريشن</button><button class="link" data-oc="' + i + '" style="color:var(--muted)">نسخ</button>' : '') + '</div></div>';
    }).join('') : '<div class="empty" style="padding:8px">مفيش حد هنا.</div>';
    document.querySelectorAll('#collList .rcard').forEach(function (c) { c.onclick = function (e) { if (e.target.closest('button')) return; openDetail(c.dataset.code); }; });
    document.querySelectorAll('#collList button[data-ow]').forEach(function (b) { b.onclick = function () { var x = list[+b.dataset.ow]; openUrl(F.waLink(null, F.opsMessage(x, today(), untilOf(x)).text)); }; });
    document.querySelectorAll('#collList button[data-oc]').forEach(function (b) { b.onclick = function () { var x = list[+b.dataset.oc]; App.copyText(F.opsMessage(x, today(), untilOf(x)).text, b); }; });
  }

  // تحذير لو نفس الحركة اتسجلت قبل كده في نفس اليوم
  function dupHtml(vals) {
    if (!S.treasury) return '';
    var d = F.findDuplicates(S.treasury, vals); if (!d.length) return '';
    return '<div class="msg err"><b>انتبه: ممكن تكون متسجلة قبل كده.</b>' + d.map(function (x) { return '<div>' + esc(x.cat) + ' بـ ' + money(x.amount) + ' في نفس اليوم ولنفس الكود' + (x.note ? ' (' + esc(x.note) + ')' : '') + '.</div>'; }).join('') +
      '<div>لو دي حركة جديدة فعلاً، اضغط تأكيد.</div></div>';
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
      '<div id="cPart"></div>'+'<div class="grid2"><div><label>رقم المستند</label><input id="cDoc" class="ltr"></div><div><label>البيان</label><input id="cNote" value="' + esc(r.name) + '"></div></div>' +
      '<div id="cMsg" style="margin-top:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" id="cBack">رجوع</button><button class="btn ghost" id="cStmt">كشف حساب</button>' +
      (r.idx >= 0 ? '<button class="btn ghost" id="cGo">سطر العقد</button>' : '') + '<button class="btn primary" id="cSave">تسجيل</button></div>');
    var fx = function () { $('cFxBox').classList.toggle('hide', !F.isForeign($('cCash').value)); };
    $('cCash').onchange = fx; fx();
    $('cBack').onclick = App.closeSheet;
    $('cStmt').onclick = function () { openStatement('tenant', r.idx); };
    if ($('cGo')) $('cGo').onclick = function () { A.goToRow(r.idx); };
    var armed = false;
    // دفعة جزئية: الفترة يوم واحد من بداية الدورة، عشان "مسدد حتى" ميتحركش
    var syncPartial = function () {
      var amt = Number(digits($('cAmt').value)) || 0, rem = F.monthRemaining(x, $('cMonth').value);
      var p = F.partialPeriod(sg.from, sg.to, amt, rem);
      $('cFrom').value = L.toISO(p.from); $('cTo').value = L.toISO(p.to);
      $('cPart').innerHTML = p.partial ? '<div class="msg warn">دفعة جزئية (الباقي عن الشهر ' + money(rem) + '): الفترة هتتسجل يوم واحد ' + L.fmt(p.from) + '، و"مسدد حتى" مش هيتحرك.</div>' : '';
    };
    $('cAmt').addEventListener('input', syncPartial); $('cMonth').addEventListener('change', syncPartial);
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
        $('cMsg').innerHTML = dupHtml([F.entryValues(e)]) + '<div class="msg warn">هيتسجل ' + money(e.amount) + ' ج تحصيل إيجار عن ' + L.monthLabel(e.month) + ' في ' + esc(e.cash) + '. اضغط تأكيد.</div>';
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
  var OW = { view: 'due', q: '', flash: '', check: '', days: 7, grp: '' };
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
        '<div style="margin-top:8px"></div>' + exportBar('owExp') + grpChips('oGrp', F.groupsIn(list.map(function (x) { return x.unit; })), OW.grp) +
        '<input id="owQ" placeholder="بحث باسم المالك أو الوحدة" value="' + esc(OW.q) + '" autocomplete="off" style="margin:8px 0 10px"><div id="owList"></div>';
      OW.flash = ''; OW.check = '';
      document.querySelectorAll('#owSeg button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.v === OW.view);
        b.onclick = function () { OW.view = b.dataset.v; document.querySelectorAll('#owSeg button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawOwners(); };
      });
      $('owQ').oninput = function () { OW.q = this.value; drawOwners(); };
      bindGrp('oGrp', function (g) { OW.grp = g; renderOwners(); });
      bindExport('owExp', function () {
        var l = S.owView || [];
        return { name: fileName('سدادات الملاك', OW.grp ? grpName([OW.grp]) : scopeName(), fdate()), title: fileName('سدادات الملاك', OW.grp ? grpName([OW.grp]) : scopeName()), sheet: 'الملاك', sub: ({ due: 'متأخر ومستحق', late: 'المتأخرين', all: 'الكل' })[OW.view] + ' · ' + (OW.grp || 'كل الأماكن'),
          kinds: ['text', 'text', 'text', 'text', 'text', 'phone', 'text', 'num', 'money', 'date', 'date', 'money', 'text', 'text', 'text', 'text'], sums: [8],
          headers: ['المالك', 'كود الوحدة', 'المشروع', 'عمارة', 'شقة', 'التليفون', 'الحالة', 'يسدد كل', 'المطلوب', 'مسدد لحد', 'آخر سداد', 'مبلغ آخر سداد', 'المستفيد', 'رقم الحساب', 'البنك', 'طريقة الدفع'],
          rows: l.map(function (x) { var u = x.unit, t = F.ownerTransfer(x);
            return [u.owner, u.code, u.project, u.building, u.apt, u.phone, x.status === 'late' ? 'متأخر ' + (-x.daysLeft) + ' يوم' : x.status === 'none' ? 'مفيش سداد' : 'باقي ' + x.daysLeft + ' يوم',
              x.every, x.required, x.paidUntil, x.lastDate, x.lastSum, t.name, t.acc, t.bank, t.method]; }) };
      });
      $('owDays').onchange = function () { OW.days = +this.value; try { localStorage.setItem('osoolPanel.ownerDays', OW.days); } catch (e) {} renderOwners(); };
      drawOwners();
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function drawOwners() {
    var q = L.norm(OW.q);
    var list = (S.ow || []).filter(function (x) {
      if (OW.view === 'due' && x.status !== 'late' && x.status !== 'soon') return false;
      if (OW.view === 'late' && x.status !== 'late') return false;
      if (OW.grp && F.groupOf(x.unit.project) !== OW.grp) return false;
      if (q && L.norm([x.unit.owner, x.unit.code, x.unit.project, x.unit.building, x.unit.apt].join(' ')).indexOf(q) === -1) return false;
      return true;
    });
    S.owView = list;
    $('owList').innerHTML = list.length ? list.map(function (x, i) {
      var u = x.unit, st;
      if (x.status === 'none') st = '<span class="badge done">مفيش سداد متسجل</span>';
      else if (x.status === 'late') st = '<span class="badge book" style="background:var(--err-bg);color:var(--err)">متأخر ' + (-x.daysLeft) + ' يوم</span>';
      else st = '<span class="badge ' + (x.status === 'soon' ? 'book' : 'live') + '">باقي ' + x.daysLeft + ' يوم</span>';
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(u.owner || '—') + '</div><div class="r2">' + esc(App.unitTitle(u) || u.code) + ' · <span dir="ltr">' + esc(u.code) + '</span></div></div>' + st + '</div>' +
        '<dl class="kv"><dt>مسدد لحد</dt><dd>' + L.fmt(x.paidUntil) + '</dd><dt>يسدد كل</dt><dd>' + x.every + ' شهر · المطلوب <b>' + money(x.required) + '</b></dd>' +
        (x.lastDate ? '<dt>آخر سداد</dt><dd>' + L.fmt(x.lastDate) + ' · ' + money(x.lastSum) + '</dd>' : '') +
        (x.balance > 1 ? '<dt>متبقي من ٢٠٢٥</dt><dd class="late">' + money(x.balance) + '</dd>' : '') + '</dl>' +
        '<div style="display:flex;gap:14px;margin-top:6px;flex-wrap:wrap"><button class="link" data-pay="' + i + '">تسجيل سداد</button><button class="link" data-bk="' + i + '">بيانات التحويل</button><button class="link" data-stm="' + i + '">كشف حساب</button>' +
        (x.lastDate ? '<button class="link" data-wa="' + i + '">رسالة واتساب</button><button class="link" data-cp="' + i + '" style="color:var(--muted)">نسخ الرسالة</button>' : '') + '</div><div id="bk' + i + '"></div></div>';
    }).join('') : '<div class="empty" style="padding:8px">مفيش ملاك هنا.</div>';
    $('owList').querySelectorAll('button[data-stm]').forEach(function (b) { b.onclick = function () { openStatement('owner', list[+b.dataset.stm].unit.code); }; });
    $('owList').querySelectorAll('button[data-bk]').forEach(function (b) {
      b.onclick = function () { var box = $('bk' + b.dataset.bk); box.innerHTML = box.innerHTML ? '' : bankHtml(list[+b.dataset.bk], 'bkc' + b.dataset.bk); if (box.innerHTML) bindBank(list[+b.dataset.bk], 'bkc' + b.dataset.bk); };
    });
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

  function bankHtml(x, id) {
    var t = F.ownerTransfer(x);
    return '<div class="bankbox"><dl><dt>المستفيد</dt><dd>' + esc(t.name || '—') + '</dd><dt>رقم الحساب</dt><dd>' + esc(t.acc || '—') + '</dd><dt>البنك</dt><dd>' + esc(t.bank || '—') + '</dd>' +
      '<dt>طريقة الدفع</dt><dd>' + esc(t.method || '—') + '</dd><dt>المبلغ</dt><dd>' + money(t.amount) + ' EGP</dd></dl>' +
      (!t.acc ? '<div class="r2" style="margin-top:4px">مفيش رقم حساب للمالك ده في عقود الملاك.</div>' : '') +
      '<div style="display:flex;gap:14px;margin-top:7px"><button class="link" id="' + id + '">نسخ بيانات التحويل</button></div></div>';
  }
  function bindBank(x, id) { var b = $(id); if (b) b.onclick = function () { App.copyText(F.ownerTransfer(x).text, b); }; }

  // ======================= كشف الحساب =======================
  function duesOfIdx(idx) { var o = {}; Object.keys(S.months).forEach(function (k) { var v = Number(S.months[k][idx]); if (v) o[k] = v; }); return o; }
  function openStatement(kind, key) {
    ensureTreasury().then(function () {
      var st, info, name, data;
      if (kind === 'tenant') {
        var r = S.renters.filter(function (x) { return x.idx === key; })[0]; if (!r) return;
        var u = unitOf(r.unit) || {};
        st = F.tenantStatement(r, duesOfIdx(r.idx), S.treasury, today());
        name = r.name || r.code;
        info = { title: 'كشف حساب مستأجر', who: name, lines: [['المستأجر', name], ['كود المستأجر', r.code], ['الوحدة', App.unitTitle(u) || r.unit], ['العقد', L.fmt(r.start) + ' ← ' + L.fmt(r.end)], ['الإيجار', r.rent ? money(r.rent) : '—']] };
      } else {
        var o = unitOf(key); if (!o) return;
        st = F.ownerStatement(o, S.ownerMonths, S.treasury, today());
        name = o.owner || o.code;
        info = { title: 'كشف حساب مالك', who: name, lines: [['المالك', name], ['الوحدة', App.unitTitle(o) || o.code], ['كود الوحدة', o.code], ['يسدد كل', (o.every || 1) + ' شهر'], ['نهاية العقد', L.fmt(o.ownerEnd)]] };
      }
      var bal = st.balance, fname = fileName('كشف حساب', name, fdate());
      var summary = [info.title, info.lines.map(function (l) { return l[0] + ': ' + l[1]; }).join('\n'), '',
        'المستحق من ' + L.monthLabel(F.FOLLOW_FROM) + ': ' + money(st.due), 'المدفوع: ' + money(st.paid), (bal > 0 ? 'الباقي: ' : bal < 0 ? 'مدفوع زيادة: ' : 'الرصيد: ') + money(Math.abs(bal))].join('\n');
      App.openSheet('<h2>' + info.title + '</h2><div class="card"><div class="r1">' + esc(name) + '</div><div class="r2">' + esc(kind === 'tenant' ? info.lines[2][1] : info.lines[1][1]) + '</div>' +
        '<div class="sum" style="grid-template-columns:1fr 1fr 1fr;margin:10px 0 0"><div class="box"><div class="v">' + money(st.due) + '</div><div class="k">المستحق</div></div>' +
        '<div class="box"><div class="v okc">' + money(st.paid) + '</div><div class="k">المدفوع</div></div>' +
        '<div class="box"><div class="v ' + (bal > 0 ? 'late' : 'okc') + '">' + money(Math.abs(bal)) + '</div><div class="k">' + (bal > 0 ? 'الباقي' : bal < 0 ? 'مدفوع زيادة' : 'الرصيد') + '</div></div></div></div>' +
        (st.lines.length ? '<table class="mt"><tr><th>التاريخ</th><th>البيان</th><th class="n">الرصيد</th></tr>' + st.lines.slice(-8).reverse().map(function (x) {
          return '<tr><td>' + L.fmt(x.date) + '</td><td>' + esc(x.desc) + '<div class="r2 ' + (x.credit ? 'okc' : '') + '">' + (x.credit ? '−' + money(x.credit) : '+' + money(x.debit)) + '</div></td><td class="n">' + money(x.balance) + '</td></tr>';
        }).join('') + '</table>' + (st.lines.length > 8 ? '<div class="r2" style="margin:4px 0">ظاهر آخر ٨ من ' + st.lines.length + ' سطر. الـ PDF والإكسيل فيهم الكل.</div>' : '') : '<div class="r2">مفيش حركات من ' + esc(L.monthLabel(F.FOLLOW_FROM)) + '.</div>') +
        (st.future && st.future.count ? '<div class="r2" style="margin:6px 0">جاي بعد كده ' + st.future.count + ' قسط بـ ' + money(st.future.total) + '.</div>' : '') +
        '<div class="r2" id="stMsg" style="margin:6px 0"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="stPdf">PDF</button><button class="btn ghost" id="stXl">إكسيل</button><button class="btn ghost" id="stCp">نسخ الملخص</button><button class="btn ghost" id="stX">رجوع</button></div>');
      $('stPdf').onclick = function () { R.openPrint(R.statementReport(st, info), fname).then(function () { $('stMsg').textContent = 'اختار Save as PDF من نافذة الطباعة.'; }); };
      $('stXl').onclick = function () {
        $('stMsg').textContent = 'بيجهز الإكسيل…';
        R.downloadXlsx({ name: fname, title: info.title + ' · ' + name, sheet: 'كشف حساب', sub: info.lines.map(function (l) { return l[0] + ': ' + l[1]; }).join(' · '),
          kinds: ['date', 'text', 'money', 'money', 'money'], sums: [2, 3], headers: ['التاريخ', 'البيان', 'مستحق', 'مدفوع', 'الرصيد'],
          rows: st.lines.map(function (x) { return [x.date, x.desc, x.debit || '', x.credit || '', x.balance]; }) })
          .then(function () { $('stMsg').textContent = st.lines.length + ' سطر'; }, function (e) { $('stMsg').textContent = e.message || 'التحميل مش متاح هنا.'; });
      };
      $('stCp').onclick = function () { App.copyText(summary, this); };
      $('stX').onclick = App.closeSheet;
    }).catch(function (e) { alert(e.message || e); });
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
    App.openSheet('<h2 style="display:flex;align-items:baseline">حركة خزينة جديدة<button class="link" id="eBulk" style="margin-inline-start:auto;font-size:13px">لأكتر من وحدة؟</button></h2>' +
      '<div class="seg" id="eSide"><button data-s="in">وارد</button><button data-s="out" class="on">منصرف</button></div>' +
      '<label>الفئة <span class="req">*</span></label><select id="eCat"><option value="">اختار الفئة…</option><optgroup label="الأكثر استخدام">' + top.map(opt).join('') + '</optgroup><optgroup label="كل الفئات">' + cats.map(opt).join('') + '</optgroup></select>' +
      '<label>الوحدة <span class="r2" id="eUnitHint">(سيبها فاضية للمصروفات العامة)</span></label>' +
      '<div id="ePick"><input id="eUnitQ" placeholder="ابحث بالكود أو العمارة أو الشقة" autocomplete="off"><div id="eUnitRes" class="results hide"></div></div><div id="eUnitCard"></div>' +
      '<div id="eTen" class="hide"><label>المستأجر <span class="req">*</span></label><select id="eTenant"></select></div>' +
      '<div id="eOwn" class="hide"><div class="r2" id="eOwnInfo" style="margin-top:8px"></div><label>عدد الشهور</label><input id="eOwnN" class="ltr" inputmode="numeric" value="1" style="width:70px"><div id="eOwnRows" style="margin-top:6px"></div></div>' +
      '<div id="ePeriod" class="hide"><label>عن شهر</label><select id="eMonth"></select><div class="grid2"><div><label>من</label><input type="date" id="eFrom"></div><div><label>إلى</label><input type="date" id="eTo"></div></div></div>' +
      '<div class="grid2"><div><label>التاريخ</label><input type="date" id="eDate" value="' + L.toISO(today()) + '" max="' + L.toISO(today()) + '"></div>' +
      '<div id="eAmtBox"><label>المبلغ بالجنيه <span class="req">*</span></label><input id="eAmt" class="ltr" inputmode="decimal"></div></div>' +
      '<div id="ePart"></div>' +
      '<div class="grid2"><div><label>الخزينة</label><select id="eCash">' + cashOptions('جنيه  خزينة') + '</select></div><div id="eFxBox" class="hide"><label>المبلغ بالعملة</label><input id="eFx" class="ltr" inputmode="decimal"></div></div>' +
      '<div id="eWhoBox"><label>موظف <span class="r2">(اختياري، اسمه بيتكتب في البيان)</span></label><select id="eWho"></select><input id="eWhoNew" class="hide" placeholder="اكتب الاسم" style="margin-top:6px"></div>' +
      '<div id="eGenM"><label>عن شهر <span class="r2">(اختياري)</span></label><select id="eGenMonth"></select></div>' +
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
    $('eGenMonth').innerHTML = '<option value="">—</option>' + monthOptions(recentKeys(), '');
    $('eWho').onchange = function () { $('eWhoNew').classList.toggle('hide', this.value !== '__new'); if (this.value === '__new') $('eWhoNew').focus(); disarm(); };
    $('eWhoNew').addEventListener('input', disarm); $('eGenMonth').addEventListener('change', disarm);
    $('eBack').onclick = App.closeSheet;
    $('eSave').onclick = saveEntry;
    $('eBulk').onclick = function () { App.closeSheet(); setTimeout(openBulk, 50); };
    var entryPartial = function () {
      if (!EN.sg || EN.cat !== 'تحصيل ايجار' || !EN.item) return;
      var amt = Number(digits($('eAmt').value)) || 0, rem = F.monthRemaining(EN.item, $('eMonth').value);
      var p = F.partialPeriod(EN.sg.from, EN.sg.to, amt, rem);
      $('eFrom').value = L.toISO(p.from); $('eTo').value = L.toISO(p.to);
      $('ePart').innerHTML = p.partial ? '<div class="msg warn">دفعة جزئية (الباقي عن الشهر ' + money(rem) + '): الفترة هتتسجل يوم واحد ' + L.fmt(p.from) + '، و"مسدد حتى" مش هيتحرك.</div>' : '';
    };
    $('eAmt').addEventListener('input', entryPartial); $('eMonth').addEventListener('change', entryPartial);
    if (preset && preset.cat) {
      $('eCat').value = preset.cat; EN.cat = preset.cat; if (EN.sd[EN.cat]) setSide(EN.sd[EN.cat].side);
      if (preset.unit) { EN.unit = preset.unit; drawEntryUnit(); }
      if (preset.n) { EN.ownerN = preset.n; $('eOwnN').value = preset.n; }
      EN.presetTenant = preset.tenant || '';
      refreshEntry();
      if (preset.amount) $('eAmt').value = preset.amount;
      if (preset.cash) { $('eCash').value = preset.cash; $('eCash').onchange(); }
    }
  }
  // أسامي الموظفين من إعداد الملف (بتتحفظ جوه الملف، مش في كود البانل)
  function peopleList() { var p = (S.settings && S.settings.people) || []; return p.slice().sort(function (a, b) { return a.localeCompare(b, 'ar'); }); }
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
    // الشهر الاختياري للمصروفات العامة، واسم صاحب السلفة لبنود الموظفين
    $('eGenM').classList.toggle('hide', !!needPeriod || (ownerMonthly && !!EN.unit));
    if (!$('eWho').options.length) {
      var ppl = peopleList();
      $('eWho').innerHTML = '<option value="">—</option>' + ppl.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '<option value="__new">اسم تاني…</option>';
    }
    if (isTen && EN.unit) {
      var list = S.renters.filter(function (r) { return r.unit === EN.unit.code && r.code; }).sort(function (a, b) { return (b.start || 0) - (a.start || 0); });
      var t = today(), cur = list.filter(function (r) { return r.start <= t && r.end >= t; })[0];
      $('eTenant').innerHTML = list.length ? list.slice(0, 30).map(function (r) {
        return '<option value="' + esc(r.code) + '"' + ((EN.presetTenant ? r.code === EN.presetTenant : cur && r.code === cur.code) ? ' selected' : '') + '>' + esc((r.name || '—') + ' · ' + r.code + ' · ' + L.fmt(r.start) + ' ← ' + L.fmt(r.end)) + '</option>';
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
    EN.sg = sg; EN.item = it;
    var keys = Object.keys(it.dues).filter(function (k) { return F.cmpKey(k, F.FOLLOW_FROM) >= 0; });
    if (keys.indexOf(sg.month) === -1) keys.push(sg.month);
    keys.sort(F.cmpKey);
    $('eMonth').innerHTML = monthOptions(keys, sg.month);
    $('eFrom').value = L.toISO(sg.from); $('eTo').value = L.toISO(sg.to);
    if (EN.cat === 'تحصيل ايجار' && sg.amount && !$('eAmt').value) $('eAmt').value = sg.amount;
    $('ePart').innerHTML = '';
    $('eNote').value = r.name || $('eNote').value;
  }
  function refreshOwner() {
    var sg = F.ownerSuggest(EN.unit, S.ownerMonths, F.ownerPaid(S.treasury), today(), EN.ownerN);
    EN.ownerRows = sg.rows;
    $('eOwnInfo').innerHTML = sg.lastPaid ? 'آخر شهر اتسدد: <b>' + L.monthLabel(L.monthKey(sg.lastPaid)) + '</b>' + (sg.lastAmount ? ' بمبلغ ' + money(sg.lastAmount) : '') : 'مفيش سداد ايجار متسجل للوحدة دي.';
    var src = { sheet: 'من عقد المالك', last: 'زي آخر سداد', rent: 'قيمة الإيجار' };
    $('eOwnRows').innerHTML = '<table class="sch">' + sg.rows.map(function (r, i) {
      return '<tr><td class="m">' + L.monthLabel(r.key) + '<div class="note" data-onote="' + i + '">' + L.fmt(r.from) + ' ← ' + L.fmt(r.to) + ' · ' + src[r.source] + '</div></td><td><input class="ltr" data-orow="' + i + '" value="' + (r.amount || '') + '"></td></tr>';
    }).join('') + '</table><div class="total"><span>الإجمالي</span><span id="eOwnTot">' + money(sg.rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0)) + '</span></div>';
    document.querySelectorAll('#eOwnRows input[data-orow]').forEach(function (inp) {
      inp.oninput = function () {
        var r = EN.ownerRows[+inp.dataset.orow]; r.amount = Number(digits(inp.value)) || 0;
        var p = F.partialPeriod(r.from, r.fullTo, r.amount, r.full); r.to = p.to;
        var nt = document.querySelector('#eOwnRows [data-onote="' + inp.dataset.orow + '"]');
        if (nt) nt.innerHTML = L.fmt(r.from) + ' ← ' + L.fmt(r.to) + ' · ' + (p.partial ? '<b class="late">دفعة جزئية: يوم واحد، و"مسدد حتى" مش هيتحرك</b>' : src[r.source]);
        $('eOwnTot').textContent = money(EN.ownerRows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0)); disarm();
      };
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
      else if ($('eGenMonth').value) extra.month = $('eGenMonth').value;
      // الموظف: اسمه الكامل بيتكتب في البيان جنب الوصف
      var who = $('eWho').value === '__new' ? $('eWhoNew').value.trim() : $('eWho').value;
      if (who) { var nt = base.note.trim(); extra.note = nt.indexOf(who) !== -1 ? nt : (nt ? nt + ' - ' + who : who); }
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
      $('eMsg').innerHTML = dupHtml(list.map(function (e) { return F.entryValues(e); })) + '<div class="msg warn">هيتسجل ' + (list.length > 1 ? list.length + ' سطور بإجمالي ' : '') + money(total) + ' ج ' + (EN.side === 'in' ? 'وارد' : 'منصرف') + ' · ' + esc(cat) + ' · ' + esc(cash) + '. اضغط تأكيد.</div>';
      return;
    }
    var btn = $('eSave'); btn.disabled = true; btn.textContent = 'بيسجل…';
    var vals = list.map(function (e) { return F.entryValues(e); });
    A.writeEntries(vals).then(function (res) {
      vals.forEach(appendTreasury);
      App.closeSheet();
      TR.flash = 'اتسجل ' + (vals.length > 1 ? vals.length + ' سطور' : 'السطر') + ' في الخزينة (' + res.rows.join('، ') + ').';
      TR.check = App.checkHtml(res);
      if (S.tab === 'owners') { OW.flash = TR.flash; OW.check = TR.check; TR.flash = ''; TR.check = ''; renderOwners(); }
      else if (S.tab === 'home' && window.OsoolHome) { OsoolHome.flash(TR.flash, TR.check); TR.flash = ''; TR.check = ''; OsoolHome.render(); }
      else renderTreas();
    }).catch(function (err) { btn.disabled = false; btn.textContent = 'تأكيد التسجيل'; $('eMsg').innerHTML = errHtml(err); });
  }

  // ======================= حركة لأكتر من وحدة =======================
  // بند واحد وتاريخ وخزينة، وقايمة وحدات بمبالغ مختلفة (زي يوم شحن الكهرباء)
  var BK = null;
  function openBulk() {
    if (!TR) { var t0 = today(); TR = { from: new Date(Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), 1)), to: t0, cash: '', cat: '', side: '', q: '' }; }
    var sd = F.sideDefaults(S.treasury);
    var cats = (S.categories && S.categories.length) ? S.categories.slice() : Object.keys(sd).sort();
    var top = Object.keys(sd).filter(function (k) { return sd[k].side === 'out'; }).sort(function (a, b) { return sd[b].n - sd[a].n; }).slice(0, 10);
    var blocked = F.TENANT_CATS.concat(F.OWNER_CATS);
    var opt = function (c) { return blocked.indexOf(c) !== -1 ? '' : '<option value="' + esc(c) + '">' + esc(c) + '</option>'; };
    BK = { side: 'out', rows: [], armed: false };
    App.openSheet('<h2>حركة لأكتر من وحدة</h2><div class="r2" style="margin:-4px 0 8px">نفس البند لكذا وحدة، وكل وحدة بمبلغها. زي يوم شحن الكهرباء.</div>' +
      '<div class="seg" id="bSide"><button data-s="in">وارد</button><button data-s="out" class="on">منصرف</button></div>' +
      '<label>البند <span class="req">*</span></label><select id="bCat"><option value="">اختار البند…</option><optgroup label="الأكثر استخدام">' + top.map(opt).join('') + '</optgroup><optgroup label="كل البنود">' + cats.map(opt).join('') + '</optgroup></select>' +
      '<div class="grid2"><div><label>التاريخ</label><input type="date" id="bDate" value="' + L.toISO(today()) + '" max="' + L.toISO(today()) + '"></div>' +
      '<div><label>الخزينة</label><select id="bCash">' + cashOptions('جنيه  خزينة') + '</select></div></div>' +
      '<div class="grid2"><div><label>رقم المستند</label><input id="bDoc" class="ltr"></div><div><label>البيان</label><input id="bNote" placeholder="لو فاضي هيتكتب اسم البند"></div></div>' +
      '<label style="margin-top:10px">الوحدات: الصق كود الوحدة والمبلغ في كل سطر، أو ضيفهم واحدة واحدة</label>' +
      '<textarea id="bPaste" rows="5" class="ltr" placeholder="70002102   1500&#10;70002107   2000&#10;…" style="width:100%;font-family:inherit"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" id="bRead">ضيف اللي لصقته</button><button class="btn ghost" id="bAdd">+ وحدة</button><button class="link" id="bClear" style="margin-inline-start:auto">مسح الكل</button></div>' +
      '<div id="bRows" style="margin-top:10px"></div>' +
      '<div id="bMsg" style="margin-top:10px"></div><div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" id="bBack">رجوع</button><button class="btn primary" id="bSave">تسجيل</button></div>');
    var setSide = function (x) { BK.side = x; document.querySelectorAll('#bSide button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === x); }); };
    document.querySelectorAll('#bSide button').forEach(function (b) { b.onclick = function () { setSide(b.dataset.s); disarmB(); }; });
    $('bCat').onchange = function () { if (sd[this.value]) setSide(sd[this.value].side); disarmB(); };
    ['bDate', 'bCash', 'bDoc', 'bNote'].forEach(function (id) { $(id).addEventListener('input', disarmB); $(id).addEventListener('change', disarmB); });
    $('bRead').onclick = function () {
      var got = F.parseBulk($('bPaste').value, S.units);
      if (!got.length) { $('bMsg').innerHTML = '<div class="msg err">مفيش سطور. الصق كود الوحدة والمبلغ في كل سطر.</div>'; return; }
      BK.rows = BK.rows.filter(function (r) { return r.code || r.amount; }).concat(got); $('bPaste').value = ''; drawBulk();
    };
    $('bAdd').onclick = function () { BK.rows.push({ code: '', unit: null, amount: 0, note: '', err: '' }); drawBulk(); var ins = document.querySelectorAll('#bRows input[data-bc]'); if (ins.length) ins[ins.length - 1].focus(); };
    $('bClear').onclick = function () { BK.rows = []; drawBulk(); };
    $('bBack').onclick = App.closeSheet;
    $('bSave').onclick = saveBulk;
    drawBulk();
  }
  function disarmB() { if (BK) { BK.armed = false; $('bSave').textContent = 'تسجيل'; $('bMsg').innerHTML = ''; } }
  function checkRow(r) {
    var u = unitOf(digits(r.code)); r.unit = u || null; r.code = u ? u.code : String(r.code || '').trim();
    r.err = !r.code && !(r.amount > 0) ? 'فاضي' : !r.code ? 'اكتب كود الوحدة' : !u ? 'مش لاقي الوحدة دي' : !(r.amount > 0) ? 'اكتب المبلغ' : '';
  }
  function bulkSummary() {
    var seen = {}, dups = 0, total = 0, bad = 0;
    var empty = 0;
    BK.rows.forEach(function (r) { checkRow(r); if (r.err === 'فاضي') empty++; else if (r.err) bad++; else { total += r.amount; if (seen[r.code]) dups++; seen[r.code] = 1; } });
    return { n: BK.rows.length - empty, ok: BK.rows.length - empty - bad, bad: bad, total: total, dups: dups, seen: seen };
  }
  function unitsTxt(n) { return n === 1 ? 'وحدة واحدة' : n === 2 ? 'وحدتين' : n <= 10 ? n + ' وحدات' : n + ' وحدة'; }
  function headHtml(sm) {
    return '<b>' + unitsTxt(sm.n) + '</b><span class="r2">الإجمالي</span><b dir="ltr">' + money(Math.round(sm.total * 100) / 100) + '</b>' +
      (sm.bad ? '<span class="late" style="margin-inline-start:auto">' + sm.bad + ' محتاجة تتظبط</span>' : '');
  }
  function drawBulk() {
    var sm = bulkSummary(), cnt = {};
    BK.rows.forEach(function (r) { if (!r.err) cnt[r.code] = (cnt[r.code] || 0) + 1; });
    $('bRows').innerHTML = BK.rows.length ? '<div class="card" style="padding:8px 10px">' +
      '<div id="bHead" style="display:flex;gap:10px;align-items:baseline;margin-bottom:6px">' + headHtml(sm) + '</div>' +
      '<table class="sch" style="width:100%">' + BK.rows.map(function (r, i) {
        return '<tr><td style="width:34%"><input class="ltr" data-bc="' + i + '" value="' + esc(r.code) + '" placeholder="كود الوحدة" inputmode="numeric"></td>' +
          '<td style="width:26%"><input class="ltr" data-ba="' + i + '" value="' + (r.amount || '') + '" placeholder="المبلغ" inputmode="decimal"></td>' +
          '<td><div class="r2" data-bt="' + i + '" style="font-size:11.5px;line-height:1.4">' + (r.err === 'فاضي' ? '' : r.err ? '<span class="late">' + esc(r.err) + '</span>' : esc(App.unitTitle(r.unit) || r.code) + (cnt[r.code] > 1 ? ' · <span class="late">مكتوبة مرتين</span>' : '')) + '</div>' +
          '<input data-bn="' + i + '" value="' + esc(r.note || '') + '" placeholder="ملاحظة للوحدة دي (لو فيه)" style="margin-top:3px;padding:3px 6px;font-size:12px"></td>' +
          '<td style="width:24px"><button class="link" data-bx="' + i + '" title="شيل">×</button></td></tr>';
      }).join('') + '</table></div>' : '<div class="r2">لسه مفيش وحدات. الصقهم فوق أو دوس "+ وحدة".</div>';
    // اسم الوحدة بيظهر وإنت بتكتب الكود
    document.querySelectorAll('#bRows input[data-bc]').forEach(function (inp) {
      var i = +inp.dataset.bc, tip = document.querySelector('#bRows [data-bt="' + i + '"]');
      inp.oninput = function () {
        var u = unitOf(digits(inp.value));
        tip.innerHTML = !inp.value.trim() ? '' : u ? '<span class="okc">✓</span> ' + esc(App.unitTitle(u) || u.code) + (u.owner ? ' · ' + esc(u.owner) : '') : S.units.some(function (x) { return x.code.indexOf(digits(inp.value)) === 0; }) ? '<span class="r2">كمّل الكود…</span>' : '<span class="late">مش لاقي الوحدة دي</span>';
      };
      inp.onchange = function () { BK.rows[i].code = inp.value; disarmB(); inp.oninput(); var h = $('bHead'); if (h) h.innerHTML = headHtml(bulkSummary()); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); var a = document.querySelector('#bRows input[data-ba="' + i + '"]'); if (a) a.focus(); } };
    });
    // إنتر بعد المبلغ: سطر جديد والمؤشر على خانة الكود
    document.querySelectorAll('#bRows input[data-ba]').forEach(function (inp) {
      inp.onkeydown = function (e) {
        if (e.key !== 'Enter') return; e.preventDefault();
        var i = +inp.dataset.ba; BK.rows[i].amount = Number(digits(inp.value)) || 0;
        var c = document.querySelector('#bRows input[data-bc="' + i + '"]'); if (c) BK.rows[i].code = c.value;
        if (i === BK.rows.length - 1) BK.rows.push({ code: '', unit: null, amount: 0, note: '', err: '' });
        disarmB(); drawBulk(); var n = document.querySelector('#bRows input[data-bc="' + (i + 1) + '"]'); if (n) n.focus();
      };
    });
    document.querySelectorAll('#bRows input[data-ba]').forEach(function (inp) { inp.oninput = function () { BK.rows[+inp.dataset.ba].amount = Number(digits(inp.value)) || 0; disarmB(); }; inp.onchange = function () { var h = $('bHead'); if (h) h.innerHTML = headHtml(bulkSummary()); }; });
    document.querySelectorAll('#bRows input[data-bn]').forEach(function (inp) { inp.oninput = function () { BK.rows[+inp.dataset.bn].note = inp.value; disarmB(); }; });
    document.querySelectorAll('#bRows button[data-bx]').forEach(function (b) { b.onclick = function () { BK.rows.splice(+b.dataset.bx, 1); disarmB(); drawBulk(); }; });
  }
  function saveBulk() {
    var cat = $('bCat').value, cash = $('bCash').value, date = L.parseISO($('bDate').value), sm = bulkSummary(), errs = [];
    if (!cat) errs.push('اختار البند.');
    if (!date) errs.push('حدد التاريخ.'); else if (date > today()) errs.push('التاريخ مينفعش يكون بعد النهارده.');
    if (F.isForeign(cash)) errs.push('الحركة لأكتر من وحدة بالجنيه بس. للخزينة الأجنبية سجّل كل وحدة لوحدها.');
    if (!sm.n) errs.push('ضيف الوحدات الأول.');
    if (sm.bad) errs.push(unitsTxt(sm.bad) + ' محتاجة تتظبط (اللي بالأحمر).');
    if (errs.length) { drawBulk(); $('bMsg').innerHTML = errs.map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join(''); return; }
    var note = $('bNote').value.trim() || cat;
    var vals = BK.rows.filter(function (r) { return r.err !== 'فاضي'; }).map(function (r) {
      return F.entryValues({ date: date, cash: cash, category: cat, side: BK.side, unitCode: r.code, amount: r.amount, doc: $('bDoc').value, note: r.note ? r.note : note });
    });
    if (!BK.armed) {
      BK.armed = true; $('bSave').textContent = 'تأكيد التسجيل';
      var dupT = F.findDuplicates(S.treasury, vals);
      $('bMsg').innerHTML = (dupT.length ? '<div class="msg err"><b>انتبه:</b> ' + unitsTxt(dupT.length) + ' ليها نفس الحركة متسجلة قبل كده (نفس البند والمبلغ والتاريخ). راجعهم قبل التأكيد.</div>' : '') +
        (sm.dups ? '<div class="msg warn">فيه ' + unitsTxt(sm.dups) + ' مكتوبة مرتين في القايمة.</div>' : '') +
        '<div class="msg warn">هيتسجل ' + unitsTxt(sm.n) + ' بإجمالي ' + money(Math.round(sm.total * 100) / 100) + ' ج ' + (BK.side === 'in' ? 'وارد' : 'منصرف') + ' · ' + esc(cat) + ' · ' + esc(cash) + ' · ' + L.fmt(date) + '. اضغط تأكيد.</div>';
      return;
    }
    var btn = $('bSave'); btn.disabled = true; btn.textContent = 'بيسجل ' + unitsTxt(sm.n) + '…';
    A.writeEntries(vals).then(function (res) {
      vals.forEach(appendTreasury);
      App.closeSheet();
      TR.flash = 'اتسجل ' + cat + ' لـ ' + unitsTxt(vals.length) + ' بإجمالي ' + money(Math.round(sm.total * 100) / 100) + ' في الخزينة (السطور من ' + res.rows[0] + ' لـ ' + res.rows[res.rows.length - 1] + ').';
      TR.check = App.checkHtml(res);
      if (S.tab === 'home' && window.OsoolHome) { OsoolHome.flash(TR.flash, TR.check); TR.flash = ''; TR.check = ''; OsoolHome.render(); }
      else renderTreas();
    }).catch(function (err) { btn.disabled = false; btn.textContent = 'تأكيد التسجيل'; $('bMsg').innerHTML = errHtml(err); });
  }

  // ======================= مقارنة المالك والمستأجر (مقفولة بكود) =======================
  var CM = { key: null, view: 'pair', grp: '', beds: '', sort: 'diff', dir: 'asc' };
  function renderCmp() {
    var box = $('tab-cmp'); if (!box) return;
    if (!App.cmpOn()) { box.innerHTML = '<div class="empty">الشاشة دي مقفولة على الجهاز ده.</div>'; return; }
    box.innerHTML = loadingHtml('بيحسب…');
    ensureSettings().then(function () {
      var keys = Object.keys(S.ownerMonths || {}).sort(F.cmpKey);
      if (!CM.key) { var cur = L.monthKey(today()); CM.key = keys.indexOf(cur) !== -1 ? cur : keys[keys.length - 1]; }
      var opt = function (v, l, sel) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>'; };
      var all = F.compareMonth(S.units, S.renters, S.months, S.ownerMonths, CM.key, S.settings || F.DEFAULT_SETTINGS);
      var grps = F.groupsIn(all.map(function (x) { return x.unit; }));
      var beds = {}; all.forEach(function (x) { beds[x.beds] = 1; });
      box.innerHTML = '<div class="seg" id="cmV"><button data-v="pair"' + (CM.view === 'pair' ? ' class="on"' : '') + '>المالك والمستأجر</button><button data-v="owner"' + (CM.view === 'owner' ? ' class="on"' : '') + '>إيجارات الملاك</button></div>' +
        '<div class="filters"><select id="cmK">' + keys.map(function (k) { return opt(k, L.monthLabel(k), CM.key); }).join('') + '</select>' +
        '<select id="cmG">' + opt('', 'كل الأماكن', CM.grp) + grps.map(function (g) { return opt(g, GRP_AR[g] || g, CM.grp); }).join('') + '</select></div>' +
        '<div class="filters"><select id="cmB">' + opt('', 'كل الغرف', CM.beds) + Object.keys(beds).sort(function (a, b) { return a - b; }).map(function (b) { return opt(b, b === '0' ? 'غرف مش متسجلة' : b + ' غرف', CM.beds); }).join('') + '</select>' +
        '<select id="cmS">' + (CM.view === 'pair' ? [['diff', 'الفرق'], ['pct', 'النسبة'], ['tenant', 'إيجار المستأجر'], ['owner', 'إيجار المالك'], ['beds', 'عدد الغرف']] : [['owner', 'إيجار المالك'], ['beds', 'عدد الغرف']]).map(function (x) { return opt(x[0], 'ترتيب: ' + x[1], CM.sort); }).join('') + '</select>' +
        '<button class="btn ghost" id="cmD" style="flex:0 0 auto;padding:6px 12px" title="اقلب الترتيب">' + (CM.dir === 'asc' ? '↑ تصاعدي' : '↓ تنازلي') + '</button></div>' +
        '<div id="cmSum"></div>' + exportBar('cmExp') + '<div id="cmList"></div>' +
        '<div style="text-align:center;margin:14px 0"><button class="link" id="cmLock" style="color:var(--muted);font-size:12px">اقفل الشاشة دي على الجهاز ده</button></div>';
      document.querySelectorAll('#cmV button').forEach(function (b) { b.onclick = function () { CM.view = b.dataset.v; if (CM.view === 'owner' && ['diff', 'pct', 'tenant'].indexOf(CM.sort) !== -1) CM.sort = 'owner'; renderCmp(); }; });
      $('cmK').onchange = function () { CM.key = this.value; renderCmp(); };
      $('cmG').onchange = function () { CM.grp = this.value; drawCmp(all); };
      $('cmB').onchange = function () { CM.beds = this.value; drawCmp(all); };
      $('cmS').onchange = function () { CM.sort = this.value; drawCmp(all); };
      $('cmD').onclick = function () { CM.dir = CM.dir === 'asc' ? 'desc' : 'asc'; this.textContent = CM.dir === 'asc' ? '↑ تصاعدي' : '↓ تنازلي'; drawCmp(all); };
      $('cmLock').onclick = function () { App.cmpLock(); };
      bindExport('cmExp', function () {
        var l = S.cmpView || [], lbl = fileName(CM.view === 'pair' ? 'مقارنة المالك والمستأجر' : 'إيجارات الملاك', CM.grp ? grpName([CM.grp]) : scopeName(), L.monthLabel(CM.key));
        if (CM.view === 'pair') return { name: fileName(lbl, fdate()), title: lbl, sheet: 'المقارنة', sub: CM.beds ? CM.beds + ' غرف' : '', sums: [5, 6, 7],
          kinds: ['text', 'text', 'text', 'text', 'num', 'money', 'money', 'money', 'text', 'text'],
          headers: ['المكان', 'الوحدة', 'كود', 'المالك', 'غرف', 'إيجار المستأجر', 'إيجار المالك', 'الفرق', 'النسبة', 'ملاحظة'],
          rows: l.map(function (x) { return [GRP_AR[x.group] || x.group, App.unitTitle(x.unit), x.unit.code, x.unit.owner || '', x.beds || '', x.tenant, x.owner, x.diff, x.pct === null ? '' : Math.round(x.pct * 100) + '%', (x.assumed ? 'المالك مفترض من آخر شهر' : '') + (!x.tenant ? (x.assumed ? ' · ' : '') + 'مفيش مستأجر' : '')]; }) };
        return { name: fileName(lbl, fdate()), title: lbl, sheet: 'إيجارات الملاك', sub: '', sums: [5],
          kinds: ['text', 'text', 'text', 'text', 'num', 'money', 'text'], headers: ['المكان', 'الوحدة', 'كود', 'المالك', 'غرف', 'إيجار المالك', 'ملاحظة'],
          rows: l.filter(function (x) { return x.owner; }).map(function (x) { return [GRP_AR[x.group] || x.group, App.unitTitle(x.unit), x.unit.code, x.unit.owner || '', x.beds || '', x.owner, x.assumed ? 'مفترض من آخر شهر' : '']; }) };
      });
      drawCmp(all);
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function drawCmp(all) {
    var l = all.filter(function (x) { return (!CM.grp || x.group === CM.grp) && (CM.beds === '' || String(x.beds) === CM.beds) && (CM.view === 'pair' || x.owner); });
    var val = function (x) { return CM.sort === 'pct' ? (x.pct === null ? -Infinity : x.pct) : x[CM.sort] || 0; };
    l.sort(function (a, b) { var d = val(a) - val(b); if (!d) d = a.diff - b.diff; return CM.dir === 'asc' ? d : -d; });
    S.cmpView = l;
    var T = 0, O = 0; l.forEach(function (x) { T += x.tenant; O += x.owner; });
    var pctTxt = function (p) { return p === null || !isFinite(p) ? '—' : (p > 0 ? '+' : '') + Math.round(p * 100) + '%'; };
    if (CM.view === 'pair') {
      var neg = l.filter(function (x) { return x.diff < 0; }).length, empty = l.filter(function (x) { return !x.tenant; }).length;
      $('cmSum').innerHTML = '<div class="sum"><div class="box"><div class="v okc">' + money(T) + '</div><div class="k">مستحق المستأجرين</div></div><div class="box"><div class="v late">' + money(O) + '</div><div class="k">مستحق الملاك</div></div>' +
        '<div class="box"><div class="v ' + (T - O < 0 ? 'late' : 'okc') + '">' + money(T - O) + '</div><div class="k">الفرق · <span dir="ltr">' + pctTxt(O ? (T - O) / O : null) + '</span></div></div><div class="box"><div class="v">' + l.length + '</div><div class="k">' + neg + ' بخسارة · ' + empty + ' من غير مستأجر</div></div></div>';
      $('cmList').innerHTML = l.length ? '<div class="card" style="padding:4px 10px">' + l.map(function (x) {
        return '<div class="cmrow"><div class="t"><b>' + esc(App.unitTitle(x.unit) || x.unit.code) + '</b><i>' + esc(x.unit.code) + (x.beds ? ' · ' + x.beds + ' غرف' : '') + (x.unit.owner ? ' · ' + esc(x.unit.owner) : '') + '</i></div>' +
          '<div class="nums"><span class="okc">' + (x.tenant ? money(x.tenant) : '<span class="r2">مفيش مستأجر</span>') + '</span><span class="late">' + money(x.owner) + (x.assumed ? '<sup title="مفترض من آخر شهر">*</sup>' : '') + '</span>' +
          '<b class="' + (x.diff < 0 ? 'late' : 'okc') + '">' + money(x.diff) + ' <small>' + pctTxt(x.pct) + '</small></b></div></div>';
      }).join('') + '</div><div class="r2" style="margin-top:6px">الأخضر مستحق المستأجر، والأحمر مستحق المالك. * يعني مفترض من آخر شهر متسجل.</div>' : '<div class="empty">مفيش وحدات.</div>';
    } else {
      var bb = F.ownerByBeds(l);
      $('cmSum').innerHTML = '<div class="card" style="padding:8px 10px"><table class="mt"><tr><th>الغرف</th><th class="n">وحدات</th><th class="n">المتوسط</th><th class="n">أقل</th><th class="n">أعلى</th></tr>' +
        bb.map(function (a) { return '<tr><td>' + (a.beds ? a.beds + ' غرف' : 'مش متسجل') + '</td><td class="n">' + a.n + '</td><td class="n"><b>' + money(a.avg) + '</b></td><td class="n">' + money(a.min) + '</td><td class="n">' + money(a.max) + '</td></tr>'; }).join('') +
        '<tr><td><b>الكل</b></td><td class="n">' + l.length + '</td><td class="n"><b>' + money(l.length ? Math.round(O / l.length) : 0) + '</b></td><td></td><td></td></tr></table></div>';
      var avg = {}; bb.forEach(function (a) { avg[a.beds] = a.avg; });
      $('cmList').innerHTML = l.length ? '<div class="card" style="padding:4px 10px">' + l.map(function (x) {
        var a = avg[x.beds || 0], d = a ? (x.owner - a) / a : null;
        return '<div class="cmrow"><div class="t"><b>' + esc(App.unitTitle(x.unit) || x.unit.code) + '</b><i>' + esc(x.unit.code) + (x.beds ? ' · ' + x.beds + ' غرف' : '') + (x.unit.owner ? ' · ' + esc(x.unit.owner) : '') + '</i></div>' +
          '<div class="nums"><b>' + money(x.owner) + (x.assumed ? '<sup>*</sup>' : '') + '</b><small class="' + (d > 0.15 ? 'late' : d < -0.15 ? 'okc' : 'r2') + '">' + (d === null ? '' : pctTxt(d) + ' عن متوسط ' + (x.beds || '؟') + ' غرف') + '</small></div></div>';
      }).join('') + '</div>' : '<div class="empty">مفيش وحدات.</div>';
    }
  }

  // ======================= ربحية الوحدة (مخفي) =======================
  var PF = { k1: null, k2: null, grp: '', proj: '', beds: '', sort: 'net', dir: 'asc', open: '' };
  function pfSkip() { try { var v = JSON.parse(localStorage.getItem('osoolPanel.profSkip2') || 'null'); if (v && v.length) return v; } catch (e) { } return F.PROFIT_SKIP.slice(); }
  function pfSetSkip(v) { try { localStorage.setItem('osoolPanel.profSkip2', JSON.stringify(v)); } catch (e) { } }
  function renderProf() {
    var box = $('tab-prof'); if (!box) return;
    if (!App.cmpOn()) { box.innerHTML = '<div class="empty">الشاشة دي مقفولة على الجهاز ده.</div>'; return; }
    box.innerHTML = loadingHtml('بيقرا الخزينة…');
    ensureSettings().then(ensureTreasury).then(function () {
      var keys = Object.keys(S.ownerMonths || {}).sort(F.cmpKey), t = today(), cur = L.monthKey(t), last = L.monthKey(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)));
      if (!PF.k1) { PF.k2 = keys.indexOf(last) !== -1 ? last : keys[keys.length - 1]; var y = 'Jan-' + PF.k2.slice(-2); PF.k1 = keys.indexOf(y) !== -1 ? y : keys[0]; }
      var st = S.settings || F.DEFAULT_SETTINGS, base = S.units.filter(function (u) { return F.inScope(u, st); }), grps = F.groupsIn(base), projs = {}, beds = {};
      base.forEach(function (u) { if (u.project) projs[u.project] = 1; beds[Number(u.bedrooms) || 0] = 1; });
      var opt = function (v, l, sel) { return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(l) + '</option>'; };
      box.innerHTML = '<div class="filters"><select id="pfK1">' + keys.map(function (k) { return opt(k, 'من ' + L.monthLabel(k), PF.k1); }).join('') + '</select><select id="pfK2">' + keys.map(function (k) { return opt(k, 'لـ ' + L.monthLabel(k), PF.k2); }).join('') + '</select></div>' +
        '<div class="filters"><select id="pfG">' + opt('', 'كل الأماكن', PF.grp) + grps.map(function (g) { return opt(g, GRP_AR[g] || g, PF.grp); }).join('') + '</select><select id="pfP">' + opt('', 'كل المشاريع', PF.proj) + Object.keys(projs).sort().map(function (p) { return opt(p, p, PF.proj); }).join('') + '</select></div>' +
        '<div class="filters"><select id="pfB">' + opt('', 'كل الغرف', PF.beds) + Object.keys(beds).sort(function (a, b) { return a - b; }).map(function (b) { return opt(b, b === '0' ? 'غرف مش متسجلة' : b + ' غرف', PF.beds); }).join('') + '</select>' +
        '<button class="btn ghost" id="pfCats" style="flex:1">البنود المحسوبة</button></div><div id="pfOut"></div>';
      var re = function () { drawProf(); };
      $('pfK1').onchange = function () { PF.k1 = this.value; re(); }; $('pfK2').onchange = function () { PF.k2 = this.value; re(); };
      $('pfG').onchange = function () { PF.grp = this.value; re(); }; $('pfP').onchange = function () { PF.proj = this.value; re(); }; $('pfB').onchange = function () { PF.beds = this.value; re(); };
      $('pfCats').onclick = openProfCats;
      drawProf();
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function drawProf() {
    var out = $('pfOut'); if (!out) return;
    if (F.cmpKey(PF.k1, PF.k2) > 0) { out.innerHTML = '<div class="msg err">شهر البداية بعد شهر النهاية.</div>'; return; }
    var st = S.settings || F.DEFAULT_SETTINGS, res = F.unitProfit(S.units, S.renters, S.months, S.ownerMonths, S.treasury, PF.k1, PF.k2, st, pfSkip());
    S.pfCatsSeen = res.cats;
    var rows = res.rows.filter(function (x) { return (!PF.grp || x.group === PF.grp) && (!PF.proj || x.unit.project === PF.proj) && (PF.beds === '' || String(x.beds) === PF.beds); });
    var val = function (x) { return PF.sort === 'margin' ? (x.margin === null ? -Infinity : x.margin) : x[PF.sort] || 0; };
    rows.sort(function (a, b) { var d = val(a) - val(b); return PF.dir === 'asc' ? d : -d; });
    S.pfView = rows;
    var T = { rev: 0, owner: 0, exp: 0, net: 0 }, cats = {};
    rows.forEach(function (x) { T.rev += x.rev; T.owner += x.owner; T.exp += x.exp; T.net += x.net; Object.keys(x.cats).forEach(function (k) { cats[k] = (cats[k] || 0) + x.cats[k]; }); });
    var pc = function (p) { return p === null || !isFinite(p) ? '—' : Math.round(p * 1000) / 10 + '%'; };
    var losing = rows.filter(function (x) { return x.net < 0; }).length;
    var topCats = Object.keys(cats).sort(function (a, b) { return Math.abs(cats[b]) - Math.abs(cats[a]); });
    out.innerHTML = '<div class="sum"><div class="box"><div class="v okc">' + money(T.rev) + '</div><div class="k">إيجار المستأجرين</div></div><div class="box"><div class="v late">' + money(T.owner) + '</div><div class="k">إيجار الملاك</div></div>' +
      '<div class="box"><div class="v late">' + money(T.exp) + '</div><div class="k">مصاريف الوحدات</div></div><div class="box"><div class="v ' + (T.net < 0 ? 'late' : 'okc') + '">' + money(T.net) + '</div><div class="k">صافي الربح · <span dir="ltr">' + pc(T.rev ? T.net / T.rev : null) + '</span></div></div></div>' +
      '<div class="r2" style="margin:-2px 0 8px">' + rows.length + ' وحدة · ' + losing + ' بخسارة · من ' + L.monthLabel(PF.k1) + ' لـ ' + L.monthLabel(PF.k2) + '. الإيجار مستحق من الجداول، والمصاريف من الخزينة على كود الوحدة.</div>' +
      (topCats.length ? '<div class="card" style="padding:8px 10px"><h3 style="margin:0 0 4px">المصاريف حسب البند</h3><table class="mt">' + topCats.slice(0, 12).map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="n ' + (cats[k] < 0 ? 'okc' : '') + '">' + money(Math.round(cats[k])) + '</td><td class="n r2">' + pc(T.exp ? cats[k] / T.exp : null) + '</td></tr>'; }).join('') + (topCats.length > 12 ? '<tr><td colspan="3" class="r2">و' + (topCats.length - 12) + ' بنود تانية</td></tr>' : '') + '</table></div>' : '') +
      '<div class="filters" style="margin-top:8px"><select id="pfSo">' + [['net', 'ترتيب: صافي الربح'], ['margin', 'ترتيب: الهامش %'], ['rev', 'ترتيب: إيجار المستأجر'], ['owner', 'ترتيب: إيجار المالك'], ['exp', 'ترتيب: المصاريف'], ['beds', 'ترتيب: الغرف']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === PF.sort ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<button class="btn ghost" id="pfD" style="flex:0 0 auto;padding:6px 12px">' + (PF.dir === 'asc' ? '↑ تصاعدي' : '↓ تنازلي') + '</button></div>' + exportBar('pfExp') +
      (rows.length ? '<div class="card" style="padding:4px 10px" id="pfList">' + rows.map(function (x, i) {
        var open = PF.open === x.unit.code, ck = Object.keys(x.cats).sort(function (a, b) { return Math.abs(x.cats[b]) - Math.abs(x.cats[a]); });
        return '<div class="cmrow" data-pf="' + esc(x.unit.code) + '" style="cursor:pointer;flex-wrap:wrap"><div class="t"><b>' + esc(App.unitTitle(x.unit) || x.unit.code) + '</b><i>' + esc(x.unit.code) + (x.beds ? ' · ' + x.beds + ' غرف' : '') + ' · مستأجر ' + money(x.rev) + ' · مالك ' + money(x.owner) + ' · مصاريف ' + money(x.exp) + (x.assumed ? ' · المالك مفترض في ' + x.assumed + ' شهر' : '') + '</i></div>' +
          '<div class="nums"><b class="' + (x.net < 0 ? 'late' : 'okc') + '">' + money(x.net) + '</b><small>' + pc(x.margin) + '</small></div>' +
          (open ? '<div style="flex-basis:100%;margin-top:6px"><table class="mt">' + (ck.length ? ck.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="n">' + money(Math.round(x.cats[k])) + '</td></tr>'; }).join('') : '<tr><td class="r2">مفيش مصاريف متسجلة على الوحدة في الفترة دي.</td></tr>') + '</table></div>' : '') + '</div>';
      }).join('') + '</div>' : '<div class="empty">مفيش وحدات.</div>');
    $('pfSo').onchange = function () { PF.sort = this.value; drawProf(); };
    $('pfD').onclick = function () { PF.dir = PF.dir === 'asc' ? 'desc' : 'asc'; drawProf(); };
    if ($('pfList')) $('pfList').onclick = function (e) { var r = e.target.closest('[data-pf]'); if (!r) return; PF.open = PF.open === r.dataset.pf ? '' : r.dataset.pf; drawProf(); };
    bindExport('pfExp', function () {
      var l = S.pfView || [], cs = {}; l.forEach(function (x) { Object.keys(x.cats).forEach(function (k) { cs[k] = (cs[k] || 0) + Math.abs(x.cats[k]); }); });
      var ck = Object.keys(cs).sort(function (a, b) { return cs[b] - cs[a]; });
      var ttl = fileName('ربحية الوحدات', PF.grp ? grpName([PF.grp]) : scopeName(), PF.proj, PF.beds ? PF.beds + ' غرف' : '', L.monthLabel(PF.k1) + ' لـ ' + L.monthLabel(PF.k2));
      return { name: fileName(ttl, fdate()), title: ttl, sheet: 'الربحية', sub: 'الإيجار مستحق من الجداول، والمصاريف من الخزينة على كود الوحدة', sums: [5, 6, 7, 8].concat(ck.map(function (_, i) { return 10 + i; })),
        kinds: ['text', 'text', 'text', 'text', 'num', 'money', 'money', 'money', 'money', 'text'].concat(ck.map(function () { return 'money'; })),
        headers: ['المكان', 'المشروع', 'الوحدة', 'كود', 'غرف', 'إيجار المستأجر', 'إيجار المالك', 'المصاريف', 'صافي الربح', 'الهامش'].concat(ck),
        rows: l.map(function (x) { return [GRP_AR[x.group] || x.group, x.unit.project, App.unitTitle(x.unit), x.unit.code, x.beds || '', x.rev, x.owner, x.exp, x.net, pc(x.margin)].concat(ck.map(function (k) { return x.cats[k] ? Math.round(x.cats[k]) : ''; })); }) };
    });
  }
  function openProfCats() {
    var seen = S.pfCatsSeen || {}, skip = pfSkip(), all = {};
    Object.keys(seen).forEach(function (k) { all[k] = 1; }); skip.forEach(function (k) { if (k) all[k] = 1; });
    var ks = Object.keys(all).filter(function (k) { return k; }).sort();
    App.openSheet('<h2>البنود المحسوبة في المصاريف</h2><div class="r2" style="margin:-4px 0 8px">علّم على البنود اللي تتحسب مصروف أو إيراد على الوحدة. اللي مش متعلم عليه (زي حركة الإيجار والتأمين والجاري) مش بيدخل الحساب.</div>' +
      '<div class="card" style="padding:6px 10px;max-height:52vh;overflow:auto">' + ks.map(function (k) { return '<label style="display:flex;gap:8px;align-items:center;padding:5px 0;border-top:1px solid #f0e9da"><input type="checkbox" data-pc="' + esc(k) + '"' + (skip.indexOf(k) === -1 ? ' checked' : '') + ' style="width:auto"> ' + esc(k) + '<span class="r2" style="margin-inline-start:auto">' + (seen[k] || 0) + ' حركة</span></label>'; }).join('') + '</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn ghost" id="pcReset">الافتراضي</button><button class="btn primary" id="pcSave">حفظ</button></div>');
    $('pcReset').onclick = function () { try { localStorage.removeItem('osoolPanel.profSkip2'); } catch (e) { } App.closeSheet(); drawProf(); };
    $('pcSave').onclick = function () { var sk = ['']; document.querySelectorAll('#sheet input[data-pc]').forEach(function (c) { if (!c.checked) sk.push(c.dataset.pc); }); pfSetSkip(sk); App.closeSheet(); drawProf(); };
  }

  // ======================= الإشغال (مخفي) =======================
  var OCC = { from: null, to: null, grp: '', proj: '', beds: '', set: '', sort: 'pct', dir: 'asc' };
  function occPreset(k) {
    var t = today(), y = t.getUTCFullYear(), m = t.getUTCMonth(), D = function (a, b, c) { return new Date(Date.UTC(a, b, c)); };
    return k === 'm0' ? [D(y, m, 1), t] : k === 'm1' ? [D(y, m - 1, 1), D(y, m, 0)] : k === 'm3' ? [D(y, m - 3, 1), D(y, m, 0)] : k === 'y0' ? [D(y, 0, 1), t] : [D(y - 1, 0, 1), D(y - 1, 11, 31)];
  }
  function renderOcc() {
    var box = $('tab-occ'); if (!box) return;
    if (!App.cmpOn()) { box.innerHTML = '<div class="empty">الشاشة دي مقفولة على الجهاز ده.</div>'; return; }
    if (!OCC.from) { var p0 = occPreset('m1'); OCC.from = p0[0]; OCC.to = p0[1]; }
    ensureSettings().then(function () {
      var st = S.settings || F.DEFAULT_SETTINGS, base = S.units.filter(function (u) { return F.inScope(u, st) && String(u.settle || '').toUpperCase() !== 'OUT'; });
      var grps = F.groupsIn(base), projs = {}, beds = {}, sets = {};
      base.forEach(function (u) { if (u.project) projs[u.project] = 1; beds[Number(u.bedrooms) || 0] = 1; sets[u.settle || ''] = 1; });
      var opt = function (v, l, sel) { return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(l) + '</option>'; };
      box.innerHTML = '<div class="card" style="padding:10px"><div class="grid2"><div><label>من</label><input type="date" id="ocF" value="' + L.toISO(OCC.from) + '"></div><div><label>إلى</label><input type="date" id="ocT" value="' + L.toISO(OCC.to) + '"></div></div>' +
        '<div class="tgs" id="ocPre" style="margin-top:6px">' + [['m0', 'الشهر ده'], ['m1', 'الشهر اللي فات'], ['m3', 'آخر ٣ شهور'], ['y0', 'السنة دي'], ['y1', 'السنة اللي فاتت']].map(function (x) { return '<button class="tg" data-p="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
        '<div class="filters"><select id="ocG">' + opt('', 'كل الأماكن', OCC.grp) + grps.map(function (g) { return opt(g, GRP_AR[g] || g, OCC.grp); }).join('') + '</select>' +
        '<select id="ocPj">' + opt('', 'كل المشاريع', OCC.proj) + Object.keys(projs).sort().map(function (p) { return opt(p, p, OCC.proj); }).join('') + '</select></div>' +
        '<div class="filters"><select id="ocB">' + opt('', 'كل الغرف', OCC.beds) + Object.keys(beds).sort(function (a, b) { return a - b; }).map(function (b) { return opt(b, b === '0' ? 'غرف مش متسجلة' : b + ' غرف', OCC.beds); }).join('') + '</select>' +
        '<select id="ocS">' + opt('', 'كل التسويات', OCC.set) + Object.keys(sets).sort().map(function (x) { return opt(x || '__none', x || 'بدون', OCC.set); }).join('') + '</select></div>' +
        '<div id="ocOut"></div>';
      var go = function () { OCC.from = L.parseISO($('ocF').value) || OCC.from; OCC.to = L.parseISO($('ocT').value) || OCC.to; drawOcc(base); };
      $('ocF').onchange = go; $('ocT').onchange = go;
      document.querySelectorAll('#ocPre .tg').forEach(function (b) { b.onclick = function () { var p1 = occPreset(b.dataset.p); $('ocF').value = L.toISO(p1[0]); $('ocT').value = L.toISO(p1[1]); go(); }; });
      $('ocG').onchange = function () { OCC.grp = this.value; drawOcc(base); }; $('ocPj').onchange = function () { OCC.proj = this.value; drawOcc(base); };
      $('ocB').onchange = function () { OCC.beds = this.value; drawOcc(base); }; $('ocS').onchange = function () { OCC.set = this.value; drawOcc(base); };
      drawOcc(base);
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  function drawOcc(base) {
    var out = $('ocOut'); if (!out) return;
    if (!OCC.from || !OCC.to || OCC.to < OCC.from) { out.innerHTML = '<div class="msg err">الفترة مش مظبوطة.</div>'; return; }
    var st = S.settings || F.DEFAULT_SETTINGS;
    var keep = function (u) { return (!OCC.grp || F.groupOf(u.project) === OCC.grp) && (!OCC.proj || u.project === OCC.proj) && (OCC.beds === '' || String(Number(u.bedrooms) || 0) === OCC.beds) && (!OCC.set || (OCC.set === '__none' ? !u.settle : u.settle === OCC.set)); };
    var units = base.filter(keep);
    var rows = F.occupancy(units, S.renters, OCC.from, OCC.to, st), sm = F.occSum(rows);
    var pc = function (x) { return Math.round(x * 1000) / 10 + '%'; };
    var bar = function (x) { return '<span class="ocbar"><i style="width:' + Math.round(x * 100) + '%"></i></span>'; };
    var groupBy = function (key, label) {
      var g = {}; rows.forEach(function (x) { var k = key(x); (g[k] = g[k] || []).push(x); });
      var ks = Object.keys(g); if (ks.length < 2) return '';
      return '<div class="card" style="padding:8px 10px"><h3 style="margin:0 0 4px">' + label + '</h3><table class="mt">' + ks.sort().map(function (k) { var s2 = F.occSum(g[k]); return '<tr><td>' + esc(k) + '</td><td class="n">' + s2.units + ' وحدة</td><td style="width:38%">' + bar(s2.pct) + '</td><td class="n"><b>' + pc(s2.pct) + '</b></td></tr>'; }).join('') + '</table></div>';
    };
    // الشهور جوه الفترة
    var months = [], m0 = new Date(Date.UTC(OCC.from.getUTCFullYear(), OCC.from.getUTCMonth(), 1));
    while (m0 <= OCC.to && months.length < 36) { var a = m0 < OCC.from ? OCC.from : m0, e = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 0)); if (e > OCC.to) e = OCC.to; months.push([L.monthKey(m0), a, e]); m0 = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 1)); }
    var monthHtml = months.length > 1 ? '<div class="card" style="padding:8px 10px"><h3 style="margin:0 0 4px">شهر بشهر</h3><table class="mt">' + months.map(function (mm) { var s3 = F.occSum(F.occupancy(units, S.renters, mm[1], mm[2], st)); return '<tr><td>' + L.monthLabel(mm[0]) + '</td><td style="width:45%">' + bar(s3.pct) + '</td><td class="n" style="white-space:nowrap"><b>' + pc(s3.pct) + '</b><div class="r2" dir="rtl" style="font-size:11px">' + money(s3.idle) + ' يوم فاضي</div></td></tr>'; }).join('') + '</table></div>' : '';
    var val = function (x) { return OCC.sort === 'pct' ? x.pct : OCC.sort === 'idle' ? x.idle : OCC.sort === 'beds' ? x.beds : x.contracts; };
    rows.sort(function (a, b) { var d = val(a) - val(b) || a.pct - b.pct; return OCC.dir === 'asc' ? d : -d; });
    S.occView = rows;
    out.innerHTML = '<div class="sum"><div class="box"><div class="v">' + pc(sm.pct) + '</div><div class="k">نسبة الإشغال</div></div><div class="box"><div class="v">' + sm.units + '</div><div class="k">وحدة</div></div>' +
      '<div class="box"><div class="v okc">' + money(sm.occ) + '</div><div class="k">يوم مشغول</div></div><div class="box"><div class="v late">' + money(sm.idle) + '</div><div class="k">يوم فاضي</div></div></div>' +
      '<div class="r2" style="margin:-2px 0 8px">من ' + L.fmt(OCC.from) + ' لـ ' + L.fmt(OCC.to) + ' · الأيام المتاحة بتبدأ من بداية عقد المالك وبتخلص بنهايته، ومن غير فترات خارج التشغيل.</div>' +
      monthHtml + groupBy(function (x) { return GRP_AR[x.group] || x.group; }, 'حسب المكان') + groupBy(function (x) { return x.unit.project || '—'; }, 'حسب المشروع') + groupBy(function (x) { return x.beds ? x.beds + ' غرف' : 'غرف مش متسجلة'; }, 'حسب عدد الغرف') +
      '<div class="filters" style="margin-top:8px"><select id="ocSo">' + [['pct', 'ترتيب: الإشغال'], ['idle', 'ترتيب: الأيام الفاضية'], ['beds', 'ترتيب: عدد الغرف'], ['contracts', 'ترتيب: عدد العقود']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === OCC.sort ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' +
      '<button class="btn ghost" id="ocD" style="flex:0 0 auto;padding:6px 12px">' + (OCC.dir === 'asc' ? '↑ تصاعدي' : '↓ تنازلي') + '</button></div>' + exportBar('ocExp') +
      (rows.length ? '<div class="card" style="padding:4px 10px">' + rows.map(function (x) {
        return '<div class="cmrow"><div class="t"><b>' + esc(App.unitTitle(x.unit) || x.unit.code) + '</b><i>' + esc(x.unit.code) + (x.beds ? ' · ' + x.beds + ' غرف' : '') + ' · ' + x.contracts + ' عقد</i>' + bar(x.pct) + '</div>' +
          '<div class="nums"><b class="' + (x.pct < 0.5 ? 'late' : x.pct >= 0.9 ? 'okc' : '') + '">' + pc(x.pct) + '</b><small class="r2" dir="rtl">' + x.idle + ' يوم فاضي من ' + x.avail + '</small></div></div>';
      }).join('') + '</div>' : '<div class="empty">مفيش وحدات بالفلاتر دي.</div>');
    $('ocSo').onchange = function () { OCC.sort = this.value; drawOcc(base); };
    $('ocD').onclick = function () { OCC.dir = OCC.dir === 'asc' ? 'desc' : 'asc'; drawOcc(base); };
    bindExport('ocExp', function () {
      var l = S.occView || [], lbl = fileName('الإشغال', OCC.grp ? grpName([OCC.grp]) : scopeName(), OCC.proj, OCC.beds ? OCC.beds + ' غرف' : '', 'من ' + fdate(OCC.from), 'لـ ' + fdate(OCC.to));
      return { name: lbl, title: fileName('الإشغال', OCC.grp ? grpName([OCC.grp]) : scopeName(), OCC.proj, OCC.beds ? OCC.beds + ' غرف' : ''), sheet: 'الإشغال', sub: 'من ' + L.fmt(OCC.from) + ' لـ ' + L.fmt(OCC.to) + ' · الإجمالي ' + pc(sm.pct), sums: [5, 6, 7],
        kinds: ['text', 'text', 'text', 'text', 'num', 'num', 'num', 'num', 'text', 'num'], headers: ['المكان', 'المشروع', 'الوحدة', 'كود', 'غرف', 'أيام متاحة', 'أيام مشغولة', 'أيام فاضية', 'الإشغال', 'عدد العقود'],
        rows: l.map(function (x) { return [GRP_AR[x.group] || x.group, x.unit.project, App.unitTitle(x.unit), x.unit.code, x.beds || '', x.avail, x.occ, x.idle, pc(x.pct), x.contracts]; }) };
    });
  }

  // ======================= تأمينات لسه مترجعتش =======================
  var DP = { b: '' };
  var DP_B = [['', 'الكل'], ['m1', 'أقل من شهر'], ['m3', '١ لـ ٣ شهور'], ['y1', '٣ لـ ١٢ شهر'], ['old', 'أكتر من سنة']];
  function dpIn(x, b) { return !b || (b === 'm1' ? x.days < 30 : b === 'm3' ? x.days >= 30 && x.days < 90 : b === 'y1' ? x.days >= 90 && x.days < 365 : x.days >= 365); }
  function openDeposits() {
    var all = F.heldDeposits(S.units, S.renters, S.ledger || {}, S.settings || F.DEFAULT_SETTINGS, today());
    App.openSheet('<h2>تأمينات لسه مترجعتش</h2><div class="r2" style="margin:-4px 0 8px">عقود خلصت، وصافي التأمين (المحصل ناقص المردود) لسه موجود في الخزينة.</div>' +
      '<div class="tgs" id="dpB">' + DP_B.map(function (b) { return '<button class="tg' + (DP.b === b[0] ? ' on' : '') + '" data-b="' + b[0] + '">' + b[1] + ' (' + all.filter(function (x) { return dpIn(x, b[0]); }).length + ')</button>'; }).join('') + '</div>' +
      '<div id="dpSum" style="margin:8px 0"></div>' + exportBar('dpExp') + '<div id="dpList"></div>' +
      '<button class="btn ghost" id="dpX" style="width:100%;margin-top:8px">رجوع</button>');
    var draw = function () {
      var l = all.filter(function (x) { return dpIn(x, DP.b); }); S.dpView = l;
      var byCash = {}; l.forEach(function (x) { x.list.forEach(function (d) { var c = byCash[d.cash] || (byCash[d.cash] = { egp: 0, fx: 0 }); c.egp += d.egp; c.fx += d.fx; }); });
      $('dpSum').innerHTML = '<div class="card" style="padding:8px 10px"><b>' + l.length + ' مستأجر · ' + money(l.reduce(function (a, x) { return a + x.total; }, 0)) + ' ج</b>' +
        Object.keys(byCash).map(function (c) { return '<div class="r2">' + esc(c) + ': ' + money(byCash[c].egp) + ' ج' + (byCash[c].fx ? ' (' + money(byCash[c].fx) + ' بالعملة)' : '') + '</div>'; }).join('') + '</div>';
      $('dpList').innerHTML = l.length ? l.map(function (x, i) {
        return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(x.r.name || '—') + '</div><div class="r2" dir="ltr" style="text-align:right">' + esc(x.r.code) + '</div></div>' +
          '<span class="badge ' + (x.days >= 365 ? 'done' : x.days >= 90 ? 'book' : 'live') + '">من ' + x.days + ' يوم</span></div>' +
          '<dl class="kv"><dt>الوحدة</dt><dd>' + esc(x.unit ? App.unitTitle(x.unit) : x.r.unit) + '</dd><dt>العقد خلص</dt><dd>' + L.fmt(x.r.end) + (x.received ? ' · اتستلمت' : ' · <span class="late">لسه متستلمتش</span>') + '</dd>' +
          '<dt>التأمين</dt><dd>' + x.list.map(function (d) { return money(d.egp) + ' ج' + (d.fx ? ' (' + money(d.fx) + ' بالعملة)' : '') + ' في ' + esc(d.cash); }).join('<br>') + '</dd></dl>' +
          '<div style="display:flex;gap:14px;margin-top:6px"><button class="link" data-dpr="' + i + '">تسجيل رد التأمين</button><button class="link" data-dps="' + i + '">كشف حساب</button></div></div>';
      }).join('') : '<div class="empty">مفيش.</div>';
      $('dpList').onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.dpr !== undefined) { var x = l[+b.dataset.dpr], d = x.list[0]; App.closeSheet(); setTimeout(function () { openEntry({ cat: F.CAT.depBack, unit: x.unit, tenant: x.r.code, amount: d.fx && F.isForeign(d.cash) ? '' : d.egp, cash: d.cash }); }, 50); }
        else if (b.dataset.dps !== undefined) { var y = l[+b.dataset.dps]; openStatement('tenant', y.r.idx); }
      };
    };
    document.querySelectorAll('#dpB .tg').forEach(function (b) { b.onclick = function () { DP.b = b.dataset.b; document.querySelectorAll('#dpB .tg').forEach(function (z) { z.classList.toggle('on', z === b); }); draw(); }; });
    $('dpX').onclick = App.closeSheet;
    bindExport('dpExp', function () {
      var l = S.dpView || [], b = DP_B.filter(function (x) { return x[0] === DP.b; })[0][1], ttl = fileName('تأمينات لسه مترجعتش', scopeName(), DP.b ? b : '');
      var rows = []; l.forEach(function (x) { x.list.forEach(function (d) { rows.push([x.r.name || '', x.r.code, x.unit ? App.unitTitle(x.unit) : x.r.unit, x.r.end, x.days, x.received ? 'اتستلمت' : 'لسه', d.cash, d.egp, d.fx || '']); }); });
      return { name: fileName(ttl, fdate()), title: ttl, sheet: 'التأمينات', sub: '', sums: [7, 8], kinds: ['text', 'text', 'text', 'date', 'num', 'text', 'text', 'money', 'money'],
        headers: ['المستأجر', 'الكود', 'الوحدة', 'نهاية العقد', 'أيام من الخروج', 'الاستلام', 'الخزينة', 'التأمين بالجنيه', 'بالعملة'], rows: rows };
    });
    draw();
  }

  // ======================= عقود الملاك: وحدة جديدة، تجديد، تعديل =======================
  var OC = { q: '' };
  var MRE = /^[A-Z][a-z]{2}-\d{2}$/;
  function ocNum(v) { var n = Number(digits(v)); return isFinite(n) ? n : 0; }
  function ocIncText(inc) { return !inc ? 'من غير زيادة' : inc.pct ? inc.pct + '% كل سنة (زيادة على الزيادة)' : money(inc.amt) + ' ج كل سنة'; }
  function ocIncCell(inc) { return !inc ? '' : inc.pct ? Math.round(inc.pct * 10) / 1000 : inc.amt + ' جنيه'; }
  function ocIncOf(v) { var s0 = String(v === null || v === undefined ? '' : v); if (/جنيه|ج\b/.test(s0)) { var a = Number(s0.replace(/[^\d.]/g, '')); return a ? { amt: a } : null; } var p = F.parseIncrease(v); return p ? { pct: p } : null; }
  function renderOwnerC() {
    var box = $('tab-ownerc'); if (!box) return;
    if (!App.cmpOn()) { box.innerHTML = '<div class="empty">الشاشة دي مقفولة على الجهاز ده.</div>'; return; }
    var t = today(), lim = new Date(t.getTime() + 90 * 864e5), cur = L.monthKey(t);
    box.innerHTML = '<button class="btn primary addbtn" id="ocNew">+ وحدة جديدة وعقد مالك</button>' +
      '<input id="ocQ" placeholder="ابحث بالكود أو العمارة أو اسم المالك" value="' + esc(OC.q) + '" autocomplete="off" style="margin:4px 0 10px">' +
      '<div id="ocRes"></div>';
    var draw = function () {
      var q = OC.q.trim(), list, head;
      if (q) { list = L.searchUnits(S.units, q); head = ''; }
      else {
        list = S.units.filter(function (u) { return u.ownerEnd && u.ownerEnd >= new Date(t.getTime() - 60 * 864e5) && u.ownerEnd <= lim && String(u.settle || '').toUpperCase() !== 'OUT'; }).sort(function (a, b) { return a.ownerEnd - b.ownerEnd; });
        head = '<div class="lh">عقود ملاك بتخلص خلال ٣ شهور (' + list.length + ')</div>';
      }
      $('ocRes').innerHTML = head + (list.length ? list.map(function (u) {
        var rent = S.ownerMonths && S.ownerMonths[cur] ? Number(S.ownerMonths[cur][u.idx]) || 0 : 0, d = u.ownerEnd ? L.daysBetween(t, u.ownerEnd) : null;
        return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2">كود ' + esc(u.code) + ' · ' + esc(u.owner || '—') + '</div></div>' +
          (d === null ? '' : d < 0 ? '<span class="badge done">خلص</span>' : d <= 30 ? '<span class="badge book">باقي ' + d + ' يوم</span>' : '') + '</div>' +
          '<dl class="kv"><dt>نهاية العقد</dt><dd>' + (u.ownerEnd ? L.fmt(u.ownerEnd) : '—') + '</dd><dt>إيجار الشهر ده</dt><dd>' + (rent ? money(rent) : '—') + '</dd>' + (u.bedrooms ? '<dt>الغرف</dt><dd>' + esc(u.bedrooms) + '</dd>' : '') + '</dl>' +
          '<div style="display:flex;gap:14px;margin-top:6px"><button class="link" data-ocr="' + esc(u.code) + '">تجديد</button><button class="link" data-oce="' + esc(u.code) + '">تعديل</button></div></div>';
      }).join('') : '<div class="empty">' + (q ? 'مفيش نتايج.' : 'مفيش عقود بتخلص قريب.') + '</div>');
    };
    var tm; $('ocQ').oninput = function () { OC.q = this.value; clearTimeout(tm); tm = setTimeout(draw, 150); };
    $('ocRes').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.ocr) openOwnerForm('renew', unitOf(b.dataset.ocr)); else if (b.dataset.oce) openOwnerForm('edit', unitOf(b.dataset.oce)); };
    $('ocNew').onclick = function () { openOwnerForm('new', null); };
    draw();
  }

  var OF = null;
  function openOwnerForm(mode, u) {
    if (mode === 'new') { OF = { mode: mode, u: null, row: null }; drawOwnerForm(); return; }
    App.openSheet('<h2>' + (mode === 'renew' ? 'تجديد عقد مالك' : 'تعديل عقد مالك') + '</h2>' + loadingHtml('بيقرا سطر الوحدة…'));
    A.readOwnerRow(u.idx, u.code).then(function (r) { OF = { mode: mode, u: u, row: r.row, H: r.H }; drawOwnerForm(); })
      .catch(function (e) { App.openSheet('<h2>عقود الملاك</h2>' + errHtml(e) + '<button class="btn ghost" onclick="OsoolApp.closeSheet()">رجوع</button>'); });
  }
  function ocRowMonths(row) { var m = {}; Object.keys(row || {}).forEach(function (k) { if (MRE.test(k)) m[k] = Number(row[k]) || 0; }); return m; }
  function ocLastRent(row, upto) {
    var m = ocRowMonths(row), ks = Object.keys(m).filter(function (k) { return m[k] && (!upto || F.cmpKey(k, upto) <= 0); }).sort(F.cmpKey);
    return ks.length ? { key: ks[ks.length - 1], amount: m[ks[ks.length - 1]] } : null;
  }
  function drawOwnerForm() {
    var m = OF.mode, u = OF.u, row = OF.row || {}, t = today();
    var projects = {}; S.units.forEach(function (x) { if (x.project) projects[x.project] = 1; });
    var settles = { '': 1 }; S.units.forEach(function (x) { settles[x.settle || ''] = 1; });
    var sel = function (id, list, v) { return '<select id="' + id + '">' + list.map(function (o) { o = [].concat(o); return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1] === undefined ? o[0] : o[1]) + '</option>'; }).join('') + '</select>'; };
    var inp = function (id, label, v, cls) { return '<div><label>' + label + '</label><input id="' + id + '"' + (cls ? ' class="' + cls + '"' : '') + ' value="' + esc(v === null || v === undefined ? '' : v) + '" autocomplete="off"></div>'; };
    var d = function (v) { var x = typeof v === 'number' ? L.serialToDate(v) : v instanceof Date ? v : null; return x ? L.toISO(x) : ''; };
    var inc = ocIncOf(row['زيادة سنوية']);
    var html = '<h2>' + (m === 'new' ? 'وحدة جديدة وعقد مالك' : m === 'renew' ? 'تجديد عقد مالك' : 'تعديل عقد مالك') + '</h2>';
    if (m !== 'new') html += '<div class="unit" style="margin-bottom:8px"><div class="t">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2">كود ' + esc(u.code) + ' · ' + esc(row['الاسم'] || '—') + ' · العقد ' + L.fmt(L.serialToDate(row['بداية العقد'])) + ' ← ' + L.fmt(L.serialToDate(row['نهاية العقد'])) + ' · ' + ocIncText(inc) + '</div></div>';
    if (m === 'new') {
      html += '<div class="grid2"><div><label>الكمبوند <span class="req">*</span></label>' + sel('ofP', [['', 'اختار…']].concat(Object.keys(projects).sort()).concat([['__new', 'كمبوند جديد…']]), '') + '<input id="ofPN" class="hide" placeholder="اسم الكمبوند" style="margin-top:4px"></div>' + inp('ofBl', 'بلوك', '') + '</div>' +
        '<div class="grid2">' + inp('ofB', 'العمارة <span class="req">*</span>', '') + inp('ofA', 'الشقة <span class="req">*</span>', '') + '</div>' +
        '<div class="grid2"><div><label>كود الوحدة <span class="req">*</span></label><input id="ofC" class="ltr" inputmode="numeric"><div class="r2" id="ofCH" style="font-size:11.5px"></div></div>' + inp('ofBeds', 'عدد الغرف', '', 'ltr') + '</div>' +
        '<div class="grid2">' + inp('ofN', 'اسم المالك <span class="req">*</span>', '') + inp('ofTel', 'التليفون', '', 'ltr') + '</div>' + inp('ofId', 'رقم البطاقة', '', 'ltr');
    }
    if (m !== 'edit') {
      var oldEnd = L.serialToDate(row['نهاية العقد']), st0 = m === 'renew' && oldEnd ? new Date(oldEnd.getTime() + 864e5) : null;
      var last = m === 'renew' ? ocLastRent(row, oldEnd ? L.monthKey(oldEnd) : null) : null;
      var first = last ? Math.round(last.amount * (inc && inc.pct ? 1 + inc.pct / 100 : 1) + (inc && inc.amt ? inc.amt : 0)) : '';
      html += '<div class="grid2"><div><label>' + (m === 'renew' ? 'بداية التجديد' : 'بداية العقد') + ' <span class="req">*</span></label><input type="date" id="ofS" value="' + d(st0) + '"></div>' +
        '<div><label>المدة</label><div style="display:flex;gap:6px"><input id="ofDn" class="ltr" value="' + (m === 'renew' ? 1 : 3) + '" style="width:60px">' + sel('ofDu', [['y', 'سنين'], ['m', 'شهور']], 'y') + '</div></div></div>' +
        '<div class="grid2"><div><label>النهاية</label><input type="date" id="ofE"></div>' + inp('ofR', (m === 'renew' ? 'إيجار أول سنة في التجديد' : 'الإيجار الشهري') + ' <span class="req">*</span>', first, 'ltr') + '</div>' +
        (last ? '<div class="r2" style="margin-top:-4px">آخر إيجار متسجل: ' + money(last.amount) + ' (' + L.monthLabel(last.key) + ')' + (inc ? '، والمقترح بعد الزيادة' : '') + '</div>' : '');
    }
    var incV = inc ? (inc.pct || inc.amt) : '', incT = inc && inc.amt ? 'amt' : 'pct';
    html += '<div class="grid2"><div><label>الزيادة السنوية</label><div style="display:flex;gap:6px"><input id="ofI" class="ltr" value="' + incV + '" style="width:80px">' + sel('ofIT', [['pct', '%'], ['amt', 'جنيه']], incT) + '</div></div>' +
      '<div><label>يسدد كل</label>' + sel('ofEv', [['1', 'شهر'], ['2', 'شهرين'], ['3', '٣ شهور'], ['4', '٤ شهور'], ['6', '٦ شهور'], ['12', 'سنة']], String(row['يسدد كل'] || 1)) + '</div></div>';
    if (m === 'edit') {
      var ks = Object.keys(ocRowMonths(row)).sort(F.cmpKey), cm = L.monthKey(t), ld = L.serialToDate(row['نهاية العقد']), sd = L.serialToDate(row['بداية العقد']);
      var inRange = ks.filter(function (k) { return (!sd || F.cmpKey(k, L.monthKey(sd)) >= 0) && (!ld || F.cmpKey(k, L.monthKey(ld)) <= 0); });
      var defK = inRange.indexOf(cm) !== -1 ? cm : inRange[inRange.length - 1] || cm;
      html += '<div class="card" style="padding:10px;margin-top:8px"><h3 style="margin:0 0 6px">تغيير الإيجار (اختياري)</h3><div class="grid2"><div><label>من شهر</label>' + sel('ofFrom', inRange.map(function (k) { return [k, L.monthLabel(k)]; }), defK) + '</div>' + inp('ofNR', 'الإيجار الجديد', '', 'ltr') + '</div>' +
        '<label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="ofKeep" checked style="width:auto"> كمّل الزيادة السنوية على ميعاد سنة العقد</label></div>' +
        '<div class="grid2"><div><label>نهاية العقد</label><input type="date" id="ofE" value="' + d(row['نهاية العقد']) + '"></div>' + inp('ofN', 'اسم المالك', row['الاسم']) + '</div>' +
        '<div class="grid2">' + inp('ofTel', 'التليفون', row['التليفون'], 'ltr') + inp('ofBeds', 'عدد الغرف', row['Bedrooms'], 'ltr') + '</div>' + inp('ofId', 'رقم البطاقة', row['رقم البطاقة'], 'ltr');
    }
    html += '<details class="more"' + (m === 'edit' ? ' open' : '') + '><summary>التحويل والتأمين وباقي البيانات</summary>' +
      '<div class="grid2">' + inp('ofBen', 'المستفيد', row['Beneficiary Name']) + inp('ofAcc', 'رقم الحساب', row['Beneficiary Acc. No.'], 'ltr') + '</div>' +
      '<div class="grid2">' + inp('ofBank', 'البنك', row['البنك']) + inp('ofPay', 'طريقة الدفع', row['الدفع']) + '</div>' +
      '<div class="grid2">' + inp('ofDep', 'التأمين', row['التأمين'], 'ltr') + '<div><label>التسويات</label>' + sel('ofSet', Object.keys(settles).sort().map(function (x) { return [x, x || 'بدون']; }), row['تسويات'] || '') + '</div></div>' +
      inp('ofInfo', 'Info', row['Info']) + '</details>' +
      '<div id="ofRows" style="margin-top:10px"></div><div id="ofMsg" style="margin-top:10px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:6px"><button class="btn ghost" id="ofBack">رجوع</button><button class="btn ghost" id="ofCalc">' + (m === 'edit' ? 'شوف التغييرات' : 'احسب الشهور') + '</button><button class="btn primary" id="ofSave">تسجيل</button></div>';
    App.openSheet(html);
    OF.armed = false; OF.plan = null;
    var dis = function () { OF.armed = false; OF.plan = null; $('ofSave').textContent = 'تسجيل'; $('ofMsg').innerHTML = ''; };
    document.querySelectorAll('#sheet input, #sheet select').forEach(function (e) { e.addEventListener('input', dis); e.addEventListener('change', dis); });
    if ($('ofDn')) {
      var endCalc = function () { var s0 = L.parseISO($('ofS').value), n = parseInt(digits($('ofDn').value), 10) || 0; if (!s0 || !n) return; var e0 = L.addMonths(s0, $('ofDu').value === 'y' ? n * 12 : n); $('ofE').value = L.toISO(new Date(e0.getTime() - 864e5)); };
      ['ofS', 'ofDn', 'ofDu'].forEach(function (id) { $(id).addEventListener('input', endCalc); $(id).addEventListener('change', endCalc); }); endCalc();
    }
    if (m === 'new') {
      var codeHint = function () {
        var pj = $('ofP').value === '__new' ? $('ofPN').value : $('ofP').value, sg = F.suggestUnitCode(S.units, pj, $('ofB').value, $('ofA').value);
        if (sg.code && (!$('ofC').value || $('ofC').dataset.auto === '1')) { $('ofC').value = sg.code; $('ofC').dataset.auto = '1'; }
        var c = digits($('ofC').value), taken = c && S.units.some(function (x) { return x.code === c; });
        $('ofCH').innerHTML = taken ? '<span class="late">الكود ده متسجل قبل كده</span>' : sg.rule ? 'القاعدة: ' + esc(sg.rule) : (pj ? 'مفيش قاعدة واضحة للكمبوند ده، اكتب الكود' : '');
      };
      $('ofP').onchange = function () { $('ofPN').classList.toggle('hide', this.value !== '__new'); codeHint(); };
      ['ofPN', 'ofB', 'ofA'].forEach(function (id) { $(id).addEventListener('input', codeHint); });
      $('ofC').addEventListener('input', function () { this.dataset.auto = ''; codeHint(); });
    }
    $('ofBack').onclick = App.closeSheet;
    $('ofCalc').onclick = function () { ownerPlan(true); };
    $('ofSave').onclick = saveOwner;
  }
  function ocInc() { var v = ocNum($('ofI').value); return v ? ($('ofIT').value === 'amt' ? { amt: v } : { pct: v }) : null; }
  // بيحسب اللي هيتكتب ويعرضه (الشهور والخانات اللي هتتغير)
  function ownerPlan(show) {
    var m = OF.mode, row = OF.row || {}, errs = [], fields = {}, months = {}, comments = [], changes = [], tday = L.fmt(today());
    var inc = ocInc(), oldInc = ocIncOf(row['زيادة سنوية']);
    var put = function (k, v, label) {
      var old = row[k], same = String(old === null || old === undefined ? '' : old).trim() === String(v === null || v === undefined ? '' : v).trim();
      if (typeof v === 'number' && Number(old) === v) same = true;
      if (m === 'new') { if (v !== '' && v !== null && v !== undefined) fields[k] = v; return; }
      if (same) return;
      fields[k] = v; changes.push([label || k, old, v]);
      if (k !== 'نهاية العقد') comments.push({ key: k, text: (m === 'renew' ? 'تجديد ' : 'تعديل ') + tday + ': كان "' + (old === '' || old === null || old === undefined ? 'فاضي' : (typeof old === 'number' && /عقد/.test(k) ? L.fmt(L.serialToDate(old)) : typeof old === 'number' ? money(old) : old)) + '"' });
    };
    var opt = function (k, id, num) { if (!$(id)) return; var v = $(id).value.trim(); put(k, num && v !== '' ? Number(digits(v)) : v); };
    var monthsRows = [];
    if (m === 'new' || m === 'renew') {
      var s0 = L.parseISO($('ofS').value), e0 = L.parseISO($('ofE').value), rent = ocNum($('ofR').value);
      if (!s0) errs.push('حدد البداية.'); if (!e0 || (s0 && e0 <= s0)) errs.push('النهاية لازم تكون بعد البداية.'); if (!(rent > 0)) errs.push('اكتب الإيجار.');
      if (m === 'new') {
        var pj = $('ofP').value === '__new' ? $('ofPN').value.trim() : $('ofP').value, code = digits($('ofC').value);
        if (!pj) errs.push('اختار الكمبوند.'); if (!$('ofB').value.trim() || !$('ofA').value.trim()) errs.push('اكتب العمارة والشقة.');
        if (!code) errs.push('اكتب كود الوحدة.'); else if (S.units.some(function (x) { return x.code === code; })) errs.push('الكود ' + code + ' متسجل قبل كده.');
        if (!$('ofN').value.trim()) errs.push('اكتب اسم المالك.');
        OF.code = code;
        fields['كود'] = Number(code) || code; fields['المشروع'] = pj; put('بلوك', $('ofBl').value.trim()); put('عمارة', $('ofB').value.trim()); put('شقة', $('ofA').value.trim());
        put('الاسم', $('ofN').value.trim()); put('التليفون', $('ofTel').value.trim()); put('رقم البطاقة', $('ofId').value.trim()); opt('Bedrooms', 'ofBeds', true);
        if (s0) fields['بداية العقد'] = L.dateToSerial(s0);
        comments.push({ key: 'كود', text: 'وحدة جديدة اتسجلت ' + tday + ' من لوحة أصول: عقد ' + (s0 ? L.fmt(s0) : '') + ' ← ' + (e0 ? L.fmt(e0) : '') + '، إيجار ' + money(rent) + '، ' + ocIncText(inc) });
      }
      if (!errs.length) {
        F.planOwnerMonths(s0, e0, rent, inc).forEach(function (x) { months[x.key] = x.amount; monthsRows.push({ key: x.key, amount: x.amount, year: x.year, old: Number(row[x.key]) || 0 }); });
        if (m === 'renew') {
          var oe = row['نهاية العقد'];
          fields['نهاية العقد'] = L.dateToSerial(e0); changes.push(['نهاية العقد', oe ? L.fmt(L.serialToDate(oe)) : '', L.fmt(e0)]);
          comments.push({ key: 'نهاية العقد', text: 'تجديد ' + tday + ': من ' + L.fmt(s0) + ' لـ ' + L.fmt(e0) + '، إيجار أول سنة ' + money(rent) + '، ' + ocIncText(inc) + ' (النهاية كانت ' + (oe ? L.fmt(L.serialToDate(oe)) : 'فاضية') + ')' });
          put('قيمة الايجار', rent, 'قيمة الإيجار');
        } else { fields['نهاية العقد'] = L.dateToSerial(e0); fields['قيمة الايجار'] = rent; }
      }
    } else {
      var ne = L.parseISO($('ofE').value), oe2 = L.serialToDate(row['نهاية العقد']), om = ocRowMonths(row);
      put('الاسم', $('ofN').value.trim(), 'اسم المالك'); put('التليفون', $('ofTel').value.trim()); put('رقم البطاقة', $('ofId').value.trim()); opt('Bedrooms', 'ofBeds', true);
      var nr = ocNum($('ofNR').value), fk = $('ofFrom').value, endK = L.monthKey(ne || oe2), sd = L.serialToDate(row['بداية العقد']), anchorM = sd ? sd.getUTCMonth() : 0;
      var yIdx = function (k) { var dt = F.keyToDate(k); return (dt.getUTCFullYear() * 12 + dt.getUTCMonth() - ((sd ? sd.getUTCFullYear() : dt.getUTCFullYear()) * 12 + anchorM)) / 12 | 0; };
      var useInc = inc || oldInc;
      if (ne && oe2 && ne.getTime() !== oe2.getTime()) {
        fields['نهاية العقد'] = L.dateToSerial(ne); changes.push(['نهاية العقد', L.fmt(oe2), L.fmt(ne)]);
        comments.push({ key: 'نهاية العقد', text: 'تعديل ' + tday + ': النهاية كانت ' + L.fmt(oe2) });
        if (ne < oe2) Object.keys(om).forEach(function (k) { if (F.cmpKey(k, endK) > 0 && F.cmpKey(k, L.monthKey(oe2)) <= 0 && om[k]) { months[k] = ''; monthsRows.push({ key: k, amount: 0, old: om[k] }); } });
        else {
          var lr = ocLastRent(row, L.monthKey(oe2)), k = L.monthKey(L.addMonths(F.keyToDate(L.monthKey(oe2)), 1));
          while (lr && F.cmpKey(k, endK) <= 0) { var v = lr.amount; if ($('ofKeep').checked && useInc && yIdx(k) > yIdx(lr.key)) v = useInc.pct ? lr.amount * Math.pow(1 + useInc.pct / 100, yIdx(k) - yIdx(lr.key)) : lr.amount + useInc.amt * (yIdx(k) - yIdx(lr.key)); months[k] = Math.round(v); monthsRows.push({ key: k, amount: Math.round(v), old: om[k] || 0 }); k = L.monthKey(L.addMonths(F.keyToDate(k), 1)); }
        }
      }
      if (nr > 0) {
        var k2 = fk, firstChanged = null;
        while (F.cmpKey(k2, endK) <= 0) {
          var v2 = nr; if ($('ofKeep').checked && useInc && yIdx(k2) > yIdx(fk)) v2 = useInc.pct ? nr * Math.pow(1 + useInc.pct / 100, yIdx(k2) - yIdx(fk)) : nr + useInc.amt * (yIdx(k2) - yIdx(fk));
          v2 = Math.round(v2);
          if ((Number(om[k2]) || 0) !== v2) { months[k2] = v2; if (!firstChanged) firstChanged = k2; var ex = monthsRows.filter(function (r) { return r.key === k2; })[0]; if (ex) ex.amount = v2; else monthsRows.push({ key: k2, amount: v2, old: om[k2] || 0 }); }
          k2 = L.monthKey(L.addMonths(F.keyToDate(k2), 1));
        }
        if (firstChanged) comments.push({ key: firstChanged, text: 'تعديل ' + tday + ': الإيجار من ' + L.monthLabel(fk) + ' بقى ' + money(nr) + ' (كان ' + money(om[firstChanged] || 0) + ')' + ($('ofKeep').checked && useInc ? '، والزيادة السنوية مكملة' : '') });
      }
      monthsRows.sort(function (a, b) { return F.cmpKey(a.key, b.key); });
    }
    put('زيادة سنوية', ocIncCell(inc), 'الزيادة السنوية'); opt('يسدد كل', 'ofEv', true);
    put('Beneficiary Name', $('ofBen').value.trim(), 'المستفيد'); put('Beneficiary Acc. No.', $('ofAcc').value.trim(), 'رقم الحساب'); put('البنك', $('ofBank').value.trim());
    put('الدفع', $('ofPay').value.trim(), 'طريقة الدفع'); opt('التأمين', 'ofDep', true); put('تسويات', $('ofSet').value); put('Info', $('ofInfo').value.trim());
    // تعليق التعديل لكل شهر اتغير بيبقى واحد بس على أول شهر
    OF.plan = errs.length ? null : { idx: m === 'new' ? null : OF.u.idx, code: m === 'new' ? OF.code : OF.u.code, fields: fields, months: months, comments: comments, changes: changes, rows: monthsRows };
    if (show) drawOwnerPlan(errs);
    return { errs: errs, plan: OF.plan };
  }
  function drawOwnerPlan(errs) {
    if (errs.length) { $('ofRows').innerHTML = ''; $('ofMsg').innerHTML = errs.map(function (e) { return '<div class="msg err">' + esc(e) + '</div>'; }).join(''); return; }
    var p = OF.plan, rows = p.rows || [], byY = {};
    var ch = (p.changes || []).filter(function (c) { return c[0] !== 'نهاية العقد' || OF.mode === 'edit'; });
    var html = '';
    if (OF.mode !== 'new' && ch.length) html += '<div class="card" style="padding:8px 10px"><h3 style="margin:0 0 4px">الخانات اللي هتتغير</h3>' + ch.map(function (c) { return '<div class="r2">' + esc(c[0]) + ': <s>' + esc(c[1] === null || c[1] === undefined || c[1] === '' ? 'فاضي' : c[1]) + '</s> ← <b>' + esc(c[2] === '' ? 'فاضي' : c[2]) + '</b></div>'; }).join('') + '</div>';
    if (rows.length) {
      html += '<div class="card" style="padding:8px 10px"><h3 style="margin:0 0 4px">الشهور (' + rows.length + ')</h3><table class="sch">' + rows.map(function (r, i) {
        var yh = r.year && !byY[r.year] ? (byY[r.year] = 1, '<tr><td colspan="3" class="r2" style="padding-top:6px"><b>السنة ' + r.year + '</b></td></tr>') : '';
        return yh + '<tr><td class="m">' + L.monthLabel(r.key) + (r.old && r.old !== r.amount ? '<div class="note">كان ' + money(r.old) + '</div>' : '') + '</td><td><input class="ltr" data-ofm="' + i + '" value="' + (r.amount || '') + '"' + (r.amount ? '' : ' placeholder="هيتمسح"') + '></td></tr>';
      }).join('') + '</table></div>';
    } else if (!ch.length) html += '<div class="r2">مفيش تغييرات.</div>';
    $('ofRows').innerHTML = html; $('ofMsg').innerHTML = '';
    document.querySelectorAll('#ofRows input[data-ofm]').forEach(function (inp) {
      inp.oninput = function () { var r = rows[+inp.dataset.ofm], v = Number(digits(inp.value)) || 0; r.amount = v; p.months[r.key] = v || ''; OF.armed = false; $('ofSave').textContent = 'تسجيل'; };
    });
  }
  function saveOwner() {
    if (!OF.plan) { var r = ownerPlan(true); if (r.errs.length) return; }
    var p = OF.plan;
    if (!Object.keys(p.fields).length && !Object.keys(p.months).length) { $('ofMsg').innerHTML = '<div class="msg warn">مفيش حاجة اتغيرت.</div>'; return; }
    if (!OF.armed) {
      OF.armed = true; $('ofSave').textContent = 'تأكيد التسجيل';
      var nm = Object.keys(p.months).length;
      $('ofMsg').innerHTML = '<div class="msg warn">' + (OF.mode === 'new' ? 'هتتسجل وحدة جديدة بكود ' + esc(p.code) + ' في جدول الملاك' : 'هيتعدل سطر الوحدة ' + esc(p.code)) + (nm ? '، و' + nm + ' شهر' : '') +
        (p.comments.length ? '، ومعاهم ' + p.comments.length + ' تعليق بالتعديل' : '') + '. راجع الجدول فوق، واضغط تأكيد.</div>';
      return;
    }
    var btn = $('ofSave'); btn.disabled = true; btn.textContent = 'بيسجل…';
    A.writeOwner({ idx: p.idx, code: p.code, fields: p.fields, months: p.months, comments: p.comments }).then(function (res) {
      // نحدّث البيانات اللي في البانل من غير ما نعيد تحميل الملف
      var u = OF.mode === 'new' ? null : OF.u;
      if (!u) { u = { code: String(p.code), idx: res.idx, rent: 0, every: 1 }; S.units.push(u); }
      var f = p.fields;
      if (f['المشروع'] !== undefined) u.project = f['المشروع']; if (f['بلوك'] !== undefined) u.block = f['بلوك']; if (f['عمارة'] !== undefined) u.building = String(f['عمارة']); if (f['شقة'] !== undefined) u.apt = String(f['شقة']);
      if (f['الاسم'] !== undefined) u.owner = f['الاسم']; if (f['نهاية العقد'] !== undefined) u.ownerEnd = L.serialToDate(f['نهاية العقد']); if (f['Bedrooms'] !== undefined) u.bedrooms = String(f['Bedrooms']);
      if (f['تسويات'] !== undefined) u.settle = f['تسويات']; if (f['قيمة الايجار'] !== undefined) u.rent = f['قيمة الايجار']; if (f['يسدد كل'] !== undefined) u.every = f['يسدد كل'] || 1;
      if (f['التليفون'] !== undefined) u.phone = f['التليفون']; if (f['الدفع'] !== undefined) u.payMethod = f['الدفع']; if (f['Beneficiary Name'] !== undefined) u.benName = f['Beneficiary Name']; if (f['Beneficiary Acc. No.'] !== undefined) u.benAcc = f['Beneficiary Acc. No.']; if (f['البنك'] !== undefined) u.bank = f['البنك'];
      Object.keys(p.months).forEach(function (k) { if (S.ownerMonths[k]) S.ownerMonths[k][res.idx] = p.months[k]; });
      var cm = res.comments || {};
      App.openSheet('<h2>' + (OF.mode === 'new' ? 'اتسجلت الوحدة' : OF.mode === 'renew' ? 'اتجدد العقد' : 'اتعدل العقد') + '</h2>' +
        '<div class="msg ok">' + (OF.mode === 'new' ? 'الوحدة ' + esc(p.code) + ' اتكتبت' : 'سطر الوحدة ' + esc(p.code) + ' اتعدل') + ' في جدول الملاك (السطر ' + res.sheetRow + ').</div>' + App.checkHtml(res) +
        (p.comments.length ? (cm.unsupported ? '<div class="msg warn">التعليقات مش مدعومة في نسخة الإكسيل دي، فاتكتبت القيم من غير تعليق.</div>' : cm.failed ? '<div class="msg warn">' + cm.failed + ' تعليق مااتكتبش (ممكن الشيت محمي). القيم نفسها اتكتبت.</div>' : '<div class="msg ok">اتكتب ' + cm.ok + ' تعليق بالتعديل على الخانات.</div>') : '') +
        '<button class="btn primary" id="ofDone" style="width:100%;margin-top:8px">تمام</button>');
      $('ofDone').onclick = function () { App.closeSheet(); renderOwnerC(); };
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'تأكيد التسجيل'; $('ofMsg').innerHTML = errHtml(e);
      if (e && e.missingMonths) {
        var upto = e.missingMonths.slice().sort(F.cmpKey).pop();
        $('ofMsg').innerHTML += '<div class="msg warn">جدول الملاك آخره شهر قبل كده. أقدر أزوّد أعمدة الشهور الناقصة لحد ' + L.monthLabel(upto) + ' في آخر الجدول. لازم تفك حماية شيت الملاك الأول، وبعد كده رجّعها.</div><button class="btn ghost" id="ofAddM" style="width:100%">زوّد أعمدة الشهور الناقصة</button>';
        $('ofAddM').onclick = function () {
          var b = this; b.disabled = true; b.textContent = 'بيزوّد الأعمدة…';
          A.addMonthColumns('owner', upto).then(function (ks) { $('ofMsg').innerHTML = '<div class="msg ok">اتزوّد ' + ks.length + ' عمود (' + (ks[0] || '') + ' لـ ' + (ks[ks.length - 1] || '') + '). دوس تأكيد التسجيل تاني.</div>'; OF.armed = true; })
            .catch(function (er) { b.disabled = false; b.textContent = 'زوّد أعمدة الشهور الناقصة'; $('ofMsg').insertAdjacentHTML('beforeend', errHtml(er)); });
        };
      }
    });
  }

  // ======================= التصدير =======================
  function exportBar(id) {
    return '<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px"><button class="link" id="' + id + '">إكسيل</button><button class="link" id="' + id + 'P">PDF</button>' +
      '<button class="link" id="' + id + 'C" style="color:var(--muted)">نسخ</button><span class="r2" id="' + id + 'M"></span></div>';
  }
  function bindExport(id, getData) {
    var msg = function (t) { $(id + 'M').textContent = t; };
    $(id).onclick = function () {
      var d = getData(); if (!d.rows.length) { msg('مفيش بيانات.'); return; }
      msg('بيجهز الإكسيل…');
      R.downloadXlsx(d).then(function () { msg(d.rows.length + ' سطر'); }, function () {
        try { downloadXlsx(d); msg(d.rows.length + ' سطر'); } catch (e) { msg('التحميل مش متاح هنا، استخدم نسخ.'); }
      });
    };
    $(id + 'P').onclick = function () {
      var d = getData(); if (!d.rows.length) { msg('مفيش بيانات.'); return; }
      R.openPrint(R.tableReport(d), d.name).then(function () { msg('اختار Save as PDF من نافذة الطباعة.'); });
    };
    $(id + 'C').onclick = function () {
      var d = getData();
      var tsv = [d.headers].concat(d.rows).map(function (r) { return r.map(function (v) { return v instanceof Date ? L.fmt(v) : String(v === null || v === undefined ? '' : v).replace(/[\t\n]/g, ' '); }).join('\t'); }).join('\n');
      App.copyText(tsv, { set textContent(t) { msg(t === 'اتنسخ' ? 'اتنسخ، الصقه في أي شيت' : ''); } });
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
      var list = F.availability(S.units, S.renters, S.settings || F.DEFAULT_SETTINGS, today());
      S.availAll = list;
      var projects = {}, settles = {};
      list.forEach(function (x) { settles[x.unit.settle || ''] = 1; });
      projects = F.groupsIn(list.map(function (x) { return x.unit; })); settles = Object.keys(settles).sort();
      // الأماكن اللي في نطاق الملف بس، ولو النطاق اتغير نرجع للكل
      AV.projects = (AV.projects || projects).filter(function (g) { return projects.indexOf(g) !== -1; });
      if (!AV.projects.length) AV.projects = projects.slice();
      if (!AV.settles) AV.settles = settles.slice();
      var chips = function (group, vals, sel, label) {
        return '<div class="tgs">' + vals.map(function (v) { return '<button class="tg' + (sel.indexOf(v) !== -1 ? ' on' : '') + '" data-g="' + group + '" data-v="' + esc(v) + '">' + esc(label ? label(v) : v) + '</button>'; }).join('') + '</div>';
      };
      box.innerHTML = '<div id="exitBox"></div><div id="avSum"></div>' +
        '<div class="card"><h3>المكان <button class="link" id="avAllP" style="margin-inline-start:auto;font-size:11px">الكل</button></h3>' + chips('p', projects, AV.projects) +
        '<h3 style="margin-top:12px">التسويات</h3>' + chips('s', settles, AV.settles, settleLabel) + '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:6px"><button class="btn primary" id="avPdf">PDF أو طباعة</button><button class="btn ghost" id="avXl">إكسيل</button></div>' +
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
        var txt = AV.projects.length === projects.length ? 'كل الأماكن' : AV.projects.join('، ');
        return R.availHtml(S.availView || [], today(), txt);
      };
      var avName = function () { return fileName('المتاح', AV.projects.length === projects.length ? '' : grpName(AV.projects), fdate()); };
      $('avPdf').onclick = function () { R.openPrint(report(), avName()).then(function () { $('avMsg').textContent = 'اختار Save as PDF من نافذة الطباعة.'; }); };
      $('avXl').onclick = function () {
        var l = S.availView || [];
        $('avMsg').textContent = 'بيجهز الإكسيل…';
        R.downloadXlsx({ name: avName(), title: fileName('المتاح', AV.projects.length === projects.length ? '' : grpName(AV.projects)), sheet: 'المتاح', sub: AV.projects.join('، '), sums: [],
          kinds: ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'text', 'date', 'date', 'text', 'text'],
          headers: ['المكان', 'المشروع', 'كود الوحدة', 'تمييز', 'بلوك', 'عمارة', 'شقة', 'غرف', 'التسويات', 'الحالة', 'فاضية من', 'الساكن', 'الحجز الجاي من', 'الحجز الجاي لحد', 'اسم الحجز الجاي', 'ملاحظة'],
          rows: l.map(function (x) { var u = x.unit, c = x.current, n = x.next;
            var st = c ? (c.end.getUTCFullYear() >= 2090 ? 'خارج التشغيل' : +c.end === +today() ? 'خروج النهارده' : 'مشغولة') : x.pending ? 'لسه متستلمتش' : 'متاحة';
            var cls = R.unitClass(u); return [F.groupOf(u.project), u.project, u.code, cls, cls ? '' : u.block, u.building, u.apt, u.bedrooms, u.settle, st, c && c.end.getUTCFullYear() < 2090 ? new Date(c.end.getTime() + 864e5) : '', c ? c.name : x.pending ? x.pending.name : '', n ? n.start : '', n ? n.end : '', n ? n.name : '', x.receivedToday ? F.RECEIVED : '']; }) })
          .then(function () { $('avMsg').textContent = l.length + ' وحدة'; }, function (e) { $('avMsg').textContent = e.message || 'التحميل مش متاح هنا.'; });
      };
      drawExits();
      drawAvail();
    });
  }
  function drawAvail() {
    var list = (S.availAll || []).filter(function (x) {
      return AV.projects.indexOf(F.groupOf(x.unit.project)) !== -1 && AV.settles.indexOf(x.unit.settle || '') !== -1;
    });
    S.availView = list;
    var free = list.filter(function (x) { return !x.current && !x.pending; }).length;
    var pend = list.filter(function (x) { return x.pending; }).length;
    var soon = list.filter(function (x) { return x.current && x.daysToFree <= 7 && x.current.end.getUTCFullYear() < 2090; }).length;
    $('avSum').innerHTML = '<div class="sum" style="grid-template-columns:1fr 1fr 1fr"><div class="box"><div class="v okc">' + free + '</div><div class="k">فاضية النهارده</div></div>' +
      '<div class="box"><div class="v ' + (pend ? 'late' : '') + '">' + pend + '</div><div class="k">لسه متستلمتش</div></div>' +
      '<div class="box"><div class="v">' + soon + '</div><div class="k">هتفضى خلال أسبوع</div></div></div>';
    $('avList').innerHTML = list.length ? list.slice(0, 150).map(function (x) {
      var u = x.unit, c = x.current, n = x.next, st;
      if (c && c.end.getUTCFullYear() >= 2090) st = '<span class="badge done">خارج التشغيل</span>';
      else if (c && +c.end === +today()) st = '<span class="badge" style="background:#c62828;color:#fff">خروج النهارده</span>';
      else if (c) st = '<span class="badge book">لحد ' + L.fmt(c.end) + '</span>';
      else if (x.pending) st = '<span class="badge late">لسه متستلمتش</span>';
      else st = '<span class="badge live">Available</span>' + (x.receivedToday ? ' <span class="badge done">تم الاستلام</span>' : '');
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(App.unitTitle(u) || u.code) + '</div><div class="r2"><span dir="ltr">' + esc(u.code) + '</span>' + (u.bedrooms ? ' · ' + esc(u.bedrooms) + ' غرف' : '') + (u.settle ? ' · ' + esc(u.settle) : '') + '</div></div>' + st + '</div>' +
        ((c && c.end.getUTCFullYear() < 2090) || n || x.pending ? '<dl class="kv">' + (c && c.end.getUTCFullYear() < 2090 ? '<dt>الساكن</dt><dd>' + esc(c.name || '—') + '</dd>' : '') +
        (x.pending ? '<dt>خرج</dt><dd>' + esc(x.pending.name || '—') + ' · ' + L.fmt(x.pending.end) + '</dd>' : '') +
        (n ? '<dt>حجز جاي</dt><dd>' + esc(n.name || '—') + ' · ' + L.fmt(n.start) + ' ← ' + L.fmt(n.end) + '</dd>' : '') + '</dl>' : '') + '</div>';
    }).join('') + (list.length > 150 ? '<div class="r2" style="padding:6px">ظاهر ١٥٠ من ' + list.length + '. الـ PDF فيه الكل.</div>' : '') : '<div class="empty" style="padding:8px">مفيش وحدات بالفلتر ده.</div>';
  }

  // ======================= تمديد وتسليم مبكر =======================
  var CE = null;
  function isoOf(d) { return d ? L.toISO(d) : ''; }
  function openContractEdit(idx, kind) {
    var r = S.renters.filter(function (x) { return x.idx === idx; })[0]; if (!r) return;
    App.openSheet('<h2>' + (kind === 'extend' ? 'تمديد العقد' : 'تسليم مبكر') + '</h2>' + loadingHtml('بيقرا العقد…'));
    Promise.all([A.readRenterRow(idx), ensureTreasury()]).then(function (res) {
      var row = res[0];
      if (String(row['كود المستأجر']).trim() !== r.code) throw new Error('السطر اتغير. اضغط تحديث وجرب تاني.');
      var g = S.ledger[r.code] || { byMonth: {} }, coll = 0;
      Object.keys(g.byMonth).forEach(function (k) { if (F.keyToDate(k) >= F.keyToDate(F.FOLLOW_FROM)) coll += g.byMonth[k] || 0; });
      var t = today(), E = t < r.start ? r.start : t;
      if (E >= r.end) E = new Date(r.end.getTime() - 86400000);
      CE = { kind: kind, r: r, months: monthsFromRow(row), notes: row['ملاحظات'], collected: coll, step: 0, edits: {},
        newEnd: L.addMonths(new Date(r.end.getTime() + 86400000), 1), rent: '', E: E, mode: 'days', receive: E <= t };
      CE.newEnd = new Date(CE.newEnd.getTime() - 86400000);
      drawCE();
    }).catch(function (e) { App.openSheet('<h2>تعديل العقد</h2>' + errHtml(e) + '<button class="btn ghost" id="ceX">رجوع</button>'); $('ceX').onclick = App.closeSheet; });
  }
  function cePlan() {
    var r = CE.r, others = S.renters.filter(function (o) { return o.unit === r.unit; });
    return CE.kind === 'extend' ? F.planExtend(r, CE.months, CE.newEnd, CE.rent, others, S.monthHeaders, CE.notes, today())
      : F.planEarly(r, CE.months, CE.E, CE.mode, CE.notes, CE.collected, CE.receive, today());
  }
  function drawCE() {
    var r = CE.r, u = unitOf(r.unit), p = cePlan(), ext = CE.kind === 'extend';
    var head = '<h2>' + (ext ? 'تمديد العقد' : 'تسليم مبكر') + '</h2>' +
      '<div class="card"><div class="r1">' + esc(r.name || '—') + '</div><div class="r2">' + esc(App.unitTitle(u) || r.unit) + ' · <span dir="ltr">' + esc(r.code) + '</span></div>' +
      '<div class="r2">العقد الحالي: ' + L.fmt(r.start) + ' ← ' + L.fmt(r.end) + '</div></div>';
    var form = ext ?
      '<label>النهاية الجديدة</label><div style="display:flex;gap:6px;margin-bottom:6px"><input type="date" id="ceEnd" value="' + isoOf(CE.newEnd) + '" style="flex:1">' +
        '<input id="ceN" class="ltr" inputmode="numeric" placeholder="زوّد" style="width:62px"><select id="ceU" style="width:84px"><option value="m">شهور</option><option value="n">ليالي</option><option value="w">أسابيع</option><option value="y">سنين</option></select></div>' +
        '<label>' + (p.info && p.info.nightly ? 'سعر الليلة' : 'الإيجار الشهري للمدة الجديدة') + '</label><input id="ceRent" class="ltr" inputmode="numeric" placeholder="' + (p.info ? (p.info.nightly ? p.info.rate : p.info.rent) || '' : '') + '" value="' + esc(CE.rent) + '" style="margin-bottom:8px">'
      : '<label>' + (F.isNightly(r) ? 'يوم الخروج' : 'تاريخ التسليم (آخر يوم في العقد)') + '</label><input type="date" id="ceE" value="' + isoOf(CE.E) + '" style="margin-bottom:8px">' +
        '<div class="seg" id="ceMode" style="margin-bottom:8px"><button data-m="days"' + (CE.mode === 'days' ? ' class="on"' : '') + '>الشهر الأخير بالأيام</button><button data-m="full"' + (CE.mode === 'full' ? ' class="on"' : '') + '>الشهر الأخير كامل</button></div>' +
        '<label class="chk" style="font-size:13px;color:var(--ink);margin-bottom:8px"><input type="checkbox" id="ceRcv"' + (CE.receive ? ' checked' : '') + '> سجّل "تم الاستلام" مع التسليم</label>';
    var rows = (p.rows || []).map(function (x) {
      var v = x.key in CE.edits ? CE.edits[x.key] : x.after, removed = !ext && x.after === 0 && x.note === 'هيتشال';
      return '<tr><td>' + L.monthLabel(x.key) + (x.note && !removed ? '<div class="r2">' + esc(x.note) + '</div>' : '') + '</td><td class="n">' + (x.before ? money(x.before) : '—') + '</td><td class="n">' +
        (removed ? '<span class="strike">هيتشال</span>' : x.formula && !(x.key in CE.edits) ? '<b>' + money(x.after) + '</b><div class="r2" dir="ltr">' + esc(x.formula) + '</div>' :
          '<input class="ltr" data-ce="' + x.key + '" value="' + v + '" style="width:96px;padding:4px 6px">') + '</td></tr>';
    }).join('');
    var table = rows ? '<table class="mt" style="margin:6px 0 8px"><tr><th>الشهر</th><th class="n">قبل</th><th class="n">بعد</th></tr>' + rows + '</table>' : '';
    var money2 = '';
    if (!ext && !p.errors.length) {
      var diff = Math.round(CE.collected - totalAfterEdits(p));
      money2 = '<div class="card"><dl class="kv"><dt>المستحق بعد التعديل</dt><dd>' + money(totalAfterEdits(p)) + '</dd><dt>المحصّل</dt><dd>' + money(CE.collected) + '</dd><dt>' + (diff >= 0 ? 'دافع زيادة' : 'باقي عليه') + '</dt><dd class="' + (diff > 0 ? 'okc' : diff < 0 ? 'late' : '') + '"><b>' + money(Math.abs(diff)) + '</b></dd></dl>' +
        '<div class="r2">الحساب من ' + esc(L.monthLabel(F.FOLLOW_FROM)) + '. ' + (diff > 0 ? 'الزيادة دي محتاجة رد أو تتخصم من حاجة تانية.' : '') + '</div></div>';
    }
    var notes = '<div class="r2" style="margin-bottom:8px">الملاحظات هيتكتب فيها: ' + esc(p.fields ? p.fields['ملاحظات'].split(' — ').pop() : '') + '</div>';
    var errs = (p.errors || []).map(function (m) { return '<div class="msg err">' + esc(m) + '</div>'; }).join('');
    var confirm = CE.step === 1 && !p.errors.length ? '<div class="msg warn">' + (ext ? 'هيتمد العقد لحد ' + L.fmt(CE.newEnd) : 'العقد هيخلص ' + L.fmt(CE.E)) + '، والشهور اللي فوق هتتكتب في نفس السطر. اضغط تأكيد.</div>' : '';
    App.openSheet(head + form + table + money2 + (p.errors.length ? '' : notes) + errs + confirm + '<div id="ceMsg"></div>' +
      '<div style="display:flex;gap:8px"><button class="btn ghost" id="ceBack">إلغاء</button><button class="btn primary" id="ceGo"' + (p.errors.length ? ' disabled' : '') + '>' + (CE.step === 1 ? 'تأكيد' : 'مراجعة') + '</button></div>');
    var redraw = function () { CE.step = 0; drawCE(); };
    if (ext) {
      $('ceEnd').onchange = function () { CE.newEnd = L.parseISO(this.value); CE.edits = {}; redraw(); };
      var dur = function () {
        var n = +digits($('ceN').value), un = $('ceU').value; if (!(n > 0)) return;
        CE.newEnd = un === 'n' || un === 'w' ? new Date(r.end.getTime() + n * (un === 'w' ? 7 : 1) * 86400000) : L.endFromDuration(new Date(r.end.getTime() + 86400000), n, un);
        CE.edits = {}; redraw();
      };
      $('ceN').onchange = dur; $('ceU').onchange = dur;
      $('ceRent').onchange = function () { CE.rent = digits(this.value); CE.edits = {}; redraw(); };
    } else {
      $('ceE').onchange = function () { CE.E = L.parseISO(this.value); CE.receive = CE.E && CE.E <= today(); CE.edits = {}; redraw(); };
      document.querySelectorAll('#ceMode button').forEach(function (b) { b.onclick = function () { CE.mode = b.dataset.m; CE.edits = {}; redraw(); }; });
      $('ceRcv').onchange = function () { CE.receive = this.checked; CE.step = 0; };
    }
    document.querySelectorAll('input[data-ce]').forEach(function (i) { i.onchange = function () { CE.edits[i.dataset.ce] = +digits(i.value) || 0; redraw(); }; });
    $('ceBack').onclick = function () { CE = null; App.closeSheet(); };
    $('ceGo').onclick = function () {
      if (CE.step === 0) { CE.step = 1; drawCE(); return; }
      var fields = {}; Object.keys(p.fields).forEach(function (k) { fields[k] = p.fields[k]; });
      if (!ext) { if (CE.receive) fields['موقف الاستلام'] = F.RECEIVED; else delete fields['موقف الاستلام']; }
      Object.keys(CE.edits).forEach(function (k) { fields[k] = CE.edits[k] ? CE.edits[k] : null; });
      var btn = this; btn.disabled = true; btn.textContent = 'بيسجل…';
      A.updateRenter(r.idx, r.code, fields).then(function (res) {
        // تحديث البيانات اللي في البانل
        r.end = ext ? CE.newEnd : CE.E;
        if ('موقف الاستلام' in fields) r.receipt = fields['موقف الاستلام'];
        (p.rows || []).forEach(function (x) { if (S.months[x.key]) S.months[x.key][r.idx] = x.key in fields ? (fields[x.key] === null ? '' : (x.key in CE.edits ? CE.edits[x.key] : x.after)) : S.months[x.key][r.idx]; });
        S.availAll = null;
        App.openSheet('<h2>' + (ext ? 'اتمد العقد' : 'اتسجل التسليم المبكر') + '</h2><div class="msg ok">' + esc(r.name || r.code) + ': العقد بقى لحد ' + L.fmt(r.end) + ' في السطر ' + res.sheetRow + '.</div>' + App.checkHtml(res) +
          '<div style="display:flex;gap:8px"><button class="btn ghost" id="ceRow">روح للسطر</button><button class="btn primary" id="ceDone">تمام</button></div>');
        $('ceRow').onclick = function () { A.goToRow(r.idx); };
        $('ceDone').onclick = function () { CE = null; App.closeSheet(); };
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'تأكيد'; $('ceMsg').innerHTML = errHtml(e); });
    };
  }
  function totalAfterEdits(p) {
    var t = p.totalAfter;
    (p.rows || []).forEach(function (x) { if (x.key in CE.edits && F.keyToDate(x.key) >= F.keyToDate(F.FOLLOW_FROM)) t += CE.edits[x.key] - x.after; });
    return Math.round(t);
  }

  // ======================= الخروج والاستلام =======================
  var EX = { confirm: null, flash: '', check: '' };
  function drawExits() {
    var box = $('exitBox'); if (!box) return;
    var ex = F.exits(S.units, S.renters, S.settings || F.DEFAULT_SETTINGS, today());
    var row = function (it, key) {
      var r = it.r, n = it.next, id = key + r.idx;
      var act = it.received ? '<span class="badge live">اتستلمت</span>' :
        EX.confirm === id ? '<span style="display:flex;gap:8px;align-self:flex-start;flex:0 0 auto"><button class="btn primary" style="padding:6px 10px;font-size:12px;white-space:nowrap" data-rcv="' + r.idx + '">تأكيد الاستلام</button><button class="link" data-rx="1">إلغاء</button></span>' :
        '<button class="btn ghost" style="padding:6px 10px;font-size:12px;white-space:nowrap;align-self:flex-start;flex:0 0 auto" data-ask="' + id + '">تم الاستلام</button>';
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(App.unitTitle(it.unit) || r.unit) + '</div>' +
        '<div class="r2">' + esc(r.name || '—') + ' · خروج ' + L.fmt(r.end) + ' · <span dir="ltr">' + esc(r.code) + '</span></div>' +
        (n ? '<div class="r2" style="color:var(--brand)">الحجز الجاي: ' + esc(n.name || '—') + ' · دخول ' + L.fmt(n.start) + '</div>' : '') + '</div>' + act + '</div></div>';
    };
    var sec = function (title, arr, key, warn) {
      if (!arr.length) return '';
      return '<div class="r2" style="font-weight:700;margin:10px 2px 6px' + (warn ? ';color:var(--late,#b42318)' : '') + '">' + title + ' (' + arr.length + ')</div>' + arr.map(function (it) { return row(it, key); }).join('');
    };
    var html = sec('خروج النهارده', ex.today, 't') + sec('خروج امبارح', ex.yesterday, 'y') + sec('خرجوا قبل كده ولسه متستلموش', ex.older, 'o', true);
    box.innerHTML = (EX.flash ? '<div class="msg ok">' + esc(EX.flash) + '</div>' + (EX.check || '') : '') +
      '<div class="card"><h3>الخروج والاستلام</h3>' + (html || '<div class="r2">مفيش خروج النهارده ولا امبارح، ومفيش شقق مستنية استلام.</div>') + '</div>';
    EX.flash = ''; EX.check = '';
    box.querySelectorAll('button[data-ask]').forEach(function (b) { b.onclick = function () { EX.confirm = b.dataset.ask; drawExits(); }; });
    box.querySelectorAll('button[data-rx]').forEach(function (b) { b.onclick = function () { EX.confirm = null; drawExits(); }; });
    box.querySelectorAll('button[data-rcv]').forEach(function (b) {
      b.onclick = function () {
        var idx = +b.dataset.rcv, r = S.renters.filter(function (x) { return x.idx === idx; })[0]; if (!r) return;
        b.disabled = true; b.textContent = 'بيسجل…';
        A.updateRenter(idx, r.code, { 'موقف الاستلام': F.RECEIVED }).then(function (res) {
          r.receipt = F.RECEIVED; EX.confirm = null;
          EX.flash = 'اتسجل استلام ' + (App.unitTitle(unitOf(r.unit)) || r.unit) + ' في السطر ' + res.sheetRow + '.';
          EX.check = App.checkHtml(res);
          S.availAll = F.availability(S.units, S.renters, S.settings || F.DEFAULT_SETTINGS, today());
          drawExits(); drawAvail();
        }).catch(function (e) { b.disabled = false; b.textContent = 'تأكيد الاستلام'; alert(e.message || e); });
      };
    });
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
        '<div style="text-align:left;margin:-4px 2px 10px"><button class="link" id="bNew">+ حركة لأكتر من وحدة</button></div>' +
        '<div class="card"><h3>طباعة اليومية</h3><div style="display:flex;gap:8px;align-items:center"><input type="date" id="dDate" value="' + L.toISO(TR.day || today()) + '" max="' + L.toISO(today()) + '">' +
        '<button class="btn primary" id="dPdf" style="flex:0 0 auto;padding:8px 14px">PDF أو طباعة</button><button class="btn ghost" id="dXl">إكسيل</button></div><div class="r2" id="dMsg" style="margin-top:6px"></div></div>' +
        '<h3 style="font-size:13px;color:var(--muted);margin:4px 0">بحث في الحركات</h3>' +
        '<div class="grid2"><div><label>من</label><input type="date" id="tFrom" value="' + L.toISO(TR.from) + '"></div><div><label>إلى</label><input type="date" id="tTo" value="' + L.toISO(TR.to) + '"></div></div>' +
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
      TR.flash = ''; TR.check = '';
      bindExport('trExp', function () { return treasData(S.treasView || [], fileName(scopeName() ? 'حركات خزينة ' + scopeName() : 'حركات الخزينة', 'من ' + fdate(TR.from || today()), 'لـ ' + fdate(TR.to || today())), scopeName() ? 'حركات خزينة ' + scopeName() : 'حركات الخزينة', L.fmt(TR.from) + ' ← ' + L.fmt(TR.to) + (TR.cat ? ' · ' + TR.cat : '') + (TR.cash ? ' · ' + TR.cash : '')); });
      $('eNew').onclick = openEntry;
      $('bNew').onclick = openBulk;
      var daily = function () { var dd = L.parseISO($('dDate').value) || today(); TR.day = dd; return { d: dd, html: R.dailyHtml(S.treasury, S.units, S.cash, dd) }; };
      $('dPdf').onclick = function () { var x = daily(); R.openPrint(x.html, fileName(scopeName() ? 'يومية خزينة ' + scopeName() : 'يومية الخزينة', fdate(x.d))).then(function () { $('dMsg').textContent = 'اختار Save as PDF من نافذة الطباعة.'; }); };
      $('dXl').onclick = function () {
        var dd = L.parseISO($('dDate').value) || today(), ds = L.dateToSerial(dd), cc = S.treasury.cols, idx = [];
        for (var i = 0; i < cc['تاريخ'].length; i++) if (Math.floor(Number(cc['تاريخ'][i])) === ds) idx.push(i);
        $('dMsg').textContent = 'بيجهز الإكسيل…';
        R.downloadXlsx(treasData(idx, fileName(scopeName() ? 'يومية خزينة ' + scopeName() : 'يومية الخزينة', fdate(dd)), scopeName() ? 'يومية خزينة ' + scopeName() : 'يومية الخزينة', DAYS_AR[dd.getUTCDay()] + ' ' + L.fmt(dd)))
          .then(function () { $('dMsg').textContent = idx.length + ' حركة'; }, function (e) { $('dMsg').textContent = e.message || 'التحميل مش متاح هنا.'; });
      };
      drawTreas();
    }).catch(function (e) { box.innerHTML = errHtml(e); });
  }
  var DAYS_AR = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  function treasData(idx, name, title, sub) {
    var c = S.treasury.cols, ub = {}; S.units.forEach(function (u) { ub[u.code] = u; });
    var g = function (k, i) { return c[k] ? c[k][i] : ''; };
    return { name: name, title: title, sheet: 'الخزينة', sub: sub, sums: [1, 2],
      kinds: ['date', 'money', 'money', 'text', 'text', 'text', 'text', 'text', 'text', 'date', 'date', 'text', 'text', 'text'],
      headers: ['التاريخ', 'وارد', 'منصرف', 'الفئة', 'البيان', 'كود', 'الوحدة', 'كود المستأجر', 'شهر', 'من', 'إلى', 'الخزينة', 'رقم المستند', 'مراجعة'],
      rows: idx.map(function (i) { var u = ub[String(g('كود', i))] || {};
        return [L.serialToDate(g('تاريخ', i)), Number(g('ايراد', i)) || '', Number(g('مصروف', i)) || '', g('فئة', i), g('بيان', i), g('كود', i),
          [u.project, u.building, u.apt].filter(function (v) { return v && v !== '0'; }).join(' - '), g('كود المستأجر', i),
          g('شهر', i) ? L.monthKey(L.serialToDate(g('شهر', i))) : '', L.serialToDate(g('بداية الايجار', i)) || '', L.serialToDate(g('نهاية الايجار', i)) || '', g('كاش', i), g('رقم المستند', i), g('مراجعة', i)]; }) };
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
    }).join('') + (out.length > 100 ? '<div class="r2" style="padding:6px">ظاهر أحدث ١٠٠ حركة من ' + out.length + '. الإكسيل والـ PDF فيهم الكل.</div>' : '') : '<div class="empty" style="padding:8px">مفيش حركات بالفلتر ده.</div>';
  }

  window.OsoolScreens = {
    onTab: function (t) { if (t === 'coll') renderColl(); else if (t === 'avail') renderAvail(); else if (t === 'treas') renderTreas(); else if (t === 'owners') renderOwners(); else if (t === 'review') renderReview(); else if (t === 'cmp') renderCmp(); else if (t === 'ownerc') renderOwnerC(); else if (t === 'occ') renderOcc(); else if (t === 'prof') renderProf(); },
    startTransfer: startTransfer, openSettings: openSettings, openContractEdit: openContractEdit, openStatement: openStatement,
    ensureTreasury: ensureTreasury, openBulk: openBulk, openDeposits: openDeposits, ensureSettings: ensureSettings, openEntry: openEntry, bankHtml: bankHtml, bindBank: bindBank, openUrl: openUrl,
    setColl: function (v) { C.view = v; }, setOw: function (v) { OW.view = v; }, collDays: function () { return C.days; }, owDays: function () { return OW.days; }
  };
})();
