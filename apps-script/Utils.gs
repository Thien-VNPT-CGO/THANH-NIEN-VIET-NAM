/**
 * CHI ĐOÀN SỐ 6.0 — XÃ TÂN HÒA
 * Utils.gs — Lớp tiện ích dùng chung: truy cập Sheets, bảo mật HMAC, cấp điểm, token.
 */

var TZ = 'Asia/Ho_Chi_Minh';
var DEFAULT_SECRET = 'CD6-TANHOA-2026-SECRET-KEY';

/* ------------------------------------------------------------------ */
/* KẾT NỐI SPREADSHEET                                                 */
/* ------------------------------------------------------------------ */

function ss_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }
  throw new Error('Chưa cấu hình SPREADSHEET_ID. Hãy chạy hàm setup() trong file Setup.gs trước.');
}

function sh_(name) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) throw new Error('Thiếu trang tính: ' + name + '. Hãy chạy setup() để khởi tạo.');
  return sheet;
}

/* ------------------------------------------------------------------ */
/* ĐỌC / GHI DỮ LIỆU                                                   */
/* ------------------------------------------------------------------ */

/**
 * Bộ nhớ đệm theo MỘT lần thực thi Apps Script.
 * Giúp cùng một API không phải đọc lại toàn bộ sheet nhiều lần.
 */
var __rowsCache = {};
var __lockDepth = 0;

function rows_(name) {
  if (Object.prototype.hasOwnProperty.call(__rowsCache, name)) return __rowsCache[name];
  var sheet = sh_(name);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    __rowsCache[name] = [];
    return __rowsCache[name];
  }
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[0]).trim() === '') continue;
    var obj = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = row[j];
    out.push(obj);
  }
  __rowsCache[name] = out;
  return out;
}

/** Xóa cache sau khi ghi để lần đọc kế tiếp trong cùng execution thấy dữ liệu mới. */
function invalidateRows_(name) {
  if (name) delete __rowsCache[name];
  else __rowsCache = {};
}

/**
 * Khóa ghi cấp nghiệp vụ. Các hàm append_/update_ bên trong không lấy khóa lần hai
 * nhờ bộ đếm __lockDepth (LockService không cần thiết phải lồng nhau).
 */
function withLock_(fn, timeoutMs) {
  if (__lockDepth > 0) return fn();
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    lock.waitLock(timeoutMs || 20000);
    locked = true;
    __lockDepth++;
    return fn();
  } finally {
    if (locked) {
      __lockDepth--;
      try { lock.releaseLock(); } catch (e) { /* bỏ qua */ }
    }
  }
}

function findBy_(sheetName, keyField, keyValue) {
  var list = rows_(sheetName);
  var target = String(keyValue);
  for (var i = 0; i < list.length; i++) {
    if (String(list[i][keyField]) === target) return list[i];
  }
  return null;
}

function filterBy_(sheetName, field, value) {
  return rows_(sheetName).filter(function (r) { return String(r[field]) === String(value); });
}

function append_(sheetName, obj) {
  return withLock_(function () {
    var sheet = sh_(sheetName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = headers.map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
    sheet.appendRow(row);
    invalidateRows_(sheetName);
    return true;
  });
}

/**
 * Cập nhật một dòng theo khóa. Đọc cả dòng, áp bản vá rồi ghi lại MỘT lần
 * bằng setValues thay vì gọi setValue cho từng ô.
 */
function update_(sheetName, keyField, keyValue, patch) {
  return withLock_(function () {
    var sheet = sh_(sheetName);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return false;
    var headers = values[0];
    var keyCol = headers.indexOf(keyField);
    if (keyCol < 0) throw new Error('Không tìm thấy cột khóa ' + keyField);
    var target = String(keyValue);
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][keyCol]) !== target) continue;
      var row = values[i].slice();
      Object.keys(patch).forEach(function (k) {
        var c = headers.indexOf(k);
        if (c >= 0) row[c] = patch[k] === undefined || patch[k] === null ? '' : patch[k];
      });
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
      invalidateRows_(sheetName);
      return true;
    }
    return false;
  });
}

