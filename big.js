/* لوحة أصول — النافذة الكبيرة: نفس البانل في نافذة فوق الإكسيل، للعرض بس.
   الداتا بتيجي من البانل على أجزاء (النافذة مش بتقدر تقرا من الإكسيل)، وأي تسجيل بيتعمل من البانل نفسه. */
(function () {
  'use strict';
  var q = location.search;
  if (!/[?&]big=1/.test(q)) return;
  document.documentElement.classList.add('big');
  window.OsoolBig = { tab: (q.match(/[?&]tab=([a-z]+)/) || [])[1] || 'home' };
  try { if (/[?&]cmp=1/.test(q)) localStorage.setItem('osoolPanel.cmp', '1'); } catch (e) { }
  var parts = [], got = 0, done, D = null, ready = new Promise(function (r) { done = r; });
  function say(t) { var el = document.getElementById('loading'); if (el && el.lastChild) el.lastChild.textContent = t; }
  function onMsg(a) {
    var x; try { x = JSON.parse(a.message); } catch (e) { return; }
    if (parts[x.i] === undefined) { parts[x.i] = x.d; got++; }
    say('بيجيب الداتا من البانل… ' + Math.round(100 * got / x.n) + '%');
    if (got === x.n) { D = JSON.parse(parts.join('')); parts = null; done(D); }
  }
  function send(o) { try { Office.context.ui.messageParent(JSON.stringify(o)); } catch (e) { } }
  function ro() { return Promise.reject(new Error('دي نافذة عرض بس. التسجيل والتعديل من البانل.')); }
  function row(tb, idx) { var o = {}; Object.keys(tb.cols).forEach(function (h) { o[h] = tb.cols[h][idx]; }); Object.keys(tb.months || {}).forEach(function (h) { o[h] = tb.months[h][idx]; }); return o; }
  window.OsoolMockAdapter = {
    loadAll: function () { return ready.then(function (d) { return d.all; }); },
    loadTreasury: function () { return ready.then(function (d) { return d.treasury; }); },
    getSettings: function () { return ready.then(function (d) { return d.settings || null; }); },
    saveSettings: function (s) { if (D) D.settings = s; return Promise.resolve(); },
    readRenterRow: function (idx) { return ready.then(function (d) { return row(d.all.renter, idx); }); },
    readOwnerRow: ro, writeContract: ro, writeEntries: ro, writeTransfer: ro, updateRenter: ro, writeOwner: ro, addMonthColumns: ro, addRows: ro, tableInfo: ro,
    goToRow: function (i) { send({ goto: ['renter', i] }); return Promise.resolve(); },
    goTo: function (t, i) { send({ goto: [t, i] }); return Promise.resolve(); }
  };
  window.OsoolBig.close = function () { send({ close: 1 }); };
  function hook() {
    Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, onMsg, function () { send({ ready: 1 }); });
  }
  if (window.Office && Office.onReady) Office.onReady(hook);
})();
