/**
 * build.js — Đóng gói giao diện web/ thành một file Index.html duy nhất
 * để dán vào Google Apps Script.
 *
 *   node build.js
 *
 * Kết quả: apps-script/Index.html
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const webDir = path.join(root, 'web');
const outFile = path.join(root, 'apps-script', 'Index.html');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

let html = read(path.join(webDir, 'index.html'));
const css = read(path.join(webDir, 'styles.css'));

// 1. Nhúng CSS
html = html.replace(
  '<link rel="stylesheet" href="styles.css">',
  () => '<style>\n' + css + '\n</style>'
);

// 1b. Nhúng CSS Leaflet tự lưu trữ
const leafletCssFile = path.join(webDir, 'vendor', 'leaflet.css');
if (!fs.existsSync(leafletCssFile)) {
  console.error('✖ Thiếu web/vendor/leaflet.css — không thể đóng gói.');
  process.exit(1);
}
const leafletCss = read(leafletCssFile);
html = html.replace(
  '<link rel="stylesheet" href="vendor/leaflet.css">',
  () => '<style>\n' + leafletCss + '\n</style>'
);
if (html.indexOf('vendor/leaflet.css') >= 0) {
  console.error('✖ Không thay được thẻ CSS Leaflet — kiểm tra web/index.html.');
  process.exit(1);
}

// 2. Nhúng thư viện quét QR (tự lưu trữ, không phụ thuộc CDN)
const vendorFile = path.join(webDir, 'vendor', 'jsqr.min.js');
if (!fs.existsSync(vendorFile)) {
  console.error('✖ Thiếu web/vendor/jsqr.min.js — không thể đóng gói.');
  process.exit(1);
}
const vendor = read(vendorFile);
html = html.replace(
  '<script src="vendor/jsqr.min.js"></script>',
  () => '<script>\n' + vendor + '\n</script>'
);
if (html.indexOf('vendor/jsqr.min.js') >= 0) {
  console.error('✖ Không thay được thẻ script jsQR — kiểm tra web/index.html.');
  process.exit(1);
}

// 2b. Nhúng thư viện tạo QR tự lưu trữ (MIT, qrcode-generator)
const qrVendorFile = path.join(webDir, 'vendor', 'qrcode.js');
if (!fs.existsSync(qrVendorFile)) {
  console.error('✖ Thiếu web/vendor/qrcode.js — không thể đóng gói.');
  process.exit(1);
}
const qrVendor = read(qrVendorFile);
html = html.replace(
  '<script src="vendor/qrcode.js"></script>',
  () => '<script>\n' + qrVendor + '\n</script>'
);
if (html.indexOf('vendor/qrcode.js') >= 0) {
  console.error('✖ Không thay được thẻ script qrcode-generator — kiểm tra web/index.html.');
  process.exit(1);
}

// 2c. Nhúng thư viện bản đồ Leaflet tự lưu trữ (BSD-2-Clause)
const leafletFile = path.join(webDir, 'vendor', 'leaflet.js');
if (!fs.existsSync(leafletFile)) {
  console.error('✖ Thiếu web/vendor/leaflet.js — không thể đóng gói.');
  process.exit(1);
}
const leaflet = read(leafletFile);
html = html.replace(
  '<script src="vendor/leaflet.js"></script>',
  () => '<script>\n' + leaflet + '\n</script>'
);
if (html.indexOf('vendor/leaflet.js') >= 0) {
  console.error('✖ Không thay được thẻ script Leaflet — kiểm tra web/index.html.');
  process.exit(1);
}

// 3. Bỏ mock-api (Apps Script dùng API thật)
html = html.replace(/[ \t]*<!--[^>]*-->\s*<script src="mock-api\.js"><\/script>/, '');
html = html.replace(/[ \t]*<script src="mock-api\.js"><\/script>\r?\n?/, '');

// 4. Gộp toàn bộ JS ứng dụng
const files = ['js/core.js', 'js/views.js', 'js/views2.js', 'js/system.js', 'js/actions.js'];
const bundle = files.map((f) => {
  const code = read(path.join(webDir, f));
  return '\n/* ================= ' + f + ' ================= */\n' + code;
}).join('\n');

html = html.replace(
  /<script src="js\/core\.js"><\/script>[\s\S]*?<script src="js\/actions\.js"><\/script>/,
  () => '<script>\n' + bundle + '\n</script>'
);

// 5. Dọn các dòng trống thừa do chèn
html = html.replace(/\n{3,}/g, '\n\n');

fs.writeFileSync(outFile, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('✔ Đã tạo ' + path.relative(root, outFile) + ' (' + kb + ' KB)');
console.log('  Nội dung: ' + files.join(', ') + ' (inline CSS + JS)');