function removeRow_(sheetName, keyField, keyValue) {
  return withLock_(function () {
    var sheet = sh_(sheetName);
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var keyCol = headers.indexOf(keyField);
    var last = sheet.getLastRow();
    if (last < 2 || keyCol < 0) return false;
    var keys = sheet.getRange(2, keyCol + 1, last - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === String(keyValue)) {
        sheet.deleteRow(i + 2);
        invalidateRows_(sheetName);
        return true;
      }
    }
    return false;
  });
}

/** Xóa toàn bộ dòng khớp khóa (dùng khi xóa đoàn viên và dữ liệu liên quan). */
function removeAll_(sheetName, keyField, keyValue) {
  var removed = 0;
  while (removeRow_(sheetName, keyField, keyValue)) removed++;
  return removed;
}

/* ------------------------------------------------------------------ */
/* THỜI GIAN & ĐỊNH DẠNG                                               */
/* ------------------------------------------------------------------ */

function nowDate_() { return new Date(); }

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function parseDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var s = String(v).replace('T', ' ');
  var m = s.match(/(\d{4})-(\d{2})-(\d{2})[ ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysSince_(v) {
  var d = parseDate_(v);
  if (!d) return 9999;
  return Math.floor((new Date().getTime() - d.getTime()) / 86400000);
}

/* ------------------------------------------------------------------ */
/* BẢO MẬT: HMAC, TOKEN ĐĂNG NHẬP, QR ĐỘNG                             */
/* ------------------------------------------------------------------ */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRET');
  if (!s) {
    s = Utilities.getUuid() + DEFAULT_SECRET;
    props.setProperty('SECRET', s);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* GIỚI HẠN TẦN SUẤT (RATE LIMIT)                                      */
/* ------------------------------------------------------------------ */

/** Số lần đăng nhập sai tối đa trong cửa sổ 10 phút (theo mã định danh). */
var RATE_LIMIT_LOGIN = 30;
/** Cửa sổ giới hạn tần suất (giây). */
var RATE_LIMIT_WINDOW = 600;

function rateLimitKey_(key) {
  return 'RL_' + hmac_('RATE|' + String(key)).slice(0, 32);
}

/**
 * Kiểm tra đã vượt ngưỡng chưa. CacheService dùng chung toàn bộ người dùng
 * nên hiệu lực trên mọi instance Apps Script.
 */
function rateLimitCheck_(key, max) {
  try {
    var n = Number(CacheService.getScriptCache().get(rateLimitKey_(key)) || 0);
    return { blocked: n >= max, soLan: n, conLai: Math.max(0, max - n) };
  } catch (e) {
    return { blocked: false, soLan: 0, conLai: max }; // cache lỗi: không chặn người dùng
  }
}

/** Ghi nhận một lần vượt ngưỡng (thường là đăng nhập sai). */
function rateLimitHit_(key, windowSec) {
  try {
    var cache = CacheService.getScriptCache();
    var k = rateLimitKey_(key);
    var n = Number(cache.get(k) || 0) + 1;
    cache.put(k, String(n), Math.max(60, Number(windowSec) || RATE_LIMIT_WINDOW));
    return n;
  } catch (e) {
    return 0;
  }
}

/** Xóa bộ đếm sau khi đăng nhập thành công. */
function rateLimitReset_(key) {
  try { CacheService.getScriptCache().remove(rateLimitKey_(key)); } catch (e) { /* bỏ qua */ }
}

function hmac_(text) {
  var raw = Utilities.computeHmacSha256Signature(String(text), secret_());
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    var b = raw[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/** Băm mật khẩu chữ của tài khoản quản trị (không bao giờ lưu chữ thô). */
function hashMatKhau_(maDD, password) {
  return hmac_('MK|' + String(maDD).toUpperCase() + '|' + String(password)).slice(0, 40);
}

function verifyMatKhau_(user, password) {
  if (!user || !user.MatKhauHash) return false;
  return String(user.MatKhauHash) === hashMatKhau_(user.MaDD, password);
}

/** Băm PIN 6 số (không bao giờ lưu PIN mới dưới dạng chữ thô). */
function hashPin_(maDD, pin) {
  return hmac_('PIN|' + String(maDD).toUpperCase() + '|' + String(pin)).slice(0, 40);
}

/**
 * Kiểm tra PIN. Tương thích ngược: bản ghi cũ còn cột PIN chữ thô sẽ được
 * xác thực một lần rồi tự động nâng cấp sang PINHash ở svc_login.
 */
function verifyPin_(user, pin) {
  if (!user) return false;
  if (user.PINHash) return String(user.PINHash) === hashPin_(user.MaDD, pin);
  return user.PIN !== undefined && String(user.PIN) !== '' && String(user.PIN) === String(pin);
}

function hasLegacyPin_(user) {
  return !!user && !user.PINHash && user.PIN !== undefined && String(user.PIN) !== '';
}

/** Ghi PIN mới dạng băm, xóa PIN chữ thô, buộc đổi PIN và thu hồi phiên cũ. */
function setPin_(maDD, pin, forceChange) {
  var u = findBy_('DM_CanBo', 'MaDD', maDD);
  return update_('DM_CanBo', 'MaDD', maDD, {
    PINHash: hashPin_(maDD, pin),
    PIN: '',
    BatDoiPin: forceChange ? 'TRUE' : 'FALSE',
    SoLanSai: 0,
    KhoaDen: '',
    TokenVersion: Number((u && u.TokenVersion) || 0) + 1
  });
}

function bumpTokenVersion_(maDD) {
  var u = findBy_('DM_CanBo', 'MaDD', maDD);
  if (!u) return 0;
  var v = Number(u.TokenVersion || 0) + 1;
  update_('DM_CanBo', 'MaDD', maDD, { TokenVersion: v });
  return v;
}

function isDeleted_(u) {
  return !!u && isTrue_(u.DaXoa);
}

function isActiveUser_(u) {
  return !!u && !isDeleted_(u) && String(u.TrangThai) === 'Đang hoạt động';
}

/** Tập MaDD còn hiển thị (loại bỏ tài khoản đã xóa mềm). */
function activeMaDDMap_() {
  var map = {};
  rows_('DM_CanBo').forEach(function (r) {
    if (!isTrue_(r.DaXoa)) map[r.MaDD] = true;
  });
  return map;
}

/** Chuẩn hóa giá trị boolean đọc từ Google Sheets. */
function isTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE' || String(v) === '1';
}

function issueToken_(user) {
  var payload = [
    user.MaDD,
    user.Cap,
    Date.now() + 12 * 3600 * 1000,
    Number(user.TokenVersion || 0)
  ].join('|');
  var b64 = Utilities.base64EncodeWebSafe(payload);
  return b64 + '.' + hmac_(b64).slice(0, 24);
}

function readToken_(token) {
  if (!token) return null;
  var parts = String(token).split('.');
  if (parts.length !== 2) return null;
  if (hmac_(parts[0]).slice(0, 24) !== parts[1]) return null;
  var payload;
  try {
    payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
  } catch (e) {
    return null;
  }
  var p = payload.split('|');
  if (p.length < 4) return null;
  if (Number(p[2]) < Date.now()) return null;
  var u = findBy_('DM_CanBo', 'MaDD', p[0]);
  if (!u || !isActiveUser_(u)) return null;
  // Token cũ bị thu hồi khi đổi PIN/mật khẩu, khóa, xóa mềm hoặc đăng xuất.
  if (Number(u.TokenVersion || 0) !== Number(p[3] || 0)) return null;
  return u;
}

function slotNow_() { return Math.floor(Date.now() / 60000); }

function qrToken_(maPhien, slot) {
  return hmac_(maPhien + ':' + slot).slice(0, 10).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* SINH MÃ                                                             */
/* ------------------------------------------------------------------ */

function newId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function randPin_() {
  var pin = '';
  for (var i = 0; i < 6; i++) pin += Math.floor(Math.random() * 10);
  return pin;
}

/* ------------------------------------------------------------------ */
/* ĐIỂM RÈN LUYỆN                                                      */
/* ------------------------------------------------------------------ */

function cfg_() {
  var map = {};
  rows_('CauHinh').forEach(function (r) { map[r.Khoa] = r.GiaTri; });
  return map;
}

function cfgNum_(key, fallback) {
  var v = cfg_()[key];
  return v === undefined || v === '' ? fallback : Number(v);
}

/**
 * Phiên bản cấu hình toàn hệ thống. Tăng mỗi khi quản trị thay đổi cấu hình,
 * đơn vị hoặc tài khoản; client dùng giá trị này để tự đồng bộ mà không cần tải lại.
 */
function configVersion_() {
  var v = cfg_().PHIEN_BAN_CAU_HINH;
  return v === undefined || v === '' ? 1 : Number(v);
}

/** Tăng phiên bản cấu hình và trả về giá trị mới. */
function bumpConfigVersion_() {
  return withLock_(function () {
    var next = configVersion_() + 1;
    var row = findBy_('CauHinh', 'Khoa', 'PHIEN_BAN_CAU_HINH');
    if (row) {
      update_('CauHinh', 'Khoa', 'PHIEN_BAN_CAU_HINH', { GiaTri: String(next) });
    } else {
      append_('CauHinh', {
        Khoa: 'PHIEN_BAN_CAU_HINH', GiaTri: String(next),
        MoTa: 'Phiên bản cấu hình — tăng khi quản trị thay đổi dữ liệu'
      });
    }
    return next;
  });
}

function award_(user, diem, loai, ghiChu) {
  if (!diem || !user) return 0;
  return withLock_(function () {
    var fresh = findBy_('DM_CanBo', 'MaDD', user.MaDD);
    if (!fresh || isDeleted_(fresh)) return 0;
    append_('Diem_Log', {
      MaLog: newId_('P'),
      MaDD: user.MaDD,
      MaAp: fresh.MaAp || '',
      Loai: loai,
      Diem: diem,
      GhiChu: ghiChu || '',
      ThoiGian: nowStr_()
    });
    var total = Number(fresh.Diem || 0) + Number(diem);
    update_('DM_CanBo', 'MaDD', user.MaDD, { Diem: total });
    return total;
  });
}

function totalDiem_(maDD) {
  var u = findBy_('DM_CanBo', 'MaDD', maDD);
  return u ? Number(u.Diem || 0) : 0;
}

/* ------------------------------------------------------------------ */
/* LOG HỆ THỐNG                                                        */
/* ------------------------------------------------------------------ */

function log_(maDD, hanhDong, chiTiet) {
  try {
    append_('Log', {
      MaLog: newId_('L'),
      MaDD: maDD || '',
      HanhDong: hanhDong,
      ChiTiet: chiTiet || '',
      ThoiGian: nowStr_()
    });
  } catch (e) {
    // Bỏ qua lỗi log để không chặn nghiệp vụ
  }
}

/* ------------------------------------------------------------------ */
/* PHÂN QUYỀN                                                          */
/* ------------------------------------------------------------------ */

function isC1_(u) { return Number(u.Cap) === 1; }
function isC2_(u) { return Number(u.Cap) === 2; }
function isC3_(u) { return Number(u.Cap) === 3; }
function isC4_(u) { return Number(u.Cap) === 4; }
function isAdmin_(u) { return !!u && Number(u.Cap) === 0; }
/**
 * Cấp Xã: C1 (Chủ tịch Hội LHTN Xã), C2 (Bí thư Chi bộ Xã) và C0 (Admin).
 * Admin giám sát toàn bộ các Ấp nên dùng chung phạm vi dữ liệu cấp Xã.
 */
function isXa_(u) { return !!u && (isAdmin_(u) || isC1_(u) || isC2_(u)); }
/** Cấp Ấp: C3 (Bí thư Chi đoàn Ấp). */
function isAp_(u) { return !!u && isC3_(u); }
/** Cấp Đoàn viên: C4. */
function isMember_(u) { return !!u && isC4_(u); }

function assertAdmin_(u) {
  if (!isAdmin_(u)) throw new Error('Chỉ tài khoản quản trị hệ thống (Cấp 0) được thực hiện thao tác này.');
}

function canManageAp_(u, maAp) {
  if (isXa_(u)) return true;
  if (isAp_(u) && String(u.MaAp) === String(maAp)) return true;
  return false;
}

/**
 * Kiểm tra cấp tài khoản. Admin (C0) là siêu quản trị nên được đi qua
 * mọi kiểm tra nghiệp vụ C1–C3; các giới hạn riêng của tài khoản Admin
 * vẫn được bảo vệ bằng assertAdmin_.
 */
function assertCap_(u, caps) {
  if (isAdmin_(u)) return;
  if (!u || caps.indexOf(Number(u.Cap)) < 0) {
    throw new Error('Tài khoản của bạn không có quyền thực hiện thao tác này.');
  }
}

function assertAp_(u, maAp) {
  if (isXa_(u)) return;
  if (String(u.MaAp) !== String(maAp)) {
    throw new Error('Bạn chỉ được thao tác trong phạm vi Chi đoàn Ấp của mình.');
  }
}

/* Ủy quyền 24h: trả về người đang giữ quyền duyệt điểm danh của ấp */
function nguoiDuyetCuaAp_(maAp) {
  var ap = findBy_('DM_Ap', 'MaAp', maAp);
  var biThu = ap ? findBy_('DM_CanBo', 'MaDD', ap.BiThu) : null;
  var list = filterBy_('DM_CanBo', 'MaAp', maAp);
  var now = Date.now();
  for (var i = 0; i < list.length; i++) {
    var u = list[i];
    var den = parseDate_(u.UyQuyenDen);
    if (den && den.getTime() > now) {
      return { nguoiDuyet: u.MaDD, hoTen: u.HoTen, den: u.UyQuyenDen, uyQuyen: true };
    }
  }
  return {
    nguoiDuyet: biThu ? biThu.MaDD : '',
    hoTen: biThu ? biThu.HoTen : '',
    den: '',
    uyQuyen: false
  };
}

/* ------------------------------------------------------------------ */
/* TIỆN ÍCH KHÁC                                                       */
/* ------------------------------------------------------------------ */

function ok_(data) { return { ok: true, data: data === undefined ? null : data }; }
function err_(msg) { return { ok: false, error: String(msg || 'Lỗi không xác định') }; }

function distanceM_(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  var R = 6371000;
  var toRad = function (d) { return d * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Tên đơn vị hiển thị đầy đủ của người dùng.
 * C0: Toàn hệ thống · C1: Ủy Ban Hội LHTN Việt Nam Xã · C2: Chi bộ Xã · C3/C4: Chi đoàn Ấp ...
 */
function tenDonVi_(u) {
  if (isAdmin_(u)) return 'Toàn hệ thống';
  var tenXa = cfg_().TEN_XA || 'Xã Tân Hòa';
  if (isC1_(u)) return 'Ủy Ban Hội LHTN Việt Nam ' + tenXa;
  if (isC2_(u)) return 'Chi bộ ' + tenXa;
  var ap = u.MaAp ? findBy_('DM_Ap', 'MaAp', u.MaAp) : null;
  var ten = ap ? String(ap.TenAp).trim() : String(u.MaAp || '');
  if (!ten) return 'Chi đoàn Ấp';
  return /^Chi đoàn\b/i.test(ten) ? ten : ('Chi đoàn ' + ten);
}

function publicProfile_(u) {
  var the = findBy_('TheDoanVien', 'MaDD', u.MaDD);
  var uy = {};
  if (isAp_(u)) uy = nguoiDuyetCuaAp_(u.MaAp);
  var den = parseDate_(u.UyQuyenDen);
  var admin = isAdmin_(u);
  return {
    maDD: u.MaDD,
    hoTen: u.HoTen,
    cap: Number(u.Cap),
    chucVu: u.ChucVu,
    maAp: u.MaAp || '',
    tenAp: tenDonVi_(u),
    dienThoai: u.DienThoai || '',
    ngaySinh: u.NgaySinh || '',
    diem: Number(u.Diem || 0),
    trangThai: u.TrangThai || '',
    daXoa: isTrue_(u.DaXoa),
    maThe: the ? the.MaThe : '',
    coThe: !!(the && the.TrangThai === 'Đã cấp'),
    batDoiMatKhau: admin ? isTrue_(u.BatDoiMatKhau) : false,
    batDoiPin: admin ? false : isTrue_(u.BatDoiPin),
    uyQuyen: {
      dangHieuLuc: !!(den && den.getTime() > Date.now()),
      den: u.UyQuyenDen || '',
      nguoiDuyet: uy.hoTen || '',
      uyQuyen: !!uy.uyQuyen
    }
  };
}
