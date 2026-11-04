/* ==================================================================
   CHI ĐOÀN SỐ 6.0 — XÃ TÂN HÒA
   core.js — Trạng thái, tiện ích, API, đăng nhập, khung ứng dụng.
   ================================================================== */

'use strict';

/* ------------------------------------------------------------------ */
/* 1. TRẠNG THÁI TOÀN CỤC                                             */
/* ------------------------------------------------------------------ */

var S = {
  token: localStorage.getItem('cd6_token') || '',
  me: null,
  config: { tenXa: 'Xã Tân Hòa', nam: 2026, mucTieuDiem: 300, doanPhiNam: 24000 },
  configVersion: 0,
  pendingSync: false,
  view: 'home',
  data: {},
  qrTimer: null,
  live: null,
  stream: null,
  learnTab: 'quiz',
  chat: [],
  quizChoices: {}
};

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/* ------------------------------------------------------------------ */
/* 2. TIỆN ÍCH ĐỊNH DẠNG                                              */
/* ------------------------------------------------------------------ */

function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtMoney(n) { return Number(n || 0).toLocaleString('vi-VN') + 'đ'; }

function fmtDate(v) {
  if (!v) return '—';
  var s = String(v);
  var m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T]?(\d{2})?:?(\d{2})?/);
  if (!m) return s;
  return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' · ' + m[4] + ':' + (m[5] || '00') : '');
}

