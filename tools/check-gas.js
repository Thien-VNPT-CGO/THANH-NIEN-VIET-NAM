/**
 * check-gas.js — Kiểm tra cú pháp & cấu hình trước khi đóng gói / triển khai.
 *
 *   node tools/check-gas.js
 *
 * Nội dung kiểm tra:
 *   1. Cú pháp toàn bộ apps-script/*.gs (copy sang .js tạm rồi `node --check`).
 *   2. Cú pháp toàn bộ web/js/*.js, web/mock-api.js và build.js.
 *   3. appsscript.json là JSON hợp lệ và có manifest tối thiểu.
 *   4. web/index.html chỉ tham chiếu tệp cục bộ có thật.
 *   5. apps-script/Index.html đã được đóng gói (không còn <script src> cục bộ).
 *
 * Không cần cài thêm thư viện. Mã lỗi 1 nếu có bất kỳ kiểm tra nào thất bại.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const appsDir = path.join(root, 'apps-script');
const webDir = path.join(root, 'web');
const webJsDir = path.join(webDir, 'js');

let pass = 0;
let fail = 0;

function ok(msg) {
  pass++;
  console.log('  \u2713 ' + msg);
}

function bad(msg, detail) {
  fail++;
  console.log('  \u2717 ' + msg);
  if (detail) {
    String(detail).trim().split(/\r?\n/).forEach(function (line) {
      console.log('      ' + line);
    });
  }
}

function section(title) {
  console.log('\n' + title);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listFiles(dir, ext) {
  return fs.readdirSync(dir)
    .filter(function (f) { return f.toLowerCase().endsWith(ext); })
    .sort();
}

/** Chạy `node --check` trên một tệp, trả về lỗi (nếu có). */
function syntaxCheck(file) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.error) return res.error.message;
  if (res.status !== 0) return (res.stderr || res.stdout || 'Lỗi cú pháp không xác định').trim();
  return null;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd6-check-'));

