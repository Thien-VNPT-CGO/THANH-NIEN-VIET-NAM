/**
 * Services.gs — Toàn bộ nghiệp vụ 7 phân hệ của Hệ sinh thái Chi đoàn số 6.0.
 * Mọi hàm nhận (user, payload) và trả về dữ liệu thuần (JSON-serializable).
 */

/* ================================================================== */
/* 0. XÁC THỰC — ĐỊNH DANH + PIN 6 SỐ                                  */
/* ================================================================== */

/** Số lần nhập sai tối đa trước khi khóa tạm thời. */
var LOGIN_MAX_FAIL = 5;
/** Thời gian khóa tạm thời (phút). */
var LOGIN_LOCK_MINUTES = 15;

/**
 * Ghi nhận một lần đăng nhập sai và trả về thông báo an toàn.
 *
 * Tài khoản PIN (C1–C4) bị khóa tạm 15 phút sau 5 lần sai.
 * Riêng ADMIN không bị khóa cứng toàn hệ thống: nếu khóa theo tài khoản,
 * bất kỳ ai biết mã "ADMIN" cũng có thể khóa quản trị viên từ xa (DoS).
 * Vì vậy ADMIN chỉ bị ghi nhận sai + ghi nhật ký, mật khẩu mạnh và phiên
 * 12 giờ vẫn bảo vệ tài khoản; đăng nhập đúng sẽ xóa bộ đếm.
 */
function ghiNhanSai_(u) {
  var admin = isAdmin_(u);
  var so = Math.min(Number(u.SoLanSai || 0) + 1, 999);
  var patch = { SoLanSai: so };
  var daKhoa = !admin && so >= LOGIN_MAX_FAIL;
  if (daKhoa) {
    patch.SoLanSai = 0;
    patch.KhoaDen = Utilities.formatDate(
      new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000), TZ, 'yyyy-MM-dd HH:mm:ss'
    );
  } else if (admin) {
    // Xóa khóa cũ (nếu có) để bản nâng cấp không tiếp tục khóa ADMIN.
    patch.KhoaDen = '';
  }
  update_('DM_CanBo', 'MaDD', u.MaDD, patch);
  log_(u.MaDD, 'ĐĂNG NHẬP THẤT BẠI',
    daKhoa ? ('Khóa tạm thời ' + LOGIN_LOCK_MINUTES + ' phút')
      : (admin ? ('Lần sai ' + so + ' (quản trị — không khóa cứng)') : ('Lần sai ' + so + '/' + LOGIN_MAX_FAIL)));
  if (daKhoa) {
    return new Error('Bạn đã nhập sai ' + LOGIN_MAX_FAIL + ' lần. Tài khoản bị tạm khóa ' +
      LOGIN_LOCK_MINUTES + ' phút. Vui lòng thử lại sau.');
  }
  if (admin) return new Error('Mã PIN hoặc mật khẩu không đúng.');
  return new Error('Mã PIN hoặc mật khẩu không đúng. Còn ' + (LOGIN_MAX_FAIL - so) + ' lần thử.');
}

function svc_login(p) {
  var maDD = String(p.maDD || '').trim().toUpperCase();
  var matKhau = String(p.pin || '').trim();
  if (!maDD || !matKhau) throw new Error('Vui lòng nhập Mã định danh và mã PIN/mật khẩu.');

  var rlKey = 'login:' + maDD;
  var rl = rateLimitCheck_(rlKey, RATE_LIMIT_LOGIN);
  if (rl.blocked) {
    throw new Error('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.');
  }

  var u = findBy_('DM_CanBo', 'MaDD', maDD);
  if (!u) {
    // Cho phép đăng nhập bằng số điện thoại (bản ghi còn hoạt động đầu tiên).
    u = rows_('DM_CanBo').filter(function (r) {
      return String(r.DienThoai) === maDD && isActiveUser_(r);
    })[0];
  }
  if (!u || isDeleted_(u)) {
    rateLimitHit_(rlKey, RATE_LIMIT_WINDOW);
    throw new Error('Mã định danh hoặc mật khẩu không đúng.');
  }

  var khoaDen = parseDate_(u.KhoaDen);
  // ADMIN không bị khóa cứng theo tài khoản (chống DoS); C1–C4 vẫn khóa 15 phút.
  if (!isAdmin_(u) && khoaDen && khoaDen.getTime() > Date.now()) {
    var phut = Math.ceil((khoaDen.getTime() - Date.now()) / 60000);
    throw new Error('Tài khoản đang tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau ' + phut + ' phút.');
  }
  if (String(u.TrangThai) !== 'Đang hoạt động') {
    rateLimitHit_(rlKey, RATE_LIMIT_WINDOW);
    throw new Error(isAdmin_(u)
      ? 'Tài khoản quản trị đang bị tạm khóa.'
      : 'Tài khoản đang bị tạm khóa. Liên hệ Chủ tịch Hội LHTN Xã hoặc Bí thư Chi bộ Xã.');
  }

  var dung = isAdmin_(u) ? verifyMatKhau_(u, matKhau) : verifyPin_(u, matKhau);
  if (!dung) {
    rateLimitHit_(rlKey, RATE_LIMIT_WINDOW);
    throw ghiNhanSai_(u);
  }
  rateLimitReset_(rlKey);

  // Nâng cấp PIN chữ thô cũ sang PINHash ngay sau lần đăng nhập đầu tiên.
  var patch = { SoLanSai: 0, KhoaDen: '' };
  if (!isAdmin_(u) && hasLegacyPin_(u)) {
    patch.PINHash = hashPin_(u.MaDD, matKhau);
    patch.PIN = '';
  }
  update_('DM_CanBo', 'MaDD', u.MaDD, patch);
  u = findBy_('DM_CanBo', 'MaDD', u.MaDD);

  log_(u.MaDD, 'ĐĂNG NHẬP', isAdmin_(u) ? 'Quản trị hệ thống (Cấp 0)' : 'Cấp ' + u.Cap);
  return {
    token: issueToken_(u),
    profile: publicProfile_(u),
    config: svc_metaConfig().config,
    phienBan: configVersion_()
  };
}

function svc_metaConfig() {
  var c = cfg_();
  return {
    config: {
      tenXa: c.TEN_XA || 'Xã Tân Hòa',
      nam: Number(c.NAM_CONG_TAC || 2026),
      mucTieuDiem: Number(c.MUC_TIEU_DIEM || 300),
      doanPhiNam: Number(c.DOAN_PHI_NAM || 24000),
      bankId: c.BANK_ID || 'MB',
      bankAcc: c.BANK_ACC || '',
      bankName: c.BANK_NAME || ''
    },
    phienBan: configVersion_()
  };
}

function svc_changePin(u, p) {
  if (isAdmin_(u)) throw new Error('Tài khoản quản trị dùng mật khẩu chữ, không dùng PIN.');
  var oldPin = String(p.oldPin || '');
  var newPin = String(p.newPin || '');
  var confirmPin = String(p.confirmPin || '');
  if (!/^\d{6}$/.test(newPin)) throw new Error('Mã PIN mới phải gồm đúng 6 chữ số.');
  if (newPin === oldPin) throw new Error('Mã PIN mới phải khác mã PIN hiện tại.');
  if (['000000', '111111', '123456', '654321', '123123'].indexOf(newPin) >= 0) {
    throw new Error('Mã PIN quá đơn giản, hãy chọn dãy số khó đoán hơn.');
  }
  if (confirmPin && newPin !== confirmPin) throw new Error('Xác nhận mã PIN không khớp.');
  if (!verifyPin_(u, oldPin)) throw ghiNhanSai_(u);

  return withLock_(function () {
    setPin_(u.MaDD, newPin, false);
    var fresh = findBy_('DM_CanBo', 'MaDD', u.MaDD);
    log_(u.MaDD, 'ĐỔI PIN', 'Tự đổi mã PIN');
    return { message: 'Đã đổi mã PIN thành công.', token: issueToken_(fresh) };
  });
}

/** Đổi mật khẩu chữ của tài khoản quản trị hệ thống (Cấp 0). */
function svc_changePassword(u, p) {
  assertAdmin_(u);
  var oldPass = String(p.oldPassword || '');
  var newPass = String(p.newPassword || '');
  var confirm = String(p.confirmPassword || '');
  if (!verifyMatKhau_(u, oldPass)) throw new Error('Mật khẩu hiện tại không đúng.');
  if (newPass.length < 8) throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
  if (newPass.length > 72) throw new Error('Mật khẩu mới tối đa 72 ký tự.');
  if (newPass === oldPass) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
  if (newPass !== confirm) throw new Error('Xác nhận mật khẩu không khớp.');

  return withLock_(function () {
    update_('DM_CanBo', 'MaDD', u.MaDD, {
      MatKhauHash: hashMatKhau_(u.MaDD, newPass),
      BatDoiMatKhau: 'FALSE',
      SoLanSai: 0,
      KhoaDen: '',
      TokenVersion: Number(u.TokenVersion || 0) + 1
    });
    var fresh = findBy_('DM_CanBo', 'MaDD', u.MaDD);
    log_(u.MaDD, 'ĐỔI MẬT KHẨU', 'Quản trị hệ thống tự đổi mật khẩu');
    return { message: 'Đã đổi mật khẩu quản trị thành công.', token: issueToken_(fresh) };
  });
}

/** Đăng xuất thật: thu hồi toàn bộ token cũ của tài khoản. */
function svc_logout(u) {
  withLock_(function () {
    bumpTokenVersion_(u.MaDD);
    log_(u.MaDD, 'ĐĂNG XUẤT', 'Thu hồi phiên đăng nhập trên mọi thiết bị');
  });
  return { message: 'Đã đăng xuất khỏi mọi thiết bị.' };
}

function svc_requestPinReset(p) {
  var maDD = String(p.maDD || '').trim().toUpperCase();
  var u = findBy_('DM_CanBo', 'MaDD', maDD);
  // Không tiết lộ tài khoản có tồn tại hay không (chống dò tài khoản).
  if (!u || isDeleted_(u) || isAdmin_(u)) {
    return {
      maYC: '',
      message: 'Nếu tài khoản tồn tại và đang hoạt động, yêu cầu cấp lại PIN đã được ghi nhận để cấp Xã xử lý.'
    };
  }
  var existing = rows_('PIN_Reset').filter(function (r) {
    return String(r.MaDD) === u.MaDD && r.TrangThai === 'Chờ cấp';
  })[0];
  if (existing) {
    return { maYC: existing.MaYC, message: 'Yêu cầu trước đó đang chờ cấp Xã duyệt.' };
  }
  var maYC = newId_('YC');
  append_('PIN_Reset', {
    MaYC: maYC, MaDD: u.MaDD, HoTen: u.HoTen, Cap: u.Cap, PinMoi: '',
    TrangThai: 'Chờ cấp', LyDo: p.lyDo || 'Quên mã PIN', NgayYC: nowStr_(), NgayCap: '', NguoiCap: ''
  });
  log_(u.MaDD, 'YÊU CẦU RESET PIN', p.lyDo || '');
  return {
    maYC: maYC,
    message: 'Đã gửi yêu cầu. Mã PIN mới chỉ hiển thị trên bảng điều khiển của Quản trị hệ thống / Chủ tịch Hội LHTN Xã / Bí thư Chi bộ Xã.'
  };
}

function svc_pendingResets(u) {
  assertCap_(u, [1, 2]);
  var items = rows_('PIN_Reset').filter(function (r) {
    return r.TrangThai === 'Chờ cấp';
  }).map(function (r) {
    // Không bao giờ trả PIN chữ thô ra danh sách.
    return {
      MaYC: r.MaYC, MaDD: r.MaDD, HoTen: r.HoTen, Cap: r.Cap, TrangThai: r.TrangThai,
      LyDo: r.LyDo, NgayYC: r.NgayYC, NgayCap: r.NgayCap, NguoiCap: r.NguoiCap
    };
  });
  return { items: items.reverse() };
}

function svc_approveReset(u, p) {
  assertCap_(u, [1, 2]);
  return withLock_(function () {
    var yc = findBy_('PIN_Reset', 'MaYC', p.maYC);
    if (!yc) throw new Error('Không tìm thấy yêu cầu.');
    if (yc.TrangThai !== 'Chờ cấp') throw new Error('Yêu cầu đã được xử lý.');
    var target = findBy_('DM_CanBo', 'MaDD', yc.MaDD);
    if (!target || isDeleted_(target)) throw new Error('Tài khoản cần cấp lại PIN không còn tồn tại.');
    if (isAdmin_(target)) throw new Error('Tài khoản quản trị dùng mật khẩu chữ, không dùng PIN.');

    // Sinh PIN tại thời điểm duyệt và chỉ lưu dạng băm — không lưu chữ thô.
    var pin = randPin_();
    setPin_(target.MaDD, pin, true);
    update_('PIN_Reset', 'MaYC', p.maYC, {
      TrangThai: 'Đã cấp', PinMoi: '', NgayCap: nowStr_(), NguoiCap: u.MaDD
    });
    log_(u.MaDD, 'CẤP LẠI PIN', 'Cho ' + yc.MaDD);
    return {
      pinMoi: String(pin),
      message: 'Đã cấp PIN mới cho ' + yc.HoTen + '. Người dùng phải đổi PIN ngay khi đăng nhập.'
    };
  });
}

function svc_delegate(u, p) {
  assertCap_(u, [3]);
  var hours = Math.min(Math.max(Number(p.gio || 24), 1), 24);
  var den = new Date(Date.now() + hours * 3600 * 1000);
  var target = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!target || isDeleted_(target)) throw new Error('Không tìm thấy tài khoản được ủy quyền.');
  if (!target.MaAp) throw new Error('Tài khoản được ủy quyền phải thuộc một Chi đoàn Ấp.');
  // Admin (C0) được ủy quyền cho bất kỳ Ấp; Bí thư Ấp chỉ trong Ấp của mình.
  if (!isAdmin_(u) && String(target.MaAp) !== String(u.MaAp)) {
    throw new Error('Chỉ được ủy quyền cho cán bộ cùng Ấp.');
  }
  var maAp = isAdmin_(u) ? target.MaAp : u.MaAp;
  var denStr = Utilities.formatDate(den, TZ, 'yyyy-MM-dd HH:mm:ss');
  filterBy_('DM_CanBo', 'MaAp', maAp).forEach(function (r) {
    if (r.MaDD !== u.MaDD && r.UyQuyenDen) {
      update_('DM_CanBo', 'MaDD', r.MaDD, { UyQuyenCho: '', UyQuyenDen: '' });
    }
  });
  update_('DM_CanBo', 'MaDD', p.maDD, { UyQuyenCho: p.maDD, UyQuyenDen: denStr });
  log_(u.MaDD, 'ỦY QUYỀN 24H', p.maDD + ' đến ' + denStr);
  return { den: denStr, message: 'Đã ủy quyền duyệt điểm danh cho ' + target.HoTen + ' đến ' + denStr + '.' };
}

/* ================================================================== */
/* 1. TỔNG QUAN — DASHBOARD THEO CẤP C0–C4                              */
/* ================================================================== */

function lastCheckinMap_() {
  var map = {};
  rows_('DiemDanh').forEach(function (r) {
    var d = parseDate_(r.ThoiGian);
    if (!d) return;
    var t = d.getTime();
    if (!map[r.MaDD] || t > map[r.MaDD]) map[r.MaDD] = t;
  });
  return map;
}

function feePaidMap_(nam) {
  var map = {};
  rows_('DoanPhi').forEach(function (r) {
    if (Number(r.Nam) === Number(nam) && r.TrangThai === 'Đã xác nhận') map[r.MaDD] = true;
  });
  return map;
}

