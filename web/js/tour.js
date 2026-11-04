/* ==================================================================
   tour.js — Hướng dẫn trải nghiệm từng bước cho tài khoản demo.
   Khi nhân viên chọn một tài khoản trải nghiệm ở màn hình đăng nhập,
   sau khi đăng nhập hệ thống sẽ tự động mở lớp hướng dẫn: tô sáng
   đúng vị trí chức năng, kèm chú thích và đếm ngược 8 giây để tự
   chuyển sang bước tiếp theo cho đến khi hết chức năng của tài khoản.
   ================================================================== */

'use strict';

function tourDelay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* ------------------------------------------------------------------ */
/* KỊCH BẢN HƯỚNG DẪN THEO CẤP TÀI KHOẢN                             */
/* ------------------------------------------------------------------ */

/** Sinh kịch bản hướng dẫn chung cho một cấp tài khoản (0–4). */
function buildTourForCap(cap, roleName, maDD) {
  var steps = [];
  // Đích ưu tiên: khối số liệu, nếu không có thì thẻ nội dung đầu tiên (bỏ khung xương).
  var MAIN = '#screen .kpi-grid, #screen .card:not(.sk-card)';

  function push(step) { steps.push(step); }

  push({
    tag: 'Bắt đầu',
    title: 'Xin chào ' + roleName + '!',
    html: 'Bạn đang dùng <b>tài khoản trải nghiệm ' + esc(maDD) + '</b>. Hệ thống sẽ tự động hướng dẫn từng bước và chuyển tiếp sau <b>8 giây</b>. ' +
      'Bạn có thể bấm <b>Tiếp</b> / <b>Trước</b>, hoặc <b>Bỏ qua</b> bất cứ lúc nào.'
  });

  if (cap === 0) {
    push({
      tag: 'Hệ thống', view: 'system', target: '.sys-head',
      title: 'Trung tâm điều hành Cấp 0',
      body: 'Đây là màn hình chính của quản trị viên. Bên phải có nút đổi mật khẩu quản trị.'
    });
    push({
      tag: 'Hệ thống', view: 'system', target: '#screen .kpi-grid',
      title: 'Chỉ số toàn hệ thống',
      body: 'Bốn thẻ số liệu tóm tắt: số Chi đoàn Ấp, số đoàn viên, số tài khoản và số bản ghi nhật ký.'
    });
    push({
      tag: 'Hệ thống', view: 'system', target: '.sys-tabs',
      title: '8 nhóm chức năng quản trị',
      body: 'Toàn bộ nghiệp vụ được chia thành 8 tab. Hướng dẫn sẽ lần lượt mở và giải thích từng tab.'
    });
    [
      ['donVi', 'Quản lý Đơn vị', 'Thêm/sửa Chi đoàn Ấp, chỉ tiêu đoàn viên và gán Bí thư phụ trách.'],
      ['cauHinh', 'Cấu hình hệ thống', 'Điều chỉnh mức điểm, đoàn phí, tên đơn vị và các tham số vận hành.'],
      ['taiKhoan', 'Quản lý Tài khoản', 'Tạo, khóa, cấp lại mật khẩu/PIN và xem thùng rác tài khoản.'],
      ['baoCao', 'Báo cáo - Thống kê', 'Kết xuất báo cáo theo khoảng ngày, theo Ấp và theo loại nghiệp vụ.'],
      ['nhacViec', 'Nhắc việc - Thông báo', 'Gửi thông báo, nhắc việc tới đoàn viên và các Chi đoàn Ấp.'],
      ['duLieu', 'Sao lưu - Phục hồi', 'Tạo bản sao lưu toàn bộ dữ liệu và phục hồi khi cần thiết.'],
      ['sucKhoe', 'Sức khỏe hệ thống', 'Kiểm tra kết nối máy chủ, dữ liệu và cảnh báo bất thường.'],
      ['nhatKy', 'Nhật ký thao tác', 'Tra cứu mọi thao tác trên hệ thống theo người dùng và thời gian.']
    ].forEach(function (t) {
      push({
        tag: 'Hệ thống',
        target: '.sys-tab[data-tab="' + t[0] + '"]',
        title: 'Tab: ' + t[1],
        body: t[2],
        before: function () { S.data.sysTab = t[0]; go('system'); }
      });
    });
    push({
      tag: 'Tổng quan', view: 'home', target: '.quick-grid',
      title: 'Bảng điều khiển chung',
      body: 'Lối tắt tới các nghiệp vụ toàn hệ thống dành cho quản trị viên.'
    });
  } else {
    push({
      tag: 'Tổng quan', view: 'home', target: '.hero-card',
      title: 'Thẻ tổng quan của bạn',
      body: 'Hiển thị lời chào, chức vụ và tiến độ điểm rèn luyện so với mục tiêu năm.'
    });
    push({
      tag: 'Tổng quan', view: 'home', target: '#screen .kpi-grid',
      title: 'Các chỉ số chính',
      body: cap <= 2
        ? 'Chỉ số tổng hợp toàn Xã: đoàn viên, điểm rèn luyện, đoàn phí và mức độ tập hợp.'
        : cap === 3
          ? 'Chỉ số của Chi đoàn Ấp bạn phụ trách: số đoàn viên, điểm trung bình và tỷ lệ chuyên cần.'
          : 'Chỉ số cá nhân: điểm rèn luyện, chuyên cần, đoàn phí và tiến độ Ươm mầm Đỏ.'
    });
    if (cap <= 3) {
      push({
        tag: 'Tổng quan', view: 'home', target: '.quick-grid',
        title: 'Truy cập nhanh',
        body: 'Các lối tắt tới nghiệp vụ bạn dùng nhiều nhất, chỉ với một lần chạm.'
      });
    }
  }

  push({
    tag: 'Điểm danh', view: 'attendance', target: MAIN,
    title: 'Điểm danh QR động',
    body: cap <= 3
      ? 'Mở phiên điểm danh và chiếu mã QR tự đổi token mỗi 60 giây để chống gian lận. Phía dưới là lịch sử phiên và rà soát chuyên cần.'
      : 'Quét mã QR hiển thị trên màn hình Bí thư Chi đoàn Ấp. Chọn hình thức Họp trực tiếp / Hybrid / Zalo để nhận mức điểm tương ứng.'
  });
  push({
    tag: 'Điểm danh', view: 'attendance',
    target: cap <= 3
      ? function () { return document.querySelector('[data-act="new-session"]') || document.querySelector('[data-act="close-session"]') || document.querySelector('#screen .card:not(.sk-card)'); }
      : '[data-act="start-cam"]',
    title: cap <= 3 ? 'Nút mở / kết thúc phiên' : 'Nút bật camera quét QR',
    body: cap <= 3
      ? 'Bấm nút này để mở phiên điểm danh mới (hoặc kết thúc phiên đang mở).'
      : 'Bấm để bật camera và đưa mã QR vào khung. Có thể nhập mã token thủ công nếu camera không dùng được.'
  });

  push({
    tag: 'Ươm mầm Đỏ', view: 'uommam', target: '#screen .kpi-grid',
    title: 'Ươm mầm Đỏ',
    body: cap <= 2
      ? 'Theo dõi 3 tiêu chuẩn và phê duyệt hồ sơ đoàn viên ưu tú vào nguồn Cảm tình Đảng của Đảng bộ Xã.'
      : cap === 3
        ? 'Đề cử đoàn viên hội đủ 3 tiêu chuẩn vào nguồn phát triển Đảng.'
        : 'Xem lộ trình của bạn: đã có Thẻ Đoàn viên, đủ điểm rèn luyện và hoàn thành tự đánh giá 360° chưa.'
  });

  push({
    tag: 'Đoàn phí', view: 'fee', target: MAIN,
    title: 'Đoàn phí số VietQR',
    body: cap === 4
      ? 'Tạo mã VietQR cá nhân hóa để đóng đoàn phí. Hoàn thành đoàn phí được cộng điểm và gắn huy hiệu trên Thẻ Đoàn viên.'
      : 'Theo dõi tổng thu - chi - tồn quỹ, xác nhận giao dịch đang chờ và công khai Sổ quỹ minh bạch 100%.'
  });

  push({
    tag: 'Thẻ Đoàn viên', view: 'card', target: '.e-card',
    title: 'Thẻ Đoàn viên điện tử',
    body: cap === 4
      ? 'Thẻ số tích hợp QR định danh, huy hiệu và chữ ký số, kèm đầy đủ thông tin đoàn viên.'
      : 'Tra cứu và tích hợp Thẻ Đoàn viên cho đoàn viên trong phạm vi quản lý (+20 điểm cho mỗi thẻ).'
  });
  if (cap === 4) {
    push({
      tag: 'Thẻ Đoàn viên', view: 'card', target: '[data-act="eval360"]',
      title: 'Tiện ích thẻ số',
      body: 'Từ đây bạn có thể Tự đánh giá 360°, cấp E-Cert và In / Lưu thẻ thành PDF.'
    });
  }

  push({
    tag: 'SOS & Bản đồ', view: 'sos', target: '#sos-map',
    title: 'Bản đồ tình nguyện & SOS',
    body: cap === 4
      ? 'Bản đồ hiển thị phản ánh và nhiệm vụ quanh bạn theo tọa độ GPS thực tế.'
      : 'Bản đồ hiển thị phản ánh của đoàn viên và các nhiệm vụ tình nguyện trên địa bàn.'
  });
  push({
    tag: 'SOS & Bản đồ', view: 'sos',
    target: cap === 4
      ? 'form[data-form="sos"]'
      : function () { return document.querySelector('[data-act="sos-to-mission"]') || document.querySelector('[data-act="checkin-mission"]') || document.querySelector('#screen .card:not(.sk-card)'); },
    title: cap === 4 ? 'Gửi phản ánh hiện trường' : 'Xử lý phản ánh / nhiệm vụ',
    body: cap === 4
      ? 'Chọn loại hiện trường, mô tả và gửi kèm tọa độ GPS để nhận điểm Dân vận khéo; bên dưới là nhiệm vụ để check-in.'
      : 'Duyệt phản ánh thành nhiệm vụ tình nguyện, hoặc theo dõi các lượt check-in GPS của đoàn viên.'
  });

  push({
    tag: 'Học tập & AI', view: 'learn', target: '.segmented',
    title: 'Học tập & Trợ lý AI',
    body: cap === 4
      ? 'Ba phân khu: Đấu trường Quiz, Trợ lý AI 24/7 và (với cán bộ) công cụ soạn văn bản.'
      : 'Chuyển giữa Đấu trường Quiz, Trợ lý AI 24/7 và công cụ soạn văn bản Đoàn - Đảng.'
  });
  push({
    tag: 'Học tập & AI', view: 'learn',
    target: cap <= 3 ? 'form[data-form="ai-script"]' : '#chat-box',
    title: cap <= 3 ? 'AI soạn văn bản Đoàn - Đảng' : 'Trợ lý AI trả lời 24/7',
    body: cap <= 3
      ? 'Nhập chủ đề và thời lượng để tạo kịch bản điều hành họp; có thể trích biên bản giới thiệu đoàn viên ưu tú.'
      : 'Nhắn tin để tra cứu điểm, cảnh báo, đoàn phí, điểm danh… Trợ lý chạy theo kịch bản nghiệp vụ trên Google Sheets.',
    before: function () { S.learnTab = cap <= 3 ? 'doc' : 'ai'; go('learn'); }
  });

  if (cap <= 3) {
    push({
      tag: 'Quản trị', view: 'admin', target: MAIN,
      title: 'Khu Quản trị',
      body: cap <= 2
        ? 'Duyệt yêu cầu cấp lại PIN và phê duyệt hồ sơ Ươm mầm Đỏ trên phạm vi quản lý.'
        : 'Ủy quyền tạm thời cho Phó Bí thư khi bạn đi công tác.'
    });
    push({
      tag: 'Quản trị', view: 'admin', target: 'form[data-form="member-add"]',
      title: 'Thêm đoàn viên',
      body: 'Nhập họ tên, số điện thoại và ngày sinh để tạo tài khoản đoàn viên; mã định danh và PIN mặc định được cấp tự động.'
    });
  }

  push({
    tag: 'Điều hướng',
    target: '.bottomnav',
    title: 'Điều hướng nhanh',
    body: 'Dùng thanh dưới cùng để chuyển giữa các phân hệ bất cứ lúc nào.'
  });

  push({
    tag: 'Kết thúc',
    title: 'Hoàn tất hướng dẫn',
    html: 'Bạn đã xem hết các chức năng chính của tài khoản <b>' + esc(maDD) + '</b>. ' +
      'Nhấn biểu tượng <b>bóng đèn</b> trên thanh trên cùng để xem lại hướng dẫn bất cứ lúc nào.'
  });

  return steps;
}