function initials(name) {
  if (!name) return '?';
  var p = String(name).trim().split(/\s+/);
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function capLabel(cap, tenAp) {
  var tenXa = (typeof S !== 'undefined' && S.config && S.config.tenXa) || 'Xã Tân Hòa';
  var donVi = tenAp || '';
  if (cap === 0) return 'Cấp 0 · Quản trị hệ thống · Toàn hệ thống';
  if (cap === 1) return 'Cấp 1 · ' + (donVi || ('Ủy Ban Hội LHTN Việt Nam ' + tenXa)) + ' · Chủ Tịch';
  if (cap === 2) return 'Cấp 2 · Bí thư Chi bộ Xã · ' + (donVi || ('Chi bộ ' + tenXa));
  if (cap === 3) return 'Cấp 3 · Bí thư Chi đoàn Ấp · ' + (donVi || 'Chi đoàn Ấp');
  return 'Cấp 4 · Đoàn viên Ấp · ' + (donVi || 'Chi đoàn Ấp');
}
function capShort(cap) {
  return cap === 0 ? 'Cấp 0' : cap === 1 ? 'Cấp 1' : cap === 2 ? 'Cấp 2' : cap === 3 ? 'Cấp 3' : 'Cấp 4';
}
function daysLabel(n) { return n === 0 ? 'hôm nay' : n + ' ngày trước'; }

function roleTone(cap) {
  return cap === 0 ? 'gold' : cap === 1 ? 'gold' : cap === 2 ? 'blue' : cap === 3 ? 'green' : 'grey';
}

/* ------------------------------------------------------------------ */
/* 3. BỘ ICON (inline SVG)                                            */
/* ------------------------------------------------------------------ */

var ICON_PATHS = {
  home: '<path d="M3 10.2 12 3l9 7.2V21a1 1 0 0 1-1 1h-5.5v-7h-5v7H4a1 1 0 0 1-1-1z"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 18h3v3"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13C12 9 9 7 5 7c0 4 3 6 7 6z"/><path d="M12 11c0-3 2.5-5 7-5 0 3.5-3 5-7 5z"/>',
  wallet: '<path d="M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h16"/><circle cx="17" cy="13.5" r="1.2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 14.5h5"/>',
  alert: '<path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 16.5h.01"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>',
  shield: '<path d="M12 21s7-3.2 7-9V5.5L12 3 5 5.5V12c0 5.8 7 9 7 9z"/><path d="m9.3 12 2 2 3.4-3.6"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  users: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7.5" r="3.5"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.9M16.5 4.1a3.5 3.5 0 0 1 0 6.8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  trend: '<path d="m3 16 5.5-5.5 3.5 3.5L21 5"/><path d="M15 5h6v6"/>',
  inbox: '<path d="M21 12h-5l-2 3h-4l-2-3H3"/><path d="M5.5 5h13l2.5 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  check: '<path d="m4 12.5 5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.4-2h5.2L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.4"/>',
  logout: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H15"/><path d="M10 8 6 12l4 4M6 12h9"/>',
  map: '<path d="m9 4 6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/>',
  chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 0 1 8-8h2a8 8 0 0 1 8 4z"/>',
  send: '<path d="m4 12 16-7-6.5 16-2.6-6.2z"/><path d="m11 14.8 9-9.8"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 17h12v4H6z"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m14 6 4 4"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8 14-1.5 7 5.5-3 5.5 3L16 14"/>',
  location: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-6.5 0-4.5-4-6.2-4.5-11.5-2 1.5-3.2 3.6-3.5 6-1-1-1.6-2.2-1.8-3.5C7.5 8.5 5 11 5 15.5 5 19.2 8 22 12 22z"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v1h6v-1c0-.4.1-.8.5-1.1A6 6 0 0 0 12 3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};

function icon(name, size) {
  size = size || 20;
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATHS[name] || '') + '</svg>';
}

/* ------------------------------------------------------------------ */
/* 3b. MÃ QR TỰ LƯU TRỮ (qrcode-generator, MIT)                        */
/* ------------------------------------------------------------------ */

// qrcode-generator mặc định mã hoá Latin-1; chuyển sang UTF-8 để giữ dấu
// tiếng Việt và mọi ký tự Unicode trong nội dung QR.
(function () {
  try {
    if (typeof qrcode === 'function' && qrcode.stringToBytesFuncs &&
        qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
  } catch (e) { /* thư viện chưa tải — qrImg sẽ dùng ảnh dự phòng */ }
})();

var QR_IMG_CACHE = {};

/** Ảnh dự phòng khi thiếu thư viện QR — không gọi dịch vụ ngoài. */
function qrFallback_(size) {
  size = Number(size) || 160;
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
    '" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/>' +
    '<rect x="6" y="6" width="88" height="88" fill="none" stroke="#B42318" stroke-width="4"/>' +
    '<text x="50" y="54" font-family="sans-serif" font-size="13" text-anchor="middle" fill="#B42318">QR lỗi</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/**
 * Tạo ảnh QR dạng data URL ngay trên máy người dùng.
 * Không gửi nội dung QR (token điểm danh, mã thẻ…) ra máy chủ bên thứ ba.
 */
function qrImg(data, size) {
  size = Math.max(48, Number(size) || 160);
  data = String(data === null || data === undefined ? '' : data);
  var key = size + '|' + data;
  if (QR_IMG_CACHE[key]) return QR_IMG_CACHE[key];

  var out = '';
  if (typeof qrcode === 'function') {
    var levels = ['M', 'L'];
    for (var i = 0; i < levels.length && !out; i++) {
      try {
        var qr = qrcode(0, levels[i]); // 0 = tự chọn phiên bản nhỏ nhất
        qr.addData(data);
        qr.make();
        var count = qr.getModuleCount();
        var cell = Math.max(1, Math.round(size / count));
        out = qr.createDataURL(cell, 0);
      } catch (e) { /* thử mức sửa lỗi thấp hơn */ }
    }
  }
  if (!out) out = qrFallback_(size);

  // Giới hạn bộ nhớ đệm: token điểm danh đổi mỗi 60 giây.
  var keys = Object.keys(QR_IMG_CACHE);
  if (keys.length > 40) QR_IMG_CACHE = {};
  QR_IMG_CACHE[key] = out;
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. LỚP GỌI API                                                     */
/* ------------------------------------------------------------------ */

var API = {
  isMock: function () {
    return !(window.google && window.google.script && window.google.script.run);
  },
  call: function (action, payload) {
    payload = payload || {};
    if (this.isMock()) return window.MOCK_API.call(action, payload, S.token);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.reject(new Error('Không có kết nối mạng. Dữ liệu đã tải vẫn xem được; thao tác ghi sẽ hoạt động khi có mạng trở lại.'));
    }
    return new Promise(function (resolve, reject) {
      window.google.script.run
        .withSuccessHandler(function (r) {
          if (r && r.ok) resolve(r.data);
          else reject(new Error((r && r.error) || 'Lỗi hệ thống'));
        })
        .withFailureHandler(function (e) { reject(e); })
        .api(action, payload, S.token);
    });
  }
};

/* ------------------------------------------------------------------ */
/* 5. TOAST & MODAL                                                   */
/* ------------------------------------------------------------------ */

function toast(msg, type) {
  var box = $('#toast');
  var el = document.createElement('div');
  el.className = 'toast-item ' + (type || '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(function () {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(function () { el.remove(); }, 260);
  }, 3400);
}

function openModal(opts) {
  var root = $('#modal-root');
  root.innerHTML = '<div class="modal-mask" data-close="1"><div class="modal-card">' +
    '<div class="modal-hd"><div><h3>' + esc(opts.title) + '</h3>' +
    (opts.sub ? '<div class="card-sub">' + esc(opts.sub) + '</div>' : '') + '</div>' +
    '<button class="modal-close" data-close="1">' + icon('x', 16) + '</button></div>' +
    (opts.body || '') +
    (opts.footer ? '<div class="mt-16">' + opts.footer + '</div>' : '') +
    '</div></div>';
  root.querySelector('.modal-mask').addEventListener('click', function (e) {
    if (e.target.dataset.close) closeModal();
  });
}

function closeModal() {
  $('#modal-root').innerHTML = '';
  // Nếu trong lúc mở biểu mẫu có cập nhật từ quản trị, đồng bộ ngay sau khi đóng.
  if (S.pendingSync) {
    setTimeout(function () {
      if (S.pendingSync && S.token && S.me) syncConfigNow();
    }, 300);
  }
}

/* ------------------------------------------------------------------ */
/* 6. ĐĂNG NHẬP                                                       */
/* ------------------------------------------------------------------ */

function renderLogin() {
  stopConfigWatch();
  $('#app').innerHTML =
    '<div class="login-screen"><div class="login-card">' +
      '<div class="login-logo">' + icon('star', 32) + '</div>' +
      '<h1 class="login-title">Hệ sinh thái Chi đoàn số 6.0</h1>' +
      '<p class="login-sub">' + esc(S.config.tenXa) + ' · Đổi mới phương thức tập hợp Đoàn viên</p>' +
      '<div class="center mt-12"><span class="login-badge">' + icon('shield', 12) + ' Mã định danh + PIN 6 số · Quản trị dùng mật khẩu</span></div>' +
      '<form data-form="login" autocomplete="off">' +
        '<div class="field"><label>Mã định danh hoặc số điện thoại</label>' +
          '<input class="input" name="maDD" placeholder="VD: CT_HOILHTN / DV01 / ADMIN" required></div>' +
        '<div class="field"><label>Mã PIN hoặc mật khẩu</label>' +
          '<input class="input pin-input" name="pin" type="password" placeholder="PIN 6 số hoặc mật khẩu quản trị" required></div>' +
        '<button class="btn btn-primary btn-block btn-lg mt-16" type="submit">' + icon('logout', 17) + ' Đăng nhập hệ thống</button>' +
      '</form>' +
      (API.isMock()
        ? '<div class="demo-box">' +
          '<h4>Tài khoản trải nghiệm (PIN: 123456)</h4>' +
          '<button type="button" class="demo-chip" data-act="demo" data-ma="ADMIN" data-pass="ThanhnienvietnamXTH"><span class="badge badge-gold">C0</span><b>ADMIN</b> · Quản trị hệ thống</button>' +
          '<button type="button" class="demo-chip" data-act="demo" data-ma="CT_HOILHTN"><span class="badge badge-gold">C1</span><b>CT_HOILHTN</b> · Chủ Tịch Hội LHTN Xã</button>' +
          '<button type="button" class="demo-chip" data-act="demo" data-ma="BT_CHIBO_XA"><span class="badge badge-blue">C2</span><b>BT_CHIBO_XA</b> · Bí thư Chi bộ Xã</button>' +
          '<button type="button" class="demo-chip" data-act="demo" data-ma="BT_AP01"><span class="badge badge-green">C3</span><b>BT_AP01</b> · Bí thư Chi đoàn Ấp Tân Bình</button>' +
          '<button type="button" class="demo-chip" data-act="demo" data-ma="DV01"><span class="badge badge-green">C4</span><b>DV01</b> · Đoàn viên Võ Minh Khoa</button>' +
          '</div>'
        : '') +
      '<p class="small muted center mt-12">Quên PIN? <a href="#" data-act="forgot-pin">Gửi yêu cầu cấp lại</a> — mã mới chỉ hiển thị cho Cấp 0 / Cấp 1 / Cấp 2.</p>' +
      '<p class="small muted center mt-8" style="font-size:10.5px">Chi đoàn số 6.0 · ' + esc(S.config.tenXa) + ' · Năm ' + esc(S.config.nam) + '</p>' +
    '</div></div>';
  setTimeout(function () {
    var i = document.querySelector('input[name="maDD"]');
    if (i && typeof i.focus === 'function') i.focus();
  }, 60);
}

async function doLogin(maDD, pin) {
  var r = await API.call('auth.login', { maDD: maDD, pin: pin });
  S.token = r.token;
  localStorage.setItem('cd6_token', r.token);
  S.me = r.profile;
  S.config = r.config || S.config;
  S.configVersion = Number(r.phienBan || 0);
  S.view = r.profile.cap === 0 ? 'system' : 'home';
  S.chat = [];
  if (r.profile.batDoiMatKhau) {
    renderForcePassword();
    return;
  }
  if (r.profile.batDoiPin) {
    renderForcePin();
    return;
  }
  renderApp();
  toast('Chào mừng ' + r.profile.hoTen + ' quay trở lại!', 'ok');
}

/** Màn hình bắt buộc đổi PIN ở lần đăng nhập đầu tiên (tài khoản mới / sau khi cấp lại PIN). */
function renderForcePin() {
  var m = S.me || {};
  $('#app').innerHTML =
    '<div class="login-screen"><div class="login-card">' +
      '<div class="login-logo">' + icon('shield', 32) + '</div>' +
      '<h1 class="login-title">Đổi mã PIN</h1>' +
      '<p class="login-sub">' + esc(m.hoTen || '') + ' · ' + esc(m.maDD || '') + '</p>' +
      '<div class="alert-row warn mt-12">' + icon('alert', 18) +
        '<div><b>Đây là lần đăng nhập đầu tiên</b><span>Bạn phải đổi mã PIN mặc định trước khi vào hệ thống.</span></div></div>' +
      '<form data-form="force-pin" autocomplete="off">' +
        '<div class="field"><label>Mã PIN hiện tại</label>' +
          '<input class="input pin-input" name="oldPin" type="password" inputmode="numeric" maxlength="6" required placeholder="PIN tạm thời"></div>' +
        '<div class="field"><label>Mã PIN mới (6 chữ số, khó đoán)</label>' +
          '<input class="input pin-input" name="newPin" type="password" inputmode="numeric" maxlength="6" required placeholder="••••••"></div>' +
        '<div class="field"><label>Xác nhận mã PIN mới</label>' +
          '<input class="input pin-input" name="confirmPin" type="password" inputmode="numeric" maxlength="6" required placeholder="••••••"></div>' +
        '<button class="btn btn-primary btn-block btn-lg mt-16" type="submit">' + icon('check', 17) + ' Lưu mã PIN mới</button>' +
      '</form>' +
      '<p class="small muted center mt-12">Mã PIN được lưu dạng băm HMAC, không lưu chữ thô. ' +
        '<a href="#" data-act="logout-confirm">Đăng xuất</a></p>' +
    '</div></div>';
  setTimeout(function () {
    var i = document.querySelector('input[name="oldPin"]');
    if (i && typeof i.focus === 'function') i.focus();
  }, 60);
}

/** Màn hình bắt buộc đổi mật khẩu ở lần đăng nhập đầu của tài khoản quản trị. */
function renderForcePassword() {
  var m = S.me || {};
  $('#app').innerHTML =
    '<div class="login-screen"><div class="login-card">' +
      '<div class="login-logo">' + icon('shield', 32) + '</div>' +
      '<h1 class="login-title">Đổi mật khẩu quản trị</h1>' +
      '<p class="login-sub">' + esc(m.hoTen || 'Quản trị hệ thống') + ' · ' + esc(m.maDD || 'ADMIN') + '</p>' +
      '<div class="alert-row warn mt-12">' + icon('alert', 18) +
        '<div><b>Đây là lần đăng nhập đầu tiên</b><span>Vì an toàn, bạn phải đổi mật khẩu mặc định trước khi vào hệ thống.</span></div></div>' +
      '<form data-form="change-password" autocomplete="off">' +
        '<div class="field"><label>Mật khẩu hiện tại</label>' +
          '<input class="input" name="oldPassword" type="password" required placeholder="ThanhnienvietnamXTH"></div>' +
        '<div class="field"><label>Mật khẩu mới (tối thiểu 8 ký tự)</label>' +
          '<input class="input" name="newPassword" type="password" minlength="8" required placeholder="••••••••"></div>' +
        '<div class="field"><label>Xác nhận mật khẩu mới</label>' +
          '<input class="input" name="confirmPassword" type="password" minlength="8" required placeholder="••••••••"></div>' +
        '<button class="btn btn-primary btn-block btn-lg mt-16" type="submit">' + icon('check', 17) + ' Lưu mật khẩu mới</button>' +
      '</form>' +
      '<p class="small muted center mt-12">Mật khẩu được lưu dạng băm HMAC, không lưu chữ thô. ' +
        '<a href="#" data-act="logout-confirm">Đăng xuất</a></p>' +
    '</div></div>';
  setTimeout(function () {
    var i = document.querySelector('input[name="oldPassword"]');
    if (i && typeof i.focus === 'function') i.focus();
  }, 60);
}

function doLogout() {
  stopQr();
  stopCamera();
  stopConfigWatch();
  var clear = function () {
    S.token = '';
    S.me = null;
    localStorage.removeItem('cd6_token');
    try { sessionStorage.removeItem('cd6_demo_tour'); } catch (e) { /* bỏ qua */ }
    closeModal();
    renderLogin();
  };
  if (!S.token) { clear(); return; }
  // Thu hồi token trên máy chủ trước khi xóa phiên cục bộ.
  API.call('auth.logout', {}).then(clear, clear);
}

async function boot() {
  capNhatTrangThaiMang();
  window.addEventListener('online', capNhatTrangThaiMang);
  window.addEventListener('offline', capNhatTrangThaiMang);
  if (API.isMock()) {
    var bar = document.createElement('div');
    bar.style.cssText = 'background:#1D4ED8;color:#fff;font-size:10.5px;text-align:center;padding:5px 8px;font-weight:600;letter-spacing:.03em';
    bar.textContent = 'CHẾ ĐỘ XEM TRƯỚC CỤC BỘ · Dữ liệu mô phỏng, lưu trên trình duyệt';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (S.token) {
    try {
      var r = await API.call('auth.me', {});
      S.me = r.profile;
      S.config = r.config || S.config;
      S.configVersion = Number(r.phienBan || 0);
      S.view = r.profile.cap === 0 ? 'system' : 'home';
      if (r.profile.batDoiMatKhau) {
        renderForcePassword();
        return;
      }
      if (r.profile.batDoiPin) {
        renderForcePin();
        return;
      }
      renderApp();
      return;
    } catch (e) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        renderOffline(); // giữ token, không đăng xuất khi chỉ mất mạng
        return;
      }
      S.token = '';
      localStorage.removeItem('cd6_token');
    }
  }
  renderLogin();
}

/** Thanh trạng thái mạng: chỉ báo, không chặn xem dữ liệu đã tải. */
function capNhatTrangThaiMang() {
  var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!document.body) return;
  var bar = document.getElementById('offline-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'offline-bar';
    bar.className = 'offline-bar';
    document.body.appendChild(bar);
  }
  bar.textContent = offline ? 'Ngoại tuyến — đang xem dữ liệu đã tải. Thao tác ghi sẽ bị tạm khóa.' : '';
  if (bar.classList) bar.classList.toggle('show', offline);
  else bar.style.display = offline ? 'block' : 'none';
}