function svc_homeSummary(u) {
  var nam = cfgNum_('NAM_CONG_TAC', 2026);
  var mucTieu = cfgNum_('MUC_TIEU_DIEM', 300);
  var aps = rows_('DM_Ap');
  var all = rows_('DM_CanBo');
  var members = all.filter(function (r) { return Number(r.Cap) === 4 && !isTrue_(r.DaXoa); });
  var lastMap = lastCheckinMap_();
  var paid = feePaidMap_(nam);
  var now = Date.now();

  var scopeAps = isXa_(u) ? aps.map(function (a) { return a.MaAp; }) : [u.MaAp];
  var scopeMembers = members.filter(function (m) { return scopeAps.indexOf(String(m.MaAp)) >= 0; });

  var apStats = aps.filter(function (a) { return scopeAps.indexOf(String(a.MaAp)) >= 0; }).map(function (a) {
    var list = members.filter(function (m) { return String(m.MaAp) === String(a.MaAp); });
    var diemTB = list.length ? Math.round(list.reduce(function (s, m) { return s + Number(m.Diem || 0); }, 0) / list.length) : 0;
    var chuyenCan = list.filter(function (m) {
      var t = lastMap[m.MaDD];
      return t && (now - t) / 86400000 <= 30;
    }).length;
    var daDong = list.filter(function (m) { return paid[m.MaDD]; }).length;
    var choDuyet = rows_('UomMamDo').filter(function (r) {
      return String(r.MaAp) === String(a.MaAp) && r.TrangThai === 'Chờ duyệt';
    }).length;
    return {
      maAp: a.MaAp,
      tenAp: a.TenAp,
      biThu: a.BiThu,
      soDoanVien: list.length,
      chiTieu: Number(a.ChiTieu || 0),
      diemTB: diemTB,
      tyLeChuyenCan: list.length ? Math.round(chuyenCan / list.length * 100) : 0,
      tyLeDoanPhi: list.length ? Math.round(daDong / list.length * 100) : 0,
      choDuyet: choDuyet
    };
  });

  // Cảnh báo sớm: vắng quá 60 ngày
  var canhBao = scopeMembers.map(function (m) {
    var t = lastMap[m.MaDD];
    var soNgay = t ? Math.floor((now - t) / 86400000) : 999;
    return { maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, soNgayVang: soNgay, diem: Number(m.Diem || 0) };
  }).filter(function (x) { return x.soNgayVang > 60; })
    .sort(function (a, b) { return b.soNgayVang - a.soNgayVang; })
    .slice(0, 8);

  // Dòng hoạt động
  var log = rows_('Diem_Log').slice().reverse().filter(function (r) {
    return scopeAps.indexOf(String(r.MaAp)) >= 0;
  }).slice(0, 8).map(function (r) {
    var mem = all.filter(function (m) { return String(m.MaDD) === String(r.MaDD); })[0];
    return {
      maDD: r.MaDD,
      hoTen: mem ? mem.HoTen : r.MaDD,
      loai: r.Loai,
      diem: Number(r.Diem || 0),
      ghiChu: r.GhiChu,
      thoiGian: r.ThoiGian
    };
  });

  var tongDV = scopeMembers.length;
  var active = scopeMembers.filter(function (m) {
    var t = lastMap[m.MaDD];
    return t && (now - t) / 86400000 <= 30;
  }).length;
  var paResets = rows_('PIN_Reset').filter(function (r) { return r.TrangThai === 'Chờ cấp'; }).length;
  var uomPending = rows_('UomMamDo').filter(function (r) {
    return r.TrangThai === 'Chờ duyệt' && scopeAps.indexOf(String(r.MaAp)) >= 0;
  }).length;
  var feeTotal = rows_('DoanPhi').filter(function (r) {
    return Number(r.Nam) === nam && r.TrangThai === 'Đã xác nhận' && scopeAps.indexOf(String(r.MaAp)) >= 0;
  }).reduce(function (s, r) { return s + Number(r.SoTien || 0); }, 0);

  var kpi = [];
  if (isXa_(u)) {
    kpi = [
      { label: 'Tổng đoàn viên', value: tongDV, unit: 'đồng chí', hint: aps.length + ' Chi đoàn Ấp', tone: 'red', icon: 'users' },
      { label: 'Tỷ lệ tập hợp 30 ngày', value: tongDV ? Math.round(active / tongDV * 100) : 0, unit: '%', hint: 'Mục tiêu 85–92%', tone: 'green', icon: 'trend' },
      { label: 'Hồ sơ chờ duyệt', value: uomPending + paResets, unit: 'hồ sơ', hint: uomPending + ' Ươm mầm • ' + paResets + ' reset PIN', tone: 'orange', icon: 'inbox' },
      { label: 'Quỹ đoàn phí', value: feeTotal, unit: 'đ', hint: 'Đã xác nhận năm ' + nam, tone: 'blue', icon: 'wallet', money: true }
    ];
  } else if (isAp_(u)) {
    var myAp = apStats[0] || { soDoanVien: 0, diemTB: 0, tyLeChuyenCan: 0, tyLeDoanPhi: 0 };
    var session = rows_('QR_Phien').filter(function (r) { return String(r.MaAp) === String(u.MaAp) && r.TrangThai === 'Đang mở'; })[0];
    var daDiemDanh = session ? rows_('DiemDanh').filter(function (r) { return r.MaPhien === session.MaPhien; }).length : 0;
    kpi = [
      { label: 'Đoàn viên của Ấp', value: myAp.soDoanVien, unit: 'đồng chí', hint: 'Chỉ tiêu ' + myAp.chiTieu, tone: 'red', icon: 'users' },
      { label: 'Điểm rèn luyện TB', value: myAp.diemTB, unit: 'điểm', hint: 'Mức xét Ươm mầm: 300', tone: 'blue', icon: 'star' },
      { label: 'Phiên điểm danh', value: session ? 1 : 0, unit: 'đang mở', hint: session ? daDiemDanh + ' lượt đã điểm danh' : 'Chưa có phiên nào', tone: session ? 'green' : 'grey', icon: 'qr' },
      { label: 'Đoàn phí đã thu', value: myAp.tyLeDoanPhi, unit: '%', hint: 'Cần xác nhận chuyển khoản', tone: 'orange', icon: 'wallet' }
    ];
  } else {
    var my = publicProfile_(u);
    var feeMe = rows_('DoanPhi').filter(function (r) {
      return String(r.MaDD) === String(u.MaDD) && Number(r.Nam) === nam;
    })[0];
    var last = lastMap[u.MaDD];
    kpi = [
      { label: 'Điểm rèn luyện', value: my.diem, unit: '/ ' + mucTieu, hint: my.diem >= mucTieu ? 'Đã đạt mức xét Ươm mầm Đỏ' : 'Còn ' + (mucTieu - my.diem) + ' điểm', tone: 'red', icon: 'star' },
      { label: 'Lần tham gia gần nhất', value: last ? Math.floor((now - last) / 86400000) : '—', unit: last ? 'ngày trước' : '', hint: last ? '' : 'Chưa có dữ liệu điểm danh', tone: 'blue', icon: 'clock' },
      { label: 'Đoàn phí ' + nam, value: feeMe && feeMe.TrangThai === 'Đã xác nhận' ? 'Đã đóng' : (feeMe ? 'Chờ duyệt' : 'Chưa đóng'), unit: '', hint: '24.000đ/năm', tone: feeMe && feeMe.TrangThai === 'Đã xác nhận' ? 'green' : 'orange', icon: 'wallet' },
      { label: 'Thẻ Đoàn viên', value: my.coThe ? 'Đã tích hợp' : 'Chưa có', unit: '', hint: my.maThe || 'Liên hệ Bí thư Chi đoàn Ấp để cấp', tone: my.coThe ? 'green' : 'grey', icon: 'card' }
    ];
  }

  return {
    profile: publicProfile_(u),
    kpi: kpi,
    apStats: apStats,
    canhBao: canhBao,
    hoatDong: log,
    tienDo: { diem: Number(u.Diem || 0), mucTieu: mucTieu, phanTram: Math.min(100, Math.round(Number(u.Diem || 0) / mucTieu * 100)) },
    quyen: {
      laBiThu: isAp_(u),
      quanLyAp: scopeAps,
      uyQuyen: isAp_(u) ? nguoiDuyetCuaAp_(u.MaAp) : null
    }
  };
}

/* ================================================================== */
/* 2. QUẢN LÝ ẤP & ĐOÀN VIÊN                                           */
/* ================================================================== */

function svc_apList(u) {
  return { items: rows_('DM_Ap') };
}

function svc_memberList(u, p) {
  p = p || {};
  var maAp = isXa_(u) ? (p.maAp || '') : u.MaAp;
  var lastMap = lastCheckinMap_();
  var paid = feePaidMap_(cfgNum_('NAM_CONG_TAC', 2026));
  var all = rows_('DM_CanBo').filter(function (r) {
    if (Number(r.Cap) !== 4 || isTrue_(r.DaXoa)) return false;
    if (maAp && String(r.MaAp) !== String(maAp)) return false;
    return true;
  }).map(function (r) {
    var t = lastMap[r.MaDD];
    return {
      maDD: r.MaDD, hoTen: r.HoTen, maAp: r.MaAp, dienThoai: r.DienThoai,
      ngaySinh: r.NgaySinh || '', ghiChu: r.GhiChu || '',
      diem: Number(r.Diem || 0), maThe: r.MaThe, coThe: !!r.MaThe,
      ngayVang: t ? Math.floor((Date.now() - t) / 86400000) : null,
      daDongPhi: !!paid[r.MaDD]
    };
  }).sort(function (a, b) { return b.diem - a.diem; });

  // Phân trang tùy chọn: không truyền limit thì trả toàn bộ (tương thích cũ).
  var tongSo = all.length;
  var coTrang = p.limit !== undefined && p.limit !== null && String(p.limit) !== '';
  var offset = coTrang ? Math.max(0, Math.floor(Number(p.offset) || 0)) : 0;
  var limit = coTrang ? Math.min(200, Math.max(1, Math.floor(Number(p.limit) || 50))) : tongSo;
  var items = all.slice(offset, offset + limit);
  return {
    items: items,
    tongSo: tongSo,
    offset: offset,
    limit: limit,
    conNua: offset + items.length < tongSo
  };
}

function svc_memberAdd(u, p) {
  assertCap_(u, [1, 2, 3]);
  var maAp = isAp_(u) ? u.MaAp : String(p.maAp || '').trim().toUpperCase();
  if (!maAp) throw new Error('Vui lòng chọn Ấp cho đoàn viên mới.');
  if (!p.hoTen) throw new Error('Vui lòng nhập họ tên đoàn viên.');
  if (!p.dienThoai || !/^0\d{9}$/.test(String(p.dienThoai))) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');

  var all = rows_('DM_CanBo');
  var nums = all.map(function (r) { var m = String(r.MaDD).match(/^DV(\d+)$/); return m ? Number(m[1]) : 0; });
  var next = Math.max.apply(null, nums.concat([0])) + 1;
  var maDD = 'DV' + ('0' + next).slice(-2);
  while (findBy_('DM_CanBo', 'MaDD', maDD)) { next++; maDD = 'DV' + ('0' + next).slice(-2); }

  var ap = findBy_('DM_Ap', 'MaAp', maAp);
  if (!ap) throw new Error('Không tìm thấy Chi đoàn Ấp ' + maAp + '.');
  append_('DM_CanBo', {
    MaDD: maDD, HoTen: p.hoTen, Cap: 4, ChucVu: 'Đoàn viên', MaAp: maAp,
    DienThoai: String(p.dienThoai), NgaySinh: p.ngaySinh || '',
    NgayVaoDoan: '', NoiVaoDoan: ap ? ('Chi đoàn ' + ap.TenAp) : '',
    NgaySinhHoatDoan: 'Ngày 25 hằng tháng', PIN: '', PINHash: hashPin_(maDD, '123456'),
    BatDoiPin: 'TRUE', SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
    Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '', UyQuyenCho: '', UyQuyenDen: '',
    DaXoa: 'FALSE', NgayXoa: '', NguoiXoa: '', NgayThamGia: nowStr_(), GhiChu: 'Tạo bởi ' + u.MaDD
  });
  log_(u.MaDD, 'THÊM ĐOÀN VIÊN', maDD + ' - ' + p.hoTen);
  return { maDD: maDD, message: 'Đã thêm ' + p.hoTen + ' (Mã ĐD: ' + maDD + ', PIN mặc định 123456 — buộc đổi khi đăng nhập).' };
}

/** Cập nhật thông tin đoàn viên (C1–C3, Admin toàn quyền). */
function svc_memberUpdate(u, p) {
  assertCap_(u, [1, 2, 3]);
  var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!m || isTrue_(m.DaXoa)) throw new Error('Không tìm thấy đoàn viên cần cập nhật.');
  if (Number(m.Cap) !== 4) throw new Error('Chỉ cập nhật thông tin đoàn viên Cấp 4 tại màn hình này.');
  if (!isAdmin_(u) && !isXa_(u)) assertAp_(u, m.MaAp);

  var hoTen = String(p.hoTen || '').trim();
  if (!hoTen) throw new Error('Vui lòng nhập họ tên đoàn viên.');
  var dienThoai = String(p.dienThoai || '').trim();
  if (dienThoai && !/^0\d{9}$/.test(dienThoai)) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');

  var maAp = isAp_(u) ? u.MaAp : String(p.maAp || m.MaAp || '').trim().toUpperCase();
  var ap = findBy_('DM_Ap', 'MaAp', maAp);
  if (!ap) throw new Error('Không tìm thấy Chi đoàn Ấp ' + maAp + '.');

  update_('DM_CanBo', 'MaDD', m.MaDD, {
    HoTen: hoTen,
    DienThoai: dienThoai,
    NgaySinh: p.ngaySinh === undefined ? m.NgaySinh : String(p.ngaySinh || ''),
    MaAp: maAp,
    NoiVaoDoan: 'Chi đoàn ' + ap.TenAp,
    GhiChu: p.ghiChu === undefined ? (m.GhiChu || '') : String(p.ghiChu || '')
  });
  log_(u.MaDD, 'CẬP NHẬT ĐOÀN VIÊN', m.MaDD + ' - ' + hoTen);
  return { maDD: m.MaDD, message: 'Đã cập nhật thông tin ' + hoTen + '.' };
}

/**
 * Xóa mềm đoàn viên: ẩn khỏi danh sách, thu hồi phiên nhưng GIỮ toàn bộ
 * lịch sử điểm danh, đoàn phí, điểm rèn luyện và chứng nhận để kiểm toán.
 */
function svc_memberDelete(u, p) {
  assertCap_(u, [1, 2, 3]);
  return withLock_(function () {
    var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
    if (!m || isTrue_(m.DaXoa)) throw new Error('Không tìm thấy đoàn viên cần xóa.');
    if (Number(m.Cap) !== 4) throw new Error('Chỉ xóa tài khoản đoàn viên Cấp 4 tại màn hình này.');
    if (!isAdmin_(u) && !isXa_(u)) assertAp_(u, m.MaAp);

    update_('DM_CanBo', 'MaDD', m.MaDD, {
      DaXoa: 'TRUE', NgayXoa: nowStr_(), NguoiXoa: u.MaDD,
      TokenVersion: Number(m.TokenVersion || 0) + 1
    });
    log_(u.MaDD, 'XÓA MỀM ĐOÀN VIÊN', m.MaDD + ' - ' + m.HoTen);
    return {
      maDD: m.MaDD,
      message: 'Đã chuyển ' + m.HoTen + ' (' + m.MaDD + ') vào thùng rác. Có thể khôi phục trong Hệ thống → Tài khoản.'
    };
  });
}

/** Khôi phục đoàn viên đã xóa mềm (chỉ Cấp 0). */
function svc_memberRestore(u, p) {
  assertAdmin_(u);
  return withLock_(function () {
    var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
    if (!m) throw new Error('Không tìm thấy tài khoản cần khôi phục.');
    if (!isTrue_(m.DaXoa)) throw new Error('Tài khoản này không nằm trong thùng rác.');
    update_('DM_CanBo', 'MaDD', m.MaDD, {
      DaXoa: 'FALSE', NgayXoa: '', NguoiXoa: '',
      TokenVersion: Number(m.TokenVersion || 0) + 1
    });
    log_(u.MaDD, 'KHÔI PHỤC ĐOÀN VIÊN', m.MaDD + ' - ' + m.HoTen);
    return { maDD: m.MaDD, message: 'Đã khôi phục ' + m.HoTen + ' (' + m.MaDD + ').' };
  });
}

/* ================================================================== */
/* 3. PHÂN HỆ 1 — ĐIỂM DANH QR ĐỘNG                                    */
/* ================================================================== */

function svc_createSession(u, p) {
  assertCap_(u, [1, 2, 3]);
  var maAp = isAp_(u) ? u.MaAp : p.maAp;
  if (!maAp) throw new Error('Vui lòng chọn Ấp tổ chức sinh hoạt.');

  rows_('QR_Phien').forEach(function (r) {
    if (String(r.MaAp) === String(maAp) && r.TrangThai === 'Đang mở') {
      update_('QR_Phien', 'MaPhien', r.MaPhien, { TrangThai: 'Đã kết thúc', KetThuc: nowStr_() });
    }
  });

  var maPhien = newId_('PH');
  append_('QR_Phien', {
    MaPhien: maPhien, MaAp: maAp, TieuDe: p.tieuDe || 'Sinh hoạt Chi đoàn',
    BatDau: nowStr_(), KetThuc: '', TrangThai: 'Đang mở', NguoiTao: u.MaDD
  });
  log_(u.MaDD, 'MỞ PHIÊN ĐIỂM DANH', maPhien + ' - ' + maAp);
  return { maPhien: maPhien, message: 'Đã mở phiên điểm danh. QR tự đổi mã mỗi 60 giây.' };
}

function svc_session(u, p) {
  var s = findBy_('QR_Phien', 'MaPhien', p.maPhien);
  if (!s) throw new Error('Phiên điểm danh không tồn tại.');
  var ap = findBy_('DM_Ap', 'MaAp', s.MaAp);
  var slot = slotNow_();
  var sec = Math.floor(Date.now() / 1000) % 60;
  var ds = rows_('DiemDanh').filter(function (r) { return r.MaPhien === s.MaPhien; }).map(function (r) {
    var m = findBy_('DM_CanBo', 'MaDD', r.MaDD);
    return {
      maDD: r.MaDD, hoTen: m ? m.HoTen : r.MaDD, hinhThuc: r.HinhThuc,
      diem: Number(r.Diem || 0), thoiGian: r.ThoiGian
    };
  });
  return {
    maPhien: s.MaPhien, tieuDe: s.TieuDe, maAp: s.MaAp, tenAp: ap ? ap.TenAp : s.MaAp,
    trangThai: s.TrangThai, batDau: s.BatDau,
    token: qrToken_(s.MaPhien, slot),
    conLai: 60 - sec,
    serverTime: nowStr_(),
    payload: 'CD6|' + s.MaPhien + '|' + qrToken_(s.MaPhien, slot),
    daDiemDanh: ds.length,
    ds: ds.reverse(),
    nguoiDuyet: nguoiDuyetCuaAp_(s.MaAp)
  };
}

function svc_closeSession(u, p) {
  assertCap_(u, [1, 2, 3]);
  var s = findBy_('QR_Phien', 'MaPhien', p.maPhien);
  if (!s) throw new Error('Không tìm thấy phiên.');
  assertAp_(u, s.MaAp);
  update_('QR_Phien', 'MaPhien', p.maPhien, { TrangThai: 'Đã kết thúc', KetThuc: nowStr_() });
  log_(u.MaDD, 'KẾT THÚC ĐIỂM DANH', p.maPhien);
  return { message: 'Đã kết thúc phiên điểm danh.' };
}