var TOURS = {
  'ADMIN': buildTourForCap(0, 'Quản trị viên hệ thống', 'ADMIN'),
  'CT_HOILHTN': buildTourForCap(1, 'đồng chí Chủ tịch Hội LHTN Xã', 'CT_HOILHTN'),
  'BT_CHIBO_XA': buildTourForCap(2, 'đồng chí Bí thư Chi bộ Xã', 'BT_CHIBO_XA'),
  'BT_AP01': buildTourForCap(3, 'đồng chí Bí thư Chi đoàn Ấp', 'BT_AP01'),
  'DV01': buildTourForCap(4, 'đoàn viên', 'DV01')
};
TOURS['cap0'] = TOURS['ADMIN'];
TOURS['cap1'] = TOURS['CT_HOILHTN'];
TOURS['cap2'] = TOURS['BT_CHIBO_XA'];
TOURS['cap3'] = TOURS['BT_AP01'];
TOURS['cap4'] = TOURS['DV01'];

function tourStepsFor(maDD, cap) {
  return TOURS[maDD] || TOURS['cap' + cap] || [];
}

/** Có kịch bản hướng dẫn cho tài khoản đang đăng nhập không? */
function demoAccountHasTour() {
  if (!S.me) return false;
  return tourStepsFor(S.me.maDD, S.me.cap).length > 0;
}

