/* MBM · لوحة أصول — تقارير الطباعة (المتاح وطباعة اليومية) */
(function () {
  'use strict';
  var BRAND = 'MBM · لوحة أصول';
  var L = window.OsoolLogic;
  var DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { n = Number(n) || 0; return n ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'; }
  function d(v) { return v ? L.fmt(v) : ''; }
  function d2(v) { return v ? L.fmt(v).replace(/\/(\d{2})(\d{2})$/, '/$2') : ''; } // 05/10/26
  // اسم الوحدة: P بارسل · B عمارة · U وحدة، والرموز خفيفة. الكل شمال ليمين عشان النص ميتلغبطش
  function unitTag(u, w) {
    var ok = function (v) { v = String(v == null ? '' : v).trim(); return v && v !== '0' ? v : ''; };
    var parts = [['P', ok(u.block)], ['B', ok(u.building)], ['U', ok(u.apt)]].filter(function (x) { return x[1]; });
    if (!parts.length) return '';
    return '<span class="el ut" dir="ltr" style="--w:' + (w || 150) + 'px">' + parts.map(function (x) { return '<i>' + x[0] + '</i>' + esc(x[1]); }).join(' ') + '</span>';
  }
  function el(t, w) { return '<span class="el" style="--w:' + w + 'px">' + esc(t) + '</span>'; }
  function nowText() {
    var n = new Date();
    return L.fmt(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()))) + ' ' + String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
  }

  var CSS = '<style>' +
    '.rp{box-sizing:border-box;direction:rtl;width:1080px;height:763px;position:relative;overflow:hidden;background:#fff;color:#1d2422;font:12px/1.45 "Segoe UI",Tahoma,Arial,"DejaVu Sans",sans-serif;padding:18px 20px 34px}' +
    '.rp .pfoot{position:absolute;left:20px;right:20px;bottom:10px;display:flex;justify-content:space-between;color:#8a918d;font-size:10px;border-top:1px solid #e4e2db;padding-top:5px}' +
    '.rp .mini{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #c9a24a;padding-bottom:6px;margin-bottom:8px;color:#6e531b;font-weight:700}' +
    '.rp *{box-sizing:border-box}' +
    '.rp .band{display:flex;justify-content:space-between;align-items:center;background:#1f1a14;color:#f3ead6;border-radius:10px;border-bottom:3px solid #c9a24a;padding:12px 16px;margin-bottom:10px}' +
    '.rp .band h1{margin:0;font-size:20px;font-weight:700;color:#d8b25a}.rp .band .sub{font-size:12px;opacity:.85;margin-top:2px}' +
    '.rp .brand{white-space:nowrap;font-weight:700;font-size:13px;background:#c9a24a;color:#1f1a14;border-radius:6px;padding:4px 10px;direction:ltr}' +
    '.rp .kpis{display:flex;gap:8px;margin-bottom:10px}' +
    '.rp .kpi{flex:1;border:1px solid #e4e2db;border-radius:9px;padding:8px 12px;background:#fbfaf7}' +
    '.rp .kpi .v{font-size:18px;font-weight:700}.rp .kpi .k{font-size:11px;color:#6b736f}' +
    '.rp .g{color:#1f7a45}.rp .r{color:#a3261b}.rp .a{color:#9a5b00}' +
    '.rp table{width:100%;border-collapse:collapse}' +
    '.rp th{background:#f5eedc;color:#6e531b;font-weight:600;font-size:11px;padding:6px 5px;text-align:right;border-bottom:2px solid #c9a24a;white-space:nowrap}' +
    '.rp td{padding:5px;border-bottom:1px solid #ecebe6;font-size:11px;vertical-align:top}' +
    '.rp tbody tr:nth-child(even) td{background:#fbf8f1}' +
    '.rp td.n,.rp th.n{text-align:left;direction:ltr;white-space:nowrap}' +
    '.rp tfoot td{font-weight:700;background:#f1efe9;border-top:2px solid #cfcbbf}' +
    '.rp .chip{display:inline-block;border-radius:10px;padding:1px 8px;font-size:10.5px;font-weight:600;white-space:nowrap}' +
    '.rp .chip.ok{background:#e6f4ea;color:#1f7a45}.rp .chip.soon{background:#fff4e0;color:#9a5b00}.rp .chip.out{background:#eee;color:#6b736f}.rp .chip.today{background:#c62828;color:#fff}' +
    '.rp .two{display:flex;gap:12px;margin-bottom:10px;align-items:flex-start}.rp .two>div{flex:1}' +
    '.rp h2{font-size:13px;margin:0 0 6px;color:#8c6b25}' +
    '.rp .sign{display:flex;gap:16px;margin:4px 0 12px}.rp .sign div{flex:1;border:1px dashed #cfcbbf;border-radius:8px;padding:10px 12px;color:#6b736f;height:52px}' +
    '.rp .foot{display:flex;justify-content:space-between;color:#8a918d;font-size:10px;margin-top:10px;border-top:1px solid #e4e2db;padding-top:6px}' +
    '.rp .muted{color:#8a918d}' +
    '.rp .ut{text-align:left;unicode-bidi:isolate}.rp .ut i{font-style:normal;font-size:.78em;color:#c3b9a6;font-weight:400;margin:0 2px 0 5px}.rp .ut i:first-child{margin-left:0}.rp .pj{color:#6b736f;font-size:.92em}' +
    /* مضغوط: صفوف أكتر في الصفحة ومقروءة */
    '.rp{font-size:10.5px;line-height:1.25;padding:14px 16px 30px}' +
    '.rp .band{padding:7px 12px;margin-bottom:7px;border-radius:8px}.rp .band h1{font-size:16px}.rp .band .sub{font-size:11px;margin-top:0}.rp .brand{font-size:11px;padding:2px 8px}' +
    '.rp .kpis{gap:6px;margin-bottom:7px}.rp .kpi{padding:4px 9px;border-radius:7px}.rp .kpi .v{font-size:14px}.rp .kpi .k{font-size:9.5px}' +
    '.rp th{font-size:9.5px;padding:3px 4px}' +
    '.rp td{font-size:10.5px;line-height:1.2;padding:1.5px 4px;white-space:nowrap;vertical-align:middle}' +
    '.rp .el{display:inline-block;max-width:var(--w,150px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom}' +
    '.rp .chip{font-size:9.5px;padding:0 6px;line-height:1.3}' +
    '.rp h2{font-size:11.5px;margin:0 0 4px}.rp .two{gap:10px;margin-bottom:7px}' +
    '.rp .grp td{background:#f5eedc!important;color:#6e531b;font-weight:700;font-size:10px;padding:2px 6px;border-bottom:1px solid #e3d6b5}' +
    '.rp .cats{display:grid;grid-template-columns:repeat(3,1fr);gap:0 14px;margin-bottom:7px}.rp .cats div{display:flex;justify-content:space-between;gap:6px;border-bottom:1px dotted #e4e2db;padding:1px 0}' +
    '.rp .signs{display:flex;gap:16px;margin-top:8px}.rp .signs div{flex:1;border:1px dashed #cfcbbf;border-radius:7px;padding:6px 10px;color:#6b736f;height:40px;white-space:normal}' +
    '</style>';

  function band(title, sub) {
    return '<div class="band avoid"><div><h1>' + esc(title) + '</h1><div class="sub">' + esc(sub) + '</div></div><div class="brand">' + esc(BRAND) + '</div></div>';
  }
  function foot() { return '<div class="foot avoid"><span>' + esc(BRAND) + '</span><span>طُبع في ' + esc(nowText()) + '</span></div>'; }

  // ---------- المتاح ----------
  function maxText(today, end) {
    if (!end) return '';
    if (end <= today) return 'منتهي';
    var md = L.monthsAndDays(today, end), y = Math.floor(md.months / 12), m = md.months % 12;
    return ((y ? y + 'Y ' : '') + (m ? m + 'M' : '')).trim() || '0M';
  }
  function availHtml(list, today, filterText) {
    var free = function (x) { return !x.current && !x.pending; };
    var checkIn = list.filter(function (x) { return x.next && +x.next.start === +today; }).length;
    var checkOut = list.filter(function (x) { return (x.current && +x.current.end === +today) || x.receivedToday; }).length;
    var F = window.OsoolFollow, beds = ['1', '2', '3', '4'];
    var groups = F.groupsIn(list.map(function (x) { return x.unit; }));
    var cell = function (loc, b) {
      return list.filter(function (x) { return F.groupOf(x.unit.project) === loc && free(x) && String(x.unit.bedrooms) === b; }).length;
    };
    var matrix = groups.map(function (loc) {
      var cs = beds.map(function (b) { return cell(loc, b); });
      return '<tr><td>' + loc + '</td>' + cs.map(function (c) { return '<td class="n">' + (c || '—') + '</td>'; }).join('') +
        '<td class="n"><b>' + cs.reduce(function (a, b) { return a + b; }, 0) + '</b></td></tr>';
    }).join('');
    var rows = list.map(function (x, i) {
      var u = x.unit, c = x.current, n = x.next, more = x.upcoming > 1 ? (x.upcoming - 1) : '';
      var st;
      if (!c && x.pending) st = '<span class="chip out">لم تُستلم</span>';
      else if (!c) st = '<span class="chip ok">Available</span>';
      else if (c.end.getUTCFullYear() >= 2090) st = '<span class="chip out">خارج التشغيل</span>';
      else if (+c.end === +today) st = '<span class="chip today">' + d2(c.end) + '</span>';
      else if (x.daysToFree <= 7) st = '<span class="chip soon">' + d2(c.end) + '</span>';
      else st = d2(c.end);
      return '<tr><td class="n">' + (i + 1) + '</td><td>' + el(u.project, 90) + '</td><td class="n">' + esc(u.bedrooms) + '</td><td>' + el(u.info && u.info !== '0' ? u.info : '', 80) + '</td>' +
        '<td>' + unitTag(u, 130) + '</td><td>' + st + '</td>' +
        '<td>' + el(c ? c.name : x.pending ? x.pending.name : '', 150) + '</td><td class="n">' + (n ? d2(n.start) : '') + '</td><td class="n">' + (n ? d2(n.end) : '') + '</td><td>' + el(n ? n.name : '', 130) + '</td>' +
        '<td class="n">' + more + '</td><td>' + (x.receivedToday ? '<span class="chip ok">تم الاستلام</span>' : el(c ? c.receipt : '', 70)) + '</td><td class="n">' + esc(maxText(today, u.ownerEnd)) + '</td></tr>';
    });
    var nFree = list.filter(free).length;
    var sub = DAYS[today.getUTCDay()] + ' ' + L.fmt(today) + (filterText ? ' · ' + filterText : '');
    if (sub.length > 110) sub = sub.slice(0, 107) + '…';
    return { title: 'Available List · المتاح', sub: sub, top: band('Available List · المتاح', sub) +
      '<div class="two avoid"><div><div class="kpis"><div class="kpi"><div class="v g">' + nFree + '</div><div class="k">Available · فاضية</div></div>' +
      '<div class="kpi"><div class="v">' + checkIn + '</div><div class="k">Check In النهارده</div></div>' +
      '<div class="kpi"><div class="v">' + checkOut + '</div><div class="k">Check Out النهارده</div></div>' +
      '<div class="kpi"><div class="v">' + list.length + '</div><div class="k">إجمالي الوحدات</div></div></div></div>' +
      '<div style="flex:0 0 330px"><table><thead><tr><th>Location</th><th class="n">1</th><th class="n">2</th><th class="n">3</th><th class="n">4</th><th class="n">Total</th></tr></thead><tbody>' + matrix + '</tbody></table></div></div>' +
      '', thead: '<thead><tr><th class="n">S.</th><th>Location</th><th class="n">Bed</th><th>Info</th><th>Unit</th><th>Available</th><th>Name</th><th class="n">Booked from</th><th class="n">Booked to</th><th>Name</th><th class="n">More</th><th>Note</th><th class="n">Max.</th></tr></thead>', rows: rows, tfoot: '' };
  }

  // ---------- طباعة اليومية ----------
  function dailyHtml(t, units, cashList, date) {
    var c = t.cols, n = c['تاريخ'].length, day = L.dateToSerial(date);
    var ub = {}; units.forEach(function (u) { ub[u.code] = u; });
    var g = function (k, i) { return c[k] ? c[k][i] : ''; };
    var rows = [], cats = {}, catOrder = [], tin = 0, tout = 0, bal = {};
    for (var i = 0; i < n; i++) {
      var ds = Number(c['تاريخ'][i]); if (!ds) continue;
      var vin = Number(c['ايراد'][i]) || 0, vout = Number(c['مصروف'][i]) || 0, fx = Number(c['العملة'][i]) || 0;
      var cash = String(c['كاش'][i] || '');
      if (Math.floor(ds) <= day && cash.trim()) {
        var b = bal[cash] || (bal[cash] = { egp: 0, fx: 0 });
        b.egp += vin - vout; b.fx += vout ? -fx : fx;
      }
      if (Math.floor(ds) !== day) continue;
      rows.push(i); tin += vin; tout += vout;
      var cat = String(c['فئة'][i] || '—').trim();
      if (!cats[cat]) { cats[cat] = { in: 0, out: 0 }; catOrder.push(cat); }
      cats[cat].in += vin; cats[cat].out += vout;
    }
    var cashes = cashList.length ? cashList.slice() : Object.keys(bal);
    Object.keys(bal).forEach(function (k) { if (cashes.indexOf(k) === -1) cashes.push(k); });
    var totalEgp = 0;
    var cashRows = cashes.map(function (k) {
      var b = bal[k] || { egp: 0, fx: 0 }; totalEgp += b.egp;
      return '<tr><td>' + esc(k) + '</td><td class="n">' + money(Math.round(b.fx * 100) / 100) + '</td><td class="n">' + money(Math.round(b.egp * 100) / 100) + '</td></tr>';
    }).join('');
    // الفئات مترتبة بحجم المبلغ (وارد + منصرف) من الكبير للصغير
    catOrder.sort(function (a, b) { return (cats[b].in + cats[b].out) - (cats[a].in + cats[a].out); });
    var catRows = catOrder.map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="n g">' + money(cats[k].in) + '</td><td class="n r">' + money(cats[k].out) + '</td></tr>'; }).join('');
    var mv = rows.map(function (i) {
      var u = ub[String(g('كود', i))] || {};
      var rev = String(g('مراجعة', i) || '');
      var a = L.serialToDate(g('بداية الايجار', i)), b = L.serialToDate(g('نهاية الايجار', i));
      return '<tr><td class="n g">' + money(g('ايراد', i)) + '</td><td class="n r">' + money(g('مصروف', i)) + '</td><td class="n">' + el(g('رقم المستند', i), 60) + '</td>' +
        '<td>' + (u.project ? '<span class="pj">' + esc(u.project) + '</span> ' : '') + unitTag(u, 110) + '</td><td>' + el(g('فئة', i), 110) + '</td><td>' + el(g('بيان', i), 210) + '</td>' +
        '<td class="n">' + (g('شهر', i) ? esc(L.monthKey(L.serialToDate(g('شهر', i)))) : '') + '</td><td class="n">' + (a || b ? '<span dir="rtl" style="unicode-bidi:isolate">' + d2(a) + ' ← ' + d2(b) + '</span>' : '') + '</td>' +
        '<td>' + (rev ? '<span class="chip soon">' + esc(rev) + '</span>' : '') + '</td><td>' + el(g('كاش', i), 95) + '</td></tr>';
    });
    if (!mv.length) mv = ['<tr><td colspan="10" class="muted">مفيش حركات في اليوم ده</td></tr>'];
    if (rows.length) mv.push('<tr class="tot"><td class="n" style="font-weight:700;background:#f1efe9;border-top:2px solid #cfcbbf">' + money(tin) + '</td><td class="n" style="font-weight:700;background:#f1efe9;border-top:2px solid #cfcbbf">' + money(tout) + '</td><td colspan="8" style="font-weight:700;background:#f1efe9;border-top:2px solid #cfcbbf">إجمالي اليوم</td></tr>');
    // التوقيعات آخر حاجة في آخر صفحة
    mv.push('<tr class="nostripe"><td colspan="10" style="padding:0;border:0;background:#fff!important"><div class="signs"><div>اعداد:</div><div>مراجعة:</div></div></td></tr>');
    var sub = DAYS[date.getUTCDay()] + ' ' + L.fmt(date);
    return { title: 'يومية الخزينة', sub: sub, top: band('يومية الخزينة', sub) +
      '<div class="kpis avoid"><div class="kpi"><div class="v g">' + money(tin) + '</div><div class="k">وارد اليوم</div></div>' +
      '<div class="kpi"><div class="v r">' + money(tout) + '</div><div class="k">منصرف اليوم</div></div>' +
      '<div class="kpi"><div class="v">' + money(tin - tout) + '</div><div class="k">الصافي</div></div>' +
      '<div class="kpi"><div class="v">' + rows.length + '</div><div class="k">عدد الحركات</div></div></div>' +
      (catOrder.length ? '<h2>إجمالي الفئات</h2><div class="cats avoid">' + catOrder.map(function (k) {
        return '<div><span>' + esc(k) + '</span><span dir="ltr">' + (cats[k].in ? '<b class="g">+' + money(cats[k].in) + '</b>' : '') + (cats[k].in && cats[k].out ? ' ' : '') + (cats[k].out ? '<b class="r">−' + money(cats[k].out) + '</b>' : '') + '</span></div>';
      }).join('') + '</div>' : '') +
      '<h2>حركات اليوم</h2>', thead: '<thead><tr><th class="n">وارد</th><th class="n">منصرف</th><th class="n">مستند</th><th>الوحدة</th><th>الفئة</th><th>البيان</th><th class="n">شهر</th><th class="n">الفترة</th><th>مراجعة</th><th>الخزينة</th></tr></thead>', rows: mv,
      tfoot: '' };
  }

  // ---------- تقسيم الصفحات ----------
  // كل صفحة A4 بالعرض بعرض 1080 وارتفاع 763، وراس الجدول بيتكرر، ومفيش صف بيتقطع
  function paginate(rep) {
    // القياس جوه iframe معزول عشان تنسيقات البانل متأثرش على طول الصفوف
    var fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;left:-3000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
    document.body.appendChild(fr);
    var fd = fr.contentDocument; fd.open(); fd.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0"></body></html>'); fd.close();
    var host = fd.body;
    var pages = [], i = 0, rows = rep.rows || [];
    do {
      var top = pages.length === 0 ? rep.top : '<div class="mini"><span>' + esc(rep.title) + ' · ' + esc(rep.sub) + '</span><span dir="ltr">' + esc(BRAND) + '</span></div>';
      // نفس شكل الصفحة النهائية بالظبط، والجدول لازم يخلص قبل الفوتر
      host.innerHTML = CSS + '<div class="rp">' + top + '<table id="pgtable">' + rep.thead + '<tbody id="pgbody"></tbody>' + rep.tfoot + '</table><div class="pfoot">.</div></div>';
      var table = fd.getElementById('pgtable'), body = fd.getElementById('pgbody'), used = [];
      var limit = fd.querySelector('.pfoot').getBoundingClientRect().top - 6;
      while (i < rows.length) {
        body.insertAdjacentHTML('beforeend', rows[i]);
        if (table.getBoundingClientRect().bottom > limit && used.length) { body.lastElementChild.remove(); break; }
        used.push(rows[i]); i++;
      }
      pages.push({ top: top, rows: used.join('') });
    } while (i < rows.length);
    fr.remove();
    return pages.map(function (p, k) {
      return CSS + '<div class="rp">' + p.top + '<table>' + rep.thead + '<tbody>' + p.rows + '</tbody>' + (k === pages.length - 1 ? rep.tfoot : '') + '</table>' +
        '<div class="pfoot"><span dir="ltr">' + esc(BRAND) + '</span><span>طُبع في ' + esc(nowText()) + '</span><span>صفحة ' + (k + 1) + ' من ' + pages.length + '</span></div></div>';
    });
  }

  // المتصفح نفسه بيرسم الصفحة (عشان العربي يتوصل صح)، وبعدين تتحط في PDF
  function renderPage(html) {
    var W = 1080, H = 763, SC = 2;
    var el = document.createElement('div'); el.innerHTML = html;
    var x = new XMLSerializer().serializeToString(el);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' + x + '</foreignObject></svg>';
    return new Promise(function (ok, no) {
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC;
        var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.scale(SC, SC); g.drawImage(img, 0, 0);
        try { ok(cv.toDataURL('image/jpeg', 0.92)); } catch (e) { no(e); }
      };
      img.onerror = function () { no(new Error('مقدرتش أرسم الصفحة.')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function toPdf(rep, name) {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J) return Promise.reject(new Error('مكتبة الـ PDF متحملتش. جرب زرار الطباعة.'));
    var pages = paginate(rep), pdf = new J({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    return pages.reduce(function (p, html, k) {
      return p.then(function () { return renderPage(html); }).then(function (data) { if (k) pdf.addPage(); pdf.addImage(data, 'JPEG', 0, 0, 297, 210); });
    }, Promise.resolve()).then(function () { pdf.save(name + '.pdf'); return pages.length; });
  }
  function printHtml(rep, title) {
    var pages = paginate(rep);
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-1000px';
    document.body.appendChild(f);
    var doc = f.contentDocument;
    doc.open();
    doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{size:A4 landscape;margin:0}body{margin:0}.pg{width:297mm;height:209mm;overflow:hidden;page-break-after:always;display:flex;justify-content:center;align-items:flex-start}.pg>.wrap{transform-origin:top center;transform:scale(1.04)}</style></head><body>' +
      pages.map(function (h) { return '<div class="pg"><div class="wrap">' + h + '</div></div>'; }).join('') + '</body></html>');
    doc.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(function () { f.remove(); }, 60000); }, 300);
  }

  // ---------- تقرير جدول عام (لأي قايمة: التحصيلات، الملاك، الخزينة…) ----------
  // d: {name, title, sub, headers, rows, kinds: ['text'|'num'|'date'|'phone'|'money'], sums: [index...]}
  function waUrl(p) { var x = String(p || '').replace(/[^\d]/g, ''); if (/^01\d{9}$/.test(x)) x = '2' + x; return x.length >= 10 ? 'https://wa.me/' + x : ''; }
  function cellOut(v, k) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return d2(v);
    if (k === 'num' || k === 'money') return money(v);
    if (k === 'phone') { var u = waUrl(v); return u ? '<a href="' + u + '" style="color:#1f7a45;text-decoration:none">' + esc(v) + '</a>' : esc(v); }
    return el(v, 170);
  }
  function tableReport(d) {
    var kinds = d.kinds || [], sums = d.sums || [], tot = {};
    sums.forEach(function (i) { tot[i] = 0; });
    var rows = d.rows.map(function (r, n) {
      sums.forEach(function (i) { tot[i] += Number(r[i]) || 0; });
      return '<tr><td class="n">' + (n + 1) + '</td>' + r.map(function (v, i) {
        var k = kinds[i] || (v instanceof Date ? 'date' : typeof v === 'number' ? 'num' : 'text');
        return '<td' + (k === 'text' ? '' : ' class="n"') + '>' + cellOut(v, k) + '</td>';
      }).join('') + '</tr>';
    });
    if (!rows.length) rows = ['<tr><td colspan="' + (d.headers.length + 1) + '" class="muted">مفيش بيانات</td></tr>'];
    var sub = d.sub || (DAYS[new Date().getDay()] + ' ' + L.fmt(L.todayUTC()));
    var kp = '<div class="kpis avoid"><div class="kpi"><div class="v">' + d.rows.length + '</div><div class="k">عدد السطور</div></div>' +
      sums.map(function (i) { return '<div class="kpi"><div class="v">' + money(Math.round(tot[i])) + '</div><div class="k">' + esc(d.headers[i]) + '</div></div>'; }).join('') + '</div>';
    var foot = sums.length && d.rows.length ? '<tfoot><tr><td></td>' + d.headers.map(function (h, i) { return '<td class="n">' + (i in tot ? money(Math.round(tot[i])) : i === 0 ? 'الإجمالي' : '') + '</td>'; }).join('') + '</tr></tfoot>' : '';
    return { title: d.title || d.name, sub: sub, top: band(d.title || d.name, sub) + kp,
      thead: '<thead><tr><th class="n">#</th>' + d.headers.map(function (h, i) { var k = kinds[i]; return '<th' + (k && k !== 'text' ? ' class="n"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead>',
      rows: rows, tfoot: foot };
  }

  // ---------- PDF حقيقي: الصفحات بتتفتح في نافذة طباعة، والمتصفح بيحفظها PDF بنص ولينكات ----------
  function printDoc(pages, title, auto) {
    return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{size:A4 landscape;margin:0}body{margin:0;background:#e9e4d8}' +
      '.pg{width:297mm;height:209.9mm;overflow:hidden;page-break-after:always;break-after:page;display:flex;justify-content:center;align-items:flex-start;background:#fff;margin:0 auto}' +
      '.pg>.wrap{transform-origin:top center;transform:scale(1.04)}' +
      '.tb{position:sticky;top:0;z-index:9;display:flex;gap:10px;align-items:center;justify-content:center;background:#1f1a14;color:#efe6d2;padding:10px;font:14px Tahoma,sans-serif}' +
      '.tb button{background:#c9a24a;color:#1f1a14;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}' +
      '@media screen{.pg{margin:12px auto;box-shadow:0 4px 18px rgba(0,0,0,.18)}}@media print{.tb{display:none}body{background:#fff}.pg{margin:0;box-shadow:none}}</style></head><body>' +
      '<div class="tb"><span>' + esc(title) + ' · ' + pages.length + ' صفحة</span><button onclick="window.print()">اطبع أو احفظ PDF</button><span style="opacity:.8;font-size:12px">في نافذة الطباعة اختار Save as PDF</span></div>' +
      pages.map(function (h) { return '<div class="pg"><div class="wrap">' + h + '</div></div>'; }).join('') +
      (auto ? '<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>' : '') + '</body></html>';
  }
  // في الإكسيل أونلاين: نافذة حوار على نفس الموقع، والصفحات بتتبعت لها على أجزاء
  function openPrint(rep, title) {
    var pages = paginate(rep), html = printDoc(pages, title, true);
    var ui = window.Office && Office.context && Office.context.ui;
    var canDialog = ui && ui.displayDialogAsync && Office.context.requirements && Office.context.requirements.isSetSupported('DialogApi', '1.2');
    if (!canDialog) { printPages(pages, title); return Promise.resolve('iframe'); }
    var url = location.href.replace(/[^\/]*([?#].*)?$/, '') + 'print.html';
    return new Promise(function (ok, no) {
      ui.displayDialogAsync(url, { height: 90, width: 80, displayInIframe: false }, function (r) {
        if (r.status !== 'succeeded') { printPages(pages, title); ok('iframe'); return; }
        var dlg = r.value, CH = 24000, parts = [];
        for (var i = 0; i < html.length; i += CH) parts.push(html.slice(i, i + CH));
        dlg.addEventHandler(Office.EventType.DialogMessageReceived, function (m) {
          if (m.message === 'ready') parts.forEach(function (p, k) { dlg.messageChild(JSON.stringify({ i: k, n: parts.length, d: p })); });
          if (m.message === 'close') dlg.close();
        });
        dlg.addEventHandler(Office.EventType.DialogEventReceived, function () { ok('dialog'); });
        ok('dialog');
      });
    });
  }
  function printPages(pages, title) {
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-1000px';
    document.body.appendChild(f);
    var doc = f.contentDocument; doc.open(); doc.write(printDoc(pages, title, false)); doc.close();
    setTimeout(function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(function () { f.remove(); }, 60000); }, 300);
  }

  // ---------- إكسيل حقيقي (منسق، بأنواع خانات صح، فلاتر، إجمالي) ----------
  function loadExcelJS() {
    if (window.ExcelJS) return Promise.resolve();
    return new Promise(function (ok, no) {
      var sc = document.createElement('script'); sc.src = 'vendor/exceljs.min.js';
      sc.onload = function () { ok(); }; sc.onerror = function () { no(new Error('مكتبة الإكسيل متحملتش. جرب تاني.')); };
      document.head.appendChild(sc);
    });
  }
  function xlsxBlob(d) {
    return loadExcelJS().then(function () {
      var X = window.ExcelJS, wb = new X.Workbook(); wb.creator = BRAND; wb.created = new Date();
      var n = d.headers.length, kinds = d.kinds || [], sums = d.sums || [];
      var ws = wb.addWorksheet(String(d.sheet || 'تقرير').replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 3 }] });
      ws.mergeCells(1, 1, 1, n); ws.mergeCells(2, 1, 2, n);
      var t = ws.getCell(1, 1); t.value = d.title || d.name; t.font = { bold: true, size: 14, color: { argb: 'FFD8B25A' } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1A14' } }; t.alignment = { horizontal: 'right', vertical: 'middle' }; ws.getRow(1).height = 24;
      var s2 = ws.getCell(2, 1); s2.value = (d.sub ? d.sub + ' · ' : '') + d.rows.length + ' سطر · ' + BRAND + ' · ' + L.fmt(L.todayUTC());
      s2.font = { size: 10, color: { argb: 'FF7A6F60' } }; s2.alignment = { horizontal: 'right' };
      var hr = ws.getRow(3); hr.values = d.headers; hr.height = 20;
      hr.eachCell(function (c) {
        c.font = { bold: true, color: { argb: 'FF6E531B' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EEDC' } };
        c.border = { bottom: { style: 'medium', color: { argb: 'FFC9A24A' } } }; c.alignment = { horizontal: 'right', vertical: 'middle' };
      });
      d.rows.forEach(function (r, ri) {
        var row = ws.getRow(4 + ri);
        r.forEach(function (v, i) {
          var c = row.getCell(i + 1), k = kinds[i];
          if (v === null || v === undefined || v === '') return;
          if (v instanceof Date) { c.value = v; c.numFmt = 'dd/mm/yyyy'; return; }
          if (k === 'phone') { var u = waUrl(v); c.value = u ? { text: String(v), hyperlink: u } : String(v); if (u) c.font = { color: { argb: 'FF1F7A45' }, underline: true }; return; }
          if (typeof v === 'number') { c.value = v; c.numFmt = k === 'money' || sums.indexOf(i) !== -1 ? '#,##0' : 'General'; return; }
          if ((k === 'num' || k === 'money') && /^-?[\d.]+$/.test(String(v))) { c.value = Number(v); c.numFmt = '#,##0'; return; }
          // الأكواد القصيرة تتحفظ أرقام؛ أرقام الحسابات والتليفونات الطويلة تفضل نص عشان الإكسيل ميقلبهاش
          if (/^[1-9]\d{0,9}$/.test(String(v).trim())) { c.value = Number(String(v).trim()); return; }
          c.value = String(v);
        });
        if (ri % 2) row.eachCell({ includeEmpty: true }, function (c, ci) { if (ci <= n) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF8F1' } }; });
      });
      var last = 3 + d.rows.length;
      if (sums.length && d.rows.length) {
        var tr = ws.getRow(last + 1);
        tr.getCell(1).value = 'الإجمالي';
        sums.forEach(function (i) {
          var col = ws.getColumn(i + 1).letter, tot = d.rows.reduce(function (a, r) { return a + (Number(r[i]) || 0); }, 0);
          tr.getCell(i + 1).value = { formula: 'SUBTOTAL(9,' + col + '4:' + col + last + ')', result: tot }; tr.getCell(i + 1).numFmt = '#,##0';
        });
        tr.eachCell({ includeEmpty: true }, function (c, ci) { if (ci <= n) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1EFE9' } }; c.border = { top: { style: 'thin', color: { argb: 'FFCFCBBF' } } }; } });
      }
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: last, column: n } };
      d.headers.forEach(function (h, i) {
        var w = String(h).length;
        d.rows.slice(0, 400).forEach(function (r) { var v = r[i]; var m = v instanceof Date ? 10 : typeof v === 'number' ? String(Math.round(v)).length + 3 : String(v === null || v === undefined ? '' : v).length; if (m > w) w = m; });
        ws.getColumn(i + 1).width = Math.min(48, Math.max(8, w + 3));
      });
      return wb.xlsx.writeBuffer().then(function (buf) { return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); });
    });
  }
  function downloadXlsx(d) {
    return xlsxBlob(d).then(function (blob) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (d.name || 'تقرير') + '.xlsx';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
      window.__lastExport = d;
    });
  }

  // ---------- كشف حساب ----------
  // info: {title, who, lines: [[label, value]...]}
  function statementReport(st, info) {
    var rows = st.lines.map(function (x) {
      return '<tr><td class="n">' + d2(x.date) + '</td><td>' + el(x.desc, 420) + '</td><td class="n r">' + (x.debit ? money(x.debit) : '') + '</td><td class="n g">' + (x.credit ? money(x.credit) : '') + '</td><td class="n"><b>' + money(x.balance) + '</b></td></tr>';
    });
    if (!rows.length) rows = ['<tr><td colspan="5" class="muted">مفيش حركات من ' + esc(L.monthLabel('Jan-25')) + '</td></tr>'];
    if (st.deposits && st.deposits.length) {
      rows.push('<tr class="grp"><td colspan="5">التأمين · الرصيد ' + money(st.depTotal) + '</td></tr>');
      st.deposits.forEach(function (x) { rows.push('<tr><td class="n">' + d2(x.date) + '</td><td>' + el(x.desc, 420) + '</td><td></td><td class="n">' + money(x.amount) + '</td><td></td></tr>'); });
    }
    var sub = info.who + ' · لحد ' + L.fmt(L.todayUTC());
    var bal = st.balance;
    return { title: info.title, sub: sub, top: band(info.title, sub) +
      '<div class="two avoid"><div><div class="kpis"><div class="kpi"><div class="v">' + money(st.due) + '</div><div class="k">المستحق</div></div>' +
      '<div class="kpi"><div class="v g">' + money(st.paid) + '</div><div class="k">المدفوع</div></div>' +
      '<div class="kpi"><div class="v ' + (bal > 0 ? 'r' : 'g') + '">' + money(Math.abs(bal)) + '</div><div class="k">' + (bal > 0 ? 'الباقي' : bal < 0 ? 'مدفوع زيادة' : 'الرصيد') + '</div></div></div></div>' +
      '<div style="flex:0 0 380px"><table>' + info.lines.map(function (l) { return '<tr><td class="muted" style="width:110px">' + esc(l[0]) + '</td><td>' + esc(l[1]) + '</td></tr>'; }).join('') + '</table></div></div>',
      thead: '<thead><tr><th class="n">التاريخ</th><th>البيان</th><th class="n">مستحق</th><th class="n">مدفوع</th><th class="n">الرصيد</th></tr></thead>', rows: rows,
      tfoot: '<tfoot><tr><td></td><td>الإجمالي</td><td class="n">' + money(st.due) + '</td><td class="n">' + money(st.paid) + '</td><td class="n">' + money(bal) + '</td></tr></tfoot>' };
  }

  window.OsoolReports = { BRAND: BRAND, unitTag: unitTag, statementReport: statementReport, availHtml: availHtml, dailyHtml: dailyHtml, paginate: paginate, toPdf: toPdf, printHtml: printHtml,
    tableReport: tableReport, openPrint: openPrint, printDoc: printDoc, xlsxBlob: xlsxBlob, downloadXlsx: downloadXlsx, waUrl: waUrl };
})();