/** Màn hình khi mở ứng dụng lúc mất mạng (giữ nguyên phiên đăng nhập). */
function renderOffline() {
  stopConfigWatch();
  $('#app').innerHTML =
    '<div class="login-screen"><div class="login-card center">' +
      '<div class="login-logo">' + icon('alert', 30) + '</div>' +
      '<h1 class="login-title">Đang ngoại tuyến</h1>' +
      '<p class="login-sub">Không kết nối được máy chủ. Phiên đăng nhập của bạn vẫn được giữ.</p>' +
      '<button class="btn btn-primary btn-block btn-lg mt-16" data-act="retry-online">' + icon('check', 17) + ' Thử kết nối lại</button>' +
      '<p class="small muted center mt-12">Kiểm tra Wi-Fi/4G rồi bấm thử lại. Hệ thống chạy trên Google Apps Script nên cần mạng để tải dữ liệu mới.</p>' +
    '</div></div>';
}

/* ------------------------------------------------------------------ */
/* 6b. ĐỒNG BỘ CẤU HÌNH & DANH TÍNH TỰ ĐỘNG                           */
/* ------------------------------------------------------------------ */

var SYNC_INTERVAL_MS = 30000;
var __syncTimer = null;
var __syncStarted = false;
var __syncBusy = false;