function svc_scan(u, p) {
  var raw = String(p.payload || '').trim();
  var maPhien = p.maPhien;
  var token = String(p.token || '').trim().toUpperCase();

  if (raw) {
    var parts = raw.split('|');
    if (parts.length === 3 && parts[0] === 'CD6') {
      maPhien = parts[1];
      token = parts[2].toUpperCase();
    }
  }
  if (!maPhien) {
    // Cho phép nhập tay: tự tìm phiên đang mở của Chi đoàn Ấp
    var open = rows_('QR_Phien').filter(function (r) {
      return r.TrangThai === 'Đang mở' && (isXa_(u) || String(r.MaAp) === String(u.MaAp));
    })[0];
    if (open) maPhien = open.MaPhien;
  }
  if (!maPhien) throw new Error('Không tìm thấy phiên điểm danh đang mở cho Chi đoàn Ấp của bạn.');

  var s = findBy_('QR_Phien', 'MaPhien', maPhien);
  if (!s) throw new Error('Không tìm thấy phiên điểm danh.');
  if (s.TrangThai !== 'Đang mở') throw new Error('Phiên điểm danh đã kết thúc.');
  if (!isXa_(u) && String(s.MaAp) !== String(u.MaAp)) throw new Error('Bạn không thuộc Chi đoàn Ấp của phiên này.');

  var slot = slotNow_();
  var valid = [qrToken_(maPhien, slot), qrToken_(maPhien, slot - 1), qrToken_(maPhien, slot + 1)];
  if (valid.indexOf(token) < 0) throw new Error('Mã QR đã hết hiệu lực (quá 60 giây). Vui lòng quét lại mã mới.');

  var dup = rows_('DiemDanh').filter(function (r) {
    return r.MaPhien === maPhien && String(r.MaDD) === String(u.MaDD);
  })[0];
  if (dup) throw new Error('Bạn đã điểm danh phiên này rồi (lúc ' + dup.ThoiGian + ').');

  var hinhThuc = p.hinhThuc || 'Trực tiếp';
  var diemMap = {
    'Trực tiếp': cfgNum_('DIEM_HOP_TRUC_TIEP', 10),
    'Hybrid': cfgNum_('DIEM_BAO_CAO_HYBRID', 8),
    'Zalo': cfgNum_('DIEM_KET_NOI_ZALO', 5)
  };
  var diem = diemMap[hinhThuc] === undefined ? 10 : diemMap[hinhThuc];

  append_('DiemDanh', {
    MaDD: u.MaDD, MaPhien: maPhien, MaAp: s.MaAp, HinhThuc: hinhThuc, Diem: diem,
    ThoiGian: nowStr_(), ViDo: p.viDo || '', KinhDo: p.kinhDo || '', GhiChu: ''
  });
  var tong = award_(u, diem, 'Điểm danh ' + hinhThuc, s.TieuDe);
  log_(u.MaDD, 'ĐIỂM DANH', maPhien + ' +' + diem + 'đ');

  return {
    hoTen: u.HoTen, diem: diem, tongDiem: tong, hinhThuc: hinhThuc,
    thoiGian: nowStr_(),
    message: 'Điểm danh thành công! +' + diem + ' điểm rèn luyện.'
  };
}

function svc_attendanceList(u, p) {
  var maAp = isXa_(u) ? (p.maAp || '') : u.MaAp;
  var lastMap = lastCheckinMap_();
  var items = rows_('DM_CanBo').filter(function (r) {
    return Number(r.Cap) === 4 && !isTrue_(r.DaXoa) && (!maAp || String(r.MaAp) === String(maAp));
  }).map(function (r) {
    var t = lastMap[r.MaDD];
    return {
      maDD: r.MaDD, hoTen: r.HoTen, maAp: r.MaAp,
      soNgayVang: t ? Math.floor((Date.now() - t) / 86400000) : null,
      canhBao: !t || (Date.now() - t) / 86400000 > 60
    };
  }).sort(function (a, b) { return (b.soNgayVang || 9999) - (a.soNgayVang || 9999); });

  var phien = rows_('QR_Phien').filter(function (r) {
    return (!maAp || String(r.MaAp) === String(maAp));
  }).slice(-5).reverse();

  var tongVang = items.filter(function (x) { return x.canhBao; }).length;

  // Lịch sử điểm danh của chính người dùng
  var phienMap = {};
  rows_('QR_Phien').forEach(function (p) { phienMap[p.MaPhien] = p; });
  var lichSu = rows_('DiemDanh').filter(function (r) { return String(r.MaDD) === String(u.MaDD); })
    .slice(-8).reverse().map(function (r) {
      var p = phienMap[r.MaPhien];
      return {
        tieuDe: p ? p.TieuDe : r.MaPhien,
        hinhThuc: r.HinhThuc,
        diem: Number(r.Diem || 0),
        thoiGian: r.ThoiGian
      };
    });

  return { items: items, phien: phien, tongVang: tongVang, lichSu: lichSu };
}

/* ================================================================== */
/* 4. PHÂN HỆ 2 — ƯƠM MẦM ĐỎ (PHÁT TRIỂN ĐẢNG)                         */
/* ================================================================== */

function xepLoai360_(maDD) {
  var list = rows_('TuDanhGia360').filter(function (r) { return String(r.MaDD) === String(maDD); });
  if (!list.length) return null;
  return list[list.length - 1];
}

function svc_uomMamList(u, p) {
  var mucTieu = cfgNum_('MUC_TIEU_DIEM', 300);
  var maAp = isXa_(u) ? (p.maAp || '') : u.MaAp;
  var statusMap = {};
  rows_('UomMamDo').forEach(function (r) { statusMap[r.MaDD] = r; });

  var members = rows_('DM_CanBo').filter(function (r) {
    if (Number(r.Cap) !== 4 || isTrue_(r.DaXoa)) return false;
    if (isC4_(u)) return String(r.MaDD) === String(u.MaDD);
    return !maAp || String(r.MaAp) === String(maAp);
  });

  var items = members.map(function (m) {
    var the = findBy_('TheDoanVien', 'MaDD', m.MaDD);
    var ev = xepLoai360_(m.MaDD);
    var tc1 = !!(the && the.TrangThai === 'Đã cấp');
    var tc2 = Number(m.Diem || 0) >= mucTieu;
    var tc3 = !!(ev && ['Hoàn thành xuất sắc', 'Hoàn thành tốt'].indexOf(ev.XepLoai) >= 0);
    var st = statusMap[m.MaDD];
    return {
      maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, diem: Number(m.Diem || 0),
      coThe: tc1, maThe: the ? the.MaThe : '',
      datDiem: tc2, dat360: tc3,
      xepLoai360: ev ? ev.XepLoai : 'Chưa tự đánh giá',
      duDieuKien: tc1 && tc2 && tc3,
      trangThai: st ? st.TrangThai : 'Chưa đề cử',
      nhanXet: st ? st.NhanXet : '',
      nguoiDeCu: st ? st.NguoiDeCu : '',
      ngayDeCu: st ? st.NgayDeCu : '',
      nguoiDuyet: st ? st.NguoiDuyet : ''
    };
  }).sort(function (a, b) {
    return (b.duDieuKien ? 1 : 0) - (a.duDieuKien ? 1 : 0) || b.diem - a.diem;
  });

  var thongKe = {
    tong: items.length,
    duDieuKien: items.filter(function (i) { return i.duDieuKien; }).length,
    choDuyet: items.filter(function (i) { return i.trangThai === 'Chờ duyệt'; }).length,
    daDuyet: items.filter(function (i) { return i.trangThai === 'Đã duyệt'; }).length
  };
  return { items: items, thongKe: thongKe, mucTieu: mucTieu };
}

function svc_uomMamNominate(u, p) {
  assertCap_(u, [3]);
  var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!m || isTrue_(m.DaXoa)) throw new Error('Không tìm thấy đoàn viên.');
  assertAp_(u, m.MaAp);
  if (!p.nhanXet || String(p.nhanXet).trim().length < 20) {
    throw new Error('Vui lòng nhập nhận xét tối thiểu 20 ký tự để đề cử.');
  }
  var the = findBy_('TheDoanVien', 'MaDD', m.MaDD);
  var ev = xepLoai360_(m.MaDD);
  var du = !!(the && the.TrangThai === 'Đã cấp') && Number(m.Diem || 0) >= cfgNum_('MUC_TIEU_DIEM', 300) &&
    !!(ev && ['Hoàn thành xuất sắc', 'Hoàn thành tốt'].indexOf(ev.XepLoai) >= 0);
  if (!du) throw new Error('Đoàn viên chưa đạt đủ 3 tiêu chuẩn Ươm mầm Đỏ.');

  var st = findBy_('UomMamDo', 'MaDD', m.MaDD);
  var data = {
    HoTen: m.HoTen, MaAp: m.MaAp, Diem: Number(m.Diem || 0),
    TieuChiThe: 'Đạt', TieuChiDiem: 'Đạt', TieuChi360: 'Đạt',
    TrangThai: 'Chờ duyệt', NhanXet: p.nhanXet, NguoiDeCu: u.MaDD, NgayDeCu: nowStr_(),
    NguoiDuyet: '', NgayDuyet: ''
  };
  if (st) update_('UomMamDo', 'MaDD', m.MaDD, data);
  else {
    data.MaDD = m.MaDD;
    append_('UomMamDo', data);
  }
  log_(u.MaDD, 'ĐỀ CỬ ƯƠM MẦM ĐỎ', m.MaDD);
  return { message: 'Đã trình cấp Xã phê duyệt nguồn Cảm tình Đảng cho ' + m.HoTen + '.' };
}

function svc_uomMamApprove(u, p) {
  assertCap_(u, [1, 2]);
  var st = findBy_('UomMamDo', 'MaDD', p.maDD);
  if (!st) throw new Error('Không tìm thấy hồ sơ đề cử.');
  if (st.TrangThai !== 'Chờ duyệt') throw new Error('Hồ sơ không ở trạng thái chờ duyệt.');
  update_('UomMamDo', 'MaDD', p.maDD, {
    TrangThai: 'Đã duyệt', NguoiDuyet: u.MaDD, NgayDuyet: nowStr_()
  });
  var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!m || isTrue_(m.DaXoa)) throw new Error('Không tìm thấy đoàn viên của hồ sơ đề cử.');
  var tong = award_(m, cfgNum_('DIEM_UOM_MAM', 25), 'Duyệt nguồn Cảm tình Đảng', 'Ươm mầm Đỏ 2026');
  log_(u.MaDD, 'DUYỆT ƯƠM MẦM ĐỎ', p.maDD);
  return { tongDiem: tong, message: 'Đã phê duyệt ' + st.HoTen + ' vào nguồn Cảm tình Đảng (+25 điểm, gắn huy hiệu Đỏ).' };
}

function svc_uomMamReject(u, p) {
  assertCap_(u, [1, 2]);
  update_('UomMamDo', 'MaDD', p.maDD, {
    TrangThai: 'Từ chối', NguoiDuyet: u.MaDD, NgayDuyet: nowStr_(), NhanXet: p.lyDo || ''
  });
  return { message: 'Đã trả hồ sơ đề cử về Chi đoàn Ấp.' };
}

/* ================================================================== */
/* 5. PHÂN HỆ 3 — ĐOÀN PHÍ SỐ VIETQR & SỔ QUỸ                          */
/* ================================================================== */

function vietQrUrl_(soTien, noiDung) {
  var c = cfg_();
  var base = 'https://img.vietqr.io/image/' + encodeURIComponent(c.BANK_ID || 'MB') + '-' +
    encodeURIComponent(c.BANK_ACC || '') + '-compact2.png';
  return base + '?amount=' + Number(soTien) +
    '&addInfo=' + encodeURIComponent(noiDung) +
    '&accountName=' + encodeURIComponent(c.BANK_NAME || '');
}

function svc_feeSummary(u, p) {
  var nam = Number(p.nam || cfgNum_('NAM_CONG_TAC', 2026));
  var muc = cfgNum_('DOAN_PHI_NAM', 24000);
  var aps = rows_('DM_Ap');
  var members = rows_('DM_CanBo').filter(function (r) { return Number(r.Cap) === 4 && !isTrue_(r.DaXoa); });
  var activeIds = {};
  members.forEach(function (m) { activeIds[m.MaDD] = true; });
  var fees = rows_('DoanPhi').filter(function (r) { return Number(r.Nam) === nam && activeIds[r.MaDD]; });
  var chi = rows_('Quy_ThuChi').filter(function (r) { return String(r.Ngay || '').indexOf(String(nam)) === 0; });

  var scopeAps = isXa_(u) ? aps.map(function (a) { return a.MaAp; }) : [u.MaAp];

  var stats = aps.filter(function (a) { return scopeAps.indexOf(String(a.MaAp)) >= 0; }).map(function (a) {
    var list = members.filter(function (m) { return String(m.MaAp) === String(a.MaAp); });
    var paid = fees.filter(function (f) {
      return String(f.MaAp) === String(a.MaAp) && f.TrangThai === 'Đã xác nhận';
    });
    var pending = fees.filter(function (f) {
      return String(f.MaAp) === String(a.MaAp) && f.TrangThai === 'Chờ xác nhận';
    });
    var thu = paid.reduce(function (s, f) { return s + Number(f.SoTien || 0); }, 0);
    var chiAp = chi.filter(function (c) { return String(c.MaAp) === String(a.MaAp); })
      .reduce(function (s, c) { return s + Number(c.SoTien || 0); }, 0);
    return {
      maAp: a.MaAp, tenAp: a.TenAp, soDoanVien: list.length,
      duKien: list.length * muc, daThu: thu, daChi: chiAp, tonQuy: thu - chiAp,
      tyLe: list.length ? Math.round(paid.length / list.length * 100) : 0,
      soDaDong: paid.length, pending: pending.length
    };
  });

  var pendingList = fees.filter(function (f) {
    return f.TrangThai === 'Chờ xác nhận' && scopeAps.indexOf(String(f.MaAp)) >= 0;
  }).map(function (f) {
    return { maGiaoDich: f.MaGiaoDich, maDD: f.MaDD, hoTen: f.HoTen, maAp: f.MaAp, soTien: Number(f.SoTien), ngayTao: f.NgayTao };
  });

  var nhat = fees.filter(function (f) {
    return scopeAps.indexOf(String(f.MaAp)) >= 0;
  }).map(function (f) {
    return { maAp: f.MaAp, hoTen: f.HoTen, soTien: Number(f.SoTien), loai: 'Thu', noiDung: 'Đoàn phí năm ' + f.Nam, trangThai: f.TrangThai, ngay: f.NgayXacNhan || f.NgayTao };
  }).concat(chi.filter(function (c) { return scopeAps.indexOf(String(c.MaAp)) >= 0; }).map(function (c) {
    return { maAp: c.MaAp, hoTen: c.NguoiTao, soTien: Number(c.SoTien), loai: 'Chi', noiDung: c.NoiDung, trangThai: 'Đã chi', ngay: c.Ngay };
  })).sort(function (a, b) { return String(b.ngay).localeCompare(String(a.ngay)); }).slice(0, 30);

  var tongThu = stats.reduce(function (s, x) { return s + x.daThu; }, 0);
  var tongChi = stats.reduce(function (s, x) { return s + x.daChi; }, 0);
  return {
    nam: nam, mucPhi: muc, stats: stats, pending: pendingList, nhat: nhat,
    tongThu: tongThu, tongChi: tongChi, tonQuy: tongThu - tongChi
  };
}

function svc_feeMy(u, p) {
  var nam = Number(p.nam || cfgNum_('NAM_CONG_TAC', 2026));
  var muc = cfgNum_('DOAN_PHI_NAM', 24000);
  var f = rows_('DoanPhi').filter(function (r) {
    return String(r.MaDD) === String(u.MaDD) && Number(r.Nam) === nam;
  })[0];
  return {
    nam: nam, mucPhi: muc,
    trangThai: f ? f.TrangThai : 'Chưa đóng',
    maGiaoDich: f ? f.MaGiaoDich : '',
    soTien: f ? Number(f.SoTien) : muc,
    noiDung: f ? f.NoiDung : ('DOANPHI ' + u.MaAp + ' ' + u.MaDD),
    ngayXacNhan: f ? f.NgayXacNhan : '',
    daDong: !!(f && f.TrangThai === 'Đã xác nhận'),
    choDuyet: !!(f && f.TrangThai === 'Chờ xác nhận')
  };
}

function svc_feePay(u, p) {
  var nam = Number(p.nam || cfgNum_('NAM_CONG_TAC', 2026));
  var muc = cfgNum_('DOAN_PHI_NAM', 24000);
  var noiDung = 'DOANPHI ' + u.MaAp + ' ' + u.MaDD;
  var existing = rows_('DoanPhi').filter(function (r) {
    return String(r.MaDD) === String(u.MaDD) && Number(r.Nam) === nam;
  })[0];

  if (existing && existing.TrangThai === 'Đã xác nhận') throw new Error('Bạn đã hoàn thành đoàn phí năm ' + nam + '.');

  var maGD = existing ? existing.MaGiaoDich : newId_('DP');
  if (existing) {
    update_('DoanPhi', 'MaGiaoDich', maGD, { TrangThai: 'Chờ xác nhận', NgayTao: nowStr_() });
  } else {
    append_('DoanPhi', {
      MaGiaoDich: maGD, MaAp: u.MaAp, MaDD: u.MaDD, HoTen: u.HoTen, Nam: nam,
      SoTien: muc, NoiDung: noiDung, TrangThai: 'Chờ xác nhận',
      NgayTao: nowStr_(), NgayXacNhan: '', NguoiXacNhan: ''
    });
  }
  log_(u.MaDD, 'TẠO VIETQR ĐOÀN PHÍ', maGD);
  return {
    maGiaoDich: maGD, soTien: muc, noiDung: noiDung,
    qrUrl: vietQrUrl_(muc, noiDung),
    bank: { id: cfg_().BANK_ID, acc: cfg_().BANK_ACC, name: cfg_().BANK_NAME },
    message: 'Đã tạo mã VietQR cá nhân hóa. Nội dung chuyển khoản: ' + noiDung
  };
}

