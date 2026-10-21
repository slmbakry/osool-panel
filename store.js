/* إعدادات الملف جوه الإكسيل نفسه (Custom XML Part)
   إعدادات Office العادية بتتربط بنسخة الإضافة، فلو اتشالت واترفعت تاني بتضيع (زي أسماء الموظفين).
   هنا بتتحفظ في الملف نفسه، فتفضل مهما اتغيرت الإضافة، وتقراها أي إضافة تانية (زي تجهيز الداتا). */
(function (root) {
  'use strict';
  var NS = 'urn:mbm:osool-panel:settings';
  function ok() {
    try { return !!(window.Excel && Office.context.requirements.isSetSupported('ExcelApi', '1.5')); } catch (e) { return false; }
  }
  function read() {
    if (!ok()) return Promise.resolve(null);
    return Excel.run(function (ctx) {
      var parts = ctx.workbook.customXmlParts.getByNamespace(NS); parts.load('items');
      return ctx.sync().then(function () {
        if (!parts.items.length) return null;
        var x = parts.items[parts.items.length - 1].getXml();
        return ctx.sync().then(function () {
          var m = /<v>([^<]*)<\/v>/.exec(x.value || '');
          return m ? JSON.parse(decodeURIComponent(m[1])) : null;
        });
      });
    }).catch(function () { return null; });
  }
  function write(obj) {
    if (!ok()) return Promise.resolve(false);
    var xml = '<s xmlns="' + NS + '"><v>' + encodeURIComponent(JSON.stringify(obj)) + '</v></s>';
    return Excel.run(function (ctx) {
      var parts = ctx.workbook.customXmlParts.getByNamespace(NS); parts.load('items');
      return ctx.sync().then(function () {
        parts.items.forEach(function (p) { p.delete(); });
        ctx.workbook.customXmlParts.add(xml);
        return ctx.sync();
      }).then(function () { return true; });
    }).catch(function () { return false; });
  }
  root.OsoolStore = { read: read, write: write, NS: NS };
})(this);