/**
 * Gọi auth.me định kỳ để nhận cấu hình + hồ sơ mới.
 * Chỉ chạy khi tab đang hiển thị để không tốn quota Apps Script vô ích.
 */
function startConfigWatch() {
  if (__syncStarted || !S.token || !S.me) return;
  __syncStarted = true;
  scheduleConfigSync(5000 + Math.floor(Math.random() * 5000));
}

function scheduleConfigSync(ms) {
  if (!__syncStarted) return;
  __syncTimer = setTimeout(function () {
    __syncTimer = null;
    if (!__syncStarted) return;
    var task = (document.hidden || !S.token || !S.me) ? Promise.resolve(false) : syncConfigNow();
    Promise.resolve(task).catch(function () { }).then(function () {
      scheduleConfigSync(SYNC_INTERVAL_MS);
    });
  }, ms);
}

function stopConfigWatch() {
  __syncStarted = false;
  if (__syncTimer) {
    clearTimeout(__syncTimer);
    __syncTimer = null;
  }
}

/** Cập nhật S.me/S.config từ phản hồi auth.me; trả về các nhóm thay đổi. */
function adoptIdentity(r) {
  var next = r.profile || {};
  var old = S.me || {};
  var nextRev = Number(r.phienBan || 0);
  var identityKeys = ['hoTen', 'chucVu', 'cap', 'maAp', 'tenAp', 'trangThai', 'daXoa', 'batDoiPin'];
  var identityChanged = identityKeys.some(function (k) {
    return String(old[k] === undefined ? '' : old[k]) !== String(next[k] === undefined ? '' : next[k]);
  });
  var configChanged = nextRev !== Number(S.configVersion || 0);
  var pointsChanged = Number(old.diem || 0) !== Number(next.diem || 0);

  S.me = next;
  if (r.config) S.config = r.config;
  if (nextRev) S.configVersion = nextRev;

  return {
    configChanged: configChanged,
    identityChanged: identityChanged,
    pointsChanged: pointsChanged,
    changed: configChanged || identityChanged || pointsChanged
  };
}

