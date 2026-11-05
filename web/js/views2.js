/* ==================================================================
   views2.js — Thẻ số E-Card, SOS & Bản đồ, Học tập & AI, Quản trị
   ================================================================== */

/* ------------------------------------------------------------------ */
/* THẺ ĐOÀN VIÊN ĐIỆN TỬ                                              */
/* ------------------------------------------------------------------ */

VIEWS.card = async function () {
  var c = await API.call('card.get', {});
  S.data.card = c;
  var me = S.me;

  var fields = [
    ['Họ và tên', c.hoTen],
    ['Ngày sinh', c.ngaySinh || '—'],
    ['Chức vụ', c.chucVu || '—'],
    ['Ngày vào Đoàn', c.ngayVaoDoan || '—'],
    ['Nơi vào Đoàn', c.noiVaoDoan || '—', true],
    ['Nơi cấp thẻ', c.noiCapThe || '—', true],
    ['Ngày sinh hoạt đoàn', c.ngaySinhHoatDoan || '—'],
    ['Số thẻ Đoàn viên', c.maThe || 'Chưa cấp']
  ];

  var cardHTML =
    '<div class="e-card">' +
      '<div class="e-card-top">' +
        '<div class="e-card-id">' +
          apLogoImg(c.maAp, 'e-card-logo') +
          '<div>' +
            '<div class="e-card-label">Đoàn TNCS Hồ Chí Minh · ' + esc(c.tenXa) + '</div>' +
            '<h3>' + esc(c.hoTen) + '</h3>' +
            '<div class="e-role">' + esc(c.chucVu) + ' · ' + esc(c.tenAp) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="e-card-qr"><img src="' + qrImg('CD6CARD|' + c.maDD + '|' + c.maThe, 72) + '" alt="QR thẻ"></div>' +
      '</div>' +
      '<div class="e-card-fields">' +
        fields.map(function (f) {
          return '<div class="ef' + (f[2] ? ' wide' : '') + '"><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>';
        }).join('') +
      '</div>' +
      '<div class="e-card-foot"><span>Có giá trị đến ' + esc(c.hetHan || '—') + '</span>' +
        '<span>' + c.diem + ' điểm · ' + c.badges.length + ' huy hiệu</span></div>' +
    '</div>';

  var badges = '<div class="chip-row mt-12">' +
    (c.badges.length ? c.badges.map(function (b) { return '<span class="badge badge-' + b.mau + '">' + esc(b.ten) + '</span>'; }).join('')
      : '<span class="small muted">Chưa có huy hiệu nào. Hoàn thành đoàn phí và tích hợp thẻ để nhận huy hiệu.</span>') +
    '</div>';

  var actions = '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('award', 17) + ' Tiện ích thẻ số</div>' +
    '<div class="card-sub">Thẻ tích hợp QR định danh, huy hiệu và chữ ký số</div></div></div>' +
    '<div class="row wrap" style="gap:8px">' +
      '<button class="btn btn-ghost grow" data-act="eval360">' + icon('star', 15) + ' Tự đánh giá 360°</button>' +
      '<button class="btn btn-ghost grow" data-act="cert">' + icon('award', 15) + ' Cấp E-Cert</button>' +
      '<button class="btn btn-ghost grow" data-act="print">' + icon('print', 15) + ' In / Lưu PDF</button>' +
    '</div>' +
    (c.trangThaiThe !== 'Đã cấp' ? '<div class="note mt-12">Thẻ chưa được tích hợp. Bí thư Chi đoàn Ấp hoặc cấp Xã (C0–C2) sẽ thẩm tra và cấp thẻ cho bạn (+20 điểm).</div>' : '') +
  '</div>';

  var mgr = '';
  if (me.cap <= 3) {
    var d = await API.call('card.list', {});
    S.data.cardList = d;
    mgr = sectionTitle('Thẩm tra & tích hợp Thẻ Đoàn viên',
      '<span class="badge badge-' + (d.daCap === d.items.length ? 'green' : 'orange') + '">' + d.daCap + '/' + d.items.length + ' đã cấp</span>') +
      '<div class="card">' + (d.items.length ? '<div class="list">' + d.items.map(function (m) {
        return '<div class="list-item"><div class="li-avatar ' + (m.trangThai === 'Đã cấp' ? 'green' : '') + '">' + esc(initials(m.hoTen)) + '</div>' +
          '<div class="li-main"><b>' + esc(m.hoTen) + '</b><span>' + esc(m.maDD) + ' · ' + esc(m.maAp) + ' · ' + m.diem + ' điểm</span></div>' +
          '<div class="li-right">' + (m.trangThai === 'Đã cấp'
            ? '<div class="small" style="font-family:ui-monospace,monospace;font-size:10.5px">' + esc(m.maThe) + '</div>' + badge('Đã cấp', 'green')
            : '<button class="btn btn-primary btn-sm" data-act="issue-card" data-ma="' + esc(m.maDD) + '">Tích hợp +20đ</button>') +
          '</div></div>';
      }).join('') + '</div>' : emptyBox('Chưa có đoàn viên.', 'users')) + '</div>' +
      '<div class="note">Mã thẻ có cú pháp <b>TDV-[Năm]-[Mã Ấp]-[Số thứ tự]</b>. Bí thư Chi đoàn Ấp (C3) và cấp Xã (C0–C2) đều có quyền thẩm tra, gắn thẻ chính thức.</div>';
  }

  return sectionTitle('Thẻ Đoàn viên điện tử', statusBadge(c.trangThaiThe)) +
    cardHTML + badges + actions + mgr;
};