function svc_feeConfirm(u, p) {
  assertCap_(u, [1, 2, 3]);
  var f = findBy_('DoanPhi', 'MaGiaoDich', p.maGiaoDich);
  if (!f) throw new Error('Không tìm thấy giao dịch.');
  assertAp_(u, f.MaAp);
  if (f.TrangThai === 'Đã xác nhận') throw new Error('Giao dịch đã được xác nhận trước đó.');

  update_('DoanPhi', 'MaGiaoDich', p.maGiaoDich, {
    TrangThai: 'Đã xác nhận', NgayXacNhan: nowStr_(), NguoiXacNhan: u.MaDD
  });

  var year = Number(f.Nam);
  var daCong = rows_('Diem_Log').filter(function (r) {
    return String(r.MaDD) === String(f.MaDD) && String(r.Loai).indexOf('Đoàn phí') === 0 &&
      String(r.ThoiGian).indexOf(String(year)) === 0;
  }).length;
  var diem = 0;
  if (!daCong) {
    var m = findBy_('DM_CanBo', 'MaDD', f.MaDD);
    diem = cfgNum_('DIEM_DOAN_PHI', 10);
    award_(m, diem, 'Đoàn phí năm ' + year, 'Hoàn thành đoàn phí ' + year);
  }
  log_(u.MaDD, 'XÁC NHẬN ĐOÀN PHÍ', p.maGiaoDich);
  return {
    diem: diem,
    message: 'Đã xác nhận đoàn phí cho ' + f.HoTen + (diem ? ' (+' + diem + ' điểm)' : '') + '.'
  };
}

function svc_feeAddExpense(u, p) {
  assertCap_(u, [1, 2, 3]);
  if (!p.soTien || Number(p.soTien) <= 0) throw new Error('Số tiền chi không hợp lệ.');
  if (!p.noiDung) throw new Error('Vui lòng nhập nội dung chi.');
  var maAp = isAp_(u) ? u.MaAp : String(p.maAp || '').trim().toUpperCase();
  if (!maAp) throw new Error('Vui lòng chọn Chi đoàn Ấp phát sinh khoản chi.');
  if (!findBy_('DM_Ap', 'MaAp', maAp)) throw new Error('Không tìm thấy Chi đoàn Ấp ' + maAp + '.');
  append_('Quy_ThuChi', {
    MaGD: newId_('TC'), MaAp: maAp, Loai: 'Chi', SoTien: Number(p.soTien),
    NoiDung: p.noiDung, Ngay: nowStr_(), NguoiTao: u.MaDD
  });
  log_(u.MaDD, 'GHI CHI QUỸ', p.noiDung + ' - ' + p.soTien);
  return { message: 'Đã ghi nhận khoản chi và công khai trên Sổ quỹ minh bạch.' };
}

/* ================================================================== */
/* 6. PHÂN HỆ 4 — THẺ SỐ E-CARD, 360°, E-CERT                          */
/* ================================================================== */

function svc_cardGet(u, p) {
  var maDD = p.maDD || u.MaDD;
  if (String(maDD) !== String(u.MaDD)) {
    var target = findBy_('DM_CanBo', 'MaDD', maDD);
    if (!target || isDeleted_(target)) throw new Error('Không tìm thấy đoàn viên.');
    if (!isXa_(u)) assertAp_(u, target.MaAp);
  }
  var m = findBy_('DM_CanBo', 'MaDD', maDD);
  var the = findBy_('TheDoanVien', 'MaDD', maDD);
  var ev = xepLoai360_(maDD);
  var nam = cfgNum_('NAM_CONG_TAC', 2026);
  var fee = rows_('DoanPhi').filter(function (r) { return String(r.MaDD) === String(maDD) && Number(r.Nam) === nam && r.TrangThai === 'Đã xác nhận'; })[0];
  var uom = findBy_('UomMamDo', 'MaDD', maDD);

  var badges = [];
  if (the && the.TrangThai === 'Đã cấp') badges.push({ ten: 'Thẻ Đoàn viên', mau: 'red' });
  if (fee) badges.push({ ten: 'Đoàn phí ' + nam, mau: 'green' });
  if (uom && uom.TrangThai === 'Đã duyệt') badges.push({ ten: 'Nguồn Cảm tình Đảng', mau: 'gold' });
  if (Number(m.Diem || 0) >= 300) badges.push({ ten: 'Chiến sĩ thi đua', mau: 'blue' });

  return {
    maDD: m.MaDD, hoTen: m.HoTen, chucVu: m.ChucVu, maAp: m.MaAp,
    tenAp: tenDonVi_(m), ngaySinh: m.NgaySinh, dienThoai: m.DienThoai,
    ngayVaoDoan: m.NgayVaoDoan || '', noiVaoDoan: m.NoiVaoDoan || '',
    ngaySinhHoatDoan: m.NgaySinhHoatDoan || '',
    diem: Number(m.Diem || 0), maThe: the ? the.MaThe : '',
    ngayCap: the ? the.NgayCap : '', hetHan: the ? the.HetHan : '',
    noiCapThe: the ? (the.NoiCapThe || '') : '',
    trangThaiThe: the ? the.TrangThai : 'Chưa cấp',
    xepLoai360: ev ? ev.XepLoai : 'Chưa tự đánh giá',
    badges: badges,
    tenXa: cfg_().TEN_XA || 'Xã Tân Hòa',
    nam: nam
  };
}

function svc_cardList(u, p) {
  var maAp = isXa_(u) ? (p.maAp || '') : u.MaAp;
  var items = rows_('DM_CanBo').filter(function (r) {
    return Number(r.Cap) === 4 && !isTrue_(r.DaXoa) && (!maAp || String(r.MaAp) === String(maAp));
  }).map(function (r) {
    var the = findBy_('TheDoanVien', 'MaDD', r.MaDD);
    return {
      maDD: r.MaDD, hoTen: r.HoTen, maAp: r.MaAp, diem: Number(r.Diem || 0),
      maThe: the ? the.MaThe : '', trangThai: the ? the.TrangThai : 'Chưa cấp'
    };
  });
  return { items: items, daCap: items.filter(function (i) { return i.trangThai === 'Đã cấp'; }).length };
}

function svc_cardIssue(u, p) {
  assertCap_(u, [1, 2, 3]);
  var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!m || isTrue_(m.DaXoa)) throw new Error('Không tìm thấy đoàn viên.');
  assertAp_(u, m.MaAp);
  var existing = findBy_('TheDoanVien', 'MaDD', m.MaDD);
  if (existing && existing.TrangThai === 'Đã cấp') throw new Error('Đoàn viên đã được tích hợp Thẻ Đoàn viên.');

  var nam = cfgNum_('NAM_CONG_TAC', 2026);
  var ap = m.MaAp ? findBy_('DM_Ap', 'MaAp', m.MaAp) : null;
  var noiCapThe = isXa_(u)
    ? ('Ban Chấp hành Chi đoàn ' + (cfg_().TEN_XA || 'Xã Tân Hòa'))
    : ('Ban Chấp hành Chi đoàn ' + (ap ? ap.TenAp : m.MaAp));
  var count = rows_('TheDoanVien').filter(function (r) { return String(r.MaAp) === String(m.MaAp); }).length + 1;
  var maThe = 'TDV-' + nam + '-' + m.MaAp + '-' + ('0' + count).slice(-2);

  if (existing) {
    update_('TheDoanVien', 'MaThe', existing.MaThe, {
      TrangThai: 'Đã cấp', NgayCap: nowStr_(), NguoiCap: u.MaDD, NoiCapThe: noiCapThe
    });
  } else {
    append_('TheDoanVien', {
      MaThe: maThe, MaDD: m.MaDD, HoTen: m.HoTen, MaAp: m.MaAp,
      NgayCap: nowStr_(), HetHan: '31/12/' + nam, NoiCapThe: noiCapThe,
      TrangThai: 'Đã cấp', NguoiCap: u.MaDD
    });
  }
  update_('DM_CanBo', 'MaDD', m.MaDD, { MaThe: existing ? existing.MaThe : maThe });
  var tong = award_(m, cfgNum_('DIEM_TICH_HOP_THE', 20), 'Tích hợp Thẻ Đoàn viên', existing ? existing.MaThe : maThe);
  log_(u.MaDD, 'CẤP THẺ ĐOÀN VIÊN', m.MaDD);
  return { maThe: existing ? existing.MaThe : maThe, tongDiem: tong, message: 'Đã tích hợp Thẻ Đoàn viên (+20 điểm).' };
}

function svc_evalSubmit(u, p) {
  var nam = cfgNum_('NAM_CONG_TAC', 2026);
  var fields = ['tuChinhTri', 'daoDuc', 'chuyenMon', 'congHien', 'kyLuat'];
  var labels = { tuChinhTri: 'Tư tưởng chính trị', daoDuc: 'Đạo đức lối sống', chuyenMon: 'Chuyên môn nghiệp vụ', congHien: 'Cống hiến tình nguyện', kyLuat: 'Ý thức kỷ luật' };
  var tong = 0;
  fields.forEach(function (f) {
    var v = Number(p[f]);
    if (!v || v < 1 || v > 5) throw new Error('Điểm "' + labels[f] + '" phải từ 1 đến 5.');
    tong += v;
  });
  var xepLoai = tong >= 23 ? 'Hoàn thành xuất sắc' : tong >= 20 ? 'Hoàn thành tốt' : tong >= 15 ? 'Hoàn thành' : 'Chưa hoàn thành';

  var existed = rows_('TuDanhGia360').filter(function (r) {
    return String(r.MaDD) === String(u.MaDD) && Number(r.Nam) === nam;
  })[0];

  var payload = {
    MaDD: u.MaDD, Nam: nam, TuChinhTri: Number(p.tuChinhTri), DaoDuc: Number(p.daoDuc),
    ChuyenMon: Number(p.chuyenMon), CongHien: Number(p.congHien), KyLuat: Number(p.kyLuat),
    TongDiem: tong, XepLoai: xepLoai, ThoiGian: nowStr_()
  };
  if (existed) {
    // Xóa dòng cũ rồi ghi mới để giữ 1 bản ghi/năm
    removeRow_('TuDanhGia360', 'MaDD', u.MaDD);
  }
  append_('TuDanhGia360', payload);

  var daCong = rows_('Diem_Log').filter(function (r) {
    return String(r.MaDD) === String(u.MaDD) && String(r.Loai).indexOf('Tự đánh giá') === 0 &&
      String(r.ThoiGian).indexOf(String(nam)) === 0;
  }).length;
  var diem = 0;
  if (!daCong) diem = award_(u, cfgNum_('DIEM_TU_DANH_GIA', 10), 'Tự đánh giá 360°', nam);
  log_(u.MaDD, 'TỰ ĐÁNH GIÁ 360', xepLoai);
  return { tongDiem: tong, xepLoai: xepLoai, diemCong: diem ? 10 : 0, message: 'Kết quả: ' + xepLoai + ' (' + tong + '/25).' };
}

function svc_certIssue(u, p) {
  var m = findBy_('DM_CanBo', 'MaDD', u.MaDD);
  var the = findBy_('TheDoanVien', 'MaDD', u.MaDD);
  if (!the || the.TrangThai !== 'Đã cấp') throw new Error('Cần tích hợp Thẻ Đoàn viên trước khi cấp giấy chứng nhận số.');
  var loai = p.loai || 'Giấy chứng nhận tham gia hoạt động';
  var maCert = newId_('EC');
  var chuKy = hmac_(u.MaDD + '|' + loai + '|' + nowStr_()).slice(0, 16).toUpperCase();
  append_('ECert', {
    MaCert: maCert, MaDD: u.MaDD, HoTen: u.HoTen, Loai: loai,
    NgayCap: nowStr_(), ChuKySo: chuKy,
    NoiDung: 'Chứng nhận ' + u.HoTen + ' (' + the.MaThe + ') đã hoàn thành: ' + loai + ' tại ' + (cfg_().TEN_XA || 'Xã Tân Hòa') + ' năm ' + cfgNum_('NAM_CONG_TAC', 2026) + '.'
  });
  log_(u.MaDD, 'CẤP E-CERT', maCert);
  return {
    maCert: maCert, chuKySo: chuKy,
    noiDung: 'Chứng nhận ' + u.HoTen + ' đã hoàn thành: ' + loai,
    ngayCap: nowStr_(), tenXa: cfg_().TEN_XA || 'Xã Tân Hòa',
    message: 'Đã cấp Giấy chứng nhận số có chữ ký HMAC.'
  };
}

/* ================================================================== */
/* 7. PHÂN HỆ 5 — SOS & BẢN ĐỒ TÌNH NGUYỆN                             */
/* ================================================================== */

function svc_sosList(u, p) {
  var maAp = isXa_(u) ? (p.maAp || '') : u.MaAp;
  var items = rows_('SOS').filter(function (r) {
    return !maAp || String(r.MaAp) === String(maAp);
  }).map(function (r) {
    return {
      maPA: r.MaPA, maDD: r.MaDD, hoTen: r.HoTen, maAp: r.MaAp, loai: r.Loai,
      noiDung: r.NoiDung, viDo: Number(r.ViDo), kinhDo: Number(r.KinhDo),
      diem: Number(r.Diem || 0), trangThai: r.TrangThai, maNV: r.MaNV, thoiGian: r.ThoiGian
    };
  }).reverse();

  var missions = rows_('NhiemVu').filter(function (r) {
    return !maAp || String(r.MaAp) === String(maAp);
  }).map(function (r) {
    var daCheck = rows_('Diem_Log').filter(function (l) {
      return String(l.MaDD) === String(u.MaDD) && String(l.GhiChu).indexOf(r.MaNV) >= 0;
    }).length > 0;
    return {
      maNV: r.MaNV, tenNV: r.TenNV, maPA: r.MaPA, maAp: r.MaAp,
      viDo: Number(r.ViDo), kinhDo: Number(r.KinhDo), diem: Number(r.Diem || 15),
      trangThai: r.TrangThai, ngayTao: r.NgayTao, daCheckIn: daCheck
    };
  }).reverse();

  return {
    items: items, missions: missions,
    thongKe: {
      tong: items.length,
      choDuyet: items.filter(function (i) { return i.trangThai === 'Chờ duyệt'; }).length,
      daXuLy: items.filter(function (i) { return i.trangThai === 'Hoàn thành' || i.trangThai === 'Đã chuyển nhiệm vụ'; }).length
    }
  };
}

function svc_sosCreate(u, p) {
  if (!p.noiDung || String(p.noiDung).trim().length < 10) throw new Error('Vui lòng mô tả hiện trường tối thiểu 10 ký tự.');
  var today = nowStr_().slice(0, 10);
  var countToday = rows_('SOS').filter(function (r) {
    return String(r.MaDD) === String(u.MaDD) && String(r.ThoiGian).slice(0, 10) === today;
  }).length;
  if (countToday >= 3) throw new Error('Mỗi đoàn viên gửi tối đa 3 phản ánh/ngày để tránh nhiễu dữ liệu.');

  var maPA = newId_('PA');
  append_('SOS', {
    MaPA: maPA, MaDD: u.MaDD, HoTen: u.HoTen, MaAp: u.MaAp, Loai: p.loai || 'Khác',
    NoiDung: p.noiDung, ViDo: p.viDo || '', KinhDo: p.kinhDo || '',
    Diem: 0, TrangThai: 'Chờ duyệt', MaNV: '', ThoiGian: nowStr_()
  });
  var diem = award_(u, cfgNum_('DIEM_SOS', 10), 'Phản ánh SOS', p.loai || 'Hiện trường');
  log_(u.MaDD, 'GỬI SOS', maPA);
  return { maPA: maPA, diem: diem ? 10 : 0, message: 'Đã gửi phản ánh (+10 điểm Dân vận khéo). Bí thư Chi đoàn Ấp sẽ duyệt thành nhiệm vụ.' };
}

function svc_sosToMission(u, p) {
  assertCap_(u, [1, 2, 3]);
  var pa = findBy_('SOS', 'MaPA', p.maPA);
  if (!pa) throw new Error('Không tìm thấy phản ánh.');
  assertAp_(u, pa.MaAp);
  if (pa.MaNV) throw new Error('Phản ánh đã được chuyển thành nhiệm vụ.');
  var maNV = newId_('NV');
  append_('NhiemVu', {
    MaNV: maNV, TenNV: p.tenNV || ('Xử lý: ' + pa.Loai), MaPA: pa.MaPA, MaAp: pa.MaAp,
    ViDo: pa.ViDo || '', KinhDo: pa.KinhDo || '', Diem: cfgNum_('DIEM_CHECKIN_NV', 15),
    TrangThai: 'Đang mở', NgayTao: nowStr_()
  });
  update_('SOS', 'MaPA', p.maPA, { TrangThai: 'Đã chuyển nhiệm vụ', MaNV: maNV });
  log_(u.MaDD, 'SOS → NHIỆM VỤ', maNV);
  return { maNV: maNV, message: 'Đã tạo nhiệm vụ tình nguyện trên bản đồ số.' };
}

function svc_missionCheckin(u, p) {
  var nv = findBy_('NhiemVu', 'MaNV', p.maNV);
  if (!nv) throw new Error('Không tìm thấy nhiệm vụ.');
  var daCheck = rows_('Diem_Log').filter(function (l) {
    return String(l.MaDD) === String(u.MaDD) && String(l.GhiChu).indexOf(nv.MaNV) >= 0;
  }).length > 0;
  if (daCheck) throw new Error('Bạn đã check-in nhiệm vụ này.');

  var dist = null;
  if (nv.ViDo && p.viDo) dist = distanceM_(Number(nv.ViDo), Number(nv.KinhDo), Number(p.viDo), Number(p.kinhDo));
  if (dist !== null && dist > 500) {
    throw new Error('Bạn đang cách điểm nhiệm vụ ' + dist + 'm (yêu cầu tối đa 500m).');
  }
  var diem = Number(nv.Diem || 15);
  var tong = award_(u, diem, 'Check-in nhiệm vụ GPS', nv.MaNV + ' - ' + nv.TenNV);
  update_('NhiemVu', 'MaNV', nv.MaNV, { TrangThai: 'Hoàn thành' });
  log_(u.MaDD, 'CHECK-IN NHIỆM VỤ', nv.MaNV + (dist !== null ? ' (' + dist + 'm)' : ''));
  return { diem: diem, tongDiem: tong, khoangCach: dist, message: 'Check-in thành công (+' + diem + ' điểm).' };
}

/* ================================================================== */
/* 8. PHÂN HỆ 7 — QUIZ ARENA & BẢNG XẾP HẠNG                           */
/* ================================================================== */

