/* لوحة أصول — طبقة الاتصال بالإكسيل */
(function (root) {
  'use strict';
  var L = root.OsoolLogic;

  var OWNER_COLS = ['كود', 'المشروع', 'بلوك', 'عمارة', 'شقة', 'الاسم', 'نهاية العقد', 'Bedrooms'];
  var OWNER_OPT = ['تسويات', 'Info', 'قيمة الايجار', 'يسدد كل'];
  var RENTER_COLS = ['كود', 'كود المستأجر', 'بداية العقد', 'نهاية العقد', 'الاسم', 'التليفون',
    'رقم البطاقة - جواز السفر', 'الجنسية', 'Special', 'Operation'];
  var RENTER_OPT = ['البروكر', 'قيمة الايجار', 'التأمين', 'موقف الاستلام'];
  var ENTRY_COLS = ['تاريخ', 'ايراد', 'مصروف', 'فئة', 'شهر', 'نهاية الايجار', 'كود المستأجر', 'كاش', 'العملة'];
  var ENTRY_OPT = ['رقم المستند', 'كود', 'بيان', 'بداية الايجار', 'مراجعة'];
  var TEXT_COLS = ['كود المستأجر', 'التليفون', 'رقم البطاقة - جواز السفر'];
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
  function fail(e) { throw new Error(friendly(e)); }

  // يقرا أعمدة بالاسم على دفعات صغيرة
  function readCols(ctx, table, hdr, names, optional, perSync) {
    var per = perSync || PER_SYNC;
    var list = [];
    names.forEach(function (h) { var i = hdr.indexOf(h); if (i === -1) throw { message: 'العمود "' + h + '" مش موجود في جدول ' + table.__name + '.' }; list.push([h, i]); });
    (optional || []).forEach(function (h) { var i = hdr.indexOf(h); if (i !== -1) list.push([h, i]); });
    var out = {}, p = Promise.resolve();
    for (var s = 0; s < list.length; s += per) {
      (function (batch) {
        p = p.then(function () {
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

  // ---------- كتابة ----------
  function setCell(body, r, c, key, v) {
    var cell = body.getCell(r, c);
    if (v === null) { cell.values = [['']]; return; }
    if (typeof v === 'string' && v.charAt(0) === '=') { cell.formulas = [[v]]; return; }
    // من غير تغيير تنسيق (الشيت ممكن يكون محمي): الأرقام الطويلة تتكتب كنص بعلامة '
    if (TEXT_COLS.indexOf(key) !== -1) { var s = String(v); cell.values = [[/^\d+$/.test(s) ? "'" + s : s]]; return; }
    cell.values = [[v]];
  }
  // قيمة جاهزة للكتابة كـ formulas (أرقام، نص، أو معادلة) من غير تغيير تنسيق
  function cellValue(key, v, isMonth) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return v;
    var s = String(v);
    if (isMonth && s.charAt(0) === '=') return s;              // معادلة الليالي
    if (TEXT_COLS.indexOf(key) !== -1 && /^\d+$/.test(s)) return "'" + s;
    if (/^[=+\-@]/.test(s)) return "'" + s;                    // نص بيبدأ بعلامة متتقريش كمعادلة
    return s;
  }
  // بيجمّع الخانات المتجاورة ويكتب كل مجموعة مرة واحدة — طلبات أقل وإعادة حساب أقل
  function writeFields(body, H, rowIdx, obj, skipped) {
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
      a = b + 1;
    }
  }
  // يأجل إعادة حساب الملف لحد ما الكتابة تخلص (الملف تقيل)
  function holdCalc(ctx) {
    try { ctx.workbook.application.suspendApiCalculationUntilNextSync(); } catch (e) { /* نسخة أقدم */ }
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
        if (pr.protected && !(pr.options && pr.options.allowInsertRows))
          throw { message: 'جدول ' + T.t.__name + ' مفيهوش سطور فاضية، والشيت محمي ومش سامح بإضافة سطور. افتح الحماية أو اسمح بإضافة سطور فيها، أو زوّد سطور فاضية للجدول بإيدك.' };
        for (var a = 0; a < need; a++) T.t.rows.add();
        return ctx.sync().then(function () { return { start: start, cols: c }; });
      });
    });
  }

  function writeEntriesCtx(ctx, entries, skipped) {
    if (!entries.length) return Promise.resolve([]);
    var E;
    return tableWithHeader(ctx, 'entry').then(function (e) { E = e; return freeRows(ctx, E, ['تاريخ', 'ايراد', 'مصروف', 'فئة'], entries.length); })
      .then(function (f) {
        var body = E.t.getDataBodyRange(); var pos = body.load('rowIndex');
        holdCalc(ctx);
        entries.forEach(function (v, j) { writeFields(body, E.H, f.start + j, v, skipped); });
        return ctx.sync().then(function () {
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
          writeFields(body, R.H, start, data.fields, skipped);
          writeFields(body, R.H, start, data.months, skipped);
          R.t.worksheet.activate(); body.getRow(start).select();
          return ctx.sync().then(function () {
            return { code: code, idx: start, sheetRow: pos.rowIndex + start + 1, duplicate: false, skipped: skipped };
          });
        });
    }).catch(fail);
  }
  function writeEntries(entries) {
    return Excel.run(function (ctx) {
      var skipped = [];
      return writeEntriesCtx(ctx, entries, skipped).then(function (rows) {
        return { rows: rows, skipped: skipped };
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
        writeFields(body, R.H, plan.oldIdx, old, skipped);
        writeFields(body, R.H, plan.oldIdx, plan.monthChanges, skipped);
        var nf = {}; Object.keys(plan.newFields).forEach(function (k) { nf[k] = plan.newFields[k]; });
        nf['كود'] = Number(plan.newUnit) || plan.newUnit; nf['كود المستأجر'] = code;
        writeFields(body, R.H, newIdx, nf, skipped);
        writeFields(body, R.H, newIdx, plan.newMonths, skipped);
        return ctx.sync();
      }).then(function () {
        var ents = [];
        plan.deposits.forEach(function (d) {
          ents.push({ 'تاريخ': plan.dateSerial, 'مصروف': d.egp, 'كود': Number(plan.oldUnit) || plan.oldUnit, 'فئة': 'رد تأمين للمستأجر',
            'بيان': 'نقل تأمين إلى ' + code + ' / ' + plan.name, 'كود المستأجر': plan.oldCode, 'كاش': d.cash });
          ents.push({ 'تاريخ': plan.dateSerial, 'ايراد': d.egp, 'كود': Number(plan.newUnit) || plan.newUnit, 'فئة': 'تحصيل تأمين',
            'بيان': 'نقل تأمين من ' + plan.oldCode + ' / ' + plan.name, 'كود المستأجر': code, 'كاش': d.cash });
          if (d.fx) { ents[ents.length - 2]['العملة'] = d.fx; ents[ents.length - 1]['العملة'] = d.fx; }
        });
        return writeEntriesCtx(ctx, ents, skipped);
      }).then(function (rows) {
        res.entryRows = rows;
        R.t.worksheet.activate(); R.t.getDataBodyRange().getRow(newIdx).select();
        return ctx.sync().then(function () {
          return { code: code, idx: newIdx, sheetRow: res.pos.rowIndex + newIdx + 1, duplicate: false, skipped: skipped, entryRows: res.entryRows };
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
    getSettings: getSettings, saveSettings: saveSettings,
    writeContract: writeContract, writeEntries: writeEntries, writeTransfer: writeTransfer,
    goToRow: function (idx) { return goTo('renter', idx); }, goTo: goTo
  };
})(this);