try {
  /* ---------------------------------------------------------------- */
  section('[1] Cú pháp Google Apps Script');
  const gasFiles = listFiles(appsDir, '.gs');
  if (!gasFiles.length) {
    bad('Không tìm thấy tệp .gs nào trong apps-script/');
  } else {
    gasFiles.forEach(function (name) {
      const src = path.join(appsDir, name);
      const tmpFile = path.join(tmpDir, name.replace(/\.gs$/i, '.js'));
      fs.copyFileSync(src, tmpFile);
      const err = syntaxCheck(tmpFile);
      if (err) bad(name, err);
      else ok(name);
    });
  }

  /* ---------------------------------------------------------------- */
  section('[2] Cú pháp JavaScript phía web');
  const webFiles = listFiles(webJsDir, '.js').map(function (f) { return path.join(webJsDir, f); });
  if (fs.existsSync(path.join(webDir, 'mock-api.js'))) webFiles.push(path.join(webDir, 'mock-api.js'));
  const vendorDir = path.join(webDir, 'vendor');
  if (fs.existsSync(vendorDir)) {
    listFiles(vendorDir, '.js').forEach(function (f) { webFiles.push(path.join(vendorDir, f)); });
  }
  if (fs.existsSync(path.join(root, 'build.js'))) webFiles.push(path.join(root, 'build.js'));
  if (!webFiles.length) {
    bad('Không tìm thấy tệp JavaScript nào trong web/');
  } else {
    webFiles.forEach(function (file) {
      const err = syntaxCheck(file);
      const label = path.relative(root, file).replace(/\\/g, '/');
      if (err) bad(label, err);
      else ok(label);
    });
  }

  /* ---------------------------------------------------------------- */
  section('[3] Manifest appsscript.json');
  const manifestFile = path.join(appsDir, 'appsscript.json');
  if (!fs.existsSync(manifestFile)) {
    bad('Thiếu apps-script/appsscript.json');
  } else {
    try {
      const manifest = readJson(manifestFile);
      if (!manifest.timeZone) bad('Manifest thiếu timeZone');
      else ok('timeZone = ' + manifest.timeZone);

      const webapp = manifest.webapp || {};
      if (!webapp.executeAs) bad('Manifest thiếu webapp.executeAs');
      else ok('webapp.executeAs = ' + webapp.executeAs);

      if (!webapp.access) bad('Manifest thiếu webapp.access');
      else ok('webapp.access = ' + webapp.access);

      const scopes = (manifest.oauthScopes || []);
      if (!scopes.length) bad('Manifest thiếu oauthScopes');
      else {
        ok('oauthScopes: ' + scopes.length + ' phạm vi');
        const required = [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/script.scriptapp'
        ];
        const sheetScope = scopes.some(function (s) {
          return s === 'https://www.googleapis.com/auth/spreadsheets' ||
            s === 'https://www.googleapis.com/auth/spreadsheets.currentonly';
        });
        const missing = required.filter(function (s) { return scopes.indexOf(s) < 0; });
        if (!sheetScope) missing.push('https://www.googleapis.com/auth/spreadsheets (hoặc .currentonly)');
        if (missing.length) bad('Thiếu OAuth scope bắt buộc', missing.join('\n'));
        else ok('Đủ scope bảng tính, Drive và trigger');
      }
    } catch (e) {
      bad('appsscript.json không phải JSON hợp lệ', e.message);
    }
  }

  /* ---------------------------------------------------------------- */
  section('[4] Tham chiếu tệp trong web/index.html');
  const indexFile = path.join(webDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    bad('Thiếu web/index.html');
  } else {
    const html = fs.readFileSync(indexFile, 'utf8');
    const refs = [];
    const re = /(?:src|href)\s*=\s*["']([^"'#?:]+)["']/gi;
    let m;
    while ((m = re.exec(html))) {
      const ref = m[1];
      if (/^(?:https?:)?\/\//i.test(ref) || ref.startsWith('data:')) continue;
      if (/^(?:mailto|tel):/i.test(ref)) continue;
      refs.push(ref);
    }
    if (!refs.length) {
      ok('Không có tham chiếu tệp cục bộ');
    } else {
      const missing = refs.filter(function (ref) {
        return !fs.existsSync(path.join(webDir, ref));
      });
      if (missing.length) bad('Tham chiếu tệp không tồn tại', missing.join('\n'));
      else ok(refs.length + ' tham chiếu cục bộ đều tồn tại');
    }

    if (/mock-api\.js/.test(html)) ok('Bản xem trước có mock-api.js');
    else bad('web/index.html thiếu mock-api.js cho chế độ xem trước');

    if (/vendor\/qrcode\.js/.test(html)) ok('Bản xem trước nạp thư viện QR tự lưu trữ');
    else bad('web/index.html thiếu vendor/qrcode.js');

    if (/vendor\/leaflet\.js/.test(html) && /vendor\/leaflet\.css/.test(html)) {
      ok('Bản xem trước nạp thư viện bản đồ Leaflet tự lưu trữ');
    } else bad('web/index.html thiếu vendor/leaflet.js hoặc leaflet.css');
  }

  const qrLeak = [];
  listFiles(webJsDir, '.js').forEach(function (f) {
    const src = fs.readFileSync(path.join(webJsDir, f), 'utf8');
    if (/api\.qrserver\.com/i.test(src)) qrLeak.push(f);
  });
  if (qrLeak.length) bad('Còn gọi api.qrserver.com trong ' + qrLeak.join(', '));
  else ok('Mã nguồn web không gọi dịch vụ QR bên ngoài');

  /* ---------------------------------------------------------------- */
  section('[5] Bản đóng gói apps-script/Index.html');
  const bundleFile = path.join(appsDir, 'Index.html');
  if (!fs.existsSync(bundleFile)) {
    bad('Thiếu apps-script/Index.html — chạy `npm run build`');
  } else {
    const bundle = fs.readFileSync(bundleFile, 'utf8');
    const localScript = bundle.match(/<script[^>]+src=["']([^"']+)["']/i);
    if (localScript) bad('Bundle còn tham chiếu script ngoài: ' + localScript[1]);
    else ok('Không còn <script src> cục bộ');

    if (/mock-api\.js/.test(bundle)) bad('Bundle còn sót mock-api.js');
    else ok('Đã loại bỏ mock-api.js');

    const markers = ['core.js', 'views.js', 'views2.js', 'system.js', 'actions.js', 'tour.js'];
    const missing = markers.filter(function (f) { return bundle.indexOf(f) < 0; });
    if (missing.length) bad('Bundle thiếu mã nguồn', missing.join('\n'));
    else ok('Đủ 6 tệp JS ứng dụng');

    if (!/<style>/i.test(bundle)) bad('Bundle chưa nhúng CSS inline');
    else ok('CSS đã nhúng inline');

    // QR phải được tạo cục bộ: không gọi dịch vụ ngoài, thư viện đã nhúng.
    if (/api\.qrserver\.com|chart\.googleapis\.com\/chart/i.test(bundle)) {
      bad('Bundle còn gọi dịch vụ tạo QR bên ngoài');
    } else ok('QR tạo cục bộ, không gọi dịch vụ ngoài');
    if (/stringToBytesFuncs\['UTF-8'\]/.test(bundle)) ok('Đã nhúng thư viện QR tự lưu trữ (UTF-8)');
    else bad('Bundle thiếu thư viện qrcode-generator');
    if (/Leaflet 1\.9\.4/.test(bundle) && /leaflet-container/.test(bundle)) {
      ok('Đã nhúng Leaflet 1.9.4 và CSS bản đồ');
    } else bad('Bundle thiếu thư viện Leaflet hoặc CSS bản đồ');
  }
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* bỏ qua */ }
}

console.log('\n\u2500\u2500\u2500\u2500 KẾT QUẢ: ' + pass + ' đạt / ' + fail + ' lỗi \u2500\u2500\u2500\u2500\n');
if (fail) {
  console.log('Kiểm tra thất bại. Sửa lỗi phía trên rồi chạy lại `npm run check`.');
  process.exit(1);
}