function svc_quizList(u) {
  var answered = {};
  rows_('Quiz_KetQua').filter(function (r) { return String(r.MaDD) === String(u.MaDD); })
    .forEach(function (r) { answered[r.MaCau] = r; });

  var items = rows_('Quiz').map(function (q) {
    var ans = answered[q.MaCau];
    return {
      maCau: q.MaCau, noiDung: q.NoiDung, chuDe: q.ChuDe, diem: Number(q.Diem || 15),
      A: q.A, B: q.B, C: q.C, D: q.D,
      daTraLoi: !!ans, dung: ans ? String(ans.Dung) === 'TRUE' || ans.Dung === true : null,
      dapAnChon: ans ? ans.DapAnChon : '',
      dapAnDung: ans ? q.DapAn : '',
      giaiThich: ans ? q.GiaiThich : ''
    };
  });
  var dung = Object.keys(answered).filter(function (k) {
    return String(answered[k].Dung) === 'TRUE' || answered[k].Dung === true;
  }).length;
  return {
    items: items,
    tongCau: items.length,
    daLam: Object.keys(answered).length,
    soDung: dung,
    diemCuaToi: Number(u.Diem || 0),
    dapAnChon: {}
  };
}

function svc_quizAnswer(u, p) {
  var q = findBy_('Quiz', 'MaCau', p.maCau);
  if (!q) throw new Error('Không tìm thấy câu hỏi.');
  var existed = rows_('Quiz_KetQua').filter(function (r) {
    return String(r.MaDD) === String(u.MaDD) && String(r.MaCau) === String(p.maCau);
  })[0];
  if (existed) throw new Error('Bạn đã trả lời câu hỏi này.');

  var dung = String(p.dapAn).toUpperCase() === String(q.DapAn).toUpperCase();
  var diem = dung ? Number(q.Diem || 15) : 0;
  append_('Quiz_KetQua', {
    MaDD: u.MaDD, MaCau: q.MaCau, DapAnChon: p.dapAn, Dung: dung ? 'TRUE' : 'FALSE',
    Diem: diem, ThoiGian: nowStr_()
  });
  if (dung) award_(u, diem, 'Quiz Arena', q.MaCau);

  return {
    dung: dung, dapAnDung: q.DapAn, giaiThich: q.GiaiThich, diem: diem,
    message: dung ? 'Chính xác! +' + diem + ' điểm.' : 'Chưa chính xác. Đáp án đúng: ' + q.DapAn + '.'
  };
}

function svc_leaderboard(u) {
  var members = rows_('DM_CanBo').filter(function (r) { return Number(r.Cap) === 4 && !isTrue_(r.DaXoa); });
  var top = members.slice().sort(function (a, b) { return Number(b.Diem) - Number(a.Diem); }).slice(0, 10)
    .map(function (m, i) {
      return { hang: i + 1, maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, diem: Number(m.Diem || 0) };
    });

  var aps = rows_('DM_Ap').map(function (a) {
    var list = members.filter(function (m) { return String(m.MaAp) === String(a.MaAp); });
    var tb = list.length ? Math.round(list.reduce(function (s, m) { return s + Number(m.Diem || 0); }, 0) / list.length) : 0;
    return { maAp: a.MaAp, tenAp: a.TenAp, soDoanVien: list.length, diemTB: tb };
  }).sort(function (a, b) { return b.diemTB - a.diemTB; });

  var quizTop = rows_('Quiz_KetQua').filter(function (r) {
    return String(r.Dung) === 'TRUE' || r.Dung === true;
  }).length;

  return { top: top, aps: aps, tongCauDung: quizTop };
}

/* ================================================================== */
/* 9. PHÂN HỆ 6 — TRỢ LÝ AI ZALO BOT & SOẠN VĂN BẢN                    */
/* ================================================================== */

function svc_botAsk(u, p) {
  var text = String(p.text || '').trim();
  var up = text.toUpperCase();
  var nam = cfgNum_('NAM_CONG_TAC', 2026);

  if (/^DIEM\s+/.test(up)) {
    var key = text.replace(/^diem\s+/i, '').trim();
    var m = findBy_('DM_CanBo', 'MaDD', key) ||
      rows_('DM_CanBo').filter(function (r) { return String(r.DienThoai) === key; })[0];
    if (!m) return { reply: 'Không tìm thấy đoàn viên "' + key + '". Bạn kiểm tra lại Mã định danh hoặc số điện thoại nhé.' };
    if (!isXa_(u) && String(m.MaAp) !== String(u.MaAp) && String(m.MaDD) !== String(u.MaDD)) {
      return { reply: 'Bạn chỉ tra cứu được đoàn viên trong Chi đoàn Ấp của mình.' };
    }
    var ev = xepLoai360_(m.MaDD);
    return {
      reply: '📊 ' + m.HoTen + ' (' + m.MaDD + ' • ' + m.MaAp + ')\n' +
        '• Điểm rèn luyện: ' + m.Diem + '/300\n' +
        '• Thẻ Đoàn viên: ' + (m.MaThe || 'Chưa cấp') + '\n' +
        '• Tự đánh giá 360°: ' + (ev ? ev.XepLoai : 'Chưa thực hiện') + '\n' +
        '• Trạng thái: ' + m.TrangThai
    };
  }

  if (up.indexOf('CANH BAO') >= 0) {
    var lastMap = lastCheckinMap_();
    var list = rows_('DM_CanBo').filter(function (r) {
      if (Number(r.Cap) !== 4) return false;
      if (isXa_(u)) return true;
      if (isAp_(u)) return String(r.MaAp) === String(u.MaAp);
      return String(r.MaDD) === String(u.MaDD);
    }).map(function (r) {
      var t = lastMap[r.MaDD];
      return { hoTen: r.HoTen, maAp: r.MaAp, soNgay: t ? Math.floor((Date.now() - t) / 86400000) : 999 };
    }).filter(function (x) { return x.soNgay > 60; }).sort(function (a, b) { return b.soNgay - a.soNgay; }).slice(0, 6);

    if (!list.length) return { reply: '✅ Không có đoàn viên nào vắng quá 60 ngày. Tỷ lệ tập hợp đang rất tốt!' };
    return {
      reply: '⚠️ CẢNH BÁO SỚM — ' + list.length + ' đoàn viên vắng > 60 ngày:\n' +
        list.map(function (x) { return '• ' + x.hoTen + ' (' + x.maAp + ') — ' + x.soNgay + ' ngày'; }).join('\n') +
        '\n\nGợi ý: gửi tin nhắn Zalo mời tham gia sinh hoạt Hybrid để nối lại kết nối.'
    };
  }

  if (up.indexOf('UOM MAM') >= 0 || up.indexOf('ƯƠM MẦM') >= 0) {
    var res = svc_uomMamList(u, {});
    var du = res.items.filter(function (i) { return i.duDieuKien; });
    if (!du.length) return { reply: '🌱 Hiện chưa có đoàn viên nào đạt đủ 3 tiêu chuẩn (Thẻ ĐV + ≥300 điểm + 360° Tốt/Xuất sắc).' };
    return {
      reply: '🌱 Nguồn Ươm mầm Đỏ (' + du.length + ' đồng chí đủ điều kiện):\n' +
        du.map(function (x) { return '• ' + x.hoTen + ' — ' + x.diem + ' điểm — ' + x.xepLoai360; }).join('\n') +
        '\n\nBí thư Chi đoàn Ấp có thể đề cử trên tab Ươm mầm Đỏ.'
    };
  }

  if (up.indexOf('DOAN PHI') >= 0 || up.indexOf('ĐOÀN PHÍ') >= 0) {
    var fee = svc_feeMy(u, { nam: nam });
    return {
      reply: '💰 Đoàn phí năm ' + nam + ': ' + fee.trangThai + '\n' +
        '• Mức phí: ' + fee.mucPhi.toLocaleString('vi-VN') + 'đ/năm\n' +
        '• Nội dung CK: ' + fee.noiDung + '\n' +
        'Mở tab Đoàn phí để quét VietQR.'
    };
  }

  if (up.indexOf('DIEM DANH') >= 0 || up.indexOf('ĐIỂM DANH') >= 0) {
    return {
      reply: '📍 Hướng dẫn điểm danh:\n1. Bí thư Chi đoàn Ấp mở phiên → chiếu mã QR động lên màn hình.\n2. Đoàn viên mở tab Điểm danh → quét QR bằng camera.\n3. Mã đổi mỗi 60 giây, không nhận ảnh chụp màn hình.\n4. Trực tiếp +10đ • Hybrid +8đ • Kết nối Zalo +5đ.'
    };
  }

  return {
    reply: '🤖 Trợ lý Chi đoàn số 6.0 — Xã Tân Hòa. Bạn có thể nhắn:\n' +
      '• DIEM [Mã ĐV hoặc SĐT] — tra cứu điểm\n' +
      '• CANH BAO — danh sách vắng > 60 ngày\n' +
      '• UOM MAM DO — nguồn phát triển Đảng\n' +
      '• DOAN PHI — tình trạng đoàn phí\n' +
      '• DIEM DANH — hướng dẫn quét QR'
  };
}

function svc_botScript(u, p) {
  assertCap_(u, [1, 2, 3]);
  var noiDung = p.noiDung || 'Sinh hoạt Chi đoàn tháng';
  var thoiLuong = Number(p.thoiLuong || 45);
  var tenAp = tenDonVi_(u);
  var tenXa = cfg_().TEN_XA || 'Xã Tân Hòa';
  var nguoiDuyet = nguoiDuyetCuaAp_(u.MaAp || 'AP01');

  var chang = [
    ['0–5 phút', 'Ổn định tổ chức', 'Điểm danh QR động, tuyên bố lý do, giới thiệu đại biểu.'],
    [Math.round(thoiLuong * 0.15) + '–' + Math.round(thoiLuong * 0.30) + ' phút', 'Tổng kết công tác tháng', 'Báo cáo kết quả điểm danh, đoàn phí, phong trào Dân vận khéo, các chỉ tiêu đạt được.'],
    [Math.round(thoiLuong * 0.30) + '–' + Math.round(thoiLuong * 0.50) + ' phút', 'Triển khai nhiệm vụ mới', 'Quán triệt nghị quyết, phân công nhiệm vụ, giao chỉ tiêu cho từng đoàn viên.'],
    [Math.round(thoiLuong * 0.50) + '–' + Math.round(thoiLuong * 0.70) + ' phút', 'Thảo luận & phát biểu', 'Đoàn viên phát biểu, hiến kế; giải đáp vướng mắc; bình xét thi đua.'],
    [Math.round(thoiLuong * 0.70) + '–' + Math.round(thoiLuong * 0.90) + ' phút', 'Tuyên dương & Ươm mầm Đỏ', 'Công bố điểm rèn luyện, tuyên dương đoàn viên tiêu biểu, đề cử nguồn Cảm tình Đảng.'],
    [Math.round(thoiLuong * 0.90) + '–' + thoiLuong + ' phút', 'Kết thúc', 'Thông qua biên bản, kết luận của chủ tọa, bế mạc. Gửi biên bản số trong 24h.']
  ];

  var lines = [];
  lines.push('KỊCH BẢN ĐIỀU HÀNH SINH HOẠT CHI ĐOÀN');
  lines.push('Chủ đề: ' + noiDung);
  lines.push('Đơn vị: ' + (tenAp.indexOf(tenXa) >= 0 ? tenAp : tenAp + ' — ' + tenXa));
  lines.push('Thời lượng: ' + thoiLuong + ' phút | Người điều hành: ' + nguoiDuyet.hoTen);
  lines.push('Hình thức: Trực tiếp kết hợp Hybrid (50/50) qua Zalo/Google Meet');
  lines.push('');
  chang.forEach(function (c) {
    lines.push('[' + c[0] + '] ' + c[1]);
    lines.push('   → ' + c[2]);
  });
  lines.push('');
  lines.push('BƯỚC THỰC HIỆN TRÊN HỆ THỐNG:');
  lines.push('1. Mở phiên điểm danh QR động (tab Điểm danh) trước giờ họp 10 phút.');
  lines.push('2. Đoàn viên đi làm xa chọn hình thức "Hybrid" để nhận +8 điểm.');
  lines.push('3. Kết thúc họp: bấm Kết thúc phiên → hệ thống tự tổng hợp điểm.');
  lines.push('4. Gửi biên bản số + kịch bản này vào nhóm Zalo Chi đoàn trong 24 giờ.');
  lines.push('');
  lines.push('Người lập: ' + u.HoTen + ' — ' + u.ChucVu);

  return { noiDung: lines.join('\n'), tieuDe: 'Kịch bản: ' + noiDung };
}

function svc_botMinutes(u, p) {
  assertCap_(u, [1, 2, 3]);
  var m = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!m || isTrue_(m.DaXoa)) throw new Error('Không tìm thấy đoàn viên cần lập biên bản.');
  assertAp_(u, m.MaAp);
  var ev = xepLoai360_(m.MaDD);
  var the = findBy_('TheDoanVien', 'MaDD', m.MaDD);
  var st = findBy_('UomMamDo', 'MaDD', p.maDD);
  var fee = rows_('DoanPhi').filter(function (r) {
    return String(r.MaDD) === String(m.MaDD) && Number(r.Nam) === cfgNum_('NAM_CONG_TAC', 2026) && r.TrangThai === 'Đã xác nhận';
  })[0];
  var nam = cfgNum_('NAM_CONG_TAC', 2026);

  var lines = [
    'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    'Độc lập – Tự do – Hạnh phúc',
    '',
    'BIÊN BẢN GIỚI THIỆU ĐOÀN VIÊN ƯU TÚ CHO ĐẢNG',
    'Năm ' + nam,
    '',
    'Hôm nay, ngày ' + Utilities.formatDate(new Date(), TZ, 'dd') + ' tháng ' +
      Utilities.formatDate(new Date(), TZ, 'MM') + ' năm ' + Utilities.formatDate(new Date(), TZ, 'yyyy') + ', tại ' +
      (cfg_().TEN_XA || 'Xã Tân Hòa') + ', Chi đoàn ' + (findBy_('DM_Ap', 'MaAp', m.MaAp) || {}).TenAp + ' tổ chức họp xét giới thiệu đoàn viên ưu tú cho Đảng.',
    '',
    'I. THÔNG TIN ĐOÀN VIÊN',
    '• Họ và tên: ' + m.HoTen + ' — Mã định danh: ' + m.MaDD,
    '• Chức vụ: ' + m.ChucVu + ' — Chi đoàn: ' + (findBy_('DM_Ap', 'MaAp', m.MaAp) || {}).TenAp,
    '• Thẻ Đoàn viên: ' + (the ? the.MaThe : 'Chưa cấp'),
    '• Điểm rèn luyện tích lũy: ' + m.Diem + '/300 điểm',
    '• Tự đánh giá 360°: ' + (ev ? ev.XepLoai + ' (' + ev.TongDiem + '/25)' : 'Chưa thực hiện'),
    '• Đoàn phí năm ' + nam + ': ' + (fee ? 'Đã hoàn thành' : 'Chưa hoàn thành'),
    '',
    'II. NHẬN XÉT CỦA CHI ĐOÀN',
    (st && st.NhanXet) ? st.NhanXet : 'Đoàn viên có lập trường tư tưởng vững vàng, đạo đức lối sống lành mạnh, tích cực tham gia các phong trào tình nguyện và chuyển đổi số tại địa phương; hoàn thành tốt nhiệm vụ được giao, có uy tín trong thanh niên.',
    '',
    'III. KẾT LUẬN',
    'Chi đoàn thống nhất giới thiệu đồng chí ' + m.HoTen + ' vào nguồn phát triển Đảng, trình Bí thư Chi bộ Xã xem xét, đưa vào danh sách học lớp Cảm tình Đảng.',
    '',
    'Biên bản được lập thành 02 bản, lưu tại Chi đoàn và Chi bộ Xã.',
    '',
    'Người lập biên bản                    Bí thư Chi đoàn',
    u.HoTen + '                              ' + (findBy_('DM_Ap', 'MaAp', m.MaAp) || {}).BiThu
  ];

  return { noiDung: lines.join('\n'), tieuDe: 'Biên bản giới thiệu ' + m.HoTen };
}

/* ================================================================== */
/* 8. QUẢN TRỊ HỆ THỐNG — CẤP 0 (ADMIN)                               */
/* ================================================================== */

