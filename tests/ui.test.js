/* Kiểm thử giao diện bằng jsdom: đăng nhập C0–C4, điều hướng tab, mở modal */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const DB_KEY = 'cd6_db_v3';
const files = ['web/vendor/qrcode.js', 'web/mock-api.js', 'web/js/core.js', 'web/js/views.js', 'web/js/views2.js', 'web/js/system.js', 'web/js/actions.js'];
const css = fs.readFileSync(path.join(ROOT, 'web/styles.css'), 'utf8');

function buildHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  html = html.replace(/<link[^>]*>/g, '');
  html = html.replace(/<script[^>]*jsQR[^>]*><\/script>/, '');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  const js = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  html = html.replace('</body>', () => '<style>' + css + '</style><script>\n' + js + '\n</script></body>');
  return html;
}

let pass = 0, fail = 0;
function ok(c, t) { if (c) { pass++; console.log('  ✓ ' + t); } else { fail++; console.log('  ✗ ' + t); } }

function createDom(dbSeed) {
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => {
    const msg = e.message || String(e);
    if (!/Not implemented|Could not parse CSS|css/i.test(msg)) errors.push(msg);
  });
  vc.on('error', e => errors.push(String(e)));
  const dom = new JSDOM(buildHtml(), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      if (dbSeed) window.localStorage.setItem(DB_KEY, dbSeed);
      window.HTMLElement.prototype.scrollIntoView = function () { };
    }
  });
  dom.errors = errors;
  return dom;
}

function waitFor(fn, ms = 6000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let v;
      try { v = fn(); } catch (e) { }
      if (v) return resolve(v);
      if (Date.now() - t0 > ms) return reject(new Error('Timeout'));
      setTimeout(tick, 40);
    };
    tick();
  });
}

async function login(dom, ma, pin) {
  const doc = dom.window.document;
  await waitFor(() => doc.querySelector('form[data-form="login"]'));
  const f = doc.querySelector('form[data-form="login"]');
  f.querySelector('[name="maDD"]').value = ma;
  f.querySelector('[name="pin"]').value = pin || '123456';
  f.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc.querySelector('.topbar'));
}

async function loginAdmin(dom, ma, pass) {
  const doc = dom.window.document;
  await waitFor(() => doc.querySelector('form[data-form="login"]'));
  const f = doc.querySelector('form[data-form="login"]');
  f.querySelector('[name="maDD"]').value = ma;
  f.querySelector('[name="pin"]').value = pass;
  f.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}

async function goto(dom, view) {
  const doc = dom.window.document;
  const btn = doc.querySelector('.nav-item[data-view="' + view + '"]');
  if (!btn) return false;
  btn.click();
  await waitFor(() => {
    const s = doc.querySelector('#screen');
    return s && !doc.querySelector('#screen .sk-card') && s.innerHTML.length > 200 && s.querySelector('.card');
  });
  return true;
}

function screenText(dom) { return dom.window.document.querySelector('#screen').textContent; }

