/* لوحة أصول — الرئيسية: دور الجهاز، ملخص اليوم، والمفضلة (محفوظة في المتصفح ده بس) */
(function () {
  'use strict';
  var App = window.OsoolApp, F = window.OsoolFollow, L = App.L, S = App.S, A = App.A;
  var $ = App.$, esc = App.esc, money = App.money;
  var SC = function () { return window.OsoolScreens; };
  var DAY = 864e5;

  // ---------- تخزين المتصفح (ممكن يكون مقفول، فدايماً فيه بديل في الذاكرة) ----------
  var MEM = {};
  function get(k) { try { var v = localStorage.getItem('osoolPanel.' + k); return v === null ? MEM[k] || null : v; } catch (e) { return MEM[k] || null; } }
  function put(k, v) { MEM[k] = v; try { localStorage.setItem('osoolPanel.' + k, v); } catch (e) {} }

  var ROLES = {
    treas: { name: 'خزينة', desc: 'التحصيل والسداد والمصروفات والإيرادات', focus: 'daily', favs: ['coll_due', 'owners_due', 'daily_y', 'review_t'] },
    tenants: { name: 'مستأجرين', desc: 'المتأخرين والعقود والتسليمات', focus: 'exits', favs: ['late', 'ends_week', 'avail', 'new_contract'] },
    owners: { name: 'ملاك', desc: 'عقود الملاك وسدادهم ومواعيد أقساطهم', focus: 'payout', favs: ['owners_late', 'owners_soon', 'owner_ends'] },
    all: { name: 'الكل', desc: 'كل حاجة، ومعاها المراجعة', focus: 'kpis', favs: ['review_t', 'exits', 'daily_t', 'by_op'] }
  };
  function role() { var r = get('role'); return ROLES[r] ? r : null; }
  function favs() {
    var r = role() || 'all', v = get('fav.' + r);
    try { v = v ? JSON.parse(v) : null; } catch (e) { v = null; }
    return (v || ROLES[r].favs).filter(function (id) { return CARDS[id]; });
  }
  function setFavs(list) { put('fav.' + (role() || 'all'), JSON.stringify(list)); }

  var H = { edit: false, open: -1, flash: '', check: '', busy: false };
  function today() { return L.todayUTC(); }
  function ser(d) { return L.dateToSerial(d); }
  var WD = ['الأحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];
  var MN = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // ---------- الأرقام ----------
  function compute() {
    var t = today(), st = S.settings || F.DEFAULT_SETTINGS, D = {};
    var cd = SC().collDays(), od = SC().owDays();
    var fu = F.followUp({ units: S.units, renters: S.renters, months: S.months, ledger: S.ledger }, st, t);
    fu.forEach(function (x) { x.exp = F.expectedIn(x, t, cd); });
    D.late = fu.filter(function (x) { return x.late && x.r.end >= t; });
    D.soon = fu.filter(function (x) { return !x.late && x.exp; });
    D.lateAmt = D.late.reduce(function (a, x) { return a + x.balance; }, 0);
    D.soonAmt = D.soon.reduce(function (a, x) { return a + x.exp.amount; }, 0);
    D.cd = cd; D.od = od;
    D.ow = F.ownerFollow(S.units, S.treasury, S.ownerMonths, st, t, od);
    D.owLate = D.ow.filter(function (x) { return x.status === 'late'; });
    D.owSoon = D.ow.filter(function (x) { return x.status === 'soon'; });
    D.owReq = D.owLate.concat(D.owSoon).reduce(function (a, x) { return a + x.required; }, 0);
    D.ex = F.exits(S.units, S.renters, st, t);
    D.pending = D.ex.today.concat(D.ex.yesterday, D.ex.older).filter(function (x) { return !x.received; });
    var av = F.availability(S.units, S.renters, st, t);
    D.free = av.filter(function (x) { return !x.current && !x.pending; });
    var ops = av.filter(function (x) { return !(x.current && x.current.end.getUTCFullYear() >= 2090); });
    D.occ = ops.length ? Math.round(100 * ops.filter(function (x) { return x.current; }).length / ops.length) : 0;
    var byP = {}; D.free.forEach(function (x) { var p = F.groupOf(x.unit.project); byP[p] = (byP[p] || 0) + 1; });
    D.freeTxt = Object.keys(byP).sort(function (a, b) { return byP[b] - byP[a]; }).slice(0, 3).map(function (p) { return p + ' ' + byP[p]; }).join('، ');
    var wk = new Date(t.getTime() + 7 * DAY), ub = {}; S.units.forEach(function (u) { ub[u.code] = u; });
    D.ends = S.renters.filter(function (r) {
      var u = ub[r.unit];
      if (r.idx < 0 || !r.end || r.end < t || r.end > wk || !u || !F.inScope(u, st) || /ملغ[يى]/.test(r.name || '')) return false;
      return !S.renters.some(function (o) { return o !== r && o.unit === r.unit && o.start && o.start > r.end && o.name === r.name; });
    }).sort(function (a, b) { return a.end - b.end; });
    var e60 = new Date(t.getTime() + 60 * DAY);
    D.ownEnds = S.units.filter(function (u) { return F.inScope(u, st) && u.ownerEnd && u.ownerEnd >= t && u.ownerEnd <= e60; }).sort(function (a, b) { return a.ownerEnd - b.ownerEnd; });
    // الخزينة: النهارده وامبارح
    var c = S.treasury.cols, n = c['تاريخ'].length, ts = ser(t), ys = ts - 1;
    D.dT = { inn: 0, out: 0, ni: 0, no: 0 }; D.dY = { inn: 0, out: 0, ni: 0, no: 0 };
    var flags = 0;
    for (var i = 0; i < n; i++) {
      var d = Math.floor(Number(c['تاريخ'][i]) || 0), o = d === ts ? D.dT : d === ys ? D.dY : null;
      if (o) { var a = Number(c['ايراد'][i]) || 0, b = Number(c['مصروف'][i]) || 0; o.inn += a; o.out += b; if (a) o.ni++; if (b) o.no++; }
      if (c['مراجعة'] && String(c['مراجعة'][i] || '').trim()) { var u = ub[String(c['كود'] ? c['كود'][i] : '')]; if (!u || F.inScope(u, st)) flags++; }
    }
    D.flags = flags;
    var byOp = {}; D.late.forEach(function (x) { var k = x.r.operation || 'بدون مسؤول'; byOp[k] = (byOp[k] || 0) + 1; });
    D.byOpTxt = Object.keys(byOp).sort(function (a, b) { return byOp[b] - byOp[a]; }).slice(0, 3).map(function (k) { return k + ' ' + byOp[k]; }).join('، ');
    return D;
  }

  // ---------- الكروت ----------
  function go(tab, fn) { return function () { if (fn) fn(); App.showTab(tab); }; }
  var CARDS = {
    coll_due: { t: 'تحصيلات مستحقة', icon: 'down', sub: function (D) { return 'متأخر ومستحق خلال ' + D.cd + ' يوم · ' + money(Math.round(D.lateAmt + D.soonAmt)); }, n: function (D) { return D.late.length + D.soon.length; }, go: go('coll', function () { SC().setColl('due'); }) },
    late: { t: 'المتأخرين', icon: 'clock', cls: 'r', sub: function (D) { return 'الأكتر تأخير الأول · ' + money(Math.round(D.lateAmt)); }, n: function (D) { return D.late.length; }, go: go('coll', function () { SC().setColl('late'); }) },
    soon: { t: 'المستحقين', icon: 'cal', sub: function (D) { return 'خلال ' + D.cd + ' يوم · ' + money(Math.round(D.soonAmt)); }, n: function (D) { return D.soon.length; }, go: go('coll', function () { SC().setColl('soon'); }) },
    owners_due: { t: 'سدادات ملاك مستحقة', icon: 'up', sub: function (D) { return 'متأخر ومستحق خلال ' + D.od + ' يوم · ' + money(D.owReq); }, n: function (D) { return D.owLate.length + D.owSoon.length; }, go: go('owners', function () { SC().setOw('due'); }) },
    owners_late: { t: 'ملاك متأخر سدادهم', icon: 'clock', cls: 'r', sub: function () { return 'الأقدم الأول'; }, n: function (D) { return D.owLate.length; }, go: go('owners', function () { SC().setOw('late'); }) },
    owners_soon: { t: 'ملاك مستحقين', icon: 'cal', sub: function (D) { return 'خلال ' + D.od + ' يوم'; }, n: function (D) { return D.owSoon.length; }, go: go('owners', function () { SC().setOw('due'); }) },
    owner_ends: { t: 'عقود ملاك بتخلص قريب', icon: 'doc', sub: function () { return 'خلال 60 يوم'; }, n: function (D) { return D.ownEnds.length; }, go: function () { listOwnerEnds(); } },
    exits: { t: 'مستنية استلام', icon: 'door', sub: function () { return 'من قايمة الخروج'; }, n: function (D) { return D.pending.length; }, go: go('avail') },
    ends_week: { t: 'عقود بتخلص الأسبوع ده', icon: 'renew', sub: function () { return 'تتمد ولا تخرج؟'; }, n: function (D) { return D.ends.length; }, go: function () { listEnds(); } },
    avail: { t: 'المتاح النهارده', icon: 'key', cls: 'g', sub: function (D) { return D.freeTxt || 'مفيش'; }, n: function (D) { return D.free.length; }, go: go('avail') },
    new_contract: { t: 'عقد أو حجز جديد', icon: 'plus', sub: function () { return 'الكود والنهاية والاستحقاق بيتحسبوا لوحدهم'; }, n: function () { return ''; }, go: go('new') },
    new_entry: { t: 'حركة خزينة جديدة', icon: 'plus', sub: function () { return 'تحصيل، سداد، مصروف، إيراد'; }, n: function () { return ''; }, go: function () { SC().openEntry({}); } },
    daily_t: { t: 'يومية النهارده', icon: 'print', sub: function (D) { return 'وارد ' + money(D.dT.inn) + ' · منصرف ' + money(D.dT.out); }, n: function (D) { return sign(D.dT.inn - D.dT.out); }, nc: function (D) { return D.dT.inn - D.dT.out >= 0 ? 'g' : 'r'; }, go: go('treas') },
    daily_y: { t: 'يومية امبارح', icon: 'print', sub: function (D) { return 'وارد ' + money(D.dY.inn) + ' · منصرف ' + money(D.dY.out); }, n: function (D) { return sign(D.dY.inn - D.dY.out); }, nc: function (D) { return D.dY.inn - D.dY.out >= 0 ? 'g' : 'r'; }, go: go('treas') },
    review_t: { t: 'حركات محتاجة مراجعة', icon: 'check', cls: 'r', sub: function () { return 'أخطاء مستأجر أو مالك في الخزينة'; }, n: function (D) { return D.flags; }, go: go('review') },
    by_op: { t: 'المتأخرين حسب المسؤول', icon: 'user', sub: function (D) { return D.byOpTxt || 'مفيش متأخرين'; }, n: function (D) { return D.late.length; }, go: go('coll', function () { SC().setColl('late'); }) }
  };
  function sign(v) { v = Math.round(v); return (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v)); }
  function ico(n) { return '<svg><use href="#i-' + n + '"/></svg>'; }

  // ---------- الجملة اللي فوق ----------
  function say(D, r) {
    var b = function (x) { return '<b>' + x + '</b>'; };
    if (r === 'treas') return 'قدامك ' + b(D.late.length + D.soon.length + ' تحصيل') + ' بـ ' + b(money(Math.round(D.lateAmt + D.soonAmt))) + '، و' + b(D.owLate.length + D.owSoon.length + ' سداد ملاك') + ' بـ ' + b(money(D.owReq)) + '.';
    if (r === 'tenants') return b(D.pending.length + ' شقق') + ' مستنية استلام، و' + b(D.late.length + ' متأخرين') + '، و' + b(D.ends.length + ' عقود') + ' بتخلص الأسبوع ده.';
    if (r === 'owners') return b(D.owLate.length + ' مالك') + ' متأخر سدادهم، و' + b(D.owSoon.length) + ' مستحقين خلال ' + D.od + ' يوم. المطلوب كله ' + b(money(D.owReq)) + '.';
    return 'الإشغال ' + b(D.occ + '%') + '. المتأخرات ' + b(money(Math.round(D.lateAmt))) + ' على ' + D.late.length + ' مستأجر، و' + b(D.flags) + ' حركة محتاجة مراجعة.';
  }

  // ---------- أول كارت حسب الدور ----------
  function focus(D, r) {
    if (r === 'treas') {
      return '<div class="focus"><h3>' + ico('cash') + 'يومية النهارده لحد دلوقتي</h3><div class="bigs"><div><div class="v vin">+ ' + money(D.dT.inn) + '</div><div class="k">وارد · ' + D.dT.ni + ' حركة</div></div>' +
        '<div><div class="v vout">− ' + money(D.dT.out) + '</div><div class="k">منصرف · ' + D.dT.no + ' حركة</div></div></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn primary" id="hNewE">+ حركة خزينة جديدة</button><button class="btn ghost" id="hDaily">اطبع اليومية</button></div></div>';
    }
    if (r === 'tenants') {
      var ex = D.ex, items = ex.today.concat(ex.yesterday, ex.older).slice(0, 4);
      return '<div class="focus"><h3>' + ico('door') + 'الخروج والاستلام<button class="link" id="hExAll">الكل</button></h3>' + (items.length ? items.map(function (it) {
        var r0 = it.r, when = +r0.end === +today() ? 'خروج النهارده' : +r0.end === +today() - DAY ? 'خرج امبارح' : 'خرج ' + L.fmt(r0.end);
        return '<div class="mini"><div class="t"><b>' + esc(App.unitTitle(it.unit) || r0.unit) + '</b><i>' + esc(r0.name || '—') + ' · ' + when + (it.next ? ' · الجاي يدخل ' + L.fmt(it.next.start) : '') + '</i></div>' +
          (it.received ? '<span class="tagx ok">اتستلمت</span>' : '<button class="act" data-goex="1">استلام</button>') + '</div>';
      }).join('') : '<div class="r2" style="padding:6px 0">مفيش خروج النهارده ولا امبارح، ومفيش شقق مستنية استلام.</div>') + '</div>';
    }
    if (r === 'owners') {
      var list = D.owLate.concat(D.owSoon).slice(0, 3);
      return '<div class="focus"><h3>' + ico('bank') + 'جاهز للتحويل<button class="link" id="hOwAll">الكل</button></h3>' + (list.length ? list.map(function (x, i) {
        return '<div class="mini" data-own="' + i + '" style="cursor:pointer"><div class="t"><b>' + esc(x.unit.owner || '—') + '</b><i>' + esc(App.unitTitle(x.unit) || x.unit.code) + ' · كل ' + x.every + ' شهر · ' + money(x.required) + '</i></div>' +
          (x.status === 'late' ? '<span class="tagx late">متأخر ' + (-x.daysLeft) + ' يوم</span>' : '<span class="tagx soon">باقي ' + x.daysLeft + ' يوم</span>') + '</div>' +
          (H.open === i ? SC().bankHtml(x, 'hbk' + i) + '<div style="display:flex;gap:8px;margin:8px 0 4px"><button class="btn primary" data-pay="' + i + '">تسجيل السداد</button></div>' : '');
      }).join('') : '<div class="r2" style="padding:6px 0">مفيش ملاك مستحقين خلال ' + D.od + ' يوم.</div>') + '</div>';
    }
    return '<div class="focus"><h3>' + ico('home') + 'الصورة كلها</h3><div class="kgrid">' +
      '<button data-k="late"><div class="v late">' + money(Math.round(D.lateAmt)) + '</div><div class="k">متأخرات المستأجرين</div></button>' +
      '<button data-k="soon"><div class="v">' + money(Math.round(D.soonAmt)) + '</div><div class="k">متوقع خلال ' + D.cd + ' يوم</div></button>' +
      '<button data-k="owners_due"><div class="v">' + money(D.owReq) + '</div><div class="k">مطلوب للملاك</div></button>' +
      '<button data-k="avail"><div class="v okc">' + D.free.length + '</div><div class="k">شقة فاضية النهارده</div></button></div></div>';
  }

  // ---------- الرسم ----------
  function hero(D) {
    var t = today(), r = role();
    $('hero').innerHTML = '<button class="hrole" id="hRole">' + esc(r ? ROLES[r].name : 'اختار الدور') + '</button>' +
      '<div class="hdate">' + WD[t.getUTCDay()] + ' <span>' + t.getUTCDate() + '</span> ' + MN[t.getUTCMonth()] + '</div>' +
      '<div class="hsay">' + (D ? say(D, r || 'all') : 'بيجهز ملخص النهارده…') + '</div>';
    $('hRole').onclick = pickRole;
  }
  function render() {
    var box = $('tab-home'); if (!box || S.tab !== 'home') return;
    hero(null);
    if (!role()) { box.innerHTML = ''; pickRole(true); return; }
    if (!S.ledger) box.innerHTML = '<div class="loading"><div class="spin"></div>بيقرا الخزينة…</div>';
    SC().ensureSettings().then(SC().ensureTreasury).then(function () {
      if (S.tab !== 'home') return;
      var D = compute(), r = role(), fl = favs();
      hero(D);
      box.innerHTML = (H.flash ? '<div class="msg ok">' + esc(H.flash) + '</div>' + (H.check || '') : '') + focus(D, r) +
        '<div class="lh">مفضلتي<button class="link" id="hEdit">' + (H.edit ? 'تمام' : 'ترتيب') + '</button></div>' +
        (fl.length ? '<div class="flist">' + fl.map(function (id, i) {
          var c = CARDS[id], n = c.n(D), nc = c.nc ? c.nc(D) : c.cls === 'r' && n ? 'r' : c.cls === 'g' ? 'g' : '';
          return '<div class="frow" data-c="' + id + '"><div class="fico ' + (c.cls || '') + '">' + ico(c.icon) + '</div><div class="t"><b>' + c.t + '</b><i>' + esc(c.sub(D)) + '</i></div>' +
            (n !== '' ? '<div class="fnum ' + nc + '">' + (typeof n === 'number' ? money(n) : n) + '</div>' : '') +
            (H.edit ? '<div class="fed"><button data-up="' + i + '" title="لفوق">↑</button><button data-dn="' + i + '" title="لتحت">↓</button><button data-rm="' + i + '" title="شيل">×</button></div>'
              : '<button class="fstar" data-rm="' + i + '" title="شيل من المفضلة">' + ico('star') + '</button>') + '</div>';
        }).join('') + '</div>' : '<div class="r2" style="padding:4px">المفضلة فاضية. زوّد الكروت اللي بتستخدمها كل يوم.</div>') +
        '<button class="addfav" id="hAdd">+ زوّد كارت للمفضلة</button>';
      H.flash = ''; H.check = '';
      bind(D, fl);
    }).catch(function (e) { box.innerHTML = '<div class="msg err">' + esc(e.message || e) + '</div>'; });
  }
  function bind(D, fl) {
    var box = $('tab-home');
    box.querySelectorAll('.frow').forEach(function (row) {
      row.onclick = function (e) {
        var b = e.target.closest('button');
        if (b && b.dataset.rm !== undefined) { e.stopPropagation(); fl.splice(+b.dataset.rm, 1); setFavs(fl); render(); return; }
        if (b && b.dataset.up !== undefined) { var i = +b.dataset.up; if (i > 0) { fl.splice(i - 1, 0, fl.splice(i, 1)[0]); setFavs(fl); render(); } return; }
        if (b && b.dataset.dn !== undefined) { var j = +b.dataset.dn; if (j < fl.length - 1) { fl.splice(j + 1, 0, fl.splice(j, 1)[0]); setFavs(fl); render(); } return; }
        if (!H.edit) CARDS[row.dataset.c].go();
      };
    });
    $('hEdit').onclick = function () { H.edit = !H.edit; render(); };
    $('hAdd').onclick = function () { addSheet(fl); };
    box.querySelectorAll('.kgrid button[data-k]').forEach(function (b) { b.onclick = function () { CARDS[b.dataset.k].go(); }; });
    if ($('hNewE')) $('hNewE').onclick = function () { SC().openEntry({}); };
    if ($('hDaily')) $('hDaily').onclick = function () { App.showTab('treas'); };
    if ($('hExAll')) $('hExAll').onclick = function () { App.showTab('avail'); };
    box.querySelectorAll('button[data-goex]').forEach(function (b) { b.onclick = function () { App.showTab('avail'); }; });
    if ($('hOwAll')) $('hOwAll').onclick = CARDS.owners_due.go;
    var olist = D.owLate.concat(D.owSoon).slice(0, 3);
    box.querySelectorAll('.mini[data-own]').forEach(function (m) { m.onclick = function () { var i = +m.dataset.own; H.open = H.open === i ? -1 : i; render(); }; });
    if (H.open >= 0 && olist[H.open]) {
      SC().bindBank(olist[H.open], 'hbk' + H.open);
      box.querySelectorAll('button[data-pay]').forEach(function (b) { b.onclick = function () { var x = olist[+b.dataset.pay]; SC().openEntry({ cat: 'سداد ايجار', unit: x.unit, n: x.every }); }; });
    }
  }

  // ---------- الشيتات ----------
  function pickRole(first) {
    var cur = role();
    App.openSheet('<h2>' + (first === true ? 'الجهاز ده لمين؟' : 'دور الجهاز') + '</h2><p class="r2">الرئيسية والمفضلة بتتظبط على الدور، وبتتحفظ في المتصفح ده بس. كل الأقسام هتفضل متاحة.</p>' +
      '<div class="roles">' + Object.keys(ROLES).map(function (k) {
        return '<button data-role="' + k + '"' + (k === cur ? ' class="on"' : '') + '><div><b>' + ROLES[k].name + '</b><i>' + ROLES[k].desc + '</i></div></button>';
      }).join('') + '</div>' + (cur ? '<button class="btn ghost" id="rBack" style="width:100%;margin-top:10px">رجوع</button>' : ''));
    document.querySelectorAll('.roles button').forEach(function (b) { b.onclick = function () { put('role', b.dataset.role); H.open = -1; App.closeSheet(); App.showTab('home'); }; });
    if ($('rBack')) $('rBack').onclick = App.closeSheet;
  }
  function addSheet(fl) {
    var rest = Object.keys(CARDS).filter(function (k) { return fl.indexOf(k) === -1; });
    App.openSheet('<h2>زوّد للمفضلة</h2>' + (rest.length ? '<div class="flist">' + rest.map(function (k) {
      return '<div class="frow" data-add="' + k + '"><div class="fico ' + (CARDS[k].cls || '') + '">' + ico(CARDS[k].icon) + '</div><div class="t"><b>' + CARDS[k].t + '</b></div><span class="act">زوّد</span></div>';
    }).join('') + '</div>' : '<div class="r2">كل الكروت في المفضلة.</div>') + '<button class="btn ghost" id="aBack" style="width:100%;margin-top:10px">رجوع</button>');
    document.querySelectorAll('.frow[data-add]').forEach(function (r) { r.onclick = function () { fl.push(r.dataset.add); setFavs(fl); App.closeSheet(); render(); }; });
    $('aBack').onclick = App.closeSheet;
  }
  function listEnds() {
    var D = compute();
    App.openSheet('<h2>عقود بتخلص الأسبوع ده</h2>' + (D.ends.length ? D.ends.map(function (r) {
      var u = S.units.filter(function (x) { return x.code === r.unit; })[0];
      return '<div class="rcard"><div class="top2"><div><div class="r1">' + esc(r.name || '—') + '</div><div class="r2">' + esc(App.unitTitle(u) || r.unit) + ' · بيخلص ' + L.fmt(r.end) + '</div></div>' +
        '<button class="act" data-ext="' + r.idx + '">تمديد</button></div></div>';
    }).join('') : '<div class="r2">مفيش عقود بتخلص الأسبوع ده.</div>') + '<button class="btn ghost" id="eBack2" style="width:100%;margin-top:6px">رجوع</button>');
    document.querySelectorAll('button[data-ext]').forEach(function (b) { b.onclick = function () { SC().openContractEdit(+b.dataset.ext, 'extend'); }; });
    $('eBack2').onclick = App.closeSheet;
  }
  function listOwnerEnds() {
    var D = compute();
    App.openSheet('<h2>عقود ملاك بتخلص خلال 60 يوم</h2>' + (D.ownEnds.length ? D.ownEnds.map(function (u) {
      return '<div class="rcard"><div class="r1">' + esc(u.owner || '—') + '</div><div class="r2">' + esc(App.unitTitle(u) || u.code) + ' · <span dir="ltr">' + esc(u.code) + '</span> · بيخلص ' + L.fmt(u.ownerEnd) + '</div></div>';
    }).join('') : '<div class="r2">مفيش عقود ملاك بتخلص قريب.</div>') + '<button class="btn ghost" id="oBack2" style="width:100%;margin-top:6px">رجوع</button>');
    $('oBack2').onclick = App.closeSheet;
  }

  window.OsoolHome = {
    render: render, pickRole: pickRole,
    roleName: function () { var r = role(); return r ? ROLES[r].name : 'مش محدد'; },
    flash: function (f, c) { H.flash = f; H.check = c; }
  };
})();