function adminConfigMeta_() {
  return {
    TEN_XA: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Tên địa phương' },
    TEN_CHI_BO: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Tên đầy đủ của đơn vị cấp xã' },
    BI_THU_XA: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Chủ tịch Ủy ban Hội LHTN Việt Nam Xã' },
    PHO_BI_THU_XA: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Bí thư Chi bộ Xã' },
    DIEN_THOAI_XA: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Điện thoại liên hệ' },
    DIA_CHI_XA: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Địa chỉ trụ sở' },
    EMAIL_XA: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Email liên hệ' },
    NGAY_THANH_LAP: { nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Ngày thành lập Chi đoàn Xã' },

    DIEM_HOP_TRUC_TIEP: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm danh họp trực tiếp' },
    DIEM_BAO_CAO_HYBRID: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm báo cáo Hybrid' },
    DIEM_KET_NOI_ZALO: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm kết nối lại qua Zalo' },
    DIEM_UOM_MAM: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm khi được duyệt Ươm mầm Đỏ' },
    DIEM_DOAN_PHI: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm hoàn thành đoàn phí năm' },
    DIEM_TICH_HOP_THE: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm tích hợp Thẻ Đoàn viên' },
    DIEM_TU_DANH_GIA: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm tự đánh giá 360°' },
    DIEM_SOS: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm gửi phản ánh SOS' },
    DIEM_CHECKIN_NV: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm check-in nhiệm vụ GPS' },
    DIEM_QUIZ: { nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm mỗi câu trắc nghiệm đúng' },

    MUC_TIEU_DIEM: { nhom: 'Học tập & đoàn phí', kieu: 'number', moTa: 'Mức điểm rèn luyện/năm để xét Ươm mầm Đỏ' },
    DOAN_PHI_NAM: { nhom: 'Học tập & đoàn phí', kieu: 'number', moTa: 'Mức đoàn phí chuẩn/năm' },
    NAM_CONG_TAC: { nhom: 'Học tập & đoàn phí', kieu: 'number', moTa: 'Năm công tác' },

    BANK_ID: { nhom: 'Thanh toán VietQR', kieu: 'text', moTa: 'Mã ngân hàng (MB, VCB, ICB, TCB...)' },
    BANK_ACC: { nhom: 'Thanh toán VietQR', kieu: 'text', moTa: 'Số tài khoản nhận đoàn phí' },
    BANK_NAME: { nhom: 'Thanh toán VietQR', kieu: 'text', moTa: 'Tên chủ tài khoản' }
  };
}

function adminConfigItems_() {
  var meta = adminConfigMeta_();
  return rows_('CauHinh').map(function (r) {
    var m = meta[r.Khoa] || {};
    return {
      khoa: r.Khoa,
      giaTri: r.GiaTri,
      moTa: r.MoTa || m.moTa || '',
      nhom: m.nhom || 'Khác',
      kieu: m.kieu || 'text'
    };
  });
}

function jsDate_(v) {
  var d = parseDate_(v);
  return d ? d.getTime() : 0;
}

function svc_adminSummary(u) {
  assertAdmin_(u);
  var allUsers = rows_('DM_CanBo');
  var users = allUsers.filter(function (r) { return !isTrue_(r.DaXoa); });
  var members = users.filter(function (r) { return Number(r.Cap) === 4; });
  var accounts = users.filter(function (r) { return Number(r.Cap) > 0; });
  var logs = rows_('Log').slice().sort(function (a, b) { return jsDate_(b.ThoiGian) - jsDate_(a.ThoiGian); });
  var active = users.filter(function (r) { return String(r.TrangThai) === 'Đang hoạt động'; }).length;

  return {
    phienBan: '6.0',
    soAp: rows_('DM_Ap').length,
    soDoanVien: members.length,
    soTaiKhoan: accounts.length,
    soCanBo: users.filter(function (r) { return Number(r.Cap) >= 1 && Number(r.Cap) <= 3; }).length,
    soHoatDong: active,
    soNhatKy: logs.length,
    logs: logs.slice(0, 6).map(function (r) {
      var m = users.filter(function (x) { return String(x.MaDD) === String(r.MaDD); })[0];
      return {
        maDD: r.MaDD, hoTen: m ? m.HoTen : r.MaDD,
        hanhDong: r.HanhDong, chiTiet: r.ChiTiet, thoiGian: r.ThoiGian
      };
    })
  };
}

function svc_adminApList(u) {
  assertAdmin_(u);
  var users = rows_('DM_CanBo').filter(function (u) { return !isTrue_(u.DaXoa); });
  var items = rows_('DM_Ap').map(function (a) {
    var list = users.filter(function (m) { return String(m.MaAp) === String(a.MaAp); });
    var biThu = users.filter(function (m) { return String(m.MaDD) === String(a.BiThu); })[0];
    return {
      maAp: a.MaAp, tenAp: a.TenAp, biThu: a.BiThu || '', biThuTen: biThu ? biThu.HoTen : '',
      chiTieu: Number(a.ChiTieu || 0), ghiChu: a.GhiChu || '',
      soDoanVien: list.filter(function (m) { return Number(m.Cap) === 4; }).length,
      soTaiKhoan: list.length
    };
  });
  return { items: items };
}

function nextMaAp_() {
  var max = 0;
  rows_('DM_Ap').forEach(function (a) {
    var m = String(a.MaAp).match(/^AP(\d+)$/);
    if (m && Number(m[1]) > max) max = Number(m[1]);
  });
  return 'AP' + ('0' + (max + 1)).slice(-2);
}

function svc_adminApSave(u, p) {
  assertAdmin_(u);
  var maAp = String(p.maAp || '').trim().toUpperCase();
  var tenAp = String(p.tenAp || '').trim();
  var biThu = String(p.biThu || '').trim().toUpperCase();
  var chiTieu = p.chiTieu === undefined || p.chiTieu === '' ? 0 : Number(p.chiTieu);
  var ghiChu = String(p.ghiChu || '').trim();
  if (!tenAp) throw new Error('Vui lòng nhập tên Ấp / Chi đoàn Ấp.');
  if (!isFinite(chiTieu) || chiTieu < 0) throw new Error('Chỉ tiêu phải là số không âm.');

  var duplicate = rows_('DM_Ap').filter(function (a) {
    return String(a.TenAp).trim().toLowerCase() === tenAp.toLowerCase() && String(a.MaAp) !== maAp;
  })[0];
  if (duplicate) throw new Error('Tên Ấp "' + tenAp + '" đã tồn tại.');

  var target = null;
  if (biThu) {
    target = findBy_('DM_CanBo', 'MaDD', biThu);
    if (!target) throw new Error('Không tìm thấy tài khoản Bí thư "' + biThu + '".');
    if (Number(target.Cap) !== 3) throw new Error('Bí thư Chi đoàn Ấp phải là tài khoản Cấp 3.');
    if (target.MaAp && String(target.MaAp) !== maAp) {
      throw new Error('Tài khoản ' + biThu + ' đang thuộc ' + target.MaAp + ', không thể gán sang ' + maAp + '.');
    }
  }

  var isNew = !maAp;
  if (isNew) maAp = nextMaAp_();
  var existing = findBy_('DM_Ap', 'MaAp', maAp);
  if (!isNew && !existing) throw new Error('Không tìm thấy Ấp cần cập nhật.');

  var patch = { TenAp: tenAp, BiThu: biThu, ChiTieu: chiTieu, GhiChu: ghiChu };
  if (existing) update_('DM_Ap', 'MaAp', maAp, patch);
  else append_('DM_Ap', { MaAp: maAp, TenAp: tenAp, BiThu: biThu, ChiTieu: chiTieu, GhiChu: ghiChu });

  if (target) update_('DM_CanBo', 'MaDD', biThu, { MaAp: maAp });

  log_(u.MaDD, isNew ? 'THÊM ẤP' : 'CẬP NHẬT ẤP', maAp + ' - ' + tenAp);
  return {
    maAp: maAp,
    message: (isNew ? 'Đã thêm ' : 'Đã cập nhật ') + tenAp + ' (' + maAp + ').'
  };
}

function svc_adminApDelete(u, p) {
  assertAdmin_(u);
  var maAp = String(p.maAp || '').trim().toUpperCase();
  var ap = findBy_('DM_Ap', 'MaAp', maAp);
  if (!ap) throw new Error('Không tìm thấy Ấp cần xóa.');
  var soNguoi = rows_('DM_CanBo').filter(function (r) { return String(r.MaAp) === maAp; }).length;
  if (soNguoi > 0) {
    throw new Error('Không thể xóa ' + ap.TenAp + ': còn ' + soNguoi + ' tài khoản đang thuộc Ấp này. Hãy chuyển hoặc khóa tài khoản trước.');
  }
  removeRow_('DM_Ap', 'MaAp', maAp);
  log_(u.MaDD, 'XÓA ẤP', maAp + ' - ' + ap.TenAp);
  return { message: 'Đã xóa ' + ap.TenAp + ' (' + maAp + ').' };
}

function svc_adminConfigList(u) {
  assertAdmin_(u);
  return { items: adminConfigItems_() };
}

function svc_adminConfigSave(u, p) {
  assertAdmin_(u);
  var meta = adminConfigMeta_();
  var items = p.items;
  if (!items && p.khoa) items = [{ khoa: p.khoa, giaTri: p.giaTri }];
  if (!items || !items.length) throw new Error('Không có cấu hình nào để lưu.');

  var normalized = [];
  items.forEach(function (it) {
    var khoa = String(it.khoa || '').trim();
    var m = meta[khoa];
    if (!m) throw new Error('Khóa cấu hình không hợp lệ: ' + khoa);
    var giaTri = String(it.giaTri === undefined || it.giaTri === null ? '' : it.giaTri).trim();
    if (m.kieu === 'number') {
      if (giaTri === '' || !isFinite(Number(giaTri)) || Number(giaTri) < 0) {
        throw new Error(m.moTa + ' phải là số không âm.');
      }
      if (khoa === 'NAM_CONG_TAC' && (Number(giaTri) < 2020 || Number(giaTri) > 2100)) {
        throw new Error('Năm công tác phải trong khoảng 2020–2100.');
      }
      giaTri = String(Number(giaTri));
    }
    if ((khoa === 'TEN_XA' || khoa === 'TEN_CHI_BO') && !giaTri) {
      throw new Error(m.moTa + ' không được để trống.');
    }
    normalized.push({ khoa: khoa, giaTri: giaTri, moTa: m.moTa, nhom: m.nhom });
  });

  normalized.forEach(function (it) {
    if (findBy_('CauHinh', 'Khoa', it.khoa)) {
      update_('CauHinh', 'Khoa', it.khoa, { GiaTri: it.giaTri });
    } else {
      append_('CauHinh', { Khoa: it.khoa, GiaTri: it.giaTri, MoTa: it.moTa });
    }
  });
  log_(u.MaDD, 'CẬP NHẬT CẤU HÌNH', normalized.map(function (x) { return x.khoa; }).join(', '));
  return { message: 'Đã lưu ' + normalized.length + ' cấu hình hệ thống.', items: adminConfigItems_() };
}

function svc_adminAccountList(u, p) {
  assertAdmin_(u);
  var q = String(p.q || '').trim().toLowerCase();
  var trash = isTrue_(p.daXoa) || p.daXoa === true;
  var items = rows_('DM_CanBo').filter(function (r) {
    if (isTrue_(r.DaXoa) !== trash) return false;
    if (!q) return true;
    return [r.MaDD, r.HoTen, r.DienThoai, r.ChucVu].join(' ').toLowerCase().indexOf(q) >= 0;
  }).map(function (r) {
    return {
      maDD: r.MaDD, hoTen: r.HoTen, cap: Number(r.Cap), chucVu: r.ChucVu,
      maAp: r.MaAp || '', tenAp: tenDonVi_(r),
      dienThoai: r.DienThoai || '', ngaySinh: r.NgaySinh || '', ghiChu: r.GhiChu || '',
      trangThai: r.TrangThai || '', diem: Number(r.Diem || 0),
      coMatKhau: !!r.MatKhauHash, batDoiMatKhau: isTrue_(r.BatDoiMatKhau),
      batDoiPin: isTrue_(r.BatDoiPin), daXoa: isTrue_(r.DaXoa),
      ngayXoa: r.NgayXoa || '', nguoiXoa: r.NguoiXoa || ''
    };
  }).sort(function (a, b) {
    if (a.cap !== b.cap) return a.cap - b.cap;
    return String(a.hoTen).localeCompare(String(b.hoTen));
  });
  return { items: items };
}

function svc_adminAccountCreate(u, p) {
  assertAdmin_(u);
  var maDD = String(p.maDD || '').trim().toUpperCase();
  var hoTen = String(p.hoTen || '').trim();
  var cap = Number(p.cap);
  var maAp = String(p.maAp || '').trim().toUpperCase();
  var dienThoai = String(p.dienThoai || '').trim();
  if (!/^[A-Z0-9_]{3,20}$/.test(maDD)) throw new Error('Mã định danh chỉ gồm chữ, số, gạch dưới (3–20 ký tự).');
  if (!hoTen) throw new Error('Vui lòng nhập họ tên.');
  if ([1, 2, 3, 4].indexOf(cap) < 0) throw new Error('Cấp tài khoản phải là 1, 2, 3 hoặc 4.');
  if (findBy_('DM_CanBo', 'MaDD', maDD)) throw new Error('Mã định danh ' + maDD + ' đã tồn tại.');
  if (dienThoai && !/^0\d{9}$/.test(dienThoai)) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');

  var ap = null;
  if (cap === 1 || cap === 2) {
    maAp = '';
  } else {
    if (!maAp) throw new Error('Vui lòng chọn Ấp cho tài khoản.');
    ap = findBy_('DM_Ap', 'MaAp', maAp);
    if (!ap) throw new Error('Không tìm thấy Ấp ' + maAp + '.');
  }

  var chucVu = cap === 1 ? 'Chủ Tịch'
    : cap === 2 ? 'Bí thư Chi bộ Xã'
      : cap === 3 ? ('Bí thư Chi đoàn ' + (ap ? ap.TenAp : maAp))
        : 'Đoàn viên';
  append_('DM_CanBo', {
    MaDD: maDD, HoTen: hoTen, Cap: cap, ChucVu: chucVu, MaAp: maAp,
    DienThoai: dienThoai, NgaySinh: p.ngaySinh || '',
    NgayVaoDoan: '', NoiVaoDoan: ap ? ('Chi đoàn ' + ap.TenAp) : '',
    NgaySinhHoatDoan: cap === 4 ? 'Ngày 25 hằng tháng' : 'Ngày 20 hằng tháng',
    PIN: '', PINHash: hashPin_(maDD, '123456'), BatDoiPin: 'TRUE',
    SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
    Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '',
    UyQuyenCho: '', UyQuyenDen: '', DaXoa: 'FALSE', NgayXoa: '', NguoiXoa: '',
    NgayThamGia: nowStr_(), GhiChu: 'Tạo bởi ' + u.MaDD,
    MatKhauHash: '', BatDoiMatKhau: 'FALSE'
  });
  if (cap === 3 && ap && !ap.BiThu) update_('DM_Ap', 'MaAp', maAp, { BiThu: maDD });
  log_(u.MaDD, 'TẠO TÀI KHOẢN', maDD + ' - ' + hoTen + ' (Cấp ' + cap + ')');
  return { maDD: maDD, message: 'Đã tạo tài khoản ' + maDD + ' (PIN mặc định 123456 — buộc đổi khi đăng nhập).' };
}

/**
 * Cập nhật hồ sơ tài khoản C0–C4. Quản trị viên được sửa trực tiếp
 * thông tin Chủ tịch Hội LHTN Xã (C1) và Bí thư Chi bộ Xã (C2);
 * khi đổi tên hai chức danh này, thông tin đơn vị được đồng bộ theo.
 */
function svc_adminAccountUpdate(u, p) {
  assertAdmin_(u);
  var target = findBy_('DM_CanBo', 'MaDD', String(p.maDD || '').trim());
  if (!target) throw new Error('Không tìm thấy tài khoản.');
  if (isTrue_(target.DaXoa)) throw new Error('Tài khoản đang nằm trong thùng rác. Hãy khôi phục trước.');

  var hoTen = String(p.hoTen || '').trim();
  if (!hoTen) throw new Error('Vui lòng nhập họ tên.');
  var dienThoai = String(p.dienThoai || '').trim();
  if (dienThoai && !/^0\d{9}$/.test(dienThoai)) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');

  var patch = {
    HoTen: hoTen,
    DienThoai: dienThoai,
    NgaySinh: String(p.ngaySinh || '').trim(),
    GhiChu: String(p.ghiChu || '').trim()
  };
  update_('DM_CanBo', 'MaDD', target.MaDD, patch);

  syncChucDanhConfig_(Number(target.Cap), String(target.HoTen || '').trim(), hoTen);
  log_(u.MaDD, 'CẬP NHẬT TÀI KHOẢN', target.MaDD + ' - ' + target.HoTen + ' → ' + hoTen);
  return { maDD: target.MaDD, message: 'Đã cập nhật thông tin ' + hoTen + '.' };
}

/** Đồng bộ tên Chủ tịch (C1) / Bí thư Chi bộ Xã (C2) vào thông tin đơn vị. */
function syncChucDanhConfig_(cap, oldName, newName) {
  if (oldName === newName) return;
  var khoa = cap === 1 ? 'BI_THU_XA' : cap === 2 ? 'PHO_BI_THU_XA' : '';
  if (!khoa) return;
  var cfg = findBy_('CauHinh', 'Khoa', khoa);
  if (cfg && String(cfg.GiaTri || '').trim() === oldName) {
    update_('CauHinh', 'Khoa', khoa, { GiaTri: newName });
  }
}

function svc_adminAccountStatus(u, p) {
  assertAdmin_(u);
  var target = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!target) throw new Error('Không tìm thấy tài khoản.');
  if (isTrue_(target.DaXoa)) throw new Error('Tài khoản đang nằm trong thùng rác. Hãy khôi phục trước.');
  if (isAdmin_(target)) throw new Error('Không thể khóa tài khoản quản trị hệ thống.');
  var status = String(p.trangThai || '').trim();
  if (['Đang hoạt động', 'Tạm khóa'].indexOf(status) < 0) throw new Error('Trạng thái không hợp lệ.');
  if (status === 'Tạm khóa' && (Number(target.Cap) === 1 || Number(target.Cap) === 2)) {
    var conLai = rows_('DM_CanBo').filter(function (r) {
      return Number(r.Cap) === Number(target.Cap) && String(r.MaDD) !== String(target.MaDD) &&
        !isTrue_(r.DaXoa) && String(r.TrangThai) === 'Đang hoạt động';
    }).length;
    if (conLai === 0) {
      throw new Error('Không thể khóa ' + (Number(target.Cap) === 1 ? 'Chủ tịch Hội LHTN Xã' : 'Bí thư Chi bộ Xã') + ' cuối cùng đang hoạt động.');
    }
  }
  var patch = { TrangThai: status };
  if (status === 'Tạm khóa') {
    patch.TokenVersion = Number(target.TokenVersion || 0) + 1;
    patch.SoLanSai = 0;
    patch.KhoaDen = '';
  } else {
    patch.SoLanSai = 0;
    patch.KhoaDen = '';
  }
  update_('DM_CanBo', 'MaDD', target.MaDD, patch);
  log_(u.MaDD, status === 'Tạm khóa' ? 'KHÓA TÀI KHOẢN' : 'MỞ KHÓA TÀI KHOẢN', target.MaDD + ' - ' + target.HoTen);
  return { message: (status === 'Tạm khóa' ? 'Đã khóa ' : 'Đã mở khóa ') + target.HoTen + '.' };
}

function svc_adminAccountResetPin(u, p) {
  assertAdmin_(u);
  var target = findBy_('DM_CanBo', 'MaDD', p.maDD);
  if (!target) throw new Error('Không tìm thấy tài khoản.');
  if (isTrue_(target.DaXoa)) throw new Error('Tài khoản đang nằm trong thùng rác. Hãy khôi phục trước.');
  if (isAdmin_(target)) throw new Error('Tài khoản quản trị dùng mật khẩu chữ, không dùng PIN.');
  var pin = randPin_();
  withLock_(function () {
    setPin_(target.MaDD, pin, true);
    log_(u.MaDD, 'CẤP LẠI PIN', target.MaDD + ' - ' + target.HoTen);
  });
  return { pin: pin, message: 'Đã cấp PIN mới cho ' + target.HoTen + '. Người dùng phải đổi PIN khi đăng nhập.' };
}

function svc_adminLogs(u, p) {
  assertAdmin_(u);
  var limit = Math.min(Math.max(Number(p.limit || 100), 1), 500);
  var q = String(p.q || '').trim().toLowerCase();
  var users = {};
  rows_('DM_CanBo').forEach(function (r) { users[r.MaDD] = r.HoTen; });
  var all = rows_('Log').slice().sort(function (a, b) { return jsDate_(b.ThoiGian) - jsDate_(a.ThoiGian); });
  var filtered = all.filter(function (r) {
    if (!q) return true;
    return [r.MaDD, users[r.MaDD] || '', r.HanhDong, r.ChiTiet].join(' ').toLowerCase().indexOf(q) >= 0;
  });
  return {
    tong: filtered.length,
    items: filtered.slice(0, limit).map(function (r) {
      return {
        maDD: r.MaDD, hoTen: users[r.MaDD] || r.MaDD,
        hanhDong: r.HanhDong, chiTiet: r.ChiTiet, thoiGian: r.ThoiGian
      };
    })
  };
}

/* ================================================================== */
/* 9. SAO LƯU & ĐỐI SOÁT ĐIỂM                                         */
/* ================================================================== */

function setCfg_(khoa, giaTri, moTa) {
  if (findBy_('CauHinh', 'Khoa', khoa)) {
    update_('CauHinh', 'Khoa', khoa, { GiaTri: giaTri });
  } else {
    append_('CauHinh', { Khoa: khoa, GiaTri: giaTri, MoTa: moTa || '' });
  }
}

/** Lấy hoặc tạo thư mục sao lưu trên Google Drive. */
function backupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BACKUP_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* tạo lại bên dưới */ }
  }
  var ten = 'CD6_Backup_' + (cfg_().TEN_XA || 'Xa_Tan_Hoa').replace(/[^\w\-]+/g, '_');
  var found = DriveApp.getFoldersByName(ten);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(ten);
  props.setProperty('BACKUP_FOLDER_ID', folder.getId());
  return folder;
}