(async () => {
  const html = buildHtml();
  console.log('\n[0] Trang đăng nhập');
  const dom = createDom();
  const doc = dom.window.document;
  await waitFor(() => doc.querySelector('form[data-form="login"]'));
  ok(!!doc.querySelector('.login-card'), 'Form đăng nhập hiển thị');
  ok(doc.querySelectorAll('.demo-chip').length === 5, '5 tài khoản trải nghiệm C0–C4');
  ok(doc.body.textContent.includes('CHẾ ĐỘ XEM TRƯỚC'), 'Có nhãn chế độ xem trước');

  console.log('\n[1] Cấp 1 (Chủ tịch Hội LHTN Xã)');
  await login(dom, 'CT_HOILHTN');
  ok(!!doc.querySelector('.topbar'), 'Vào được khung ứng dụng');
  ok(doc.querySelector('.topbar').textContent.includes('Cấp 1 · Ủy Ban Hội LHTN Việt Nam Xã Tân Hòa · Chủ Tịch'), 'Topbar Cấp 1 hiển thị Hội LHTN Xã');
  ok(doc.querySelectorAll('.nav-item').length === 8, 'Cấp 1 có 8 tab');
  await waitFor(() => doc.querySelectorAll('.kpi').length >= 4);
  ok(doc.querySelectorAll('.kpi').length >= 4, 'Dashboard có thẻ KPI');
  ok(screenText(dom).includes('Thông báo mới') && screenText(dom).includes('Lịch sinh hoạt'), 'Tổng quan hiển thị thông báo mới');
  const viewsXa = ['attendance', 'uommam', 'fee', 'card', 'sos', 'learn', 'admin', 'home'];
  for (const v of viewsXa) {
    const okNav = await goto(dom, v);
    const txt = screenText(dom);
    ok(okNav && !txt.includes('Không tải được dữ liệu'), 'Tab ' + v + ' render OK');
  }

  console.log('\n[2] Cấp 1: duyệt PIN & hồ sơ Ươm mầm');
  await dom.window.MOCK_API.call('auth.requestPinReset', { maDD: 'DV02', lyDo: 'Test UI' });
  await goto(dom, 'admin');
  const btnReset = doc.querySelector('[data-act="approve-reset"]');
  ok(!!btnReset, 'Hiện nút cấp PIN cho Cấp 1');
  btnReset.click();
  await waitFor(() => doc.querySelector('.modal-card'));
  ok(doc.querySelector('.modal-card').textContent.includes('Đã cấp mã PIN mới'), 'Modal hiển thị PIN mới');
  doc.querySelector('.modal-close').click();
  ok(screenText(dom).includes('Hồ sơ Ươm mầm Đỏ chờ phê duyệt'), 'Cấp 1 có khối phê duyệt Ươm mầm');

  await goto(dom, 'uommam');
  ok(doc.querySelectorAll('#screen .badge').length > 3, 'Hiển thị tiêu chí Ươm mầm Đỏ');

  console.log('\n[3] Cấp 2 (Bí thư Chi bộ Xã)');
  const domXa = createDom();
  await login(domXa, 'BT_CHIBO_XA');
  const docXa = domXa.window.document;
  ok(docXa.querySelector('.topbar').textContent.includes('Cấp 2 · Bí thư Chi bộ Xã · Chi bộ Xã Tân Hòa'), 'Topbar Cấp 2 hiển thị Chi bộ Xã');
  ok(docXa.querySelectorAll('.nav-item').length === 8, 'Cấp 2 có 8 tab');
  await waitFor(() => docXa.querySelectorAll('.kpi').length >= 4);
  await domXa.window.MOCK_API.call('auth.requestPinReset', { maDD: 'DV05', lyDo: 'Test UI C2' });
  await goto(domXa, 'admin');
  ok(!!docXa.querySelector('[data-act="approve-reset"]'), 'Cấp 2 cũng có quyền cấp PIN');
  await goto(domXa, 'card');
  ok(!!docXa.querySelector('[data-act="issue-card"]'), 'Cấp 2 có quyền tích hợp thẻ toàn Xã');
  await goto(domXa, 'attendance');
  ok(!!docXa.querySelector('#ap-select'), 'Cấp 2 có bộ chọn Chi đoàn Ấp khi mở phiên');

  console.log('\n[4] Cấp 3 (Bí thư Chi đoàn Ấp): mở phiên QR động');
  const dom2 = createDom();
  await login(dom2, 'BT_AP01');
  const doc2 = dom2.window.document;
  ok(doc2.querySelectorAll('.nav-item').length === 8, 'Cấp 3 có 8 tab');
  ok(doc2.querySelector('.topbar').textContent.includes('Cấp 3 · Bí thư Chi đoàn Ấp · Chi đoàn Ấp Tân Bình'), 'Topbar Cấp 3 hiển thị Chi đoàn Ấp');
  await goto(dom2, 'attendance');
  const btnNew = doc2.querySelector('[data-act="new-session"]');
  ok(!!btnNew, 'Có nút mở phiên điểm danh');
  btnNew.click();
  await waitFor(() => doc2.querySelector('form[data-form="create-session"]'));
  const fs2 = doc2.querySelector('form[data-form="create-session"]');
  ok(!fs2.querySelector('[name="maAp"]'), 'Cấp 3 mở phiên cố định cho Ấp mình');
  fs2.querySelector('[name="tieuDe"]').value = 'Sinh hoạt kiểm thử UI';
  fs2.dispatchEvent(new dom2.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc2.querySelector('#qr-img'), 8000);
  ok(!!doc2.querySelector('#qr-img'), 'Mã QR hiển thị');
  const qrSrc2 = doc2.querySelector('#qr-img').getAttribute('src') || '';
  ok(/^data:image\/gif;base64,/.test(qrSrc2), 'QR tạo cục bộ dạng data URL (không gọi mạng)');
  ok(!/qrserver|https?:/i.test(qrSrc2), 'QR không phụ thuộc dịch vụ bên ngoài');
  ok(qrSrc2.length > 500, 'Ảnh QR có nội dung thực');
  const qrUtf8 = dom2.window.qrImg('Xin chào Đoàn viên Tân Hòa', 120);
  ok(/^data:image\/gif;base64,/.test(qrUtf8), 'QR hỗ trợ nội dung tiếng Việt UTF-8');
  ok(/^[A-F0-9]{10}$/.test(doc2.querySelector('#qr-token').textContent.trim()), 'Token QR 10 ký tự');
  ok(!!doc2.querySelector('#qr-count'), 'Có đồng hồ đếm ngược');
  const dbAfter = dom2.window.localStorage.getItem(DB_KEY);
  ok(!!dbAfter, 'Dữ liệu mở phiên được lưu vào khóa ' + DB_KEY);

  console.log('\n[5] Cấp 4 (Đoàn viên Ấp): quét QR bằng token nhập tay');
  const dom3 = createDom(dbAfter);
  await login(dom3, 'DV01');
  const doc3 = dom3.window.document;
  ok(doc3.querySelectorAll('.nav-item').length === 7, 'Cấp 4 có 7 tab (không có Quản trị)');
  ok(doc3.querySelector('.topbar').textContent.includes('Cấp 4 · Đoàn viên Ấp · Chi đoàn Ấp Tân Bình'), 'Topbar Cấp 4 hiển thị Chi đoàn Ấp');
  await goto(dom3, 'attendance');
  const live = dom3.window.localStorage.getItem(DB_KEY);
  const openSes = JSON.parse(live).sessions.filter(s => s.TrangThai === 'Đang mở')[0];
  const sessionData = await dom3.window.MOCK_API.call('attendance.session', { maPhien: openSes.MaPhien });
  const scanForm = doc3.querySelector('form[data-form="scan"]');
  ok(!!scanForm, 'Có form nhập token thủ công');
  scanForm.querySelector('[name="token"]').value = sessionData.token;
  scanForm.dispatchEvent(new dom3.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc3.querySelector('.modal-card'), 8000);
  const t = doc3.querySelector('.modal-card').textContent;
  ok(t.includes('Điểm danh thành công') && t.includes('+10'), 'Quét QR thành công +10 điểm');

  console.log('\n[6] Cấp 4: đóng đoàn phí qua VietQR');
  doc3.querySelector('.modal-close').click();
  await goto(dom3, 'fee');
  const payBtn = doc3.querySelector('[data-act="pay-fee"]');
  ok(!!payBtn, 'Có nút tạo VietQR');
  payBtn.click();
  await waitFor(() => doc3.querySelector('.modal-card img'));
  ok(doc3.querySelector('.modal-card').textContent.includes('DOANPHI AP01 DV01'), 'Nội dung chuyển khoản đúng cú pháp');
  doc3.querySelector('.modal-close').click();

  console.log('\n[7] Cấp 4: thẻ, 360°, quiz, SOS, AI');
  await goto(dom3, 'card');
  ok(!!doc3.querySelector('.e-card'), 'Thẻ E-Card render');
  const cardTxt = doc3.querySelector('.e-card').textContent;
  const cardFields = ['Họ và tên', 'Ngày sinh', 'Chức vụ', 'Ngày vào Đoàn', 'Nơi vào Đoàn',
    'Nơi cấp thẻ', 'Ngày sinh hoạt đoàn', 'Số thẻ Đoàn viên'];
  ok(cardFields.every(k => cardTxt.includes(k)), 'Thẻ hiển thị đủ 8 trường dữ liệu');
  ok(cardTxt.includes('TDV-2026-AP01-01') && cardTxt.includes('26/03/2021'), 'Thẻ có số thẻ và ngày vào Đoàn');
  doc3.querySelector('[data-act="eval360"]').click();
  await waitFor(() => doc3.querySelector('form[data-form="eval360"]'));
  const ef = doc3.querySelector('form[data-form="eval360"]');
  ef.querySelector('[name="tuChinhTri"]').value = '5';
  ef.querySelector('[name="daoDuc"]').value = '5';
  ef.querySelector('[name="chuyenMon"]').value = '5';
  ef.querySelector('[name="congHien"]').value = '5';
  ef.querySelector('[name="kyLuat"]').value = '5';
  ef.dispatchEvent(new dom3.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !doc3.querySelector('form[data-form="eval360"]'), 6000);
  ok(true, 'Gửi tự đánh giá 360°');

  await goto(dom3, 'learn');
  const q = doc3.querySelector('[data-act="quiz-answer"]');
  ok(!!q, 'Quiz có đáp án để chọn');
  q.click();
  await waitFor(() => doc3.querySelector('.quiz-option.correct'), 6000);
  ok(!!doc3.querySelector('.quiz-option.correct'), 'Tô đáp án đúng sau khi trả lời');

  doc3.querySelector('[data-act="learn-tab"][data-tab="ai"]').click();
  await waitFor(() => doc3.querySelector('form[data-form="chat"]'));
  const cf = doc3.querySelector('form[data-form="chat"]');
  cf.querySelector('[name="text"]').value = 'DIEM DV01';
  cf.dispatchEvent(new dom3.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc3.querySelectorAll('.msg').length > 2, 6000);
  ok(doc3.querySelector('.chat').textContent.includes('Điểm rèn luyện'), 'Trợ lý AI trả lời tra cứu điểm');

  await goto(dom3, 'sos');
  ok(!!doc3.querySelector('.map-canvas'), 'Bản đồ SOS render');
  ok(!!doc3.querySelector('form[data-form="sos"]'), 'Cấp 4 có form gửi phản ánh');

  console.log('\n[8] Quản trị hệ thống Cấp 0');
  const dom4 = createDom();
  const doc4 = dom4.window.document;
  await waitFor(() => doc4.querySelector('form[data-form="login"]'));
  const adChip = doc4.querySelector('.demo-chip[data-ma="ADMIN"]');
  ok(!!adChip && adChip.dataset.pass === 'ThanhnienvietnamXTH', 'Chip ADMIN điền sẵn mật khẩu quản trị');
  await loginAdmin(dom4, 'ADMIN', 'ThanhnienvietnamXTH');
  await waitFor(() => doc4.querySelector('form[data-form="change-password"]'));
  ok(!!doc4.querySelector('form[data-form="change-password"]'), 'Buộc đổi mật khẩu ở lần đăng nhập đầu');
  ok(doc4.querySelector('.alert-row.warn').textContent.includes('lần đăng nhập đầu tiên'), 'Cảnh báo đổi mật khẩu mặc định');

  const pwForm = doc4.querySelector('form[data-form="change-password"]');
  pwForm.querySelector('[name="oldPassword"]').value = 'ThanhnienvietnamXTH';
  pwForm.querySelector('[name="newPassword"]').value = 'MatKhauMoi2026';
  pwForm.querySelector('[name="confirmPassword"]').value = 'MatKhauMoi2026';
  pwForm.dispatchEvent(new dom4.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => doc4.querySelector('.system-console'), 8000);
  ok(!!doc4.querySelector('.system-console'), 'Vào Trung tâm điều hành sau khi đổi mật khẩu');
  ok(doc4.querySelector('.topbar').textContent.includes('Toàn hệ thống'), 'Topbar Cấp 0 hiển thị Toàn hệ thống');
  ok(doc4.querySelectorAll('.nav-item').length === 9, 'Cấp 0 có 9 tab: 8 nghiệp vụ + Hệ thống');
  ok(doc4.querySelector('.nav-item[data-view="system"]').textContent.includes('Hệ thống'), 'Tab Hệ thống hiện diện cho Cấp 0');
  ok(doc4.querySelectorAll('.sys-tab').length === 8, 'Trung tâm điều hành có 8 phân khu');
  ok(screenText(dom4).includes('Trung tâm điều hành'), 'Tiêu đề trung tâm điều hành');
  ok(doc4.querySelectorAll('.kpi').length >= 4, 'KPI quản trị hiển thị');
  ok(screenText(dom4).includes('Thông tin đơn vị cấp Xã') && screenText(dom4).includes('Chi đoàn Ấp'), 'Tab Đơn vị có thông tin Xã và danh sách Ấp');
  const tenChuTich = doc4.querySelector('[name="BI_THU_XA"]');
  ok(!!tenChuTich && tenChuTich.value === 'Lê Văn Bình', 'Tab Đơn vị có tên Chủ tịch Ủy ban Hội LHTN Việt Nam Xã');
  ok(screenText(dom4).includes('cán bộ Cấp 1–3'), 'KPI ghi nhận cán bộ Cấp 1–3');

  doc4.querySelector('.sys-tab[data-tab="baoCao"]').click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="report-filter"]'), 8000);
  ok(!!doc4.querySelector('form[data-sys-form="report-filter"]') && screenText(dom4).includes('Báo cáo tháng · quý · năm'),
    'Tab Báo cáo có bộ lọc thời gian và loại xuất');
  ok(doc4.querySelectorAll('table.tb tbody tr').length > 0 && screenText(dom4).includes('Tổng hợp theo Chi đoàn Ấp'),
    'Báo cáo hiển thị bảng tổng hợp theo Ấp');
  ok(!!doc4.querySelector('[data-sys-act="report-export"]') && !!doc4.querySelector('[data-sys-act="report-print"]'),
    'Báo cáo có nút tải CSV và in PDF');

  doc4.querySelector('.sys-tab[data-tab="nhacViec"]').click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="notify-send"]'), 8000);
  ok(!!doc4.querySelector('[name="loai"]') && !!doc4.querySelector('[name="kenh"]'),
    'Tab Nhắc việc có đối tượng và kênh gửi');
  const previewBtn = doc4.querySelector('[data-sys-act="notify-preview"]');
  ok(!!previewBtn, 'Có nút xem trước người nhận');
  previewBtn.click();
  await waitFor(() => doc4.querySelector('.modal-card') && doc4.querySelector('.modal-card').textContent.includes('Xem trước người nhận'), 8000);
  ok(doc4.querySelector('.modal-card').textContent.includes('người sẽ nhận thông báo') ||
    doc4.querySelector('.modal-card').textContent.includes('người nhận'), 'Xem trước hiển thị số người nhận');
  doc4.querySelector('.modal-close').click();

  doc4.querySelector('.sys-tab[data-tab="sucKhoe"]').click();
  await waitFor(() => screenText(dom4).includes('Sức khỏe hệ thống'), 8000);
  ok(screenText(dom4).includes('Hệ thống khỏe') && doc4.querySelectorAll('.sys-log').length >= 5,
    'Tab Sức khỏe hiển thị đủ danh mục kiểm tra');
  ok(screenText(dom4).includes('Phiên bản lược đồ'), 'Sức khỏe kiểm tra phiên bản lược đồ');

  doc4.querySelector('.sys-tab[data-tab="cauHinh"]').click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="config"]'));
  ok(screenText(dom4).includes('Điểm thưởng') && !!doc4.querySelector('[data-cfg="DIEM_SOS"]'), 'Tab Cấu hình hiển thị tham số điểm');

  doc4.querySelector('.sys-tab[data-tab="taiKhoan"]').click();
  await waitFor(() => doc4.querySelector('.sys-account'));
  ok(screenText(dom4).includes('ADMIN') && doc4.querySelectorAll('.sys-account').length > 5, 'Tab Tài khoản liệt kê tài khoản');
  ok(screenText(dom4).includes('Chủ Tịch') && screenText(dom4).includes('Cấp 1–3 cán bộ · Cấp 4 đoàn viên'), 'Danh sách tài khoản hiển thị mô hình C1–C4');

  const editCtBtn = doc4.querySelector('[data-sys-act="account-edit"][data-ma="CT_HOILHTN"]');
  ok(!!editCtBtn, 'Danh sách tài khoản có nút Sửa hồ sơ Chủ tịch');
  editCtBtn.click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="account-edit"]'));
  const ctForm = doc4.querySelector('form[data-sys-form="account-edit"]');
  ok(ctForm.querySelector('[name="hoTen"]').value === 'Lê Văn Bình', 'Modal sửa hiển thị đúng họ tên Chủ tịch');
  ctForm.querySelector('[name="hoTen"]').value = 'Lê Văn Bình (UI)';
  ctForm.querySelector('[name="dienThoai"]').value = '0901234567';
  ctForm.dispatchEvent(new dom4.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !doc4.querySelector('form[data-sys-form="account-edit"]'), 8000);
  await waitFor(() => screenText(dom4).includes('Lê Văn Bình (UI)'), 8000);
  ok(screenText(dom4).includes('Lê Văn Bình (UI)'), 'Admin cập nhật thông tin Chủ tịch từ tab Tài khoản');

  const editXaBtn = doc4.querySelector('[data-sys-act="account-edit"][data-ma="BT_CHIBO_XA"]');
  ok(!!editXaBtn, 'Danh sách tài khoản có nút Sửa hồ sơ Bí thư Chi bộ Xã');
  editXaBtn.click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="account-edit"]'));
  const xaForm = doc4.querySelector('form[data-sys-form="account-edit"]');
  xaForm.querySelector('[name="hoTen"]').value = 'Nguyễn Văn Hòa (UI)';
  xaForm.dispatchEvent(new dom4.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !doc4.querySelector('form[data-sys-form="account-edit"]'), 8000);
  await waitFor(() => screenText(dom4).includes('Nguyễn Văn Hòa (UI)'), 8000);
  ok(screenText(dom4).includes('Nguyễn Văn Hòa (UI)'), 'Admin cập nhật thông tin Bí thư Chi bộ Xã từ tab Tài khoản');

  doc4.querySelector('.sys-tab[data-tab="donVi"]').click();
  await waitFor(() => doc4.querySelector('[name="BI_THU_XA"]'));
  ok(doc4.querySelector('[name="BI_THU_XA"]').value === 'Lê Văn Bình (UI)' &&
    doc4.querySelector('[name="PHO_BI_THU_XA"]').value === 'Nguyễn Văn Hòa (UI)', 'Tên Chủ tịch và Bí thư Chi bộ Xã đồng bộ sang Đơn vị');

  doc4.querySelector('.sys-tab[data-tab="nhatKy"]').click();
  await waitFor(() => doc4.querySelector('.sys-log'));
  ok(doc4.querySelectorAll('.sys-log').length > 0 && screenText(dom4).includes('Nhật ký hệ thống'), 'Tab Nhật ký hiển thị thao tác');

  doc4.querySelector('.sys-tab[data-tab="duLieu"]').click();
  await waitFor(() => doc4.querySelector('[data-sys-act="backup-now"]'));
  doc4.querySelector('[data-sys-act="backup-now"]').click();
  await waitFor(() => doc4.querySelector('[data-sys-act="backup-verify"]'), 8000);
  ok(!!doc4.querySelector('[data-sys-act="backup-verify"]'), 'Danh sách sao lưu có nút Kiểm tra');
  doc4.querySelector('[data-sys-act="backup-verify"]').click();
  await waitFor(() => doc4.querySelector('.modal-card'));
  ok(doc4.querySelector('.modal-card').textContent.includes('hợp lệ'), 'Kiểm tra bản sao lưu báo hợp lệ');
  doc4.querySelector('.modal-close').click();
  doc4.querySelector('[data-sys-act="backup-restore"]').click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="backup-restore"]'));
  ok(!!doc4.querySelector('form[data-sys-form="backup-restore"]'), 'Mở form tạo bản phục hồi');
  const brForm = doc4.querySelector('form[data-sys-form="backup-restore"]');
  brForm.querySelector('[name="xacNhan"]').value = 'PHUC HOI';
  brForm.dispatchEvent(new dom4.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => {
    const m = doc4.querySelector('.modal-card');
    return m && m.textContent.includes('Đã tạo bản phục hồi');
  }, 8000);
  const brModal = doc4.querySelector('.modal-card');
  ok(!!brModal && brModal.textContent.includes('Đã tạo bản phục hồi') &&
    brModal.textContent.includes('KHÔNG bị thay đổi'), 'Phục hồi tạo bản sao, không ghi đè dữ liệu');
  doc4.querySelector('.modal-close').click();

  doc4.querySelector('[data-sys-act="change-password"]').click();
  await waitFor(() => doc4.querySelector('.modal-card form[data-form="change-password"]'));
  ok(!!doc4.querySelector('.modal-card form[data-form="change-password"]'), 'Mở được modal đổi mật khẩu');
  doc4.querySelector('.modal-close').click();

  doc4.querySelector('.sys-tab[data-tab="taiKhoan"]').click();
  await waitFor(() => doc4.querySelector('[data-sys-act="account-new"]'));
  doc4.querySelector('[data-sys-act="account-new"]').click();
  await waitFor(() => doc4.querySelector('form[data-sys-form="account"]'));
  const accForm = doc4.querySelector('form[data-sys-form="account"]');
  const capOptions = Array.from(accForm.querySelector('[name="cap"]').options).map(o => o.value);
  ok(capOptions.join(',') === '1,2,3,4', 'Form tạo tài khoản có đủ cấp 1–4');
  doc4.querySelector('.modal-close').click();

  console.log('\n[8b] Cấp 0: toàn quyền nghiệp vụ & CRUD đoàn viên');
  const viewsAdmin = ['home', 'attendance', 'uommam', 'fee', 'card', 'sos', 'learn', 'admin'];
  for (const v of viewsAdmin) {
    const okNav = await goto(dom4, v);
    const txt = screenText(dom4);
    ok(okNav && !txt.includes('Không tải được dữ liệu'), 'Cấp 0 mở tab ' + v + ' OK');
  }

  await goto(dom4, 'fee');
  doc4.querySelector('[data-act="expense"]').click();
  await waitFor(() => doc4.querySelector('form[data-form="expense"]'));
  ok(!!doc4.querySelector('form[data-form="expense"] [name="maAp"]'), 'Cấp 0 ghi chi quỹ có chọn Ấp');
  doc4.querySelector('.modal-close').click();

  await goto(dom4, 'admin');
  ok(!!doc4.querySelector('form[data-form="delegate"]'), 'Cấp 0 có khối ủy quyền 24h');
  const editBtn = doc4.querySelector('[data-act="edit-member"]');
  ok(!!editBtn, 'Danh sách đoàn viên có nút Sửa');
  editBtn.click();
  await waitFor(() => doc4.querySelector('form[data-form="member-update"]'));
  const mf = doc4.querySelector('form[data-form="member-update"]');
  ok(!!mf.querySelector('[name="maAp"]'), 'Modal sửa đoàn viên có chọn Ấp');
  mf.querySelector('[name="hoTen"]').value = 'Võ Minh Khoa (Admin)';
  mf.dispatchEvent(new dom4.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !doc4.querySelector('form[data-form="member-update"]'), 8000);
  await waitFor(() => screenText(dom4).includes('Võ Minh Khoa (Admin)'), 8000);
  ok(screenText(dom4).includes('Võ Minh Khoa (Admin)'), 'Cấp 0 sửa thông tin đoàn viên');

  const delBtn = doc4.querySelector('[data-act="delete-member"][data-ma="DV02"]');
  ok(!!delBtn, 'Danh sách đoàn viên có nút Xóa');
  delBtn.click();
  await waitFor(() => doc4.querySelector('.modal-card'));
  ok(doc4.querySelector('.modal-card').textContent.includes('Xóa đoàn viên?'), 'Mở hộp thoại xác nhận xóa');
  doc4.querySelector('[data-act="delete-member-ok"]').click();
  await waitFor(() => !doc4.querySelector('.modal-card'), 8000);
  await waitFor(() => !screenText(dom4).includes('Nguyễn Thị Thu Hà'), 8000);
  const stored = JSON.parse(dom4.window.localStorage.getItem(DB_KEY));
  ok(stored.users.some(u => u.MaDD === 'DV02' && u.DaXoa === true), 'Cấp 0 xóa mềm đoàn viên, giữ lịch sử');

  const relogin = await dom4.window.MOCK_API.call('auth.login', { maDD: 'ADMIN', pin: 'MatKhauMoi2026' });
  ok(relogin.profile.cap === 0 && relogin.profile.batDoiMatKhau === false, 'Đăng nhập lại bằng mật khẩu mới, hết buộc đổi');

  console.log('\n[8c] Đồng bộ cấu hình realtime');
  const domSync = createDom();
  await login(domSync, 'DV01');
  const ctx = domSync.window;
  const adS = await ctx.MOCK_API.call('auth.login', { maDD: 'ADMIN', pin: 'ThanhnienvietnamXTH' });
  const vBefore = (await ctx.MOCK_API.call('meta.config', {})).phienBan;
  await ctx.MOCK_API.call('admin.config.save', {
    items: [{ khoa: 'TEN_XA', giaTri: 'Xã Tân Hòa Sync' }]
  }, adS.token);
  ok((await ctx.MOCK_API.call('meta.config', {})).phienBan > vBefore, 'Lưu cấu hình tăng phiên bản');
  ok(await ctx.syncConfigNow({ force: true }) === true, 'Phiên Cấp 4 phát hiện cấu hình mới');
  await waitFor(() => ctx.document.querySelector('.topbar').textContent.includes('Xã Tân Hòa Sync'));
  ok(ctx.document.querySelector('.topbar').textContent.includes('Xã Tân Hòa Sync'), 'Topbar cập nhật realtime');

  await ctx.MOCK_API.call('admin.account.update', {
    maDD: 'DV01', hoTen: 'Võ Minh Khoa Sync'
  }, adS.token);
  ok(await ctx.syncConfigNow({ force: true }) === true, 'Phiên Cấp 4 phát hiện hồ sơ mới');
  await waitFor(() => ctx.document.querySelector('.topbar').textContent.includes('Võ Minh Khoa Sync'));
  ok(ctx.document.querySelector('.topbar').textContent.includes('Võ Minh Khoa Sync'), 'Tên đoàn viên cập nhật realtime');

  console.log('\n[8d] Phân trang danh sách đoàn viên');
  const seedPg = JSON.parse(dom4.window.localStorage.getItem(DB_KEY));
  const baseMem = seedPg.users.filter(u => Number(u.Cap) === 4)[0];
  for (let i = 1; i <= 60; i++) {
    const clone = Object.assign({}, baseMem, {
      MaDD: 'PG' + String(i).padStart(3, '0'),
      HoTen: 'Đoàn viên phân trang ' + i,
      DienThoai: '0999' + String(100000 + i),
      MaAp: 'AP01',
      Diem: 10 + i
    });
    seedPg.users.push(clone);
  }
  const domPg = createDom(JSON.stringify(seedPg));
  const docPg = domPg.window.document;
  await loginAdmin(domPg, 'ADMIN', 'MatKhauMoi2026');
  await waitFor(() => docPg.querySelector('.nav-item[data-view="admin"]'), 8000);
  await goto(domPg, 'admin');
  await waitFor(() => docPg.querySelector('[data-act="member-more"]'), 10000);
  const firstPage = docPg.querySelectorAll('[data-act="edit-member"]').length;
  ok(firstPage === 50, 'Trang đầu giới hạn 50 đoàn viên (thực tế ' + firstPage + ')');
  ok(!!docPg.querySelector('[data-act="member-more"]'), 'Có nút Xem thêm khi còn dữ liệu');
  docPg.querySelector('[data-act="member-more"]').click();
  await waitFor(() => docPg.querySelectorAll('[data-act="edit-member"]').length > 50, 10000);
  const secondPage = docPg.querySelectorAll('[data-act="edit-member"]').length;
  ok(secondPage > 50, 'Xem thêm tải thêm đoàn viên (' + secondPage + ' hiển thị)');

  console.log('\n[8e] Cảnh báo ngoại tuyến (PWA-lite)');
  const w4 = dom4.window;
  Object.defineProperty(w4.navigator, 'onLine', { value: false, configurable: true });
  w4.dispatchEvent(new w4.Event('offline'));
  ok(!!w4.document.querySelector('#offline-bar.show') &&
    w4.document.querySelector('#offline-bar').textContent.includes('Ngoại tuyến'),
    'Hiện thanh cảnh báo khi mất mạng');
  Object.defineProperty(w4.navigator, 'onLine', { value: true, configurable: true });
  w4.dispatchEvent(new w4.Event('online'));
  ok(!w4.document.querySelector('#offline-bar.show'), 'Ẩn cảnh báo khi có mạng trở lại');

  console.log('\n[9] Kiểm tra lỗi JS');
  ok(dom.errors.length === 0, 'Không có lỗi JS ở Cấp 1' + (dom.errors.length ? ': ' + dom.errors[0] : ''));
  ok(domXa.errors.length === 0, 'Không có lỗi JS ở Cấp 2' + (domXa.errors.length ? ': ' + domXa.errors[0] : ''));
  ok(dom2.errors.length === 0, 'Không có lỗi JS ở Cấp 3' + (dom2.errors.length ? ': ' + dom2.errors[0] : ''));
  ok(dom3.errors.length === 0, 'Không có lỗi JS ở Cấp 4' + (dom3.errors.length ? ': ' + dom3.errors[0] : ''));
  ok(dom4.errors.length === 0, 'Không có lỗi JS ở Cấp 0' + (dom4.errors.length ? ': ' + dom4.errors[0] : ''));
  ok(domPg.errors.length === 0, 'Không có lỗi JS ở phiên phân trang' + (domPg.errors.length ? ': ' + domPg.errors[0] : ''));

  console.log('\n──────── UI: ' + pass + ' đạt / ' + fail + ' lỗi ────────\n');
  dom.window.close(); domXa.window.close(); dom2.window.close(); dom3.window.close(); dom4.window.close(); domSync.window.close(); domPg.window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
