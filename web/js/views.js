/* ==================================================================
   views.js — Các màn hình: Tổng quan, Điểm danh, Ươm mầm Đỏ, Đoàn phí
   ================================================================== */

var VIEWS = {};
var AFTER = {};

/* ------------------------------------------------------------------ */
/* TỔNG QUAN                                                          */
/* ------------------------------------------------------------------ */

VIEWS.home = async function () {
  var d = await API.call('home.summary');
  S.data.home = d;
  var me = S.me;
  var thongBao = { items: [] };
  try { thongBao = await API.call('notify.my'); } catch (e) { /* không chặn trang Tổng quan */ }
  S.data.notify = thongBao;

  var hero =
    '<div class="card hero-card">' +
      '<div class="row-between">' +
        '<div>' +
          '<div class="hero-greet">Xin chào,</div>' +
          '<div class="hero-name">' + esc(me.hoTen) + '</div>' +
          '<div class="hero-tag">' + icon('shield', 11) + ' ' + esc(capShort(me.cap)) + ' · ' + esc(me.chucVu) + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div class="hero-greet">Điểm rèn luyện</div>' +
          '<div style="font-size:26px;font-weight:800;line-height:1.1">' + d.tienDo.diem + '</div>' +
          '<div class="hero-greet">/ ' + d.tienDo.mucTieu + ' điểm</div>' +
        '</div>' +
      '</div>' +
      '<div class="progress-wrap">' +
        '<div class="progress-hd"><span>Lộ trình ' + (me.cap === 4 ? 'Ươm mầm Đỏ' : 'thi đua Chi đoàn') + '</span><span>' + d.tienDo.phanTram + '%</span></div>' +
        progressBar(d.tienDo.phanTram) +
      '</div>' +
    '</div>';

  var kpis = '<div class="kpi-grid">' + d.kpi.map(kpiCard).join('') + '</div>';

  var quick = quickActions(me.cap <= 2 ? [
    { label: 'Duyệt PIN', view: 'admin', icon: 'shield' },
    { label: 'Ươm mầm Đỏ', view: 'uommam', icon: 'sprout', bg: '#FFF6DC', color: '#9A6B00' },
    { label: 'Sổ quỹ', view: 'fee', icon: 'wallet', bg: '#EBF1FF', color: '#1D4ED8' },
    { label: 'Bản đồ SOS', view: 'sos', icon: 'map', bg: '#FFF1E7', color: '#EA580C' },
    { label: 'Thẻ ĐV', view: 'card', icon: 'card', bg: '#E7F7F0', color: '#0E9F6E' },
    { label: 'Trợ lý AI', view: 'learn', icon: 'chat', bg: '#F4F6FB', color: '#344054' }
  ] : me.cap === 3 ? [
    { label: 'Mở phiên QR', view: 'attendance', icon: 'qr' },
    { label: 'Đoàn phí', view: 'fee', icon: 'wallet', bg: '#FFF6DC', color: '#9A6B00' },
    { label: 'Đề cử Đảng', view: 'uommam', icon: 'sprout', bg: '#FDEDEE', color: '#B31217' },
    { label: 'Duyệt SOS', view: 'sos', icon: 'alert', bg: '#FFF1E7', color: '#EA580C' },
    { label: 'Thêm ĐV', view: 'admin', icon: 'plus', bg: '#EBF1FF', color: '#1D4ED8' },
    { label: 'Kịch bản AI', view: 'learn', icon: 'bulb', bg: '#F4F6FB', color: '#344054' }
  ] : [
    { label: 'Quét QR', view: 'attendance', icon: 'qr' },
    { label: 'Đóng phí', view: 'fee', icon: 'wallet', bg: '#FFF6DC', color: '#9A6B00' },
    { label: 'Thẻ của tôi', view: 'card', icon: 'card', bg: '#E7F7F0', color: '#0E9F6E' },
    { label: 'Gửi SOS', view: 'sos', icon: 'alert', bg: '#FFF1E7', color: '#EA580C' },
    { label: 'Quiz Arena', view: 'learn', icon: 'flame', bg: '#EBF1FF', color: '#1D4ED8' },
    { label: 'Hỏi AI', view: 'learn', icon: 'chat', bg: '#F4F6FB', color: '#344054' }
  ]);

  /* Bảng so sánh Ấp */
  var apTable = '';
  if (d.apStats.length) {
    apTable = sectionTitle('Thi đua giữa các Chi đoàn Ấp', me.cap <= 2 ? '<span class="small muted">' + d.apStats.length + ' đơn vị</span>' : '') +
      '<div class="card"><div class="table-wrap"><table class="tb">' +
      '<thead><tr><th>Chi đoàn Ấp</th><th>ĐV</th><th>Điểm TB</th><th>Chuyên cần 30d</th><th>Đoàn phí</th></tr></thead><tbody>' +
      d.apStats.map(function (a) {
        return '<tr><td><div class="tb-ap">' + esc(a.tenAp) + '</div><div class="small muted">' + esc(a.maAp) + ' · chỉ tiêu ' + a.chiTieu + '</div></td>' +
          '<td>' + a.soDoanVien + '</td>' +
          '<td><b>' + a.diemTB + '</b></td>' +
          '<td><span class="mini-bar"><i style="width:' + a.tyLeChuyenCan + '%"></i></span> ' + a.tyLeChuyenCan + '%</td>' +
          '<td>' + a.tyLeDoanPhi + '%</td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  /* Cảnh báo vắng > 60 ngày */
  var alerts = '';
  if (me.cap !== 4) {
    alerts = sectionTitle('Cảnh báo sớm · Tập hợp đoàn viên',
      '<span class="badge badge-' + (d.canhBao.length ? 'orange' : 'green') + '">' + d.canhBao.length + ' trường hợp</span>');
    if (!d.canhBao.length) {
      alerts += '<div class="card"><div class="alert-row calm">' + icon('check', 18) +
        '<div><b>Không có đoàn viên vắng quá 60 ngày</b><span>Tỷ lệ tập hợp thực chất duy trì trên mức cam kết 85%.</span></div></div></div>';
    } else {
      alerts += '<div class="card">' + d.canhBao.map(function (c) {
        return '<div class="alert-row">' + icon('alert', 18) +
          '<div style="flex:1"><b>' + esc(c.hoTen) + ' · ' + esc(c.maAp) + '</b>' +
          '<span>Vắng ' + c.soNgayVang + ' ngày · ' + c.diem + ' điểm rèn luyện</span></div>' +
          '<button class="btn btn-ghost btn-sm" data-act="bot-alert" data-ma="' + esc(c.maDD) + '">Nhắc Zalo</button></div>';
      }).join('') + '</div>';
    }
  } else {
    alerts = '<div class="card">' +
      '<div class="card-hd"><div><div class="card-title">' + icon('bulb', 17) + ' Gợi ý cho bạn</div>' +
      '<div class="card-sub">Hành động nhỏ, điểm rèn luyện tăng đều</div></div></div>' +
      '<div class="list">' +
      (d.tienDo.diem < 300 ? '<div class="list-item"><div class="li-avatar red">' + icon('star', 16) + '</div><div class="li-main"><b>Còn ' + (300 - d.tienDo.diem) + ' điểm để đủ điều kiện Ươm mầm Đỏ</b><span>Tham gia sinh hoạt và hoàn thành đoàn phí năm</span></div></div>' : '<div class="list-item"><div class="li-avatar green">' + icon('check', 16) + '</div><div class="li-main"><b>Bạn đã đạt mốc 300 điểm</b><span>Hãy hoàn thiện tự đánh giá 360° để được đề cử</span></div></div>') +
      '<div class="list-item"><div class="li-avatar">' + icon('qr', 16) + '</div><div class="li-main"><b>Điểm danh bằng QR động</b><span>+10đ trực tiếp · +8đ Hybrid · +5đ kết nối Zalo</span></div></div>' +
      '<div class="list-item"><div class="li-avatar">' + icon('camera', 16) + '</div><div class="li-main"><b>Gửi phản ánh hiện trường</b><span>+10đ Dân vận khéo cho mỗi phản ánh được duyệt</span></div></div>' +
      '</div></div>';
  }

  /* Dòng hoạt động */
  var feed = sectionTitle('Hoạt động gần đây', '<span class="small muted">' + d.hoatDong.length + ' cập nhật</span>') +
    '<div class="card">' + (d.hoatDong.length ? '<div class="list">' + d.hoatDong.map(function (h) {
      return '<div class="list-item"><div class="li-avatar red">' + icon('star', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(h.hoTen) + ' · ' + esc(h.loai) + '</b>' +
        '<span>' + esc(h.ghiChu || '') + ' · ' + fmtDate(h.thoiGian) + '</span></div>' +
        '<div class="li-right"><span class="badge badge-green">+' + h.diem + 'đ</span></div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có hoạt động nào được ghi nhận.', 'clock')) + '</div>';

  /* Khối riêng cho cấp Xã (C1/C2) */
  var c1 = '';
  if (me.cap <= 2) {
    c1 = '<div class="card" style="background:linear-gradient(135deg,#FFFDF5,#FFF6DC);border-color:#F6E1A4">' +
      '<div class="card-hd"><div><div class="card-title">' + icon('shield', 17) + ' Trung tâm kiểm duyệt Cấp Xã</div>' +
      '<div class="card-sub">Toàn quyền phê duyệt nguồn Cảm tình Đảng và cấp lại mã PIN trên phạm vi toàn Xã</div></div>' +
      '<button class="btn btn-gold btn-sm" data-act="nav" data-view="admin">Mở quản trị</button></div>' +
      '<div class="note">Cơ chế Reset PIN tập trung: mã PIN mới chỉ hiển thị duy nhất trên bảng điều khiển của Cấp 0, Cấp 1 và Cấp 2.</div>' +
      '</div>';
  }

  /* Khối riêng cho Cấp 3 (Bí thư Chi đoàn Ấp) */
  if (me.cap === 3 && d.quyen.uyQuyen) {
    c1 = '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('users', 17) + ' Ủy quyền 24h</div>' +
      '<div class="card-sub">Duyệt điểm danh thay khi Bí thư Chi đoàn Ấp đi công tác</div></div></div>' +
      (d.quyen.uyQuyen.uyQuyen
        ? '<div class="alert-row"><b>Đang ủy quyền cho ' + esc(d.quyen.uyQuyen.hoTen) + '</b><span>Hiệu lực đến ' + fmtDate(d.quyen.uyQuyen.den) + '</span></div>'
        : '<p class="small muted">Chưa có ủy quyền đang hiệu lực. Bạn có thể ủy quyền cho cán bộ cùng Ấp tại tab Quản trị.</p>') +
      '<button class="btn btn-ghost btn-sm btn-block mt-8" data-act="nav" data-view="admin">Thiết lập ủy quyền</button></div>';
  }

  var notice = '';
  if (thongBao.items && thongBao.items.length) {
    notice = '<div class="card" style="background:linear-gradient(135deg,#FFFDF5,#FFF6DC);border-color:#F6E1A4">' +
      '<div class="card-hd"><div><div class="card-title">' + icon('chat', 17) + ' Thông báo mới</div>' +
      '<div class="card-sub">' + thongBao.items.length + ' thông báo dành cho bạn và Chi đoàn Ấp</div></div>' +
      '<span class="badge badge-gold">' + icon('send', 11) + ' Nhắc việc</span></div>' +
      '<div class="list">' + thongBao.items.slice(0, 3).map(function (n) {
        return '<div class="list-item"><div class="li-avatar red">' + icon('send', 15) + '</div>' +
          '<div class="li-main"><b>' + esc(n.tieuDe) + '</b>' +
          '<span>' + esc(n.noiDung) + '</span>' +
          '<span class="small muted">' + esc(fmtDate(n.luc)) + ' · ' + esc(n.kenh || 'inapp') + '</span></div></div>';
      }).join('') + '</div></div>';
  }

  return hero + notice + sectionTitle('Chỉ số điều hành', '<span class="small muted">' + fmtDate(new Date().toISOString()) + '</span>') +
    kpis + '<div class="mt-12">' + quick + '</div>' + c1 + apTable + alerts + feed;
};

/* ------------------------------------------------------------------ */
/* ĐIỂM DANH QR ĐỘNG                                                   */
/* ------------------------------------------------------------------ */

VIEWS.attendance = async function () {
  var d = await API.call('attendance.list');
  S.data.attendance = d;
  var me = S.me;
  var isMgr = me.cap <= 3;

  var head = sectionTitle('Điểm danh QR động',
    '<span class="badge badge-' + (d.tongVang ? 'orange' : 'green') + '">' + d.tongVang + ' ĐV cần nhắc</span>');

  var guide = '<div class="card" style="background:#F8FAFF;border-color:#DCE6FA">' +
    '<div class="row" style="align-items:flex-start"><div class="kpi-icon" style="background:#EBF1FF;color:#1D4ED8;flex:none">' + icon('bulb', 17) + '</div>' +
    '<div><b class="small">Mã QR tự đổi Token mỗi 60 giây</b>' +
    '<div class="small muted">Bắt buộc quét bằng camera trực tiếp. Ảnh chụp màn hình gửi qua Zalo sẽ hết hiệu lực ngay sau 60 giây.</div></div></div></div>';

  if (!isMgr) return head + memberScanner(d) + guide + historyBlock(d);

  var active = (d.phien || []).filter(function (p) { return p.TrangThai === 'Đang mở'; })[0];
  var apSelect = '';
  if (me.cap <= 2) {
    S.data.aps = S.data.aps || (await API.call('ap.list')).items;
    apSelect = '<div class="field"><label>Chi đoàn Ấp tổ chức</label><select class="input" id="ap-select">' +
      S.data.aps.map(function (a) { return '<option value="' + esc(a.MaAp) + '">' + esc(a.TenAp) + '</option>'; }).join('') +
      '</select></div>';
  }

  var manager =
    '<div class="card">' +
      '<div class="card-hd"><div><div class="card-title">' + icon('qr', 17) + ' Phiên điểm danh</div>' +
      '<div class="card-sub">' + (active ? 'Đang mở · chiếu mã QR cho đoàn viên quét' : 'Chưa có phiên nào đang mở') + '</div></div>' +
      (active ? '<button class="btn btn-danger btn-sm" data-act="close-session" data-id="' + esc(active.MaPhien) + '">Kết thúc</button>' : '') +
      '</div>' +
      (active
        ? '<div id="qr-live"><div class="qr-panel"><div class="empty">Đang tạo mã QR…</div></div></div>'
        : '<button class="btn btn-primary btn-block btn-lg" data-act="new-session">' + icon('plus', 17) + ' Mở phiên điểm danh mới</button>' +
          (apSelect ? '<div class="mt-12">' + apSelect + '</div>' : '')) +
    '</div>';

  var history = sectionTitle('Phiên gần đây') + '<div class="card">' +
    ((d.phien || []).length ? '<div class="list">' + d.phien.map(function (p) {
      return '<div class="list-item"><div class="li-avatar">' + icon('calendar', 16) + '</div>' +
        '<div class="li-main"><b>' + esc(p.TieuDe) + '</b><span>' + esc(p.MaAp) + ' · ' + fmtDate(p.BatDau) + '</span></div>' +
        '<div class="li-right">' + statusBadge(p.TrangThai) + '</div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có phiên điểm danh.', 'calendar')) + '</div>';

  var watch = sectionTitle('Rà soát chuyên cần', '<span class="small muted">Sắp xếp theo số ngày vắng</span>') +
    '<div class="card"><div class="list">' + d.items.slice(0, 12).map(function (m) {
      var txt = m.soNgayVang === null ? 'Chưa từng điểm danh' : 'Vắng ' + m.soNgayVang + ' ngày';
      return '<div class="list-item"><div class="li-avatar ' + (m.canhBao ? 'red' : 'green') + '">' + esc(initials(m.hoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(m.hoTen) + '</b><span>' + esc(m.maAp) + ' · ' + txt + '</span></div>' +
        '<div class="li-right">' + (m.canhBao ? badge('Cảnh báo', 'orange') : badge('Tốt', 'green')) + '</div></div>';
    }).join('') + '</div></div>';

  S.data.activeSession = active ? active.MaPhien : null;
  return head + manager + guide + history + watch;
};

function memberScanner() {
  var ht = S.data.hinhThuc || 'Trực tiếp';
  var opts = [
    { v: 'Trực tiếp', l: 'Họp trực tiếp', d: '+10đ' },
    { v: 'Hybrid', l: 'Báo cáo Hybrid', d: '+8đ' },
    { v: 'Zalo', l: 'Kết nối lại Zalo', d: '+5đ' }
  ];
  return '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('camera', 17) + ' Quét mã QR điểm danh</div>' +
    '<div class="card-sub">Đưa mã QR trên màn hình Bí thư Chi đoàn Ấp vào khung camera</div></div></div>' +
    '<div class="chip-row mb-12">' + opts.map(function (o) {
      return '<button class="chip ' + (ht === o.v ? 'active' : '') + '" data-act="hinh-thuc" data-value="' + o.v + '">' + o.l + ' <b>' + o.d + '</b></button>';
    }).join('') + '</div>' +
    '<div class="cam-box" id="cam-box" style="display:none">' +
      '<video id="cam" playsinline muted></video>' +
      '<div class="cam-overlay"><div class="cam-target"></div></div>' +
      '<div class="cam-hint">Căn mã QR vào giữa khung hình</div>' +
    '</div>' +
    (window.jsQR ? '' : '<div class="note mb-8">Không tải được thư viện camera — bạn có thể nhập mã token thủ công bên dưới.</div>') +
    '<button class="btn btn-primary btn-block btn-lg" data-act="start-cam">' + icon('camera', 17) + ' Bật camera quét QR</button>' +
    '<div class="center small muted mt-8">hoặc nhập mã token hiển thị dưới mã QR</div>' +
    '<form data-form="scan" class="mt-8">' +
      '<input class="input" name="token" placeholder="Nhập mã token (VD: A1B2C3D4E5)" style="text-transform:uppercase" required>' +
      '<button class="btn btn-ghost btn-block mt-8" type="submit">Xác nhận điểm danh</button>' +
    '</form>' +
  '</div>' +
  '<div class="card" style="background:linear-gradient(135deg,#FFFDF5,#FFF6DC);border-color:#F6E1A4">' +
    '<div class="row"><div class="kpi-icon" style="background:#F4B400;color:#fff;flex:none">' + icon('award', 18) + '</div>' +
    '<div class="small"><b>Quy đổi điểm:</b> Họp trực tiếp +10đ · Báo cáo Hybrid +8đ · Kết nối lại Zalo +5đ</div></div>' +
  '</div>';
}

function historyBlock(d) {
  if (!d.lichSu || !d.lichSu.length) return '';
  return sectionTitle('Lịch sử điểm danh của tôi') + '<div class="card"><div class="list">' +
    d.lichSu.map(function (h) {
      return '<div class="list-item"><div class="li-avatar green">' + icon('check', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(h.tieuDe) + '</b><span>' + esc(h.hinhThuc) + ' · ' + fmtDate(h.thoiGian) + '</span></div>' +
        '<div class="li-right"><span class="badge badge-green">+' + h.diem + 'đ</span></div></div>';
    }).join('') + '</div></div>';
}

/* ------------------------------------------------------------------ */
/* ƯƠM MẦM ĐỎ                                                         */
/* ------------------------------------------------------------------ */

VIEWS.uommam = async function () {
  var d = await API.call('uommam.list');
  S.data.uommam = d;
  var me = S.me;

  var stats = '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">' +
    '<div class="kpi tone-gold"><div class="kpi-top"><div class="kpi-icon">' + icon('sprout', 17) + '</div></div>' +
    '<div class="kpi-label">Đủ 3 tiêu chuẩn</div><div class="kpi-value">' + d.thongKe.duDieuKien + '<small>ĐV</small></div></div>' +
    '<div class="kpi tone-orange"><div class="kpi-top"><div class="kpi-icon">' + icon('clock', 17) + '</div></div>' +
    '<div class="kpi-label">Chờ cấp Xã duyệt</div><div class="kpi-value">' + d.thongKe.choDuyet + '<small>hồ sơ</small></div></div>' +
    '<div class="kpi tone-green"><div class="kpi-top"><div class="kpi-icon">' + icon('award', 17) + '</div></div>' +
    '<div class="kpi-label">Đã vào nguồn Đảng</div><div class="kpi-value">' + d.thongKe.daDuyet + '<small>ĐV</small></div></div>' +
    '</div>';

  var criteria = '<div class="card" style="background:#FFFDF5;border-color:#F6E1A4">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('star', 17) + ' Bộ 03 tiêu chuẩn tự động</div>' +
    '<div class="card-sub">Hệ thống tự mở khóa nút đề cử khi hội đủ điều kiện</div></div></div>' +
    '<div class="list">' +
      '<div class="list-item"><div class="li-avatar green">1</div><div class="li-main"><b>Thẻ Đoàn viên chính thức</b><span>Được Bí thư Chi đoàn Ấp hoặc cấp Xã tích hợp Thẻ điện tử</span></div></div>' +
      '<div class="list-item"><div class="li-avatar green">2</div><div class="li-main"><b>Tổng điểm rèn luyện ≥ ' + d.mucTieu + ' điểm/năm</b><span>Tích lũy trên bảng Google Sheets</span></div></div>' +
      '<div class="list-item"><div class="li-avatar green">3</div><div class="li-main"><b>Tự đánh giá 360° đạt Tốt / Xuất sắc</b><span>Kết quả do chính đoàn viên thực hiện</span></div></div>' +
    '</div></div>';

  if (me.cap === 4) {
    var it = d.items[0];
    if (!it) return '<div class="card">' + emptyBox('Chưa có dữ liệu hồ sơ của bạn.', 'sprout') + '</div>';
    var steps = [
      { ok: it.coThe, t: 'Tích hợp Thẻ Đoàn viên', d: it.maThe || 'Liên hệ Bí thư Chi đoàn Ấp để cấp thẻ (+20đ)' },
      { ok: it.datDiem, t: 'Điểm rèn luyện ≥ ' + d.mucTieu, d: 'Hiện có ' + it.diem + ' điểm' },
      { ok: it.dat360, t: 'Tự đánh giá 360° đạt Tốt/Xuất sắc', d: it.xepLoai360 }
    ];
    return sectionTitle('Lộ trình Ươm mầm Đỏ của tôi', statusBadge(it.trangThai)) + stats + criteria +
      '<div class="card"><div class="list">' + steps.map(function (s) {
        return '<div class="list-item"><div class="li-avatar ' + (s.ok ? 'green' : '') + '">' + icon(s.ok ? 'check' : 'x', 15) + '</div>' +
          '<div class="li-main"><b>' + esc(s.t) + '</b><span>' + esc(s.d) + '</span></div>' +
          '<div class="li-right">' + (s.ok ? badge('Đạt', 'green') : badge('Chưa đạt', 'orange')) + '</div></div>';
      }).join('') + '</div>' +
      '<button class="btn btn-ghost btn-block mt-12" data-act="nav" data-view="card">Hoàn thiện hồ sơ & tự đánh giá 360°</button></div>' +
      '<div class="note">Khi đạt đủ 3 tiêu chuẩn, Bí thư Chi đoàn Ấp sẽ nhận được thông báo và có thể đề cử bạn học lớp Cảm tình Đảng.</div>';
  }

  var list = '<div class="card">' + (d.items.length ? '<div class="list">' + d.items.map(function (m) {
    var acts = '';
    if (me.cap === 3) {
      acts = m.duDieuKien
        ? (m.trangThai === 'Chờ duyệt'
          ? badge('Chờ cấp Xã duyệt', 'orange')
          : m.trangThai === 'Đã duyệt' ? badge('Đã vào nguồn', 'green')
          : '<button class="btn btn-primary btn-sm" data-act="nominate" data-ma="' + esc(m.maDD) + '">Đề cử</button>')
        : badge('Chưa đủ ĐK', 'grey');
    } else if (me.cap <= 2) {
      acts = m.trangThai === 'Chờ duyệt'
        ? '<div class="row" style="gap:6px"><button class="btn btn-green btn-sm" data-act="approve-uom" data-ma="' + esc(m.maDD) + '">Duyệt</button>' +
          '<button class="btn btn-danger btn-sm" data-act="reject-uom" data-ma="' + esc(m.maDD) + '">Trả</button></div>'
        : statusBadge(m.trangThai);
    }
    return '<div class="list-item"><div class="li-avatar ' + (m.duDieuKien ? 'red' : '') + '">' + esc(initials(m.hoTen)) + '</div>' +
      '<div class="li-main"><b>' + esc(m.hoTen) + '</b>' +
      '<span>' + esc(m.maAp) + ' · ' + m.diem + ' điểm · ' + esc(m.xepLoai360) + '</span>' +
      '<div class="row mt-8" style="gap:5px;flex-wrap:wrap">' +
        badge(m.coThe ? 'Thẻ ĐV' : 'Thiếu thẻ', m.coThe ? 'green' : 'grey') +
        badge(m.datDiem ? '≥' + d.mucTieu + 'đ' : m.diem + 'đ', m.datDiem ? 'green' : 'grey') +
        badge(m.dat360 ? '360° Tốt' : '360° Chưa', m.dat360 ? 'green' : 'grey') +
      '</div></div>' +
      '<div class="li-right">' + acts + '</div></div>';
  }).join('') + '</div>' : emptyBox('Chưa có đoàn viên trong phạm vi quản lý.', 'users')) + '</div>';

  return sectionTitle('Phát triển Đảng · Ươm mầm Đỏ', '<span class="badge badge-gold">Nguồn Cảm tình Đảng</span>') +
    stats + criteria + sectionTitle('Danh sách đoàn viên ưu tú') + list;
};

/* ------------------------------------------------------------------ */
/* ĐOÀN PHÍ SỐ VIETQR                                                 */
/* ------------------------------------------------------------------ */

VIEWS.fee = async function () {
  if (S.me.cap === 4) return feeMember();
  return feeManager();
};

async function feeMember() {
  var d = await API.call('fee.my', {});
  S.data.feeMy = d;
  var tone = d.daDong ? 'green' : d.choDuyet ? 'orange' : 'red';
  var label = d.daDong ? 'Đã hoàn thành' : d.choDuyet ? 'Chờ Bí thư Chi đoàn Ấp xác nhận' : 'Chưa đóng';

  return sectionTitle('Đoàn phí số năm ' + d.nam, statusBadge(label)) +
    '<div class="card hero-card" style="background:linear-gradient(125deg,#0B3B2E,#0E9F6E 60%,#34D399)">' +
      '<div class="row-between"><div><div class="hero-greet">Đoàn phí năm ' + d.nam + '</div>' +
      '<div class="hero-name">' + fmtMoney(d.mucPhi) + '</div>' +
      '<div class="hero-tag">' + icon('wallet', 11) + ' VietQR cá nhân hóa</div></div>' +
      '<div style="text-align:right"><div class="hero-greet">Trạng thái</div><div style="font-weight:800;font-size:14px">' + esc(label) + '</div></div></div>' +
      '<div class="progress-wrap"><div class="progress-hd"><span>Tiến độ năm ' + d.nam + '</span><span>' + (d.daDong ? '100%' : d.choDuyet ? '90%' : '0%') + '</span></div>' +
      progressBar(d.daDong ? 100 : d.choDuyet ? 90 : 0) + '</div>' +
    '</div>' +
    '<div class="card">' +
      '<div class="card-hd"><div><div class="card-title">' + icon('qr', 17) + ' Thanh toán VietQR</div>' +
      '<div class="card-sub">Nội dung chuyển khoản: ' + esc(d.noiDung) + '</div></div></div>' +
      (d.daDong
        ? '<div class="alert-row calm">' + icon('check', 18) + '<div><b>Đã xác nhận đoàn phí ' + d.nam + '</b><span>Huy hiệu "Đoàn phí" đã gắn trên Thẻ Đoàn viên điện tử của bạn.</span></div></div>'
        : '<button class="btn btn-primary btn-block btn-lg" data-act="pay-fee">' + icon('wallet', 17) + ' Tạo mã VietQR đóng ' + fmtMoney(d.mucPhi) + '</button>' +
          '<div class="note mt-12">Mã QR được cá nhân hóa theo cú pháp <b>DOANPHI [Mã Ấp] [Mã ĐV]</b>. Sau khi chuyển khoản, Bí thư Chi đoàn Ấp xác nhận và bạn được +10 điểm.</div>') +
    '</div>' +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('bulb', 17) + ' Vì sao cần đóng đoàn phí?</div></div></div>' +
      '<div class="small muted">Đoàn phí là nghĩa vụ và quyền lợi của đoàn viên, được công khai 100% trên Sổ quỹ minh bạch của Chi đoàn Ấp. Hoàn thành đoàn phí năm là một trong các điều kiện xét danh hiệu và nguồn phát triển Đảng.</div>' +
    '</div>';
}

async function feeManager() {
  var d = await API.call('fee.summary');
  S.data.fee = d;
  var me = S.me;
  if (me.cap <= 2 && !S.data.aps) {
    S.data.aps = (await API.call('ap.list')).items;
  }

  var stats = '<div class="kpi-grid">' +
    '<div class="kpi tone-green"><div class="kpi-top"><div class="kpi-icon">' + icon('wallet', 17) + '</div></div>' +
    '<div class="kpi-label">Tổng thu đã xác nhận</div><div class="kpi-value">' + fmtMoney(d.tongThu) + '</div><div class="kpi-hint">Năm ' + d.nam + '</div></div>' +
    '<div class="kpi tone-red"><div class="kpi-top"><div class="kpi-icon">' + icon('trend', 17) + '</div></div>' +
    '<div class="kpi-label">Tổng chi</div><div class="kpi-value">' + fmtMoney(d.tongChi) + '</div><div class="kpi-hint">Công khai minh bạch</div></div>' +
    '<div class="kpi tone-blue"><div class="kpi-top"><div class="kpi-icon">' + icon('shield', 17) + '</div></div>' +
    '<div class="kpi-label">Tồn quỹ</div><div class="kpi-value">' + fmtMoney(d.tonQuy) + '</div><div class="kpi-hint">Thu - Chi</div></div>' +
    '<div class="kpi tone-orange"><div class="kpi-top"><div class="kpi-icon">' + icon('clock', 17) + '</div></div>' +
    '<div class="kpi-label">Chờ xác nhận</div><div class="kpi-value">' + d.pending.length + '<small>giao dịch</small></div></div>' +
    '</div>';

  var pending = sectionTitle('Chuyển khoản chờ xác nhận', '<span class="small muted">Mức chuẩn ' + fmtMoney(d.mucPhi) + '/năm</span>') +
    '<div class="card">' + (d.pending.length ? '<div class="list">' + d.pending.map(function (p) {
      return '<div class="list-item"><div class="li-avatar orange" style="background:#FFF1E7;color:#EA580C">' + esc(initials(p.hoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(p.hoTen) + '</b><span>' + esc(p.maDD) + ' · ' + esc(p.maAp) + ' · ' + fmtDate(p.ngayTao) + '</span></div>' +
        '<div class="li-right"><div class="small" style="font-weight:700">' + fmtMoney(p.soTien) + '</div>' +
        '<button class="btn btn-green btn-sm mt-8" data-act="confirm-fee" data-id="' + esc(p.maGiaoDich) + '">Xác nhận</button></div></div>';
    }).join('') + '</div>' : emptyBox('Không có giao dịch nào đang chờ.', 'check')) + '</div>';

  var byAp = sectionTitle('Tiến độ theo Chi đoàn Ấp') + '<div class="card"><div class="table-wrap"><table class="tb">' +
    '<thead><tr><th>Ấp</th><th>ĐV</th><th>Đã đóng</th><th>Dự kiến</th><th>Thực thu</th><th>Tồn</th></tr></thead><tbody>' +
    d.stats.map(function (s) {
      return '<tr><td class="tb-ap">' + esc(s.tenAp) + '</td><td>' + s.soDoanVien + '</td>' +
        '<td><span class="mini-bar"><i style="width:' + s.tyLe + '%"></i></span> ' + s.tyLe + '%</td>' +
        '<td>' + fmtMoney(s.duKien) + '</td><td class="money-pos">' + fmtMoney(s.daThu) + '</td><td>' + fmtMoney(s.tonQuy) + '</td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<button class="btn btn-ghost btn-sm btn-block mt-12" data-act="expense">' + icon('plus', 14) + ' Ghi nhận khoản chi quỹ</button></div>';

  var ledger = sectionTitle('Sổ quỹ minh bạch', '<span class="small muted">' + d.nhat.length + ' bút toán</span>') +
    '<div class="card">' + (d.nhat.length ? '<div class="list">' + d.nhat.map(function (n) {
      return '<div class="list-item"><div class="li-avatar ' + (n.loai === 'Thu' ? 'green' : 'red') + '">' + icon(n.loai === 'Thu' ? 'wallet' : 'trend', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(n.noiDung) + '</b><span>' + esc(n.hoTen) + ' · ' + esc(n.maAp) + ' · ' + fmtDate(n.ngay) + '</span></div>' +
        '<div class="li-right"><span class="' + (n.loai === 'Thu' ? 'money-pos' : 'money-neg') + '">' + (n.loai === 'Thu' ? '+' : '−') + fmtMoney(n.soTien) + '</span>' +
        '<div class="small muted">' + esc(n.trangThai) + '</div></div></div>';
    }).join('') + '</div>' : emptyBox('Sổ quỹ chưa có bút toán.', 'wallet')) + '</div>';

  return sectionTitle('Đoàn phí số VietQR & Sổ quỹ', '<span class="badge badge-green">Minh bạch 100%</span>') +
    (me.cap <= 2 ? '<div class="note mb-12">Cấp Xã giám sát toàn bộ Sổ thu - chi của ' + d.stats.length + ' Chi đoàn Ấp. Mọi bút toán đều công khai cho đoàn viên.</div>' : '') +
    stats + pending + byAp + ledger;
}
