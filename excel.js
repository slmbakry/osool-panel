/* لوحة أصول — طبقة الاتصال بالإكسيل */
(function (root) {
  'use strict';
  var L = root.OsoolLogic;

  var OWNER_COLS = ['كود', 'المشروع', 'بلوك', 'عمارة', 'شقة', 'الاسم', 'نهاية العقد', 'Bedrooms'];
  var OWNER_OPT = ['بداية العقد', 'تسويات', 'Info', 'قيمة الايجار', 'يسدد كل', 'التليفون', 'الدفع', 'Beneficiary Name', 'Beneficiary Acc. No.', 'البنك'];
  var RENTER_COLS = ['كود', 'كود المستأجر', 'بداية العقد', 'نهاية العقد', 'الاسم', 'التليفون',
    'رقم البطاقة - جواز السفر', 'الجنسية', 'Special', 'Operation'];
  var RENTER_OPT = ['البروكر', 'قيمة الايجار', 'التأمين', 'موقف الاستلام'];
  var ENTRY_COLS = ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'شهر', 'نهاية الايجار', 'كود المستأجر', 'كاش', 'العملة'];
  var ENTRY_OPT = ['رقم المستند', 'كود', 'بيان', 'بداية الايجار', 'مراجعة'];
  var TEXT_COLS = ['كود المستأجر', 'التليفون', 'رقم البطاقة - جواز السفر', 'رقم البطاقة', 'Beneficiary Acc. No.'];
  var MONTH_RE = /^[A-Z][a-z]{2}-\d{2}$/;
  var PER_SYNC = 3;            // أعمدة في كل طلب — عشان نفضل تحت حد حجم الطلب في الإكسيل أونلاين
  var SETTINGS_KEY = 'osoolPanel.scope';

  function trimRow(v) { return v[0].map(function (s) { return String(s === null ? '' : s).trim(); }); }
  function friendly(e) {
    var code = e && e.code;
    if (code === 'ItemNotFound') return 'مش لاقي واحد من جداول الملف (الملاك أو المستأجرين أو الخزينة). اتأكد إنك فاتح ملف أصول.';
    if (code === 'AccessDenied' || /cannot perform the requested operation/i.test(String(e && e.message)))
      return 'الشيت محمي ومش سامح بالكتابة في الخانة دي. افتح حماية الشيت، أو اسمح فيها بإضافة سطور، وجرب تاني.';
    if (code === 'InvalidOperationInCellEditMode') return 'فيه خلية مفتوحة للكتابة. اخرج منها وجرب تاني.';
    if (code === 'RequestPayloadSizeLimitExceeded' || code === 'ResponsePayloadSizeLimitExceeded') return 'البيانات أكبر من حد الإكسيل أونلاين في طلب واحد.';
    return (e && e.message) ? e.message : String(e);
  }
  function fail(e) { var er = new Error(friendly(e)); if (e && e.missingMonths) er.missingMonths = e.missingMonths; throw er; }

  // يقرا أعمدة بالاسم على دفعات صغيرة
  function readCols(ctx, table, hdr, names, optional, perSync) {
    var per = perSync || PER_SYNC;
    var list = [];
    names.forEach(function (h) { var i = hdr.indexOf(h); if (i === -1) throw { message: 'العمود "' + h + '" مش موجود في جدول ' + table.__name + '.' }; list.push([h, i]); });
    (optional || []).forEach(function (h) { var i = hdr.indexOf(h); if (i !== -1) list.push([h, i]); });
    var out = {}, p = Promise.resolve();
    for (var s = 0; s < list.length; s += per) {
      (function (batch) {
        // استراحة صغيرة بين كل دفعة والتانية عشان الإكسيل والمتصفح مايتقلوش
        p = p.then(function () { return new Promise(function (ok) { setTimeout(ok, 40); }); }).then(function () {
          var rs = batch.map(function (x) { return table.columns.getItemAt(x[1]).getDataBodyRange().load('values'); });
          return ctx.sync().then(function () {
            batch.forEach(function (x, j) { out[x[0]] = rs[j].values.map(function (r) { return r[0]; }); });
          });
        });
      })(list.slice(s, s + per));
    }
    return p.then(function () { return out; });
  }
  function tableWithHeader(ctx, name) {
    var t = ctx.workbook.tables.getItem(name); t.__name = name;
    var h = t.getHeaderRowRange().load('values');
    return ctx.sync().then(function () { return { t: t, H: trimRow(h.values) }; });
  }

  // ---------- قراءة ----------
  function loadAll() {
    return Excel.run(function (ctx) {
      var res = {}, O, R;
      return tableWithHeader(ctx, 'owner').then(function (o) { O = o; return readCols(ctx, O.t, O.H, OWNER_COLS, OWNER_OPT); })
        .then(function (c) {
          res.owner = { cols: c };
          var fromD = root.OsoolFollow.keyToDate(root.OsoolFollow.FOLLOW_FROM);
          var keep = O.H.filter(function (h) { return MONTH_RE.test(h) && root.OsoolFollow.keyToDate(h) >= fromD; });
          return readCols(ctx, O.t, O.H, keep);
        })
        .then(function (m) { res.owner.months = m; return tableWithHeader(ctx, 'renter'); })
        .then(function (r) { R = r; return readCols(ctx, R.t, R.H, RENTER_COLS, RENTER_OPT); })
        .then(function (c) {
          res.renter = { cols: c };
          res.monthHeaders = R.H.filter(function (h) { return MONTH_RE.test(h); });
          var from = root.OsoolFollow ? root.OsoolFollow.FOLLOW_FROM : 'Jan-25';
          var fromD = root.OsoolFollow.keyToDate(from);
          var keep = res.monthHeaders.filter(function (h) { return root.OsoolFollow.keyToDate(h) >= fromD; });
          return readCols(ctx, R.t, R.H, keep);
        })
        .then(function (m) {
          res.renter.months = m;
          var cash = ctx.workbook.tables.getItem('كاش').getDataBodyRange().load('values');
          return ctx.sync().then(function () { res.cash = cash.values.map(function (r) { return String(r[0]); }).filter(Boolean); })
            .catch(function () { res.cash = []; });
        })
        .then(function () {
          var cat = ctx.workbook.tables.getItem('فئة').getDataBodyRange().load('values');
          return ctx.sync().then(function () { res.categories = cat.values.map(function (r) { return String(r[0] || '').trim(); }).filter(Boolean); })
            .catch(function () { res.categories = []; });
        })
        .then(function () { return res; });
    }).catch(fail);
  }

  function loadTreasury() {
    return Excel.run(function (ctx) {
      return tableWithHeader(ctx, 'entry').then(function (E) { return readCols(ctx, E.t, E.H, ENTRY_COLS, ENTRY_OPT, 2); })
        .then(function (c) { return { cols: c }; });
    }).catch(fail);
  }

  function readRenterRow(idx) {
    return Excel.run(function (ctx) {
      return tableWithHeader(ctx, 'renter').then(function (R) {
        var row = R.t.getDataBodyRange().getRow(idx).load('values');
        return ctx.sync().then(function () {
          var o = {}; R.H.forEach(function (h, i) { o[h] = row.values[0][i]; }); return o;
        });
      });
    }).catch(fail);
  }

  // ---------- إعداد الملف (بيتحفظ جوه الملف لكل الفريق) ----------
  function getSettings() {
    try { var s = Office.context.document.settings.get(SETTINGS_KEY); return Promise.resolve(s ? JSON.parse(s) : null); }
    catch (e) { return Promise.resolve(null); }
  }
  function saveSettings(obj) {
    return new Promise(function (ok, no) {
      try {
        Office.context.document.settings.set(SETTINGS_KEY, JSON.stringify(obj));
        // البانل يفتح لوحده مع الملف (لكل اللي مركّبينه)
        Office.context.document.settings.set('Office.AutoShowTaskpaneWithDocument', !!obj.autoOpen);
        Office.context.document.settings.saveAsync(function (r) { r.status === 'succeeded' ? ok() : no(new Error('مقدرتش أحفظ الإعداد في الملف.')); });
      } catch (e) { no(e); }
    });
  }

  // البانل يفتح لوحده مع الملف افتراضيًا، إلا لو حد قفلها من الإعدادات
  function ensureAutoOpen(settings) {
    try {
      if (settings && settings.autoOpen === false) return;
      var st = Office.context.document.settings;
      if (st.get('Office.AutoShowTaskpaneWithDocument') === true) return;
      st.set('Office.AutoShowTaskpaneWithDocument', true);
      st.saveAsync(function () { });
    } catch (e) { }
  }

  // ---------- كتابة ----------
  // قيمة جاهزة للكتابة كـ formulas (أرقام، نص، أو معادلة) من غير تغيير تنسيق
  function cellValue(key, v, isMonth) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return v;
    var s = String(v);
    if (isMonth && s.charAt(0) === '=') return s;              // معادلة الليالي
    if (TEXT_COLS.indexOf(key) !== -1 && /^\d+$/.test(s)) return "'" + s;
    if (/^[=+\-@]/.test(s)) return "'" + s;                    // نص بيبدأ بعلامة متتقريش كمعادلة
    if (/^[\d\s\/\-.:,%]+$/.test(s)) return "'" + s;           // نص شكله رقم أو تاريخ يفضل نص زي ما اتكتب
    return s;
  }
  // بيجمّع الخانات المتجاورة ويكتب كل مجموعة مرة واحدة — طلبات أقل وإعادة حساب أقل
  function writeFields(body, H, rowIdx, obj, skipped, log) {
    var cells = {};
    Object.keys(obj).forEach(function (k) {
      var i = H.indexOf(k);
      if (i === -1) { if (skipped.indexOf(k) === -1) skipped.push(k); return; }
      cells[i] = cellValue(k, obj[k], MONTH_RE.test(k));
    });
    var idx = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
    for (var a = 0; a < idx.length;) {
      var b = a; while (b + 1 < idx.length && idx[b + 1] === idx[b] + 1) b++;
      var run = []; for (var j = a; j <= b; j++) run.push(cells[idx[j]]);
      body.getCell(rowIdx, idx[a]).getResizedRange(0, run.length - 1).formulas = [run];
      if (log) log.push({ body: body, row: rowIdx, col: idx[a], vals: run, keys: H.slice(idx[a], idx[a] + run.length) });
      a = b + 1;
    }
  }
  // ---------- التحقق بعد الكتابة ----------
  // بيرجع يقرا كل خانة اتكتبت من الملف نفسه ويقارنها باللي كان المفروض يتكتب
  function same(exp, val, fml) {
    if (exp === '' || exp === null || exp === undefined) return val === '' || val === null;
    if (typeof exp === 'number') return Math.abs(Number(val) - exp) < 0.005;
    var s = String(exp);
    if (s.charAt(0) === '=') return String(fml).replace(/\s/g, '').toUpperCase() === s.replace(/\s/g, '').toUpperCase();
    if (s.charAt(0) === "'") s = s.slice(1);
    return String(val).trim() === s.trim();
  }
  function verifyLog(ctx, log, rowOffset) {
    if (!log.length) return Promise.resolve([]);
    var rs = log.map(function (w) { return w.body.getCell(w.row, w.col).getResizedRange(0, w.vals.length - 1).load('values,formulas'); });
    return ctx.sync().then(function () {
      var bad = [];
      log.forEach(function (w, i) {
        w.vals.forEach(function (exp, j) {
          var v = rs[i].values[0][j], f = rs[i].formulas[0][j];
          if (!same(exp, v, f)) bad.push({ key: w.keys[j], expected: String(exp).replace(/^'/, ''), got: v === '' || v === null ? '(فاضية)' : String(v), row: w.row + (rowOffset || 0) });
        });
      });
      return bad;
    });
  }
  // يأجل إعادة حساب الملف لحد ما الكتابة تخلص (الملف تقيل)
  function holdCalc(ctx) {
    try { ctx.workbook.application.suspendApiCalculationUntilNextSync(); } catch (e) { /* نسخة أقدم */ }
  }
  // الخزينة: بنكتب بعد آخر سطر فيه تاريخ. السطور اللي تحته من غير تاريخ (التسويات) مبنلمسهاش
  var ENTRY_KEYS = ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'بيان'];
  function entryGap(c) {
    var len = c['تاريخ'].length, last = -1;
    for (var i = len - 1; i >= 0; i--) { var d = c['تاريخ'][i]; if (d !== '' && d !== null) { last = i; break; } }
    var start = last + 1, free = 0;
    for (var k = start; k < len; k++) {
      var busy = false; for (var j = 0; j < ENTRY_KEYS.length; j++) { var v = c[ENTRY_KEYS[j]][k]; if (v !== '' && v !== null) { busy = true; break; } }
      if (busy) break; free++;
    }
    var toEnd = start + free === len;
    // لو فيه تسويات تحت، نسيب سطر فاضي فاصل بينها وبين الحركات
    return { start: start, free: toEnd ? free : Math.max(0, free - 1), toEnd: toEnd, len: len };
  }
  function entryFree(ctx, T, n) {
    return readCols(ctx, T.t, T.H, ENTRY_KEYS).then(function (c) {
      var g = entryGap(c);
      if (g.free >= n) return { start: g.start, cols: c };
      if (!g.toEnd)
        throw { message: 'السطور الفاضية قبل سطور التسويات في الخزينة خلصت (فاضل ' + g.free + '). فك حماية شيت الخزينة، ومن الإعدادات ← إضافة سطور فاضية زوّد سطور، وهتتضاف فوق التسويات. وبعدين رجّع الحماية وجرب تاني.' };
      return freeRows(ctx, T, ['تاريخ', 'ايراد', 'مصروف', 'فئة'], n);
    });
  }
  // أول سطر فاضي بعد آخر سطر مستخدم، ويزود سطور لو مفيش
  function freeRows(ctx, T, keyCols, n) {
    return readCols(ctx, T.t, T.H, keyCols).then(function (c) {
      var len = c[keyCols[0]].length, last = -1;
      for (var i = len - 1; i >= 0 && last === -1; i--) {
        for (var j = 0; j < keyCols.length; j++) { var v = c[keyCols[j]][i]; if (v !== '' && v !== null) { last = i; break; } }
      }
      var start = last + 1, need = start + n - len;
      if (need <= 0) return { start: start, cols: c };
      var pr = T.t.worksheet.protection.load('protected,options');
      return ctx.sync().then(function () {
        // الإكسيل مش بيكبّر الجدول على شيت محمي حتى لو إضافة السطور مسموحة
        if (pr.protected)
          throw { message: 'جدول ' + (T.t.__name === 'entry' ? 'الخزينة' : T.t.__name === 'renter' ? 'عقود المستأجرين' : T.t.__name) + ' خلصت سطوره الفاضية والشيت محمي. فك الحماية دقيقة، واسحب آخر الجدول لتحت كام مئة سطر، ورجّع الحماية، وجرب تاني.' };
        for (var a = 0; a < need; a++) T.t.rows.add();
        return ctx.sync().then(function () { return { start: start, cols: c }; });
      });
    });
  }

  function writeEntriesCtx(ctx, entries, skipped, log) {
    if (!entries.length) return Promise.resolve([]);
    var E;
    return tableWithHeader(ctx, 'entry').then(function (e) { E = e; return entryFree(ctx, E, entries.length); })
      .then(function (f) {
        var body = E.t.getDataBodyRange(); var pos = body.load('rowIndex');
        holdCalc(ctx);
        var mine = [];
        entries.forEach(function (v, j) { writeFields(body, E.H, f.start + j, v, skipped, mine); });
        return ctx.sync().then(function () { return verifyLog(ctx, mine, pos.rowIndex + 1); }).then(function (bad) {
          if (log) bad.forEach(function (b) { b.table = 'الخزينة'; log.push(b); });
          return entries.map(function (_, j) { return pos.rowIndex + f.start + j + 1; });
        });
      });
  }

  function writeContract(form) {
    return Excel.run(function (ctx) {
      var R, code, skipped = [], start;
      return tableWithHeader(ctx, 'renter').then(function (r) { R = r; return freeRows(ctx, R, ['كود', 'كود المستأجر'], 1); })
        .then(function (f) {
          start = f.start;
          code = L.nextTenantCode(form.unit.code, f.cols['كود المستأجر']);
          var data = L.toRowValues(form, code), body = R.t.getDataBodyRange();
          var pos = body.load('rowIndex');
          holdCalc(ctx);
          var log = [];
          writeFields(body, R.H, start, data.fields, skipped, log);
          writeFields(body, R.H, start, data.months, skipped, log);
          R.t.worksheet.activate(); body.getRow(start).select();
          return ctx.sync().then(function () { return verifyLog(ctx, log, pos.rowIndex + 1); }).then(function (bad) {
            bad.forEach(function (b) { b.table = 'عقود المستأجرين'; });
            return { code: code, idx: start, sheetRow: pos.rowIndex + start + 1, duplicate: false, skipped: skipped, mismatch: bad };
          });
        });
    }).catch(fail);
  }
  function writeEntries(entries) {
    return Excel.run(function (ctx) {
      var skipped = [], bad = [];
      return writeEntriesCtx(ctx, entries, skipped, bad).then(function (rows) {
        return { rows: rows, skipped: skipped, mismatch: bad };
      });
    }).catch(fail);
  }

  /* plan: {oldIdx, oldCode, oldEndSerial, note, monthChanges, newUnit, newFields, newMonths, deposits:[{egp,fx,cash}], date, name} */
  function writeTransfer(plan) {
    return Excel.run(function (ctx) {
      var R, code, newIdx, skipped = [], res = {};
      return tableWithHeader(ctx, 'renter').then(function (r) {
        R = r;
        var chk = R.t.getDataBodyRange().getRow(plan.oldIdx).load('values');
        return ctx.sync().then(function () {
          if (String(chk.values[0][R.H.indexOf('كود المستأجر')]).trim() !== plan.oldCode)
            throw { message: 'سطر العقد القديم اتغير مكانه. اضغط تحديث وجرب تاني.' };
          return freeRows(ctx, R, ['كود', 'كود المستأجر'], 1);
        });
      }).then(function (f) {
        newIdx = f.start;
        code = L.nextTenantCode(plan.newUnit, f.cols['كود المستأجر']);
        var body = R.t.getDataBodyRange();
        res.pos = body.load('rowIndex');
        holdCalc(ctx);
        var old = { 'نهاية العقد': plan.oldEndSerial, 'ملاحظات': plan.oldNote.replace('{NEW}', code) };
        res.log = [];
        writeFields(body, R.H, plan.oldIdx, old, skipped, res.log);
        writeFields(body, R.H, plan.oldIdx, plan.monthChanges, skipped, res.log);
        var nf = {}; Object.keys(plan.newFields).forEach(function (k) { nf[k] = plan.newFields[k]; });
        nf['كود'] = Number(plan.newUnit) || plan.newUnit; nf['كود المستأجر'] = code;
        writeFields(body, R.H, newIdx, nf, skipped, res.log);
        writeFields(body, R.H, newIdx, plan.newMonths, skipped, res.log);
        return ctx.sync().then(function () { return verifyLog(ctx, res.log, res.pos.rowIndex + 1); })
          .then(function (bad) { res.bad = bad; bad.forEach(function (b) { b.table = 'عقود المستأجرين'; }); });
      }).then(function () {
        var ents = [];
        plan.deposits.forEach(function (d) {
          ents.push({ 'تاريخ': plan.dateSerial, 'مصروف': d.egp, 'كود': Number(plan.oldUnit) || plan.oldUnit, 'فئة': 'رد تأمين للمستأجر',
            'بيان': 'نقل تأمين إلى ' + code + ' / ' + plan.name, 'كود المستأجر': plan.oldCode, 'كاش': d.cash });
          ents.push({ 'تاريخ': plan.dateSerial, 'ايراد': d.egp, 'كود': Number(plan.newUnit) || plan.newUnit, 'فئة': 'تحصيل تأمين',
            'بيان': 'نقل تأمين من ' + plan.oldCode + ' / ' + plan.name, 'كود المستأجر': code, 'كاش': d.cash });
          if (d.fx) { ents[ents.length - 2]['العملة'] = d.fx; ents[ents.length - 1]['العملة'] = d.fx; }
        });
        return writeEntriesCtx(ctx, ents, skipped, res.bad);
      }).then(function (rows) {
        res.entryRows = rows;
        R.t.worksheet.activate(); R.t.getDataBodyRange().getRow(newIdx).select();
        return ctx.sync().then(function () {
          return { code: code, idx: newIdx, sheetRow: res.pos.rowIndex + newIdx + 1, duplicate: false, skipped: skipped, entryRows: res.entryRows, mismatch: res.bad };
        });
      });
    }).catch(fail);
  }

  // ---------- تعديل خانات في سطر عقد موجود (استلام، تمديد، تسليم مبكر) ----------
  function updateRenter(idx, code, fields) {
    return Excel.run(function (ctx) {
      var R, res = {}, skipped = [];
      return tableWithHeader(ctx, 'renter').then(function (r) {
        R = r;
        var chk = R.t.getDataBodyRange().getRow(idx).load('values');
        return ctx.sync().then(function () {
          if (String(chk.values[0][R.H.indexOf('كود المستأجر')]).trim() !== String(code))
            throw { message: 'سطر العقد اتغير مكانه. اضغط تحديث وجرب تاني.' };
          var body = R.t.getDataBodyRange(); res.pos = body.load('rowIndex'); res.log = [];
          holdCalc(ctx);
          writeFields(body, R.H, idx, fields, skipped, res.log);
          return ctx.sync();
        });
      }).then(function () { return verifyLog(ctx, res.log, res.pos.rowIndex + 1); }).then(function (bad) {
        bad.forEach(function (b) { b.table = 'عقود المستأجرين'; });
        if (skipped.length) throw { message: 'خانات مش موجودة في الجدول: ' + skipped.join('، ') };
        return { idx: idx, sheetRow: res.pos.rowIndex + idx + 1, mismatch: bad, skipped: skipped };
      });
    }).catch(fail);
  }

  // ---------- عقود الملاك ----------
  // يقرا سطر الوحدة كامل (كل الأعمدة) عشان التعديل والتجديد
  function readOwnerRow(idx, code) {
    return Excel.run(function (ctx) {
      return tableWithHeader(ctx, 'owner').then(function (O) {
        var r = O.t.getDataBodyRange().getRow(idx).load('values');
        return ctx.sync().then(function () {
          var v = r.values[0], out = {};
          O.H.forEach(function (h, i) { if (h) out[h] = v[i]; });
          if (String(out['كود']).trim() !== String(code)) throw { message: 'سطر الوحدة اتغير مكانه. اضغط تحديث وجرب تاني.' };
          return { H: O.H, row: out };
        });
      });
    }).catch(fail);
  }
  // تعليقات الإكسيل (Comments مش Notes): لو الخانة عليها تعليق بنضيف رد عليه
  function addComments(ctx, body, H, row, list) {
    if (!list || !list.length) return Promise.resolve({ ok: 0, failed: 0 });
    if (!ctx.workbook.comments || !(root.Office && Office.context && Office.context.requirements && Office.context.requirements.isSetSupported('ExcelApi', '1.10')))
      return Promise.resolve({ ok: 0, failed: list.length, unsupported: true });
    var ok = 0, failed = 0, p = Promise.resolve();
    list.forEach(function (c) {
      p = p.then(function () {
        var ci = H.indexOf(c.key); if (ci === -1) { failed++; return; }
        var cell = body.getCell(row, ci), ex = ctx.workbook.comments.getItemByCell(cell); ex.load('id');
        return ctx.sync().then(function () { ex.replies.add(c.text); return ctx.sync(); }, function () { ctx.workbook.comments.add(cell, c.text); return ctx.sync(); })
          .then(function () { ok++; }, function () { failed++; });
      });
    });
    return p.then(function () { return { ok: ok, failed: failed }; });
  }
  // plan: {idx (أو null لوحدة جديدة), code, fields:{عمود: قيمة}, months:{Oct-26: 60000}, comments:[{key, text}]}
  function writeOwner(plan) {
    return Excel.run(function (ctx) {
      var O, row, res = { log: [], skipped: [] };
      return tableWithHeader(ctx, 'owner').then(function (o) {
        O = o;
        var miss = Object.keys(plan.months || {}).filter(function (k) { return O.H.indexOf(k) === -1; });
        if (miss.length) throw { message: 'أعمدة الشهور دي مش موجودة في جدول الملاك: ' + miss.slice(0, 6).join('، ') + (miss.length > 6 ? ' و' + (miss.length - 6) + ' غيرهم' : '') + '.', missingMonths: miss };
        if (plan.idx === null || plan.idx === undefined) {
          return readCols(ctx, O.t, O.H, ['كود']).then(function (c) {
            if (c['كود'].some(function (v) { return String(v).trim() === String(plan.code); })) throw { message: 'الكود ' + plan.code + ' موجود قبل كده في جدول الملاك.' };
            return freeRows(ctx, O, ['كود', 'المشروع', 'الاسم'], 1);
          }).then(function (f) { row = f.start; });
        }
        var chk = O.t.getDataBodyRange().getRow(plan.idx).load('values');
        return ctx.sync().then(function () {
          if (String(chk.values[0][O.H.indexOf('كود')]).trim() !== String(plan.code)) throw { message: 'سطر الوحدة اتغير مكانه. اضغط تحديث وجرب تاني.' };
          row = plan.idx;
        });
      }).then(function () {
        var body = O.t.getDataBodyRange(); res.pos = body.load('rowIndex'); res.body = body;
        holdCalc(ctx);
        writeFields(body, O.H, row, plan.fields || {}, res.skipped, res.log);
        writeFields(body, O.H, row, plan.months || {}, res.skipped, res.log);
        if (plan.idx === null || plan.idx === undefined) { O.t.worksheet.activate(); body.getRow(row).select(); }
        return ctx.sync();
      }).then(function () { return verifyLog(ctx, res.log, res.pos.rowIndex + 1); }).then(function (bad) {
        bad.forEach(function (b) { b.table = 'عقود الملاك'; });
        res.bad = bad;
        return addComments(ctx, res.body, O.H, row, plan.comments).catch(function () { return { ok: 0, failed: (plan.comments || []).length }; });
      }).then(function (cm) {
        return { idx: row, sheetRow: res.pos.rowIndex + row + 1, mismatch: res.bad, skipped: res.skipped, comments: cm };
      });
    }).catch(fail);
  }

  // يزوّد أعمدة شهور في آخر الجدول لحد آخر شهر مطلوب (بالترتيب ومن غير فجوات)
  function addMonthColumns(name, upto) {
    var F2 = root.OsoolFollow;
    return Excel.run(function (ctx) {
      return tableWithHeader(ctx, name).then(function (T) {
        var pr = T.t.worksheet.protection.load('protected');
        return ctx.sync().then(function () {
          if (pr.protected) throw { message: 'الشيت محمي. فك الحماية الأول، وبعد إضافة الأعمدة رجّعها.' };
          var last = T.H[T.H.length - 1];
          if (!MONTH_RE.test(last)) throw { message: 'آخر عمود في الجدول مش عمود شهر (' + last + ')، فمش هقدر أزوّد شهور في الآخر. زوّدها بإيدك.' };
          var keys = [], k = last;
          while (F2.cmpKey(k, upto) < 0) { k = L.monthKey(L.addMonths(F2.keyToDate(k), 1)); keys.push(k); if (keys.length > 120) break; }
          if (!keys.length) return [];
          holdCalc(ctx);
          keys.forEach(function (h) { T.t.columns.add(null, null, h); });
          return ctx.sync().then(function () { return keys; });
        });
      });
    }).catch(fail);
  }

  // ---------- إضافة سطور فاضية (بعد ما المستخدم يفك الحماية) ----------
  var ROW_KEYS = { entry: ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'بيان'], renter: ['كود', 'كود المستأجر'] };
  var TABLE_AR = { entry: 'الخزينة', renter: 'عقود المستأجرين' };
  function infoCtx(ctx, name) {
    var T;
    return tableWithHeader(ctx, name).then(function (x) { T = x; return readCols(ctx, T.t, T.H, ROW_KEYS[name]); }).then(function (c) {
      var keys = ROW_KEYS[name], len = c[keys[0]].length, last = -1;
      for (var i = len - 1; i >= 0 && last === -1; i--) for (var j = 0; j < keys.length; j++) { var v = c[keys[j]][i]; if (v !== '' && v !== null) { last = i; break; } }
      var g = name === 'entry' ? entryGap(c) : null;
      var pr = T.t.worksheet.protection.load('protected');
      return ctx.sync().then(function () {
        if (g && !g.toEnd) return { name: name, title: TABLE_AR[name], total: len, used: g.start, empty: g.free, settle: true, insertAt: g.start, protected: pr.protected, T: T };
        return { name: name, title: TABLE_AR[name], total: len, used: last + 1, empty: len - last - 1, protected: pr.protected, T: T };
      });
    });
  }
  function tableInfo(name) {
    return Excel.run(function (ctx) { return infoCtx(ctx, name).then(function (i) { delete i.T; return i; }); }).catch(fail);
  }
  function addRows(name, n) {
    n = Math.floor(Number(n) || 0);
    if (n < 1 || n > 2000) return Promise.reject(new Error('عدد السطور لازم يكون من ١ لـ ٢٠٠٠.'));
    return Excel.run(function (ctx) {
      var before;
      return infoCtx(ctx, name).then(function (info) {
        before = info;
        if (info.protected) throw { message: 'شيت ' + info.title + ' لسه محمي. فك الحماية الأول، وبعد الإضافة رجّعها.' };
        var t = info.T.t;
        if (info.settle) {
          // فيه تسويات تحت: ندخّل السطور جوه الجدول فوقها، فتنزل التسويات لتحت زي ما هي
          holdCalc(ctx);
          t.getDataBodyRange().getRow(info.insertAt).getResizedRange(n - 1, 0).insert('Down');
          return ctx.sync();
        }
        var below = t.getRange().getRowsBelow(n).load('values');
        t.load('showTotals');
        return ctx.sync().then(function () {
          var busy = below.values.some(function (r) { return r.some(function (v) { return v !== '' && v !== null; }); });
          var canResize = !t.showTotals && typeof t.resize === 'function' && root.Office && Office.context && Office.context.requirements && Office.context.requirements.isSetSupported('ExcelApi', '1.13');
          holdCalc(ctx);
          if (canResize) {
            // لو تحت الجدول حاجة (زي سطر الإجماليات)، ندخّل سطور كاملة الأول فتنزل لتحت زي ما هي
            if (busy) below.getEntireRow().insert('Down');
            return ctx.sync().then(function () { holdCalc(ctx); t.resize(t.getRange().getResizedRange(n, 0)); return ctx.sync(); });
          }
          // نسخة أقدم أو جدول بسطر إجمالي: الإكسيل بيدخّل السطور بنفسه وينزّل اللي تحت
          var left = n, step = function () { if (left <= 0) return Promise.resolve(); var k = Math.min(100, left); left -= k; holdCalc(ctx); for (var a = 0; a < k; a++) t.rows.add(); return ctx.sync().then(step); };
          return step();
        });
      }).then(function () { return infoCtx(ctx, name); }).then(function (after) {
        delete after.T;
        after.added = after.total - before.total;
        if (after.added !== n) throw { message: 'اتضاف ' + after.added + ' سطر بس من ' + n + '. راجع آخر جدول ' + after.title + '.' };
        // لو فيه إجماليات تحت الجدول بنطاق ثابت (زي C5:C29420)، مش هتشمل السطور الجديدة
        var tb = ctx.workbook.tables.getItem(name), under = tb.getRange().getRowsBelow(1).load('formulas'), top = tb.getRange().load('rowIndex,rowCount');
        return ctx.sync().then(function () {
          var lastRow = top.rowIndex + top.rowCount; // رقم آخر سطر في الجدول (من ١)
          after.fixedTotals = under.formulas[0].some(function (f) {
            if (typeof f !== 'string' || f.charAt(0) !== '=') return false;
            var m, re = /\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?(\d+)/g;
            while ((m = re.exec(f))) if (+m[1] < lastRow) return true;
            return false;
          });
          return after;
        });
      });
    }).catch(fail);
  }

  function goTo(tableName, idx) {
    return Excel.run(function (ctx) {
      var t = ctx.workbook.tables.getItem(tableName);
      t.worksheet.activate(); t.getDataBodyRange().getRow(idx).select();
      return ctx.sync();
    }).catch(fail);
  }

  root.OsoolExcel = {
    loadAll: loadAll, loadTreasury: loadTreasury, readRenterRow: readRenterRow,
    getSettings: getSettings, ensureAutoOpen: ensureAutoOpen, saveSettings: saveSettings,
    writeContract: writeContract, writeEntries: writeEntries, writeTransfer: writeTransfer,
    tableInfo: tableInfo, addRows: addRows, readOwnerRow: readOwnerRow, writeOwner: writeOwner, addMonthColumns: addMonthColumns, updateRenter: updateRenter,
    goToRow: function (idx) { return goTo('renter', idx); }, goTo: goTo
  };
})(this);
