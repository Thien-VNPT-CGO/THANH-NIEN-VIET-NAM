/**
 * Setup.gs — Khởi tạo cấu trúc Google Sheets & dữ liệu mẫu Xã Tân Hòa.
 *
 * CÁCH DÙNG:
 *  1. Tạo Google Sheets mới → Tiện ích mở rộng → Apps Script.
 *  2. Dán toàn bộ các file .gs + Index.html.
 *  3. Chọn hàm setup() → Run (cấp quyền lần đầu).
 *  4. Triển khai → Ứng dụng web → Thực thi dưới danh nghĩa "Tôi", truy cập "Bất kỳ ai".
 */

/** Phiên bản lược đồ dữ liệu hiện tại. Tăng khi thêm bảng/cột cần nâng cấp. */
var SCHEMA_VERSION = '3';

var SCHEMA = {
  'CauHinh':        ['Khoa', 'GiaTri', 'MoTa'],
  'DM_Ap':          ['MaAp', 'TenAp', 'BiThu', 'ChiTieu', 'GhiChu'],
  'DM_CanBo':       ['MaDD', 'HoTen', 'Cap', 'ChucVu', 'MaAp', 'DienThoai', 'NgaySinh',
                     'NgayVaoDoan', 'NoiVaoDoan', 'NgaySinhHoatDoan', 'PIN',
                     'Diem', 'TrangThai', 'MaThe', 'UyQuyenCho', 'UyQuyenDen', 'NgayThamGia', 'GhiChu',
                     'MatKhauHash', 'BatDoiMatKhau',
                     'PINHash', 'BatDoiPin', 'SoLanSai', 'KhoaDen', 'TokenVersion',
                     'DaXoa', 'NgayXoa', 'NguoiXoa', 'DiemNen'],
  'DiemDanh':       ['MaDD', 'MaPhien', 'MaAp', 'HinhThuc', 'Diem', 'ThoiGian', 'ViDo', 'KinhDo', 'GhiChu'],
  'QR_Phien':       ['MaPhien', 'MaAp', 'TieuDe', 'BatDau', 'KetThuc', 'TrangThai', 'NguoiTao'],
  'UomMamDo':       ['MaDD', 'HoTen', 'MaAp', 'Diem', 'TieuChiThe', 'TieuChiDiem', 'TieuChi360',
                     'TrangThai', 'NhanXet', 'NguoiDeCu', 'NgayDeCu', 'NguoiDuyet', 'NgayDuyet'],
  'DoanPhi':        ['MaGiaoDich', 'MaAp', 'MaDD', 'HoTen', 'Nam', 'SoTien', 'NoiDung',
                     'TrangThai', 'NgayTao', 'NgayXacNhan', 'NguoiXacNhan'],
  'Quy_ThuChi':     ['MaGD', 'MaAp', 'Loai', 'SoTien', 'NoiDung', 'Ngay', 'NguoiTao'],
  'TheDoanVien':    ['MaThe', 'MaDD', 'HoTen', 'MaAp', 'NgayCap', 'HetHan', 'NoiCapThe', 'TrangThai', 'NguoiCap'],
  'TuDanhGia360':   ['MaDD', 'Nam', 'TuChinhTri', 'DaoDuc', 'ChuyenMon', 'CongHien', 'KyLuat',
                     'TongDiem', 'XepLoai', 'ThoiGian'],
  'ECert':          ['MaCert', 'MaDD', 'HoTen', 'Loai', 'NgayCap', 'ChuKySo', 'NoiDung'],
  'SOS':            ['MaPA', 'MaDD', 'HoTen', 'MaAp', 'Loai', 'NoiDung', 'ViDo', 'KinhDo',
                     'Diem', 'TrangThai', 'MaNV', 'ThoiGian'],
  'NhiemVu':        ['MaNV', 'TenNV', 'MaPA', 'MaAp', 'ViDo', 'KinhDo', 'Diem', 'TrangThai', 'NgayTao'],
  'Quiz':           ['MaCau', 'NoiDung', 'A', 'B', 'C', 'D', 'DapAn', 'ChuDe', 'Diem', 'GiaiThich'],
  'Quiz_KetQua':    ['MaDD', 'MaCau', 'DapAnChon', 'Dung', 'Diem', 'ThoiGian'],
  'PIN_Reset':      ['MaYC', 'MaDD', 'HoTen', 'Cap', 'PinMoi', 'TrangThai', 'LyDo', 'NgayYC', 'NgayCap', 'NguoiCap'],
  'Diem_Log':       ['MaLog', 'MaDD', 'MaAp', 'Loai', 'Diem', 'GhiChu', 'ThoiGian'],
  'Log':            ['MaLog', 'MaDD', 'HanhDong', 'ChiTiet', 'ThoiGian'],
  'VanBan':         ['MaVB', 'Loai', 'TieuDe', 'NoiDung', 'NguoiTao', 'ThoiGian'],
  'ThongBao':       ['MaTB', 'Loai', 'TieuDe', 'NoiDung', 'DoiTuong', 'Kenh', 'TrangThai',
                     'SoNguoi', 'NguoiTao', 'Luc', 'ChiTiet']
};

