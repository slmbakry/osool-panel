/* الإدارة ← المطور: تجهيز داتا عقود الملاك للسيستم الجديد (كانت إضافة لوحدها: prep/)
   بيتحمّل أول ما التبويب يتفتح بس، وبيقرا الملف المفتوح بآخر تعديل */
(function () {
  'use strict';
  var App = window.OsoolApp, L = window.OsoolLogic, F = window.OsoolFollow;
  var $ = function (id) { return document.getElementById(id); };
  var esc = App.esc;
  var D = { started: false, settings: null, data: null, res: null, view: 'review', tab: 'find', skip: [] };
  // التصدير: أنواع التسويات اللي تتشال من ملف المطور (زي N-F)، ومحفوظة على الجهاز ده
  var SKIP_KEY = 'osoolPanel.devSkip';
  try { D.skip = JSON.parse(localStorage.getItem(SKIP_KEY) || '[]') || []; } catch (e) { D.skip = []; }
  var KINDS = [['', 'العادي'], ['F', 'F'], ['N-F', 'N-F']];
  function kindOf(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/[_\s]/g, '-'); }
  var MONTH_RE = /^[A-Z][a-z]{2}-\d{2}$/;
  var OWNER = ['كود', 'المشروع', 'بلوك', 'عمارة', 'شقة', 'الاسم', 'بداية العقد', 'نهاية العقد', 'قيمة الايجار', 'يسدد كل', 'التأمين', 'الدفع', 'تسويات', 'Beneficiary Name'];
  var ENTRY = ['تاريخ', 'ايراد', 'مصروف', 'كود', 'فئة', 'شهر', 'بداية الايجار', 'نهاية الايجار'];
  var GRP = { Mivida: 'ميفيدا', Village: 'فيلدج', Porto: 'بورتو', 'الخارج': 'الخارج' };
  var mock = function () { return !!window.PrepMock; };

  // ---------- تحميل ملفات الأداة (مرة واحدة) ----------
  function script(src) {
    return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('ملف ' + src + ' متحملش.')); }; document.head.appendChild(s); });
  }
  function libs() {
    var p = Promise.resolve();
    if (!window.OsoolPrep) p = p.then(function () { return script('prep/leases.js?v=20261029h'); });
    if (!window.OsoolBook) p = p.then(function () { return script('prep/book.js?v=20261029h'); });
    return p;
  }
  function loadExcelJS() { return window.ExcelJS ? Promise.resolve() : script('vendor/exceljs.min.js'); }

  // ---------- قراية ملف أصول (كل الشهور، على دفعات) ----------
  function readCols(ctx, t, H, names, say) {
    var list = names.map(function (h) { return [h, H.indexOf(h)]; }).filter(function (x) { return x[1] !== -1; });
    var out = {}, p = Promise.resolve(), done = 0;
    for (var s = 0; s < list.length; s += 3) (function (batch) {
      p = p.then(function () { return new Promise(function (ok) { setTimeout(ok, 40); }); }).then(function () {
        var rs = batch.map(function (x) { return t.columns.getItemAt(x[1]).getDataBodyRange().load('values'); });
        return ctx.sync().then(function () { batch.forEach(function (x, j) { out[x[0]] = rs[j].values.map(function (r) { return r[0]; }); }); done += batch.length; if (say) say(done, list.length); });
      });
    })(list.slice(s, s + 3));
    return p.then(function () { return out; });
  }
  function head(ctx, name) { var t = ctx.workbook.tables.getItem(name); var h = t.getHeaderRowRange().load('values'); return ctx.sync().then(function () { return { t: t, H: h.values[0].map(function (x) { return String(x == null ? '' : x).trim(); }) }; }); }
  function readBook(say) {
    if (mock()) return window.PrepMock().then(function (d) { D.ownerH = Object.keys(d.owner.cols).concat(Object.keys(d.owner.months || {})); return d; });
    return Excel.run(function (ctx) {
      var res = {};
      return head(ctx, 'owner').then(function (O) {
        D.ownerH = O.H;
        return readCols(ctx, O.t, O.H, OWNER, function (a, b) { say('شيت الملاك: ' + a + '/' + b); }).then(function (c) {
          res.owner = { cols: c };
          return readCols(ctx, O.t, O.H, O.H.filter(function (h) { return MONTH_RE.test(h); }), function (a, b) { say('شهور الملاك: ' + a + '/' + b); });
        }).then(function (m) { res.owner.months = m; });
      }).then(function () { return head(ctx, 'entry'); }).then(function (E) {
        return readCols(ctx, E.t, E.H, ENTRY, function (a, b) { say('الخزينة: ' + a + '/' + b); });
      }).then(function (t) { res.treasury = { cols: t }; return res; });
    });
  }

  // ---------- ملف المطور (من شكل فاضي جوه الأداة) ----------
  var SHEET = 'العقود Contracts';
  function cellVal(v) { if (v && typeof v === 'object') { if (v.formula !== undefined || v.sharedFormula !== undefined) return v.result; if (v instanceof Date) return L.dateToSerial(v); if (v.richText) return v.richText.map(function (x) { return x.text; }).join(''); } return v; }
  function readDev(buf) {
    return loadExcelJS().then(function () {
      var wb = new ExcelJS.Workbook();
      return wb.xlsx.load(buf).then(function () {
        var ws = wb.getWorksheet(SHEET); if (!ws) throw new Error('شكل ملف المطور ناقص (مفيش شيت "' + SHEET + '").');
        return { wb: wb, H: ws.getRow(1).values };
      });
    });
  }
  var DATE_COLS = ['تاريخ الإنهاء', 'تاريخ التوقيع', 'بداية العقد', 'نهاية العقد', 'تاريخ أول دفعة', 'مسدد حتى'];
  function shown(col, v) { if (v === null || v === undefined || v === '') return '—'; if (DATE_COLS.indexOf(col) !== -1 && typeof v === 'number' && v > 20000) return L.fmt(L.serialToDate(v)); return typeof v === 'number' ? v.toLocaleString('en-US') : String(v); }
  function template() { return fetch('prep/template.xlsx', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('شكل ملف المطور متحملش.'); return r.arrayBuffer(); }); }
  function buildFile() { return template().then(readDev).then(function (d) { OsoolBook.applyDev(d.wb, D.res, D.scopeName, { fresh: true, pure: true }); return d.wb.xlsx.writeBuffer(); }); }
  function buildExtras() { return loadExcelJS().then(function () { return OsoolBook.extrasBook(ExcelJS, D.res, D.scopeName).xlsx.writeBuffer(); }); }
  function buildReview() { return loadExcelJS().then(function () { return OsoolBook.reviewBook(ExcelJS, [{ src: D.scopeName, R: D.res }]).xlsx.writeBuffer(); }); }
  function download(buf, name) {
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000); window.__lastBuf = buf; window.__lastName = name;
  }
  function stamp() { var t = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(t.getDate()) + '-' + p(t.getMonth() + 1) + '-' + t.getFullYear(); }

  // ---------- الشاشة ----------
  function shell() {
    $('tab-dev').innerHTML =
      '<div class="dv-top"><span class="r2" id="dvScope">بيقرا الملف…</span><span class="dv-acts"><button id="dvRe">↻ اقرا تاني</button></span></div>' +
      '<div class="tgs" id="dvTabs"><button class="tg on" data-t="find">العقود</button><button class="tg" data-t="rev">المراجعة</button><button class="tg" data-t="dev">ملف المطور</button></div>' +
      '<div id="dvStatus"></div>' +
      '<section id="dv-find"><input id="dvQ" class="dv-srch" placeholder="ابحث بالكود، أو العمارة والشقة، أو المالك، أو المستفيد" autocomplete="off">' +
      '<div id="dvFind"><div class="r2" style="padding:8px 2px">اكتب أي جزء من الكود أو الاسم.</div></div></section>' +
      '<section id="dv-rev" class="hide"><div id="dvOut"></div></section>' +
      '<section id="dv-dev" class="hide"><div class="card"><h3 style="margin:0 0 6px">التصدير</h3><div class="r2" style="margin-bottom:6px">الوحدات اللي تدخل الملفات (حسب خانة التسويات):</div><div class="tgs" id="dvKinds"></div></div><div id="dvSum"></div><div class="card">' +
      '<div class="r2">ملف المطور بنفس شكله وشيتاته بالظبط: سطر لكل عقد، والأشهر الملغاة، والتعليمات. والتغييرات وكشف المستحقات في ملف لوحده، وملف المراجعة ليك انت بس.</div>' +
      '<button class="btn primary" id="dvSave" style="width:100%;margin-top:8px">حمّل ملف المطور</button>' +
      '<button class="btn ghost" id="dvSaveExt" style="width:100%;margin-top:8px">حمّل ملف التغييرات وكشف المستحقات</button>' +
      '<button class="btn ghost" id="dvSaveRev" style="width:100%;margin-top:8px">حمّل ملف مراجعة العقود والمستحقات</button><div id="dvMsg"></div></div></section>';
    $('dvTabs').onclick = function (e) {
      var b = e.target.closest('button[data-t]'); if (!b) return; D.tab = b.dataset.t;
      $('dvTabs').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      ['find', 'rev', 'dev'].forEach(function (t) { $('dv-' + t).classList.toggle('hide', t !== D.tab); });
    };
    $('dvRe').onclick = function () { analyze(); };
    var qt; $('dvQ').oninput = function () { clearTimeout(qt); qt = setTimeout(drawFind, 150); };
    $('dvSave').onclick = function () { save(this, buildFile, 'عقود الملاك للسيستم', 'لو هتكمّل على ملف أصول تاني، افتحه وطلّع ملفه من نفس المكان.'); };
    $('dvSaveExt').onclick = function () { save(this, buildExtras, 'تغييرات وكشف مستحقات الملاك', 'ده جنب ملف المطور، للتوضيح.'); };
    $('dvSaveRev').onclick = function () { save(this, buildReview, 'مراجعة العقود والمستحقات', 'ده ليك انت بس، مش للمطور.'); };
  }
  function save(btn, build, title, tip) {
    btn.disabled = true; $('dvMsg').innerHTML = '<div class="msg"><span class="spin"></span>بيجهز الملف…</div>';
    build().then(function (buf) {
      var name = title + ' - ' + D.scopeName + (D.skip.length ? ' - من غير ' + D.skip.join(' و') : '') + ' - ' + stamp() + '.xlsx';
      download(buf, name); btn.disabled = false;
      $('dvMsg').innerHTML = '<div class="msg ok">اتحمّل: ' + esc(name) + '. ' + tip + '</div>';
    }).catch(function (e) { btn.disabled = false; $('dvMsg').innerHTML = '<div class="msg err">' + esc(e.message || e) + '</div>'; });
  }
  // كل بند زي الشات: الكود والمالك والوحدة، وزراير روح للسطر وجدّد وعدّل
  function card(code, badge, cls, body, mkey) {
    var u = (D.res.units || {})[code] || {};
    return '<div class="dv-item"><div class="hd"><b class="ltr">' + esc(code) + '</b> · ' + esc(u.owner || '') +
      '<span class="c ' + cls + '">' + esc(badge) + '</span></div>' +
      (u.title ? '<div class="r2 ut">' + esc(u.title) + '</div>' : '') +
      '<div class="r2">' + body + '</div>' + (u.idx !== undefined ? btns(code, mkey) : '') + '</div>';
  }
  function btns(code, mkey) {
    return '<div class="dv-btns"><button class="go" data-code="' + esc(code) + '"' + (mkey ? ' data-m="' + esc(mkey) + '"' : '') + '>روح للسطر' + (mkey ? ' (' + esc(L.monthLabel(mkey)) + ')' : '') + '</button>' +
      '<button class="go" data-ren="' + esc(code) + '">جدّد العقد</button><button class="go" data-edt="' + esc(code) + '">عدّل العقد</button></div>';
  }
  function draw() {
    var R = D.res, list, M = function (s) { return L.monthKey(L.serialToDate(s)); };
    var bad = R.dues.filter(function (x) { return x.state !== 'مظبوط'; });
    var reviews = R.changes.filter(function (x) { return x.kind === 'review'; }), notes = R.changes.filter(function (x) { return x.kind === 'note' || x.kind === 'fix'; });
    var tabs = [['review', 'محتاج قرار', reviews.length], ['dues', 'المستحقات', bad.length], ['note', 'ملاحظات', notes.length], ['skip', 'أشهر ملغاة', R.skipped.length]];
    if (D.view === 'dues') list = bad.sort(function (a, b) { return Math.abs(b.balance) - Math.abs(a.balance); }).map(function (x) {
      var sh = x.months.filter(function (m) { return m.state === 'ناقص' || m.state === 'زايد'; });
      return card(x.code, x.state, x.balance > 0 ? 'review' : 'note', 'مستحق ' + esc(shown('', x.due)) + ' · مدفوع ' + esc(shown('', x.paid)) + ' · الفرق <b>' + esc(shown('', x.balance)) + '</b>' +
        (sh.length ? '<br>' + sh.map(function (m) { return esc(L.monthLabel(m.key)) + ': ' + esc(shown('', m.diff)); }).join('، ') : ''), sh.length ? sh[0].key : '');
    });
    else if (D.view === 'note') list = notes.map(function (x) { return card(x.code, 'ملاحظة', 'note', esc(x.why)); });
    else if (D.view === 'review') list = reviews.map(function (x) { var mk = (/(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر) (\d{4})/.exec(x.why) || [])[0]; return card(x.code, 'قرار', 'review', esc(x.why), mk ? keyOfLabel(mk) : ''); });
    else list = R.skipped.map(function (x) { return card(x.code, 'شهر ملغي', 'skip', esc(L.monthLabel(M(x.month))) + ' فاضي في الشيت', M(x.month)); });
    $('dvOut').innerHTML = '<div class="tgs dv-sub">' + tabs.map(function (t) { return '<button class="tg' + (D.view === t[0] ? ' on' : '') + '" data-v="' + t[0] + '">' + t[1] + ' <bdi>' + t[2] + '</bdi></button>'; }).join('') + '</div>' +
      '<div class="card dv-list">' + (list.length ? list.slice(0, 400).join('') + (list.length > 400 ? '<div class="r2">ظاهر ٤٠٠ من ' + list.length + '، والكل في ملف المراجعة.</div>' : '') : '<div class="r2" style="padding:8px 0">مفيش.</div>') + '</div>';
    $('dvOut').querySelectorAll('.dv-sub .tg').forEach(function (b) { b.onclick = function () { D.view = b.dataset.v; draw(); }; });
    bindGo($('dvOut'));
    drawDev(); drawFind();
  }
  function drawDev() {
    var R = D.res, c = R.counts, bad = R.dues.filter(function (x) { return x.state !== 'مظبوط'; });
    var nRev = R.changes.filter(function (x) { return x.kind === 'review'; }).length, nNote = R.changes.filter(function (x) { return x.kind === 'note' || x.kind === 'fix'; }).length;
    var box = function (v, k, red) { return '<div class="box"><div class="v"' + (red ? ' style="color:var(--err)"' : '') + '>' + v + '</div><div class="k">' + k + '</div></div>'; };
    $('dvSum').innerHTML = '<div class="sum">' + box(R.scope, 'وحدة في نطاق الملف') + box(R.newRows.length, 'عقد (منهم ' + c.renewals + ' تجديد بعد 1/7)') +
      box(nRev, 'محتاج قرار', 1) + box(bad.length, 'وحدة عليها ناقص', 1) + box(nNote, 'ملاحظة') + box(c.outSkipped, 'وحدة خارج التشغيل اتعدّت') + '</div>';
  }
  // العقود: بحث ← العقد الحالي ومدته وقيمته ومسدد حتى
  function drawFind() {
    if (!D.res) return;
    var q = L.norm($('dvQ').value || '').trim(), box = $('dvFind');
    if (!q) { box.innerHTML = '<div class="r2" style="padding:8px 2px">اكتب أي جزء من الكود أو الاسم.</div>'; return; }
    var c = D.data.owner.cols, ws = q.split(/\s+/), hits = [];
    Object.keys(D.res.units).forEach(function (code) {
      var u = D.res.units[code], i = u.idx, ben = c['Beneficiary Name'] ? c['Beneficiary Name'][i] : '';
      var hay = L.norm([code, u.owner, u.title, c['عمارة'] && c['عمارة'][i], c['شقة'] && c['شقة'][i], (c['عمارة'] && c['عمارة'][i]) + '-' + (c['شقة'] && c['شقة'][i]), ben].join(' '));
      if (ws.every(function (w) { return hay.indexOf(w) !== -1; })) hits.push(code);
    });
    box.innerHTML = hits.length ? hits.slice(0, 30).map(contractCard).join('') + (hits.length > 30 ? '<div class="r2">ظاهر ٣٠ من ' + hits.length + '، دقق البحث.</div>' : '') : '<div class="r2" style="padding:8px 2px">مفيش وحدة بالبيانات دي في نطاق الملف.</div>';
    bindGo(box);
  }
  function contractCard(code) {
    var u = D.res.units[code] || {}, rows = D.res.newRows.filter(function (n) { return n.code === code; }).sort(function (a, b) { return (a.values['بداية العقد'] || 0) - (b.values['بداية العقد'] || 0); });
    var ben = D.data.owner.cols['Beneficiary Name'] ? D.data.owner.cols['Beneficiary Name'][u.idx] : '';
    var dt = function (v) { return v ? L.fmt(L.serialToDate(v)) : '—'; };
    var flags = D.res.changes.filter(function (x) { return x.code === code && x.kind === 'review'; }).length;
    return '<div class="dv-ct"><div class="hd"><b class="ltr">' + esc(code) + '</b> · ' + esc(u.owner || '') + (flags ? '<span class="c review">' + flags + ' قرار</span>' : '') + '</div>' +
      '<div class="r2">' + esc(u.title || '') + (ben && ben !== u.owner ? ' · المستفيد: ' + esc(ben) : '') + '</div>' +
      (rows.length ? '<div class="rows">' + rows.map(function (n) {
        var v = n.values, st = String(v['الحالة'] || '').split(' /')[0];
        return '<div class="row"><span><span class="p">' + dt(v['بداية العقد']) + ' ← ' + dt(v['نهاية العقد']) + '</span> <span class="r2">' + esc(st) + '</span></span>' +
          '<span><span class="v">' + esc(shown('', v['الإيجار الشهري (السنة الأولى)'])) + '</span> <span class="r2">· مسدد حتى ' + dt(v['مسدد حتى']) + '</span></span></div>';
      }).join('') + '</div>' : '<div class="r2">مفيش عقد طالع للوحدة دي.</div>') + btns(code) + '</div>';
  }
  function bindGo(root) {
    root.querySelectorAll('.go').forEach(function (b) { b.onclick = function () {
      if (b.dataset.ren) editContract('renew', b.dataset.ren); else if (b.dataset.edt) editContract('edit', b.dataset.edt); else goTo(b.dataset.code, b.dataset.m);
    }; });
  }
  var AR_M = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  function keyOfLabel(t) { var p = t.split(' '); var mi = AR_M.indexOf(p[0]); return mi < 0 ? '' : L.monthKey(new Date(Date.UTC(+p[1], mi, 1))); }

  // ---------- تعديل عقد المالك (نفس فورم الملاك) وبعده يحلل تاني ----------
  function unitsFromData() {
    var c = D.data.owner.cols, out = [], g = function (k, i) { return c[k] ? c[k][i] : ''; };
    for (var i = 0; i < (c['كود'] || []).length; i++) {
      var code = String(g('كود', i) == null ? '' : g('كود', i)).trim(); if (!code) continue;
      var e = g('نهاية العقد', i);
      out.push({ idx: i, code: code, project: g('المشروع', i) || '', block: g('بلوك', i) || '', building: String(g('عمارة', i) || ''), apt: String(g('شقة', i) || ''), owner: g('الاسم', i) || '', settle: g('تسويات', i) || '', ownerEnd: e ? L.serialToDate(e) : null, every: Number(g('يسدد كل', i)) || 1 });
    }
    return out;
  }
  function editContract(mode, code) {
    var units = unitsFromData(), u = units.filter(function (x) { return x.code === String(code); })[0]; if (!u || !window.OsoolOwnerForm) return;
    OsoolOwnerForm.create({ S: { units: units, ownerMonths: D.data.owner.months }, A: App.A, L: L, F: F, $: $, esc: esc, money: App.money, digits: App.digits,
      today: function () { return L.todayUTC(); }, App: App,
      errHtml: function (e) { return '<div class="msg err">' + esc((e && e.message) || e) + '</div>'; },
      loadingHtml: function (t) { return '<div class="loading"><span class="spin"></span>' + esc(t) + '</div>'; },
      onDone: function () { analyze(); } }).open(mode, u);
  }
  function goTo(code, mkey) {
    var u = (D.res.units || {})[code]; if (!u) return;
    if (mock()) { window.__goto = [code, u.idx, mkey || '']; return; }
    Excel.run(function (ctx) {
      var t = ctx.workbook.tables.getItem('owner'), body = t.getDataBodyRange(), ci = mkey ? D.ownerH.indexOf(mkey) : -1;
      var r = ci >= 0 ? body.getCell(u.idx, ci) : body.getRow(u.idx);
      t.worksheet.activate(); r.select();
      return ctx.sync();
    }).catch(function (e) { $('dvStatus').innerHTML = '<div class="msg err">' + esc(e.message || e) + '</div>'; });
  }

  // ---------- النطاق: هو نفسه نطاق اللوحة (إعدادات ⚙)، وبيتسمى بأسماء المشاريع اللي جواه ----------
  function scopeName(st) {
    var p = st.projects || []; if (st.mode === 'only') return p.map(function (x) { return GRP[x] || x; }).join(' و');
    return p.length ? 'كل المشاريع ما عدا ' + p.join('، ') : 'كل المشاريع';
  }
  function pickFrom(st) { D.pick = {}; (D.projects || []).forEach(function (p) { D.pick[p.key] = F.inScope({ project: p.name }, st, true); }); }
  function applyPick() {
    var sel = (D.projects || []).filter(function (p) { return D.pick[p.key]; });
    D.settings = Object.assign({}, D.fileSettings, { mode: 'only', projects: sel.map(function (p) { return p.name; }) });
    var gs = F.groupsIn(sel.map(function (p) { return { project: p.name }; }));
    D.scopeName = gs.map(function (g) {
      var all = (D.projects || []).filter(function (p) { return F.groupOf(p.name) === g; }), mine = sel.filter(function (p) { return F.groupOf(p.name) === g; });
      if (mine.length === all.length) return GRP[g] || g;
      var out = all.filter(function (p) { return mine.indexOf(p) === -1; });
      if (mine.length <= 3) return mine.map(function (p) { return p.name; }).join(' و');
      return (GRP[g] || g) + (out.length <= 3 ? ' ما عدا ' + out.map(function (p) { return p.name; }).join(' و') : ' (جزء)');
    }).join(' و') || 'مفيش';
    $('dvScope').innerHTML = 'النطاق: <b>' + esc(D.scopeName) + '</b> <span class="r2">(من إعدادات اللوحة)</span>';
  }

  // بيقرا الملف ويحلل (أول ما التبويب يتفتح، وبعد أي تعديل، ومن زرار اقرا تاني)
  // اختيار أنواع التسويات في التصدير، وعدد وحدات كل نوع جوه النطاق
  function drawKinds() {
    var box = $('dvKinds'); if (!box || !D.data) return;
    var c = D.data.owner.cols, n = {};
    (c['كود'] || []).forEach(function (code, i) {
      if (!String(code == null ? '' : code).trim()) return;
      var u = { project: c['المشروع'] ? c['المشروع'][i] : '', settle: c['تسويات'] ? c['تسويات'][i] : '' };
      if (!F.inScope(u, Object.assign({}, D.settings, { nf: true }), true)) return;
      var k = kindOf(u.settle); if (k === 'OUT') return; if (k !== 'F' && k !== 'N-F') k = '';
      n[k] = (n[k] || 0) + 1;
    });
    box.innerHTML = KINDS.filter(function (x) { return x[0] === '' || n[x[0]]; }).map(function (x) {
      var on = D.skip.indexOf(x[0]) === -1;
      return '<button class="tg' + (on ? ' on' : '') + '" data-k="' + esc(x[0]) + '"' + (x[0] === '' ? ' disabled' : '') + '><bdi>' + esc(x[1]) + '</bdi> <bdi>' + (n[x[0]] || 0) + '</bdi></button>';
    }).join('');
    box.querySelectorAll('button[data-k]').forEach(function (b) { b.onclick = function () {
      var k = b.dataset.k, i = D.skip.indexOf(k); if (!k) return;
      if (i === -1) D.skip.push(k); else D.skip.splice(i, 1);
      try { localStorage.setItem(SKIP_KEY, JSON.stringify(D.skip)); } catch (e) { }
      analyze(D.data);
    }; });
  }
  function analyze(have) {
    var say = function (t) { $('dvStatus').innerHTML = '<div class="msg"><span class="spin"></span>' + esc(t) + '</div>'; };
    say('بيقرا ملف أصول…'); $('dvRe').disabled = true;
    return (have && have.owner ? Promise.resolve(have) : readBook(say)).then(function (data) {
      D.data = data; say('بيحلل…');
      D.res = OsoolPrep.reconcile({ devRows: [], owner: D.data.owner, treasury: D.data.treasury, settings: Object.assign({}, D.settings, { devSkip: D.skip }) });
      drawKinds();
      $('dvStatus').innerHTML = ''; $('dvRe').disabled = false; draw();
    }).catch(function (e) { $('dvRe').disabled = false; $('dvStatus').innerHTML = '<div class="msg err">' + esc(e.message || e) + '</div>'; });
  }
  function start() {
    shell();
    $('dvStatus').innerHTML = '<div class="msg"><span class="spin"></span>بيحمّل الأداة…</div>';
    return libs().then(function () { return mock() ? (window.__settings || F.DEFAULT_SETTINGS) : App.S.settings || (window.OsoolStore ? OsoolStore.read() : null); }).then(function (st) {
      st = st || F.DEFAULT_SETTINGS;
      D.fileSettings = st; D.settings = st; D.stKey = JSON.stringify(App.S.settings || null); D.scopeName = scopeName(st);
      return readBook(function (t) { $('dvStatus').innerHTML = '<div class="msg"><span class="spin"></span>' + esc(t) + '</div>'; });
    }).then(function (data) {
      var cnt = {}, name = {};
      (data.owner.cols['المشروع'] || []).forEach(function (v) { var p = String(v == null ? '' : v).trim(); if (!p) return; var k = p.toLowerCase(); cnt[k] = (cnt[k] || 0) + 1; if (!name[k]) name[k] = p; });
      D.projects = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).map(function (k) { return { key: k, name: name[k], n: cnt[k] }; });
      pickFrom(D.fileSettings); applyPick();
      return analyze(data);
    }).catch(function (e) { $('dvStatus').innerHTML = '<div class="msg err">' + esc(e.message || e) + '</div>'; });
  }

  // لو نطاق اللوحة اتغير من الإعدادات، نحلل تاني بالنطاق الجديد من غير ما نقرا الملف تاني
  function resync() {
    var k = JSON.stringify(App.S.settings || null); if (k === D.stKey || !D.projects || !D.data) return;
    D.stKey = k; D.fileSettings = App.S.settings || F.DEFAULT_SETTINGS; pickFrom(D.fileSettings); applyPick(); analyze(D.data);
  }
  window.OsoolDev = { open: function () { if (!App.cmpOn()) return; if (!D.started) { D.started = true; start(); } else resync(); } };
})();
