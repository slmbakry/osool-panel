/* لوحة أصول — منطق العقود (بدون أي اعتماد على الإكسيل) */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = 86400000;

  // ---------- التواريخ (كلها UTC) ----------
  function serialToDate(s) {
    if (s === null || s === undefined || s === '') return null;
    if (s instanceof Date) return s;
    var n = Number(s);
    if (!isFinite(n) || n <= 0) return null;
    return new Date(Math.round((n - 25569) * DAY));
  }
  function dateToSerial(d) { return Math.round(d.getTime() / DAY) + 25569; }
  function parseISO(str) {
    if (!str) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  function toISO(d) { return d ? d.toISOString().slice(0, 10) : ''; }
  function fmt(d) {
    if (!d) return '—';
    var dd = String(d.getUTCDate()).padStart(2, '0');
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getUTCFullYear();
  }
  function todayUTC() {
    var n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function addMonths(d, k) {
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + k, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last)));
  }
  function monthKey(d) { return MONTHS[d.getUTCMonth()] + '-' + String(d.getUTCFullYear()).slice(2); }
  function monthLabel(key) {
    var ar = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    var p = key.split('-');
    return ar[MONTHS.indexOf(p[0])] + ' ' + (2000 + Number(p[1]));
  }
  // نفس DATEDIF(start, end+1, "m") و "md"
  function monthsAndDays(start, end) {
    var stop = new Date(end.getTime() + DAY);
    var m = (stop.getUTCFullYear() - start.getUTCFullYear()) * 12 + (stop.getUTCMonth() - start.getUTCMonth());
    if (stop.getUTCDate() < start.getUTCDate()) m -= 1;
    if (m < 0) m = 0;
    var anchor = addMonths(start, m);
    return { months: m, days: daysBetween(anchor, stop) };
  }

  // ---------- الوحدات والعقود ----------
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }

  function buildUnits(owner) {
    var c = owner.cols, out = [];
    for (var i = 0; i < c['كود'].length; i++) {
      var code = c['كود'][i];
      if (code === null || code === '' || code === undefined) continue;
      if (Number(code) === 1) continue; // حساب عام
      if (!str(c['المشروع'][i]) && !str(c['شقة'][i])) continue;
      out.push({
        code: str(code),
        project: str(c['المشروع'][i]),
        block: str(c['بلوك'][i]),
        building: str(c['عمارة'][i]),
        apt: str(c['شقة'][i]),
        owner: str(c['الاسم'][i]),
        ownerEnd: serialToDate(c['نهاية العقد'][i]),
        bedrooms: str(c['Bedrooms'][i]),
        settle: c['تسويات'] ? str(c['تسويات'][i]) : ''
      });
    }
    return out;
  }

  function buildRenters(renter) {
    var c = renter.cols, out = [];
    for (var i = 0; i < c['كود'].length; i++) {
      var tcode = str(c['كود المستأجر'][i]);
      var unit = str(c['كود'][i]);
      if (!tcode && !unit) continue;
      out.push({
        idx: i,
        unit: unit,
        code: tcode,
        start: serialToDate(c['بداية العقد'][i]),
        end: serialToDate(c['نهاية العقد'][i]),
        name: str(c['الاسم'][i]),
        phone: str(c['التليفون'][i]),
        idNo: str(c['رقم البطاقة - جواز السفر'][i]),
        nationality: str(c['الجنسية'][i]),
        special: str(c['Special'][i]),
        operation: str(c['Operation'][i]),
        broker: c['البروكر'] ? str(c['البروكر'][i]) : '',
        rent: c['قيمة الايجار'] ? c['قيمة الايجار'][i] : null,
        deposit: c['التأمين'] ? c['التأمين'][i] : null
      });
    }
    return out;
  }

  function lastFilledIndex(unitCol, codeCol) {
    for (var i = unitCol.length - 1; i >= 0; i--) {
      if (str(unitCol[i]) || str(codeCol[i])) return i;
    }
    return -1;
  }

  function nextTenantCode(unitCode, codes) {
    var prefix = str(unitCode) + '-';
    var max = 0;
    for (var i = 0; i < codes.length; i++) {
      var c = str(codes[i]);
      if (c.indexOf(prefix) !== 0) continue;
      var n = parseInt(c.slice(prefix.length), 10);
      if (isFinite(n) && n > max) max = n;
    }
    var next = max + 1;
    return prefix + (next < 100 ? String(next).padStart(2, '0') : String(next));
  }

  function unitStatus(unitCode, renters, today) {
    today = today || todayUTC();
    var mine = renters.filter(function (r) { return r.unit === str(unitCode) && r.start && r.end; });
    var current = mine.filter(function (r) { return r.start <= today && r.end >= today; })
      .sort(function (a, b) { return b.end - a.end; })[0] || null;
    var upcoming = mine.filter(function (r) { return r.start > today; })
      .sort(function (a, b) { return a.start - b.start; });
    return { current: current, upcoming: upcoming, count: mine.length };
  }

  // تداخل حقيقي فقط: التسليم والاستلام في نفس اليوم مسموح
  function findOverlaps(unitCode, start, end, renters) {
    if (!start || !end) return [];
    return renters.filter(function (r) {
      return r.unit === str(unitCode) && r.start && r.end && r.start < end && start < r.end;
    });
  }

  // ---------- جدول الاستحقاق ----------
  function round2(n) { return Math.round(n * 100) / 100; }
  // من واقع الملف: العقود اللي بتبدأ بعد يوم 20 غالباً استحقاقها بيبدأ الشهر اللي بعده
  function defaultShift(start) { return start && start.getUTCDate() > 20 ? 1 : 0; }

  function buildSchedule(o) {
    var start = o.start, end = o.end;
    if (!start || !end || end <= start) return [];
    if (o.type === 'nightly') {
      var nights = daysBetween(start, end);
      var rate = Number(o.rate) || 0;
      if (!rate) return [];
      var amt = round2(rate * nights);
      return [{ key: monthKey(start), amount: amt, formula: '=' + rate + '*' + nights, formulaAmount: amt, note: nights + ' ليلة × ' + rate }];
    }
    var rent = Number(o.rent) || 0;
    if (!rent) return [];
    var md = monthsAndDays(start, end), rows = [];
    var shift = o.shift === undefined ? defaultShift(start) : Number(o.shift) || 0;
    var base = addMonths(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), shift);
    for (var k = 0; k < md.months; k++) {
      rows.push({ key: monthKey(addMonths(base, k)), amount: rent, formula: null, note: '' });
    }
    if (md.days > 0) {
      var part = Math.round(rent / 30 * md.days);
      var key = monthKey(addMonths(base, md.months));
      var existing = rows.filter(function (r) { return r.key === key; })[0];
      if (existing) { existing.amount += part; existing.note = 'شامل ' + md.days + ' يوم'; existing.estimated = true; }
      else rows.push({ key: key, amount: part, formula: null, note: md.days + ' يوم — تقديري', estimated: true });
    }
    return rows;
  }

  function durationText(start, end) {
    if (!start || !end || end <= start) return '';
    var md = monthsAndDays(start, end);
    var nights = daysBetween(start, end);
    var parts = [];
    if (md.months >= 12) { parts.push(Math.floor(md.months / 12) + ' سنة'); }
    if (md.months % 12) parts.push((md.months % 12) + ' شهر');
    if (md.days) parts.push(md.days + ' يوم');
    return (parts.join(' و ') || '0 يوم') + ' · ' + nights + ' ليلة';
  }

  // ---------- المراجعة قبل الحفظ ----------
  function validate(f, ctx) {
    var errors = [], warnings = [];
    if (!f.unit) errors.push('اختار الوحدة.');
    if (!str(f.name)) errors.push('اكتب اسم المستأجر.');
    if (!f.start) errors.push('حدد تاريخ البداية.');
    if (!f.end) errors.push('حدد تاريخ النهاية.');
    if (f.start && f.end && f.end <= f.start) errors.push('تاريخ النهاية لازم يكون بعد البداية.');
    var total = (f.schedule || []).reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
    if (f.start && f.end && f.end > f.start && total <= 0) errors.push('مفيش استحقاق: اكتب ' + (f.type === 'nightly' ? 'سعر الليلة.' : 'الإيجار الشهري.'));
    if (f.special === 'ابو ادم' && !str(f.rate)) warnings.push('عميل أبو آدم من غير سعر يومي في خانة المعدل.');
    if (!str(f.phone)) warnings.push('مفيش رقم تليفون.');
    if (f.unit && f.start && f.end) {
      var ov = findOverlaps(f.unit.code, f.start, f.end, ctx.renters);
      ov.forEach(function (r) {
        warnings.push('متداخل مع ' + (r.name || 'عقد') + ' (' + r.code + ') من ' + fmt(r.start) + ' إلى ' + fmt(r.end) + '.');
      });
      if (f.unit.ownerEnd && f.end > f.unit.ownerEnd) warnings.push('العقد بيخلص بعد نهاية عقد المالك (' + fmt(f.unit.ownerEnd) + ').');
    }
    var missing = (f.schedule || []).filter(function (r) { return ctx.monthHeaders.indexOf(r.key) === -1; });
    if (missing.length) errors.push('شهور مش موجودة في الجدول: ' + missing.map(function (r) { return monthLabel(r.key); }).join('، ') + '. لازم تزود أعمدتها الأول.');
    return { errors: errors, warnings: warnings, total: total };
  }

  // ---------- البحث ----------
  function norm(s) {
    return str(s).toLowerCase()
      .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ');
  }
  function searchUnits(units, q) {
    var n = norm(q);
    if (!n) return [];
    return units.filter(function (u) {
      return norm([u.code, u.project, u.block, u.building, u.apt, u.owner].join(' ')).indexOf(n) !== -1;
    }).slice(0, 12);
  }
  function searchRenters(renters, q, limit) {
    var n = norm(q);
    if (n.length < 2) return [];
    var digits = n.replace(/\D/g, '');
    return renters.filter(function (r) {
      if (norm(r.name).indexOf(n) !== -1 || norm(r.code).indexOf(n) !== -1 || r.unit === n) return true;
      if (digits.length >= 5 && r.phone.replace(/\D/g, '').indexOf(digits) !== -1) return true;
      if (digits.length >= 4 && r.idNo.replace(/\D/g, '').indexOf(digits) !== -1) return true;
      return false;
    }).sort(function (a, b) { return (b.start || 0) - (a.start || 0); }).slice(0, limit || 30);
  }

  function topValues(list, field, n) {
    var counts = {};
    list.forEach(function (r) { var v = str(r[field]); if (v) counts[v] = (counts[v] || 0) + 1; });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, n || 25);
  }

  // ---------- تجهيز السطر للكتابة ----------
  function toRowValues(f, code) {
    var v = {};
    v['كود'] = Number(f.unit.code);
    v['كود المستأجر'] = code;
    if (f.notifyDate) v['تاريخ تبليغ القسم'] = dateToSerial(f.notifyDate);
    v['بداية العقد'] = dateToSerial(f.start);
    v['نهاية العقد'] = dateToSerial(f.end);
    v['الاسم'] = str(f.name);
    var map = {
      'Special': f.special, 'Rate': f.rate, 'الجنسية': f.nationality,
      'رقم البطاقة - جواز السفر': f.idNo, 'التليفون': f.phone,
      'التأمين': f.deposit, 'تحصيل كل': f.collectEvery, 'Operation': f.operation,
      'الاستهلاكات': f.utilities, 'البروكر': f.broker, 'عمولة البروكر': f.brokerFee,
      'موقف الاستلام': f.receipt, 'ملاحظات': f.notes
    };
    Object.keys(map).forEach(function (k) {
      var x = str(map[k]);
      if (!x) return;
      v[k] = (/^-?\d+(\.\d+)?$/.test(x) && k !== 'التليفون' && k !== 'رقم البطاقة - جواز السفر') ? Number(x) : x;
    });
    if (f.type === 'monthly' && Number(f.rent)) v['قيمة الايجار'] = Number(f.rent);
    var months = {};
    (f.schedule || []).forEach(function (r) {
      var amt = Number(r.amount) || 0;
      if (!amt) return;
      months[r.key] = (r.formula && r.amount === r.formulaAmount) ? r.formula : amt;
    });
    return { fields: v, months: months };
  }

  var api = {
    serialToDate: serialToDate, dateToSerial: dateToSerial, parseISO: parseISO, toISO: toISO, fmt: fmt,
    todayUTC: todayUTC, daysBetween: daysBetween, addMonths: addMonths, monthKey: monthKey, monthLabel: monthLabel,
    monthsAndDays: monthsAndDays, buildUnits: buildUnits, buildRenters: buildRenters, lastFilledIndex: lastFilledIndex,
    nextTenantCode: nextTenantCode, defaultShift: defaultShift, unitStatus: unitStatus, findOverlaps: findOverlaps, buildSchedule: buildSchedule,
    durationText: durationText, validate: validate, searchUnits: searchUnits, searchRenters: searchRenters,
    topValues: topValues, toRowValues: toRowValues, norm: norm
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OsoolLogic = api;
})(this);