var CAU_HINH_MAU = [
  ['MUC_TIEU_DIEM', '300', 'Mức điểm rèn luyện/năm để xét Ươm mầm Đỏ'],
  ['DOAN_PHI_NAM', '24000', 'Mức đoàn phí chuẩn/năm'],
  ['DIEM_HOP_TRUC_TIEP', '10', 'Điểm danh họp trực tiếp'],
  ['DIEM_BAO_CAO_HYBRID', '8', 'Điểm báo cáo Hybrid'],
  ['DIEM_KET_NOI_ZALO', '5', 'Điểm kết nối lại qua Zalo'],
  ['DIEM_UOM_MAM', '25', 'Điểm khi được duyệt vào nguồn Cảm tình Đảng'],
  ['DIEM_DOAN_PHI', '10', 'Điểm hoàn thành đoàn phí năm'],
  ['DIEM_TICH_HOP_THE', '20', 'Điểm tích hợp Thẻ Đoàn viên'],
  ['DIEM_TU_DANH_GIA', '10', 'Điểm tự đánh giá 360 độ'],
  ['DIEM_SOS', '10', 'Điểm gửi phản ánh hiện trường'],
  ['DIEM_CHECKIN_NV', '15', 'Điểm check-in nhiệm vụ GPS'],
  ['DIEM_QUIZ', '15', 'Điểm mỗi câu trắc nghiệm đúng'],
  ['BANK_ID', 'MB', 'Mã ngân hàng VietQR (MB, VCB, ICB, TCB...)'],
  ['BANK_ACC', '0123456789', 'Số tài khoản nhận đoàn phí'],
  ['BANK_NAME', 'CHI DOAN XA TAN HOA', 'Tên chủ tài khoản'],
  ['TEN_XA', 'Xã Tân Hòa', 'Tên địa phương'],
  ['TEN_CHI_BO', 'Chi đoàn Xã Tân Hòa', 'Tên đầy đủ của đơn vị cấp xã'],
  ['BI_THU_XA', 'Lê Văn Bình', 'Chủ tịch Ủy ban Hội LHTN Việt Nam Xã'],
  ['PHO_BI_THU_XA', 'Nguyễn Văn Hòa', 'Bí thư Chi bộ Xã'],
  ['DIEN_THOAI_XA', '0901000001', 'Điện thoại liên hệ của đơn vị'],
  ['DIA_CHI_XA', 'Xã Tân Hòa', 'Địa chỉ trụ sở đơn vị'],
  ['EMAIL_XA', '', 'Email liên hệ'],
  ['NGAY_THANH_LAP', '26/03/2000', 'Ngày thành lập Chi đoàn Xã'],
  ['NAM_CONG_TAC', '2026', 'Năm công tác'],
  ['LAN_SAO_LUU_CUOI', '', 'Thời điểm sao lưu bảng tính gần nhất'],
  ['SO_BAN_SAO_LUU', '30', 'Số bản sao lưu tối đa giữ lại trên Google Drive'],
  ['PHIEN_BAN_CAU_HINH', '1', 'Phiên bản cấu hình — tăng khi quản trị thay đổi dữ liệu để các phiên tự đồng bộ'],
  ['PHIEN_BAN_PHAN_QUYEN', '2', 'Phiên bản mô hình phân quyền C0–C4 (dùng để nâng cấp một lần)']
];

/** Phiên bản mô hình phân quyền hiện tại. */
var PHIEN_BAN_PHAN_QUYEN = '2';

/** Mật khẩu mặc định của tài khoản quản trị hệ thống (Cấp 0) */
var DEFAULT_ADMIN_PASSWORD = 'ThanhnienvietnamXTH';

var AP_MAU = [
  ['AP01', 'Ấp Tân Bình', 'BT_AP01', 100, ''],
  ['AP02', 'Ấp Tân Lập', 'BT_AP02', 90, ''],
  ['AP03', 'Ấp Tân Phú', 'BT_AP03', 80, '']
];

