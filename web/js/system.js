/* ==================================================================
   system.js — Trung tâm điều hành dành cho tài khoản Cấp 0 (ADMIN)
   Quản lý Ấp/Chi đoàn Ấp, thông tin đơn vị, cấu hình hệ thống,
   tài khoản và nhật ký thao tác.
   ================================================================== */

var SYS_TABS = [
  { id: 'donVi', label: 'Đơn vị', icon: 'users' },
  { id: 'cauHinh', label: 'Cấu hình', icon: 'settings' },
  { id: 'taiKhoan', label: 'Tài khoản', icon: 'shield' },
  { id: 'baoCao', label: 'Báo cáo', icon: 'trend' },
  { id: 'nhacViec', label: 'Nhắc việc', icon: 'chat' },
  { id: 'duLieu', label: 'Sao lưu', icon: 'inbox' },
  { id: 'sucKhoe', label: 'Sức khỏe', icon: 'check' },
  { id: 'nhatKy', label: 'Nhật ký', icon: 'clock' }
];

function sysData() { return S.data.sys || {}; }
function sysCfg(key) {
  var item = (sysData().configs || []).filter(function (c) { return c.khoa === key; })[0];
  return item ? item.giaTri : '';
}
function sysField(label, name, value, type, hint) {
  return '<div class="field"><label>' + esc(label) + '</label>' +
    '<input class="input" name="' + esc(name) + '" value="' + esc(value) + '"' +
    (type === 'number' ? ' type="number" min="0" step="1" inputmode="numeric"' : '') + '>' +
    (hint ? '<div class="small muted mt-4">' + esc(hint) + '</div>' : '') + '</div>';
}
function sysTabButton(t) {
  var active = (S.data.sysTab || 'donVi') === t.id;
  return '<button class="sys-tab' + (active ? ' active' : '') + '" data-sys-act="tab" data-tab="' + t.id + '">' +
    icon(t.icon, 16) + '<span>' + esc(t.label) + '</span></button>';
}

VIEWS.system = async function () {
  if (!S.me || S.me.cap !== 0) return errorBox('Khu vực này chỉ dành cho tài khoản quản trị hệ thống (Cấp 0).');

  var logQ = S.data.sysLogQ || '';
  var accQ = S.data.sysAccountQ || '';
  var tab = S.data.sysTab || 'donVi';

  var res = await Promise.all([
    API.call('admin.summary', {}),
    API.call('admin.ap.list', {}),
    API.call('admin.config.list', {}),
    API.call('admin.account.list', { q: accQ }),
    API.call('admin.account.list', { q: accQ, daXoa: true }),
    API.call('admin.logs', { q: logQ, limit: 120 }),
    API.call('admin.backup.list', {}),
    API.call('system.health', {}).catch(function (e) { return { loi: e.message || String(e) }; }),
    API.call('admin.notify.list', {}).catch(function (e) { return { items: [], loi: e.message || String(e) }; })
  ]);

  var reportFilter = sysReportFilter();
  var report = null;
  if (tab === 'baoCao') {
    report = await API.call('report.summary', reportFilter).catch(function (e) {
      return { loi: e.message || String(e) };
    });
  }

  S.data.sys = {
    summary: res[0],
    aps: res[1].items,
    configs: res[2].items,
    accounts: res[3].items,
    trashAccounts: res[4].items,
    logs: res[5],
    backups: res[6],
    health: res[7],
    notify: res[8],
    report: report,
    unitMap: {}
  };
  S.data.sys.aps.forEach(function (a) { S.data.sys.unitMap[a.maAp] = a.tenAp; });

  var s = res[0];

  var html =
    '<div class="system-console">' +
      '<div class="sys-head">' +
        '<div><span class="badge badge-gold">' + icon('shield', 11) + ' Cấp 0 · Quản trị hệ thống</span>' +
          '<h2>Trung tâm điều hành</h2>' +
          '<p class="small muted">Quản lý đơn vị, cấu hình và tài khoản của Hệ sinh thái Chi đoàn số 6.0.</p></div>' +
        '<button class="btn btn-ghost btn-sm" data-sys-act="change-password">' + icon('shield', 14) + ' Đổi mật khẩu</button>' +
      '</div>' +
      '<div class="kpi-grid">' +
        kpiCard({ label: 'Chi đoàn Ấp', value: s.soAp, unit: 'đơn vị', hint: 'Đang quản lý trên hệ thống', tone: 'red', icon: 'users' }) +
        kpiCard({ label: 'Đoàn viên', value: s.soDoanVien, unit: 'đồng chí', hint: s.soCanBo + ' cán bộ Cấp 1–3', tone: 'green', icon: 'award' }) +
        kpiCard({ label: 'Tài khoản', value: s.soTaiKhoan, unit: 'tài khoản', hint: s.soHoatDong + ' đang hoạt động', tone: 'blue', icon: 'shield' }) +
        kpiCard({ label: 'Nhật ký', value: s.soNhatKy, unit: 'bản ghi', hint: 'Thao tác toàn hệ thống', tone: 'orange', icon: 'clock' }) +
      '</div>' +
      '<div class="sys-tabs">' + SYS_TABS.map(sysTabButton).join('') + '</div>' +
      '<div class="sys-panel">' +
        (tab === 'cauHinh' ? sysConfigPanel(res[2].items)
          : tab === 'taiKhoan' ? sysAccountPanel(S.data.sysTrash ? res[4].items : res[3].items, accQ, S.data.sysTrash, res[4].items.length)
            : tab === 'baoCao' ? sysReportPanel(report, res[1].items, reportFilter)
              : tab === 'nhacViec' ? sysNotifyPanel(res[8], res[1].items)
                : tab === 'duLieu' ? sysBackupPanel(res[6])
                  : tab === 'sucKhoe' ? sysHealthPanel(res[7])
                    : tab === 'nhatKy' ? sysLogPanel(res[5], logQ)
                      : sysUnitPanel(res[1].items)) +
      '</div>' +
    '</div>';

  return html;
};

/* ------------------------------------------------------------------ */
/* BỘ LỌC BÁO CÁO                                                     */
/* ------------------------------------------------------------------ */