/** Có đang ở giữa một biểu mẫu / phiên QR / camera không? */
function isUiBusyForSync() {
  if ($('#modal-root .modal-card')) return true;
  if (S.live || S.stream) return true;
  var ae = document.activeElement;
  return !!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
}

/** Vẽ lại thanh trên cùng mà không làm mất nội dung/modal đang mở. */
function refreshTopbar() {
  var old = $('.topbar');
  if (!old || !S.me) return;
  old.outerHTML = topbar();
}

/** Áp dụng thay đổi cấu hình/hồ sơ cho phiên đang mở. */
function applyLiveUpdate(ch) {
  if (isUiBusyForSync()) {
    S.pendingSync = true;
    refreshTopbar();
    toast('Quản trị vừa cập nhật dữ liệu. Thay đổi sẽ hiển thị sau khi đóng biểu mẫu.', 'ok');
    return;
  }
  S.pendingSync = false;
  renderApp();
  toast('Đã đồng bộ thay đổi mới từ quản trị.', 'ok');
}

/**
 * Kiểm tra phiên bản cấu hình ngay (dùng cho polling, focus và sau thao tác quản trị).
 * opts.render === false: chỉ cập nhật state, để hàm gọi tự vẽ lại màn hình.
 */
async function syncConfigNow(opts) {
  opts = opts || {};
  if (!S.token || !S.me) return false;
  if (__syncBusy) return false;
  __syncBusy = true;
  try {
    var r = await API.call('auth.me', {});
    var ch = adoptIdentity(r);
    if (ch.pointsChanged) refreshHeaderPoints();
    if (opts.render === false) return ch.changed;

    if (!ch.changed && S.pendingSync && !isUiBusyForSync()) {
      S.pendingSync = false;
      renderApp();
      toast('Đã đồng bộ thay đổi mới từ quản trị.', 'ok');
      return true;
    }
    if (ch.configChanged || ch.identityChanged) {
      applyLiveUpdate(ch);
      return true;
    }
    return ch.changed;
  } catch (e) {
    var msg = e && e.message ? e.message : String(e);
    if (/Phiên đăng nhập|Tài khoản đã bị|không còn tồn tại/i.test(msg)) {
      S.token = '';
      S.me = null;
      localStorage.removeItem('cd6_token');
      stopConfigWatch();
      closeModal();
      renderLogin();
      toast(msg, 'err');
    }
    return false;
  } finally {
    __syncBusy = false;
  }
}