/* ------------------------------------------------------------------ */
/* BỘ MÁY HƯỚNG DẪN                                                   */
/* ------------------------------------------------------------------ */

var TOUR_STEP_MS = 8000;

var TOUR_RUN = {
  active: false,
  steps: [],
  idx: 0,
  remain: 0,
  timer: null,
  paused: false,
  targetEl: null,
  targetSelector: null,
  root: null,
  spot: null,
  tip: null,
  onKey: null,
  onAdjust: null
};

function startDemoTour(profile) {
  var me = profile || S.me || {};
  var steps = tourStepsFor(me.maDD, me.cap);
  if (!steps.length) {
    toast('Tài khoản này chưa có kịch bản hướng dẫn trải nghiệm.', 'err');
    return;
  }
  stopDemoTour();
  TOUR_RUN.steps = steps;
  TOUR_RUN.idx = 0;
  TOUR_RUN.active = true;
  buildTourDom();
  bindTourEvents();
  showTourStep();
  toast('Bắt đầu hướng dẫn · ' + (me.hoTen || me.maDD), 'ok');
}

function stopDemoTour() {
  clearTourTimer();
  unbindTourEvents();
  if (TOUR_RUN.root && TOUR_RUN.root.parentNode) TOUR_RUN.root.parentNode.removeChild(TOUR_RUN.root);
  TOUR_RUN.root = null;
  TOUR_RUN.spot = null;
  TOUR_RUN.tip = null;
  TOUR_RUN.active = false;
  TOUR_RUN.targetEl = null;
  TOUR_RUN.targetSelector = null;
  TOUR_RUN.steps = [];
  TOUR_RUN.idx = 0;
}

