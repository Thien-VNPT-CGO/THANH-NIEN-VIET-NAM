/* ==================================================================
   actions.js — Xử lý tương tác, form, camera quét QR, modal nghiệp vụ
   ================================================================== */

/* ------------------------------------------------------------------ */
/* TIỆN ÍCH HỖ TRỢ                                                    */
/* ------------------------------------------------------------------ */

function refresh() {
  if (!S.token || !S.me) return;
  // Lấy cấu hình/hồ sơ mới nhất trước khi vẽ lại, để thay đổi của quản trị
  // (tên đơn vị, mức điểm, tên tài khoản...) hiện ngay cả với chính Admin.
  syncConfigNow({ render: false }).then(function () {
    if (S.token && S.me) go(S.view);
  });
}

function getPos() {
  return new Promise(function (resolve) {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      function (p) { resolve({ viDo: p.coords.latitude, kinhDo: p.coords.longitude }); },
      function () { resolve({}); },
      { timeout: 7000, maximumAge: 30000 }
    );
  });
}

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function () { toast('Đã sao chép vào bộ nhớ tạm.', 'ok'); })
      .catch(function () { toast('Không sao chép được, hãy chọn văn bản thủ công.', 'err'); });
  } else {
    toast('Trình duyệt không hỗ trợ sao chép tự động.', 'err');
  }
}

function printBlock(html, title) {
  var w = window.open('', '_blank', 'width=780,height=1000');
  if (!w) { toast('Trình duyệt chặn cửa sổ in. Hãy cho phép popup rồi thử lại.', 'err'); return; }
  w.document.write('<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>' + esc(title || 'In ấn') + '</title>' +
    '<style>body{font-family:"Segoe UI",system-ui,sans-serif;padding:28px;color:#101828;background:#fff}' +
    '.cert{border:3px double #B31217;border-radius:16px;padding:34px 30px;max-width:640px;margin:0 auto}' +
    'h1{font-size:20px;text-align:center;margin:0 0 4px}h2{font-size:15px;text-align:center;margin:18px 0;letter-spacing:.02em}' +
    '.muted{color:#667085;font-size:12px;text-align:center}p{font-size:13.5px;line-height:1.7}' +
    '.sig{display:flex;justify-content:space-between;margin-top:36px;font-size:12.5px;text-align:center}' +
    '.qr{text-align:center;margin-top:18px}img{width:110px;height:110px}' +
    '.ecard{max-width:420px;margin:0 auto;border-radius:20px;padding:20px;color:#fff;background:linear-gradient(135deg,#7C0A0D,#B31217 45%,#E4322B)}' +
    '@media print{body{padding:0}}</style></head><body>' + html + '</body></html>');
  w.document.close();
  w.focus();
  setTimeout(function () { w.print(); }, 500);
}

/* ------------------------------------------------------------------ */
/* ĐIỂM DANH — QR ĐỘNG & CAMERA                                        */
/* ------------------------------------------------------------------ */

function stopQr() {
  if (S.qrTimer) { clearInterval(S.qrTimer); S.qrTimer = null; }
  S.live = null;
}

function startQr(maPhien) {
  stopQr();
  var live = { maPhien: maPhien, conLai: 0 };
  S.live = live;

  var refreshToken = function () {
    API.call('attendance.session', { maPhien: maPhien }).then(function (s) {
      if (!S.live || S.live.maPhien !== maPhien) return;
      S.live = Object.assign(S.live, s);
      paintQr();
    }).catch(function (e) {
      stopQr();
      toast(e.message || 'Phiên điểm danh đã kết thúc.', 'err');
    });
  };

  S.live.refreshToken = refreshToken;
  refreshToken();

  S.qrTimer = setInterval(function () {
    if (!S.live) return;
    S.live.conLai = (S.live.conLai || 0) - 1;
    if (S.live.conLai <= 0) refreshToken();
    else paintCountdown();
  }, 1000);
}

function paintQr() {
  var box = document.getElementById('qr-live');
  if (!box || !S.live) return;
  var l = S.live;
  var people = (l.ds || []).length
    ? l.ds.map(function (p) {
        return '<div class="list-item"><div class="li-avatar green">' + esc(initials(p.hoTen)) + '</div>' +
          '<div class="li-main"><b>' + esc(p.hoTen) + '</b><span>' + esc(p.maDD) + ' · ' + esc(p.hinhThuc) + '</span></div>' +
          '<div class="li-right"><span class="badge badge-green">+' + p.diem + 'đ</span></div></div>';
      }).join('')
    : '<div class="empty">' + icon('qr', 26) + '<div>Chưa có đoàn viên nào điểm danh</div></div>';

  box.innerHTML =
    '<div class="qr-panel">' +
      '<div class="row-between mb-8" style="align-items:flex-start">' +
        '<div style="text-align:left"><b>' + esc(l.tieuDe) + '</b>' +
        '<div class="small muted">' + esc(l.tenAp) + ' · ' + l.daDiemDanh + ' lượt điểm danh</div></div>' +
        badge('Đang mở', 'green') +
      '</div>' +
      '<div class="qr-frame"><img id="qr-img" src="' + qrImg(l.payload, 232) + '" alt="Mã QR điểm danh" ' +
        'onerror="this.style.display=\'none\'"></div>' +
      '<div class="qr-token" id="qr-token">' + esc(l.token) + '</div>' +
      '<div class="qr-count" id="qr-count">' + icon('clock', 13) + ' <span>Mã mới sau ' + l.conLai + 's</span></div>' +
      '<p class="small muted mt-8">Đoàn viên quét bằng camera trực tiếp · Ảnh chụp màn hình sẽ hết hiệu lực</p>' +
      (l.nguoiDuyet && l.nguoiDuyet.uyQuyen
        ? '<div class="note mt-8">Ủy quyền 24h: ' + esc(l.nguoiDuyet.hoTen) + ' đang duyệt thay</div>' : '') +
    '</div>' +
    '<div class="list mt-12">' + people + '</div>';
}