document.addEventListener('visibilitychange', function () {
  if (!document.hidden && S.token && S.me) syncConfigNow();
});
window.addEventListener('focus', function () {
  if (S.token && S.me) syncConfigNow();
});

/* ------------------------------------------------------------------ */
/* 7. KHUNG ỨNG DỤNG & ĐIỀU HƯỚNG                                     */
/* ------------------------------------------------------------------ */

var NAV = [
  { id: 'home', label: 'Tổng quan', icon: 'home', caps: [0, 1, 2, 3, 4] },
  { id: 'attendance', label: 'Điểm danh', icon: 'qr', caps: [0, 1, 2, 3, 4] },
  { id: 'uommam', label: 'Ươm mầm Đỏ', icon: 'sprout', caps: [0, 1, 2, 3, 4] },
  { id: 'fee', label: 'Đoàn phí', icon: 'wallet', caps: [0, 1, 2, 3, 4] },
  { id: 'card', label: 'Thẻ ĐV', icon: 'card', caps: [0, 1, 2, 3, 4] },
  { id: 'sos', label: 'SOS & Bản đồ', icon: 'alert', caps: [0, 1, 2, 3, 4] },
  { id: 'learn', label: 'Học tập & AI', icon: 'book', caps: [0, 1, 2, 3, 4] },
  { id: 'admin', label: 'Quản trị', icon: 'shield', caps: [0, 1, 2, 3] },
  { id: 'system', label: 'Hệ thống', icon: 'shield', caps: [0] }
];