function endDemoTour(finished) {
  var name = (S.me && (S.me.hoTen || S.me.maDD)) || '';
  stopDemoTour();
  if (finished) toast('Đã hoàn tất hướng dẫn trải nghiệm của ' + name + '.', 'ok');
}

function buildTourDom() {
  var old = document.getElementById('tour-root');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  var root = document.createElement('div');
  root.id = 'tour-root';
  root.className = 'tour-root';
  root.innerHTML = '<div class="tour-spot" id="tour-spot"></div>' +
    '<div class="tour-tip" id="tour-tip"></div>';
  document.body.appendChild(root);
  TOUR_RUN.root = root;
  TOUR_RUN.spot = root.querySelector('#tour-spot');
  TOUR_RUN.tip = root.querySelector('#tour-tip');
}

async function showTourStep() {
  if (!TOUR_RUN.active) return;
  var step = TOUR_RUN.steps[TOUR_RUN.idx];
  if (!step) { endDemoTour(true); return; }

  clearTourTimer();
  TOUR_RUN.paused = false;
  TOUR_RUN.targetEl = null;
  TOUR_RUN.targetSelector = step.target || null;
  if (TOUR_RUN.spot) TOUR_RUN.spot.style.display = 'none';

  // Hiện chú thích ngay ở giữa để người xem luôn đọc được nội dung
  // trong lúc màn hình đang tải, rồi mới di chuyển tới đúng vị trí.
  renderTourTip(step);
  showTipCentered();

  // Mở đúng màn hình / tab trước khi tô sáng.
  try { if (step.view && S.view !== step.view) go(step.view); } catch (e) { /* bỏ qua */ }
  try { if (typeof step.before === 'function') step.before(); } catch (e) { /* bỏ qua */ }

  var el = await resolveTourTarget(step.target);
  if (!TOUR_RUN.active || TOUR_RUN.steps[TOUR_RUN.idx] !== step) return;

  TOUR_RUN.targetEl = el;
  if (el && el.scrollIntoView) {
    // Cuộn tức thời để vị trí tô sáng khớp ngay, tránh "nhảy" trong lúc cuộn mượt.
    try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { try { el.scrollIntoView(); } catch (e2) { /* bỏ qua */ } }
    await tourDelay(140);
    if (!TOUR_RUN.active || TOUR_RUN.steps[TOUR_RUN.idx] !== step) return;
  }

  positionTour(el);
  startTourTimer();

  // Căn lại lần cuối sau khi bố cục ổn định (ảnh/QR/bản đồ vừa vẽ xong).
  var settleAt = TOUR_RUN.idx;
  setTimeout(function () {
    if (!TOUR_RUN.active || TOUR_RUN.idx !== settleAt) return;
    var cur = TOUR_RUN.targetEl;
    if (cur && cur.isConnected === false && TOUR_RUN.targetSelector) cur = requeryTourTarget();
    TOUR_RUN.targetEl = cur;
    positionTour(cur);
  }, 420);
}

