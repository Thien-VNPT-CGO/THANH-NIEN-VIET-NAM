/* ==================================================================
   mock-api.js — Máy chủ mô phỏng cho chế độ xem trước cục bộ.
   Dữ liệu lưu trong localStorage, mô phỏng đúng hợp đồng API của
   Google Apps Script (Code.gs + Services.gs).
   ================================================================== */

(function () {
  'use strict';

  var KEY = 'cd6_db_v3';
  var TZ_OFFSET = 0;

  /** Phiên bản lược đồ và danh mục bảng — đối chiếu với SCHEMA trong Setup.gs. */
  var SCHEMA_VERSION = '3';
  var SCHEMA_TABLES = [
    'CauHinh', 'DM_Ap', 'DM_CanBo', 'DiemDanh', 'QR_Phien', 'UomMamDo', 'DoanPhi',
    'Quy_ThuChi', 'TheDoanVien', 'TuDanhGia360', 'ECert', 'SOS', 'NhiemVu', 'Quiz',
    'Quiz_KetQua', 'PIN_Reset', 'Diem_Log', 'Log', 'VanBan', 'ThongBao'
  ];
  var RATE_LIMIT_LOGIN = 30;
  var RATE_LIMIT_WINDOW_MS = 600 * 1000;

  function p2(n) { return (n < 10 ? '0' : '') + n; }

  function stamp(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' +
      p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  function daysAgo(n) { return stamp(new Date(Date.now() - n * 86400000)); }
  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
  function hash10(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    var out = '';
    for (var j = 0; j < 2; j++) { out += h.toString(16).toUpperCase().padStart(4, '0'); h = (h * 31 + 7) >>> 0; }
    return out.slice(0, 10);
  }
  var DEFAULT_ADMIN_PASS = 'ThanhnienvietnamXTH';
  var LOGIN_MAX_FAIL = 5;
  var LOGIN_LOCK_MINUTES = 15;
  function hashPass(maDD, password) {
    var s = 'MK|' + String(maDD).toUpperCase() + '|' + String(password);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 16777619) >>> 0 : ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    }
    var h2 = 5381;
    for (var j = s.length - 1; j >= 0; j--) h2 = ((h2 << 5) + h2 + s.charCodeAt(j)) >>> 0;
    return ('00000000' + h.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }
  /** Băm PIN 6 số — không bao giờ lưu PIN mới dạng chữ thô. */
  function hashPin(maDD, pin) {
    return 'PH' + hash10('PIN|' + String(maDD).toUpperCase() + '|' + String(pin));
  }
  function isTrue(v) {
    return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1';
  }
  function isDeleted(u) { return !!u && isTrue(u.DaXoa); }
  function isActiveUser(u) {
    return !!u && !isDeleted(u) && String(u.TrangThai) === 'Đang hoạt động';
  }
  function hasLegacyPin(u) {
    return !!u && !u.PINHash && u.PIN !== undefined && String(u.PIN) !== '';
  }
  function verifyPin(u, pin) {
    if (!u) return false;
    if (u.PINHash) return String(u.PINHash) === hashPin(u.MaDD, pin);
    return u.PIN !== undefined && String(u.PIN) !== '' && String(u.PIN) === String(pin);
  }
  function setPin(u, pin, forceChange) {
    u.PINHash = hashPin(u.MaDD, pin);
    u.PIN = '';
    u.BatDoiPin = forceChange ? true : false;
    u.SoLanSai = 0;
    u.KhoaDen = '';
    u.TokenVersion = Number(u.TokenVersion || 0) + 1;
  }
  function randPin() { return String(Math.floor(100000 + Math.random() * 900000)); }
  function activeUsers(db) {
    return (db.users || []).filter(function (u) { return !isDeleted(u); });
  }
  function configVersion(db) {
    var v = db.config && db.config.phienBan;
    return v === undefined || v === '' ? 1 : Number(v);
  }
  function bumpConfigVersion(db) {
    db.config = db.config || {};
    db.config.phienBan = configVersion(db) + 1;
    return db.config.phienBan;
  }
  function issueMockToken(db, u) {
    var token = 'mock.' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    db.tokens[token] = {
      maDD: u.MaDD,
      v: Number(u.TokenVersion || 0),
      exp: Date.now() + 12 * 3600 * 1000
    };
    return token;
  }
  function revokeTokens(db, maDD) {
    Object.keys(db.tokens || {}).forEach(function (t) {
      var rec = db.tokens[t];
      var id = rec && typeof rec === 'object' ? rec.maDD : rec;
      if (String(id) === String(maDD)) delete db.tokens[t];
    });
  }
  function loginFail(db, u) {
    var admin = isAdmin(u);
    var so = Math.min(Number(u.SoLanSai || 0) + 1, 999);
    var daKhoa = !admin && so >= LOGIN_MAX_FAIL;
    if (daKhoa) {
      u.SoLanSai = 0;
      u.KhoaDen = stamp(new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000));
    } else {
      u.SoLanSai = so;
      if (admin) u.KhoaDen = '';
    }
    mlog(db, u.MaDD, 'ĐĂNG NHẬP THẤT BẠI',
      daKhoa ? ('Khóa tạm thời ' + LOGIN_LOCK_MINUTES + ' phút')
        : (admin ? ('Lần sai ' + so + ' (quản trị — không khóa cứng)') : ('Lần sai ' + so + '/' + LOGIN_MAX_FAIL)));
    save(db);
    if (admin) return new Error('Mã PIN hoặc mật khẩu không đúng.');
    return new Error(daKhoa
      ? ('Bạn đã nhập sai ' + LOGIN_MAX_FAIL + ' lần. Tài khoản bị tạm khóa ' + LOGIN_LOCK_MINUTES + ' phút. Vui lòng thử lại sau.')
      : ('Mã PIN hoặc mật khẩu không đúng. Còn ' + (LOGIN_MAX_FAIL - so) + ' lần thử.'));
  }
  function slot() { return Math.floor(Date.now() / 60000); }

  /* ---------------------- GIỚI HẠN TẦN SUẤT ---------------------- */

  function rateLimitCheck(db, key) {
    db.loginRate = db.loginRate || {};
    var rec = db.loginRate[key];
    if (!rec) return { blocked: false, soLan: 0 };
    if (Number(rec.exp || 0) < Date.now()) {
      delete db.loginRate[key];
      return { blocked: false, soLan: 0 };
    }
    return { blocked: Number(rec.n || 0) >= RATE_LIMIT_LOGIN, soLan: Number(rec.n || 0) };
  }

  function rateLimitHit(db, key) {
    db.loginRate = db.loginRate || {};
    var rec = db.loginRate[key];
    if (!rec || Number(rec.exp || 0) < Date.now()) rec = { n: 0, exp: Date.now() + RATE_LIMIT_WINDOW_MS };
    rec.n = Number(rec.n || 0) + 1;
    rec.exp = Date.now() + RATE_LIMIT_WINDOW_MS;
    db.loginRate[key] = rec;
    return rec.n;
  }

  function rateLimitReset(db, key) {
    if (!db.loginRate) return;
    delete db.loginRate[key];
  }

  /* --------------------------- DỮ LIỆU MẪU --------------------------- */

  var QUIZ_SEED = [
    ['Q01', 'Đại hội Đoàn TNCS Hồ Chí Minh nhiệm kỳ 2022 – 2027 được tổ chức tại đâu?', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Cần Thơ', 'A', 'Nghị quyết Đại hội', 15, 'Đại hội XII diễn ra tại Thủ đô Hà Nội.'],
    ['Q02', 'Nội dung nào KHÔNG thuộc chương trình "Dân vận khéo" của Chi đoàn?', 'Xây dựng tuyến đường hoa', 'Hỗ trợ hộ khó khăn', 'Tổ chức họp lớp học sinh', 'Chuyển đổi số khu dân cư', 'C', 'Dân vận khéo', 15, 'Họp lớp học sinh không thuộc phạm vi dân vận khéo của Chi đoàn Ấp.'],
    ['Q03', 'Mức đoàn phí chuẩn/năm áp dụng trong hệ sinh thái Chi đoàn Số 6.0 là bao nhiêu?', '12.000đ', '24.000đ', '36.000đ', '48.000đ', 'B', 'Nghiệp vụ', 15, 'Mức chuẩn 24.000đ/năm theo quy định của Điều lệ Đoàn.'],
    ['Q04', 'Cơ chế xác thực nhiều lớp của hệ thống gồm những gì?', 'Mã định danh + PIN 6 số', 'Chỉ cần số điện thoại', 'Tài khoản Facebook', 'Email cá nhân', 'A', 'Nghiệp vụ', 15, 'Đăng nhập bằng Mã định danh + mã PIN 6 chữ số, token ký HMAC.'],
    ['Q05', 'Đoàn viên đạt bao nhiêu điểm/năm để đủ điều kiện xét "Ươm mầm Đỏ"?', '150 điểm', '200 điểm', '300 điểm', '500 điểm', 'C', 'Ươm mầm Đỏ', 15, 'Cần đủ 300 điểm/năm cùng thẻ Đoàn viên và tự đánh giá 360°.'],
    ['Q06', 'Mã QR điểm danh động có thời hạn bao lâu?', '30 giây', '60 giây', '5 phút', '1 ngày', 'B', 'Nghiệp vụ', 15, 'Token QR tự động đổi mỗi 60 giây để chống quét ảnh chụp màn hình.']
  ];

  function seed() {
    var users = [
      ['CT_HOILHTN', 'Lê Văn Bình', 1, 'Chủ Tịch', '', '0901000006', '10/06/1982', 0, '', '26/03/2001', 'Chi đoàn Ấp Tân Bình', 'Ngày 20 hằng tháng'],
      ['BT_CHIBO_XA', 'Nguyễn Văn Hòa', 2, 'Bí thư Chi bộ Xã', '', '0901000001', '15/03/1980', 0, '', '26/03/2000', 'Chi đoàn Ấp Tân Bình', 'Ngày 20 hằng tháng'],
      ['BT_AP01', 'Trần Thị Mai', 3, 'Bí thư Chi đoàn Ấp Tân Bình', 'AP01', '0901000002', '20/07/1998', 260, '', '26/03/2017', 'Chi đoàn Ấp Tân Bình', 'Ngày 20 hằng tháng'],
      ['BT_AP02', 'Lê Quốc Bảo', 3, 'Bí thư Chi đoàn Ấp Tân Lập', 'AP02', '0901000003', '02/11/1997', 240, '', '26/03/2016', 'Chi đoàn Ấp Tân Lập', 'Ngày 20 hằng tháng'],
      ['BT_AP03', 'Phạm Ngọc Lan', 3, 'Bí thư Chi đoàn Ấp Tân Phú', 'AP03', '0901000004', '12/09/1999', 215, '', '26/03/2018', 'Chi đoàn Ấp Tân Phú', 'Ngày 20 hằng tháng'],
      ['BT_AP04', 'Nguyễn Thanh Thiên', 3, 'Bí thư Chi đoàn Ấp Hòa Bình', 'AP04', '0901000005', '', 0, '', '', 'Chi đoàn Ấp Hòa Bình', 'Ngày 20 hằng tháng'],
      ['DV01', 'Võ Minh Khoa', 4, 'Đoàn viên', 'AP01', '0902000001', '08/05/2003', 340, 'TDV-2026-AP01-01', '26/03/2021', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
      ['DV02', 'Nguyễn Thị Thu Hà', 4, 'Đoàn viên', 'AP01', '0902000002', '19/02/2004', 285, 'TDV-2026-AP01-02', '26/03/2022', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
      ['DV03', 'Trương Tấn Phát', 4, 'Đoàn viên', 'AP01', '0902000003', '30/10/2002', 180, '', '26/03/2020', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
      ['DV04', 'Lâm Thanh Trúc', 4, 'Đoàn viên', 'AP01', '0902000004', '14/06/2005', 120, '', '26/03/2023', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
      ['DV05', 'Đặng Quốc Huy', 4, 'Đoàn viên', 'AP02', '0902000005', '21/12/2001', 310, 'TDV-2026-AP02-01', '26/03/2019', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
      ['DV06', 'Bùi Kim Ngân', 4, 'Đoàn viên', 'AP02', '0902000006', '05/08/2004', 265, 'TDV-2026-AP02-02', '26/03/2022', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
      ['DV07', 'Huỳnh Gia Bảo', 4, 'Đoàn viên', 'AP02', '0902000007', '17/04/2003', 95, '', '26/03/2021', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
      ['DV08', 'Ngô Thị Mỹ Duyên', 4, 'Đoàn viên', 'AP02', '0902000008', '09/09/2005', 140, '', '26/03/2023', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
      ['DV09', 'Phan Anh Tuấn', 4, 'Đoàn viên', 'AP03', '0902000009', '28/01/2002', 300, 'TDV-2026-AP03-01', '26/03/2020', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng'],
      ['DV10', 'Trần Lê Bảo Châu', 4, 'Đoàn viên', 'AP03', '0902000010', '11/11/2004', 210, 'TDV-2026-AP03-02', '26/03/2022', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng'],
      ['DV11', 'Cao Minh Trí', 4, 'Đoàn viên', 'AP03', '0902000011', '03/03/2001', 75, '', '26/03/2019', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng'],
      ['DV12', 'Lý Thị Hồng Nhung', 4, 'Đoàn viên', 'AP03', '0902000012', '25/07/2005', 165, '', '26/03/2023', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng']
    ].map(function (r) {
      return {
        MaDD: r[0], HoTen: r[1], Cap: r[2], ChucVu: r[3], MaAp: r[4], DienThoai: r[5],
        NgaySinh: r[6], PIN: '', PINHash: hashPin(r[0], '123456'),
        BatDoiPin: false, SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
        Diem: r[7], DiemNen: r[7], TrangThai: 'Đang hoạt động',
        MaThe: r[8], NgayVaoDoan: r[9], NoiVaoDoan: r[10], NgaySinhHoatDoan: r[11],
        UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: '01/01/2026',
        DaXoa: false, NgayXoa: '', NguoiXoa: ''
      };
    });

    users.push({
      MaDD: 'ADMIN', HoTen: 'Quản trị viên hệ thống', Cap: 0,
      ChucVu: 'Quản trị hệ thống', MaAp: '', DienThoai: '', NgaySinh: '',
      PIN: '', PINHash: '', BatDoiPin: false, SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
      Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '',
      NgayVaoDoan: '', NoiVaoDoan: '', NgaySinhHoatDoan: '',
      UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: '01/01/2026',
      GhiChu: 'Tài khoản siêu quản trị — toàn quyền nghiệp vụ và quản trị hệ thống',
      MatKhauHash: hashPass('ADMIN', DEFAULT_ADMIN_PASS), BatDoiMatKhau: true,
      DaXoa: false, NgayXoa: '', NguoiXoa: ''
    });

    var db = {
      config: {
        tenXa: 'Xã Tân Hòa', nam: 2026, mucTieuDiem: 300, doanPhiNam: 24000,
        bankId: 'MB', bankAcc: '0123456789', bankName: 'CHI DOAN XA TAN HOA',
        tenChiBo: 'Chi đoàn Xã Tân Hòa', biThuXa: 'Lê Văn Bình', phoBiThuXa: 'Nguyễn Văn Hòa',
        dienThoaiXa: '0901000001', diaChiXa: 'Xã Tân Hòa', emailXa: '', ngayThanhLap: '26/03/2000',
        phienBan: 1,
        diem: {
          hopTrucTiep: 10, hybrid: 8, zalo: 5, uomMam: 25, doanPhi: 10,
          the: 20, tuDanhGia: 10, sos: 10, checkinNv: 15, quiz: 15
        }
      },
      aps: [
        { MaAp: 'AP01', TenAp: 'Ấp Tân Bình', BiThu: 'BT_AP01', ChiTieu: 100 },
        { MaAp: 'AP02', TenAp: 'Ấp Tân Lập', BiThu: 'BT_AP02', ChiTieu: 90 },
        { MaAp: 'AP03', TenAp: 'Ấp Tân Phú', BiThu: 'BT_AP03', ChiTieu: 80 },
        { MaAp: 'AP04', TenAp: 'Ấp Hòa Bình', BiThu: 'BT_AP04', ChiTieu: 70 }
      ],
      users: users,
      cards: [],
      sessions: [],
      attendance: [],
      uommam: [],
      fees: [],
      evals: [],
      certs: [],
      sos: [],
      missions: [],
      quiz: QUIZ_SEED.map(function (r) {
        return { MaCau: r[0], NoiDung: r[1], A: r[2], B: r[3], C: r[4], D: r[5], DapAn: r[6], ChuDe: r[7], Diem: r[8], GiaiThich: r[9] };
      }),
      quizResults: [],
      pinResets: [],
      diemLog: [],
      ledger: [],
      logs: [
        { MaLog: uid('L'), MaDD: 'BT_CHIBO_XA', HanhDong: 'KHỞI TẠO HỆ THỐNG', ChiTiet: 'Nạp dữ liệu mẫu Chi đoàn Xã Tân Hòa', ThoiGian: daysAgo(14) },
        { MaLog: uid('L'), MaDD: 'BT_AP01', HanhDong: 'MỞ PHIÊN ĐIỂM DANH', ChiTiet: 'Sinh hoạt Chi đoàn tháng 10/2026', ThoiGian: daysAgo(13) },
        { MaLog: uid('L'), MaDD: 'ADMIN', HanhDong: 'KHỞI TẠO ADMIN', ChiTiet: 'Tạo tài khoản quản trị hệ thống (Cấp 0)', ThoiGian: daysAgo(14) }
      ],
      tokens: {},
      schemaVersion: SCHEMA_VERSION,
      loginRate: {},
      notifications: [{
        MaTB: 'TB-260101-CHAO', Loai: 'tatCa',
        TieuDe: 'Lịch sinh hoạt Chi đoàn tháng 10/2026',
        NoiDung: 'Đề nghị đoàn viên tham dự sinh hoạt Chi đoàn đầy đủ, đúng giờ và mang theo thẻ đoàn viên.',
        DoiTuong: 'ALL', Kenh: 'inapp', TrangThai: 'Đã phát hành',
        SoNguoi: 16, NguoiTao: 'ADMIN', Luc: daysAgo(5),
        ChiTiet: 'Thông báo mẫu của hệ thống'
      }]
    };

    users.filter(function (u) { return u.MaThe; }).forEach(function (u) {
      db.cards.push({
        MaThe: u.MaThe, MaDD: u.MaDD, HoTen: u.HoTen, MaAp: u.MaAp,
        NgayCap: '05/01/2026', HetHan: '31/12/2026', NoiCapThe: 'Ban Chấp hành Chi đoàn Xã Tân Hòa',
        TrangThai: 'Đã cấp', NguoiCap: 'BT_CHIBO_XA'
      });
    });

    /* Điểm danh mẫu 2 phiên gần nhất */
    ['AP01', 'AP02'].forEach(function (maAp, idx) {
      var ma = 'PH-2601' + idx + '-DEMO';
      db.sessions.push({
        MaPhien: ma, MaAp: maAp, TieuDe: 'Sinh hoạt Chi đoàn tháng 10/2026',
        BatDau: daysAgo(13), KetThuc: '', TrangThai: 'Đã kết thúc', NguoiTao: 'BT_AP0' + (idx + 1)
      });
      users.filter(function (u) { return u.Cap === 4 && u.MaAp === maAp; }).forEach(function (u, i) {
        var forms = [{ h: 'Trực tiếp', d: 10 }, { h: 'Hybrid', d: 8 }, { h: 'Zalo', d: 5 }];
        var f = forms[i % 3];
        db.attendance.push({ MaDD: u.MaDD, MaPhien: ma, MaAp: maAp, HinhThuc: f.h, Diem: f.d, ThoiGian: daysAgo(13) });
        db.diemLog.push({ MaDD: u.MaDD, MaAp: maAp, Loai: 'Điểm danh ' + f.h, Diem: f.d, GhiChu: 'Sinh hoạt tháng 10/2026', ThoiGian: daysAgo(13) });
      });
    });

    /* Đoàn phí */
    users.filter(function (u) { return u.Cap === 4; }).forEach(function (u, i) {
      if (i % 4 === 1) {
        db.fees.push({
          MaGiaoDich: 'DP-' + u.MaDD, MaAp: u.MaAp, MaDD: u.MaDD, HoTen: u.HoTen, Nam: 2026, SoTien: 24000,
          NoiDung: 'DOANPHI ' + u.MaAp + ' ' + u.MaDD, TrangThai: 'Đã xác nhận',
          NgayTao: '2026-01-15 09:00:00', NgayXacNhan: '2026-01-15 10:00:00', NguoiXacNhan: 'BT_' + u.MaAp
        });
      }
    });

    db.evals.push({
      MaDD: 'DV01', Nam: 2026, TuChinhTri: 5, DaoDuc: 5, ChuyenMon: 4, CongHien: 5, KyLuat: 5,
      TongDiem: 24, XepLoai: 'Hoàn thành xuất sắc', ThoiGian: daysAgo(24)
    });
    db.evals.push({
      MaDD: 'DV09', Nam: 2026, TuChinhTri: 4, DaoDuc: 5, ChuyenMon: 4, CongHien: 4, KyLuat: 5,
      TongDiem: 22, XepLai: '', XepLoai: 'Hoàn thành tốt', ThoiGian: daysAgo(20)
    });

    db.sos.push({
      MaPA: 'PA-261015-AAAAAA', MaDD: 'DV03', HoTen: 'Trương Tấn Phát', MaAp: 'AP01',
      Loai: 'Rác thải tự phát', NoiDung: 'Bãi rác tự phát gần cầu Tân Bình, ảnh hưởng dòng chảy.',
      ViDo: 10.5335, KinhDo: 106.4125, Diem: 10, TrangThai: 'Chờ duyệt', MaNV: '', ThoiGian: daysAgo(10)
    });
    db.sos.push({
      MaPA: 'PA-261016-BBBBBB', MaDD: 'DV07', HoTen: 'Huỳnh Gia Bảo', MaAp: 'AP02',
      Loai: 'Đèn đường hỏng', NoiDung: '03 bóng đèn đường tổ dân cư số 4 không sáng đã 2 tuần.',
      ViDo: 10.5310, KinhDo: 106.4078, Diem: 10, TrangThai: 'Đã chuyển nhiệm vụ', MaNV: 'NV-261016-CCCCCC', ThoiGian: daysAgo(9)
    });
    db.missions.push({
      MaNV: 'NV-261016-CCCCCC', TenNV: 'Thay bóng đèn đường tổ dân cư số 4',
      MaPA: 'PA-261016-BBBBBB', MaAp: 'AP02', ViDo: 10.5310, KinhDo: 106.4078,
      Diem: 15, TrangThai: 'Đang mở', NgayTao: daysAgo(8)
    });
    db.ledger.push({ MaGD: 'TC-001', MaAp: 'AP01', Loai: 'Chi', SoTien: 120000, NoiDung: 'Thăm hỏi hộ khó khăn Tổ 3', Ngay: daysAgo(6), NguoiTao: 'BT_AP01' });

    // Điểm nền = điểm mẫu trừ phần đã ghi vào sổ điểm danh mẫu,
    // nhờ vậy đối soát DiemNen + SUM(Diem_Log) luôn khớp điểm hiện tại.
    var logSum = {};
    db.diemLog.forEach(function (r) { logSum[r.MaDD] = Number(logSum[r.MaDD] || 0) + Number(r.Diem || 0); });
    db.users.forEach(function (u) { u.DiemNen = Number(u.Diem || 0) - Number(logSum[u.MaDD] || 0); });

    return db;
  }

  /* --------------------------- TRUY CẬP DB --------------------------- */

  // Bổ sung trường mới cho dữ liệu localStorage của phiên bản cũ (không mất dữ liệu demo).
  function migrate(db) {
    var apName = {};
    (db.aps || []).forEach(function (a) { apName[a.MaAp] = a.TenAp; });
    var logSum = {};
    (db.diemLog || []).forEach(function (r) { logSum[r.MaDD] = Number(logSum[r.MaDD] || 0) + Number(r.Diem || 0); });
    (db.users || []).forEach(function (u) {
      if (!u.NgayVaoDoan) {
        var y = String(u.NgaySinh || '').slice(-4);
        u.NgayVaoDoan = y ? ('26/03/' + (Number(y) + 18)) : '';
      }
      if (!u.NoiVaoDoan) {
        u.NoiVaoDoan = u.MaAp ? ('Chi đoàn ' + (apName[u.MaAp] || u.MaAp)) : 'Chi đoàn Xã Tân Hòa';
      }
      if (!u.NgaySinhHoatDoan) u.NgaySinhHoatDoan = Number(u.Cap) === 4 ? 'Ngày 25 hằng tháng' : 'Ngày 20 hằng tháng';
      if (u.TokenVersion === undefined) u.TokenVersion = 1;
      if (u.DaXoa === undefined) u.DaXoa = false;
      if (u.BatDoiPin === undefined) u.BatDoiPin = false;
      if (u.SoLanSai === undefined) u.SoLanSai = 0;
      if (u.KhoaDen === undefined) u.KhoaDen = '';
      if (u.NgayXoa === undefined) u.NgayXoa = '';
      if (u.NguoiXoa === undefined) u.NguoiXoa = '';
      if (u.DiemNen === undefined) u.DiemNen = Number(u.Diem || 0) - Number(logSum[u.MaDD] || 0);
      if (hasLegacyPin(u)) {
        u.PINHash = hashPin(u.MaDD, u.PIN);
        u.PIN = '';
      }
    });
    (db.cards || []).forEach(function (c) {
      if (!c.NoiCapThe) c.NoiCapThe = 'Ban Chấp hành Chi đoàn Xã Tân Hòa';
    });

    db.config = db.config || {};
    var cfgDefaults = {
      tenXa: 'Xã Tân Hòa', nam: 2026, mucTieuDiem: 300, doanPhiNam: 24000,
      bankId: 'MB', bankAcc: '0123456789', bankName: 'CHI DOAN XA TAN HOA',
      tenChiBo: 'Chi đoàn Xã Tân Hòa', biThuXa: 'Lê Văn Bình', phoBiThuXa: 'Nguyễn Văn Hòa',
      dienThoaiXa: '0901000001', diaChiXa: 'Xã Tân Hòa', emailXa: '', ngayThanhLap: '26/03/2000',
      lanSaoLuuCuoi: '', soBanSaoLuu: 30, phienBan: 1
    };
    Object.keys(cfgDefaults).forEach(function (k) {
      if (db.config[k] === undefined) db.config[k] = cfgDefaults[k];
    });
    if (!db.config.diem) {
      db.config.diem = {
        hopTrucTiep: 10, hybrid: 8, zalo: 5, uomMam: 25, doanPhi: 10,
        the: 20, tuDanhGia: 10, sos: 10, checkinNv: 15, quiz: 15
      };
    }
    if (!db.logs) db.logs = [];
    if (!db.backups) db.backups = [];
    if (!db.tokens) db.tokens = {};
    if (!db.notifications) db.notifications = [];
    if (!db.loginRate) db.loginRate = {};
    db.schemaVersion = SCHEMA_VERSION;
    Object.keys(db.tokens).forEach(function (t) {
      var rec = db.tokens[t];
      if (rec && typeof rec === 'object') return;
      var owner = find(db.users || [], 'MaDD', rec);
      db.tokens[t] = {
        maDD: rec,
        v: owner ? Number(owner.TokenVersion || 0) : 0,
        exp: Date.now() + 12 * 3600 * 1000
      };
    });

    var admin = find(db.users || [], 'MaDD', 'ADMIN');
    if (!admin) {
      db.users.push({
        MaDD: 'ADMIN', HoTen: 'Quản trị viên hệ thống', Cap: 0,
        ChucVu: 'Quản trị hệ thống', MaAp: '', DienThoai: '', NgaySinh: '',
        PIN: '', PINHash: '', BatDoiPin: false, SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
        Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '',
        NgayVaoDoan: '', NoiVaoDoan: '', NgaySinhHoatDoan: '',
        UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: '01/01/2026',
        GhiChu: 'Tài khoản siêu quản trị — toàn quyền nghiệp vụ và quản trị hệ thống',
        MatKhauHash: hashPass('ADMIN', DEFAULT_ADMIN_PASS), BatDoiMatKhau: true,
        DaXoa: false, NgayXoa: '', NguoiXoa: ''
      });
    } else {
      if (!admin.MatKhauHash) {
        admin.MatKhauHash = hashPass('ADMIN', DEFAULT_ADMIN_PASS);
        admin.BatDoiMatKhau = true;
      }
      if (admin.BatDoiMatKhau === undefined) admin.BatDoiMatKhau = false;
      if (admin.DaXoa === undefined) admin.DaXoa = false;
      if (admin.TokenVersion === undefined) admin.TokenVersion = 1;
      if (admin.SoLanSai === undefined) admin.SoLanSai = 0;
    }

    /* Chi đoàn Ấp Hòa Bình + tài khoản Bí thư (bổ sung idempotent cho dữ liệu cũ). */
    db.aps = db.aps || [];
    var apHoaBinh = find(db.aps, 'MaAp', 'AP04');
    if (!apHoaBinh) {
      apHoaBinh = { MaAp: 'AP04', TenAp: 'Ấp Hòa Bình', BiThu: 'BT_AP04', ChiTieu: 70 };
      db.aps.push(apHoaBinh);
    }
    if (!apHoaBinh.BiThu) apHoaBinh.BiThu = 'BT_AP04';

    db.users = db.users || [];
    var btHoaBinh = find(db.users, 'MaDD', 'BT_AP04');
    if (!btHoaBinh) {
      db.users.push({
        MaDD: 'BT_AP04', HoTen: 'Nguyễn Thanh Thiên', Cap: 3,
        ChucVu: 'Bí thư Chi đoàn Ấp Hòa Bình', MaAp: 'AP04',
        DienThoai: '0901000005', NgaySinh: '',
        PIN: '', PINHash: hashPin('BT_AP04', '123456'),
        BatDoiPin: false, SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
        Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '',
        NgayVaoDoan: '', NoiVaoDoan: 'Chi đoàn Ấp Hòa Bình',
        NgaySinhHoatDoan: 'Ngày 20 hằng tháng',
        UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: '01/01/2026',
        DaXoa: false, NgayXoa: '', NguoiXoa: ''
      });
    } else {
      // Luôn chuẩn hóa đúng cấp bậc, chức vụ và đơn vị của tài khoản Bí thư.
      btHoaBinh.Cap = 3;
      btHoaBinh.ChucVu = 'Bí thư Chi đoàn Ấp Hòa Bình';
      btHoaBinh.MaAp = 'AP04';
      if (btHoaBinh.DaXoa === undefined) btHoaBinh.DaXoa = false;
    }
    return db;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { }
    var db = seed();
    save(db);
    return db;
  }
  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { }
  }
  function find(arr, key, val) {
    for (var i = 0; i < arr.length; i++) if (String(arr[i][key]) === String(val)) return arr[i];
    return null;
  }
  function now() { return stamp(new Date()); }

  function profile(db, u) {
    var card = find(db.cards, 'MaDD', u.MaDD);
    var den = u.UyQuyenDen ? new Date(String(u.UyQuyenDen).replace(' ', 'T')) : null;
    var admin = isAdmin(u);
    return {
      maDD: u.MaDD, hoTen: u.HoTen, cap: Number(u.Cap), chucVu: u.ChucVu,
      maAp: u.MaAp || '', tenAp: tenDonVi(db, u),
      dienThoai: u.DienThoai, ngaySinh: u.NgaySinh, diem: Number(u.Diem || 0),
      trangThai: u.TrangThai, maThe: card ? card.MaThe : '',
      coThe: !!(card && card.TrangThai === 'Đã cấp'),
      daXoa: isDeleted(u),
      batDoiMatKhau: admin ? isTrue(u.BatDoiMatKhau) : false,
      batDoiPin: admin ? false : isTrue(u.BatDoiPin),
      uyQuyen: {
        dangHieuLuc: !!(den && den.getTime() > Date.now()),
        den: u.UyQuyenDen || '', nguoiDuyet: '', uyQuyen: false
      }
    };
  }

  function award(db, u, diem, loai, ghiChu) {
    if (!diem) return Number(u.Diem || 0);
    db.diemLog.push({ MaDD: u.MaDD, MaAp: u.MaAp, Loai: loai, Diem: diem, GhiChu: ghiChu || '', ThoiGian: now() });
    u.Diem = Number(u.Diem || 0) + Number(diem);
    return u.Diem;
  }

  function needUser(db, token) {
    var rec = db.tokens[token];
    var maDD = rec && typeof rec === 'object' ? rec.maDD : rec;
    var u = maDD ? find(db.users, 'MaDD', maDD) : null;
    if (!u || !isActiveUser(u)) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    if (rec && typeof rec === 'object') {
      if (rec.exp && Number(rec.exp) < Date.now()) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      if (Number(rec.v || 0) !== Number(u.TokenVersion || 0)) {
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
    }
    return u;
  }
  function isC1(u) { return Number(u.Cap) === 1; }
  function isC2(u) { return Number(u.Cap) === 2; }
  function isC3(u) { return Number(u.Cap) === 3; }
  function isC4(u) { return Number(u.Cap) === 4; }
  function isAdmin(u) { return !!u && Number(u.Cap) === 0; }
  /**
   * Cấp Xã: C1 (Chủ tịch Hội LHTN Xã), C2 (Bí thư Chi bộ Xã) và C0 (Admin).
   * Admin giám sát toàn bộ các Ấp nên dùng chung phạm vi dữ liệu cấp Xã.
   */
  function isXa(u) { return !!u && (isAdmin(u) || isC1(u) || isC2(u)); }
  /** Cấp Ấp: C3 (Bí thư Chi đoàn Ấp). */
  function isAp(u) { return !!u && isC3(u); }
  /** Cấp Đoàn viên: C4. */
  function isMember(u) { return !!u && isC4(u); }
  /**
   * Tên đơn vị hiển thị đầy đủ.
   * C0: Toàn hệ thống · C1: Ủy Ban Hội LHTN Việt Nam Xã · C2: Chi bộ Xã · C3/C4: Chi đoàn Ấp ...
   */
  function tenDonVi(db, u) {
    if (isAdmin(u)) return 'Toàn hệ thống';
    var tenXa = db.config.tenXa || 'Xã Tân Hòa';
    if (isC1(u)) return 'Ủy Ban Hội LHTN Việt Nam ' + tenXa;
    if (isC2(u)) return 'Chi bộ ' + tenXa;
    var ap = u.MaAp ? find(db.aps, 'MaAp', u.MaAp) : null;
    var ten = ap ? String(ap.TenAp).trim() : String(u.MaAp || '');
    if (!ten) return 'Chi đoàn Ấp';
    return /^Chi đoàn\b/i.test(ten) ? ten : ('Chi đoàn ' + ten);
  }
  function needAdmin(db, token) {
    var u = needUser(db, token);
    if (!isAdmin(u)) throw new Error('Chỉ tài khoản quản trị hệ thống (Cấp 0) được thực hiện thao tác này.');
    return u;
  }
  function diemCfg(db, key, fallback) {
    var d = db.config.diem || {};
    return d[key] === undefined || d[key] === '' ? fallback : Number(d[key]);
  }
  function mlog(db, maDD, hanhDong, chiTiet) {
    if (!db.logs) db.logs = [];
    db.logs.push({ MaLog: uid('L'), MaDD: maDD, HanhDong: hanhDong, ChiTiet: chiTiet || '', ThoiGian: now() });
  }
  function scopeAps(db, u) { return isXa(u) ? db.aps.map(function (a) { return a.MaAp; }) : [u.MaAp]; }
  function assertXa(u, msg) {
    if (!isXa(u)) throw new Error(msg || 'Chỉ cấp Xã (C0–C2) được thực hiện thao tác này.');
  }
  /**
   * Admin (C0) là siêu quản trị nên đi qua mọi kiểm tra nghiệp vụ C1–C3.
   * Các giới hạn riêng của Admin vẫn được bảo vệ bằng needAdmin.
   */
  function assertCap(u, caps) {
    if (isAdmin(u)) return;
    if (!u || caps.indexOf(Number(u.Cap)) < 0) {
      throw new Error('Tài khoản của bạn không có quyền thực hiện thao tác này.');
    }
  }
  function assertAp(u, maAp) {
    if (isXa(u)) return;
    if (String(u.MaAp) !== String(maAp)) throw new Error('Bạn chỉ được thao tác trong phạm vi Chi đoàn Ấp của mình.');
  }

  function lastCheckin(db) {
    var map = {};
    db.attendance.forEach(function (a) {
      var t = new Date(String(a.ThoiGian).replace(' ', 'T')).getTime();
      if (!map[a.MaDD] || t > map[a.MaDD]) map[a.MaDD] = t;
    });
    return map;
  }
  function feePaid(db, nam) {
    var map = {};
    db.fees.forEach(function (f) { if (f.Nam === nam && f.TrangThai === 'Đã xác nhận') map[f.MaDD] = true; });
    return map;
  }
  function xepLoai360(db, maDD) {
    var list = db.evals.filter(function (e) { return e.MaDD === maDD; });
    return list.length ? list[list.length - 1] : null;
  }

  /* --------------------------- HÀM XỬ LÝ --------------------------- */

  var H = {};

  H['meta.config'] = function (db) { return { config: db.config, phienBan: configVersion(db) }; };
  H['ap.list'] = function (db) { return { items: db.aps }; };

  H['auth.login'] = function (db, p) {
    var key = String(p.maDD || '').toUpperCase().trim();
    var pass = String(p.pin || '').trim();
    if (!key || !pass) throw new Error('Vui lòng nhập Mã định danh và mã PIN/mật khẩu.');
    var rlKey = 'login:' + key;
    var rl = rateLimitCheck(db, rlKey);
    if (rl.blocked) {
      throw new Error('Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.');
    }
    var u = find(db.users, 'MaDD', key) ||
      db.users.filter(function (x) { return String(x.DienThoai) === key && isActiveUser(x); })[0];
    if (!u || isDeleted(u)) {
      rateLimitHit(db, rlKey);
      save(db);
      throw new Error('Mã định danh hoặc mật khẩu không đúng.');
    }

    if (u.KhoaDen && !isAdmin(u)) {
      var khoaDen = new Date(String(u.KhoaDen).replace(' ', 'T'));
      if (!isNaN(khoaDen.getTime()) && khoaDen.getTime() > Date.now()) {
        var phut = Math.ceil((khoaDen.getTime() - Date.now()) / 60000);
        throw new Error('Tài khoản đang tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau ' + phut + ' phút.');
      }
    }
    if (String(u.TrangThai) !== 'Đang hoạt động') {
      rateLimitHit(db, rlKey);
      save(db);
      throw new Error(isAdmin(u)
        ? 'Tài khoản quản trị đang bị tạm khóa.'
        : 'Tài khoản đang bị tạm khóa. Liên hệ Chủ tịch Hội LHTN Xã hoặc Bí thư Chi bộ Xã.');
    }

    var dung = isAdmin(u)
      ? !!u.MatKhauHash && String(u.MatKhauHash) === hashPass(u.MaDD, pass)
      : verifyPin(u, pass);
    if (!dung) {
      rateLimitHit(db, rlKey);
      throw loginFail(db, u);
    }
    rateLimitReset(db, rlKey);

    // Nâng cấp PIN chữ thô cũ sang PINHash ngay sau lần đăng nhập đầu tiên.
    if (!isAdmin(u) && hasLegacyPin(u)) {
      u.PINHash = hashPin(u.MaDD, pass);
      u.PIN = '';
    }
    u.SoLanSai = 0;
    u.KhoaDen = '';
    var token = issueMockToken(db, u);
    mlog(db, u.MaDD, 'ĐĂNG NHẬP', isAdmin(u) ? 'Quản trị hệ thống (Cấp 0)' : 'Cấp ' + u.Cap);
    save(db);
    return { token: token, profile: profile(db, u), config: db.config, phienBan: configVersion(db) };
  };

  H['auth.me'] = function (db, p, token) {
    return { profile: profile(db, needUser(db, token)), config: db.config, phienBan: configVersion(db) };
  };

  H['auth.logout'] = function (db, p, token) {
    var u = needUser(db, token);
    u.TokenVersion = Number(u.TokenVersion || 0) + 1;
    revokeTokens(db, u.MaDD);
    mlog(db, u.MaDD, 'ĐĂNG XUẤT', 'Thu hồi phiên đăng nhập trên mọi thiết bị');
    save(db);
    return { message: 'Đã đăng xuất khỏi mọi thiết bị.' };
  };

  H['auth.changePin'] = function (db, p, token) {
    var u = needUser(db, token);
    if (isAdmin(u)) throw new Error('Tài khoản quản trị dùng mật khẩu chữ, không dùng PIN.');
    var oldPin = String(p.oldPin || '');
    var newPin = String(p.newPin || '');
    var confirmPin = String(p.confirmPin || '');
    if (!/^\d{6}$/.test(newPin)) throw new Error('Mã PIN mới phải gồm đúng 6 chữ số.');
    if (newPin === oldPin) throw new Error('Mã PIN mới phải khác mã PIN hiện tại.');
    if (['000000', '111111', '123456', '654321', '123123'].indexOf(newPin) >= 0) {
      throw new Error('Mã PIN quá đơn giản, hãy chọn dãy số khó đoán hơn.');
    }
    if (confirmPin && newPin !== confirmPin) throw new Error('Xác nhận mã PIN không khớp.');
    if (!verifyPin(u, oldPin)) throw loginFail(db, u);
    setPin(u, newPin, false);
    revokeTokens(db, u.MaDD);
    var newToken = issueMockToken(db, u);
    mlog(db, u.MaDD, 'ĐỔI PIN', 'Tự đổi mã PIN');
    save(db);
    return { message: 'Đã đổi mã PIN thành công.', token: newToken };
  };

  H['auth.changePassword'] = function (db, p, token) {
    var u = needAdmin(db, token);
    var oldPass = String(p.oldPassword || '');
    var newPass = String(p.newPassword || '');
    var confirm = String(p.confirmPassword || '');
    if (String(u.MatKhauHash) !== hashPass(u.MaDD, oldPass)) throw new Error('Mật khẩu hiện tại không đúng.');
    if (newPass.length < 8) throw new Error('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (newPass.length > 72) throw new Error('Mật khẩu mới tối đa 72 ký tự.');
    if (newPass === oldPass) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
    if (newPass !== confirm) throw new Error('Xác nhận mật khẩu không khớp.');
    u.MatKhauHash = hashPass(u.MaDD, newPass);
    u.BatDoiMatKhau = false;
    u.SoLanSai = 0;
    u.KhoaDen = '';
    u.TokenVersion = Number(u.TokenVersion || 0) + 1;
    revokeTokens(db, u.MaDD);
    var newToken = issueMockToken(db, u);
    mlog(db, u.MaDD, 'ĐỔI MẬT KHẨU', 'Quản trị hệ thống tự đổi mật khẩu');
    save(db);
    return { message: 'Đã đổi mật khẩu quản trị thành công.', token: newToken };
  };

  H['auth.requestPinReset'] = function (db, p) {
    var u = find(db.users, 'MaDD', String(p.maDD || '').toUpperCase());
    // Không tiết lộ tài khoản có tồn tại hay không (chống dò tài khoản).
    if (!u || isDeleted(u) || isAdmin(u)) {
      return {
        maYC: '',
        message: 'Nếu tài khoản tồn tại và đang hoạt động, yêu cầu cấp lại PIN đã được ghi nhận để cấp Xã xử lý.'
      };
    }
    var existing = db.pinResets.filter(function (r) {
      return String(r.MaDD) === u.MaDD && r.TrangThai === 'Chờ cấp';
    })[0];
    if (existing) {
      return { maYC: existing.MaYC, message: 'Yêu cầu trước đó đang chờ cấp Xã duyệt.' };
    }
    var yc = {
      MaYC: uid('YC'), MaDD: u.MaDD, HoTen: u.HoTen, Cap: u.Cap, PinMoi: '',
      TrangThai: 'Chờ cấp', LyDo: p.lyDo || 'Quên mã PIN', NgayYC: now(), NgayCap: '', NguoiCap: ''
    };
    db.pinResets.push(yc);
    mlog(db, u.MaDD, 'YÊU CẦU RESET PIN', p.lyDo || '');
    save(db);
    return { maYC: yc.MaYC, message: 'Đã gửi yêu cầu. Mã PIN mới chỉ hiển thị trên bảng điều khiển của Quản trị hệ thống / Chủ tịch Hội LHTN Xã / Bí thư Chi bộ Xã.' };
  };

  H['auth.pendingResets'] = function (db, p, token) {
    var u = needUser(db, token);
    assertXa(u, 'Chỉ cấp Xã (C0–C2) được xem danh sách cấp lại PIN.');
    return {
      items: db.pinResets.filter(function (r) { return r.TrangThai === 'Chờ cấp'; }).map(function (r) {
        return {
          MaYC: r.MaYC, MaDD: r.MaDD, HoTen: r.HoTen, Cap: r.Cap, TrangThai: r.TrangThai,
          LyDo: r.LyDo, NgayYC: r.NgayYC, NgayCap: r.NgayCap, NguoiCap: r.NguoiCap
        };
      }).reverse()
    };
  };

  H['auth.approveReset'] = function (db, p, token) {
    var u = needUser(db, token);
    assertXa(u, 'Chỉ cấp Xã (C0–C2) được cấp lại PIN.');
    var yc = find(db.pinResets, 'MaYC', p.maYC);
    if (!yc) throw new Error('Không tìm thấy yêu cầu.');
    if (yc.TrangThai !== 'Chờ cấp') throw new Error('Yêu cầu đã được xử lý.');
    var target = find(db.users, 'MaDD', yc.MaDD);
    if (!target || isDeleted(target)) throw new Error('Tài khoản cần cấp lại PIN không còn tồn tại.');
    if (isAdmin(target)) throw new Error('Tài khoản quản trị dùng mật khẩu chữ, không dùng PIN.');
    // Sinh PIN tại thời điểm duyệt và chỉ lưu dạng băm.
    var pin = randPin();
    setPin(target, pin, true);
    revokeTokens(db, target.MaDD);
    yc.TrangThai = 'Đã cấp';
    yc.PinMoi = '';
    yc.NgayCap = now();
    yc.NguoiCap = u.MaDD;
    mlog(db, u.MaDD, 'CẤP LẠI PIN', 'Cho ' + yc.MaDD);
    save(db);
    return { pinMoi: pin, message: 'Đã cấp PIN mới cho ' + yc.HoTen + '. Người dùng phải đổi PIN ngay khi đăng nhập.' };
  };

  H['auth.delegate'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [3]);
    var target = find(db.users, 'MaDD', p.maDD);
    if (!target) throw new Error('Không tìm thấy tài khoản được ủy quyền.');
    if (!target.MaAp) throw new Error('Tài khoản được ủy quyền phải thuộc một Chi đoàn Ấp.');
    if (!isAdmin(u) && target.MaAp !== u.MaAp) throw new Error('Chỉ được ủy quyền cho cán bộ cùng Ấp.');
    var maAp = isAdmin(u) ? target.MaAp : u.MaAp;
    db.users.forEach(function (x) {
      if (x.MaAp === maAp && x.MaDD !== u.MaDD && x.UyQuyenDen) {
        x.UyQuyenCho = ''; x.UyQuyenDen = '';
      }
    });
    var den = stamp(new Date(Date.now() + Math.min(Number(p.gio || 24), 24) * 3600000));
    target.UyQuyenCho = target.MaDD;
    target.UyQuyenDen = den;
    save(db);
    return { den: den, message: 'Đã ủy quyền cho ' + target.HoTen + ' đến ' + den + '.' };
  };

  H['home.summary'] = function (db, p, token) {
    var u = needUser(db, token);
    var nam = db.config.nam, mucTieu = db.config.mucTieuDiem;
    var members = db.users.filter(function (x) { return Number(x.Cap) === 4 && !isDeleted(x); });
    var last = lastCheckin(db);
    var paid = feePaid(db, nam);
    var scope = scopeAps(db, u);
    var scoped = members.filter(function (m) { return scope.indexOf(m.MaAp) >= 0; });
    var nowMs = Date.now();

    var apStats = db.aps.filter(function (a) { return scope.indexOf(a.MaAp) >= 0; }).map(function (a) {
      var list = members.filter(function (m) { return m.MaAp === a.MaAp; });
      var tb = list.length ? Math.round(list.reduce(function (s, m) { return s + Number(m.Diem || 0); }, 0) / list.length) : 0;
      var active = list.filter(function (m) { return last[m.MaDD] && (nowMs - last[m.MaDD]) / 86400000 <= 30; }).length;
      var daDong = list.filter(function (m) { return paid[m.MaDD]; }).length;
      return {
        maAp: a.MaAp, tenAp: a.TenAp, biThu: a.BiThu, soDoanVien: list.length, chiTieu: a.ChiTieu,
        diemTB: tb, tyLeChuyenCan: list.length ? Math.round(active / list.length * 100) : 0,
        tyLeDoanPhi: list.length ? Math.round(daDong / list.length * 100) : 0,
        choDuyet: db.uommam.filter(function (r) { return r.MaAp === a.MaAp && r.TrangThai === 'Chờ duyệt'; }).length
      };
    });

    var canhBao = scoped.map(function (m) {
      var t = last[m.MaDD];
      return { maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, soNgayVang: t ? Math.floor((nowMs - t) / 86400000) : 999, diem: m.Diem };
    }).filter(function (x) { return x.soNgayVang > 60; }).sort(function (a, b) { return b.soNgayVang - a.soNgayVang; }).slice(0, 8);

    var tongDV = scoped.length;
    var active30 = scoped.filter(function (m) { return last[m.MaDD] && (nowMs - last[m.MaDD]) / 86400000 <= 30; }).length;
    var uomPending = db.uommam.filter(function (r) { return r.TrangThai === 'Chờ duyệt' && scope.indexOf(r.MaAp) >= 0; }).length;
    var resets = db.pinResets.filter(function (r) { return r.TrangThai === 'Chờ cấp'; }).length;
    var feeTotal = db.fees.filter(function (f) { return f.Nam === nam && f.TrangThai === 'Đã xác nhận' && scope.indexOf(f.MaAp) >= 0; })
      .reduce(function (s, f) { return s + Number(f.SoTien); }, 0);

    var kpi;
    if (isXa(u)) {
      kpi = [
        { label: 'Tổng đoàn viên', value: tongDV, unit: 'đồng chí', hint: db.aps.length + ' Chi đoàn Ấp', tone: 'red', icon: 'users' },
        { label: 'Tỷ lệ tập hợp 30 ngày', value: tongDV ? Math.round(active30 / tongDV * 100) : 0, unit: '%', hint: 'Mục tiêu 85–92%', tone: 'green', icon: 'trend' },
        { label: 'Hồ sơ chờ duyệt', value: uomPending + resets, unit: 'hồ sơ', hint: uomPending + ' Ươm mầm • ' + resets + ' reset PIN', tone: 'orange', icon: 'inbox' },
        { label: 'Quỹ đoàn phí', value: feeTotal, unit: 'đ', hint: 'Đã xác nhận năm ' + nam, tone: 'blue', icon: 'wallet', money: true }
      ];
    } else if (isAp(u)) {
      var a = apStats[0] || {};
      var open = db.sessions.filter(function (s) { return s.MaAp === u.MaAp && s.TrangThai === 'Đang mở'; })[0];
      var soDiemDanh = open ? db.attendance.filter(function (x) { return x.MaPhien === open.MaPhien; }).length : 0;
      kpi = [
        { label: 'Đoàn viên của Ấp', value: a.soDoanVien || 0, unit: 'đồng chí', hint: 'Chỉ tiêu ' + (a.chiTieu || 0), tone: 'red', icon: 'users' },
        { label: 'Điểm rèn luyện TB', value: a.diemTB || 0, unit: 'điểm', hint: 'Mức xét Ươm mầm: 300', tone: 'blue', icon: 'star' },
        { label: 'Phiên điểm danh', value: open ? 1 : 0, unit: 'đang mở', hint: open ? soDiemDanh + ' lượt đã điểm danh' : 'Chưa có phiên nào', tone: open ? 'green' : 'grey', icon: 'qr' },
        { label: 'Đoàn phí đã thu', value: a.tyLeDoanPhi || 0, unit: '%', hint: 'Cần xác nhận chuyển khoản', tone: 'orange', icon: 'wallet' }
      ];
    } else {
      var feeMe = find(db.fees, 'MaDD', u.MaDD);
      var lt = last[u.MaDD];
      kpi = [
        { label: 'Điểm rèn luyện', value: u.Diem, unit: '/ ' + mucTieu, hint: u.Diem >= mucTieu ? 'Đã đạt mức xét Ươm mầm Đỏ' : 'Còn ' + (mucTieu - u.Diem) + ' điểm', tone: 'red', icon: 'star' },
        { label: 'Lần tham gia gần nhất', value: lt ? Math.floor((nowMs - lt) / 86400000) : '—', unit: lt ? 'ngày trước' : '', hint: lt ? '' : 'Chưa có dữ liệu điểm danh', tone: 'blue', icon: 'clock' },
        { label: 'Đoàn phí ' + nam, value: feeMe && feeMe.TrangThai === 'Đã xác nhận' ? 'Đã đóng' : (feeMe ? 'Chờ duyệt' : 'Chưa đóng'), unit: '', hint: '24.000đ/năm', tone: feeMe && feeMe.TrangThai === 'Đã xác nhận' ? 'green' : 'orange', icon: 'wallet' },
        { label: 'Thẻ Đoàn viên', value: u.MaThe ? 'Đã tích hợp' : 'Chưa có', unit: '', hint: u.MaThe || 'Liên hệ Bí thư Chi đoàn Ấp để cấp', tone: u.MaThe ? 'green' : 'grey', icon: 'card' }
      ];
    }

    var acts = db.diemLog.slice().reverse().filter(function (r) {
      return scope.indexOf(r.MaAp) >= 0;
    }).slice(0, 8).map(function (r) {
      var m = find(db.users, 'MaDD', r.MaDD);
      return { maDD: r.MaDD, hoTen: m ? m.HoTen : r.MaDD, loai: r.Loai, diem: r.Diem, ghiChu: r.GhiChu, thoiGian: r.ThoiGian };
    });

    return {
      profile: profile(db, u),
      kpi: kpi,
      apStats: apStats,
      canhBao: canhBao,
      hoatDong: acts,
      tienDo: { diem: u.Diem, mucTieu: mucTieu, phanTram: Math.min(100, Math.round(u.Diem / mucTieu * 100)) },
      quyen: { laBiThu: isAp(u), quanLyAp: scope, uyQuyen: null }
    };
  };

  H['member.list'] = function (db, p, token) {
    var u = needUser(db, token);
    p = p || {};
    var maAp = isXa(u) ? (p.maAp || '') : u.MaAp;
    var last = lastCheckin(db), paid = feePaid(db, db.config.nam);
    var all = db.users.filter(function (m) {
      return Number(m.Cap) === 4 && !isDeleted(m) && (!maAp || m.MaAp === maAp);
    }).map(function (m) {
      var t = last[m.MaDD];
      return {
        maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, dienThoai: m.DienThoai, diem: m.Diem,
        ngaySinh: m.NgaySinh || '', ghiChu: m.GhiChu || '',
        maThe: m.MaThe, coThe: !!m.MaThe, ngayVang: t ? Math.floor((Date.now() - t) / 86400000) : null,
        daDongPhi: !!paid[m.MaDD]
      };
    }).sort(function (a, b) { return b.diem - a.diem; });

    var tongSo = all.length;
    var coTrang = p.limit !== undefined && p.limit !== null && String(p.limit) !== '';
    var offset = coTrang ? Math.max(0, Math.floor(Number(p.offset) || 0)) : 0;
    var limit = coTrang ? Math.min(200, Math.max(1, Math.floor(Number(p.limit) || 50))) : tongSo;
    var items = all.slice(offset, offset + limit);
    return {
      items: items, tongSo: tongSo, offset: offset, limit: limit,
      conNua: offset + items.length < tongSo
    };
  };

  H['member.add'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    if (!p.hoTen) throw new Error('Vui lòng nhập họ tên đoàn viên.');
    if (!/^0\d{9}$/.test(String(p.dienThoai))) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');
    var nums = db.users.map(function (x) { var m = String(x.MaDD).match(/^DV(\d+)$/); return m ? Number(m[1]) : 0; });
    var next = Math.max.apply(null, nums.concat([0])) + 1;
    var maDD = 'DV' + ('0' + next).slice(-2);
    var apMa = isAp(u) ? u.MaAp : String(p.maAp || '').trim().toUpperCase();
    if (!apMa) throw new Error('Vui lòng chọn Ấp cho đoàn viên mới.');
    var apObj = find(db.aps, 'MaAp', apMa);
    if (!apObj) throw new Error('Không tìm thấy Chi đoàn Ấp ' + apMa + '.');
    db.users.push({
      MaDD: maDD, HoTen: p.hoTen, Cap: 4, ChucVu: 'Đoàn viên', MaAp: apMa,
      DienThoai: p.dienThoai, NgaySinh: p.ngaySinh || '', PIN: '', PINHash: hashPin(maDD, '123456'),
      BatDoiPin: true, SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
      Diem: 0, DiemNen: 0,
      NgayVaoDoan: '', NoiVaoDoan: apObj ? ('Chi đoàn ' + apObj.TenAp) : '',
      NgaySinhHoatDoan: 'Ngày 25 hằng tháng',
      TrangThai: 'Đang hoạt động', MaThe: '', UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: now(),
      DaXoa: false, NgayXoa: '', NguoiXoa: ''
    });
    mlog(db, u.MaDD, 'THÊM ĐOÀN VIÊN', maDD + ' - ' + p.hoTen);
    save(db);
    return { maDD: maDD, message: 'Đã thêm ' + p.hoTen + ' (Mã ĐD: ' + maDD + ', PIN mặc định 123456 — buộc đổi khi đăng nhập).' };
  };

  H['member.update'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m || isDeleted(m)) throw new Error('Không tìm thấy đoàn viên cần cập nhật.');
    if (Number(m.Cap) !== 4) throw new Error('Chỉ cập nhật thông tin đoàn viên Cấp 4 tại màn hình này.');
    if (!isAdmin(u) && !isXa(u)) assertAp(u, m.MaAp);
    var hoTen = String(p.hoTen || '').trim();
    if (!hoTen) throw new Error('Vui lòng nhập họ tên đoàn viên.');
    var dienThoai = String(p.dienThoai || '').trim();
    if (dienThoai && !/^0\d{9}$/.test(dienThoai)) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');
    var maAp = isAp(u) ? u.MaAp : String(p.maAp || m.MaAp || '').trim().toUpperCase();
    var ap = find(db.aps, 'MaAp', maAp);
    if (!ap) throw new Error('Không tìm thấy Chi đoàn Ấp ' + maAp + '.');
    m.HoTen = hoTen;
    m.DienThoai = dienThoai;
    if (p.ngaySinh !== undefined) m.NgaySinh = String(p.ngaySinh || '');
    m.MaAp = maAp;
    m.NoiVaoDoan = 'Chi đoàn ' + ap.TenAp;
    if (p.ghiChu !== undefined) m.GhiChu = String(p.ghiChu || '');
    mlog(db, u.MaDD, 'CẬP NHẬT ĐOÀN VIÊN', m.MaDD + ' - ' + hoTen);
    save(db);
    return { maDD: m.MaDD, message: 'Đã cập nhật thông tin ' + hoTen + '.' };
  };

  H['member.delete'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m || isDeleted(m)) throw new Error('Không tìm thấy đoàn viên cần xóa.');
    if (Number(m.Cap) !== 4) throw new Error('Chỉ xóa tài khoản đoàn viên Cấp 4 tại màn hình này.');
    if (!isAdmin(u) && !isXa(u)) assertAp(u, m.MaAp);

    // Xóa mềm: ẩn khỏi danh sách, thu hồi phiên, GIỮ toàn bộ lịch sử để kiểm toán.
    m.DaXoa = true;
    m.NgayXoa = now();
    m.NguoiXoa = u.MaDD;
    m.TokenVersion = Number(m.TokenVersion || 0) + 1;
    revokeTokens(db, m.MaDD);
    mlog(db, u.MaDD, 'XÓA MỀM ĐOÀN VIÊN', m.MaDD + ' - ' + m.HoTen);
    save(db);
    return {
      maDD: m.MaDD,
      message: 'Đã chuyển ' + m.HoTen + ' (' + m.MaDD + ') vào thùng rác. Có thể khôi phục trong Hệ thống → Tài khoản.'
    };
  };

  H['member.restore'] = function (db, p, token) {
    var u = needAdmin(db, token);
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m) throw new Error('Không tìm thấy tài khoản cần khôi phục.');
    if (!isDeleted(m)) throw new Error('Tài khoản này không nằm trong thùng rác.');
    m.DaXoa = false;
    m.NgayXoa = '';
    m.NguoiXoa = '';
    m.TokenVersion = Number(m.TokenVersion || 0) + 1;
    revokeTokens(db, m.MaDD);
    mlog(db, u.MaDD, 'KHÔI PHỤC ĐOÀN VIÊN', m.MaDD + ' - ' + m.HoTen);
    save(db);
    return { maDD: m.MaDD, message: 'Đã khôi phục ' + m.HoTen + ' (' + m.MaDD + ').' };
  };

  H['attendance.createSession'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var maAp = isAp(u) ? u.MaAp : p.maAp;
    if (!maAp) throw new Error('Vui lòng chọn Ấp tổ chức sinh hoạt.');
    db.sessions.forEach(function (s) {
      if (s.MaAp === maAp && s.TrangThai === 'Đang mở') { s.TrangThai = 'Đã kết thúc'; s.KetThuc = now(); }
    });
    var ma = uid('PH');
    db.sessions.push({ MaPhien: ma, MaAp: maAp, TieuDe: p.tieuDe || 'Sinh hoạt Chi đoàn', BatDau: now(), KetThuc: '', TrangThai: 'Đang mở', NguoiTao: u.MaDD });
    save(db);
    return { maPhien: ma, message: 'Đã mở phiên điểm danh. QR tự đổi mã mỗi 60 giây.' };
  };

  H['attendance.session'] = function (db, p) {
    var s = find(db.sessions, 'MaPhien', p.maPhien);
    if (!s) throw new Error('Phiên điểm danh không tồn tại.');
    var ap = find(db.aps, 'MaAp', s.MaAp);
    var tok = hash10(s.MaPhien + ':' + slot());
    var sec = Math.floor(Date.now() / 1000) % 60;
    var ds = db.attendance.filter(function (a) { return a.MaPhien === s.MaPhien; }).map(function (a) {
      var m = find(db.users, 'MaDD', a.MaDD);
      return { maDD: a.MaDD, hoTen: m ? m.HoTen : a.MaDD, hinhThuc: a.HinhThuc, diem: a.Diem, thoiGian: a.ThoiGian };
    });
    return {
      maPhien: s.MaPhien, tieuDe: s.TieuDe, maAp: s.MaAp, tenAp: ap ? ap.TenAp : s.MaAp,
      trangThai: s.TrangThai, batDau: s.BatDau, token: tok, conLai: 60 - sec, serverTime: now(),
      payload: 'CD6|' + s.MaPhien + '|' + tok, daDiemDanh: ds.length, ds: ds.reverse(),
      nguoiDuyet: { hoTen: ap ? ap.BiThu : '', uyQuyen: false }
    };
  };

  H['attendance.scan'] = function (db, p, token) {
    var u = needUser(db, token);
    var raw = String(p.payload || '').trim();
    var maPhien = p.maPhien, tok = String(p.token || '').toUpperCase();
    if (raw) {
      var parts = raw.split('|');
      if (parts.length === 3 && parts[0] === 'CD6') { maPhien = parts[1] || maPhien; tok = (parts[2] || '').toUpperCase(); }
    }
    if (!maPhien) {
      var open = db.sessions.filter(function (s) { return s.TrangThai === 'Đang mở' && (isXa(u) || s.MaAp === u.MaAp); })[0];
      if (open) maPhien = open.MaPhien;
    }
    if (!maPhien) throw new Error('Không tìm thấy phiên điểm danh đang mở cho Chi đoàn Ấp của bạn.');
    var s = find(db.sessions, 'MaPhien', maPhien);
    if (!s) throw new Error('Không tìm thấy phiên điểm danh.');
    if (s.TrangThai !== 'Đang mở') throw new Error('Phiên điểm danh đã kết thúc.');
    if (!isXa(u) && s.MaAp !== u.MaAp) throw new Error('Bạn không thuộc Chi đoàn Ấp của phiên này.');
    var sl = slot();
    var valid = [hash10(maPhien + ':' + sl), hash10(maPhien + ':' + (sl - 1)), hash10(maPhien + ':' + (sl + 1))];
    if (valid.indexOf(tok) < 0) throw new Error('Mã QR đã hết hiệu lực (quá 60 giây). Vui lòng quét lại mã mới.');
    if (db.attendance.filter(function (a) { return a.MaPhien === maPhien && a.MaDD === u.MaDD; }).length) {
      throw new Error('Bạn đã điểm danh phiên này rồi.');
    }
    var ht = p.hinhThuc || 'Trực tiếp';
    var map = {
      'Trực tiếp': diemCfg(db, 'hopTrucTiep', 10),
      'Hybrid': diemCfg(db, 'hybrid', 8),
      'Zalo': diemCfg(db, 'zalo', 5)
    };
    var diem = map[ht] === undefined ? diemCfg(db, 'hopTrucTiep', 10) : map[ht];
    db.attendance.push({ MaDD: u.MaDD, MaPhien: maPhien, MaAp: s.MaAp, HinhThuc: ht, Diem: diem, ThoiGian: now() });
    var tong = award(db, u, diem, 'Điểm danh ' + ht, s.TieuDe);
    save(db);
    return { hoTen: u.HoTen, diem: diem, tongDiem: tong, hinhThuc: ht, thoiGian: now(), message: 'Điểm danh thành công! +' + diem + ' điểm rèn luyện.' };
  };

  H['attendance.close'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var s = find(db.sessions, 'MaPhien', p.maPhien);
    if (!s) throw new Error('Không tìm thấy phiên.');
    assertAp(u, s.MaAp);
    s.TrangThai = 'Đã kết thúc';
    s.KetThuc = now();
    save(db);
    return { message: 'Đã kết thúc phiên điểm danh.' };
  };

  H['attendance.list'] = function (db, p, token) {
    var u = needUser(db, token);
    var maAp = isXa(u) ? (p.maAp || '') : u.MaAp;
    var last = lastCheckin(db);
    var items = db.users.filter(function (m) { return Number(m.Cap) === 4 && !isDeleted(m) && (!maAp || m.MaAp === maAp); })
      .map(function (m) {
        var t = last[m.MaDD];
        return {
          maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp,
          soNgayVang: t ? Math.floor((Date.now() - t) / 86400000) : null,
          canhBao: !t || (Date.now() - t) / 86400000 > 60
        };
      }).sort(function (a, b) { return (b.soNgayVang || 9999) - (a.soNgayVang || 9999); });

    var phien = db.sessions.filter(function (s) { return !maAp || s.MaAp === maAp; }).slice(-5).reverse()
      .map(function (s) { return { MaPhien: s.MaPhien, MaAp: s.MaAp, TieuDe: s.TieuDe, BatDau: s.BatDau, TrangThai: s.TrangThai }; });

    var lichSu = db.attendance.filter(function (a) { return a.MaDD === u.MaDD; }).slice(-8).reverse().map(function (a) {
      var s = find(db.sessions, 'MaPhien', a.MaPhien);
      return { tieuDe: s ? s.TieuDe : a.MaPhien, hinhThuc: a.HinhThuc, diem: a.Diem, thoiGian: a.ThoiGian };
    });

    return { items: items, phien: phien, tongVang: items.filter(function (x) { return x.canhBao; }).length, lichSu: lichSu };
  };

  H['uommam.list'] = function (db, p, token) {
    var u = needUser(db, token);
    var maAp = isXa(u) ? (p.maAp || '') : u.MaAp;
    var items = db.users.filter(function (m) {
      if (Number(m.Cap) !== 4 || isDeleted(m)) return false;
      if (isC4(u)) return m.MaDD === u.MaDD;
      return !maAp || m.MaAp === maAp;
    }).map(function (m) {
      var card = find(db.cards, 'MaDD', m.MaDD);
      var ev = xepLoai360(db, m.MaDD);
      var st = find(db.uommam, 'MaDD', m.MaDD);
      var tc1 = !!(card && card.TrangThai === 'Đã cấp');
      var tc2 = m.Diem >= db.config.mucTieuDiem;
      var tc3 = !!(ev && ['Hoàn thành xuất sắc', 'Hoàn thành tốt'].indexOf(ev.XepLoai) >= 0);
      return {
        maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, diem: m.Diem, coThe: tc1, maThe: card ? card.MaThe : '',
        datDiem: tc2, dat360: tc3, xepLoai360: ev ? ev.XepLoai : 'Chưa tự đánh giá',
        duDieuKien: tc1 && tc2 && tc3,
        trangThai: st ? st.TrangThai : 'Chưa đề cử', nhanXet: st ? st.NhanXet : '',
        nguoiDeCu: st ? st.NguoiDeCu : '', ngayDeCu: st ? st.NgayDeCu : '', nguoiDuyet: st ? st.NguoiDuyet : ''
      };
    }).sort(function (a, b) { return (b.duDieuKien ? 1 : 0) - (a.duDieuKien ? 1 : 0) || b.diem - a.diem; });

    return {
      items: items, mucTieu: db.config.mucTieuDiem,
      thongKe: {
        tong: items.length,
        duDieuKien: items.filter(function (i) { return i.duDieuKien; }).length,
        choDuyet: items.filter(function (i) { return i.trangThai === 'Chờ duyệt'; }).length,
        daDuyet: items.filter(function (i) { return i.trangThai === 'Đã duyệt'; }).length
      }
    };
  };

  H['uommam.nominate'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [3]);
    if (!p.nhanXet || p.nhanXet.trim().length < 20) throw new Error('Vui lòng nhập nhận xét tối thiểu 20 ký tự.');
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m || isDeleted(m)) throw new Error('Không tìm thấy đoàn viên.');
    if (!isAdmin(u) && m.MaAp !== u.MaAp) throw new Error('Đoàn viên không thuộc Chi đoàn Ấp của bạn.');
    var card = find(db.cards, 'MaDD', m.MaDD);
    var ev = xepLoai360(db, m.MaDD);
    if (!card || m.Diem < db.config.mucTieuDiem || !ev ||
      ['Hoàn thành xuất sắc', 'Hoàn thành tốt'].indexOf(ev.XepLoai) < 0) {
      throw new Error('Đoàn viên chưa đạt đủ 3 tiêu chuẩn Ươm mầm Đỏ.');
    }
    var st = find(db.uommam, 'MaDD', m.MaDD);
    if (st) Object.assign(st, { TrangThai: 'Chờ duyệt', NhanXet: p.nhanXet, NguoiDeCu: u.MaDD, NgayDeCu: now() });
    else db.uommam.push({ MaDD: m.MaDD, HoTen: m.HoTen, MaAp: m.MaAp, Diem: m.Diem, TrangThai: 'Chờ duyệt', NhanXet: p.nhanXet, NguoiDeCu: u.MaDD, NgayDeCu: now(), NguoiDuyet: '', NgayDuyet: '' });
    save(db);
    return { message: 'Đã trình cấp Xã phê duyệt cho ' + m.HoTen + '.' };
  };

  H['uommam.approve'] = function (db, p, token) {
    var u = needUser(db, token);
    assertXa(u, 'Chỉ cấp Xã (C0–C2) được phê duyệt.');
    var st = find(db.uommam, 'MaDD', p.maDD);
    if (!st) throw new Error('Không tìm thấy hồ sơ đề cử.');
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m || isDeleted(m)) throw new Error('Không tìm thấy đoàn viên của hồ sơ đề cử.');
    st.TrangThai = 'Đã duyệt';
    st.NguoiDuyet = u.MaDD;
    st.NgayDuyet = now();
    var m = find(db.users, 'MaDD', p.maDD);
    var diemUom = diemCfg(db, 'uomMam', 25);
    var tong = award(db, m, diemUom, 'Duyệt nguồn Cảm tình Đảng', 'Ươm mầm Đỏ ' + db.config.nam);
    save(db);
    return { tongDiem: tong, message: 'Đã phê duyệt ' + st.HoTen + ' vào nguồn Cảm tình Đảng (+' + diemUom + ' điểm).' };
  };

  H['uommam.reject'] = function (db, p, token) {
    var u = needUser(db, token);
    assertXa(u, 'Chỉ cấp Xã (C0–C2) được trả hồ sơ.');
    var st = find(db.uommam, 'MaDD', p.maDD);
    if (st) { st.TrangThai = 'Từ chối'; st.NhanXet = p.lyDo || st.NhanXet; st.NgayDuyet = now(); }
    save(db);
    return { message: 'Đã trả hồ sơ về Chi đoàn Ấp.' };
  };

  H['fee.my'] = function (db, p, token) {
    var u = needUser(db, token);
    var nam = db.config.nam;
    var f = db.fees.filter(function (x) { return x.MaDD === u.MaDD && x.Nam === nam; })[0];
    return {
      nam: nam, mucPhi: db.config.doanPhiNam,
      trangThai: f ? f.TrangThai : 'Chưa đóng',
      maGiaoDich: f ? f.MaGiaoDich : '', soTien: f ? f.SoTien : db.config.doanPhiNam,
      noiDung: f ? f.NoiDung : ('DOANPHI ' + u.MaAp + ' ' + u.MaDD),
      ngayXacNhan: f ? f.NgayXacNhan : '',
      daDong: !!(f && f.TrangThai === 'Đã xác nhận'),
      choDuyet: !!(f && f.TrangThai === 'Chờ xác nhận')
    };
  };

  H['fee.pay'] = function (db, p, token) {
    var u = needUser(db, token);
    var nam = db.config.nam, muc = db.config.doanPhiNam;
    var noiDung = 'DOANPHI ' + u.MaAp + ' ' + u.MaDD;
    var f = db.fees.filter(function (x) { return x.MaDD === u.MaDD && x.Nam === nam; })[0];
    if (f && f.TrangThai === 'Đã xác nhận') throw new Error('Bạn đã hoàn thành đoàn phí năm ' + nam + '.');
    if (f) f.TrangThai = 'Chờ xác nhận';
    else db.fees.push({
      MaGiaoDich: uid('DP'), MaAp: u.MaAp, MaDD: u.MaDD, HoTen: u.HoTen, Nam: nam,
      SoTien: muc, NoiDung: noiDung, TrangThai: 'Chờ xác nhận', NgayTao: now(), NgayXacNhan: '', NguoiXacNhan: ''
    });
    save(db);
    var qr = 'https://img.vietqr.io/image/' + db.config.bankId + '-' + db.config.bankAcc +
      '-compact2.png?amount=' + muc + '&addInfo=' + encodeURIComponent(noiDung) +
      '&accountName=' + encodeURIComponent(db.config.bankName);
    return {
      maGiaoDich: f ? f.MaGiaoDich : db.fees[db.fees.length - 1].MaGiaoDich,
      soTien: muc, noiDung: noiDung, qrUrl: qr,
      bank: { id: db.config.bankId, acc: db.config.bankAcc, name: db.config.bankName },
      message: 'Đã tạo mã VietQR cá nhân hóa.'
    };
  };

  H['fee.summary'] = function (db, p, token) {
    var u = needUser(db, token);
    var nam = db.config.nam, muc = db.config.doanPhiNam;
    var scope = scopeAps(db, u);
    var stats = db.aps.filter(function (a) { return scope.indexOf(a.MaAp) >= 0; }).map(function (a) {
      var list = db.users.filter(function (m) { return Number(m.Cap) === 4 && !isDeleted(m) && m.MaAp === a.MaAp; });
      var paid = db.fees.filter(function (f) { return f.Nam === nam && f.MaAp === a.MaAp && f.TrangThai === 'Đã xác nhận'; });
      var pending = db.fees.filter(function (f) { return f.Nam === nam && f.MaAp === a.MaAp && f.TrangThai === 'Chờ xác nhận'; });
      var thu = paid.reduce(function (s, f) { return s + f.SoTien; }, 0);
      var chi = db.ledger.filter(function (c) { return c.MaAp === a.MaAp; }).reduce(function (s, c) { return s + c.SoTien; }, 0);
      return {
        maAp: a.MaAp, tenAp: a.TenAp, soDoanVien: list.length, duKien: list.length * muc,
        daThu: thu, daChi: chi, tonQuy: thu - chi,
        tyLe: list.length ? Math.round(paid.length / list.length * 100) : 0,
        soDaDong: paid.length, pending: pending.length
      };
    });
    var nhat = db.fees.filter(function (f) { return f.Nam === nam && scope.indexOf(f.MaAp) >= 0; })
      .map(function (f) {
        return { maAp: f.MaAp, hoTen: f.HoTen, soTien: f.SoTien, loai: 'Thu', noiDung: 'Đoàn phí năm ' + f.Nam, trangThai: f.TrangThai, ngay: f.NgayXacNhan || f.NgayTao };
      })
      .concat(db.ledger.filter(function (c) { return scope.indexOf(c.MaAp) >= 0; }).map(function (c) {
        return { maAp: c.MaAp, hoTen: c.NguoiTao, soTien: c.SoTien, loai: 'Chi', noiDung: c.NoiDung, trangThai: 'Đã chi', ngay: c.Ngay };
      }))
      .sort(function (a, b) { return String(b.ngay).localeCompare(String(a.ngay)); }).slice(0, 30);

    var tongThu = stats.reduce(function (s, x) { return s + x.daThu; }, 0);
    var tongChi = stats.reduce(function (s, x) { return s + x.daChi; }, 0);
    return {
      nam: nam, mucPhi: muc, stats: stats,
      pending: db.fees.filter(function (f) { return f.Nam === nam && f.TrangThai === 'Chờ xác nhận' && scope.indexOf(f.MaAp) >= 0; })
        .map(function (f) { return { maGiaoDich: f.MaGiaoDich, maDD: f.MaDD, hoTen: f.HoTen, maAp: f.MaAp, soTien: f.SoTien, ngayTao: f.NgayTao }; }),
      nhat: nhat, tongThu: tongThu, tongChi: tongChi, tonQuy: tongThu - tongChi
    };
  };

  H['fee.confirm'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var f = find(db.fees, 'MaGiaoDich', p.maGiaoDich);
    if (!f) throw new Error('Không tìm thấy giao dịch.');
    if (!isXa(u) && f.MaAp !== u.MaAp) throw new Error('Bạn chỉ được xác nhận đoàn phí trong Ấp của mình.');
    if (f.TrangThai === 'Đã xác nhận') throw new Error('Giao dịch đã được xác nhận.');
    f.TrangThai = 'Đã xác nhận';
    f.NgayXacNhan = now();
    f.NguoiXacNhan = u.MaDD;
    var daCong = db.diemLog.filter(function (l) { return l.MaDD === f.MaDD && l.Loai.indexOf('Đoàn phí') === 0 && l.ThoiGian.indexOf(String(f.Nam)) === 0; }).length;
    var diem = 0;
    if (!daCong) {
      var m = find(db.users, 'MaDD', f.MaDD);
      diem = diemCfg(db, 'doanPhi', 10);
      award(db, m, diem, 'Đoàn phí năm ' + f.Nam, 'Hoàn thành đoàn phí');
    }
    save(db);
    return { diem: diem, message: 'Đã xác nhận đoàn phí cho ' + f.HoTen + (diem ? ' (+' + diem + ' điểm)' : '') + '.' };
  };

  H['fee.addExpense'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    if (!Number(p.soTien)) throw new Error('Số tiền chi không hợp lệ.');
    if (!p.noiDung) throw new Error('Vui lòng nhập nội dung chi.');
    var maAp = isAp(u) ? u.MaAp : String(p.maAp || '').trim().toUpperCase();
    if (!maAp) throw new Error('Vui lòng chọn Chi đoàn Ấp phát sinh khoản chi.');
    if (!find(db.aps, 'MaAp', maAp)) throw new Error('Không tìm thấy Chi đoàn Ấp ' + maAp + '.');
    db.ledger.push({ MaGD: uid('TC'), MaAp: maAp, Loai: 'Chi', SoTien: Number(p.soTien), NoiDung: p.noiDung, Ngay: now(), NguoiTao: u.MaDD });
    mlog(db, u.MaDD, 'GHI CHI QUỸ', p.noiDung + ' - ' + p.soTien);
    save(db);
    return { message: 'Đã ghi nhận khoản chi và công khai trên Sổ quỹ.' };
  };

  H['card.get'] = function (db, p, token) {
    var u = needUser(db, token);
    var maDD = p.maDD || u.MaDD;
    var m = find(db.users, 'MaDD', maDD);
    if (!m) throw new Error('Không tìm thấy đoàn viên.');
    if (String(maDD) !== String(u.MaDD)) assertAp(u, m.MaAp);
    var card = find(db.cards, 'MaDD', maDD);
    var ev = xepLoai360(db, maDD);
    var fee = db.fees.filter(function (f) { return f.MaDD === maDD && f.Nam === db.config.nam && f.TrangThai === 'Đã xác nhận'; })[0];
    var uom = find(db.uommam, 'MaDD', maDD);
    var badges = [];
    if (card && card.TrangThai === 'Đã cấp') badges.push({ ten: 'Thẻ Đoàn viên', mau: 'red' });
    if (fee) badges.push({ ten: 'Đoàn phí ' + db.config.nam, mau: 'green' });
    if (uom && uom.TrangThai === 'Đã duyệt') badges.push({ ten: 'Nguồn Cảm tình Đảng', mau: 'gold' });
    if (m.Diem >= 300) badges.push({ ten: 'Chiến sĩ thi đua', mau: 'blue' });
    return {
      maDD: m.MaDD, hoTen: m.HoTen, chucVu: m.ChucVu, maAp: m.MaAp,
      tenAp: tenDonVi(db, m), ngaySinh: m.NgaySinh, dienThoai: m.DienThoai,
      ngayVaoDoan: m.NgayVaoDoan || '', noiVaoDoan: m.NoiVaoDoan || '',
      ngaySinhHoatDoan: m.NgaySinhHoatDoan || '',
      diem: m.Diem, maThe: card ? card.MaThe : '', ngayCap: card ? card.NgayCap : '',
      hetHan: card ? card.HetHan : '', noiCapThe: card ? (card.NoiCapThe || '') : '',
      trangThaiThe: card ? card.TrangThai : 'Chưa cấp',
      xepLoai360: ev ? ev.XepLoai : 'Chưa tự đánh giá', badges: badges,
      tenXa: db.config.tenXa, nam: db.config.nam
    };
  };

  H['card.list'] = function (db, p, token) {
    var u = needUser(db, token);
    var maAp = isXa(u) ? (p.maAp || '') : u.MaAp;
    var items = db.users.filter(function (m) { return Number(m.Cap) === 4 && !isDeleted(m) && (!maAp || m.MaAp === maAp); })
      .map(function (m) {
        var c = find(db.cards, 'MaDD', m.MaDD);
        return { maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, diem: m.Diem, maThe: c ? c.MaThe : '', trangThai: c ? c.TrangThai : 'Chưa cấp' };
      });
    return { items: items, daCap: items.filter(function (i) { return i.trangThai === 'Đã cấp'; }).length };
  };

  H['card.issue'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m || isDeleted(m)) throw new Error('Không tìm thấy đoàn viên.');
    assertAp(u, m.MaAp);
    var c = find(db.cards, 'MaDD', m.MaDD);
    if (c && c.TrangThai === 'Đã cấp') throw new Error('Đoàn viên đã được tích hợp thẻ.');
    var count = db.cards.filter(function (x) { return x.MaAp === m.MaAp; }).length + 1;
    var maThe = 'TDV-' + db.config.nam + '-' + m.MaAp + '-' + ('0' + count).slice(-2);
    var ap = m.MaAp ? find(db.aps, 'MaAp', m.MaAp) : null;
    var noiCapThe = isXa(u)
      ? ('Ban Chấp hành Chi đoàn ' + db.config.tenXa)
      : ('Ban Chấp hành Chi đoàn ' + (ap ? ap.TenAp : m.MaAp));
    if (c) { c.TrangThai = 'Đã cấp'; c.NgayCap = now(); c.NoiCapThe = noiCapThe; }
    else db.cards.push({ MaThe: maThe, MaDD: m.MaDD, HoTen: m.HoTen, MaAp: m.MaAp, NgayCap: now(), HetHan: '31/12/' + db.config.nam, NoiCapThe: noiCapThe, TrangThai: 'Đã cấp', NguoiCap: u.MaDD });
    m.MaThe = c ? c.MaThe : maThe;
    var diemThe = diemCfg(db, 'the', 20);
    var tong = award(db, m, diemThe, 'Tích hợp Thẻ Đoàn viên', m.MaThe);
    save(db);
    return { maThe: m.MaThe, tongDiem: tong, message: 'Đã tích hợp Thẻ Đoàn viên (+' + diemThe + ' điểm).' };
  };

  H['eval.submit'] = function (db, p, token) {
    var u = needUser(db, token);
    var vals = [p.tuChinhTri, p.daoDuc, p.chuyenMon, p.congHien, p.kyLuat].map(Number);
    if (vals.some(function (v) { return !v || v < 1 || v > 5; })) throw new Error('Điểm mỗi tiêu chí phải từ 1 đến 5.');
    var tong = vals.reduce(function (a, b) { return a + b; }, 0);
    var xepLoai = tong >= 23 ? 'Hoàn thành xuất sắc' : tong >= 20 ? 'Hoàn thành tốt' : tong >= 15 ? 'Hoàn thành' : 'Chưa hoàn thành';
    db.evals = db.evals.filter(function (e) { return !(e.MaDD === u.MaDD && e.Nam === db.config.nam); });
    db.evals.push({
      MaDD: u.MaDD, Nam: db.config.nam, TuChinhTri: vals[0], DaoDuc: vals[1], ChuyenMon: vals[2],
      CongHien: vals[3], KyLuat: vals[4], TongDiem: tong, XepLoai: xepLoai, ThoiGian: now()
    });
    var daCong = db.diemLog.filter(function (l) { return l.MaDD === u.MaDD && l.Loai.indexOf('Tự đánh giá') === 0 && l.ThoiGian.indexOf(String(db.config.nam)) === 0; }).length;
    var diem = 0;
    if (!daCong) { diem = diemCfg(db, 'tuDanhGia', 10); award(db, u, diem, 'Tự đánh giá 360°', String(db.config.nam)); }
    save(db);
    return { tongDiem: tong, xepLoai: xepLoai, diemCong: diem, message: 'Kết quả: ' + xepLoai + ' (' + tong + '/25).' };
  };

  H['cert.issue'] = function (db, p, token) {
    var u = needUser(db, token);
    var c = find(db.cards, 'MaDD', u.MaDD);
    if (!c || c.TrangThai !== 'Đã cấp') throw new Error('Cần tích hợp Thẻ Đoàn viên trước khi cấp giấy chứng nhận số.');
    var maCert = uid('EC');
    var chuKy = hash10(u.MaDD + p.loai + now()) + hash10(now());
    db.certs.push({ MaCert: maCert, MaDD: u.MaDD, HoTen: u.HoTen, Loai: p.loai, NgayCap: now(), ChuKySo: chuKy });
    save(db);
    return {
      maCert: maCert, chuKySo: chuKy, ngayCap: now(), tenXa: db.config.tenXa,
      noiDung: 'Chứng nhận ' + u.HoTen + ' đã hoàn thành: ' + p.loai,
      message: 'Đã cấp Giấy chứng nhận số có chữ ký HMAC.'
    };
  };

  H['sos.list'] = function (db, p, token) {
    var u = needUser(db, token);
    var maAp = isXa(u) ? (p.maAp || '') : u.MaAp;
    var items = db.sos.filter(function (s) { return !maAp || s.MaAp === maAp; }).map(function (r) {
      return {
        maPA: r.MaPA, maDD: r.MaDD, hoTen: r.HoTen, maAp: r.MaAp, loai: r.Loai,
        noiDung: r.NoiDung, viDo: Number(r.ViDo), kinhDo: Number(r.KinhDo),
        diem: Number(r.Diem || 0), trangThai: r.TrangThai, maNV: r.MaNV, thoiGian: r.ThoiGian
      };
    }).reverse();
    var missions = db.missions.filter(function (m) { return !maAp || m.MaAp === maAp; }).map(function (r) {
      return {
        maNV: r.MaNV, tenNV: r.TenNV, maPA: r.MaPA, maAp: r.MaAp,
        viDo: Number(r.ViDo), kinhDo: Number(r.KinhDo), diem: Number(r.Diem || 15),
        trangThai: r.TrangThai, ngayTao: r.NgayTao,
        daCheckIn: db.diemLog.some(function (l) {
          return l.MaDD === u.MaDD && String(l.GhiChu).indexOf(r.MaNV) >= 0;
        })
      };
    }).reverse();
    return {
      items: items, missions: missions,
      thongKe: {
        tong: items.length,
        choDuyet: items.filter(function (i) { return i.TrangThai === 'Chờ duyệt'; }).length,
        daXuLy: items.filter(function (i) { return i.TrangThai === 'Hoàn thành' || i.TrangThai === 'Đã chuyển nhiệm vụ'; }).length
      }
    };
  };

  H['sos.create'] = function (db, p, token) {
    var u = needUser(db, token);
    if (!p.noiDung || p.noiDung.trim().length < 10) throw new Error('Vui lòng mô tả hiện trường tối thiểu 10 ký tự.');
    var today = now().slice(0, 10);
    var count = db.sos.filter(function (s) { return s.MaDD === u.MaDD && String(s.ThoiGian).slice(0, 10) === today; }).length;
    if (count >= 3) throw new Error('Mỗi đoàn viên gửi tối đa 3 phản ánh/ngày.');
    var diemSos = diemCfg(db, 'sos', 10);
    db.sos.push({
      MaPA: uid('PA'), MaDD: u.MaDD, HoTen: u.HoTen, MaAp: u.MaAp, Loai: p.loai,
      NoiDung: p.noiDung, ViDo: p.viDo || 10.532, KinhDo: p.kinhDo || 106.411,
      Diem: diemSos, TrangThai: 'Chờ duyệt', MaNV: '', ThoiGian: now()
    });
    award(db, u, diemSos, 'Phản ánh SOS', p.loai);
    save(db);
    return { diem: diemSos, message: 'Đã gửi phản ánh (+' + diemSos + ' điểm Dân vận khéo).' };
  };

  H['sos.toMission'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var s = find(db.sos, 'MaPA', p.maPA);
    if (!s) throw new Error('Không tìm thấy phản ánh.');
    assertAp(u, s.MaAp);
    if (s.MaNV) throw new Error('Phản ánh đã được chuyển thành nhiệm vụ.');
    var maNV = uid('NV');
    db.missions.push({ MaNV: maNV, TenNV: p.tenNV || ('Xử lý: ' + s.Loai), MaPA: s.MaPA, MaAp: s.MaAp, ViDo: s.ViDo, KinhDo: s.KinhDo, Diem: diemCfg(db, 'checkinNv', 15), TrangThai: 'Đang mở', NgayTao: now() });
    s.MaNV = maNV;
    s.TrangThai = 'Đã chuyển nhiệm vụ';
    save(db);
    return { maNV: maNV, message: 'Đã tạo nhiệm vụ tình nguyện trên bản đồ số.' };
  };

  H['mission.checkin'] = function (db, p, token) {
    var u = needUser(db, token);
    var nv = find(db.missions, 'MaNV', p.maNV);
    if (!nv) throw new Error('Không tìm thấy nhiệm vụ.');
    if (db.diemLog.some(function (l) { return l.MaDD === u.MaDD && String(l.GhiChu).indexOf(nv.MaNV) >= 0; })) {
      throw new Error('Bạn đã check-in nhiệm vụ này.');
    }
    var diem = nv.Diem || 15;
    var tong = award(db, u, diem, 'Check-in nhiệm vụ GPS', nv.MaNV + ' - ' + nv.TenNV);
    nv.TrangThai = 'Hoàn thành';
    save(db);
    return { diem: diem, tongDiem: tong, khoangCach: null, message: 'Check-in thành công (+' + diem + ' điểm).' };
  };

  H['quiz.list'] = function (db, p, token) {
    var u = needUser(db, token);
    var answered = {};
    db.quizResults.filter(function (r) { return r.MaDD === u.MaDD; }).forEach(function (r) { answered[r.MaCau] = r; });
    var items = db.quiz.map(function (q) {
      var a = answered[q.MaCau];
      return {
        maCau: q.MaCau, noiDung: q.NoiDung, chuDe: q.ChuDe, diem: q.Diem,
        A: q.A, B: q.B, C: q.C, D: q.D,
        daTraLoi: !!a, dung: a ? a.Dung : null,
        dapAnChon: a ? a.DapAnChon : '', dapAnDung: a ? q.DapAn : '',
        giaiThich: a ? q.GiaiThich : ''
      };
    });
    return {
      items: items, tongCau: items.length, daLam: Object.keys(answered).length,
      soDung: Object.keys(answered).filter(function (k) { return answered[k].Dung; }).length,
      diemCuaToi: u.Diem
    };
  };

  H['quiz.answer'] = function (db, p, token) {
    var u = needUser(db, token);
    var q = find(db.quiz, 'MaCau', p.maCau);
    if (!q) throw new Error('Không tìm thấy câu hỏi.');
    if (db.quizResults.some(function (r) { return r.MaDD === u.MaDD && r.MaCau === q.MaCau; })) {
      throw new Error('Bạn đã trả lời câu hỏi này.');
    }
    var dung = String(p.dapAn).toUpperCase() === q.DapAn;
    var diem = dung ? q.Diem : 0;
    db.quizResults.push({ MaDD: u.MaDD, MaCau: q.MaCau, DapAnChon: p.dapAn, Dung: dung, Diem: diem, ThoiGian: now() });
    if (dung) award(db, u, diem, 'Quiz Arena', q.MaCau);
    save(db);
    return {
      dung: dung, dapAnDung: q.DapAn, giaiThich: q.GiaiThich, diem: diem,
      message: dung ? 'Chính xác! +' + diem + ' điểm.' : 'Chưa chính xác. Đáp án đúng: ' + q.DapAn + '.'
    };
  };

  H['leaderboard'] = function (db) {
    var members = db.users.filter(function (m) { return Number(m.Cap) === 4 && !isDeleted(m); });
    var top = members.slice().sort(function (a, b) { return b.Diem - a.Diem; }).slice(0, 10)
      .map(function (m, i) { return { hang: i + 1, maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, diem: m.Diem }; });
    var aps = db.aps.map(function (a) {
      var list = members.filter(function (m) { return m.MaAp === a.MaAp; });
      return {
        maAp: a.MaAp, tenAp: a.TenAp, soDoanVien: list.length,
        diemTB: list.length ? Math.round(list.reduce(function (s, m) { return s + m.Diem; }, 0) / list.length) : 0
      };
    }).sort(function (a, b) { return b.diemTB - a.diemTB; });
    return { top: top, aps: aps, tongCauDung: db.quizResults.filter(function (r) { return r.Dung; }).length };
  };

  H['bot.ask'] = function (db, p, token) {
    var u = needUser(db, token);
    var text = String(p.text || '').trim();
    var up = text.toUpperCase();

    if (/^DIEM\s+/.test(up)) {
      var key = text.replace(/^diem\s+/i, '').trim();
      var m = find(db.users, 'MaDD', key) || db.users.filter(function (x) { return x.DienThoai === key; })[0];
      if (!m) return { reply: 'Không tìm thấy đoàn viên "' + key + '". Bạn kiểm tra lại Mã định danh hoặc số điện thoại nhé.' };
      if (!isXa(u) && m.MaAp !== u.MaAp && m.MaDD !== u.MaDD) return { reply: 'Bạn chỉ tra cứu được đoàn viên trong Chi đoàn Ấp của mình.' };
      var ev = xepLoai360(db, m.MaDD);
      return {
        reply: '📊 ' + m.HoTen + ' (' + m.MaDD + ' • ' + m.MaAp + ')\n• Điểm rèn luyện: ' + m.Diem + '/300\n' +
          '• Thẻ Đoàn viên: ' + (m.MaThe || 'Chưa cấp') + '\n• Tự đánh giá 360°: ' + (ev ? ev.XepLoai : 'Chưa thực hiện')
      };
    }
    if (up.indexOf('CANH BAO') >= 0) {
      var last = lastCheckin(db);
      var list = db.users.filter(function (m) {
        if (Number(m.Cap) !== 4 || isDeleted(m)) return false;
        if (isXa(u)) return true;
        if (isAp(u)) return m.MaAp === u.MaAp;
        return m.MaDD === u.MaDD;
      })
        .map(function (m) {
          var t = last[m.MaDD];
          return { hoTen: m.HoTen, maAp: m.MaAp, soNgay: t ? Math.floor((Date.now() - t) / 86400000) : 999 };
        }).filter(function (x) { return x.soNgay > 60; }).sort(function (a, b) { return b.soNgay - a.soNgay; }).slice(0, 6);
      if (!list.length) return { reply: '✅ Không có đoàn viên nào vắng quá 60 ngày.' };
      return { reply: '⚠️ ' + list.length + ' đoàn viên vắng > 60 ngày:\n' + list.map(function (x) { return '• ' + x.hoTen + ' (' + x.maAp + ') — ' + x.soNgay + ' ngày'; }).join('\n') };
    }
    if (up.indexOf('UOM MAM') >= 0) {
      var res = H['uommam.list'](db, {}, token);
      var du = res.items.filter(function (i) { return i.duDieuKien; });
      return { reply: du.length ? '🌱 Đủ điều kiện Ươm mầm Đỏ (' + du.length + '):\n' + du.map(function (x) { return '• ' + x.hoTen + ' — ' + x.diem + ' điểm'; }).join('\n') : '🌱 Chưa có đoàn viên nào đạt đủ 3 tiêu chuẩn.' };
    }
    if (up.indexOf('DOAN PHI') >= 0) {
      var fee = H['fee.my'](db, {}, token);
      return { reply: '💰 Đoàn phí năm ' + fee.nam + ': ' + fee.trangThai + '\n• Mức phí: 24.000đ/năm\n• Nội dung CK: ' + fee.noiDung };
    }
    if (up.indexOf('DIEM DANH') >= 0) {
      return { reply: '📍 Hướng dẫn điểm danh:\n1. Bí thư Chi đoàn Ấp mở phiên → chiếu QR động.\n2. Đoàn viên mở tab Điểm danh → quét camera.\n3. Mã đổi mỗi 60 giây.\n4. Trực tiếp +10đ • Hybrid +8đ • Zalo +5đ.' };
    }
    return { reply: '🤖 Trợ lý Chi đoàn số 6.0. Bạn có thể nhắn:\n• DIEM [Mã ĐV/SĐT]\n• CANH BAO\n• UOM MAM DO\n• DOAN PHI\n• DIEM DANH' };
  };

  H['bot.script'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var tenAp = tenDonVi(db, u);
    var tenXa = db.config.tenXa || 'Xã Tân Hòa';
    var t = Number(p.thoiLuong || 45);
    var lines = [
      'KỊCH BẢN ĐIỀU HÀNH SINH HOẠT CHI ĐOÀN',
      'Chủ đề: ' + (p.noiDung || 'Sinh hoạt Chi đoàn'),
      'Đơn vị: ' + (tenAp.indexOf(tenXa) >= 0 ? tenAp : tenAp + ' — ' + tenXa),
      'Thời lượng: ' + t + ' phút | Người điều hành: ' + u.HoTen,
      'Hình thức: Trực tiếp kết hợp Hybrid (50/50) qua Zalo/Google Meet',
      '',
      '[0–5 phút] Ổn định tổ chức',
      '   → Điểm danh QR động, tuyên bố lý do, giới thiệu đại biểu.',
      '[' + Math.round(t * 0.15) + '–' + Math.round(t * 0.3) + ' phút] Tổng kết công tác tháng',
      '   → Báo cáo điểm danh, đoàn phí, phong trào Dân vận khéo, chỉ tiêu đạt được.',
      '[' + Math.round(t * 0.3) + '–' + Math.round(t * 0.5) + ' phút] Triển khai nhiệm vụ mới',
      '   → Quán triệt nghị quyết, phân công nhiệm vụ, giao chỉ tiêu.',
      '[' + Math.round(t * 0.5) + '–' + Math.round(t * 0.7) + ' phút] Thảo luận & phát biểu',
      '   → Đoàn viên hiến kế, giải đáp vướng mắc, bình xét thi đua.',
      '[' + Math.round(t * 0.7) + '–' + Math.round(t * 0.9) + ' phút] Tuyên dương & Ươm mầm Đỏ',
      '   → Công bố điểm, tuyên dương tiêu biểu, đề cử nguồn Cảm tình Đảng.',
      '[' + Math.round(t * 0.9) + '–' + t + ' phút] Kết thúc',
      '   → Thông qua biên bản, kết luận chủ tọa, gửi biên bản số trong 24h.',
      '',
      'BƯỚC THỰC HIỆN TRÊN HỆ THỐNG:',
      '1. Mở phiên điểm danh QR trước giờ họp 10 phút.',
      '2. Đoàn viên đi làm xa chọn "Hybrid" để nhận +8 điểm.',
      '3. Kết thúc họp: bấm Kết thúc phiên, hệ thống tự tổng hợp điểm.',
      '4. Gửi kịch bản + biên bản vào nhóm Zalo trong 24 giờ.',
      '',
      'Người lập: ' + u.HoTen + ' — ' + u.ChucVu
    ];
    return { noiDung: lines.join('\n'), tieuDe: 'Kịch bản: ' + (p.noiDung || '') };
  };

  H['bot.minutes'] = function (db, p, token) {
    var u = needUser(db, token);
    assertCap(u, [1, 2, 3]);
    var m = find(db.users, 'MaDD', p.maDD);
    if (!m || isDeleted(m)) throw new Error('Không tìm thấy đoàn viên.');
    assertAp(u, m.MaAp);
    var ev = xepLoai360(db, m.MaDD);
    var ap = find(db.aps, 'MaAp', m.MaAp);
    var fee = db.fees.filter(function (f) { return f.MaDD === m.MaDD && f.TrangThai === 'Đã xác nhận'; })[0];
    var st = find(db.uommam, 'MaDD', m.MaDD);
    var lines = [
      'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
      'Độc lập – Tự do – Hạnh phúc',
      '',
      'BIÊN BẢN GIỚI THIỆU ĐOÀN VIÊN ƯU TÚ CHO ĐẢNG',
      'Năm ' + db.config.nam,
      '',
      'Hôm nay, tại ' + db.config.tenXa + ', Chi đoàn ' + (ap ? ap.TenAp : '') + ' tổ chức họp xét giới thiệu đoàn viên ưu tú cho Đảng.',
      '',
      'I. THÔNG TIN ĐOÀN VIÊN',
      '• Họ và tên: ' + m.HoTen + ' — Mã định danh: ' + m.MaDD,
      '• Chức vụ: ' + m.ChucVu + ' — Chi đoàn: ' + (ap ? ap.TenAp : ''),
      '• Thẻ Đoàn viên: ' + (m.MaThe || 'Chưa cấp'),
      '• Điểm rèn luyện: ' + m.Diem + '/300 điểm',
      '• Tự đánh giá 360°: ' + (ev ? ev.XepLoai + ' (' + ev.TongDiem + '/25)' : 'Chưa thực hiện'),
      '• Đoàn phí năm ' + db.config.nam + ': ' + (fee ? 'Đã hoàn thành' : 'Chưa hoàn thành'),
      '',
      'II. NHẬN XÉT CỦA CHI ĐOÀN',
      (st && st.NhanXet) ? st.NhanXet : 'Đoàn viên có lập trường tư tưởng vững vàng, đạo đức lối sống lành mạnh, tích cực tham gia phong trào tình nguyện và chuyển đổi số tại địa phương.',
      '',
      'III. KẾT LUẬN',
      'Chi đoàn thống nhất giới thiệu đồng chí ' + m.HoTen + ' vào nguồn phát triển Đảng, trình Bí thư Chi bộ Xã xem xét.',
      '',
      'Người lập biên bản: ' + u.HoTen + '          Bí thư Chi đoàn: ' + (ap ? ap.BiThu : '')
    ];
    return { noiDung: lines.join('\n'), tieuDe: 'Biên bản giới thiệu ' + m.HoTen };
  };

  /* --------------------------- QUẢN TRỊ CẤP 0 --------------------------- */

  var CFG_META = [
    { khoa: 'TEN_XA', field: 'tenXa', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Tên địa phương' },
    { khoa: 'TEN_CHI_BO', field: 'tenChiBo', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Tên đầy đủ của đơn vị cấp xã' },
    { khoa: 'BI_THU_XA', field: 'biThuXa', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Chủ tịch Ủy ban Hội LHTN Việt Nam Xã' },
    { khoa: 'PHO_BI_THU_XA', field: 'phoBiThuXa', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Bí thư Chi bộ Xã' },
    { khoa: 'DIEN_THOAI_XA', field: 'dienThoaiXa', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Điện thoại liên hệ' },
    { khoa: 'DIA_CHI_XA', field: 'diaChiXa', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Địa chỉ trụ sở' },
    { khoa: 'EMAIL_XA', field: 'emailXa', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Email liên hệ' },
    { khoa: 'NGAY_THANH_LAP', field: 'ngayThanhLap', nhom: 'Thông tin đơn vị', kieu: 'text', moTa: 'Ngày thành lập Chi đoàn Xã' },

    { khoa: 'DIEM_HOP_TRUC_TIEP', diemKey: 'hopTrucTiep', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm danh họp trực tiếp' },
    { khoa: 'DIEM_BAO_CAO_HYBRID', diemKey: 'hybrid', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm báo cáo Hybrid' },
    { khoa: 'DIEM_KET_NOI_ZALO', diemKey: 'zalo', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm kết nối lại qua Zalo' },
    { khoa: 'DIEM_UOM_MAM', diemKey: 'uomMam', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm khi được duyệt Ươm mầm Đỏ' },
    { khoa: 'DIEM_DOAN_PHI', diemKey: 'doanPhi', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm hoàn thành đoàn phí năm' },
    { khoa: 'DIEM_TICH_HOP_THE', diemKey: 'the', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm tích hợp Thẻ Đoàn viên' },
    { khoa: 'DIEM_TU_DANH_GIA', diemKey: 'tuDanhGia', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm tự đánh giá 360°' },
    { khoa: 'DIEM_SOS', diemKey: 'sos', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm gửi phản ánh SOS' },
    { khoa: 'DIEM_CHECKIN_NV', diemKey: 'checkinNv', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm check-in nhiệm vụ GPS' },
    { khoa: 'DIEM_QUIZ', diemKey: 'quiz', nhom: 'Điểm thưởng', kieu: 'number', moTa: 'Điểm mỗi câu trắc nghiệm đúng' },

    { khoa: 'MUC_TIEU_DIEM', field: 'mucTieuDiem', nhom: 'Học tập & đoàn phí', kieu: 'number', moTa: 'Mức điểm rèn luyện/năm để xét Ươm mầm Đỏ' },
    { khoa: 'DOAN_PHI_NAM', field: 'doanPhiNam', nhom: 'Học tập & đoàn phí', kieu: 'number', moTa: 'Mức đoàn phí chuẩn/năm' },
    { khoa: 'NAM_CONG_TAC', field: 'nam', nhom: 'Học tập & đoàn phí', kieu: 'number', moTa: 'Năm công tác' },

    { khoa: 'BANK_ID', field: 'bankId', nhom: 'Thanh toán VietQR', kieu: 'text', moTa: 'Mã ngân hàng (MB, VCB, ICB, TCB...)' },
    { khoa: 'BANK_ACC', field: 'bankAcc', nhom: 'Thanh toán VietQR', kieu: 'text', moTa: 'Số tài khoản nhận đoàn phí' },
    { khoa: 'BANK_NAME', field: 'bankName', nhom: 'Thanh toán VietQR', kieu: 'text', moTa: 'Tên chủ tài khoản' }
  ];

  function cfgMeta(khoa) {
    for (var i = 0; i < CFG_META.length; i++) if (CFG_META[i].khoa === khoa) return CFG_META[i];
    return null;
  }
  function cfgValue(db, m) {
    if (m.diemKey) {
      var d = db.config.diem || {};
      return d[m.diemKey] === undefined ? '' : d[m.diemKey];
    }
    return db.config[m.field] === undefined ? '' : db.config[m.field];
  }
  function cfgItems(db) {
    return CFG_META.map(function (m) {
      return { khoa: m.khoa, giaTri: cfgValue(db, m), moTa: m.moTa, nhom: m.nhom, kieu: m.kieu };
    });
  }

  H['admin.summary'] = function (db, p, token) {
    needAdmin(db, token);
    var active = activeUsers(db);
    var members = active.filter(function (u) { return Number(u.Cap) === 4; });
    var accounts = active.filter(function (u) { return Number(u.Cap) > 0; });
    var logs = (db.logs || []).slice().sort(function (a, b) { return String(b.ThoiGian).localeCompare(String(a.ThoiGian)); });
    return {
      phienBan: '6.0', soAp: db.aps.length, soDoanVien: members.length,
      soTaiKhoan: accounts.length,
      soCanBo: active.filter(function (u) { return Number(u.Cap) >= 1 && Number(u.Cap) <= 3; }).length,
      soHoatDong: active.filter(function (u) { return u.TrangThai === 'Đang hoạt động'; }).length,
      soNhatKy: logs.length,
      logs: logs.slice(0, 6).map(function (r) {
        var u = find(db.users, 'MaDD', r.MaDD);
        return { maDD: r.MaDD, hoTen: u ? u.HoTen : r.MaDD, hanhDong: r.HanhDong, chiTiet: r.ChiTiet, thoiGian: r.ThoiGian };
      })
    };
  };

  H['admin.ap.list'] = function (db, p, token) {
    needAdmin(db, token);
    var active = activeUsers(db);
    return {
      items: db.aps.map(function (a) {
        var list = active.filter(function (u) { return u.MaAp === a.MaAp; });
        var biThu = find(active, 'MaDD', a.BiThu);
        return {
          maAp: a.MaAp, tenAp: a.TenAp, biThu: a.BiThu || '', biThuTen: biThu ? biThu.HoTen : '',
          chiTieu: Number(a.ChiTieu || 0), ghiChu: a.GhiChu || '',
          soDoanVien: list.filter(function (u) { return Number(u.Cap) === 4; }).length,
          soTaiKhoan: list.length
        };
      })
    };
  };

  H['admin.ap.save'] = function (db, p, token) {
    var u = needAdmin(db, token);
    var maAp = String(p.maAp || '').trim().toUpperCase();
    var tenAp = String(p.tenAp || '').trim();
    var biThu = String(p.biThu || '').trim().toUpperCase();
    var chiTieu = p.chiTieu === undefined || p.chiTieu === '' ? 0 : Number(p.chiTieu);
    var ghiChu = String(p.ghiChu || '').trim();
    if (!tenAp) throw new Error('Vui lòng nhập tên Ấp / Chi đoàn Ấp.');
    if (!isFinite(chiTieu) || chiTieu < 0) throw new Error('Chỉ tiêu phải là số không âm.');
    if (db.aps.some(function (a) { return a.TenAp.trim().toLowerCase() === tenAp.toLowerCase() && a.MaAp !== maAp; })) {
      throw new Error('Tên Ấp "' + tenAp + '" đã tồn tại.');
    }
    var target = null;
    if (biThu) {
      target = find(db.users, 'MaDD', biThu);
      if (!target) throw new Error('Không tìm thấy tài khoản Bí thư "' + biThu + '".');
      if (Number(target.Cap) !== 3) throw new Error('Bí thư Chi đoàn Ấp phải là tài khoản Cấp 3.');
      if (target.MaAp && target.MaAp !== maAp) throw new Error('Tài khoản ' + biThu + ' đang thuộc ' + target.MaAp + '.');
    }
    var isNew = !maAp;
    if (isNew) {
      var max = 0;
      db.aps.forEach(function (a) { var m = String(a.MaAp).match(/^AP(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
      maAp = 'AP' + ('0' + (max + 1)).slice(-2);
    }
    var existing = find(db.aps, 'MaAp', maAp);
    if (!isNew && !existing) throw new Error('Không tìm thấy Ấp cần cập nhật.');
    if (existing) Object.assign(existing, { TenAp: tenAp, BiThu: biThu, ChiTieu: chiTieu, GhiChu: ghiChu });
    else db.aps.push({ MaAp: maAp, TenAp: tenAp, BiThu: biThu, ChiTieu: chiTieu, GhiChu: ghiChu });
    if (target) target.MaAp = maAp;
    mlog(db, u.MaDD, isNew ? 'THÊM ẤP' : 'CẬP NHẬT ẤP', maAp + ' - ' + tenAp);
    save(db);
    return { maAp: maAp, message: (isNew ? 'Đã thêm ' : 'Đã cập nhật ') + tenAp + ' (' + maAp + ').' };
  };

  H['admin.ap.delete'] = function (db, p, token) {
    var u = needAdmin(db, token);
    var maAp = String(p.maAp || '').trim().toUpperCase();
    var ap = find(db.aps, 'MaAp', maAp);
    if (!ap) throw new Error('Không tìm thấy Ấp cần xóa.');
    var soNguoi = activeUsers(db).filter(function (x) { return x.MaAp === maAp; }).length;
    if (soNguoi > 0) throw new Error('Không thể xóa ' + ap.TenAp + ': còn ' + soNguoi + ' tài khoản đang thuộc Ấp này.');
    db.aps = db.aps.filter(function (x) { return x.MaAp !== maAp; });
    mlog(db, u.MaDD, 'XÓA ẤP', maAp + ' - ' + ap.TenAp);
    save(db);
    return { message: 'Đã xóa ' + ap.TenAp + ' (' + maAp + ').' };
  };

  H['admin.config.list'] = function (db, p, token) {
    needAdmin(db, token);
    return { items: cfgItems(db) };
  };

  H['admin.config.save'] = function (db, p, token) {
    var u = needAdmin(db, token);
    var items = p.items;
    if (!items && p.khoa) items = [{ khoa: p.khoa, giaTri: p.giaTri }];
    if (!items || !items.length) throw new Error('Không có cấu hình nào để lưu.');
    var normalized = items.map(function (it) {
      var m = cfgMeta(String(it.khoa || '').trim());
      if (!m) throw new Error('Khóa cấu hình không hợp lệ: ' + it.khoa);
      var val = String(it.giaTri === undefined || it.giaTri === null ? '' : it.giaTri).trim();
      if (m.kieu === 'number') {
        if (val === '' || !isFinite(Number(val)) || Number(val) < 0) throw new Error(m.moTa + ' phải là số không âm.');
        if (m.khoa === 'NAM_CONG_TAC' && (Number(val) < 2020 || Number(val) > 2100)) throw new Error('Năm công tác phải trong khoảng 2020–2100.');
        val = String(Number(val));
      }
      if ((m.khoa === 'TEN_XA' || m.khoa === 'TEN_CHI_BO') && !val) throw new Error(m.moTa + ' không được để trống.');
      return { m: m, val: val };
    });
    normalized.forEach(function (it) {
      if (it.m.diemKey) {
        db.config.diem = db.config.diem || {};
        db.config.diem[it.m.diemKey] = it.m.kieu === 'number' ? Number(it.val) : it.val;
      } else {
        db.config[it.m.field] = it.m.kieu === 'number' ? Number(it.val) : it.val;
      }
    });
    mlog(db, u.MaDD, 'CẬP NHẬT CẤU HÌNH', normalized.map(function (x) { return x.m.khoa; }).join(', '));
    save(db);
    return { message: 'Đã lưu ' + normalized.length + ' cấu hình hệ thống.', items: cfgItems(db) };
  };

  H['admin.account.list'] = function (db, p, token) {
    needAdmin(db, token);
    var q = String(p.q || '').trim().toLowerCase();
    var trash = isTrue(p.daXoa);
    return {
      items: db.users.filter(function (u) {
        if (isDeleted(u) !== trash) return false;
        if (!q) return true;
        return [u.MaDD, u.HoTen, u.DienThoai, u.ChucVu].join(' ').toLowerCase().indexOf(q) >= 0;
      }).map(function (u) {
        return {
          maDD: u.MaDD, hoTen: u.HoTen, cap: Number(u.Cap), chucVu: u.ChucVu,
          maAp: u.MaAp || '', tenAp: tenDonVi(db, u),
          dienThoai: u.DienThoai || '', ngaySinh: u.NgaySinh || '', ghiChu: u.GhiChu || '',
          trangThai: u.TrangThai || '', diem: Number(u.Diem || 0),
          coMatKhau: !!u.MatKhauHash, batDoiMatKhau: isTrue(u.BatDoiMatKhau),
          batDoiPin: isTrue(u.BatDoiPin), daXoa: isDeleted(u),
          ngayXoa: u.NgayXoa || '', nguoiXoa: u.NguoiXoa || ''
        };
      }).sort(function (a, b) {
        return a.cap !== b.cap ? a.cap - b.cap : String(a.hoTen).localeCompare(String(b.hoTen));
      })
    };
  };

  H['admin.account.restore'] = H['member.restore'];

  H['admin.account.create'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var maDD = String(p.maDD || '').trim().toUpperCase();
    var hoTen = String(p.hoTen || '').trim();
    var cap = Number(p.cap);
    var maAp = String(p.maAp || '').trim().toUpperCase();
    var dienThoai = String(p.dienThoai || '').trim();
    if (!/^[A-Z0-9_]{3,20}$/.test(maDD)) throw new Error('Mã định danh chỉ gồm chữ, số, gạch dưới (3–20 ký tự).');
    if (!hoTen) throw new Error('Vui lòng nhập họ tên.');
    if ([1, 2, 3, 4].indexOf(cap) < 0) throw new Error('Cấp tài khoản phải là 1, 2, 3 hoặc 4.');
    if (find(db.users, 'MaDD', maDD)) throw new Error('Mã định danh ' + maDD + ' đã tồn tại.');
    if (dienThoai && !/^0\d{9}$/.test(dienThoai)) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');
    var ap = null;
    if (cap === 1 || cap === 2) maAp = '';
    else {
      if (!maAp) throw new Error('Vui lòng chọn Ấp cho tài khoản.');
      ap = find(db.aps, 'MaAp', maAp);
      if (!ap) throw new Error('Không tìm thấy Ấp ' + maAp + '.');
    }
    var chucVu = cap === 1 ? 'Chủ Tịch' : cap === 2 ? 'Bí thư Chi bộ Xã' : cap === 3 ? ('Bí thư Chi đoàn ' + (ap ? ap.TenAp : maAp)) : 'Đoàn viên';
    db.users.push({
      MaDD: maDD, HoTen: hoTen, Cap: cap, ChucVu: chucVu, MaAp: maAp,
      DienThoai: dienThoai, NgaySinh: p.ngaySinh || '',
      NgayVaoDoan: '', NoiVaoDoan: ap ? ('Chi đoàn ' + ap.TenAp) : '',
      NgaySinhHoatDoan: cap === 4 ? 'Ngày 25 hằng tháng' : 'Ngày 20 hằng tháng',
      PIN: '', PINHash: hashPin(maDD, '123456'), BatDoiPin: true,
      SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
      Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '',
      UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: now(), GhiChu: 'Tạo bởi ' + admin.MaDD,
      MatKhauHash: '', BatDoiMatKhau: false,
      DaXoa: false, NgayXoa: '', NguoiXoa: ''
    });
    if (cap === 3 && ap && !ap.BiThu) ap.BiThu = maDD;
    mlog(db, admin.MaDD, 'TẠO TÀI KHOẢN', maDD + ' - ' + hoTen + ' (Cấp ' + cap + ')');
    save(db);
    return { maDD: maDD, message: 'Đã tạo tài khoản ' + maDD + ' (PIN mặc định 123456 — buộc đổi khi đăng nhập).' };
  };

  H['admin.account.update'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var target = find(db.users, 'MaDD', String(p.maDD || '').trim());
    if (!target) throw new Error('Không tìm thấy tài khoản.');
    if (isDeleted(target)) throw new Error('Tài khoản đang nằm trong thùng rác. Hãy khôi phục trước.');
    var hoTen = String(p.hoTen || '').trim();
    if (!hoTen) throw new Error('Vui lòng nhập họ tên.');
    var dienThoai = String(p.dienThoai || '').trim();
    if (dienThoai && !/^0\d{9}$/.test(dienThoai)) throw new Error('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).');

    var oldName = String(target.HoTen || '').trim();
    target.HoTen = hoTen;
    target.DienThoai = dienThoai;
    target.NgaySinh = String(p.ngaySinh || '').trim();
    target.GhiChu = String(p.ghiChu || '').trim();

    var cap = Number(target.Cap);
    if (oldName !== hoTen) {
      if (cap === 1 && String(db.config.biThuXa || '').trim() === oldName) db.config.biThuXa = hoTen;
      if (cap === 2 && String(db.config.phoBiThuXa || '').trim() === oldName) db.config.phoBiThuXa = hoTen;
    }
    mlog(db, admin.MaDD, 'CẬP NHẬT TÀI KHOẢN', target.MaDD + ' - ' + oldName + ' → ' + hoTen);
    save(db);
    return { maDD: target.MaDD, message: 'Đã cập nhật thông tin ' + hoTen + '.' };
  };

  H['admin.account.status'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var target = find(db.users, 'MaDD', p.maDD);
    if (!target) throw new Error('Không tìm thấy tài khoản.');
    if (isDeleted(target)) throw new Error('Tài khoản đang nằm trong thùng rác. Hãy khôi phục trước.');
    if (isAdmin(target)) throw new Error('Không thể khóa tài khoản quản trị hệ thống.');
    var status = String(p.trangThai || '').trim();
    if (['Đang hoạt động', 'Tạm khóa'].indexOf(status) < 0) throw new Error('Trạng thái không hợp lệ.');
    if (status === 'Tạm khóa' && (Number(target.Cap) === 1 || Number(target.Cap) === 2)) {
      var conLai = db.users.filter(function (u) {
        return Number(u.Cap) === Number(target.Cap) && u.MaDD !== target.MaDD &&
          !isDeleted(u) && u.TrangThai === 'Đang hoạt động';
      }).length;
      if (!conLai) throw new Error('Không thể khóa ' + (Number(target.Cap) === 1 ? 'Chủ tịch Hội LHTN Xã' : 'Bí thư Chi bộ Xã') + ' cuối cùng đang hoạt động.');
    }
    target.TrangThai = status;
    if (status === 'Tạm khóa') {
      target.TokenVersion = Number(target.TokenVersion || 0) + 1;
      target.SoLanSai = 0;
      target.KhoaDen = '';
      revokeTokens(db, target.MaDD);
    } else {
      target.SoLanSai = 0;
      target.KhoaDen = '';
    }
    mlog(db, admin.MaDD, status === 'Tạm khóa' ? 'KHÓA TÀI KHOẢN' : 'MỞ KHÓA TÀI KHOẢN', target.MaDD + ' - ' + target.HoTen);
    save(db);
    return { message: (status === 'Tạm khóa' ? 'Đã khóa ' : 'Đã mở khóa ') + target.HoTen + '.' };
  };

  H['admin.account.resetPin'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var target = find(db.users, 'MaDD', p.maDD);
    if (!target) throw new Error('Không tìm thấy tài khoản.');
    if (isDeleted(target)) throw new Error('Tài khoản đang nằm trong thùng rác. Hãy khôi phục trước.');
    if (isAdmin(target)) throw new Error('Tài khoản quản trị dùng mật khẩu chữ, không dùng PIN.');
    var pin = randPin();
    setPin(target, pin, true);
    revokeTokens(db, target.MaDD);
    mlog(db, admin.MaDD, 'CẤP LẠI PIN', target.MaDD + ' - ' + target.HoTen);
    save(db);
    return { pin: pin, message: 'Đã cấp PIN mới cho ' + target.HoTen + '. Người dùng phải đổi PIN khi đăng nhập.' };
  };

  /* ------------------- SAO LƯU & ĐỐI SOÁT ĐIỂM ------------------- */

  H['admin.backup.list'] = function (db, p, token) {
    needAdmin(db, token);
    var items = (db.backups || []).slice().sort(function (a, b) {
      return String(b.luc).localeCompare(String(a.luc));
    });
    return {
      items: items.slice(0, 50),
      lanCuoi: db.config.lanSaoLuuCuoi || '',
      soBanGiuLai: Number(db.config.soBanSaoLuu || 30)
    };
  };

  H['admin.backup.now'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var luc = now();
    var ten = 'CD6_Backup_' + luc.replace(/[-: ]/g, '') + '.xlsx';
    var item = { id: uid('BK'), ten: ten, luc: luc, size: JSON.stringify(db).length, url: '#' };
    db.backups.push(item);
    var giu = Math.max(1, Number(db.config.soBanSaoLuu || 30));
    db.backups.sort(function (a, b) { return String(a.luc).localeCompare(String(b.luc)); });
    while (db.backups.length > giu) db.backups.shift();
    db.config.lanSaoLuuCuoi = luc;
    mlog(db, admin.MaDD, 'SAO LƯU DỮ LIỆU', ten);
    save(db);
    return { id: item.id, ten: ten, luc: luc, folder: 'CD6_Backup', url: '#', message: 'Đã sao lưu bảng tính: ' + ten };
  };

  H['admin.backup.verify'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var f = find(db.backups || [], 'id', p.id);
    if (!f) throw new Error('Không tìm thấy bản sao lưu trong thư mục CD6_Backup.');
    mlog(db, admin.MaDD, 'KIỂM TRA SAO LƯU', f.ten + ' — hợp lệ');
    save(db);
    return {
      id: f.id, ten: f.ten, luc: f.luc, size: f.size,
      soSheet: SCHEMA_TABLES.length, thieu: [], hopLe: true,
      message: 'Bản sao lưu hợp lệ: ' + SCHEMA_TABLES.length + ' sheet, đủ ' + SCHEMA_TABLES.length + ' bảng nghiệp vụ.'
    };
  };

  H['admin.backup.restoreCopy'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    if (String(p.xacNhan || '').trim().toUpperCase() !== 'PHUC HOI') {
      throw new Error('Nhập đúng "PHUC HOI" để xác nhận tạo bản phục hồi.');
    }
    var f = find(db.backups || [], 'id', p.id);
    if (!f) throw new Error('Không tìm thấy bản sao lưu trong thư mục CD6_Backup.');
    var ten = 'CD6_Restore_' + now().replace(/[-: ]/g, '');
    var item = { id: uid('RS'), ten: ten, luc: now(), size: f.size, url: '#', nguon: f.ten };
    db.restores = db.restores || [];
    db.restores.push(item);
    while (db.restores.length > 30) db.restores.shift();
    mlog(db, admin.MaDD, 'PHỤC HỒI SAO LƯU', 'Tạo bản phục hồi từ ' + f.ten + ' — dữ liệu đang chạy không đổi');
    save(db);
    return {
      id: item.id, ten: ten, url: '#', soSheet: SCHEMA_TABLES.length, nguon: f.ten,
      message: 'Đã tạo bản phục hồi "' + ten + '" trong thư mục CD6_Restore. ' +
        'Dữ liệu đang chạy KHÔNG bị thay đổi; hãy kiểm tra bản phục hồi trước khi chuyển đổi.'
    };
  };

  H['admin.reconcile'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    var logSum = {};
    db.diemLog.forEach(function (r) { logSum[r.MaDD] = Number(logSum[r.MaDD] || 0) + Number(r.Diem || 0); });
    var lech = [];
    var daKiemTra = 0;
    db.users.forEach(function (m) {
      if (isDeleted(m)) return;
      daKiemTra++;
      var tong = Number(logSum[m.MaDD] || 0);
      var nenTrong = (m.DiemNen === undefined || m.DiemNen === null || m.DiemNen === '');
      var nen = nenTrong ? (Number(m.Diem || 0) - tong) : Number(m.DiemNen || 0);
      var dung = nen + tong;
      var hienTai = Number(m.Diem || 0);
      if (nenTrong) m.DiemNen = nen;
      if (dung !== hienTai) {
        m.Diem = dung;
        lech.push({ maDD: m.MaDD, hoTen: m.HoTen, truoc: hienTai, sau: dung, chenh: dung - hienTai });
      }
    });
    mlog(db, admin.MaDD, 'ĐỐI SOÁT ĐIỂM', 'Kiểm tra ' + daKiemTra + ' tài khoản, sửa ' + lech.length + ' bản ghi lệch');
    save(db);
    return {
      soTaiKhoan: daKiemTra, soLech: lech.length,
      chiTiet: lech.slice(0, 50),
      message: lech.length
        ? ('Đã đối soát ' + daKiemTra + ' tài khoản, điều chỉnh ' + lech.length + ' bản ghi lệch điểm.')
        : ('Đã đối soát ' + daKiemTra + ' tài khoản. Toàn bộ điểm khớp với sổ điểm.')
    };
  };

  H['admin.logs'] = function (db, p, token) {
    needAdmin(db, token);
    var limit = Math.min(Math.max(Number(p.limit || 100), 1), 500);
    var q = String(p.q || '').trim().toLowerCase();
    var nameOf = {};
    db.users.forEach(function (u) { nameOf[u.MaDD] = u.HoTen; });
    var all = (db.logs || []).slice().sort(function (a, b) { return String(b.ThoiGian).localeCompare(String(a.ThoiGian)); });
    var filtered = all.filter(function (r) {
      if (!q) return true;
      return [r.MaDD, nameOf[r.MaDD] || '', r.HanhDong, r.ChiTiet].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    return {
      tong: filtered.length,
      items: filtered.slice(0, limit).map(function (r) {
        return { maDD: r.MaDD, hoTen: nameOf[r.MaDD] || r.MaDD, hanhDong: r.HanhDong, chiTiet: r.ChiTiet, thoiGian: r.ThoiGian };
      })
    };
  };

  /* --------------------------- BÁO CÁO & NHẮC VIỆC --------------------------- */

  function parseAnyDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    }
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    }
    var d = new Date(s.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }

  function reportScope(p) {
    p = p || {};
    var maAp = String(p.maAp || '').trim().toUpperCase();
    var tu = parseAnyDate(p.tuNgay) || new Date(new Date().getFullYear(), 0, 1, 0, 0, 0, 0);
    var den = parseAnyDate(p.denNgay) || new Date();
    den = new Date(den.getTime());
    den.setHours(23, 59, 59, 999);
    if (tu.getTime() > den.getTime()) throw new Error('Từ ngày phải trước hoặc bằng đến ngày.');
    return { maAp: maAp, tu: tu, den: den };
  }

  function reportInRange(thoiGian, tu, den) {
    var d = parseAnyDate(thoiGian);
    if (!d) return false;
    return d.getTime() >= tu.getTime() && d.getTime() <= den.getTime();
  }

  function reportMatchesAp(row, maAp) {
    return !maAp || String(row.MaAp || '') === maAp;
  }

  function fmtD(d) {
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtDT(d) {
    return fmtD(d) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  function notifyLoaiMap() {
    return {
      tatCa: 'Toàn bộ đoàn viên',
      chuaDongPhi: 'Đoàn viên chưa đóng phí',
      choDuyet: 'Hồ sơ Ươm mầm Đỏ chờ duyệt',
      canBo: 'Cán bộ Cấp 1–3'
    };
  }

  function notifyRecipients(db, loai, maAp) {
    var paid = feePaid(db, Number(db.config.nam || 2026));
    var out = [];
    if (loai === 'choDuyet') {
      (db.uommam || []).forEach(function (r) {
        if (String(r.TrangThai) !== 'Chờ duyệt') return;
        if (maAp && String(r.MaAp) !== maAp) return;
        var m = find(db.users, 'MaDD', r.MaDD) || {};
        out.push({ maDD: r.MaDD, hoTen: r.HoTen || m.HoTen || '', maAp: r.MaAp || m.MaAp || '', dienThoai: m.DienThoai || '' });
      });
      return out;
    }
    (db.users || []).forEach(function (m) {
      if (isDeleted(m)) return;
      var cap = Number(m.Cap);
      if (loai === 'canBo') { if (cap < 1 || cap > 3) return; }
      else { if (cap !== 4) return; }
      if (maAp && String(m.MaAp) !== maAp) return;
      if (loai === 'chuaDongPhi' && paid[m.MaDD]) return;
      out.push({ maDD: m.MaDD, hoTen: m.HoTen, maAp: m.MaAp, dienThoai: m.DienThoai || '' });
    });
    return out;
  }

  function notifyMau(db, loai) {
    var xa = db.config.tenXa || 'Xã Tân Hòa';
    if (loai === 'chuaDongPhi') {
      return 'Thông báo: Chi đoàn ' + xa + ' nhắc các đoàn viên chưa hoàn thành đoàn phí năm ' +
        Number(db.config.nam || 2026) + ' đóng phí theo quy định (' +
        Number(db.config.doanPhiNam || 24000).toLocaleString('vi-VN') + 'đ/năm). Trân trọng cảm ơn.';
    }
    if (loai === 'choDuyet') {
      return 'Thông báo: Hồ sơ Ươm mầm Đỏ của bạn đang chờ duyệt. Vui lòng theo dõi kết quả trên ứng dụng Chi đoàn số 6.0.';
    }
    if (loai === 'canBo') {
      return 'Thông báo: Đề nghị cán bộ Chi đoàn ' + xa + ' rà soát dữ liệu và hoàn thành nhiệm vụ được phân công trong tháng.';
    }
    return 'Thông báo sinh hoạt Chi đoàn ' + xa + ': đề nghị đoàn viên tham dự đầy đủ và đúng giờ.';
  }

  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csvText(headers, rows) {
    return '\uFEFF' + [headers].concat(rows).map(function (r) {
      return r.map(csvCell).join(',');
    }).join('\r\n');
  }

  H['system.health'] = function (db, p, token) {
    needAdmin(db, token);
    var items = [];
    items.push({
      ten: 'Cấu trúc bảng tính', trangThai: 'ok',
      chiTiet: SCHEMA_TABLES.length + ' sheet, đủ ' + SCHEMA_TABLES.length + ' bảng'
    });
    items.push({
      ten: 'Phiên bản lược đồ', trangThai: 'ok',
      chiTiet: 'Đang dùng ' + SCHEMA_VERSION + ' / mới nhất ' + SCHEMA_VERSION
    });
    items.push({ ten: 'Sao lưu tự động', trangThai: 'ok', chiTiet: 'Trigger hằng ngày đã bật (mô phỏng)' });
    items.push({
      ten: 'Thư mục sao lưu Drive', trangThai: 'ok',
      chiTiet: (db.backups || []).length + ' bản sao lưu khả dụng'
    });
    var canKeys = ['TEN_XA', 'NAM_CONG_TAC', 'MUC_TIEU_DIEM', 'DOAN_PHI_NAM', 'BANK_ID', 'BANK_ACC', 'PHIEN_BAN_CAU_HINH'];
    var c = {
      TEN_XA: db.config.tenXa, NAM_CONG_TAC: db.config.nam, MUC_TIEU_DIEM: db.config.mucTieuDiem,
      DOAN_PHI_NAM: db.config.doanPhiNam, BANK_ID: db.config.bankId, BANK_ACC: db.config.bankAcc,
      PHIEN_BAN_CAU_HINH: configVersion(db)
    };
    var thieuCfg = canKeys.filter(function (k) { return !c[k]; });
    items.push({
      ten: 'Cấu hình bắt buộc', trangThai: thieuCfg.length ? 'canhBao' : 'ok',
      chiTiet: thieuCfg.length ? ('Thiếu: ' + thieuCfg.join(', ')) : 'Đủ tham số vận hành'
    });
    var adminCount = 0, memberCount = 0;
    (db.users || []).forEach(function (m) {
      if (isDeleted(m)) return;
      if (Number(m.Cap) === 0) adminCount++;
      if (Number(m.Cap) === 4) memberCount++;
    });
    items.push({
      ten: 'Tài khoản quản trị', trangThai: adminCount > 0 ? 'ok' : 'loi',
      chiTiet: adminCount + ' tài khoản Cấp 0 · ' + memberCount + ' đoàn viên'
    });
    items.push({ ten: 'Khóa ký phiên', trangThai: 'ok', chiTiet: 'Đã cấu hình SECRET trong Script Properties (mô phỏng)' });
    var soLoi = items.filter(function (x) { return x.trangThai === 'loi'; }).length;
    var soCanhBao = items.filter(function (x) { return x.trangThai === 'canhBao'; }).length;
    return {
      trangThai: soLoi ? 'loi' : (soCanhBao ? 'canhBao' : 'ok'),
      phienBanSchema: SCHEMA_VERSION,
      phienBanApDung: SCHEMA_VERSION,
      soSheet: SCHEMA_TABLES.length,
      thieuSheet: [],
      thuaSheet: [],
      soBanSaoLuu: (db.backups || []).length,
      lanSaoLuuCuoi: db.config.lanSaoLuuCuoi || '',
      adminCount: adminCount,
      memberCount: memberCount,
      kiemTra: items,
      message: soLoi ? ('Có ' + soLoi + ' lỗi cần xử lý ngay.')
        : (soCanhBao ? ('Hệ thống chạy được nhưng có ' + soCanhBao + ' cảnh báo.') : 'Hệ thống khỏe, cấu trúc và sao lưu đầy đủ.')
    };
  };

  H['report.summary'] = function (db, p, token) {
    needAdmin(db, token);
    var sc = reportScope(p);
    var members = (db.users || []).filter(function (m) {
      return !isDeleted(m) && Number(m.Cap) === 4 && reportMatchesAp(m, sc.maAp);
    });
    var memberMap = {};
    members.forEach(function (m) { memberMap[m.MaDD] = m; });
    var dd = (db.attendance || []).filter(function (r) {
      return reportInRange(r.ThoiGian, sc.tu, sc.den) && reportMatchesAp(r, sc.maAp);
    });
    var phien = (db.sessions || []).filter(function (r) {
      return reportInRange(r.BatDau, sc.tu, sc.den) && reportMatchesAp(r, sc.maAp);
    });
    var thu = (db.fees || []).filter(function (r) {
      return String(r.TrangThai) === 'Đã xác nhận' && reportMatchesAp(r, sc.maAp) &&
        reportInRange(r.NgayXacNhan || r.NgayTao, sc.tu, sc.den);
    });
    var chi = (db.ledger || []).filter(function (r) {
      return String(r.Loai) === 'Chi' && reportMatchesAp(r, sc.maAp) && reportInRange(r.Ngay, sc.tu, sc.den);
    });
    var evals = (db.evals || []).filter(function (r) {
      return reportInRange(r.ThoiGian, sc.tu, sc.den) &&
        (!sc.maAp || (memberMap[r.MaDD] && memberMap[r.MaDD].MaAp === sc.maAp));
    });
    var uom = (db.uommam || []).filter(function (r) { return reportMatchesAp(r, sc.maAp); });
    var tongThu = 0, tongChi = 0;
    thu.forEach(function (r) { tongThu += Number(r.SoTien || 0); });
    chi.forEach(function (r) { tongChi += Number(r.SoTien || 0); });
    var paid = feePaid(db, Number(db.config.nam || 2026));
    var soDaDong = members.filter(function (m) { return paid[m.MaDD]; }).length;
    var xepLoai = {};
    evals.forEach(function (r) {
      var k = r.XepLoai || 'Chưa xếp loại';
      xepLoai[k] = (xepLoai[k] || 0) + 1;
    });
    var theoAp = {};
    (db.aps || []).forEach(function (a) {
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
    return {
      tuNgay: fmtD(sc.tu), denNgay: fmtD(sc.den), maAp: sc.maAp,
      doanVien: members.length,
      canBo: (db.users || []).filter(function (m) {
        return !isDeleted(m) && Number(m.Cap) >= 1 && Number(m.Cap) <= 3 && reportMatchesAp(m, sc.maAp);
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
  };

  H['report.export'] = function (db, p, token) {
    needAdmin(db, token);
    var sc = reportScope(p);
    var loai = String((p && p.loai) || 'doanVien');
    var headers, rows, ten;
    var f = fmtDT;
    if (loai === 'diemDanh') {
      headers = ['Mã đoàn viên', 'Họ và tên', 'Ấp', 'Phiên', 'Hình thức', 'Điểm', 'Thời gian'];
      rows = (db.attendance || []).filter(function (r) {
        return reportInRange(r.ThoiGian, sc.tu, sc.den) && reportMatchesAp(r, sc.maAp);
      }).sort(function (a, b) { return String(a.ThoiGian).localeCompare(String(b.ThoiGian)); }).map(function (r) {
        var m = find(db.users, 'MaDD', r.MaDD) || {};
        return [r.MaDD, m.HoTen || r.HoTen || '', r.MaAp, r.MaPhien, r.HinhThuc, r.Diem, r.ThoiGian];
      });
      ten = 'diem-danh';
    } else if (loai === 'doanPhi') {
      headers = ['Mã giao dịch', 'Mã đoàn viên', 'Họ và tên', 'Ấp', 'Năm', 'Số tiền', 'Trạng thái', 'Ngày xác nhận'];
      rows = (db.fees || []).filter(function (r) {
        return reportInRange(r.NgayXacNhan || r.NgayTao, sc.tu, sc.den) && reportMatchesAp(r, sc.maAp);
      }).map(function (r) {
        return [r.MaGiaoDich, r.MaDD, r.HoTen, r.MaAp, r.Nam, r.SoTien, r.TrangThai, r.NgayXacNhan || ''];
      });
      ten = 'doan-phi';
    } else if (loai === '360') {
      headers = ['Mã đoàn viên', 'Họ và tên', 'Ấp', 'Năm', 'Chính trị', 'Đạo đức', 'Chuyên môn', 'Cống hiến', 'Kỷ luật', 'Tổng điểm', 'Xếp loại', 'Thời gian'];
      var memberAp = {};
      (db.users || []).forEach(function (m) { memberAp[m.MaDD] = m.MaAp; });
      rows = (db.evals || []).filter(function (r) {
        return reportInRange(r.ThoiGian, sc.tu, sc.den) && (!sc.maAp || memberAp[r.MaDD] === sc.maAp);
      }).map(function (r) {
        var m = find(db.users, 'MaDD', r.MaDD) || {};
        return [r.MaDD, m.HoTen || '', m.MaAp || '', r.Nam, r.TuChinhTri, r.DaoDuc, r.ChuyenMon,
          r.CongHien, r.KyLuat, r.TongDiem, r.XepLoai, r.ThoiGian];
      });
      ten = 'tu-danh-gia-360';
    } else {
      headers = ['Mã đoàn viên', 'Họ và tên', 'Ấp', 'Điện thoại', 'Ngày sinh', 'Điểm', 'Có thẻ', 'Trạng thái'];
      rows = (db.users || []).filter(function (m) {
        return !isDeleted(m) && Number(m.Cap) === 4 && reportMatchesAp(m, sc.maAp);
      }).sort(function (a, b) { return Number(b.Diem || 0) - Number(a.Diem || 0); }).map(function (m) {
        return [m.MaDD, m.HoTen, m.MaAp, m.DienThoai, m.NgaySinh, m.Diem, m.MaThe ? 'Có' : 'Không', m.TrangThai];
      });
      ten = 'doan-vien';
    }
    var ngay = String(new Date().getFullYear()) + p2(new Date().getMonth() + 1) + p2(new Date().getDate());
    return {
      tenFile: 'CD6_' + ten + '_' + ngay + '.csv',
      mime: 'text/csv;charset=utf-8',
      noiDung: csvText(headers, rows),
      soDong: rows.length,
      tuNgay: f(sc.tu), denNgay: f(sc.den),
      message: 'Đã tạo báo cáo ' + rows.length + ' dòng.'
    };
  };

  H['notify.my'] = function (db, p, token) {
    var u = needUser(db, token);
    var maAp = String(u.MaAp || '');
    var items = (db.notifications || []).filter(function (r) {
      if (r.DoiTuong === 'ALL') return true;
      return maAp && String(r.DoiTuong) === maAp;
    }).slice().sort(function (a, b) { return String(b.Luc).localeCompare(String(a.Luc)); })
      .slice(0, 5).map(function (r) {
        return { maTB: r.MaTB, tieuDe: r.TieuDe, noiDung: r.NoiDung, luc: r.Luc, kenh: r.Kenh };
      });
    return { items: items };
  };

  H['admin.notify.list'] = function (db, p, token) {
    needAdmin(db, token);
    var items = (db.notifications || []).slice().sort(function (a, b) {
      return String(b.Luc).localeCompare(String(a.Luc));
    }).slice(0, 50).map(function (r) {
      return {
        maTB: r.MaTB, loai: r.Loai, tieuDe: r.TieuDe, noiDung: r.NoiDung,
        doiTuong: r.DoiTuong, kenh: r.Kenh, trangThai: r.TrangThai,
        soNguoi: Number(r.SoNguoi || 0), nguoiTao: r.NguoiTao, luc: r.Luc
      };
    });
    return { items: items, loai: notifyLoaiMap() };
  };

  H['admin.notify.preview'] = function (db, p, token) {
    needAdmin(db, token);
    p = p || {};
    var loai = String(p.loai || 'tatCa');
    var map = notifyLoaiMap();
    if (!map[loai]) throw new Error('Loại nhắc việc không hợp lệ.');
    var maAp = String(p.maAp || '').trim().toUpperCase();
    var nguoiNhan = notifyRecipients(db, loai, maAp);
    return {
      loai: loai, maAp: maAp, soNguoi: nguoiNhan.length,
      mauNguoiNhan: nguoiNhan.slice(0, 10),
      noiDungMau: notifyMau(db, loai),
      message: nguoiNhan.length ? (nguoiNhan.length + ' người sẽ nhận thông báo.')
        : 'Không có người nhận phù hợp với bộ lọc hiện tại.'
    };
  };

  H['admin.notify.send'] = function (db, p, token) {
    var admin = needAdmin(db, token);
    p = p || {};
    var loai = String(p.loai || 'tatCa');
    var map = notifyLoaiMap();
    if (!map[loai]) throw new Error('Loại nhắc việc không hợp lệ.');
    var tieuDe = String(p.tieuDe || '').trim();
    var noiDung = String(p.noiDung || '').trim();
    if (!tieuDe) throw new Error('Vui lòng nhập tiêu đề thông báo.');
    if (!noiDung) throw new Error('Vui lòng nhập nội dung thông báo.');
    var kenh = String(p.kenh || 'inapp');
    if (['inapp', 'email', 'zalo'].indexOf(kenh) < 0) throw new Error('Kênh gửi không hợp lệ.');
    var maAp = String(p.maAp || '').trim().toUpperCase();
    var nguoiNhan = notifyRecipients(db, loai, maAp);
    if (!nguoiNhan.length) throw new Error('Không có người nhận phù hợp. Hãy chọn lại đối tượng.');
    var trangThai = 'Đã phát hành';
    var ghiChu = '';
    if (kenh === 'email') {
      var emailNhan = String(p.emailNhan || '').trim();
      trangThai = emailNhan ? 'Đã ghi nhận email (xem trước)' : 'Đã lưu (chưa có email nhận)';
      ghiChu = emailNhan ? ('Mô phỏng gửi tới ' + emailNhan) : 'Chưa cấu hình email nhận — thông báo vẫn hiển thị trong ứng dụng.';
    } else if (kenh === 'zalo') {
      trangThai = 'Đã ghi nhận Zalo OA (xem trước)';
      ghiChu = 'Mô phỏng gửi Zalo OA — dùng nội dung bên dưới để đăng nhóm Zalo.';
    }
    var maTB = uid('TB');
    var luc = now();
    db.notifications = db.notifications || [];
    db.notifications.push({
      MaTB: maTB, Loai: loai, TieuDe: tieuDe, NoiDung: noiDung,
      DoiTuong: maAp || 'ALL', Kenh: kenh, TrangThai: trangThai,
      SoNguoi: nguoiNhan.length, NguoiTao: admin.MaDD, Luc: luc,
      ChiTiet: ghiChu || ('Người nhận: ' + nguoiNhan.slice(0, 10).map(function (x) { return x.maDD; }).join(', '))
    });
    mlog(db, admin.MaDD, 'GỬI NHẮC VIỆC',
      tieuDe + ' · ' + nguoiNhan.length + ' người · ' + kenh + ' · ' + trangThai);
    save(db);
    return {
      maTB: maTB, soNguoi: nguoiNhan.length, trangThai: trangThai, luc: luc,
      zaloText: noiDung + '\n' + tieuDe,
      message: 'Đã tạo thông báo "' + tieuDe + '" cho ' + nguoiNhan.length + ' người. Trạng thái: ' + trangThai +
        (ghiChu ? (' — ' + ghiChu) : '')
    };
  };

  /* --------------------------- CỔNG API --------------------------- */

  // Thao tác quản trị làm thay đổi cấu hình/đơn vị/danh sách tài khoản:
  // tăng phienBan để các phiên đang mở tự đồng bộ.
  var CONFIG_BUMP_ACTIONS = {
    'member.add': 1, 'member.update': 1, 'member.delete': 1, 'member.restore': 1,
    'admin.ap.save': 1, 'admin.ap.delete': 1, 'admin.config.save': 1,
    'admin.account.create': 1, 'admin.account.update': 1,
    'admin.account.status': 1, 'admin.account.resetPin': 1, 'admin.account.restore': 1,
    'admin.reconcile': 1, 'admin.notify.send': 1
  };

  function call(action, payload, token) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          var db = load();
          var fn = H[action];
          if (!fn) throw new Error('Hành động không hợp lệ: ' + action);
          var data = fn(db, payload || {}, token);
          if (CONFIG_BUMP_ACTIONS[action]) bumpConfigVersion(db);
          save(db);
          resolve(data);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }, 160);
    });
  }

  window.MOCK_API = {
    call: call,
    reset: function () { localStorage.removeItem(KEY); }
  };
})();