function topbar() {
  var m = S.me;
  var admin = m.cap === 0;
  return '<header class="topbar"><div class="topbar-inner">' +
    '<div class="brand-line">' +
      '<div class="brand">' +
        '<div class="brand-mark">' + icon('star', 22) + '</div>' +
        '<div class="brand-text"><b>Chi đoàn số 6.0 · ' + esc(S.config.tenXa) + '</b>' +
        '<span>' + (admin ? 'Quản trị hệ thống · Cấp 0' : 'Đổi mới tập hợp Đoàn viên · Năm ' + esc(S.config.nam)) + '</span></div>' +
      '</div>' +
      '<div class="top-actions">' +
        (typeof demoAccountHasTour === 'function' && demoAccountHasTour() ? '<button class="icon-btn" data-act="start-tour" title="Xem lại hướng dẫn sử dụng">' + icon('bulb', 18) + '</button>' : '') +
        (admin ? '' : '<button class="icon-btn" data-act="change-pin" title="Đổi mã PIN">' + icon('shield', 18) + '</button>') +
        '<button class="icon-btn" data-act="logout" title="Đăng xuất">' + icon('logout', 18) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="user-strip">' +
      '<div class="avatar">' + esc(initials(m.hoTen)) + '</div>' +
      '<div class="user-meta"><b>' + esc(m.hoTen) + '</b><span>' + esc(capLabel(m.cap, m.tenAp)) + '</span></div>' +
      (admin ? '<div class="points-pill admin-pill">' + icon('shield', 13) + ' C0</div>'
        : '<div class="points-pill">' + icon('star', 13) + ' ' + m.diem + ' <small>điểm</small></div>') +
    '</div>' +
  '</div></header>';
}

function bottomnav() {
  var items = NAV.filter(function (n) { return n.caps.indexOf(S.me.cap) >= 0; });
  return '<nav class="bottomnav">' + items.map(function (n) {
    return '<button class="nav-item" data-act="nav" data-view="' + n.id + '">' +
      icon(n.icon, 21) + '<span>' + n.label + '</span></button>';
  }).join('') + '</nav>';
}

function renderApp() {
  $('#app').innerHTML = '<div class="app-shell">' + topbar() +
    '<main class="screen" id="screen"></main>' + bottomnav() + '</div>';
  go(S.view || 'home');
  startConfigWatch();
  maybeStartDemoTour();
}

/**
 * Nếu nhân viên vừa chọn một tài khoản trải nghiệm ở màn hình đăng nhập
 * (và đã đăng nhập thành công) thì tự động mở hướng dẫn từng bước.
 * Cờ được lưu trong sessionStorage để vẫn hoạt động khi đăng nhập
 * vượt qua bước bắt buộc đổi PIN / mật khẩu.
 */
function maybeStartDemoTour() {
  if (typeof startDemoTour !== 'function') return;
  var ma = '';
  try { ma = sessionStorage.getItem('cd6_demo_tour') || ''; } catch (e) { return; }
  if (!ma) return;
  // Cờ chỉ dùng một lần: xóa ngay để không kích hoạt nhầm về sau.
  try { sessionStorage.removeItem('cd6_demo_tour'); } catch (e) { /* bỏ qua */ }
  if (!S.me || String(S.me.maDD) !== String(ma)) return;
  setTimeout(function () {
    if (S.token && S.me && typeof startDemoTour === 'function') startDemoTour(S.me);
  }, 800);
}

