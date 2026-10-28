/* Đối chiếu hợp đồng API giữa Apps Script thật (Code.gs) và mock-api.js.
   Mục tiêu: phát hiện route/handler bị lệch trước khi triển khai. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const mock = fs.readFileSync(path.join(ROOT, 'web', 'mock-api.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, title) {
  if (cond) { pass++; console.log('  ✓ ' + title); }
  else { fail++; console.log('  ✗ ' + title); }
}
function uniq(list) { return Array.from(new Set(list)).sort(); }

/* --- Hành động trong Code.gs --- */
const publicActions = uniq(
  Array.from(code.matchAll(/action === '([^']+)'/g)).map(m => m[1])
);
const routeMatch = code.match(/var routes = \{[\s\S]*?\n    \};/);
if (!routeMatch) {
  console.log('  ✗ Không tìm thấy bảng routes trong Code.gs');
  process.exit(1);
}
const routesBlock = routeMatch[0];
const routeActions = uniq(
  Array.from(routesBlock.matchAll(/'([^']+)':\s*function/g)).map(m => m[1])
);
const codeActions = uniq(publicActions.concat(routeActions));

/* --- Handler trong mock-api.js --- */
const mockActions = uniq(
  Array.from(mock.matchAll(/H\[['"]([^'"]+)['"]\]\s*=/g)).map(m => m[1])
);

const missingInMock = codeActions.filter(a => mockActions.indexOf(a) < 0);
const missingInCode = mockActions.filter(a => codeActions.indexOf(a) < 0);

console.log('\n[1] Danh sách hành động API');
ok(codeActions.length > 50, 'Code.gs khai báo ' + codeActions.length + ' hành động');
ok(mockActions.length > 50, 'mock-api.js có ' + mockActions.length + ' handler');
ok(missingInMock.length === 0,
  'Mock có đủ hành động của Code.gs' + (missingInMock.length ? ' — thiếu: ' + missingInMock.join(', ') : ''));
ok(missingInCode.length === 0,
  'Code.gs có đủ handler của mock' + (missingInCode.length ? ' — thiếu: ' + missingInCode.join(', ') : ''));

console.log('\n[2] Hành động tăng phiên bản cấu hình');
function blockActions(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return [];
  const end = source.indexOf('};', start);
  return uniq(Array.from(source.slice(start, end).matchAll(/'([^']+)':\s*1/g)).map(m => m[1]));
}
const codeBump = blockActions(code, 'var CONFIG_BUMP = {');
const mockBump = blockActions(mock, 'var CONFIG_BUMP_ACTIONS = {');
ok(codeBump.length > 0, 'Code.gs khai báo ' + codeBump.length + ' hành động bump');
ok(mockBump.length > 0, 'mock-api.js khai báo ' + mockBump.length + ' hành động bump');
ok(codeBump.join(',') === mockBump.join(','),
  'Danh sách bump khớp nhau' +
  (codeBump.join(',') === mockBump.join(',') ? '' : ' — Code: [' + codeBump.join(', ') + '] / Mock: [' + mockBump.join(', ') + ']'));

console.log('\n[3] Hành động quản trị sao lưu');
['admin.backup.verify', 'admin.backup.restoreCopy'].forEach(function (a) {
  ok(codeActions.indexOf(a) >= 0 && mockActions.indexOf(a) >= 0, 'Có ' + a + ' ở cả hai phía');
});
ok(routeActions.indexOf('admin.backup.restoreCopy') >= 0, 'Phục hồi sao lưu nằm trong bảng route');

console.log('\n──────── KẾT QUẢ: ' + pass + ' đạt / ' + fail + ' lỗi ────────\n');
process.exit(fail ? 1 : 0);