/* ------------------------------------------------------------------ */
/* SOS & BẢN ĐỒ TÌNH NGUYỆN                                            */
/* ------------------------------------------------------------------ */

VIEWS.sos = async function () {
  var d = await API.call('sos.list', {});
  S.data.sos = d;
  var me = S.me;
  var isMgr = me.cap <= 3;

  var stats = '<div class="kpi-grid" style="grid-template-columns:repeat(3,1fr)">' +
    '<div class="kpi tone-orange"><div class="kpi-top"><div class="kpi-icon">' + icon('alert', 17) + '</div></div>' +
    '<div class="kpi-label">Phản ánh đã gửi</div><div class="kpi-value">' + d.thongKe.tong + '</div></div>' +
    '<div class="kpi tone-blue"><div class="kpi-top"><div class="kpi-icon">' + icon('clock', 17) + '</div></div>' +
    '<div class="kpi-label">Chờ duyệt</div><div class="kpi-value">' + d.thongKe.choDuyet + '</div></div>' +
    '<div class="kpi tone-green"><div class="kpi-top"><div class="kpi-icon">' + icon('check', 17) + '</div></div>' +
    '<div class="kpi-label">Đã xử lý</div><div class="kpi-value">' + d.thongKe.daXuLy + '</div></div>' +
    '</div>';

  var map = '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('map', 17) + ' Bản đồ hiện trường</div>' +
    '<div class="card-sub">' + d.items.length + ' điểm phản ánh · ' + d.missions.length + ' nhiệm vụ tình nguyện</div></div></div>' +
    '<div class="map-canvas" id="sos-map"><div class="map-grid"></div>' + mapPins(d) + '</div>' +
    '<div class="row small muted mt-8" style="gap:14px"><span><i class="dot red"></i> Phản ánh</span>' +
    '<span><i class="dot" style="background:#0E9F6E"></i> Nhiệm vụ</span>' +
    '<span class="grow"></span><span>Tọa độ GPS thực tế</span></div>' +
    '</div>';

  var form = '';
  if (me.cap === 4) {
    form = '<div class="card">' +
      '<div class="card-hd"><div><div class="card-title">' + icon('camera', 17) + ' Gửi phản ánh hiện trường</div>' +
      '<div class="card-sub">Nhận +10 điểm Dân vận khéo cho mỗi phản ánh</div></div></div>' +
      '<form data-form="sos">' +
        '<div class="field"><label>Loại hiện trường</label><select class="input" name="loai">' +
          '<option>Rác thải tự phát</option><option>Đèn đường hỏng</option><option>Hộ khó khăn</option>' +
          '<option>Hư hỏng hạ tầng</option><option>An ninh trật tự</option><option>Khác</option></select></div>' +
        '<div class="field"><label>Mô tả hiện trường</label>' +
          '<textarea class="input" name="noiDung" placeholder="Vị trí, mức độ ảnh hưởng, đề xuất xử lý…" required></textarea></div>' +
        '<button class="btn btn-primary btn-block btn-lg" type="submit">' + icon('location', 16) + ' Gửi kèm tọa độ GPS</button>' +
      '</form></div>';
  }

  var sosList = sectionTitle('Phản ánh 24/7', '<span class="small muted">Đoàn viên → Bí thư Chi đoàn Ấp duyệt</span>') +
    '<div class="card">' + (d.items.length ? '<div class="list">' + d.items.map(function (s) {
      var btn = '';
      if (isMgr && s.trangThai === 'Chờ duyệt') {
        btn = '<button class="btn btn-primary btn-sm" data-act="sos-to-mission" data-pa="' + esc(s.maPA) + '">Tạo nhiệm vụ</button>';
      } else {
        btn = statusBadge(s.trangThai);
      }
      return '<div class="list-item"><div class="li-avatar red">' + icon('alert', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(s.loai) + ' · ' + esc(s.maAp) + '</b>' +
        '<span>' + esc(s.noiDung) + '</span>' +
        '<span class="mt-8" style="font-size:10.5px">' + esc(s.hoTen) + ' · ' + fmtDate(s.thoiGian) + '</span></div>' +
        '<div class="li-right">' + btn + '</div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có phản ánh nào.', 'map')) + '</div>';

  var missions = sectionTitle('Nhiệm vụ tình nguyện trên bản đồ',
    '<span class="small muted">Check-in GPS +15đ</span>') +
    '<div class="card">' + (d.missions.length ? '<div class="list">' + d.missions.map(function (m) {
      var btn = m.daCheckIn ? badge('Đã check-in', 'green')
        : (m.trangThai === 'Hoàn thành' ? badge('Hoàn thành', 'green')
          : '<button class="btn btn-primary btn-sm" data-act="checkin-mission" data-nv="' + esc(m.maNV) + '">Check-in GPS</button>');
      return '<div class="list-item"><div class="li-avatar green">' + icon('location', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(m.tenNV) + '</b><span>' + esc(m.maAp) + ' · +' + m.diem + ' điểm · ' + fmtDate(m.ngayTao) + '</span></div>' +
        '<div class="li-right">' + btn + '</div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có nhiệm vụ nào được mở.', 'location')) + '</div>';

  return sectionTitle('Bản đồ tình nguyện & SOS 24/7', '<span class="badge badge-red">Dân vận khéo</span>') +
    stats + map + form + sosList + missions;
};

/* Bản đồ Leaflet: nâng cấp từ sơ đồ tọa độ sang bản đồ thật, có fallback. */
AFTER.sos = function () {
  var box = document.getElementById('sos-map');
  if (!box || !window.L || typeof window.L.map !== 'function') return;
  var d = S.data.sos || {};
  var all = [];
  (d.items || []).forEach(function (s) {
    if (s.viDo && s.kinhDo) {
      all.push({
        lat: Number(s.viDo), lng: Number(s.kinhDo),
        kind: s.trangThai === 'Hoàn thành' ? 'done' : 'pa',
        label: s.loai, detail: s.noiDung || '', color: s.trangThai === 'Hoàn thành' ? '#667085' : '#B31217'
      });
    }
  });
  (d.missions || []).forEach(function (m) {
    if (m.viDo && m.kinhDo) {
      all.push({
        lat: Number(m.viDo), lng: Number(m.kinhDo),
        kind: 'mission', label: m.tenNV, detail: m.maAp || '',
        color: m.trangThai === 'Hoàn thành' ? '#667085' : '#0E9F6E'
      });
    }
  });
  if (!all.length) return;

  var fallback = box.innerHTML;
  try {
    box.innerHTML = '';
    box.classList.add('leaflet-box');
    var map = window.L.map(box, { scrollWheelZoom: false, zoomControl: true });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);

    var bounds = [];
    all.forEach(function (p) {
      var marker = window.L.circleMarker([p.lat, p.lng], {
        radius: 8, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 0.95
      }).addTo(map);
      marker.bindPopup('<b>' + esc(p.label) + '</b>' +
        (p.detail ? '<br><span style="font-size:11px">' + esc(p.detail) + '</span>' : ''));
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 15);
    else map.fitBounds(bounds, { padding: [26, 26], maxZoom: 16 });
    setTimeout(function () {
      try { map.invalidateSize(); } catch (e) { /* bỏ qua */ }
    }, 250);
  } catch (e) {
    box.innerHTML = fallback;
    box.classList.remove('leaflet-box');
  }
};

function mapPins(d) {
  var all = [];
  d.items.forEach(function (s) {
    if (s.viDo && s.kinhDo) all.push({ lat: s.viDo, lng: s.kinhDo, kind: s.trangThai === 'Hoàn thành' ? 'done' : 'pa', label: s.loai });
  });
  d.missions.forEach(function (m) {
    if (m.viDo && m.kinhDo) all.push({ lat: m.viDo, lng: m.kinhDo, kind: m.trangThai === 'Hoàn thành' ? 'done' : 'mission', label: m.tenNV });
  });
  if (!all.length) return emptyBox('Chưa có dữ liệu tọa độ GPS.', 'map');

  var lats = all.map(function (p) { return p.lat; });
  var lngs = all.map(function (p) { return p.lng; });
  var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
  var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
  var spanLat = (maxLat - minLat) || 0.004, spanLng = (maxLng - minLng) || 0.004;
  return all.map(function (p) {
    var top = 86 - ((p.lat - minLat) / spanLat) * 68;
    var left = 10 + ((p.lng - minLng) / spanLng) * 80;
    return '<div class="map-pin ' + (p.kind === 'mission' ? 'mission' : p.kind === 'done' ? 'done' : '') + '" ' +
      'style="top:' + top + '%;left:' + left + '%" title="' + esc(p.label) + '">' +
      '<i></i><span>' + esc(p.label.length > 18 ? p.label.slice(0, 17) + '…' : p.label) + '</span></div>';
  }).join('');
}

/* ------------------------------------------------------------------ */
/* HỌC TẬP & AI                                                       */
/* ------------------------------------------------------------------ */

VIEWS.learn = async function () {
  var me = S.me;
  var seg = '<div class="segmented mb-12">' +
    '<button class="' + (S.learnTab === 'quiz' ? 'active' : '') + '" data-act="learn-tab" data-tab="quiz">Đấu trường Quiz</button>' +
    '<button class="' + (S.learnTab === 'ai' ? 'active' : '') + '" data-act="learn-tab" data-tab="ai">Trợ lý AI 24/7</button>' +
    (me.cap <= 3 ? '<button class="' + (S.learnTab === 'doc' ? 'active' : '') + '" data-act="learn-tab" data-tab="doc">Soạn văn bản</button>' : '') +
    '</div>';

  if (S.learnTab === 'ai') return seg + await learnAI();
  if (S.learnTab === 'doc') return seg + learnDoc();
  return seg + await learnQuiz();
};

async function learnQuiz() {
  var d = await API.call('quiz.list');
  var lb = await API.call('leaderboard');
  S.data.quiz = d;

  var head = '<div class="card hero-card" style="background:linear-gradient(125deg,#12224A,#1D4ED8 55%,#3B82F6)">' +
    '<div class="row-between"><div><div class="hero-greet">Đấu trường AI Quiz Arena</div>' +
    '<div class="hero-name">' + d.soDung + '/' + d.tongCau + ' câu chính xác</div>' +
    '<div class="hero-tag">' + icon('flame', 11) + ' +15 điểm mỗi câu đúng</div></div>' +
    '<div style="text-align:right"><div class="hero-greet">Đã làm</div><div style="font-size:26px;font-weight:800">' + d.daLam + '</div>' +
    '<div class="hero-greet">/ ' + d.tongCau + ' câu</div></div></div>' +
    '<div class="progress-wrap"><div class="progress-hd"><span>Tiến độ học nghị quyết</span><span>' + (d.tongCau ? Math.round(d.daLam / d.tongCau * 100) : 0) + '%</span></div>' +
    progressBar(d.tongCau ? d.daLam / d.tongCau * 100 : 0) + '</div></div>';

  var questions = '<div class="card">' + d.items.map(function (q, idx) {
    var answered = q.daTraLoi;
    var opts = ['A', 'B', 'C', 'D'].map(function (k) {
      var cls = 'quiz-option';
      if (answered) {
        cls += ' disabled';
        if (k === q.dapAnDung) cls += ' correct';
        else if (k === q.dapAnChon) cls += ' wrong';
      }
      return '<div class="' + cls + '" ' + (answered ? '' : 'data-act="quiz-answer" data-cau="' + esc(q.maCau) + '" data-opt="' + k + '"') + '>' +
        '<div class="qk">' + k + '</div><div class="grow">' + esc(q[k]) + '</div>' +
        (answered && k === q.dapAnDung ? icon('check', 16) : '') + '</div>';
    }).join('');
    return '<div style="padding:14px 0;border-bottom:1px solid #F1F3F8">' +
      '<div class="row-between mb-8"><span class="badge badge-blue">' + esc(q.chuDe) + '</span>' +
      (answered ? (q.dung ? badge('+' + q.diem + 'đ', 'green') : badge('Sai', 'red')) : '<span class="small muted">Câu ' + (idx + 1) + '</span>') + '</div>' +
      '<b style="font-size:13.8px;line-height:1.5">' + esc(q.noiDung) + '</b>' + opts +
      (answered ? '<div class="explain">' + icon('bulb', 13) + ' ' + esc(q.giaiThich || '') + '</div>' : '') +
      '</div>';
  }).join('') + '</div>';

  var board = sectionTitle('Bảng xếp hạng thi đua', '<span class="small muted">Cập nhật thời gian thực</span>') +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('flame', 17) + ' Đoàn viên dẫn đầu</div></div></div>' +
    '<div class="list">' + lb.top.map(function (m) {
      var medal = m.hang === 1 ? '🥇' : m.hang === 2 ? '🥈' : m.hang === 3 ? '🥉' : m.hang;
      return '<div class="list-item"><div class="li-avatar ' + (m.hang <= 3 ? 'red' : '') + '">' + medal + '</div>' +
        '<div class="li-main"><b>' + esc(m.hoTen) + '</b><span>' + esc(m.maDD) + ' · ' + esc(m.maAp) + '</span></div>' +
        '<div class="li-right"><b>' + m.diem + '</b><span class="small muted">điểm</span></div></div>';
    }).join('') + '</div></div>' +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('award', 17) + ' Xếp hạng Chi đoàn Ấp</div></div></div>' +
    '<div class="table-wrap"><table class="tb"><thead><tr><th>Hạng</th><th>Chi đoàn Ấp</th><th>Đoàn viên</th><th>Điểm TB</th></tr></thead><tbody>' +
    lb.aps.map(function (a, i) {
      return '<tr><td><b>' + (i + 1) + '</b></td><td class="tb-ap">' + esc(a.tenAp) + '</td><td>' + a.soDoanVien + '</td>' +
        '<td><b>' + a.diemTB + '</b></td></tr>';
    }).join('') + '</tbody></table></div></div>';

  return head + sectionTitle('Ngân hàng câu hỏi nghị quyết', '<span class="small muted">Trả lời 1 lần/câu</span>') + questions + board;
}

async function learnAI() {
  var chips = ['DIEM DV01', 'CANH BAO', 'UOM MAM DO', 'DOAN PHI', 'DIEM DANH'];
  if (!S.chat.length) {
    S.chat = [{
      role: 'bot',
      text: '🤖 Xin chào ' + S.me.hoTen + '! Tôi là Trợ lý ảo Chi đoàn số 6.0.\nBạn có thể nhắn: DIEM [Mã ĐV], CANH BAO, UOM MAM DO, DOAN PHI hoặc DIEM DANH.'
    }];
  }
  var messages = S.chat;

  return '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('chat', 17) + ' Zalo Bot · Trợ lý 24/7</div>' +
    '<div class="card-sub">Tra cứu điểm, cảnh báo, đoàn phí, nguồn Đảng</div></div>' +
    '<span class="badge badge-green"><i class="dot"></i> Trực tuyến</span></div>' +
    '<div class="chat" id="chat-box">' + messages.map(function (m) {
      return '<div class="msg ' + (m.role === 'me' ? 'me' : 'bot') + '">' + esc(m.text) + '</div>';
    }).join('') + '</div>' +
    '<div class="chip-row mt-12">' + chips.map(function (c) {
      return '<button class="chip" data-act="chat-chip" data-text="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('') + '</div>' +
    '<form class="chat-input" data-form="chat">' +
      '<input class="input" name="text" placeholder="Nhắn cho trợ lý…" autocomplete="off" required>' +
      '<button class="btn btn-primary" type="submit">' + icon('send', 16) + '</button>' +
    '</form></div>' +
    '<div class="note">Trợ lý chạy theo kịch bản nghiệp vụ (rule-based) trên Google Sheets — không gửi dữ liệu đoàn viên ra bên ngoài.</div>';
}

function learnDoc() {
  return '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('bulb', 17) + ' AI soạn văn bản Đoàn - Đảng</div>' +
    '<div class="card-sub">Kịch bản điều hành họp 45 phút & trích biên bản trong 3 giây</div></div></div>' +
    '<form data-form="ai-script">' +
      '<div class="field"><label>Chủ đề sinh hoạt</label>' +
      '<input class="input" name="noiDung" value="Sinh hoạt Chi đoàn tháng 10/2026 — Đổi mới tập hợp đoàn viên" required></div>' +
      '<div class="field"><label>Thời lượng (phút)</label>' +
      '<select class="input" name="thoiLuong"><option>30</option><option selected>45</option><option>60</option><option>90</option></select></div>' +
      '<button class="btn btn-primary btn-block btn-lg" type="submit">' + icon('bulb', 16) + ' Tạo kịch bản điều hành</button>' +
    '</form>' +
    '<div id="ai-script-out" class="mt-12"></div>' +
  '</div>' +
  '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('award', 17) + ' Trích biên bản giới thiệu Đoàn viên ưu tú</div>' +
    '<div class="card-sub">Tự động tổng hợp điểm, thẻ, đoàn phí, đánh giá 360°</div></div></div>' +
    '<button class="btn btn-ghost btn-block" data-act="ai-minutes">' + icon('award', 16) + ' Chọn đoàn viên & lập biên bản</button>' +
  '</div>' +
  '<div class="note">Văn bản được tạo từ dữ liệu thật trên Google Sheets, đúng mẫu hành chính, có thể sao chép vào Zalo hoặc Google Docs.</div>';
}

/* ------------------------------------------------------------------ */
/* QUẢN TRỊ                                                           */
/* ------------------------------------------------------------------ */

VIEWS.admin = async function () {
  var me = S.me;
  var html = sectionTitle('Quản trị hệ thống', '<span class="badge badge-' + roleTone(me.cap) + '">' + capShort(me.cap) + '</span>');

  if (me.cap <= 2) html += await adminResets();
  if (me.cap === 0 || me.cap === 3) html += await adminDelegate();

  html += await adminMembers();
  if (me.cap <= 2) html += await adminApprovals();

  html += '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('shield', 17) + ' Nguyên tắc vận hành</div>' +
    '<div class="card-sub">Bảo mật kép · Không giấy · 0 đồng chi phí</div></div></div>' +
    '<div class="list">' +
      '<div class="list-item"><div class="li-avatar red">' + icon('shield', 15) + '</div><div class="li-main"><b>Reset PIN tập trung cấp Xã</b><span>PIN mới chỉ hiển thị cho Cấp 0 / Chủ tịch Hội LHTN Xã / Bí thư Chi bộ Xã</span></div></div>' +
      '<div class="list-item"><div class="li-avatar red">' + icon('qr', 15) + '</div><div class="li-main"><b>QR động 60 giây</b><span>Chặn ảnh chụp màn hình gửi qua Zalo</span></div></div>' +
      '<div class="list-item"><div class="li-avatar red">' + icon('users', 15) + '</div><div class="li-main"><b>Ủy quyền 24 giờ</b><span>Phó Bí thư Chi đoàn Ấp duyệt thay khi Bí thư đi công tác</span></div></div>' +
      '<div class="list-item"><div class="li-avatar red">' + icon('star', 15) + '</div><div class="li-main"><b>Dữ liệu tập trung Google Sheets</b><span>Mọi điểm số được log lại, không thể sửa lén</span></div></div>' +
    '</div></div>';

  return html;
};

async function adminResets() {
  var d = await API.call('auth.pendingResets', {});
  S.data.resets = d;
  return '<div class="card" style="border-color:#F6E1A4;background:#FFFDF5">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('shield', 17) + ' Yêu cầu cấp lại mã PIN</div>' +
    '<div class="card-sub">Quyền hạn của cấp Xã: Chủ tịch Hội LHTN Xã và Bí thư Chi bộ Xã</div></div>' +
    '<span class="badge badge-' + (d.items.length ? 'orange' : 'green') + '">' + d.items.length + ' chờ cấp</span></div>' +
    (d.items.length ? '<div class="list">' + d.items.map(function (r) {
      return '<div class="list-item"><div class="li-avatar red">' + esc(initials(r.HoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(r.HoTen) + '</b><span>' + esc(r.MaDD) + ' · Cấp ' + r.Cap + ' · ' + fmtDate(r.NgayYC) + '</span></div>' +
        '<div class="li-right"><button class="btn btn-primary btn-sm" data-act="approve-reset" data-yc="' + esc(r.MaYC) + '" data-ten="' + esc(r.HoTen) + '">Cấp PIN</button></div></div>';
    }).join('') + '</div>' : emptyBox('Không có yêu cầu nào đang chờ.', 'check')) +
    '</div>';
}

async function adminDelegate() {
  var ap = (S.data.aps || (await API.call('ap.list')).items);
  S.data.aps = ap;
  var members = (await API.call('member.list', {})).items;
  var uy = S.me.uyQuyen || {};
  return '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('users', 17) + ' Ủy quyền 24 giờ</div>' +
    '<div class="card-sub">Cho Phó Bí thư duyệt điểm danh khi bạn đi công tác</div></div></div>' +
    (uy.uyQuyen ? '<div class="alert-row calm">' + icon('check', 16) + '<div><b>' + esc(uy.hoTen) + ' đang được ủy quyền</b><span>Đến ' + fmtDate(uy.den) + '</span></div></div>' : '') +
    '<form data-form="delegate">' +
      '<div class="field"><label>Chọn cán bộ Ấp được ủy quyền</label>' +
      '<select class="input" name="maDD" required><option value="">— Chọn —</option>' +
      members.map(function (m) { return '<option value="' + esc(m.maDD) + '">' + esc(m.hoTen) + ' (' + esc(m.maDD) + ')</option>'; }).join('') +
      '</select></div>' +
      '<div class="field"><label>Thời hạn</label><select class="input" name="gio"><option value="8">8 giờ</option><option value="12">12 giờ</option><option value="24" selected>24 giờ</option></select></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Kích hoạt ủy quyền</button>' +
    '</form></div>';
}

async function adminMembers() {
  var limit = Math.max(50, Number(S.data.memberLimit) || 50);
  var d = await API.call('member.list', { limit: limit, offset: 0 });
  S.data.members = d;
  var aps = S.data.aps || (await API.call('ap.list')).items;
  S.data.aps = aps;
  var me = S.me;

  var form = '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('plus', 17) + ' Thêm đoàn viên vào Ấp</div>' +
    '<div class="card-sub">Mã định danh tự động cấp · PIN mặc định 123456</div></div></div>' +
    '<form data-form="member-add">' +
      '<div class="field"><label>Họ và tên</label><input class="input" name="hoTen" required placeholder="Nguyễn Văn A"></div>' +
      '<div class="field"><label>Số điện thoại</label><input class="input" name="dienThoai" inputmode="numeric" required placeholder="09xxxxxxxx"></div>' +
      '<div class="field"><label>Ngày sinh</label><input class="input" name="ngaySinh" placeholder="dd/mm/yyyy"></div>' +
      (me.cap <= 2 ? '<div class="field"><label>Chi đoàn Ấp</label><select class="input" name="maAp">' +
        aps.map(function (a) { return '<option value="' + esc(a.MaAp) + '">' + esc(a.TenAp) + '</option>'; }).join('') + '</select></div>' : '') +
      '<button class="btn btn-primary btn-block" type="submit">Tạo tài khoản đoàn viên</button>' +
    '</form></div>';

  var conLai = Math.max(0, Number(d.tongSo || d.items.length) - d.items.length);
  var list = sectionTitle('Danh sách đoàn viên (' +
      (conLai ? d.items.length + '/' + d.tongSo : d.items.length) + ')',
    '<span class="small muted">Sửa / xóa thông tin · Sắp xếp theo điểm</span>') +
    '<div class="card">' + (d.items.length ? '<div class="list">' + d.items.map(function (m) {
      return '<div class="list-item"><div class="li-avatar ' + (m.diem >= 300 ? 'red' : '') + '">' + esc(initials(m.hoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(m.hoTen) + '</b><span>' + esc(m.maDD) + ' · ' + esc(m.maAp) + ' · ' + esc(m.dienThoai || '') + '</span></div>' +
        '<div class="li-right"><b>' + m.diem + '</b><div class="small muted">điểm</div>' +
        (m.coThe ? badge('Thẻ', 'green') : '') +
        '<div class="row" style="gap:4px;margin-top:5px;justify-content:flex-end">' +
        '<button class="btn btn-ghost btn-sm" data-act="edit-member" data-ma="' + esc(m.maDD) + '">Sửa</button>' +
        '<button class="btn btn-danger btn-sm" data-act="delete-member" data-ma="' + esc(m.maDD) + '">Xóa</button>' +
        '</div></div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có đoàn viên.', 'users')) +
    (conLai ? '<button class="btn btn-ghost btn-block mt-12" data-act="member-more">' +
      'Xem thêm ' + Math.min(50, conLai) + ' đoàn viên · còn ' + conLai + '</button>' : '') +
    '</div>';

  return form + list;
}

async function adminApprovals() {
  var d = await API.call('uommam.list', {});
  var pending = d.items.filter(function (i) { return i.trangThai === 'Chờ duyệt'; });
  return sectionTitle('Hồ sơ Ươm mầm Đỏ chờ phê duyệt',
    '<span class="badge badge-' + (pending.length ? 'orange' : 'green') + '">' + pending.length + '</span>') +
    '<div class="card">' + (pending.length ? '<div class="list">' + pending.map(function (m) {
      return '<div class="list-item"><div class="li-avatar red">' + esc(initials(m.hoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(m.hoTen) + '</b><span>' + esc(m.maAp) + ' · ' + m.diem + ' điểm · ' + esc(m.xepLoai360) + '</span>' +
        '<span style="font-size:11px;color:#667085">' + esc(m.nhanXet || '') + '</span></div>' +
        '<div class="li-right"><div class="row" style="gap:5px">' +
        '<button class="btn btn-green btn-sm" data-act="approve-uom" data-ma="' + esc(m.maDD) + '">Duyệt</button>' +
        '<button class="btn btn-danger btn-sm" data-act="reject-uom" data-ma="' + esc(m.maDD) + '">Trả</button></div></div></div>';
    }).join('') + '</div>' : emptyBox('Không có hồ sơ nào chờ duyệt.', 'check')) + '</div>';
}