function paintCountdown() {
  var el = document.querySelector('#qr-count span');
  if (el && S.live) el.textContent = 'Mã mới sau ' + Math.max(0, S.live.conLai) + 's';
  var c = document.getElementById('qr-count');
  if (c && S.live) c.classList.toggle('warn', S.live.conLai <= 10);
}

async function startCamera() {
  var video = document.getElementById('cam');
  var box = document.getElementById('cam-box');
  if (!video || !box) return;
  if (!window.jsQR) {
    toast('Thư viện quét QR chưa tải được. Hãy nhập mã token bên dưới.', 'err');
    return;
  }
  box.style.display = 'grid';
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    video.srcObject = S.stream;
    video.setAttribute('playsinline', '');
    await video.play();
    toast('Đưa mã QR vào khung hình để điểm danh.', 'ok');

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    var lastTry = 0;

    var loop = function () {
      if (!S.stream) return;
      var now = Date.now();
      if (now - lastTry > 220 && video.readyState >= 2 && video.videoWidth) {
        lastTry = now;
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code && code.data) {
          stopCamera();
          handleScanPayload(code.data);
          return;
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (err) {
    toast('Không mở được camera: ' + (err.message || 'thiết bị không hỗ trợ') + '. Hãy nhập mã thủ công.', 'err');
    box.style.display = 'none';
  }
}

function stopCamera() {
  if (S.stream) {
    S.stream.getTracks().forEach(function (t) { t.stop(); });
    S.stream = null;
  }
  var v = document.getElementById('cam');
  if (v) v.srcObject = null;
}

async function handleScanPayload(payload) {
  var pos = await getPos();
  try {
    var r = await API.call('attendance.scan', {
      payload: payload,
      hinhThuc: S.data.hinhThuc || 'Trực tiếp',
      viDo: pos.viDo || '',
      kinhDo: pos.kinhDo || ''
    });
    if (S.me) S.me.diem = r.tongDiem;
    toast(r.message, 'ok');
    openModal({
      title: 'Điểm danh thành công',
      body: '<div class="center" style="padding:8px 0">' +
        '<div class="login-logo" style="margin-bottom:12px;background:linear-gradient(145deg,#0E9F6E,#34D399)">' + icon('check', 30) + '</div>' +
        '<b style="font-size:17px">' + esc(r.hoTen) + '</b>' +
        '<p class="small muted mt-8">' + esc(r.hinhThuc) + ' · ' + fmtDate(r.thoiGian) + '</p>' +
        '<div class="row" style="justify-content:center;gap:8px;margin-top:12px">' +
          '<span class="badge badge-green" style="font-size:13px;padding:6px 12px">+' + r.diem + ' điểm</span>' +
          '<span class="badge badge-blue" style="font-size:13px;padding:6px 12px">Tổng: ' + r.tongDiem + 'đ</span>' +
        '</div></div>',
      footer: '<button class="btn btn-primary btn-block" data-act="scan-done">Hoàn tất</button>'
    });
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ------------------------------------------------------------------ */
/* HỘP THOẠI NGHIỆP VỤ                                                */
/* ------------------------------------------------------------------ */

function modalNewSession() {
  var me = S.me;
  var aps = S.data.aps || [];
  openModal({
    title: 'Mở phiên điểm danh',
    sub: 'Mã QR sẽ tự đổi token mỗi 60 giây',
    body: '<form data-form="create-session">' +
      '<div class="field"><label>Tên phiên / nội dung sinh hoạt</label>' +
      '<input class="input" name="tieuDe" required value="Sinh hoạt Chi đoàn tháng ' + new Date().getMonth() + '/" /></div>' +
      (me.cap <= 2 ? '<div class="field"><label>Chi đoàn Ấp</label><select class="input" name="maAp">' +
        aps.map(function (a) { return '<option value="' + esc(a.MaAp) + '">' + esc(a.TenAp) + '</option>'; }).join('') +
        '</select></div>' : '') +
      '<div class="note mt-8">Hệ thống tự kết thúc phiên cũ đang mở của cùng Ấp để tránh trùng lặp dữ liệu.</div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-16" type="submit">Tạo mã QR động</button>' +
      '</form>'
  });
}

function modalNominate(maDD) {
  var m = (S.data.uommam && S.data.uommam.items || []).filter(function (x) { return x.maDD === maDD; })[0];
  openModal({
    title: 'Đề cử Ươm mầm Đỏ',
    sub: m ? m.hoTen + ' · ' + m.diem + ' điểm' : maDD,
    body: '<form data-form="nominate">' +
      '<input type="hidden" name="maDD" value="' + esc(maDD) + '">' +
      '<div class="row wrap mb-12">' +
        badge('Thẻ ĐV', 'green') + badge('≥300 điểm', 'green') + badge('360° Tốt', 'green') +
      '</div>' +
      '<div class="field"><label>Nhận xét của Bí thư Chi đoàn Ấp</label>' +
      '<textarea class="input" name="nhanXet" required placeholder="Lập trường tư tưởng, đạo đức, tinh thần tình nguyện, uy tín trong thanh niên…"></textarea>' +
      '<div class="small muted mt-8">Tối thiểu 20 ký tự. Nội dung này được đưa vào biên bản giới thiệu Đảng.</div></div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Trình cấp Xã phê duyệt</button>' +
      '</form>'
  });
}

function modalExpense() {
  var me = S.me;
  var aps = S.data.aps || [];
  openModal({
    title: 'Ghi nhận khoản chi quỹ',
    sub: 'Bút toán sẽ công khai trên Sổ quỹ minh bạch',
    body: '<form data-form="expense">' +
      (me.cap <= 2 ? '<div class="field"><label>Chi đoàn Ấp phát sinh khoản chi</label><select class="input" name="maAp" required>' +
        aps.map(function (a) { return '<option value="' + esc(a.MaAp) + '">' + esc(a.TenAp) + '</option>'; }).join('') +
        '</select></div>' : '') +
      '<div class="field"><label>Số tiền (đồng)</label>' +
      '<input class="input" name="soTien" inputmode="numeric" required placeholder="VD: 150000"></div>' +
      '<div class="field"><label>Nội dung chi</label>' +
      '<input class="input" name="noiDung" required placeholder="VD: Mua quà thăm hộ khó khăn"></div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Ghi nhận & công khai</button>' +
      '</form>'
  });
}

function modalEditMember(maDD) {
  var items = (S.data.members && S.data.members.items) || [];
  var m = items.filter(function (x) { return String(x.maDD) === String(maDD); })[0];
  if (!m) { toast('Không tìm thấy thông tin đoàn viên. Hãy tải lại danh sách.', 'err'); return; }
  var me = S.me;
  var aps = S.data.aps || [];
  openModal({
    title: 'Cập nhật thông tin đoàn viên',
    sub: esc(m.hoTen) + ' · ' + esc(m.maDD),
    body: '<form data-form="member-update">' +
      '<input type="hidden" name="maDD" value="' + esc(m.maDD) + '">' +
      '<div class="field"><label>Họ và tên</label>' +
      '<input class="input" name="hoTen" required value="' + esc(m.hoTen) + '"></div>' +
      '<div class="field"><label>Số điện thoại</label>' +
      '<input class="input" name="dienThoai" inputmode="numeric" value="' + esc(m.dienThoai || '') + '" placeholder="09xxxxxxxx"></div>' +
      '<div class="field"><label>Ngày sinh</label>' +
      '<input class="input" name="ngaySinh" value="' + esc(m.ngaySinh || '') + '" placeholder="dd/mm/yyyy"></div>' +
      (me.cap <= 2 ? '<div class="field"><label>Chi đoàn Ấp</label><select class="input" name="maAp">' +
        aps.map(function (a) {
          return '<option value="' + esc(a.MaAp) + '"' + (a.MaAp === m.maAp ? ' selected' : '') + '>' + esc(a.TenAp) + '</option>';
        }).join('') + '</select></div>' : '') +
      '<div class="field"><label>Ghi chú</label>' +
      '<input class="input" name="ghiChu" value="' + esc(m.ghiChu || '') + '"></div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Lưu thay đổi</button>' +
      '</form>'
  });
}

function modalDeleteMember(maDD) {
  var items = (S.data.members && S.data.members.items) || [];
  var m = items.filter(function (x) { return String(x.maDD) === String(maDD); })[0];
  var ten = m ? m.hoTen : maDD;
  openModal({
    title: 'Xóa đoàn viên?',
    sub: ten + ' · ' + maDD,
    body: '<p class="small muted">Đoàn viên sẽ được chuyển vào thùng rác và ẩn khỏi danh sách, nhưng toàn bộ lịch sử điểm danh, đoàn phí, điểm rèn luyện và hồ sơ vẫn được giữ lại để kiểm toán.</p>' +
      '<div class="note mt-8">Quản trị hệ thống (Cấp 0) có thể khôi phục trong Hệ thống → Tài khoản → Thùng rác.</div>',
    footer: '<div class="row" style="gap:8px"><button class="btn btn-ghost grow" data-act="close-modal">Hủy</button>' +
      '<button class="btn btn-danger grow" data-act="delete-member-ok" data-ma="' + esc(maDD) + '">Chuyển vào thùng rác</button></div>'
  });
}

function modalEval360() {
  var items = [
    ['tuChinhTri', 'Tư tưởng chính trị'],
    ['daoDuc', 'Đạo đức, lối sống'],
    ['chuyenMon', 'Chuyên môn, nghiệp vụ'],
    ['congHien', 'Cống hiến tình nguyện'],
    ['kyLuat', 'Ý thức kỷ luật']
  ];
  openModal({
    title: 'Tự đánh giá 360°',
    sub: 'Thang điểm 1–5 cho mỗi tiêu chí (tối đa 25)',
    body: '<form data-form="eval360">' + items.map(function (it) {
      return '<div class="field"><label>' + it[1] + '</label><select class="input" name="' + it[0] + '">' +
        '<option value="5">5 · Xuất sắc</option><option value="4">4 · Tốt</option>' +
        '<option value="3">3 · Đạt</option><option value="2">2 · Cần cố gắng</option><option value="1">1 · Yếu</option>' +
        '</select></div>';
    }).join('') +
      '<div class="note mt-8">Kết quả đạt "Hoàn thành tốt" hoặc "Xuất sắc" là điều kiện thứ 3 để được đề cử nguồn Cảm tình Đảng.</div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Gửi kết quả (+10 điểm lần đầu)</button>' +
      '</form>'
  });
}

function modalCertForm() {
  openModal({
    title: 'Cấp Giấy chứng nhận số',
    sub: 'Có chữ ký số HMAC và QR xác thực',
    body: '<form data-form="cert">' +
      '<div class="field"><label>Loại chứng nhận</label><select class="input" name="loai">' +
        '<option>Giấy chứng nhận tham gia Chiến dịch Tình nguyện hè</option>' +
        '<option>Giấy chứng nhận hoàn thành tập huấn Dân vận khéo</option>' +
        '<option>Giấy chứng nhận Đoàn viên Ưu tú năm ' + S.config.nam + '</option>' +
        '<option>Giấy chứng nhận tham gia Chuyển đổi số cộng đồng</option>' +
      '</select></div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Ký số & cấp chứng nhận</button>' +
      '</form>'
  });
}

function modalMission(maPA) {
  var s = (S.data.sos && S.data.sos.items || []).filter(function (x) { return x.maPA === maPA; })[0];
  openModal({
    title: 'Chuyển phản ánh thành nhiệm vụ',
    sub: s ? s.loai + ' · ' + s.maAp : maPA,
    body: '<form data-form="mission">' +
      '<input type="hidden" name="maPA" value="' + esc(maPA) + '">' +
      '<div class="field"><label>Tên nhiệm vụ tình nguyện</label>' +
      '<input class="input" name="tenNV" required value="' + esc(s ? 'Xử lý: ' + s.loai : '') + '"></div>' +
      '<div class="note mt-8">Nhiệm vụ sẽ xuất hiện trên Bản đồ số. Đoàn viên check-in GPS tại hiện trường nhận +15 điểm.</div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Tạo nhiệm vụ trên bản đồ</button>' +
      '</form>'
  });
}

function modalPinResult(pin, hoTen) {
  openModal({
    title: 'Đã cấp mã PIN mới',
    sub: hoTen,
    body: '<div class="center" style="padding:6px 0">' +
      '<div class="small muted mb-8">Mã PIN mới (chỉ hiển thị một lần)</div>' +
      '<div style="font-size:38px;font-weight:800;letter-spacing:.22em;color:#B31217;font-family:ui-monospace,monospace">' + esc(pin) + '</div>' +
      '<div class="note mt-16" style="text-align:left">Hãy đọc trực tiếp cho đoàn viên qua điện thoại. Không gửi qua nhóm Zalo công khai. Đoàn viên nên đổi PIN ngay sau khi đăng nhập.</div>' +
      '</div>',
    footer: '<button class="btn btn-primary btn-block" data-act="copy-pin" data-pin="' + esc(pin) + '">Sao chép mã PIN</button>'
  });
}

function modalAiMinutes() {
  var items = (S.data.members && S.data.members.items) || [];
  openModal({
    title: 'Trích biên bản giới thiệu Đoàn viên ưu tú',
    sub: 'Tổng hợp tự động từ dữ liệu Google Sheets',
    body: '<div class="field"><label>Chọn đoàn viên</label><select class="input" id="minutes-select">' +
      items.map(function (m) { return '<option value="' + esc(m.maDD) + '">' + esc(m.hoTen) + ' · ' + m.diem + ' điểm</option>'; }).join('') +
      '</select></div>' +
      '<button class="btn btn-primary btn-block btn-lg mt-12" data-act="make-minutes">Tạo biên bản trong 3 giây</button>' +
      '<div id="minutes-out" class="mt-12"></div>'
  });
}

/* ------------------------------------------------------------------ */
/* SỰ KIỆN CLICK                                                      */
/* ------------------------------------------------------------------ */

var ACTIONS = {
  demo: function (el) {
    var f = document.querySelector('form[data-form="login"]');
    if (!f) return;
    // Ghi nhớ tài khoản trải nghiệm để sau khi đăng nhập tự mở hướng dẫn.
    try { sessionStorage.setItem('cd6_demo_tour', el.dataset.ma); } catch (err) { /* bỏ qua */ }
    var ma = f.querySelector('[name="maDD"]');
    var pin = f.querySelector('[name="pin"]');
    if (ma) ma.value = el.dataset.ma;
    if (pin) pin.value = el.dataset.pass || '123456';
    toast('Đã chọn tài khoản trải nghiệm ' + el.dataset.ma + '. Nhấn "Đăng nhập" để bắt đầu hướng dẫn.', 'ok');
    if (pin && typeof pin.focus === 'function') pin.focus();
  },

  nav: function (el) { go(el.dataset.view); },

  logout: function () {
    openModal({
      title: 'Đăng xuất khỏi hệ thống?',
      body: '<p class="small muted">Phiên làm việc sẽ kết thúc. Dữ liệu điểm và thẻ vẫn được bảo toàn trên Google Sheets.</p>',
      footer: '<div class="row" style="gap:8px"><button class="btn btn-ghost grow" data-act="close-modal">Ở lại</button>' +
        '<button class="btn btn-primary grow" data-act="logout-confirm">Đăng xuất</button></div>'
    });
  },

  'logout-confirm': function () { doLogout(); },
  'close-modal': function () { closeModal(); },
  'retry-online': function () { boot(); },

  'change-pin': function () {
    openModal({
      title: 'Đổi mã PIN',
      sub: 'Mã PIN dùng để đăng nhập và xác thực điểm danh',
      body: '<form data-form="change-pin" autocomplete="off">' +
        '<div class="field"><label>Mã PIN hiện tại</label>' +
        '<input class="input pin-input" name="oldPin" type="password" inputmode="numeric" maxlength="6" required></div>' +
        '<div class="field"><label>Mã PIN mới (6 chữ số)</label>' +
        '<input class="input pin-input" name="newPin" type="password" inputmode="numeric" maxlength="6" required></div>' +
        '<div class="field"><label>Xác nhận mã PIN mới</label>' +
        '<input class="input pin-input" name="confirmPin" type="password" inputmode="numeric" maxlength="6" required></div>' +
        '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Lưu mã PIN mới</button>' +
        '</form>'
    });
  },

  'forgot-pin': function () {
    openModal({
      title: 'Quên mã PIN',
      sub: 'Yêu cầu được chuyển tới cấp Xã — Quản trị hệ thống / Chủ tịch Hội LHTN Xã / Bí thư Chi bộ Xã',
      body: '<form data-form="forgot">' +
        '<div class="field"><label>Mã định danh của bạn</label>' +
        '<input class="input" name="maDD" required placeholder="VD: DV01" style="text-transform:uppercase"></div>' +
        '<div class="field"><label>Lý do (không bắt buộc)</label>' +
        '<input class="input" name="lyDo" placeholder="Quên PIN sau khi đổi điện thoại"></div>' +
        '<button class="btn btn-primary btn-block btn-lg mt-12" type="submit">Gửi yêu cầu cấp lại</button>' +
        '</form>'
    });
  },

  'hinh-thuc': function (el) {
    S.data.hinhThuc = el.dataset.value;
    $$('[data-act="hinh-thuc"]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.value === el.dataset.value);
    });
  },

  'start-cam': function () { startCamera(); },
  'stop-cam': function () { stopCamera(); },

  'new-session': function () { modalNewSession(); },

  'close-session': function (el) {
    openModal({
      title: 'Kết thúc phiên điểm danh?',
      body: '<p class="small muted">Mã QR sẽ hết hiệu lực ngay lập tức. Điểm của các lượt đã quét vẫn được giữ nguyên.</p>',
      footer: '<div class="row" style="gap:8px"><button class="btn btn-ghost grow" data-act="close-modal">Hủy</button>' +
        '<button class="btn btn-primary grow" data-act="close-session-ok" data-id="' + esc(el.dataset.id) + '">Kết thúc</button></div>'
    });
  },

  'close-session-ok': async function (el) {
    try {
      var r = await API.call('attendance.close', { maPhien: el.dataset.id });
      closeModal();
      toast(r.message, 'ok');
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  },

  'scan-done': function () { closeModal(); refresh(); },

  'pay-fee': async function () {
    try {
      var r = await API.call('fee.pay', { nam: S.config.nam });
      S.data.vietqr = r;
      openModal({
        title: 'VietQR đoàn phí năm ' + S.config.nam,
        sub: 'Quét bằng app ngân hàng bất kỳ',
        body: '<div class="center">' +
          '<div class="qr-frame"><img src="' + r.qrUrl + '" alt="VietQR" style="width:220px;height:220px" ' +
          'onerror="this.parentNode.innerHTML=\'<div class=&quot;small muted&quot;>Không tải được ảnh VietQR. Hãy chuyển khoản theo thông tin bên dưới.</div>\'"></div>' +
          '<div class="mt-12"><b style="font-size:18px">' + fmtMoney(r.soTien) + '</b></div>' +
          '<div class="small muted mt-8">Nội dung chuyển khoản</div>' +
          '<div style="font-family:ui-monospace,monospace;font-weight:700;letter-spacing:.05em">' + esc(r.noiDung) + '</div>' +
          '<div class="note mt-12" style="text-align:left">' +
            '<div><b>Ngân hàng:</b> ' + esc(r.bank.id) + '</div>' +
            '<div><b>Số tài khoản:</b> ' + esc(r.bank.acc) + '</div>' +
            '<div><b>Chủ tài khoản:</b> ' + esc(r.bank.name) + '</div>' +
          '</div>' +
          '<div class="small muted mt-8">Giữ nguyên nội dung chuyển khoản để hệ thống đối chiếu tự động.</div>' +
        '</div>',
        footer: '<div class="row" style="gap:8px"><button class="btn btn-ghost grow" data-act="close-modal">Đóng</button>' +
          '<button class="btn btn-green grow" data-act="fee-paid">Tôi đã chuyển khoản</button></div>'
      });
    } catch (e) { toast(e.message, 'err'); }
  },

  'fee-paid': function () {
    closeModal();
    toast('Đã ghi nhận. Bí thư Chi đoàn Ấp sẽ đối chiếu và xác nhận trong 24h.', 'ok');
    refresh();
  },

  'confirm-fee': async function (el) {
    try {
      var r = await API.call('fee.confirm', { maGiaoDich: el.dataset.id });
      toast(r.message, 'ok');
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  },

  expense: function () { modalExpense(); },

  'edit-member': function (el) { modalEditMember(el.dataset.ma); },
  'delete-member': function (el) { modalDeleteMember(el.dataset.ma); },
  'member-more': function () {
    S.data.memberLimit = (Number(S.data.memberLimit) || 50) + 50;
    go('admin');
  },

  'delete-member-ok': async function (el) {
    try {
      var r = await API.call('member.delete', { maDD: el.dataset.ma });
      closeModal();
      toast(r.message, 'ok');
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  },

  nominate: function (el) { modalNominate(el.dataset.ma); },

  'approve-uom': async function (el) {
    try {
      var r = await API.call('uommam.approve', { maDD: el.dataset.ma });
      toast(r.message, 'ok');
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  },

  'reject-uom': function (el) {
    openModal({
      title: 'Trả hồ sơ đề cử',
      body: '<form data-form="reject-uom">' +
        '<input type="hidden" name="maDD" value="' + esc(el.dataset.ma) + '">' +
        '<div class="field"><label>Lý do trả hồ sơ</label>' +
        '<textarea class="input" name="lyDo" placeholder="Bổ sung nhận xét, rà soát lại tiêu chí…"></textarea></div>' +
        '<button class="btn btn-danger btn-block mt-12" type="submit">Trả về Chi đoàn Ấp</button></form>'
    });
  },

  'issue-card': async function (el) {
    try {
      var r = await API.call('card.issue', { maDD: el.dataset.ma });
      toast(r.message, 'ok');
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  },

  eval360: function () { modalEval360(); },
  cert: function () { modalCertForm(); },

  print: function () {
    var c = S.data.card;
    if (!c) return;
    var html = '<div class="ecard">' +
      '<div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.85">Đoàn TNCS Hồ Chí Minh · ' + esc(c.tenXa) + '</div>' +
      '<div style="font-size:22px;font-weight:800;margin-top:4px">' + esc(c.hoTen) + '</div>' +
      '<div style="font-size:12.5px;opacity:.9">' + esc(c.chucVu) + ' · ' + esc(c.tenAp) + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:22px">' +
        '<div style="font-size:12.5px;line-height:1.7">' +
          '<div>Mã định danh: <b>' + esc(c.maDD) + '</b></div>' +
          '<div>Mã thẻ: <b>' + esc(c.maThe || '—') + '</b></div>' +
          '<div>Điểm rèn luyện: <b>' + c.diem + '</b></div>' +
          '<div>Có giá trị đến: <b>' + esc(c.hetHan || '—') + '</b></div>' +
        '</div>' +
        '<div style="background:#fff;padding:6px;border-radius:8px"><img src="' + qrImg('CD6CARD|' + c.maDD, 96) + '" width="96" height="96" alt="QR"></div>' +
      '</div>' +
      '<div style="margin-top:16px;padding-top:10px;border-top:1px solid rgba(255,255,255,.3);font-size:10.5px;opacity:.85">' +
        'Thẻ Đoàn viên điện tử · Hệ sinh thái Chi đoàn số 6.0</div>' +
    '</div>';
    printBlock(html, 'Thẻ Đoàn viên — ' + c.hoTen);
  },

  'sos-to-mission': function (el) { modalMission(el.dataset.pa); },

  'checkin-mission': async function (el) {
    var btn = el;
    btn.disabled = true;
    btn.textContent = 'Đang lấy GPS…';
    var pos = await getPos();
    if (!pos.viDo) toast('Không lấy được GPS — hệ thống sẽ ghi nhận check-in không kèm tọa độ.', 'err');
    try {
      var r = await API.call('mission.checkin', { maNV: el.dataset.nv, viDo: pos.viDo || '', kinhDo: pos.kinhDo || '' });
      if (S.me) S.me.diem = r.tongDiem;
      toast(r.message + (r.khoangCach !== null && r.khoangCach !== undefined ? ' Cách điểm ' + r.khoangCach + 'm.' : ''), 'ok');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = 'Check-in GPS';
    }
  },

  'quiz-answer': async function (el) {
    try {
      var r = await API.call('quiz.answer', { maCau: el.dataset.cau, dapAn: el.dataset.opt });
      toast(r.message, r.dung ? 'ok' : 'err');
      if (r.dung && S.me) S.me.diem += r.diem;
      refresh();
    } catch (e) { toast(e.message, 'err'); }
  },

  'learn-tab': function (el) {
    S.learnTab = el.dataset.tab;
    go('learn');
  },

  'chat-chip': function (el) { sendChat(el.dataset.text); },

  'approve-reset': async function (el) {
    try {
      var r = await API.call('auth.approveReset', { maYC: el.dataset.yc });
      modalPinResult(r.pinMoi, el.dataset.ten);
      toast(r.message, 'ok');
      setTimeout(refresh, 400);
    } catch (e) { toast(e.message, 'err'); }
  },

  'copy-pin': function (el) { copyText(el.dataset.pin); },

  'ai-minutes': function () { modalAiMinutes(); },

  'make-minutes': async function () {
    var sel = document.getElementById('minutes-select');
    var out = document.getElementById('minutes-out');
    if (!sel || !out) return;
    try {
      out.innerHTML = '<div class="skeleton" style="height:80px"></div>';
      var r = await API.call('bot.minutes', { maDD: sel.value });
      out.innerHTML = '<div class="note" style="max-height:280px;overflow:auto;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:11.5px">' +
        esc(r.noiDung) + '</div>' +
        '<button class="btn btn-ghost btn-block mt-8" data-act="copy-doc" data-i="1">' + icon('copy', 14) + ' Sao chép biên bản</button>';
      S.data.lastDoc = r.noiDung;
    } catch (e) {
      out.innerHTML = '<div class="small" style="color:#B42318">' + esc(e.message) + '</div>';
    }
  },

  'copy-doc': function () { copyText(S.data.lastDoc || ''); },

  'bot-alert': function (el) {
    var c = (S.data.home && S.data.home.canhBao || []).filter(function (x) { return x.maDD === el.dataset.ma; })[0];
    if (!c) return;
    var msg = 'Chào ' + c.hoTen + '! Chi đoàn Ấp ' + c.maAp + ' nhắn tin qua hệ thống Chi đoàn số 6.0. ' +
      'Bạn đã vắng sinh hoạt ' + c.soNgayVang + ' ngày. Chi đoàn mời bạn tham gia sinh hoạt Hybrid (trực tuyến) vào 19h30 thứ Bảy tuần này. ' +
      'Chỉ cần mở app, quét QR điểm danh là được +8 điểm rèn luyện. Rất mong gặp lại bạn!';
    openModal({
      title: 'Tin nhắn nhắc kết nối Zalo',
      sub: c.hoTen + ' · ' + c.maAp,
      body: '<div class="note" style="white-space:pre-wrap">' + esc(msg) + '</div>' +
        '<div class="small muted mt-8">Zalo Bot sẽ gửi tin nhắn này nếu bạn cấu hình Zalo OA ở bước triển khai.</div>',
      footer: '<button class="btn btn-primary btn-block" data-act="copy-message" data-msg="' + esc(msg) + '">Sao chép nội dung</button>'
    });
  },

  'copy-message': function (el) { copyText(el.dataset.msg); },

  'copy-script': function () { copyText(S.data.lastScript || ''); }
};

/* ------------------------------------------------------------------ */
/* XỬ LÝ FORM                                                         */
/* ------------------------------------------------------------------ */

var FORMS = {
  login: async function (d) {
    await doLogin(d.maDD.toUpperCase().trim(), d.pin.trim());
  },

  'change-password': async function (d) {
    var r = await API.call('auth.changePassword', {
      oldPassword: d.oldPassword,
      newPassword: d.newPassword,
      confirmPassword: d.confirmPassword
    });
    if (r.token) {
      S.token = r.token;
      localStorage.setItem('cd6_token', r.token);
    }
    S.me.batDoiMatKhau = false;
    closeModal();
    toast(r.message, 'ok');
    if (S.me && S.me.cap === 0) {
      S.view = 'system';
      renderApp();
    }
  },

  'change-pin': async function (d) {
    var r = await API.call('auth.changePin', {
      oldPin: d.oldPin,
      newPin: d.newPin,
      confirmPin: d.confirmPin
    });
    if (r.token) {
      S.token = r.token;
      localStorage.setItem('cd6_token', r.token);
    }
    S.me.batDoiPin = false;
    closeModal();
    toast(r.message, 'ok');
  },

  'force-pin': async function (d) {
    var r = await API.call('auth.changePin', {
      oldPin: d.oldPin,
      newPin: d.newPin,
      confirmPin: d.confirmPin
    });
    if (r.token) {
      S.token = r.token;
      localStorage.setItem('cd6_token', r.token);
    }
    S.me.batDoiPin = false;
    renderApp();
    toast(r.message, 'ok');
  },

  forgot: async function (d) {
    var r = await API.call('auth.requestPinReset', { maDD: (d.maDD || '').toUpperCase().trim(), lyDo: d.lyDo });
    closeModal();
    openModal({
      title: 'Đã gửi yêu cầu',
      body: '<div class="center" style="padding:8px 0">' +
        '<div class="login-logo" style="margin-bottom:12px">' + icon('shield', 28) + '</div>' +
        '<b>Yêu cầu đã được ghi nhận</b>' +
        '<p class="small muted mt-8">' + esc(r.message) + '</p></div>'
    });
  },

  scan: async function (d) {
    var pos = await getPos();
    await handleScanPayload('CD6||' + d.token.trim().toUpperCase());
  },

  'create-session': async function (d) {
    var r = await API.call('attendance.createSession', { tieuDe: d.tieuDe, maAp: d.maAp });
    closeModal();
    toast(r.message, 'ok');
    go('attendance');
  },

  nominate: async function (d) {
    var r = await API.call('uommam.nominate', { maDD: d.maDD, nhanXet: d.nhanXet });
    closeModal();
    toast(r.message, 'ok');
    refresh();
  },

  'reject-uom': async function (d) {
    var r = await API.call('uommam.reject', { maDD: d.maDD, lyDo: d.lyDo });
    closeModal();
    toast(r.message, 'ok');
    refresh();
  },

  expense: async function (d) {
    var r = await API.call('fee.addExpense', { soTien: d.soTien, noiDung: d.noiDung, maAp: d.maAp });
    closeModal();
    toast(r.message, 'ok');
    refresh();
  },

  eval360: async function (d) {
    var r = await API.call('eval.submit', {
      tuChinhTri: d.tuChinhTri, daoDuc: d.daoDuc, chuyenMon: d.chuyenMon,
      congHien: d.congHien, kyLuat: d.kyLuat
    });
    closeModal();
    toast(r.message, 'ok');
    refresh();
  },

  cert: async function (d) {
    try {
      var r = await API.call('cert.issue', { loai: d.loai });
      closeModal();
      var html = '<div class="cert">' +
        '<div style="text-align:center;font-size:12.5px">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br><b>Độc lập – Tự do – Hạnh phúc</b></div>' +
        '<h1 style="margin-top:22px">GIẤY CHỨNG NHẬN SỐ</h1>' +
        '<div class="muted">Số: ' + esc(r.maCert) + '</div>' +
        '<h2>' + esc(d.loai) + '</h2>' +
        '<p style="text-align:center">Ban Chấp hành Chi đoàn ' + esc(r.tenXa) + ' chứng nhận</p>' +
        '<p style="text-align:center;font-size:20px;font-weight:800;color:#B31217;margin:8px 0">' + esc(S.me.hoTen) + '</p>' +
        '<p style="text-align:justify">' + esc(r.noiDung) + '.</p>' +
        '<p style="text-align:center;font-size:12px">Cấp ngày ' + fmtDate(r.ngayCap) + '</p>' +
        '<div class="sig"><div>Người ký số<br><b>' + esc(S.me.chucVu) + '</b><br><span style="font-size:10px">' + esc(r.chuKySo) + '</span></div>' +
        '<div>Xác thực QR<br><img src="' + qrImg('CD6CERT|' + r.maCert + '|' + r.chuKySo, 110) + '" alt="QR xác thực"></div></div>' +
        '</div>';
      openModal({
        title: 'Giấy chứng nhận số',
        sub: 'Chữ ký số ' + r.chuKySo,
        body: html,
        footer: '<div class="row" style="gap:8px"><button class="btn btn-ghost grow" data-act="print-cert">' + icon('print', 15) + ' In / PDF</button>' +
          '<button class="btn btn-primary grow" data-act="close-modal">Hoàn tất</button></div>'
      });
      S.data.lastCertHtml = html;
      toast(r.message, 'ok');
    } catch (e) { throw e; }
  },

  sos: async function (d) {
    var pos = await getPos();
    var r = await API.call('sos.create', {
      loai: d.loai, noiDung: d.noiDung, viDo: pos.viDo || '', kinhDo: pos.kinhDo || ''
    });
    toast(r.message, 'ok');
    refresh();
  },

  mission: async function (d) {
    var r = await API.call('sos.toMission', { maPA: d.maPA, tenNV: d.tenNV });
    closeModal();
    toast(r.message, 'ok');
    refresh();
  },

  chat: async function (d) {
    var input = document.querySelector('form[data-form="chat"] input[name="text"]');
    if (input) input.value = '';
    await sendChat(d.text);
  },

  delegate: async function (d) {
    var r = await API.call('auth.delegate', { maDD: d.maDD, gio: d.gio });
    toast(r.message, 'ok');
    refresh();
  },

  'member-add': async function (d) {
    var r = await API.call('member.add', {
      hoTen: d.hoTen, dienThoai: d.dienThoai, ngaySinh: d.ngaySinh, maAp: d.maAp
    });
    toast(r.message, 'ok');
    refresh();
  },

  'member-update': async function (d) {
    var r = await API.call('member.update', {
      maDD: d.maDD, hoTen: d.hoTen, dienThoai: d.dienThoai,
      ngaySinh: d.ngaySinh, maAp: d.maAp, ghiChu: d.ghiChu
    });
    closeModal();
    toast(r.message, 'ok');
    refresh();
  },

  'ai-script': async function (d) {
    var out = document.getElementById('ai-script-out');
    if (out) out.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      var r = await API.call('bot.script', { noiDung: d.noiDung, thoiLuong: d.thoiLuong });
      S.data.lastScript = r.noiDung;
      if (out) {
        out.innerHTML = '<div class="note" style="max-height:340px;overflow:auto;white-space:pre-wrap;font-size:12px">' +
          esc(r.noiDung) + '</div>' +
          '<div class="row mt-8" style="gap:8px">' +
          '<button class="btn btn-ghost grow btn-sm" data-act="copy-script">' + icon('copy', 13) + ' Sao chép</button>' +
          '<button class="btn btn-ghost grow btn-sm" data-act="print-script">' + icon('print', 13) + ' In kịch bản</button></div>';
      }
      toast('Đã tạo kịch bản điều hành ' + d.thoiLuong + ' phút.', 'ok');
    } catch (e) {
      if (out) out.innerHTML = '<div class="small" style="color:#B42318">' + esc(e.message) + '</div>';
    }
  }
};

/* Bổ sung các action in ấn sau khi đã có dữ liệu */
ACTIONS['print-cert'] = function () {
  if (S.data.lastCertHtml) printBlock(S.data.lastCertHtml, 'Giấy chứng nhận số');
};
ACTIONS['print-script'] = function () {
  if (S.data.lastScript) {
    printBlock('<div style="white-space:pre-wrap;font-size:13px;line-height:1.7">' + esc(S.data.lastScript) + '</div>', 'Kịch bản điều hành');
  }
};

async function sendChat(text) {
  text = String(text || '').trim();
  if (!text) return;
  S.chat.push({ role: 'me', text: text });
  renderChat();
  try {
    var r = await API.call('bot.ask', { text: text });
    S.chat.push({ role: 'bot', text: r.reply });
  } catch (e) {
    S.chat.push({ role: 'bot', text: '⚠️ ' + e.message });
  }
  renderChat();
}

function renderChat() {
  var box = document.getElementById('chat-box');
  if (!box) return;
  box.innerHTML = S.chat.map(function (m) {
    return '<div class="msg ' + (m.role === 'me' ? 'me' : 'bot') + '">' + esc(m.text) + '</div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

/* ------------------------------------------------------------------ */
/* GẮN SỰ KIỆN TOÀN CỤC                                               */
/* ------------------------------------------------------------------ */

AFTER.attendance = function () {
  if (S.data.activeSession) startQr(S.data.activeSession);
};
AFTER.learn = function () {
  var box = document.getElementById('chat-box');
  if (box) box.scrollTop = box.scrollHeight;
};

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-act]');
  if (!el) return;
  var fn = ACTIONS[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try {
    fn(el, e);
  } catch (err) {
    toast(err.message || String(err), 'err');
  }
});

document.addEventListener('submit', function (e) {
  var form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  var kind = form.dataset.form;
  var handler = FORMS[kind];
  if (!handler) return;
  var data = {};
  new FormData(form).forEach(function (v, k) { data[k] = v; });
  var btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  Promise.resolve()
    .then(function () { return handler(data, form); })
    .catch(function (err) { toast(err.message || String(err), 'err'); })
    .then(function () { if (btn) btn.disabled = false; });
});

/* Khởi động */
document.addEventListener('DOMContentLoaded', boot);