/** Tạo một bản sao lưu bảng tính và dọn các bản cũ. */
function backupCore_() {
  return withLock_(function () {
    var folder = backupFolder_();
    var ten = 'CD6_Backup_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss');
    var file = DriveApp.getFileById(ss_().getId()).makeCopy(ten, folder);
    var luc = nowStr_();
    setCfg_('LAN_SAO_LUU_CUOI', luc, 'Thời điểm sao lưu bảng tính gần nhất');

    // Giữ tối đa SO_BAN_SAO_LUU bản mới nhất.
    var giu = Math.max(1, cfgNum_('SO_BAN_SAO_LUU', 30));
    var files = [];
    var it = folder.getFiles();
    while (it.hasNext()) files.push(it.next());
    files.sort(function (a, b) { return a.getDateCreated().getTime() - b.getDateCreated().getTime(); });
    while (files.length > giu) {
      try { files.shift().setTrashed(true); } catch (e) { /* bỏ qua */ }
    }
    return {
      id: file.getId(), ten: file.getName(), luc: luc,
      folder: folder.getName(), url: file.getUrl(),
      message: 'Đã sao lưu bảng tính lên Google Drive: ' + file.getName()
    };
  });
}

function svc_backupNow(u) {
  assertAdmin_(u);
  var r = backupCore_();
  log_(u.MaDD, 'SAO LƯU DỮ LIỆU', r.ten);
  return r;
}

function svc_backupList(u) {
  assertAdmin_(u);
  var items = [];
  try {
    var folder = backupFolder_();
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      items.push({
        id: f.getId(), ten: f.getName(), luc: Utilities.formatDate(f.getDateCreated(), TZ, 'yyyy-MM-dd HH:mm:ss'),
        size: f.getSize(), url: f.getUrl()
      });
    }
  } catch (e) { /* chưa cấu hình Drive */ }
  items.sort(function (a, b) { return String(b.luc).localeCompare(String(a.luc)); });
  return {
    items: items.slice(0, 50),
    lanCuoi: cfg_().LAN_SAO_LUU_CUOI || '',
    soBanGiuLai: cfgNum_('SO_BAN_SAO_LUU', 30)
  };
}

/** Tìm một tệp sao lưu trong đúng thư mục CD6_Backup (không đọc tệp Drive tùy ý). */
function backupFile_(id) {
  var wanted = String(id || '').trim();
  if (!wanted) throw new Error('Thiếu mã bản sao lưu cần xử lý.');
  var it = backupFolder_().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (String(f.getId()) === wanted) return f;
  }
  throw new Error('Không tìm thấy bản sao lưu trong thư mục CD6_Backup.');
}

/** Thư mục chứa các bản phục hồi (tách biệt dữ liệu đang chạy). */
function restoreFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RESTORE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* tạo lại bên dưới */ }
  }
  var ten = 'CD6_Restore_' + (cfg_().TEN_XA || 'Xa_Tan_Hoa').replace(/[^\w\-]+/g, '_');
  var found = DriveApp.getFoldersByName(ten);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(ten);
  props.setProperty('RESTORE_FOLDER_ID', folder.getId());
  return folder;
}

/**
 * Kiểm tra một bản sao lưu: mở được, đếm số sheet và đối chiếu danh mục SCHEMA.
 * Chỉ đọc, không thay đổi dữ liệu đang chạy.
 */
function svc_backupVerify(u, p) {
  assertAdmin_(u);
  var f = backupFile_(p.id);
  var ss;
  try {
    ss = SpreadsheetApp.openById(f.getId());
  } catch (e) {
    throw new Error('Tệp sao lưu không mở được như bảng tính Google Sheets.');
  }
  var co = ss.getSheets().map(function (s) { return s.getName(); });
  var thieu = Object.keys(SCHEMA).filter(function (n) { return co.indexOf(n) < 0; });
  var luc = Utilities.formatDate(f.getDateCreated(), TZ, 'yyyy-MM-dd HH:mm:ss');
  log_(u.MaDD, 'KIỂM TRA SAO LƯU', f.getName() + (thieu.length ? (' — thiếu ' + thieu.join(', ')) : ' — hợp lệ'));
  return {
    id: f.getId(), ten: f.getName(), luc: luc, size: f.getSize(),
    soSheet: co.length, thieu: thieu, hopLe: thieu.length === 0,
    message: thieu.length
      ? ('Bản sao lưu mở được nhưng thiếu ' + thieu.length + ' sheet: ' + thieu.join(', ') + '.')
      : ('Bản sao lưu hợp lệ: ' + co.length + ' sheet, đủ ' + Object.keys(SCHEMA).length + ' sheet nghiệp vụ.')
  };
}

/**
 * Phục hồi AN TOÀN: tạo một bản sao mới từ bản sao lưu, không ghi đè bảng tính
 * đang chạy. Quản trị viên kiểm tra bản phục hồi rồi mới chuyển đổi thủ công.
 */
function svc_backupRestoreCopy(u, p) {
  assertAdmin_(u);
  if (String(p.xacNhan || '').trim().toUpperCase() !== 'PHUC HOI') {
    throw new Error('Nhập đúng "PHUC HOI" để xác nhận tạo bản phục hồi.');
  }
  var f = backupFile_(p.id);
  var tenCu = f.getName();
  var ten = 'CD6_Restore_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss');
  var folder = restoreFolder_();
  var copy = f.makeCopy(ten, folder);
  var soSheet = 0;
  try { soSheet = SpreadsheetApp.openById(copy.getId()).getSheets().length; } catch (e) { /* vẫn trả tệp */ }
  log_(u.MaDD, 'PHỤC HỒI SAO LƯU', 'Tạo bản phục hồi từ ' + tenCu + ' — dữ liệu đang chạy không đổi');
  return {
    id: copy.getId(), ten: copy.getName(), url: copy.getUrl(), soSheet: soSheet,
    nguon: tenCu,
    message: 'Đã tạo bản phục hồi "' + copy.getName() + '" trong thư mục ' + folder.getName() +
      '. Dữ liệu đang chạy KHÔNG bị thay đổi; hãy kiểm tra bản phục hồi trước khi chuyển đổi.'
  };
}

/** Trigger hằng ngày: sao lưu bảng tính, không chặn nếu lỗi. */
function backupHangNgay() {
  try {
    var r = backupCore_();
    log_('SYSTEM', 'SAO LƯU TỰ ĐỘNG', r.ten);
  } catch (e) {
    log_('SYSTEM', 'SAO LƯU THẤT BẠI', String(e && e.message ? e.message : e));
  }
}

/**
 * Đối soát điểm: Diem = DiemNen + SUM(Diem_Log).
 * Chỉ sửa các bản ghi bị lệch; người chưa có sổ điểm vẫn giữ nguyên điểm nền.
 */
function svc_reconcilePoints(u) {
  assertAdmin_(u);
  return withLock_(function () {
    var logSum = {};
    rows_('Diem_Log').forEach(function (r) {
      logSum[r.MaDD] = Number(logSum[r.MaDD] || 0) + Number(r.Diem || 0);
    });
    var lech = [];
    var daKiemTra = 0;
    rows_('DM_CanBo').forEach(function (m) {
      if (isTrue_(m.DaXoa)) return;
      daKiemTra++;
      var tong = Number(logSum[m.MaDD] || 0);
      var nenTrong = (m.DiemNen === '' || m.DiemNen === undefined || m.DiemNen === null);
      var nen = nenTrong ? (Number(m.Diem || 0) - tong) : Number(m.DiemNen || 0);
      var dung = nen + tong;
      var hienTai = Number(m.Diem || 0);
      var patch = {};
      if (nenTrong) patch.DiemNen = nen;
      if (dung !== hienTai) {
        patch.Diem = dung;
        lech.push({ maDD: m.MaDD, hoTen: m.HoTen, truoc: hienTai, sau: dung, chenh: dung - hienTai });
      }
      if (Object.keys(patch).length) update_('DM_CanBo', 'MaDD', m.MaDD, patch);
    });
    log_(u.MaDD, 'ĐỐI SOÁT ĐIỂM', 'Kiểm tra ' + daKiemTra + ' tài khoản, sửa ' + lech.length + ' bản ghi lệch');
    return {
      soTaiKhoan: daKiemTra, soLech: lech.length,
      chiTiet: lech.slice(0, 50),
      message: lech.length
        ? ('Đã đối soát ' + daKiemTra + ' tài khoản, điều chỉnh ' + lech.length + ' bản ghi lệch điểm.')
        : ('Đã đối soát ' + daKiemTra + ' tài khoản. Toàn bộ điểm khớp với sổ điểm.')
    };
  });
}

/* ================================================================== */
/* 10. SỨC KHỎE HỆ THỐNG                                              */
/* ================================================================== */