/** Giữ chú thích ở giữa màn hình trong lúc chờ mục tiêu. */
function showTipCentered() {
  var tip = TOUR_RUN.tip;
  if (!tip) return;
  tip.classList.add('tour-tip-center');
  tip.style.top = '';
  tip.style.left = '';
  tip.style.visibility = 'visible';
}

function requeryTourTarget() {
  var selector = TOUR_RUN.targetSelector;
  if (!selector) return null;
  try { return (typeof selector === 'function') ? selector() : document.querySelector(selector); } catch (e) { return null; }
}

/** Chờ phần tử đích xuất hiện (màn hình đang tải dữ liệu bất đồng bộ). */
function resolveTourTarget(selector) {
  if (!selector) return Promise.resolve(null);
  return new Promise(function (resolve) {
    var t0 = Date.now();
    (function check() {
      var el = null;
      try { el = (typeof selector === 'function') ? selector() : document.querySelector(selector); } catch (e) { el = null; }
      if (el && isTourVisible(el)) return resolve(el);
      if (Date.now() - t0 > 5000) return resolve(null);
      setTimeout(check, 120);
    })();
  });
}

function isTourVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  if (el.isConnected === false) return false;
  // Bỏ qua khung xương (skeleton) đang tải để không tô sáng nhầm.
  if (el.classList && (el.classList.contains('skeleton') || el.classList.contains('sk-card'))) return false;
  var r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