function go(view) {
  if (!VIEWS[view]) view = 'home';
  S.view = view;
  S.pendingSync = false;
  stopQr();
  stopCamera();
  closeModal();
  $$('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
  var screen = $('#screen');
  screen.innerHTML = skeleton();
  try {
    screen.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) { /* môi trường không hỗ trợ cuộn */ }
  VIEWS[view]().then(function (html) {
    if (S.view !== view) return;
    screen.innerHTML = html;
    if (AFTER[view]) AFTER[view]();
  }).catch(function (e) {
    screen.innerHTML = errorBox(e.message || String(e));
  });
  // Làm mới thanh điểm trên header sau khi có dữ liệu
  setTimeout(refreshHeaderPoints, 700);
}

function refreshHeaderPoints() {
  var pill = $('.points-pill');
  if (!pill || !S.me) return;
  if (S.me.cap === 0) {
    pill.innerHTML = icon('shield', 13) + ' C0';
    return;
  }
  pill.innerHTML = icon('star', 13) + ' ' + S.me.diem + ' <small>điểm</small>';
}

function skeleton() {
  return '<div class="card sk-card skeleton"></div>' +
    '<div class="kpi-grid">' + [1, 2, 3, 4].map(function () { return '<div class="skeleton" style="height:92px"></div>'; }).join('') + '</div>' +
    '<div class="card mt-16"><div class="skeleton sk-line" style="width:45%"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:70%"></div></div>';
}

function errorBox(msg) {
  return '<div class="card center" style="padding:28px 18px">' +
    '<div style="color:#B42318;margin-bottom:8px">' + icon('alert', 30) + '</div>' +
    '<b>Không tải được dữ liệu</b>' +
    '<p class="small muted mt-8">' + esc(msg) + '</p>' +
    '<button class="btn btn-ghost btn-sm mt-12" data-act="nav" data-view="' + esc(S.view) + '">Thử lại</button></div>';
}

/* ------------------------------------------------------------------ */
/* 8. COMPONENT DÙNG CHUNG                                            */
/* ------------------------------------------------------------------ */

function kpiCard(k) {
  var val = k.money ? fmtMoney(k.value) : esc(k.value);
  return '<div class="kpi tone-' + (k.tone || 'red') + '">' +
    '<div class="kpi-top"><div class="kpi-icon">' + icon(k.icon || 'star', 17) + '</div></div>' +
    '<div class="kpi-label">' + esc(k.label) + '</div>' +
    '<div class="kpi-value">' + val + (k.unit ? '<small>' + esc(k.unit) + '</small>' : '') + '</div>' +
    '<div class="kpi-hint">' + esc(k.hint || '') + '</div></div>';
}

function progressBar(pct, cls) {
  pct = Math.max(0, Math.min(100, Number(pct) || 0));
  return '<div class="progress ' + (cls || '') + '"><div class="progress-bar" style="width:' + pct + '%"></div></div>';
}

function emptyBox(text, ic) {
  return '<div class="empty">' + icon(ic || 'inbox', 30) + '<div>' + esc(text) + '</div></div>';
}

function badge(text, tone) {
  return '<span class="badge badge-' + (tone || 'grey') + '">' + esc(text) + '</span>';
}

function statusBadge(st) {
  var map = {
    'Đã xác nhận': 'green', 'Đã duyệt': 'green', 'Hoàn thành': 'green', 'Đang hoạt động': 'green', 'Đã cấp': 'green',
    'Chờ duyệt': 'orange', 'Chờ cấp': 'orange', 'Chờ xác nhận': 'orange', 'Đang mở': 'blue',
    'Từ chối': 'red', 'Đã kết thúc': 'grey', 'Chưa cấp': 'grey', 'Chưa đề cử': 'grey'
  };
  return badge(st, map[st] || 'grey');
}

function sectionTitle(text, right) {
  return '<div class="section-title"><span>' + esc(text) + '</span>' + (right || '') + '</div>';
}

function quickActions(items) {
  return '<div class="quick-grid">' + items.map(function (q) {
    return '<button class="quick" data-act="nav" data-view="' + q.view + '">' +
      '<span class="quick-ico" style="background:' + (q.bg || '#FDEDEE') + ';color:' + (q.color || '#B31217') + '">' + icon(q.icon, 18) + '</span>' +
      '<span>' + esc(q.label) + '</span></button>';
  }).join('') + '</div>';
}
