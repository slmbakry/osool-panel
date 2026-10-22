/* عقود الملاك: وحدة جديدة، تجديد، تعديل — شاشة مشتركة بين لوحة أصول وأداة تجهيز الداتا */
(function (root) {
  'use strict';
  root.OsoolOwnerForm = { create: function (X) {
    var S = X.S, A = X.A, L = X.L, F = X.F, $ = X.$, esc = X.esc, money = X.money, digits = X.digits, today = X.today, App = X.App, errHtml = X.errHtml, loadingHtml = X.loadingHtml;
    var renderOwnerC = function () { if (X.onDone) X.onDone(); };
    var MRE = /^[A-Z][a-z]{2}-\d{2}$/;
    function ocNum(v) { var n = Number(digits(v)); return isFinite(n) ? n : 0; }
    function ocIncText(inc) { return !inc ? 'من غير زيادة' : inc.pct ? inc.pct + '% كل سنة (زيادة على الزيادة)' : money(inc.amt) + ' ج كل سنة'; }
    function ocIncCell(inc) { return !inc ? '' : inc.pct ? Math.round(inc.pct * 10) / 1000 : inc.amt + ' جنيه'; }
    function ocIncOf(v) { var s0 = String(v === null || v === undefined ? '' : v); if (/جنيه|ج\b/.test(s0)) { var a = Number(s0.replace(/[^\d.]/g, '')); return a ? { amt: a } : null; } var p = F.parseIncrease(v); return p ? { pct: p } : null; }

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
        '<div class="sbar"><div style="display:flex;gap:8px"><button class="btn ghost" id="ofBack">رجوع</button><button class="btn ghost" id="ofCalc">' + (m === 'edit' ? 'شوف التغييرات' : 'احسب الشهور') + '</button><button class="btn primary" id="ofSave">تسجيل</button></div></div>';
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

    return { open: openOwnerForm };
  } };
})(this);