function svc_health(u) {
  assertAdmin_(u);
  var kiemTra = [];
  var thieu = [];
  var thua = [];
  try {
    var co = ss_().getSheets().map(function (s) { return s.getName(); });
    thieu = Object.keys(SCHEMA).filter(function (n) { return co.indexOf(n) < 0; });
    thua = co.filter(function (n) { return Object.keys(SCHEMA).indexOf(n) < 0; });
    kiemTra.push({
      ten: 'Cấu trúc bảng tính', trangThai: thieu.length ? 'loi' : 'ok',
      chiTiet: thieu.length ? ('Thiếu ' + thieu.join(', ')) : (co.length + ' sheet, đủ ' + Object.keys(SCHEMA).length + ' bảng')
    });
  } catch (e) {
    kiemTra.push({ ten: 'Cấu trúc bảng tính', trangThai: 'loi', chiTiet: String(e && e.message ? e.message : e) });
  }

  var schemaApDung = '0';
  try { schemaApDung = PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION_APPLIED') || '0'; } catch (e) { /* bỏ qua */ }
  kiemTra.push({
    ten: 'Phiên bản lược đồ', trangThai: Number(schemaApDung) >= Number(SCHEMA_VERSION) ? 'ok' : 'canhBao',
    chiTiet: 'Đang dùng ' + schemaApDung + ' / mới nhất ' + SCHEMA_VERSION
  });

  var coTrigger = false;
  var triggerLuc = '';
  try {
    ScriptApp.getProjectTriggers().forEach(function (t) {
      if (t.getHandlerFunction() === 'backupHangNgay') {
        coTrigger = true;
        try { triggerLuc = String(t.getTriggerSource()); } catch (e) { /* bỏ qua */ }
      }
    });
  } catch (e) { /* bỏ qua */ }
  kiemTra.push({
    ten: 'Sao lưu tự động', trangThai: coTrigger ? 'ok' : 'canhBao',
    chiTiet: coTrigger ? 'Trigger hằng ngày đã bật' : 'Chưa có trigger backupHangNgay'
  });

  var driveOk = false;
  var soBanSao = 0;
  try {
    var folder = backupFolder_();
    driveOk = !!folder;
    var it = folder.getFiles();
    while (it.hasNext() && soBanSao < 200) { it.next(); soBanSao++; }
  } catch (e) { /* bỏ qua */ }
  kiemTra.push({
    ten: 'Thư mục sao lưu Drive', trangThai: driveOk ? 'ok' : 'canhBao',
    chiTiet: driveOk ? (soBanSao + ' bản sao lưu khả dụng') : 'Chưa truy cập được thư mục CD6_Backup'
  });

  var canKeys = ['TEN_XA', 'NAM_CONG_TAC', 'MUC_TIEU_DIEM', 'DOAN_PHI_NAM', 'BANK_ID', 'BANK_ACC', 'PHIEN_BAN_CAU_HINH'];
  var c = {};
  try { c = cfg_(); } catch (e) { /* bỏ qua */ }
  var thieuCfg = canKeys.filter(function (k) { return !c[k]; });
  kiemTra.push({
    ten: 'Cấu hình bắt buộc', trangThai: thieuCfg.length ? 'canhBao' : 'ok',
    chiTiet: thieuCfg.length ? ('Thiếu: ' + thieuCfg.join(', ')) : 'Đủ tham số vận hành'
  });

  var adminCount = 0;
  var memberCount = 0;
  try {
    rows_('DM_CanBo').forEach(function (m) {
      if (isDeleted_(m)) return;
      if (Number(m.Cap) === 0) adminCount++;
      if (Number(m.Cap) === 4) memberCount++;
    });
  } catch (e) { /* bỏ qua */ }
  kiemTra.push({
    ten: 'Tài khoản quản trị', trangThai: adminCount > 0 ? 'ok' : 'loi',
    chiTiet: adminCount + ' tài khoản Cấp 0 · ' + memberCount + ' đoàn viên'
  });

  var coSecret = false;
  try { coSecret = !!PropertiesService.getScriptProperties().getProperty('SECRET'); } catch (e) { /* bỏ qua */ }
  kiemTra.push({
    ten: 'Khóa ký phiên', trangThai: coSecret ? 'ok' : 'loi',
    chiTiet: coSecret ? 'Đã cấu hình SECRET trong Script Properties' : 'Thiếu SECRET — token không an toàn'
  });

  var soLoi = kiemTra.filter(function (x) { return x.trangThai === 'loi'; }).length;
  var soCanhBao = kiemTra.filter(function (x) { return x.trangThai === 'canhBao'; }).length;
  return {
    trangThai: soLoi ? 'loi' : (soCanhBao ? 'canhBao' : 'ok'),
    phienBanSchema: SCHEMA_VERSION,
    phienBanApDung: schemaApDung,
    soSheet: Object.keys(SCHEMA).length,
    thieuSheet: thieu,
    thuaSheet: thua,
    soBanSaoLuu: soBanSao,
    lanSaoLuuCuoi: c.LAN_SAO_LUU_CUOI || '',
    adminCount: adminCount,
    memberCount: memberCount,
    kiemTra: kiemTra,
    message: soLoi ? ('Có ' + soLoi + ' lỗi cần xử lý ngay.')
      : (soCanhBao ? ('Hệ thống chạy được nhưng có ' + soCanhBao + ' cảnh báo.') : 'Hệ thống khỏe, cấu trúc và sao lưu đầy đủ.')
  };
}

/* ================================================================== */
/* 11. BÁO CÁO & XUẤT CSV                                             */
/* ================================================================== */

function reportScope_(u, p) {
  assertAdmin_(u);
  p = p || {};
  var maAp = String(p.maAp || '').trim().toUpperCase();
  var tu = parseDate_(p.tuNgay) || new Date(new Date().getFullYear() + '-01-01T00:00:00');
  var den = parseDate_(p.denNgay) || new Date();
  den = new Date(den.getTime());
  den.setHours(23, 59, 59, 999);
  if (tu.getTime() > den.getTime()) throw new Error('Từ ngày phải trước hoặc bằng đến ngày.');
  return { maAp: maAp, tu: tu, den: den };
}

function reportInRange_(thoiGian, tu, den) {
  var d = parseDate_(thoiGian);
  if (!d) return false;
  return d.getTime() >= tu.getTime() && d.getTime() <= den.getTime();
}

function reportMatchesAp_(row, maAp) {
  return !maAp || String(row.MaAp || '') === maAp;
}

/** Báo cáo tổng hợp theo khoảng thời gian và Ấp (C0). */
function svc_reportSummary(u, p) {
  var sc = reportScope_(u, p);
  var members = rows_('DM_CanBo').filter(function (m) {
    return !isDeleted_(m) && Number(m.Cap) === 4 && reportMatchesAp_(m, sc.maAp);
  });
  var memberMap = {};
  members.forEach(function (m) { memberMap[m.MaDD] = m; });

  var dd = rows_('DiemDanh').filter(function (r) {
    return reportInRange_(r.ThoiGian, sc.tu, sc.den) && reportMatchesAp_(r, sc.maAp);
  });
  var phien = rows_('QR_Phien').filter(function (r) {
    return reportInRange_(r.BatDau, sc.tu, sc.den) && reportMatchesAp_(r, sc.maAp);
  });
  var thu = rows_('DoanPhi').filter(function (r) {
    return String(r.TrangThai) === 'Đã xác nhận' && reportMatchesAp_(r, sc.maAp) &&
      reportInRange_(r.NgayXacNhan || r.NgayTao, sc.tu, sc.den);
  });
  var chi = rows_('Quy_ThuChi').filter(function (r) {
    return String(r.Loai) === 'Chi' && reportMatchesAp_(r, sc.maAp) && reportInRange_(r.Ngay, sc.tu, sc.den);
  });
  var evals = rows_('TuDanhGia360').filter(function (r) {
    return reportInRange_(r.ThoiGian, sc.tu, sc.den) && (!sc.maAp || (memberMap[r.MaDD] && memberMap[r.MaDD].MaAp === sc.maAp));
  });
  var uom = rows_('UomMamDo').filter(function (r) { return reportMatchesAp_(r, sc.maAp); });

  var tongThu = 0, tongChi = 0;
  thu.forEach(function (r) { tongThu += Number(r.SoTien || 0); });
  chi.forEach(function (r) { tongChi += Number(r.SoTien || 0); });
  var paid = {};
  rows_('DoanPhi').forEach(function (r) {
    if (String(r.TrangThai) === 'Đã xác nhận' && Number(r.Nam) === cfgNum_('NAM_CONG_TAC', 2026)) paid[r.MaDD] = true;
  });
  var soDaDong = members.filter(function (m) { return paid[m.MaDD]; }).length;

  var xepLoai = {};
  evals.forEach(function (r) {
    var k = r.XepLoai || 'Chưa xếp loại';
    xepLoai[k] = (xepLoai[k] || 0) + 1;
  });

  var theoAp = {};
  rows_('DM_Ap').forEach(function (a) {
    if (sc.maAp && String(a.MaAp) !== sc.maAp) return;
    theoAp[a.MaAp] = { maAp: a.MaAp, tenAp: a.TenAp, doanVien: 0, diemDanh: 0, daDongPhi: 0, thu: 0 };
  });
  members.forEach(function (m) {
    if (!theoAp[m.MaAp]) theoAp[m.MaAp] = { maAp: m.MaAp, tenAp: m.MaAp, doanVien: 0, diemDanh: 0, daDongPhi: 0, thu: 0 };
    theoAp[m.MaAp].doanVien++;
    if (paid[m.MaDD]) theoAp[m.MaAp].daDongPhi++;
  });
  dd.forEach(function (r) { if (theoAp[r.MaAp]) theoAp[r.MaAp].diemDanh++; });
  thu.forEach(function (r) { if (theoAp[r.MaAp]) theoAp[r.MaAp].thu += Number(r.SoTien || 0); });

  var top = members.slice().sort(function (a, b) { return Number(b.Diem || 0) - Number(a.Diem || 0); })
    .slice(0, 5).map(function (m) {
      return { maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, diem: Number(m.Diem || 0) };
    });

  var fmt = function (d) { return Utilities.formatDate(d, TZ, 'dd/MM/yyyy'); };
  return {
    tuNgay: fmt(sc.tu), denNgay: fmt(sc.den), maAp: sc.maAp,
    doanVien: members.length,
    canBo: rows_('DM_CanBo').filter(function (m) {
      return !isDeleted_(m) && Number(m.Cap) >= 1 && Number(m.Cap) <= 3 && reportMatchesAp_(m, sc.maAp);
    }).length,
    diemDanh: {
      soPhien: phien.length, soLuot: dd.length,
      soNguoi: Object.keys(dd.reduce(function (o, r) { o[r.MaDD] = 1; return o; }, {})).length,
      diem: dd.reduce(function (s, r) { return s + Number(r.Diem || 0); }, 0)
    },
    doanPhi: {
      thu: tongThu, chi: tongChi, ton: tongThu - tongChi,
      soGiaoDich: thu.length, soDaDong: soDaDong,
      tyLeDong: members.length ? Math.round(soDaDong * 100 / members.length) : 0
    },
    tuDanhGia: { soPhieu: evals.length, xepLoai: xepLoai },
    uommam: {
      tong: uom.length,
      choDuyet: uom.filter(function (r) { return String(r.TrangThai) === 'Chờ duyệt'; }).length,
      daDuyet: uom.filter(function (r) { return String(r.TrangThai) === 'Đã duyệt'; }).length
    },
    theoAp: Object.keys(theoAp).map(function (k) { return theoAp[k]; }),
    top: top
  };
}

function csvCell_(v) {
  var s = v === null || v === undefined ? '' : String(v);
  // Chống CSV injection khi mở bằng Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvText_(headers, rows) {
  return '\uFEFF' + [headers].concat(rows).map(function (r) {
    return r.map(csvCell_).join(',');
  }).join('\r\n');
}

/** Xuất CSV (mở được bằng Excel/Google Sheets) cho một loại báo cáo. */
function svc_reportExport(u, p) {
  var sc = reportScope_(u, p);
  var loai = String((p && p.loai) || 'doanVien');
  var fmt = function (d) { return Utilities.formatDate(d, TZ, 'dd/MM/yyyy HH:mm'); };
  var headers, rows, ten;
  if (loai === 'diemDanh') {
    headers = ['Mã đoàn viên', 'Họ và tên', 'Ấp', 'Phiên', 'Hình thức', 'Điểm', 'Thời gian'];
    rows = rows_('DiemDanh').filter(function (r) {
      return reportInRange_(r.ThoiGian, sc.tu, sc.den) && reportMatchesAp_(r, sc.maAp);
    }).sort(function (a, b) { return String(a.ThoiGian).localeCompare(String(b.ThoiGian)); }).map(function (r) {
      return [r.MaDD, r.HoTen || (findBy_('DM_CanBo', 'MaDD', r.MaDD) || {}).HoTen || '', r.MaAp,
        r.MaPhien, r.HinhThuc, r.Diem, r.ThoiGian];
    });
    ten = 'diem-danh';
  } else if (loai === 'doanPhi') {
    headers = ['Mã giao dịch', 'Mã đoàn viên', 'Họ và tên', 'Ấp', 'Năm', 'Số tiền', 'Trạng thái', 'Ngày xác nhận'];
    rows = rows_('DoanPhi').filter(function (r) {
      return reportInRange_(r.NgayXacNhan || r.NgayTao, sc.tu, sc.den) && reportMatchesAp_(r, sc.maAp);
    }).map(function (r) {
      return [r.MaGiaoDich, r.MaDD, r.HoTen, r.MaAp, r.Nam, r.SoTien, r.TrangThai, r.NgayXacNhan || ''];
    });
    ten = 'doan-phi';
  } else if (loai === '360') {
    headers = ['Mã đoàn viên', 'Họ và tên', 'Ấp', 'Năm', 'Chính trị', 'Đạo đức', 'Chuyên môn', 'Cống hiến', 'Kỷ luật', 'Tổng điểm', 'Xếp loại', 'Thời gian'];
    var memberAp = {};
    rows_('DM_CanBo').forEach(function (m) { memberAp[m.MaDD] = m.MaAp; });
    rows = rows_('TuDanhGia360').filter(function (r) {
      return reportInRange_(r.ThoiGian, sc.tu, sc.den) && (!sc.maAp || memberAp[r.MaDD] === sc.maAp);
    }).map(function (r) {
      var m = findBy_('DM_CanBo', 'MaDD', r.MaDD) || {};
      return [r.MaDD, m.HoTen || '', m.MaAp || '', r.Nam, r.TuChinhTri, r.DaoDuc, r.ChuyenMon,
        r.CongHien, r.KyLuat, r.TongDiem, r.XepLoai, r.ThoiGian];
    });
    ten = 'tu-danh-gia-360';
  } else {
    headers = ['Mã đoàn viên', 'Họ và tên', 'Ấp', 'Điện thoại', 'Ngày sinh', 'Điểm', 'Có thẻ', 'Trạng thái'];
    rows = rows_('DM_CanBo').filter(function (m) {
      return !isDeleted_(m) && Number(m.Cap) === 4 && reportMatchesAp_(m, sc.maAp);
    }).sort(function (a, b) { return Number(b.Diem || 0) - Number(a.Diem || 0); }).map(function (m) {
      return [m.MaDD, m.HoTen, m.MaAp, m.DienThoai, m.NgaySinh, m.Diem, m.MaThe ? 'Có' : 'Không', m.TrangThai];
    });
    ten = 'doan-vien';
  }
  var ngay = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd');
  return {
    tenFile: 'CD6_' + ten + '_' + ngay + '.csv',
    mime: 'text/csv;charset=utf-8',
    noiDung: csvText_(headers, rows),
    soDong: rows.length,
    tuNgay: fmt(sc.tu), denNgay: fmt(sc.den),
    message: 'Đã tạo báo cáo ' + rows.length + ' dòng.'
  };
}

/* ================================================================== */
/* 12. TRUNG TÂM NHẮC VIỆC                                            */
/* ================================================================== */

var NOTIFY_LOAI = {
  tatCa: 'Toàn bộ đoàn viên',
  chuaDongPhi: 'Đoàn viên chưa đóng phí',
  choDuyet: 'Hồ sơ Ươm mầm Đỏ chờ duyệt',
  canBo: 'Cán bộ Cấp 1–3'
};

function notifyRecipients_(loai, maAp) {
  var paid = feePaidMap_(cfgNum_('NAM_CONG_TAC', 2026));
  var out = [];
  if (loai === 'choDuyet') {
    rows_('UomMamDo').forEach(function (r) {
      if (String(r.TrangThai) !== 'Chờ duyệt') return;
      if (maAp && String(r.MaAp) !== maAp) return;
      var m = findBy_('DM_CanBo', 'MaDD', r.MaDD) || {};
      out.push({ maDD: r.MaDD, hoTen: r.HoTen || m.HoTen || '', maAp: r.MaAp || m.MaAp || '', dienThoai: m.DienThoai || '' });
    });
    return out;
  }
  rows_('DM_CanBo').forEach(function (m) {
    if (isDeleted_(m)) return;
    var cap = Number(m.Cap);
    if (loai === 'canBo') { if (cap < 1 || cap > 3) return; }
    else { if (cap !== 4) return; }
    if (maAp && String(m.MaAp) !== maAp) return;
    if (loai === 'chuaDongPhi' && paid[m.MaDD]) return;
    out.push({ maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, dienThoai: m.DienThoai || '' });
  });
  return out;
}

function notifyNoiDungMau_(loai, extra) {
  var xa = cfg_().TEN_XA || 'Xã Tân Hòa';
  extra = extra || {};
  if (loai === 'chuaDongPhi') {
    return 'Thông báo: Chi đoàn ' + xa + ' nhắc các đoàn viên chưa hoàn thành đoàn phí năm ' +
      cfgNum_('NAM_CONG_TAC', 2026) + ' đóng phí theo quy định (' +
      Number(cfgNum_('DOAN_PHI_NAM', 24000)).toLocaleString('vi-VN') + 'đ/năm). Trân trọng cảm ơn.';
  }
  if (loai === 'choDuyet') {
    return 'Thông báo: Hồ sơ Ươm mầm Đỏ của bạn đang chờ duyệt. Vui lòng theo dõi kết quả trên ứng dụng Chi đoàn số 6.0.';
  }
  if (loai === 'canBo') {
    return 'Thông báo: Đề nghị cán bộ Chi đoàn ' + xa + ' rà soát dữ liệu và hoàn thành nhiệm vụ được phân công trong tháng.';
  }
  return 'Thông báo sinh hoạt Chi đoàn ' + xa + ': đề nghị đoàn viên tham dự đầy đủ và đúng giờ.';
}

function svc_notifyList(u) {
  assertAdmin_(u);
  var items = rows_('ThongBao').slice().sort(function (a, b) {
    return String(b.Luc).localeCompare(String(a.Luc));
  }).slice(0, 50).map(function (r) {
    return {
      maTB: r.MaTB, loai: r.Loai, tieuDe: r.TieuDe, noiDung: r.NoiDung,
      doiTuong: r.DoiTuong, kenh: r.Kenh, trangThai: r.TrangThai,
      soNguoi: Number(r.SoNguoi || 0), nguoiTao: r.NguoiTao, luc: r.Luc
    };
  });
  return { items: items, loai: NOTIFY_LOAI };
}

function svc_notifyPreview(u, p) {
  assertAdmin_(u);
  p = p || {};
  var loai = String(p.loai || 'tatCa');
  if (!NOTIFY_LOAI[loai]) throw new Error('Loại nhắc việc không hợp lệ.');
  var maAp = String(p.maAp || '').trim().toUpperCase();
  var nguoiNhan = notifyRecipients_(loai, maAp);
  return {
    loai: loai, maAp: maAp, soNguoi: nguoiNhan.length,
    mauNguoiNhan: nguoiNhan.slice(0, 10),
    noiDungMau: notifyNoiDungMau_(loai),
    message: nguoiNhan.length ? (nguoiNhan.length + ' người sẽ nhận thông báo.')
      : 'Không có người nhận phù hợp với bộ lọc hiện tại.'
  };
}

function svc_notifySend(u, p) {
  assertAdmin_(u);
  p = p || {};
  var loai = String(p.loai || 'tatCa');
  if (!NOTIFY_LOAI[loai]) throw new Error('Loại nhắc việc không hợp lệ.');
  var tieuDe = String(p.tieuDe || '').trim();
  var noiDung = String(p.noiDung || '').trim();
  if (!tieuDe) throw new Error('Vui lòng nhập tiêu đề thông báo.');
  if (!noiDung) throw new Error('Vui lòng nhập nội dung thông báo.');
  var kenh = String(p.kenh || 'inapp');
  if (['inapp', 'email', 'zalo'].indexOf(kenh) < 0) throw new Error('Kênh gửi không hợp lệ.');
  var maAp = String(p.maAp || '').trim().toUpperCase();
  var nguoiNhan = notifyRecipients_(loai, maAp);
  if (!nguoiNhan.length) throw new Error('Không có người nhận phù hợp. Hãy chọn lại đối tượng.');

  var trangThai = 'Đã phát hành';
  var ghiChu = '';
  if (kenh === 'email') {
    var emailNhan = String(p.emailNhan || '').trim();
    if (!emailNhan) {
      trangThai = 'Đã lưu (chưa có email nhận)';
      ghiChu = 'Chưa cấu hình email nhận — thông báo vẫn hiển thị trong ứng dụng.';
    } else {
      try {
        MailApp.sendEmail({
          to: emailNhan, subject: tieuDe, body: noiDung + '\n\n' +
            'Danh sách người nhận: ' + nguoiNhan.map(function (x) { return x.hoTen + ' (' + x.dienThoai + ')'; }).join(', ')
        });
        trangThai = 'Đã gửi email';
      } catch (e) {
        trangThai = 'Lỗi gửi email';
        ghiChu = String(e && e.message ? e.message : e);
      }
    }
  } else if (kenh === 'zalo') {
    var hook = '';
    try { hook = PropertiesService.getScriptProperties().getProperty('ZALO_WEBHOOK_URL') || ''; } catch (e) { /* bỏ qua */ }
    if (!hook) {
      trangThai = 'Đã lưu (chưa cấu hình Zalo OA)';
      ghiChu = 'Chưa cấu hình ZALO_WEBHOOK_URL — dùng nội dung bên dưới để đăng nhóm Zalo.';
    } else {
      try {
        var resp = UrlFetchApp.fetch(hook, {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ title: tieuDe, message: noiDung, recipients: nguoiNhan })
        });
        trangThai = resp.getResponseCode() < 300 ? 'Đã gửi Zalo OA' : 'Lỗi gửi Zalo OA';
        ghiChu = 'HTTP ' + resp.getResponseCode();
      } catch (e) {
        trangThai = 'Lỗi gửi Zalo OA';
        ghiChu = String(e && e.message ? e.message : e);
      }
    }
  }

  var maTB = newId_('TB');
  var luc = nowStr_();
  append_('ThongBao', {
    MaTB: maTB, Loai: loai, TieuDe: tieuDe, NoiDung: noiDung,
    DoiTuong: maAp || 'ALL', Kenh: kenh, TrangThai: trangThai,
    SoNguoi: nguoiNhan.length, NguoiTao: u.MaDD, Luc: luc,
    ChiTiet: ghiChu || ('Người nhận: ' + nguoiNhan.slice(0, 10).map(function (x) { return x.maDD; }).join(', '))
  });
  log_(u.MaDD, 'GỬI NHẮC VIỆC', tieuDe + ' · ' + nguoiNhan.length + ' người · ' + kenh + ' · ' + trangThai);
  return {
    maTB: maTB, soNguoi: nguoiNhan.length, trangThai: trangThai, luc: luc,
    zaloText: noiDung + '\n' + tieuDe,
    message: 'Đã tạo thông báo "' + tieuDe + '" cho ' + nguoiNhan.length + ' người. Trạng thái: ' + trangThai +
      (ghiChu ? (' — ' + ghiChu) : '')
  };
}

/** Thông báo dành cho người dùng hiện tại (C0 thấy toàn bộ, C1–C4 theo Ấp). */
function svc_notifyMy(u) {
  var maAp = String(u.MaAp || '');
  var items = rows_('ThongBao').filter(function (r) {
    if (r.DoiTuong === 'ALL') return true;
    return maAp && String(r.DoiTuong) === maAp;
  }).slice().sort(function (a, b) { return String(b.Luc).localeCompare(String(a.Luc)); })
    .slice(0, 5).map(function (r) {
      return { maTB: r.MaTB, tieuDe: r.TieuDe, noiDung: r.NoiDung, luc: r.Luc, kenh: r.Kenh };
    });
  return { items: items };
}