function sysDateInputValue(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function sysReportFilter() {
  var f = S.data.reportFilter || {};
  var now = new Date();
  return {
    tuNgay: f.tuNgay || (now.getFullYear() + '-01-01'),
    denNgay: f.denNgay || sysDateInputValue(now),
    maAp: f.maAp || '',
    loai: f.loai || 'doanVien'
  };
}

function sysFormValues(form) {
  var out = {};
  if (!form) return out;
  new FormData(form).forEach(function (v, k) { out[k] = v; });
  return out;
}

function sysNotifyTieuDe(loai) {
  var map = {
    tatCa: 'Thông báo sinh hoạt Chi đoàn',
    chuaDongPhi: 'Nhắc hoàn thành đoàn phí năm',
    choDuyet: 'Theo dõi hồ sơ Ươm mầm Đỏ',
    canBo: 'Nhắc nhiệm vụ cán bộ Chi đoàn'
  };
  return map[loai] || 'Thông báo Chi đoàn';
}

function sysDownloadFile(name, mime, content) {  try {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name || 'bao-cao.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) { /* bỏ qua */ }
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 300);
    return true;
  } catch (e) {
    toast('Trình duyệt không tải được tệp: ' + (e.message || e), 'err');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* TAB: ĐƠN VỊ                                                        */
/* ------------------------------------------------------------------ */

function sysUnitPanel(aps) {
  var unitFields = [
    ['Tên xã / phường', 'TEN_XA'],
    ['Tên đầy đủ đơn vị', 'TEN_CHI_BO'],
    ['Chủ tịch Ủy ban Hội LHTN Việt Nam ' + (sysCfg('TEN_XA') || 'Xã'), 'BI_THU_XA', 'Họ và tên người giữ chức danh Chủ tịch'],
    ['Bí thư Chi bộ Xã', 'PHO_BI_THU_XA', 'Họ và tên Bí thư Chi bộ Xã'],
    ['Điện thoại liên hệ', 'DIEN_THOAI_XA'],
    ['Địa chỉ trụ sở', 'DIA_CHI_XA'],
    ['Email liên hệ', 'EMAIL_XA'],
    ['Ngày thành lập', 'NGAY_THANH_LAP']
  ];

  var infoForm = '<form class="card" data-sys-form="unit-info">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('home', 17) + ' Thông tin đơn vị cấp Xã</div>' +
    '<div class="card-sub">Hiển thị trên đầu ứng dụng, thẻ đoàn viên và văn bản số</div></div></div>' +
    '<div class="sys-form-grid">' + unitFields.map(function (f) {
      return sysField(f[0], f[1], sysCfg(f[1]), 'text', f[2]);
    }).join('') + '</div>' +
    '<button class="btn btn-primary mt-12" type="submit">' + icon('check', 15) + ' Lưu thông tin đơn vị</button>' +
    '</form>';

  var apList = '<div class="card">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('users', 17) + ' Chi đoàn Ấp (' + aps.length + ')</div>' +
    '<div class="card-sub">Thêm mới, đổi tên hoặc gán Bí thư cho từng Ấp</div></div>' +
    '<button class="btn btn-primary btn-sm" data-sys-act="ap-new">' + icon('plus', 14) + ' Thêm Ấp</button></div>' +
    (aps.length ? '<div class="sys-units">' + aps.map(function (a) {
      return '<div class="sys-unit">' +
        '<div class="sys-unit-hd"><div><b>' + esc(a.tenAp) + '</b>' +
          '<span class="badge badge-blue">' + esc(a.maAp) + '</span></div>' +
          '<div class="row" style="gap:5px">' +
            '<button class="btn btn-ghost btn-sm" data-sys-act="ap-edit" data-ma="' + esc(a.maAp) + '">Sửa</button>' +
            '<button class="btn btn-danger btn-sm" data-sys-act="ap-delete" data-ma="' + esc(a.maAp) + '">Xóa</button>' +
          '</div></div>' +
        '<div class="sys-unit-meta">' +
          '<span><b>' + a.soDoanVien + '</b> đoàn viên</span>' +
          '<span>Chỉ tiêu <b>' + a.chiTieu + '</b></span>' +
          '<span>Bí thư: <b>' + esc(a.biThuTen || 'Chưa gán') + '</b></span>' +
        '</div>' +
        (a.ghiChu ? '<div class="small muted mt-4">' + esc(a.ghiChu) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>' : emptyBox('Chưa có Chi đoàn Ấp nào. Bấm “Thêm Ấp” để bắt đầu.', 'users')) +
    '</div>';

  return infoForm + apList;
}

/* ------------------------------------------------------------------ */
/* TAB: CẤU HÌNH                                                      */
/* ------------------------------------------------------------------ */

function sysConfigPanel(items) {
  var order = ['Điểm thưởng', 'Học tập & đoàn phí', 'Thanh toán VietQR'];
  var groups = {};
  items.forEach(function (it) {
    if (it.nhom === 'Thông tin đơn vị') return;
    if (!groups[it.nhom]) groups[it.nhom] = [];
    groups[it.nhom].push(it);
  });

  var intro = '<div class="alert-row calm">' + icon('bulb', 17) +
    '<div><b>Thay đổi có hiệu lực ngay</b><span>Các mức điểm, mức đoàn phí và thông tin VietQR được dùng cho toàn bộ Chi đoàn Ấp.</span></div></div>';

  var forms = order.filter(function (n) { return groups[n]; }).map(function (nhom) {
    return '<form class="card" data-sys-form="config">' +
      '<div class="card-hd"><div><div class="card-title">' + icon(nhom === 'Điểm thưởng' ? 'star' : nhom.indexOf('Thanh toán') === 0 ? 'wallet' : 'book', 17) + ' ' + esc(nhom) + '</div>' +
      '<div class="card-sub">' + groups[nhom].length + ' tham số cấu hình</div></div></div>' +
      '<div class="sys-form-grid">' + groups[nhom].map(function (it) {
        return '<div class="field"><label>' + esc(it.moTa) + '</label>' +
          '<input class="input" data-cfg="' + esc(it.khoa) + '" value="' + esc(it.giaTri) + '"' +
          (it.kieu === 'number' ? ' type="number" min="0" step="1" inputmode="numeric"' : '') + '>' +
          '<div class="small muted mt-4">' + esc(it.khoa) + '</div></div>';
      }).join('') + '</div>' +
      '<button class="btn btn-primary mt-12" type="submit">' + icon('check', 15) + ' Lưu ' + esc(nhom.toLowerCase()) + '</button>' +
      '</form>';
  }).join('');

  return intro + forms;
}

/* ------------------------------------------------------------------ */
/* TAB: TÀI KHOẢN                                                     */
/* ------------------------------------------------------------------ */

function sysAccountPanel(accounts, q, trashMode, trashCount) {
  var search = '<form class="sys-search" data-sys-form="account-search">' +
    '<input class="input" name="q" value="' + esc(q) + '" placeholder="Tìm theo tên, mã định danh, số điện thoại...">' +
    '<button class="btn btn-ghost" type="submit">' + icon('users', 15) + ' Tìm</button>' +
    '<button class="btn btn-ghost" type="button" data-sys-act="account-trash">' +
      (trashMode ? '← Danh sách hoạt động' : 'Thùng rác (' + (trashCount || 0) + ')') + '</button>' +
    (trashMode ? '' : '<button class="btn btn-primary" type="button" data-sys-act="account-new">' + icon('plus', 15) + ' Tạo tài khoản</button>') +
    '</form>';

  var rows = accounts.map(function (a) {
    var capTone = roleTone(a.cap);
    var locked = a.trangThai === 'Tạm khóa';
    return '<div class="sys-account">' +
      '<div class="sys-account-main">' +
        '<div class="li-avatar ' + (a.cap <= 1 ? 'red' : '') + '">' + esc(initials(a.hoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(a.hoTen) + '</b>' +
          '<span>' + esc(a.maDD) + ' · ' + esc(a.chucVu) + '</span>' +
          '<span>' + esc(a.tenAp) + ' · ' + esc(a.dienThoai || 'Chưa có SĐT') + '</span></div>' +
      '</div>' +
      '<div class="sys-account-side">' +
        '<div class="row" style="gap:5px;justify-content:flex-end">' +
          '<span class="badge badge-' + capTone + '">C' + a.cap + '</span>' +
          (trashMode ? statusBadge('Đã xóa') : statusBadge(a.trangThai)) +
        '</div>' +
        '<div class="row" style="gap:5px;justify-content:flex-end;margin-top:6px">' +
          (trashMode
            ? '<button class="btn btn-primary btn-sm" data-sys-act="account-restore" data-ma="' + esc(a.maDD) + '">Khôi phục</button>'
            : '<button class="btn btn-ghost btn-sm" data-sys-act="account-edit" data-ma="' + esc(a.maDD) + '">' + icon('edit', 13) + ' Sửa</button>' +
              (a.cap === 0 ? '' :
                '<button class="btn btn-ghost btn-sm" data-sys-act="account-toggle" data-ma="' + esc(a.maDD) + '" data-st="' + (locked ? 'Đang hoạt động' : 'Tạm khóa') + '">' +
                  (locked ? 'Mở khóa' : 'Khóa') + '</button>' +
                '<button class="btn btn-ghost btn-sm" data-sys-act="account-reset" data-ma="' + esc(a.maDD) + '">Cấp lại PIN</button>')) +
        '</div>' +
        (trashMode
          ? '<div class="small muted mt-4">Xóa lúc ' + esc(fmtDate(a.ngayXoa)) + ' bởi ' + esc(a.nguoiXoa || '—') + '</div>'
          : (a.cap === 0 ? '<div class="small muted mt-4">Mật khẩu quản trị</div>' : '')) +
      '</div></div>';
  }).join('');

  return search +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon(trashMode ? 'inbox' : 'shield', 17) + ' ' +
    (trashMode ? 'Thùng rác tài khoản' : 'Danh sách tài khoản') + ' (' + accounts.length + ')</div>' +
    '<div class="card-sub">' + (trashMode
      ? 'Tài khoản đã xóa mềm — có thể khôi phục, dữ liệu lịch sử vẫn được giữ nguyên'
      : 'Cấp 0 quản trị · Cấp 1–3 cán bộ · Cấp 4 đoàn viên · Sửa hồ sơ Chủ tịch, Bí thư Chi bộ Xã') + '</div></div></div>' +
    (accounts.length ? '<div class="sys-accounts">' + rows + '</div>' : emptyBox(trashMode ? 'Thùng rác trống.' : 'Không tìm thấy tài khoản phù hợp.', 'users')) +
    '</div>';
}

/* ------------------------------------------------------------------ */
/* TAB: SAO LƯU & ĐỐI SOÁT                                            */
/* ------------------------------------------------------------------ */

function sysBackupPanel(data) {
  var items = (data && data.items) || [];
  return '<div class="card"><div class="card-hd"><div>' +
    '<div class="card-title">' + icon('inbox', 17) + ' Sao lưu bảng tính</div>' +
    '<div class="card-sub">Bản sao lưu tự động hằng ngày 02:00 trên Google Drive · giữ tối đa ' + (data.soBanGiuLai || 30) + ' bản</div></div>' +
    '<button class="btn btn-primary btn-sm" data-sys-act="backup-now">' + icon('check', 14) + ' Sao lưu ngay</button></div>' +
    '<div class="sys-unit-meta"><span>Lần cuối: <b>' + esc(data.lanCuoi ? fmtDate(data.lanCuoi) : 'Chưa sao lưu') + '</b></span>' +
    '<span>Tổng số bản: <b>' + items.length + '</b></span></div>' +
    '<p class="small muted mt-8">Kiểm tra để xác nhận bản sao mở được và đủ 19 sheet. Phục hồi chỉ tạo <b>bản sao mới</b> trong thư mục CD6_Restore — không ghi đè dữ liệu đang chạy.</p>' +
    (items.length ? '<div class="sys-logs mt-12">' + items.map(function (f) {
      return '<div class="sys-log"><div class="li-avatar red">' + icon('inbox', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(f.ten) + '</b>' +
        '<span>' + esc(fmtDate(f.luc)) + ' · ' + Math.max(1, Math.round(Number(f.size || 0) / 1024)) + ' KB</span></div>' +
        '<div class="li-right" style="display:flex;gap:6px">' +
          '<button class="btn btn-ghost btn-sm" data-sys-act="backup-verify" data-id="' + esc(f.id) + '">Kiểm tra</button>' +
          '<button class="btn btn-ghost btn-sm" data-sys-act="backup-restore" data-id="' + esc(f.id) + '" data-ten="' + esc(f.ten) + '">Phục hồi</button>' +
        '</div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có bản sao lưu nào.', 'inbox')) +
    '</div>' +
    '<div class="card mt-16"><div class="card-hd"><div>' +
    '<div class="card-title">' + icon('trend', 17) + ' Đối soát điểm rèn luyện</div>' +
    '<div class="card-sub">Kiểm tra công thức Diem = DiemNen + tổng sổ điểm, chỉ sửa các bản ghi bị lệch</div></div>' +
    '<button class="btn btn-ghost btn-sm" data-sys-act="reconcile">' + icon('check', 14) + ' Đối soát ngay</button></div>' +
    '<p class="small muted">Nên chạy sau khi nhập liệu thủ công trên Google Sheets hoặc khi điểm hiển thị không khớp sổ điểm.</p>' +
    '</div>';
}

/* ------------------------------------------------------------------ */
/* TAB: BÁO CÁO THÁNG / QUÝ / NĂM                                      */
/* ------------------------------------------------------------------ */

function sysReportPanel(d, aps, f) {
  if (!d || d.loi) {
    return '<div class="card"><div class="alert-row warn">' + icon('alert', 16) +
      '<span>Không tải được báo cáo: ' + esc((d && d.loi) || 'lỗi không xác định') + '</span></div></div>';
  }
  var kpi = '<div class="kpi-grid">' +
    kpiCard({ label: 'Đoàn viên', value: d.doanVien, unit: 'đồng chí', hint: d.canBo + ' cán bộ Cấp 1–3', tone: 'red', icon: 'users' }) +
    kpiCard({ label: 'Lượt điểm danh', value: d.diemDanh.soLuot, unit: 'lượt', hint: d.diemDanh.soPhien + ' phiên · ' + d.diemDanh.soNguoi + ' người', tone: 'blue', icon: 'qr' }) +
    kpiCard({ label: 'Tỷ lệ đóng phí', value: d.doanPhi.tyLeDong + '%', unit: '', hint: d.doanPhi.soDaDong + '/' + d.doanVien + ' đoàn viên', tone: 'green', icon: 'wallet' }) +
    kpiCard({ label: 'Cân đối quỹ', value: fmtMoney(d.doanPhi.ton), unit: 'đ', hint: 'Thu ' + fmtMoney(d.doanPhi.thu) + ' · Chi ' + fmtMoney(d.doanPhi.chi), tone: 'orange', icon: 'trend' }) +
    '</div>';

  var apOptions = ['<option value="">Toàn Xã</option>'].concat((aps || []).map(function (a) {
    return '<option value="' + esc(a.maAp) + '"' + (f.maAp === a.maAp ? ' selected' : '') + '>' + esc(a.tenAp) + '</option>';
  })).join('');

  var form = '<form class="card" data-sys-form="report-filter">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('trend', 17) + ' Báo cáo tháng · quý · năm</div>' +
    '<div class="card-sub">Chọn khoảng thời gian và phạm vi Ấp; xuất CSV UTF-8 hoặc in PDF bằng trình duyệt</div></div></div>' +
    '<div class="sys-form-grid">' +
      '<div class="field"><label>Từ ngày</label><input class="input" type="date" name="tuNgay" value="' + esc(f.tuNgay) + '" required></div>' +
      '<div class="field"><label>Đến ngày</label><input class="input" type="date" name="denNgay" value="' + esc(f.denNgay) + '" required></div>' +
      '<div class="field"><label>Phạm vi</label><select class="input" name="maAp">' + apOptions + '</select></div>' +
      '<div class="field"><label>Loại xuất chi tiết</label><select class="input" name="loai">' +
        [['doanVien', 'Danh sách đoàn viên'], ['diemDanh', 'Điểm danh'], ['doanPhi', 'Đoàn phí'], ['360', 'Tự đánh giá 360°']].map(function (x) {
          return '<option value="' + x[0] + '"' + (f.loai === x[0] ? ' selected' : '') + '>' + x[1] + '</option>';
        }).join('') + '</select></div>' +
    '</div>' +
    '<div class="row mt-12" style="gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" type="submit">' + icon('trend', 15) + ' Xem báo cáo</button>' +
      '<button class="btn btn-ghost" type="button" data-sys-act="report-export">' + icon('inbox', 15) + ' Tải CSV</button>' +
      '<button class="btn btn-ghost" type="button" data-sys-act="report-print">' + icon('print', 15) + ' In / PDF</button>' +
    '</div>' +
    '<p class="small muted mt-8">Báo cáo phản ánh dữ liệu tại thời điểm xem. Tệp CSV có BOM UTF-8 để mở đúng tiếng Việt trong Excel.</p>' +
    '</form>';

  var apRows = (d.theoAp || []).map(function (a) {
    return '<tr><td><b>' + esc(a.tenAp) + '</b><div class="small muted">' + esc(a.maAp) + '</div></td>' +
      '<td>' + a.doanVien + '</td><td>' + a.diemDanh + '</td><td>' + a.daDongPhi + '</td>' +
      '<td>' + fmtMoney(a.thu) + '</td></tr>';
  }).join('');

  var table = '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('users', 17) + ' Tổng hợp theo Chi đoàn Ấp</div>' +
    '<div class="card-sub">' + esc(d.tuNgay) + ' – ' + esc(d.denNgay) + (d.maAp ? (' · ' + esc(d.maAp)) : ' · Toàn Xã') + '</div></div></div>' +
    '<div class="table-wrap"><table class="tb"><thead><tr><th>Chi đoàn Ấp</th><th>Đoàn viên</th><th>Lượt điểm danh</th><th>Đã đóng phí</th><th>Thu (đ)</th></tr></thead><tbody>' +
    (apRows || '<tr><td colspan="5" class="small muted">Chưa có dữ liệu trong khoảng thời gian này.</td></tr>') +
    '</tbody></table></div></div>';

  var extra = '<div class="two-col">' +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('star', 17) + ' Tự đánh giá 360°</div>' +
      '<div class="card-sub">' + d.tuDanhGia.soPhieu + ' phiếu trong kỳ</div></div></div>' +
      (Object.keys(d.tuDanhGia.xepLoai || {}).length
        ? '<div class="list">' + Object.keys(d.tuDanhGia.xepLoai).map(function (k) {
          return '<div class="list-item"><div class="li-main"><b>' + esc(k) + '</b></div>' +
            '<div class="li-right"><b>' + d.tuDanhGia.xepLoai[k] + '</b><span class="small muted">phiếu</span></div></div>';
        }).join('') + '</div>'
        : emptyBox('Chưa có phiếu tự đánh giá trong kỳ.', 'star')) +
    '</div>' +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('award', 17) + ' Điểm rèn luyện dẫn đầu</div>' +
      '<div class="card-sub">Top 5 đoàn viên theo điểm hiện tại</div></div></div>' +
      ((d.top || []).length ? '<div class="list">' + d.top.map(function (m, i) {
        return '<div class="list-item"><div class="li-avatar ' + (i === 0 ? 'red' : '') + '">' + (i + 1) + '</div>' +
          '<div class="li-main"><b>' + esc(m.hoTen) + '</b><span>' + esc(m.maDD) + ' · ' + esc(m.maAp) + '</span></div>' +
          '<div class="li-right"><b>' + m.diem + '</b><span class="small muted">điểm</span></div></div>';
      }).join('') + '</div>' : emptyBox('Chưa có dữ liệu đoàn viên.', 'award')) +
    '</div>' +
  '</div>';

  return kpi + form + table + extra;
}

/* ------------------------------------------------------------------ */
/* TAB: NHẮC VIỆC ZALO OA / EMAIL                                      */
/* ------------------------------------------------------------------ */

function sysNotifyPanel(data, aps) {
  data = data || { items: [], loai: {} };
  var loai = data.loai || {};
  var loaiOptions = Object.keys(loai).map(function (k) {
    return '<option value="' + esc(k) + '">' + esc(loai[k]) + '</option>';
  }).join('');
  var apOptions = ['<option value="">Toàn Xã</option>'].concat((aps || []).map(function (a) {
    return '<option value="' + esc(a.maAp) + '">' + esc(a.tenAp) + '</option>';
  })).join('');

  var form = '<form class="card" data-sys-form="notify-send">' +
    '<div class="card-hd"><div><div class="card-title">' + icon('send', 17) + ' Tạo nhắc việc</div>' +
    '<div class="card-sub">Gửi trong ứng dụng, qua email hoặc Zalo OA (nếu đã cấu hình webhook)</div></div></div>' +
    '<div class="sys-form-grid">' +
      '<div class="field"><label>Đối tượng nhận</label><select class="input" name="loai">' + loaiOptions + '</select></div>' +
      '<div class="field"><label>Phạm vi Ấp</label><select class="input" name="maAp">' + apOptions + '</select></div>' +
      '<div class="field"><label>Kênh gửi</label><select class="input" name="kenh">' +
        '<option value="inapp">Trong ứng dụng</option><option value="email">Email</option><option value="zalo">Zalo OA</option>' +
      '</select></div>' +
      '<div class="field"><label>Email nhận (nếu gửi email)</label><input class="input" name="emailNhan" type="email" placeholder="bithu@example.com"></div>' +
    '</div>' +
    '<div class="field"><label>Tiêu đề</label><input class="input" name="tieuDe" required maxlength="120" placeholder="VD: Nhắc nộp đoàn phí năm 2026"></div>' +
    '<div class="field"><label>Nội dung</label><textarea class="input" name="noiDung" rows="3" required placeholder="Nhập nội dung nhắc việc..."></textarea></div>' +
    '<div class="row mt-12" style="gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" type="submit">' + icon('send', 15) + ' Gửi nhắc việc</button>' +
      '<button class="btn btn-ghost" type="button" data-sys-act="notify-preview">' + icon('users', 15) + ' Xem trước người nhận</button>' +
    '</div>' +
    '<p class="small muted mt-8">Kênh Zalo OA và email cần cấu hình <b>ZALO_WEBHOOK_URL</b> / email nhận trong Script Properties. Nếu chưa cấu hình, hệ thống vẫn lưu thông báo để hiển thị trong ứng dụng.</p>' +
    '</form>';

  var items = data.items || [];
  var list = '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('chat', 17) + ' Nhắc việc đã phát hành</div>' +
    '<div class="card-sub">' + items.length + ' thông báo gần nhất</div></div></div>' +
    (items.length ? '<div class="sys-logs">' + items.map(function (n) {
      var tone = /Lỗi/.test(n.trangThai) ? 'red' : (/chưa|Chưa/.test(n.trangThai) ? 'orange' : 'green');
      return '<div class="sys-log"><div class="li-avatar ' + (tone === 'green' ? 'green' : 'red') + '">' + icon('send', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(n.tieuDe) + '</b>' +
          '<span>' + esc((loai[n.loai] || n.loai)) + ' · ' + esc(n.doiTuong === 'ALL' ? 'Toàn Xã' : n.doiTuong) + ' · ' + esc(n.kenh) + '</span>' +
          '<span class="small muted">' + esc(fmtDate(n.luc)) + ' · ' + n.soNguoi + ' người · bởi ' + esc(n.nguoiTao) + '</span></div>' +
        '<div class="li-right">' + badge(n.trangThai, tone) + '</div></div>';
    }).join('') + '</div>' : emptyBox('Chưa có nhắc việc nào.', 'chat')) +
    '</div>';

  return form + list;
}

/* ------------------------------------------------------------------ */
/* TAB: SỨC KHỎE HỆ THỐNG                                             */
/* ------------------------------------------------------------------ */

function sysHealthPanel(d) {
  if (!d || d.loi) {
    return '<div class="card"><div class="alert-row warn">' + icon('alert', 16) +
      '<span>Không kiểm tra được sức khỏe hệ thống: ' + esc((d && d.loi) || 'lỗi không xác định') + '</span></div></div>';
  }
  var tone = d.trangThai === 'ok' ? 'green' : (d.trangThai === 'loi' ? 'red' : 'orange');
  var label = d.trangThai === 'ok' ? 'Hệ thống khỏe' : (d.trangThai === 'loi' ? 'Có lỗi nghiêm trọng' : 'Có cảnh báo');
  return '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('check', 17) + ' Sức khỏe hệ thống</div>' +
    '<div class="card-sub">Kiểm tra cấu trúc bảng tính, lược đồ, sao lưu, cấu hình và khóa ký phiên</div></div>' +
    '<button class="btn btn-ghost btn-sm" data-sys-act="health-refresh">' + icon('check', 14) + ' Kiểm tra lại</button></div>' +
    '<div class="alert-row ' + (tone === 'green' ? 'calm' : 'warn') + '">' + icon(tone === 'green' ? 'check' : 'alert', 17) +
      '<div><b>' + esc(label) + '</b><span>' + esc(d.message) + '</span></div></div>' +
    '<div class="kpi-grid mt-12">' +
      kpiCard({ label: 'Bảng dữ liệu', value: d.soSheet, unit: 'sheet', hint: 'Lược đồ v' + d.phienBanSchema, tone: 'blue', icon: 'inbox' }) +
      kpiCard({ label: 'Bản sao lưu', value: d.soBanSaoLuu, unit: 'bản', hint: d.lanSaoLuuCuoi ? ('Cuối: ' + fmtDate(d.lanSaoLuuCuoi)) : 'Chưa sao lưu', tone: 'green', icon: 'inbox' }) +
      kpiCard({ label: 'Quản trị', value: d.adminCount, unit: 'tài khoản', hint: d.memberCount + ' đoàn viên', tone: 'red', icon: 'shield' }) +
      kpiCard({ label: 'Phiên bản áp dụng', value: d.phienBanApDung, unit: '', hint: 'Mới nhất ' + d.phienBanSchema, tone: 'orange', icon: 'settings' }) +
    '</div>' +
    '<div class="sys-logs mt-12">' + (d.kiemTra || []).map(function (x) {
      var t = x.trangThai === 'ok' ? 'green' : (x.trangThai === 'loi' ? 'red' : 'orange');
      return '<div class="sys-log"><div class="li-avatar ' + (t === 'green' ? 'green' : 'red') + '">' +
        icon(x.trangThai === 'ok' ? 'check' : 'alert', 15) + '</div>' +
        '<div class="li-main"><b>' + esc(x.ten) + '</b><span>' + esc(x.chiTiet) + '</span></div>' +
        '<div class="li-right">' + badge(x.trangThai === 'ok' ? 'Đạt' : (x.trangThai === 'loi' ? 'Lỗi' : 'Cảnh báo'), t) + '</div></div>';
    }).join('') + '</div></div>';
}



function sysLogPanel(data, q) {
  var search = '<form class="sys-search" data-sys-form="log-search">' +
    '<input class="input" name="q" value="' + esc(q) + '" placeholder="Tìm theo người thực hiện, hành động, chi tiết...">' +
    '<button class="btn btn-ghost" type="submit">' + icon('clock', 15) + ' Lọc</button>' +
    '</form>';

  var items = data.items || [];
  return search +
    '<div class="card"><div class="card-hd"><div><div class="card-title">' + icon('clock', 17) + ' Nhật ký hệ thống</div>' +
    '<div class="card-sub">' + data.tong + ' bản ghi · hiển thị ' + items.length + ' mới nhất</div></div></div>' +
    (items.length ? '<div class="sys-logs">' + items.map(function (l) {
      return '<div class="sys-log">' +
        '<div class="li-avatar red">' + esc(initials(l.hoTen)) + '</div>' +
        '<div class="li-main"><b>' + esc(l.hanhDong) + '</b>' +
          '<span>' + esc(l.hoTen) + ' (' + esc(l.maDD) + ') · ' + fmtDate(l.thoiGian) + '</span>' +
          (l.chiTiet ? '<span class="small muted">' + esc(l.chiTiet) + '</span>' : '') + '</div>' +
      '</div>';
    }).join('') + '</div>' : emptyBox('Chưa có bản ghi nhật ký phù hợp.', 'clock')) +
    '</div>';
}

/* ------------------------------------------------------------------ */
/* MODAL: THÊM / SỬA ẤP                                               */
/* ------------------------------------------------------------------ */

function sysApModal(ap) {
  var accounts = sysData().accounts || [];
  var biThuOptions = ['<option value="">— Chưa gán —</option>'].concat(
    accounts.filter(function (a) { return a.cap === 3; }).map(function (a) {
      return '<option value="' + esc(a.maDD) + '"' + (ap && ap.biThu === a.maDD ? ' selected' : '') + '>' +
        esc(a.hoTen) + ' (' + esc(a.maDD) + ' · ' + esc(a.tenAp) + ')</option>';
    })
  ).join('');

  openModal({
    title: ap ? 'Cập nhật Chi đoàn Ấp' : 'Thêm Chi đoàn Ấp',
    sub: ap ? (ap.maAp + ' · ' + ap.tenAp) : 'Mã Ấp được cấp tự động (AP01, AP02...)',
    body: '<form data-sys-form="ap">' +
      (ap ? '<input type="hidden" name="maAp" value="' + esc(ap.maAp) + '">' : '') +
      '<div class="field"><label>Tên Ấp / Chi đoàn Ấp</label>' +
        '<input class="input" name="tenAp" value="' + esc(ap ? ap.tenAp : '') + '" required placeholder="VD: Ấp Tân Xuân"></div>' +
      '<div class="field"><label>Bí thư Chi đoàn Ấp</label><select class="input" name="biThu">' + biThuOptions + '</select></div>' +
      '<div class="field"><label>Chỉ tiêu đoàn viên</label>' +
        '<input class="input" name="chiTieu" type="number" min="0" step="1" value="' + esc(ap ? ap.chiTieu : 0) + '"></div>' +
      '<div class="field"><label>Ghi chú</label>' +
        '<input class="input" name="ghiChu" value="' + esc(ap ? ap.ghiChu : '') + '" placeholder="Thông tin bổ sung (không bắt buộc)"></div>' +
      '<button class="btn btn-primary btn-block mt-12" type="submit">' + icon('check', 15) + ' ' + (ap ? 'Lưu thay đổi' : 'Thêm Ấp') + '</button>' +
    '</form>'
  });
}

/* ------------------------------------------------------------------ */
/* MODAL: TẠO TÀI KHOẢN                                               */
/* ------------------------------------------------------------------ */

function sysAccountModal(account) {
  if (account) {
    var laChucDanhXa = account.cap === 1 || account.cap === 2;
    var nhanChucDanh = account.cap === 1 ? 'Chủ tịch Ủy ban Hội LHTN Việt Nam Xã' : 'Bí thư Chi bộ Xã';
    openModal({
      title: 'Cập nhật thông tin tài khoản',
      sub: account.maDD + ' · Cấp ' + account.cap + ' · ' + (account.chucVu || ''),
      body: '<form data-sys-form="account-edit">' +
        '<input type="hidden" name="maDD" value="' + esc(account.maDD) + '">' +
        '<div class="field"><label>Họ và tên</label>' +
          '<input class="input" name="hoTen" required value="' + esc(account.hoTen) + '"></div>' +
        '<div class="field"><label>Chức vụ · Đơn vị</label>' +
          '<input class="input" value="' + esc((account.chucVu || '') + ' · ' + (account.tenAp || '')) + '" disabled></div>' +
        '<div class="field"><label>Số điện thoại</label>' +
          '<input class="input" name="dienThoai" inputmode="numeric" value="' + esc(account.dienThoai || '') + '" placeholder="09xxxxxxxx"></div>' +
        '<div class="field"><label>Ngày sinh</label>' +
          '<input class="input" name="ngaySinh" value="' + esc(account.ngaySinh || '') + '" placeholder="dd/mm/yyyy"></div>' +
        '<div class="field"><label>Ghi chú</label>' +
          '<input class="input" name="ghiChu" value="' + esc(account.ghiChu || '') + '" placeholder="Thông tin bổ sung (không bắt buộc)"></div>' +
        (laChucDanhXa
          ? '<div class="small muted mt-4">Đổi họ tên sẽ đồng bộ thông tin ' + esc(nhanChucDanh) + ' tại tab Đơn vị.</div>'
          : '') +
        '<button class="btn btn-primary btn-block mt-12" type="submit">' + icon('check', 15) + ' Lưu thay đổi</button>' +
      '</form>'
    });
    return;
  }

  var aps = sysData().aps || [];
  openModal({
    title: 'Tạo tài khoản mới',
    sub: 'PIN mặc định 123456 · Đoàn viên nên dùng chức năng thêm đoàn viên',
    body: '<form data-sys-form="account">' +
      '<div class="field"><label>Mã định danh</label>' +
        '<input class="input" name="maDD" required placeholder="VD: BT_AP04" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Họ và tên</label>' +
        '<input class="input" name="hoTen" required placeholder="Nguyễn Văn A"></div>' +
      '<div class="field"><label>Cấp tài khoản</label><select class="input" name="cap">' +
        '<option value="1">Cấp 1 · Chủ Tịch Ủy Ban Hội LHTN Việt Nam Xã</option>' +
        '<option value="2">Cấp 2 · Bí thư Chi bộ Xã</option>' +
        '<option value="3">Cấp 3 · Bí thư Chi đoàn Ấp</option>' +
        '<option value="4">Cấp 4 · Đoàn viên Ấp</option></select></div>' +
      '<div class="field"><label>Chi đoàn Ấp</label><select class="input" name="maAp">' +
        '<option value="">— Không áp dụng cho Cấp 1 và Cấp 2 —</option>' +
        aps.map(function (a) { return '<option value="' + esc(a.maAp) + '">' + esc(a.tenAp) + '</option>'; }).join('') +
        '</select></div>' +
      '<div class="field"><label>Số điện thoại</label>' +
        '<input class="input" name="dienThoai" inputmode="numeric" placeholder="09xxxxxxxx"></div>' +
      '<div class="field"><label>Ngày sinh</label>' +
        '<input class="input" name="ngaySinh" placeholder="dd/mm/yyyy"></div>' +
      '<button class="btn btn-primary btn-block mt-12" type="submit">' + icon('plus', 15) + ' Tạo tài khoản</button>' +
    '</form>'
  });
}

/* ------------------------------------------------------------------ */
/* SỰ KIỆN                                                            */
/* ------------------------------------------------------------------ */

document.addEventListener('click', function (e) {
  var el = e.target.closest('[data-sys-act]');
  if (!el) return;
  var act = el.dataset.sysAct;
  try {
    if (act === 'tab') {
      S.data.sysTab = el.dataset.tab || 'donVi';
      refresh();
    } else if (act === 'report-print') {
      window.print();
    } else if (act === 'report-export') {
      var rpForm = document.querySelector('form[data-sys-form="report-filter"]');
      var rp = sysFormValues(rpForm);
      API.call('report.export', {
        tuNgay: rp.tuNgay, denNgay: rp.denNgay, maAp: rp.maAp, loai: rp.loai
      }).then(function (r) {
        if (sysDownloadFile(r.tenFile, r.mime, r.noiDung)) toast(r.message, 'ok');
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'health-refresh') {
      refresh();
    } else if (act === 'notify-preview') {
      var nf = document.querySelector('form[data-sys-form="notify-send"]');
      var nv = sysFormValues(nf);
      API.call('admin.notify.preview', { loai: nv.loai, maAp: nv.maAp }).then(function (r) {
        S.data.notifyPreview = r;
        openModal({
          title: 'Xem trước người nhận',
          sub: r.soNguoi + ' người · ' + (r.maAp || 'Toàn Xã'),
          body: '<div class="alert-row ' + (r.soNguoi ? 'calm' : 'warn') + '">' + icon(r.soNguoi ? 'check' : 'alert', 16) +
              '<div><b>' + esc(r.message) + '</b><span>Đối tượng: ' + esc(nv.loai) + '</span></div></div>' +
            ((r.mauNguoiNhan || []).length ? '<div class="list mt-12">' + r.mauNguoiNhan.map(function (x) {
              return '<div class="list-item"><div class="li-avatar">' + esc(initials(x.hoTen)) + '</div>' +
                '<div class="li-main"><b>' + esc(x.hoTen) + '</b><span>' + esc(x.maDD) + ' · ' + esc(x.maAp || '—') + '</span></div>' +
                '<div class="li-right small muted">' + esc(x.dienThoai || '') + '</div></div>';
            }).join('') + '</div>' : '') +
            '<div class="note mt-12"><b>Nội dung gợi ý</b><div class="small mt-4">' + esc(r.noiDungMau) + '</div></div>' +
            '<button class="btn btn-primary btn-block mt-12" data-sys-act="notify-apply-mau">Dùng nội dung gợi ý</button>' +
            '<button class="btn btn-ghost btn-block mt-8" data-sys-act="close">Đóng</button>'
        });
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'notify-apply-mau') {
      var pv = S.data.notifyPreview || {};
      var nf2 = document.querySelector('form[data-sys-form="notify-send"]');
      if (nf2) {
        var tieuDe = nf2.querySelector('[name="tieuDe"]');
        var noiDung = nf2.querySelector('[name="noiDung"]');
        if (tieuDe && !tieuDe.value) tieuDe.value = sysNotifyTieuDe(nf2.querySelector('[name="loai"]').value);
        if (noiDung) noiDung.value = pv.noiDungMau || '';
      }
      closeModal();
      toast('Đã điền nội dung gợi ý. Kiểm tra lại trước khi gửi.', 'ok');
    } else if (act === 'ap-new') {
      sysApModal(null);
    } else if (act === 'ap-edit') {
      var ap = (sysData().aps || []).filter(function (x) { return x.maAp === el.dataset.ma; })[0];
      if (ap) sysApModal(ap);
    } else if (act === 'ap-delete') {
      var target = (sysData().aps || []).filter(function (x) { return x.maAp === el.dataset.ma; })[0];
      openModal({
        title: 'Xóa Chi đoàn Ấp?',
        sub: target ? target.tenAp + ' (' + target.maAp + ')' : '',
        body: '<p class="small muted">Chỉ xóa được khi Ấp không còn tài khoản nào. Thao tác này không thể hoàn tác.</p>',
        footer: '<div class="row" style="gap:8px"><button class="btn btn-ghost grow" data-sys-act="close">Hủy</button>' +
          '<button class="btn btn-danger grow" data-sys-act="ap-delete-ok" data-ma="' + esc(el.dataset.ma) + '">Xóa Ấp</button></div>'
      });
    } else if (act === 'ap-delete-ok') {
      API.call('admin.ap.delete', { maAp: el.dataset.ma }).then(function (r) {
        closeModal();
        toast(r.message, 'ok');
        refresh();
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'account-new') {
      sysAccountModal();
    } else if (act === 'account-trash') {
      S.data.sysTrash = !S.data.sysTrash;
      refresh();
    } else if (act === 'account-restore') {
      API.call('admin.account.restore', { maDD: el.dataset.ma }).then(function (r) {
        toast(r.message, 'ok');
        refresh();
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'backup-now') {
      API.call('admin.backup.now', {}).then(function (r) {
        toast(r.message, 'ok');
        refresh();
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'backup-verify') {
      API.call('admin.backup.verify', { id: el.dataset.id }).then(function (r) {
        openModal({
          title: 'Kiểm tra bản sao lưu',
          sub: r.ten,
          body: '<div class="alert-row ' + (r.hopLe ? '' : 'warn') + '">' +
            icon(r.hopLe ? 'check' : 'alert', 16) + '<span>' + esc(r.message) + '</span></div>' +
            '<div class="sys-unit-meta mt-12"><span>Số sheet: <b>' + esc(r.soSheet) + '</b></span>' +
            '<span>Dung lượng: <b>' + Math.max(1, Math.round(Number(r.size || 0) / 1024)) + ' KB</b></span>' +
            '<span>Thời điểm: <b>' + esc(fmtDate(r.luc)) + '</b></span></div>' +
            ((r.thieu && r.thieu.length)
              ? '<p class="small muted mt-8">Thiếu: ' + esc(r.thieu.join(', ')) + '</p>'
              : '') +
            '<button class="btn btn-ghost btn-block mt-12" data-sys-act="close">Đóng</button>'
        });
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'backup-restore') {
      openModal({
        title: 'Tạo bản phục hồi',
        sub: el.dataset.ten || '',
        body: '<form data-sys-form="backup-restore">' +
          '<input type="hidden" name="id" value="' + esc(el.dataset.id) + '">' +
          '<div class="alert-row warn">' + icon('alert', 16) +
            '<span>Hệ thống tạo một bảng tính <b>mới</b> từ bản sao lưu trong thư mục CD6_Restore. Dữ liệu đang chạy không bị thay đổi.</span></div>' +
          '<div class="field mt-12"><label>Nhập <b>PHUC HOI</b> để xác nhận</label>' +
            '<input class="input" name="xacNhan" required autocomplete="off" placeholder="PHUC HOI"></div>' +
          '<button class="btn btn-primary btn-block mt-12" type="submit">' + icon('check', 15) + ' Tạo bản phục hồi</button>' +
        '</form>'
      });
    } else if (act === 'reconcile') {
      API.call('admin.reconcile', {}).then(function (r) {
        openModal({
          title: 'Kết quả đối soát điểm',
          sub: r.soTaiKhoan + ' tài khoản · ' + r.soLech + ' bản ghi lệch',
          body: '<div class="center" style="padding:8px 0">' +
            '<div class="login-logo">' + icon('check', 28) + '</div>' +
            '<p class="small muted mt-8">' + esc(r.message) + '</p></div>' +
            ((r.chiTiet && r.chiTiet.length)
              ? '<div class="list mt-12">' + r.chiTiet.map(function (x) {
                return '<div class="list-item"><div class="li-main"><b>' + esc(x.hoTen) + '</b>' +
                  '<span>' + esc(x.maDD) + '</span></div>' +
                  '<div class="li-right"><b>' + esc(x.truoc) + ' → ' + esc(x.sau) + '</b></div></div>';
              }).join('') + '</div>'
              : '')
        });
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'account-edit') {
      var acc = (sysData().accounts || []).filter(function (x) { return x.maDD === el.dataset.ma; })[0];
      if (acc) sysAccountModal(acc);
    } else if (act === 'account-toggle') {
      API.call('admin.account.status', { maDD: el.dataset.ma, trangThai: el.dataset.st }).then(function (r) {
        toast(r.message, 'ok');
        refresh();
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'account-reset') {
      API.call('admin.account.resetPin', { maDD: el.dataset.ma }).then(function (r) {
        openModal({
          title: 'Đã cấp lại PIN',
          sub: el.dataset.ma,
          body: '<div class="center" style="padding:8px 0">' +
            '<div class="login-logo">' + icon('shield', 28) + '</div>' +
            '<p class="small muted mt-8">Đọc PIN mới trực tiếp cho người dùng. Không gửi qua nhóm công khai.</p>' +
            '<div class="pin-display">' + esc(r.pin) + '</div></div>'
        });
      }).catch(function (err) { toast(err.message || String(err), 'err'); });
    } else if (act === 'change-password') {
      openModal({
        title: 'Đổi mật khẩu quản trị',
        sub: 'Mật khẩu được lưu dạng băm HMAC',
        body: '<form data-form="change-password">' +
          '<div class="field"><label>Mật khẩu hiện tại</label>' +
            '<input class="input" name="oldPassword" type="password" required></div>' +
          '<div class="field"><label>Mật khẩu mới (tối thiểu 8 ký tự)</label>' +
            '<input class="input" name="newPassword" type="password" minlength="8" required></div>' +
          '<div class="field"><label>Xác nhận mật khẩu mới</label>' +
            '<input class="input" name="confirmPassword" type="password" minlength="8" required></div>' +
          '<button class="btn btn-primary btn-block mt-12" type="submit">' + icon('check', 15) + ' Lưu mật khẩu</button>' +
        '</form>'
      });
    } else if (act === 'close') {
      closeModal();
    }
  } catch (err) {
    toast(err.message || String(err), 'err');
  }
});

document.addEventListener('submit', function (e) {
  var form = e.target.closest('form[data-sys-form]');
  if (!form) return;
  e.preventDefault();
  var kind = form.dataset.sysForm;
  var btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  var data = {};
  new FormData(form).forEach(function (v, k) { data[k] = v; });

  var task;
  if (kind === 'unit-info' || kind === 'config') {
    var items = [];
    if (kind === 'unit-info') {
      form.querySelectorAll('input[name]').forEach(function (inp) {
        items.push({ khoa: inp.name, giaTri: inp.value });
      });
    } else {
      form.querySelectorAll('[data-cfg]').forEach(function (inp) {
        items.push({ khoa: inp.dataset.cfg, giaTri: inp.value });
      });
    }
    task = API.call('admin.config.save', { items: items });
  } else if (kind === 'ap') {
    task = API.call('admin.ap.save', {
      maAp: data.maAp || '', tenAp: data.tenAp, biThu: data.biThu,
      chiTieu: data.chiTieu, ghiChu: data.ghiChu
    });
  } else if (kind === 'account') {
    task = API.call('admin.account.create', {
      maDD: data.maDD, hoTen: data.hoTen, cap: data.cap, maAp: data.maAp,
      dienThoai: data.dienThoai, ngaySinh: data.ngaySinh
    });
  } else if (kind === 'account-edit') {
    task = API.call('admin.account.update', {
      maDD: data.maDD, hoTen: data.hoTen, dienThoai: data.dienThoai,
      ngaySinh: data.ngaySinh, ghiChu: data.ghiChu
    });
  } else if (kind === 'account-search') {
    S.data.sysAccountQ = data.q || '';
    task = Promise.resolve({ message: '' });
  } else if (kind === 'log-search') {
    S.data.sysLogQ = data.q || '';
    task = Promise.resolve({ message: '' });
  } else if (kind === 'report-filter') {
    S.data.reportFilter = {
      tuNgay: data.tuNgay, denNgay: data.denNgay, maAp: data.maAp || '', loai: data.loai || 'doanVien'
    };
    task = Promise.resolve({ message: '' });
  } else if (kind === 'notify-send') {
    task = API.call('admin.notify.send', {
      loai: data.loai, maAp: data.maAp, kenh: data.kenh,
      emailNhan: data.emailNhan, tieuDe: data.tieuDe, noiDung: data.noiDung
    });
  } else if (kind === 'backup-restore') {
    task = API.call('admin.backup.restoreCopy', { id: data.id, xacNhan: data.xacNhan });
  } else {
    task = Promise.resolve({ message: '' });
  }

  task.then(function (r) {
    if (kind === 'ap' || kind === 'account' || kind === 'account-edit') closeModal();
    if (kind === 'notify-send' && r && r.maTB) {
      openModal({
        title: 'Đã phát hành nhắc việc',
        sub: r.soNguoi + ' người nhận · ' + r.trangThai,
        body: '<div class="alert-row calm">' + icon('check', 16) + '<span>' + esc(r.message) + '</span></div>' +
          '<div class="field mt-12"><label>Nội dung để đăng nhóm Zalo (nếu cần)</label>' +
            '<textarea class="input" rows="4" readonly>' + esc(r.zaloText || '') + '</textarea></div>' +
          '<button class="btn btn-ghost btn-block mt-8" data-sys-act="close">Đóng</button>'
      });
      refresh();
      return;
    }
    if (kind === 'backup-restore' && r && r.id) {
      closeModal();
      openModal({
        title: 'Đã tạo bản phục hồi',
        sub: r.ten,
        body: '<div class="alert-row">' + icon('check', 16) + '<span>' + esc(r.message) + '</span></div>' +
          '<p class="small muted mt-8">Bản phục hồi nằm trong thư mục CD6_Restore trên Google Drive và chưa thay thế dữ liệu đang chạy.</p>' +
          (r.url && r.url !== '#' ? '<a class="btn btn-primary btn-block mt-12" href="' + esc(r.url) + '" target="_blank" rel="noopener">Mở bản phục hồi</a>' : '') +
          '<button class="btn btn-ghost btn-block mt-8" data-sys-act="close">Đóng</button>'
      });
      return;
    }
    if (r && r.message) toast(r.message, 'ok');
    if (kind === 'account-search' || kind === 'log-search') {
      S.view = 'system';
      refresh();
    } else {
      refresh();
    }
  }).catch(function (err) {
    toast(err.message || String(err), 'err');
  }).then(function () {
    if (btn) btn.disabled = false;
  });
});