/* Mã, Họ tên, Cấp, Chức vụ, Ấp, SĐT, Ngày sinh, PIN, Điểm, Trạng thái, Mã thẻ */
var CANBO_MAU = [
  ['CT_HOILHTN', 'Lê Văn Bình', 1, 'Chủ Tịch', '', '0901000006', '10/06/1982', '123456', 0, 'Đang hoạt động', '', '26/03/2001', 'Chi đoàn Ấp Tân Bình', 'Ngày 20 hằng tháng'],
  ['BT_CHIBO_XA', 'Nguyễn Văn Hòa', 2, 'Bí thư Chi bộ Xã', '', '0901000001', '15/03/1980', '123456', 0, 'Đang hoạt động', '', '26/03/2000', 'Chi đoàn Ấp Tân Bình', 'Ngày 20 hằng tháng'],
  ['BT_AP01', 'Trần Thị Mai', 3, 'Bí thư Chi đoàn Ấp Tân Bình', 'AP01', '0901000002', '20/07/1998', '123456', 260, 'Đang hoạt động', '', '26/03/2017', 'Chi đoàn Ấp Tân Bình', 'Ngày 20 hằng tháng'],
  ['BT_AP02', 'Lê Quốc Bảo', 3, 'Bí thư Chi đoàn Ấp Tân Lập', 'AP02', '0901000003', '02/11/1997', '123456', 240, 'Đang hoạt động', '', '26/03/2016', 'Chi đoàn Ấp Tân Lập', 'Ngày 20 hằng tháng'],
  ['BT_AP03', 'Phạm Ngọc Lan', 3, 'Bí thư Chi đoàn Ấp Tân Phú', 'AP03', '0901000004', '12/09/1999', '123456', 215, 'Đang hoạt động', '', '26/03/2018', 'Chi đoàn Ấp Tân Phú', 'Ngày 20 hằng tháng'],
  ['DV01', 'Võ Minh Khoa', 4, 'Đoàn viên', 'AP01', '0902000001', '08/05/2003', '123456', 340, 'Đang hoạt động', 'TDV-2026-AP01-01', '26/03/2021', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
  ['DV02', 'Nguyễn Thị Thu Hà', 4, 'Đoàn viên', 'AP01', '0902000002', '19/02/2004', '123456', 285, 'Đang hoạt động', 'TDV-2026-AP01-02', '26/03/2022', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
  ['DV03', 'Trương Tấn Phát', 4, 'Đoàn viên', 'AP01', '0902000003', '30/10/2002', '123456', 180, 'Đang hoạt động', '', '26/03/2020', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
  ['DV04', 'Lâm Thanh Trúc', 4, 'Đoàn viên', 'AP01', '0902000004', '14/06/2005', '123456', 120, 'Đang hoạt động', '', '26/03/2023', 'Chi đoàn Ấp Tân Bình', 'Ngày 25 hằng tháng'],
  ['DV05', 'Đặng Quốc Huy', 4, 'Đoàn viên', 'AP02', '0902000005', '21/12/2001', '123456', 310, 'Đang hoạt động', 'TDV-2026-AP02-01', '26/03/2019', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
  ['DV06', 'Bùi Kim Ngân', 4, 'Đoàn viên', 'AP02', '0902000006', '05/08/2004', '123456', 265, 'Đang hoạt động', 'TDV-2026-AP02-02', '26/03/2022', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
  ['DV07', 'Huỳnh Gia Bảo', 4, 'Đoàn viên', 'AP02', '0902000007', '17/04/2003', '123456', 95, 'Đang hoạt động', '', '26/03/2021', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
  ['DV08', 'Ngô Thị Mỹ Duyên', 4, 'Đoàn viên', 'AP02', '0902000008', '09/09/2005', '123456', 140, 'Đang hoạt động', '', '26/03/2023', 'Chi đoàn Ấp Tân Lập', 'Ngày 25 hằng tháng'],
  ['DV09', 'Phan Anh Tuấn', 4, 'Đoàn viên', 'AP03', '0902000009', '28/01/2002', '123456', 300, 'Đang hoạt động', 'TDV-2026-AP03-01', '26/03/2020', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng'],
  ['DV10', 'Trần Lê Bảo Châu', 4, 'Đoàn viên', 'AP03', '0902000010', '11/11/2004', '123456', 210, 'Đang hoạt động', 'TDV-2026-AP03-02', '26/03/2022', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng'],
  ['DV11', 'Cao Minh Trí', 4, 'Đoàn viên', 'AP03', '0902000011', '03/03/2001', '123456', 75, 'Đang hoạt động', '', '26/03/2019', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng'],
  ['DV12', 'Lý Thị Hồng Nhung', 4, 'Đoàn viên', 'AP03', '0902000012', '25/07/2005', '123456', 165, 'Đang hoạt động', '', '26/03/2023', 'Chi đoàn Ấp Tân Phú', 'Ngày 25 hằng tháng']
];

var QUIZ_MAU = [
  ['Q01', 'Đại hội Đoàn TNCS Hồ Chí Minh nhiệm kỳ 2022 – 2027 được tổ chức tại đâu?', 'Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Cần Thơ', 'A', 'Nghị quyết Đại hội', 15, 'Đại hội XII diễn ra tại Thủ đô Hà Nội.'],
  ['Q02', 'Nội dung nào KHÔNG thuộc chương trình "Dân vận khéo" của Chi đoàn?', 'Xây dựng tuyến đường hoa', 'Hỗ trợ hộ khó khăn', 'Tổ chức họp lớp học sinh', 'Chuyển đổi số khu dân cư', 'C', 'Dân vận khéo', 15, 'Họp lớp học sinh không thuộc phạm vi dân vận khéo của Chi đoàn Ấp.'],
  ['Q03', 'Mức đoàn phí chuẩn/năm áp dụng trong hệ sinh thái Chi đoàn Số 6.0 là bao nhiêu?', '12.000đ', '24.000đ', '36.000đ', '48.000đ', 'B', 'Nghiệp vụ', 15, 'Mức chuẩn 24.000đ/năm theo quy định của Điều lệ Đoàn.'],
  ['Q04', 'Cơ chế xác thực nhiều lớp của hệ thống gồm những gì?', 'Mã định danh + PIN 6 số', 'Chỉ cần số điện thoại', 'Tài khoản Facebook', 'Email cá nhân', 'A', 'Nghiệp vụ', 15, 'Đăng nhập bằng Mã định danh + mã PIN 6 chữ số, token ký HMAC.'],
  ['Q05', 'Đoàn viên đạt bao nhiêu điểm/năm để đủ điều kiện xét "Ươm mầm Đỏ"?', '150 điểm', '200 điểm', '300 điểm', '500 điểm', 'C', 'Ươm mầm Đỏ', 15, 'Cần đủ 300 điểm/năm cùng thẻ Đoàn viên và tự đánh giá 360°.'],
  ['Q06', 'Mã QR điểm danh động có thời hạn bao lâu?', '30 giây', '60 giây', '5 phút', '1 ngày', 'B', 'Nghiệp vụ', 15, 'Token QR tự động đổi mỗi 60 giây để chống quét ảnh chụp màn hình.']
];

/* ------------------------------------------------------------------ */
/* KHỞI TẠO                                                            */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Hãy mở script từ Google Sheets (Tiện ích mở rộng → Apps Script).');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  secret_();
  ensureSheets_(false);
  seedData_(false);
  ensureRolesV2_();
  ensureAdmin_();
  ensureSecurityV3_();
  ensureConfigVersion_();
  ensureBackupTrigger_();
  ensureSchema_(true);
  return 'Khởi tạo thành công: ' + Object.keys(SCHEMA).length + ' bảng dữ liệu. Xem file README.md để triển khai Web App.';
}

/**
 * Nâng cấp lược đồ một cách idempotent (chạy một lần cho mỗi phiên bản).
 * Bổ sung sheet/cột mới mà không ghi đè dữ liệu đang chạy.
 */
function ensureSchema_(force) {
  var props = PropertiesService.getScriptProperties();
  var daApDung = String(props.getProperty('SCHEMA_VERSION_APPLIED') || '0');
  if (!force && Number(daApDung) >= Number(SCHEMA_VERSION)) {
    return { version: SCHEMA_VERSION, apDung: daApDung, migrated: false };
  }
  ensureSheets_(false);
  invalidateRows_();
  props.setProperty('SCHEMA_VERSION_APPLIED', SCHEMA_VERSION);
  try {
    log_('SYSTEM', 'NÂNG CẤP LƯỢC ĐỒ',
      'Lược đồ ' + daApDung + ' → ' + SCHEMA_VERSION + ' (' + Object.keys(SCHEMA).length + ' bảng)');
  } catch (e) { /* nhật ký không được chặn khởi động */ }
  return { version: SCHEMA_VERSION, apDung: SCHEMA_VERSION, migrated: true };
}

function ensureSheets_(force) {
  var ss = ss_();
  Object.keys(SCHEMA).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    var headers = SCHEMA[name];
    if (force || sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      styleHeader_(sheet, headers.length);
    } else {
      // Nâng cấp tại chỗ: bổ sung các cột mới vào cuối hàng tiêu đề
      // (rows_/append_ ánh xạ theo tên cột nên thứ tự cột không ảnh hưởng dữ liệu cũ).
      var lastCol = Math.max(sheet.getLastColumn(), 1);
      var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
        return String(h).trim();
      });
      var missing = headers.filter(function (h) { return current.indexOf(h) < 0; });
      if (missing.length) {
        sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
        styleHeader_(sheet, lastCol + missing.length);
      }
    }
  });
  var def = ss.getSheetByName('ThongTin');
  if (def) ss.deleteSheet(def);
}

function styleHeader_(sheet, soCot) {
  sheet.getRange(1, 1, 1, soCot)
    .setFontWeight('bold')
    .setBackground('#C8102E')
    .setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, soCot);
}

function seedData_(force) {
  if (!force && rows_('DM_CanBo').length > 0) return;

  if (force) {
    Object.keys(SCHEMA).forEach(function (name) {
      var sheet = ss_().getSheetByName(name);
      if (sheet && sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
    });
  }

  CAU_HINH_MAU.forEach(function (r) {
    append_('CauHinh', { Khoa: r[0], GiaTri: r[1], MoTa: r[2] });
  });

  AP_MAU.forEach(function (r) {
    append_('DM_Ap', { MaAp: r[0], TenAp: r[1], BiThu: r[2], ChiTieu: r[3], GhiChu: r[4] });
  });

  CANBO_MAU.forEach(function (r) {
    append_('DM_CanBo', mapCanBo_(r));
  });

  // Thẻ Đoàn viên đã cấp
  CANBO_MAU.filter(function (r) { return r[10]; }).forEach(function (r) {
    append_('TheDoanVien', {
      MaThe: r[10], MaDD: r[0], HoTen: r[1], MaAp: r[4],
      NgayCap: '05/01/2026', HetHan: '31/12/2026', NoiCapThe: 'Ban Chấp hành Chi đoàn Xã Tân Hòa',
      TrangThai: 'Đã cấp', NguoiCap: 'BT_CHIBO_XA'
    });
  });

  QUIZ_MAU.forEach(function (r) {
    append_('Quiz', {
      MaCau: r[0], NoiDung: r[1], A: r[2], B: r[3], C: r[4], D: r[5],
      DapAn: r[6], ChuDe: r[7], Diem: r[8], GiaiThich: r[9]
    });
  });

  // Lịch sử điểm & điểm danh mẫu (tạo cảm giác dữ liệu thật)
  var forms = [
    { hinhThuc: 'Trực tiếp', diem: 10 }, { hinhThuc: 'Hybrid', diem: 8 }, { hinhThuc: 'Zalo', diem: 5 }
  ];
  var phien = newId_('PH');
  append_('QR_Phien', {
    MaPhien: phien, MaAp: 'AP01', TieuDe: 'Sinh hoạt Chi đoàn tháng 10/2026',
    BatDau: nowStr_(), KetThuc: '', TrangThai: 'Đã kết thúc', NguoiTao: 'BT_AP01'
  });
  var phien2 = newId_('PH');
  append_('QR_Phien', {
    MaPhien: phien2, MaAp: 'AP02', TieuDe: 'Sinh hoạt Chi đoàn tháng 10/2026',
    BatDau: nowStr_(), KetThuc: '', TrangThai: 'Đã kết thúc', NguoiTao: 'BT_AP02'
  });

  var dv = CANBO_MAU.filter(function (r) { return r[2] === 4; });
  dv.forEach(function (m, i) {
    var f = forms[i % 3];
    append_('DiemDanh', {
      MaDD: m[0], MaPhien: phien, MaAp: m[4], HinhThuc: f.hinhThuc, Diem: f.diem,
      ThoiGian: '2026-10-12 19:30:00', ViDo: 10.5321, KinhDo: 106.4102, GhiChu: 'Dữ liệu mẫu'
    });
    append_('Diem_Log', {
      MaLog: newId_('P'), MaDD: m[0], MaAp: m[4], Loai: 'Điểm danh ' + f.hinhThuc,
      Diem: f.diem, GhiChu: 'Sinh hoạt tháng 10/2026', ThoiGian: '2026-10-12 19:30:00'
    });
    // Điểm nền = điểm ban đầu trừ phần đã ghi vào sổ điểm danh mẫu,
    // nhờ vậy đối soát DiemNen + SUM(Diem_Log) luôn khớp điểm hiện tại.
    update_('DM_CanBo', 'MaDD', m[0], { DiemNen: Number(m[8]) - Number(f.diem) });
  });

  // Đoàn phí: một số đã đóng
  dv.forEach(function (m, i) {
    if (i % 4 === 1) {
      append_('DoanPhi', {
        MaGiaoDich: newId_('DP'), MaAp: m[4], MaDD: m[0], HoTen: m[1], Nam: 2026, SoTien: 24000,
        NoiDung: 'DOANPHI ' + m[4] + ' ' + m[0], TrangThai: 'Đã xác nhận',
        NgayTao: '2026-01-15 09:00:00', NgayXacNhan: '2026-01-15 10:00:00',
        NguoiXacNhan: m[4] === 'AP01' ? 'BT_AP01' : (m[4] === 'AP02' ? 'BT_AP02' : 'BT_AP03')
      });
    }
  });

  // Tự đánh giá 360 mẫu cho DV01
  append_('TuDanhGia360', {
    MaDD: 'DV01', Nam: 2026, TuChinhTri: 5, DaoDuc: 5, ChuyenMon: 4, CongHien: 5, KyLuat: 5,
    TongDiem: 24, XepLoai: 'Hoàn thành xuất sắc', ThoiGian: '2026-09-30 20:00:00'
  });

  // Phản ánh SOS mẫu
  append_('SOS', {
    MaPA: 'PA-261015-AAAAAA', MaDD: 'DV03', HoTen: 'Trương Tấn Phát', MaAp: 'AP01',
    Loai: 'Rác thải tự phát', NoiDung: 'Bãi rác tự phát gần cầu Tân Bình, ảnh hưởng dòng chảy.',
    ViDo: 10.5335, KinhDo: 106.4125, Diem: 10, TrangThai: 'Chờ duyệt', MaNV: '',
    ThoiGian: '2026-10-15 07:20:00'
  });
  append_('SOS', {
    MaPA: 'PA-261016-BBBBBB', MaDD: 'DV07', HoTen: 'Huỳnh Gia Bảo', MaAp: 'AP02',
    Loai: 'Đèn đường hỏng', NoiDung: '03 bóng đèn đường tổ dân cư số 4 không sáng đã 2 tuần.',
    ViDo: 10.5310, KinhDo: 106.4078, Diem: 10, TrangThai: 'Đã chuyển nhiệm vụ', MaNV: 'NV-261016-CCCCCC',
    ThoiGian: '2026-10-16 19:45:00'
  });
  append_('NhiemVu', {
    MaNV: 'NV-261016-CCCCCC', TenNV: 'Thay bóng đèn đường tổ dân cư số 4',
    MaPA: 'PA-261016-BBBBBB', MaAp: 'AP02', ViDo: 10.5310, KinhDo: 106.4078,
    Diem: 15, TrangThai: 'Đang mở', NgayTao: '2026-10-17 08:00:00'
  });

  log_('SYSTEM', 'SETUP', 'Khởi tạo dữ liệu mẫu Chi đoàn Xã Tân Hòa');
}

/** Xóa trắng và nạp lại dữ liệu mẫu */
function resetDemo() {
  seedData_(true);
  ensureAdmin_();
  ensureSecurityV3_();
  ensureConfigVersion_();
  ensureBackupTrigger_();
  return 'Đã nạp lại dữ liệu mẫu.';
}

/** Ánh xạ một dòng CANBO_MAU sang bản ghi DM_CanBo. */
function mapCanBo_(r) {
  return {
    MaDD: r[0], HoTen: r[1], Cap: r[2], ChucVu: r[3], MaAp: r[4], DienThoai: r[5],
    NgaySinh: r[6], NgayVaoDoan: r[11] || '', NoiVaoDoan: r[12] || '',
    NgaySinhHoatDoan: r[13] || '', PIN: '', PINHash: hashPin_(r[0], r[7]),
    BatDoiPin: 'FALSE', SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
    Diem: r[8], DiemNen: r[8], TrangThai: r[9], MaThe: r[10],
    DaXoa: 'FALSE', NgayXoa: '', NguoiXoa: '',
    UyQuyenCho: '', UyQuyenDen: '', NgayThamGia: '01/01/2026', GhiChu: ''
  };
}

/**
 * Bổ sung dấu phiên bản cấu hình cho bảng tính đang chạy (nâng cấp tại chỗ).
 * Nhờ dấu này, client biết khi nào quản trị vừa thay đổi cấu hình/đơn vị/tài khoản.
 */
function ensureConfigVersion_() {
  if (findBy_('CauHinh', 'Khoa', 'PHIEN_BAN_CAU_HINH')) return false;
  append_('CauHinh', {
    Khoa: 'PHIEN_BAN_CAU_HINH',
    GiaTri: '1',
    MoTa: 'Phiên bản cấu hình — tăng khi quản trị thay đổi dữ liệu để các phiên tự đồng bộ'
  });
  return true;
}

/**
 * Nâng cấp bảo mật tại chỗ cho bảng tính đang chạy:
 *  - băm các PIN chữ thô còn sót lại,
 *  - bổ sung cờ xóa mềm / khóa đăng nhập / phiên bản token,
 *  - tính điểm nền để đối soát không làm sai lệch điểm mẫu.
 */
function ensureSecurityV3_() {
  var logSum = {};
  rows_('Diem_Log').forEach(function (r) {
    logSum[r.MaDD] = Number(logSum[r.MaDD] || 0) + Number(r.Diem || 0);
  });
  rows_('DM_CanBo').forEach(function (u) {
    var patch = {};
    if (u.TokenVersion === '' || u.TokenVersion === undefined || u.TokenVersion === null) patch.TokenVersion = 1;
    if (u.DaXoa === '' || u.DaXoa === undefined || u.DaXoa === null) patch.DaXoa = 'FALSE';
    if (u.BatDoiPin === '' || u.BatDoiPin === undefined || u.BatDoiPin === null) patch.BatDoiPin = 'FALSE';
    if (u.SoLanSai === '' || u.SoLanSai === undefined || u.SoLanSai === null) patch.SoLanSai = 0;
    if (u.DiemNen === '' || u.DiemNen === undefined || u.DiemNen === null) {
      patch.DiemNen = Number(u.Diem || 0) - Number(logSum[u.MaDD] || 0);
    }
    if (hasLegacyPin_(u)) {
      patch.PINHash = hashPin_(u.MaDD, String(u.PIN));
      patch.PIN = '';
    }
    if (Object.keys(patch).length) update_('DM_CanBo', 'MaDD', u.MaDD, patch);
  });
}

/**
 * Nâng cấp MỘT LẦN mô hình phân quyền cũ (C0–C3) lên mô hình C0–C4:
 *   C1 cũ (Bí thư Chi bộ Xã)     → C2
 *   C2 cũ (Bí thư Chi đoàn Ấp)   → C3
 *   C3 cũ (Đoàn viên)            → C4
 *   Bổ sung C1 mới: Chủ tịch Ủy Ban Hội LHTN Việt Nam Xã.
 * Dấu CauHinh.PHIEN_BAN_PHAN_QUYEN bảo đảm không dịch cấp lần thứ hai.
 */
function ensureRolesV2_() {
  var marker = findBy_('CauHinh', 'Khoa', 'PHIEN_BAN_PHAN_QUYEN');
  if (marker && String(marker.GiaTri) === PHIEN_BAN_PHAN_QUYEN) return false;
  migrateRoles_();
  return true;
}

function migrateRoles_() {
  var list = rows_('DM_CanBo');
  if (list.length) {
    list.forEach(function (u) {
      var cap = Number(u.Cap);
      if (cap >= 1 && cap <= 3) {
        update_('DM_CanBo', 'MaDD', u.MaDD, { Cap: cap + 1 });
      }
    });
    if (!findBy_('DM_CanBo', 'MaDD', 'CT_HOILHTN')) {
      append_('DM_CanBo', mapCanBo_(CANBO_MAU[0]));
    }
  }

  var marker = findBy_('CauHinh', 'Khoa', 'PHIEN_BAN_PHAN_QUYEN');
  if (marker) {
    update_('CauHinh', 'Khoa', 'PHIEN_BAN_PHAN_QUYEN', { GiaTri: PHIEN_BAN_PHAN_QUYEN });
  } else {
    append_('CauHinh', {
      Khoa: 'PHIEN_BAN_PHAN_QUYEN',
      GiaTri: PHIEN_BAN_PHAN_QUYEN,
      MoTa: 'Phiên bản mô hình phân quyền C0–C4 (dùng để nâng cấp một lần)'
    });
  }
  log_('SYSTEM', 'NÂNG CẤP PHÂN QUYỀN', 'Chuyển mô hình cũ sang C0–C4, bổ sung Cấp 1 Hội LHTN Xã');
}

/**
 * Bảo đảm tài khoản quản trị hệ thống (Cấp 0) luôn tồn tại.
 * Mật khẩu mặc định: ThanhnienvietnamXTH — bắt buộc đổi ở lần đăng nhập đầu.
 */
function ensureAdmin_() {
  var existing = findBy_('DM_CanBo', 'MaDD', 'ADMIN');
  var hash = hashMatKhau_('ADMIN', DEFAULT_ADMIN_PASSWORD);
  if (existing) {
    var patch = { TrangThai: 'Đang hoạt động', Cap: 0, MaAp: '', DaXoa: 'FALSE' };
    if (!existing.MatKhauHash) {
      patch.MatKhauHash = hash;
      patch.BatDoiMatKhau = 'TRUE';
    }
    if (existing.TokenVersion === '' || existing.TokenVersion === undefined) patch.TokenVersion = 1;
    if (existing.SoLanSai === '' || existing.SoLanSai === undefined) patch.SoLanSai = 0;
    update_('DM_CanBo', 'MaDD', 'ADMIN', patch);
    return existing;
  }
  append_('DM_CanBo', {
    MaDD: 'ADMIN', HoTen: 'Quản trị viên hệ thống', Cap: 0,
    ChucVu: 'Quản trị hệ thống', MaAp: '', DienThoai: '', NgaySinh: '',
    NgayVaoDoan: '', NoiVaoDoan: '', NgaySinhHoatDoan: '', PIN: '',
    Diem: 0, DiemNen: 0, TrangThai: 'Đang hoạt động', MaThe: '', UyQuyenCho: '', UyQuyenDen: '',
    NgayThamGia: nowStr_(), GhiChu: 'Tài khoản siêu quản trị — toàn quyền nghiệp vụ và quản trị hệ thống',
    MatKhauHash: hash, BatDoiMatKhau: 'TRUE',
    PINHash: '', BatDoiPin: 'FALSE', SoLanSai: 0, KhoaDen: '', TokenVersion: 1,
    DaXoa: 'FALSE', NgayXoa: '', NguoiXoa: ''
  });
  log_('ADMIN', 'KHỞI TẠO ADMIN', 'Tạo tài khoản quản trị hệ thống');
  return findBy_('DM_CanBo', 'MaDD', 'ADMIN');
}

/** Khôi phục mật khẩu Admin về mặc định (chạy từ Apps Script khi khẩn cấp) */
function resetAdminPassword() {
  var u = ensureAdmin_();
  update_('DM_CanBo', 'MaDD', 'ADMIN', {
    MatKhauHash: hashMatKhau_('ADMIN', DEFAULT_ADMIN_PASSWORD),
    BatDoiMatKhau: 'TRUE',
    TrangThai: 'Đang hoạt động',
    SoLanSai: 0,
    KhoaDen: '',
    TokenVersion: Number(u.TokenVersion || 0) + 1
  });
  log_('ADMIN', 'KHÔI PHỤC MẬT KHẨU', 'Đặt lại mật khẩu mặc định, bắt buộc đổi lần đăng nhập tới');
  return 'Đã khôi phục mật khẩu Admin về mặc định: ' + DEFAULT_ADMIN_PASSWORD +
    ' (bắt buộc đổi ở lần đăng nhập tới).';
}

/** Nạp thêm thành viên nhanh (dùng mảng CANBO_MAU hoặc mảng tùy biến) */
function themThanhVien(rows) {
  (rows || CANBO_MAU).forEach(function (r) {
    append_('DM_CanBo', mapCanBo_(r));
  });
  return 'Đã thêm ' + (rows || CANBO_MAU).length + ' tài khoản.';
}

/** Tạo trigger sao lưu hằng ngày (02:00) nếu chưa có. */
function ensureBackupTrigger_() {
  try {
    var exists = ScriptApp.getProjectTriggers().some(function (t) {
      return t.getHandlerFunction() === 'backupHangNgay';
    });
    if (!exists) {
      ScriptApp.newTrigger('backupHangNgay')
        .timeBased()
        .everyDays(1)
        .atHour(2)
        .create();
    }
    return true;
  } catch (e) {
    // Môi trường không cho tạo trigger (ví dụ chạy thử cục bộ) — bỏ qua.
    return false;
  }
}