function positionTour(el) {
  var spot = TOUR_RUN.spot;
  var tip = TOUR_RUN.tip;
  if (!spot || !tip) return;
  tip.style.visibility = 'hidden';

  if (el && isTourVisible(el)) {
    var pad = 8;
    var r = el.getBoundingClientRect();
    spot.style.display = 'block';
    spot.style.top = (r.top - pad) + 'px';
    spot.style.left = (r.left - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';
    tip.classList.remove('tour-tip-center');
    placeTipNear(r);
  } else {
    spot.style.display = 'none';
    tip.classList.add('tour-tip-center');
    tip.style.top = '';
    tip.style.left = '';
  }
  tip.style.visibility = 'visible';
}

function placeTipNear(r) {
  var tip = TOUR_RUN.tip;
  if (!tip) return;
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var margin = 12;
  tip.style.top = '0px';
  tip.style.left = '0px';
  var tw = tip.offsetWidth;
  var th = tip.offsetHeight;

  var top;
  var below = r.bottom + 14;
  if (below + th <= vh - margin) top = below;
  else if (r.top - 14 - th >= margin) top = r.top - 14 - th;
  else top = Math.max(margin, Math.min(vh - th - margin, r.top + r.height / 2 - th / 2));

  var left = r.left + r.width / 2 - tw / 2;
  left = Math.max(margin, Math.min(vw - tw - margin, left));

  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
}

function renderTourTip(step) {
  var tip = TOUR_RUN.tip;
  if (!tip) return;
  var total = TOUR_RUN.steps.length;
  var n = TOUR_RUN.idx + 1;
  var isLast = n >= total;
  tip.style.visibility = 'hidden';
  tip.innerHTML =
    '<div class="tour-tip-top">' +
      '<span class="tour-step">Bước ' + n + '/' + total + '</span>' +
      '<button class="tour-x" type="button" data-tour="close" aria-label="Đóng hướng dẫn">' + icon('x', 15) + '</button>' +
    '</div>' +
    (step.tag ? '<div class="tour-tag">' + esc(step.tag) + '</div>' : '') +
    '<h4 class="tour-title">' + esc(step.title || '') + '</h4>' +
    '<p class="tour-body">' + (step.html || esc(step.body || '')) + '</p>' +
    '<div class="tour-meta">' +
      '<div class="tour-count">Tự động chuyển sau <b class="tour-sec">8</b> giây</div>' +
      '<div class="tour-bar"><i style="width:100%"></i></div>' +
    '</div>' +
    '<div class="tour-actions">' +
      '<button class="tour-btn ghost" type="button" data-tour="close">Bỏ qua</button>' +
      '<span class="grow"></span>' +
      '<button class="tour-btn ghost" type="button" data-tour="prev"' + (TOUR_RUN.idx === 0 ? ' disabled' : '') + '>‹ Trước</button>' +
      '<button class="tour-btn primary" type="button" data-tour="next">' + (isLast ? 'Hoàn tất' : 'Tiếp ›') + '</button>' +
    '</div>';
}

function startTourTimer() {
  clearTourTimer();
  TOUR_RUN.remain = TOUR_STEP_MS;
  updateTourCountdown();
  TOUR_RUN.timer = setInterval(function () {
    if (TOUR_RUN.paused) return;
    TOUR_RUN.remain -= 100;
    if (TOUR_RUN.remain <= 0) {
      TOUR_RUN.remain = 0;
      updateTourCountdown();
      nextTourStep();
      return;
    }
    updateTourCountdown();
  }, 100);
}

function clearTourTimer() {
  if (TOUR_RUN.timer) {
    clearInterval(TOUR_RUN.timer);
    TOUR_RUN.timer = null;
  }
}

function updateTourCountdown() {
  var tip = TOUR_RUN.tip;
  if (!tip) return;
  var sec = Math.max(0, Math.ceil(TOUR_RUN.remain / 1000));
  var num = tip.querySelector('.tour-sec');
  var bar = tip.querySelector('.tour-bar > i');
  if (num) num.textContent = sec;
  if (bar) bar.style.width = Math.max(0, Math.min(100, TOUR_RUN.remain / TOUR_STEP_MS * 100)) + '%';
}

function nextTourStep() {
  if (!TOUR_RUN.active) return;
  clearTourTimer();
  if (TOUR_RUN.idx >= TOUR_RUN.steps.length - 1) { endDemoTour(true); return; }
  TOUR_RUN.idx += 1;
  showTourStep();
}

function prevTourStep() {
  if (!TOUR_RUN.active) return;
  clearTourTimer();
  if (TOUR_RUN.idx <= 0) { showTourStep(); return; }
  TOUR_RUN.idx -= 1;
  showTourStep();
}

function bindTourEvents() {
  var tip = TOUR_RUN.tip;
  if (tip) {
    tip.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tour]');
      if (!b) return;
      e.preventDefault();
      var action = b.getAttribute('data-tour');
      if (action === 'next') nextTourStep();
      else if (action === 'prev') prevTourStep();
      else if (action === 'close') endDemoTour(false);
    });
    // Giữ chuột trên chú thích để tạm dừng đếm ngược.
    tip.addEventListener('mouseenter', function () { TOUR_RUN.paused = true; });
    tip.addEventListener('mouseleave', function () { TOUR_RUN.paused = false; });
  }

  TOUR_RUN.onKey = function (e) {
    if (!TOUR_RUN.active) return;
    if (e.key === 'Escape') endDemoTour(false);
    else if (e.key === 'ArrowRight') nextTourStep();
    else if (e.key === 'ArrowLeft') prevTourStep();
  };
  TOUR_RUN.onAdjust = function () {
    if (!TOUR_RUN.active) return;
    var el = TOUR_RUN.targetEl;
    // Màn hình có thể vừa được vẽ lại → tìm lại đúng phần tử theo selector.
    if ((!el || el.isConnected === false) && TOUR_RUN.targetSelector) {
      el = requeryTourTarget();
      TOUR_RUN.targetEl = el;
    }
    if (el && el.isConnected !== false) positionTour(el);
  };
  document.addEventListener('keydown', TOUR_RUN.onKey);
  window.addEventListener('resize', TOUR_RUN.onAdjust);
  window.addEventListener('scroll', TOUR_RUN.onAdjust, true);
}

function unbindTourEvents() {
  if (TOUR_RUN.onKey) document.removeEventListener('keydown', TOUR_RUN.onKey);
  if (TOUR_RUN.onAdjust) {
    window.removeEventListener('resize', TOUR_RUN.onAdjust);
    window.removeEventListener('scroll', TOUR_RUN.onAdjust, true);
  }
  TOUR_RUN.onKey = null;
  TOUR_RUN.onAdjust = null;
}

/* ------------------------------------------------------------------ */
/* GẮN HÀNH ĐỘNG                                                      */
/* ------------------------------------------------------------------ */

ACTIONS['start-tour'] = function () { startDemoTour(S.me); };

window.startDemoTour = startDemoTour;
