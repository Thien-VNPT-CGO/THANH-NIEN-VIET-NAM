/* Kiểm thử tự động hợp đồng API của mock-api.js (chạy bằng Node) */
const path = require('path');
global.window = {};
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};
require(path.join(__dirname, '..', 'web', 'mock-api.js'));
const api = window.MOCK_API;

let pass = 0, fail = 0;
function ok(cond, title) { if (cond) { pass++; console.log('  ✓ ' + title); } else { fail++; console.log('  ✗ ' + title); } }
async function expectError(p, title) {
  try { await p; fail++; console.log('  ✗ ' + title + ' (không báo lỗi)'); }
  catch (e) { pass++; console.log('  ✓ ' + title + ' → ' + e.message); }
}

(async () => {
  console.log('\n[1] Đăng nhập 4 cấp nghiệp vụ (C1–C4)');
  const ct = await api.call('auth.login', { maDD: 'CT_HOILHTN', pin: '123456' });
  ok(ct.profile.cap === 1, 'Cấp 1 (Chủ tịch Hội LHTN Xã) đăng nhập');
  const c1 = await api.call('auth.login', { maDD: 'BT_CHIBO_XA', pin: '123456' });
  ok(c1.profile.cap === 2, 'Cấp 2 (Bí thư Chi bộ Xã) đăng nhập');
  const c2 = await api.call('auth.login', { maDD: 'BT_AP01', pin: '123456' });
  ok(c2.profile.cap === 3, 'Cấp 3 (Bí thư Chi đoàn Ấp) đăng nhập');
  const c3 = await api.call('auth.login', { maDD: 'DV01', pin: '123456' });
  ok(c3.profile.cap === 4, 'Cấp 4 (Đoàn viên Ấp) đăng nhập');
  ok(ct.profile.tenAp === 'Ủy Ban Hội LHTN Việt Nam Xã Tân Hòa', 'Cấp 1 hiển thị đơn vị Hội LHTN Xã');
  ok(c1.profile.tenAp === 'Chi bộ Xã Tân Hòa', 'Cấp 2 hiển thị đơn vị Chi bộ Xã');
  ok(c2.profile.tenAp === 'Chi đoàn Ấp Tân Bình' && c3.profile.tenAp === 'Chi đoàn Ấp Tân Bình', 'Cấp 3/4 hiển thị Chi đoàn Ấp đầy đủ');
  await expectError(api.call('auth.login', { maDD: 'DV01', pin: '000000' }), 'Sai PIN bị chặn');

  console.log('\n[2] Dashboard theo phạm vi');
  const h1 = await api.call('home.summary', {}, ct.token);
  ok(h1.kpi.length === 4 && h1.apStats.length === 4, 'Cấp 1 thấy KPI + toàn bộ 4 Ấp');
  const h2 = await api.call('home.summary', {}, c1.token);
  ok(h2.apStats.length === 4, 'Cấp 2 (Bí thư Chi bộ Xã) thấy toàn bộ 4 Ấp');
  const h3 = await api.call('home.summary', {}, c2.token);
  ok(h3.apStats.length === 1, 'Cấp 3 chỉ thấy Ấp mình');
  const h4 = await api.call('home.summary', {}, c3.token);
  ok(h4.tienDo.diem === 340, 'Cấp 4 thấy điểm cá nhân');

  console.log('\n[3] Điểm danh QR động');
  const ses = await api.call('attendance.createSession', { tieuDe: 'Test sinh hoạt' }, c2.token);
  ok(!!ses.maPhien, 'Cấp 3 mở phiên cho Ấp mình');
  const sesXa = await api.call('attendance.createSession', { tieuDe: 'Họp Xã', maAp: 'AP02' }, c1.token);
  ok(!!sesXa.maPhien, 'Cấp 2 mở phiên cho bất kỳ Ấp');
  await expectError(api.call('attendance.createSession', { maAp: 'AP02' }, c3.token), 'Cấp 4 không được mở phiên');
  let live = await api.call('attendance.session', { maPhien: ses.maPhien }, c2.token);
  ok(live.token.length === 10, 'QR token 10 ký tự, còn ' + live.conLai + 's');
  const before = (await api.call('auth.me', {}, c3.token)).profile.diem;
  const scan = await api.call('attendance.scan', { payload: live.payload, hinhThuc: 'Trực tiếp' }, c3.token);
  ok(scan.diem === 10 && scan.tongDiem === before + 10, 'Quét QR +10 điểm');
  await expectError(api.call('attendance.scan', { payload: live.payload }, c3.token), 'Chống điểm danh trùng');
  await expectError(api.call('attendance.scan', { payload: 'CD6|' + ses.maPhien + '|SAI1234567' }, c3.token), 'Chặn token sai');
  const list = await api.call('attendance.list', {}, c3.token);
  ok(list.lichSu.length >= 1, 'Có lịch sử điểm danh cá nhân');

  console.log('\n[4] Ươm mầm Đỏ — C1/C2 duyệt, C3 đề cử');
  const um = await api.call('uommam.list', {}, c2.token);
  const dv01 = um.items.filter(x => x.maDD === 'DV01')[0];
  ok(dv01.duDieuKien === true, 'DV01 đủ 3 tiêu chuẩn');
  const umXa = await api.call('uommam.list', {}, c1.token);
  ok(umXa.items.length === 12, 'Cấp 2 thấy đủ 12 hồ sơ toàn Xã');
  await expectError(api.call('uommam.nominate', { maDD: 'DV01', nhanXet: 'Thử đề cử từ đoàn viên.' }, c3.token), 'Cấp 4 không được đề cử');
  const nom = await api.call('uommam.nominate', { maDD: 'DV01', nhanXet: 'Lập trường vững vàng, tích cực tình nguyện, có uy tín.' }, c2.token);
  ok(!!nom.message, 'Cấp 3 đề cử');
  await expectError(api.call('uommam.approve', { maDD: 'DV01' }, c2.token), 'Cấp 3 không được duyệt');
  const ap1 = await api.call('uommam.approve', { maDD: 'DV01' }, c1.token);
  ok(ap1.tongDiem === before + 35, 'Cấp 2 duyệt +25 điểm (sau +10 điểm danh)');
  const ap03 = await api.call('auth.login', { maDD: 'BT_AP03', pin: '123456' });
  await api.call('uommam.nominate', { maDD: 'DV09', nhanXet: 'Tinh thần trách nhiệm cao, gương mẫu trong Chi đoàn Ấp.' }, ap03.token);
  const ap2 = await api.call('uommam.approve', { maDD: 'DV09' }, ct.token);
  ok(ap2.tongDiem === 325, 'Cấp 1 duyệt hồ sơ Ấp khác +25 điểm');

  console.log('\n[5] Đoàn phí VietQR — C1/C2 toàn Xã');
  const my = await api.call('fee.my', {}, c3.token);
  ok(my.trangThai === 'Chưa đóng', 'Đoàn viên chưa đóng');
  const pay = await api.call('fee.pay', {}, c3.token);
  ok(pay.qrUrl.indexOf('img.vietqr.io') > 0 && pay.noiDung === 'DOANPHI AP01 DV01', 'Tạo VietQR đúng cú pháp');
  const sum = await api.call('fee.summary', {}, c2.token);
  ok(sum.pending.length >= 1 && sum.stats.length === 1, 'Giao dịch vào hàng chờ của Ấp');
  const sumXa = await api.call('fee.summary', {}, c1.token);
  ok(sumXa.stats.length === 4, 'Cấp 2 thấy Sổ quỹ toàn Xã');
  const c2b = await api.call('auth.login', { maDD: 'BT_AP02', pin: '123456' });
  await expectError(api.call('fee.confirm', { maGiaoDich: pay.maGiaoDich }, c2b.token), 'Cấp 3 Ấp khác không được xác nhận');
  const cf = await api.call('fee.confirm', { maGiaoDich: pay.maGiaoDich }, c2.token);
  ok(cf.diem === 10, 'Xác nhận đoàn phí +10 điểm');
  await api.call('fee.addExpense', { soTien: 50000, noiDung: 'Mua cờ Tổ quốc' }, c2.token);
  const sum2 = await api.call('fee.summary', {}, c2.token);
  ok(sum2.tonQuy < sum2.tongThu, 'Sổ quỹ ghi nhận khoản chi');
  await api.call('fee.addExpense', { soTien: 30000, noiDung: 'Hỗ trợ học sinh nghèo', maAp: 'AP03' }, c1.token);
  const sum3 = await api.call('fee.summary', {}, c1.token);
  ok(sum3.nhat.some(n => n.maAp === 'AP03' && n.loai === 'Chi' && n.noiDung === 'Hỗ trợ học sinh nghèo'), 'Cấp 2 ghi chi quỹ cho Ấp chỉ định');
  const dv05 = await api.call('auth.login', { maDD: 'DV05', pin: '123456' });
  const pay5 = await api.call('fee.pay', {}, dv05.token);
  const cf5 = await api.call('fee.confirm', { maGiaoDich: pay5.maGiaoDich }, ct.token);
  ok(cf5.diem === 10, 'Cấp 1 xác nhận đoàn phí Ấp khác');

  console.log('\n[6] Thẻ số & E-Cert');
  const card = await api.call('card.get', {}, c3.token);
  ok(card.maThe === 'TDV-2026-AP01-01', 'Thẻ đã tích hợp');
  ok(card.ngaySinh === '08/05/2003' && card.chucVu === 'Đoàn viên', 'Thẻ có ngày sinh và chức vụ');
  ok(card.ngayVaoDoan === '26/03/2021' && card.noiVaoDoan === 'Chi đoàn Ấp Tân Bình', 'Thẻ có ngày vào và nơi vào Đoàn');
  ok(card.noiCapThe === 'Ban Chấp hành Chi đoàn Xã Tân Hòa', 'Thẻ có nơi cấp thẻ');
  ok(card.tenAp === 'Chi đoàn Ấp Tân Bình', 'Thẻ hiển thị đơn vị đầy đủ');
  ok(card.ngaySinhHoatDoan === 'Ngày 25 hằng tháng', 'Thẻ có ngày sinh hoạt đoàn');
  const cert = await api.call('cert.issue', { loai: 'Giấy chứng nhận tình nguyện hè' }, c3.token);
  ok(cert.chuKySo.length >= 16, 'Cấp E-Cert có chữ ký số');
  const ev = await api.call('eval.submit', { tuChinhTri: 5, daoDuc: 5, chuyenMon: 4, congHien: 5, kyLuat: 5 }, c3.token);
  ok(ev.xepLoai === 'Hoàn thành xuất sắc', 'Tự đánh giá 360° xếp loại');
  const issue = await api.call('card.issue', { maDD: 'DV03' }, c2.token);
  ok(issue.tongDiem > 0, 'Cấp 3 tích hợp thẻ +20 điểm');
  const card3 = await api.call('card.get', { maDD: 'DV03' }, c2.token);
  ok(card3.noiCapThe === 'Ban Chấp hành Chi đoàn Ấp Tân Bình', 'Nơi cấp thẻ theo thẩm quyền Bí thư Chi đoàn Ấp');
  await expectError(api.call('card.issue', { maDD: 'DV02' }, c3.token), 'Cấp 4 không được cấp thẻ');
  const issueXa = await api.call('card.issue', { maDD: 'DV04' }, c1.token);
  ok(issueXa.tongDiem > 0, 'Cấp 2 cấp thẻ cho Ấp bất kỳ');
  const card4 = await api.call('card.get', { maDD: 'DV04' }, c1.token);
  ok(card4.noiCapThe === 'Ban Chấp hành Chi đoàn Xã Tân Hòa', 'Nơi cấp thẻ theo thẩm quyền cấp Xã');

  console.log('\n[7] SOS & Bản đồ');
  const sos = await api.call('sos.create', { loai: 'Đèn đường hỏng', noiDung: 'Đèn trước nhà văn hóa ấp bị hỏng.', viDo: 10.532, kinhDo: 106.41 }, c3.token);
  ok(sos.diem === 10, 'Gửi phản ánh +10 điểm');
  const sosList = await api.call('sos.list', {}, c2.token);
  const pa = sosList.items.filter(x => (x.TrangThai || x.trangThai) === 'Chờ duyệt')[0];
  const paId = pa ? (pa.MaPA || pa.maPA) : '';
  const nv = await api.call('sos.toMission', { maPA: paId, tenNV: 'Sửa đèn nhà văn hóa' }, c2.token);
  ok(!!nv.maNV, 'Chuyển SOS thành nhiệm vụ');
  const sosXa = await api.call('sos.list', {}, ct.token);
  ok(sosXa.thongKe.tong >= 3, 'Cấp 1 thấy phản ánh toàn Xã');
  const ck = await api.call('mission.checkin', { maNV: nv.maNV }, c3.token);
  ok(ck.diem === 15, 'Check-in nhiệm vụ +15 điểm');
  await expectError(api.call('mission.checkin', { maNV: nv.maNV }, c3.token), 'Chống check-in trùng');
  await expectError(api.call('sos.toMission', { maPA: paId, tenNV: 'Thử quyền' }, c3.token), 'Cấp 4 không được tạo nhiệm vụ');

  console.log('\n[8] Quiz & Bảng xếp hạng');
  const quiz = await api.call('quiz.list', {}, c3.token);
  ok(quiz.tongCau === 6, '6 câu hỏi');
  const ans = await api.call('quiz.answer', { maCau: 'Q01', dapAn: 'A' }, c3.token);
  ok(ans.dung === true && ans.diem === 15, 'Trả lời đúng +15 điểm');
  await expectError(api.call('quiz.answer', { maCau: 'Q01', dapAn: 'B' }, c3.token), 'Chống trả lời lại');
  const lb = await api.call('leaderboard', {}, c3.token);
  ok(lb.top.length > 0 && lb.aps.length === 4, 'Bảng xếp hạng cá nhân + Ấp');

  console.log('\n[9] Trợ lý AI');
  const bot = await api.call('bot.ask', { text: 'DIEM DV01' }, c3.token);
  ok(bot.reply.indexOf('Võ Minh Khoa') > 0, 'Tra cứu điểm qua bot');
  const botOther = await api.call('bot.ask', { text: 'DIEM DV05' }, c3.token);
  ok(botOther.reply.indexOf('Chi đoàn Ấp') > 0, 'Cấp 4 chỉ tra cứu trong Ấp mình');
  const warn = await api.call('bot.ask', { text: 'CANH BAO' }, c2.token);
  ok(!!warn.reply, 'Cảnh báo vắng > 60 ngày');
  const script = await api.call('bot.script', { noiDung: 'Đổi mới tập hợp đoàn viên', thoiLuong: 45 }, c2.token);
  ok(script.noiDung.indexOf('KỊCH BẢN') === 0, 'Sinh kịch bản họp');
  ok(script.noiDung.indexOf('Đơn vị: Chi đoàn Ấp Tân Bình — Xã Tân Hòa') >= 0, 'Kịch bản ghi đơn vị đầy đủ');
  const scriptXa = await api.call('bot.script', { noiDung: 'Họp Chi bộ', thoiLuong: 45 }, c1.token);
  ok(scriptXa.noiDung.indexOf('Đơn vị: Chi bộ Xã Tân Hòa') >= 0, 'Kịch bản cấp Xã ghi đơn vị Chi bộ Xã');
  const scriptCt = await api.call('bot.script', { noiDung: 'Họp Hội LHTN', thoiLuong: 45 }, ct.token);
  ok(scriptCt.noiDung.indexOf('Đơn vị: Ủy Ban Hội LHTN Việt Nam Xã Tân Hòa') >= 0, 'Kịch bản Cấp 1 ghi đơn vị Hội LHTN Xã');
  const minutes = await api.call('bot.minutes', { maDD: 'DV01' }, c2.token);
  ok(minutes.noiDung.indexOf('BIÊN BẢN') >= 0, 'Sinh biên bản giới thiệu Đảng');
  await expectError(api.call('bot.script', { noiDung: 'Thử', thoiLuong: 30 }, c3.token), 'Cấp 4 không được soạn kịch bản');

  console.log('\n[10] Quản trị & bảo mật');
  const add = await api.call('member.add', { hoTen: 'Nguyễn Test', dienThoai: '0912345678', ngaySinh: '01/01/2005' }, c2.token);
  ok(add.maDD === 'DV13', 'Cấp 3 thêm đoàn viên vào Ấp, mã tự tăng');
  await expectError(api.call('member.add', { hoTen: 'Sai SĐT', dienThoai: '123' }, c2.token), 'Validate số điện thoại');
  const yc = await api.call('auth.requestPinReset', { maDD: 'DV02', lyDo: 'Quên PIN' });
  ok(!!yc.maYC, 'Gửi yêu cầu cấp lại PIN');
  await expectError(api.call('auth.pendingResets', {}, c2.token), 'Cấp 3 không xem được hàng chờ PIN');
  const pend = await api.call('auth.pendingResets', {}, c1.token);
  const pendCt = await api.call('auth.pendingResets', {}, ct.token);
  ok(pend.items.length >= 1 && pendCt.items.length === pend.items.length, 'Cấp 1 và Cấp 2 cùng thấy hàng chờ PIN');
  const apr = await api.call('auth.approveReset', { maYC: pend.items[0].MaYC }, c1.token);
  ok(/^\d{6}$/.test(apr.pinMoi), 'Cấp 2 cấp PIN 6 số mới');
  const relogin = await api.call('auth.login', { maDD: 'DV02', pin: apr.pinMoi });
  ok(relogin.profile.maDD === 'DV02', 'Đăng nhập bằng PIN mới');
  const dele = await api.call('auth.delegate', { maDD: 'BT_AP01', gio: 24 }, c2.token);
  ok(!!dele.den, 'Cấp 3 ủy quyền 24h (self-test hợp lệ)');
  await expectError(api.call('auth.delegate', { maDD: 'BT_AP02', gio: 24 }, c2.token), 'Không ủy quyền sang Ấp khác');
  await expectError(api.call('auth.delegate', { maDD: 'DV01', gio: 24 }, c1.token), 'Cấp Xã không dùng ủy quyền cấp Ấp');
  await expectError(api.call('home.summary', {}, 'token.gia.mao'), 'Token giả bị từ chối');

  console.log('\n[11] Quản trị hệ thống Cấp 0');
  const ad = await api.call('auth.login', { maDD: 'ADMIN', pin: 'ThanhnienvietnamXTH' });
  ok(ad.profile.cap === 0 && ad.profile.batDoiMatKhau === true, 'Admin đăng nhập, buộc đổi mật khẩu');
  ok(ad.profile.tenAp === 'Toàn hệ thống', 'Admin hiển thị đơn vị: Toàn hệ thống');
  await expectError(api.call('auth.login', { maDD: 'ADMIN', pin: 'sai-mat-khau' }), 'Sai mật khẩu quản trị bị chặn');
  await expectError(api.call('admin.summary', {}, ct.token), 'Cấp 1 không vào được quản trị hệ thống');
  await expectError(api.call('admin.summary', {}, c1.token), 'Cấp 2 không vào được quản trị hệ thống');
  const chg = await api.call('auth.changePassword', {
    oldPassword: 'ThanhnienvietnamXTH', newPassword: 'MatKhauMoi2026', confirmPassword: 'MatKhauMoi2026'
  }, ad.token);
  ok(!!chg.message, 'Đổi mật khẩu quản trị');
  const ad2 = await api.call('auth.login', { maDD: 'ADMIN', pin: 'MatKhauMoi2026' });
  ok(ad2.profile.batDoiMatKhau === false, 'Đăng nhập mật khẩu mới, hết buộc đổi');

  // --- Chống khóa ADMIN từ xa (DoS) ---
  for (let i = 0; i < 5; i++) {
    await expectError(api.call('auth.login', { maDD: 'ADMIN', pin: 'sai-mat-khau-' + i }), 'Sai mật khẩu quản trị lần ' + (i + 1));
  }
  const adSoft = await api.call('auth.login', { maDD: 'ADMIN', pin: 'MatKhauMoi2026' });
  ok(!!adSoft.token, 'ADMIN vẫn đăng nhập được sau 5 lần sai (không bị khóa cứng từ xa)');

  const admSum = await api.call('admin.summary', {}, ad2.token);
  ok(admSum.soAp === 4 && admSum.soDoanVien >= 13, 'Tổng quan: 4 Ấp và đủ đoàn viên');
  ok(admSum.soCanBo === 6, 'Tổng quan: 6 cán bộ Cấp 1–3');
  const aps = await api.call('admin.ap.list', {}, ad2.token);
  ok(aps.items.length === 4 && aps.items[0].soDoanVien > 0, 'Danh sách Ấp kèm số đoàn viên');

  const newAp = await api.call('admin.ap.save', { tenAp: 'Ấp Tân Thới', chiTieu: 30 }, ad2.token);
  ok(newAp.maAp === 'AP05', 'Thêm Ấp mới, mã tự tăng');
  await expectError(api.call('admin.ap.delete', { maAp: 'AP01' }, ad2.token), 'Không xóa Ấp còn tài khoản');
  await api.call('admin.ap.save', { maAp: 'AP05', tenAp: 'Ấp Tân Thới', chiTieu: 35 }, ad2.token);
  const aps2 = await api.call('admin.ap.list', {}, ad2.token);
  ok(aps2.items.filter(a => a.maAp === 'AP05')[0].chiTieu === 35, 'Cập nhật thông tin Ấp');
  await api.call('admin.ap.delete', { maAp: 'AP05' }, ad2.token);
  const aps3 = await api.call('admin.ap.list', {}, ad2.token);
  ok(aps3.items.length === 4, 'Xóa Ấp khi không còn tài khoản');

  const cfgList = await api.call('admin.config.list', {}, ad2.token);
  ok(cfgList.items.some(i => i.khoa === 'DIEM_SOS' && i.giaTri === 10), 'Đọc cấu hình điểm');
  ok(cfgList.items.some(i => i.khoa === 'BI_THU_XA' && i.giaTri === 'Lê Văn Bình'), 'Cấu hình có tên Chủ tịch Ủy ban Hội LHTN Xã');
  await api.call('admin.config.save', {
    items: [{ khoa: 'DIEM_SOS', giaTri: '12' }, { khoa: 'TEN_XA', giaTri: 'Xã Tân Hòa 2' }]
  }, ad2.token);
  const cfg2 = await api.call('admin.config.list', {}, ad2.token);
  ok(cfg2.items.filter(i => i.khoa === 'DIEM_SOS')[0].giaTri === 12, 'Lưu cấu hình điểm');
  const sos2 = await api.call('sos.create', { loai: 'Rác thải', noiDung: 'Bãi rác mới sau nhà văn hóa ấp.' }, c3.token);
  ok(sos2.diem === 12, 'Điểm SOS áp dụng cấu hình mới');
  await api.call('admin.config.save', {
    items: [{ khoa: 'DIEM_SOS', giaTri: '10' }, { khoa: 'TEN_XA', giaTri: 'Xã Tân Hòa' }]
  }, ad2.token);

  const accList0 = await api.call('admin.account.list', { q: 'CT_HOILHTN' }, ad2.token);
  ok(accList0.items[0].tenAp === 'Ủy Ban Hội LHTN Việt Nam Xã Tân Hòa', 'Danh sách tài khoản: đơn vị Cấp 1');
  const accList1 = await api.call('admin.account.list', { q: 'BT_CHIBO_XA' }, ad2.token);
  ok(accList1.items[0].tenAp === 'Chi bộ Xã Tân Hòa', 'Danh sách tài khoản: đơn vị Cấp 2');

  const updCt = await api.call('admin.account.update', {
    maDD: 'CT_HOILHTN', hoTen: 'Lê Văn Bình (mới)', dienThoai: '0901234567',
    ngaySinh: '01/01/1985', ghiChu: 'Cập nhật bởi Admin'
  }, ad2.token);
  ok(updCt.maDD === 'CT_HOILHTN', 'Admin cập nhật hồ sơ Chủ tịch Hội LHTN Xã');
  const updCtRow = (await api.call('admin.account.list', { q: 'CT_HOILHTN' }, ad2.token)).items[0];
  ok(updCtRow.hoTen === 'Lê Văn Bình (mới)' && updCtRow.dienThoai === '0901234567' &&
    updCtRow.ngaySinh === '01/01/1985' && updCtRow.ghiChu === 'Cập nhật bởi Admin', 'Lưu họ tên, SĐT, ngày sinh, ghi chú Cấp 1');
  const cfgCt = (await api.call('admin.config.list', {}, ad2.token)).items.filter(i => i.khoa === 'BI_THU_XA')[0];
  ok(cfgCt.giaTri === 'Lê Văn Bình (mới)', 'Đổi tên Chủ tịch đồng bộ thông tin đơn vị');

  await api.call('admin.account.update', {
    maDD: 'BT_CHIBO_XA', hoTen: 'Nguyễn Văn Hòa (mới)', dienThoai: '0912345678'
  }, ad2.token);
  const updXaRow = (await api.call('admin.account.list', { q: 'BT_CHIBO_XA' }, ad2.token)).items[0];
  ok(updXaRow.hoTen === 'Nguyễn Văn Hòa (mới)' && updXaRow.dienThoai === '0912345678', 'Admin cập nhật hồ sơ Bí thư Chi bộ Xã');
  const cfgXa = (await api.call('admin.config.list', {}, ad2.token)).items.filter(i => i.khoa === 'PHO_BI_THU_XA')[0];
  ok(cfgXa.giaTri === 'Nguyễn Văn Hòa (mới)', 'Đổi tên Bí thư Chi bộ Xã đồng bộ thông tin đơn vị');

  await expectError(api.call('admin.account.update', { maDD: 'CT_HOILHTN', hoTen: '' }, ad2.token), 'Chặn cập nhật thiếu họ tên');
  await expectError(api.call('admin.account.update', { maDD: 'CT_HOILHTN', hoTen: 'Tên', dienThoai: '123' }, ad2.token), 'Chặn SĐT không hợp lệ khi cập nhật');
  await expectError(api.call('admin.account.update', { maDD: 'KHONG_CO', hoTen: 'Tên' }, ad2.token), 'Báo lỗi tài khoản không tồn tại');
  await expectError(api.call('admin.account.update', { maDD: 'CT_HOILHTN', hoTen: 'Tên' }, c2.token), 'Cấp 3 không cập nhật được tài khoản');

  await expectError(api.call('admin.account.status', { maDD: 'CT_HOILHTN', trangThai: 'Tạm khóa' }, ad2.token), 'Không khóa Chủ tịch Hội LHTN Xã cuối cùng');
  await expectError(api.call('admin.account.status', { maDD: 'BT_CHIBO_XA', trangThai: 'Tạm khóa' }, ad2.token), 'Không khóa Bí thư Chi bộ Xã cuối cùng');

  const acc = await api.call('admin.account.create', {
    maDD: 'BT_AP09', hoTen: 'Nguyễn Bí Thư', cap: 3, maAp: 'AP02'
  }, ad2.token);
  ok(acc.maDD === 'BT_AP09', 'Tạo tài khoản Cấp 3');
  const accRow = (await api.call('admin.account.list', { q: 'BT_AP09' }, ad2.token)).items[0];
  ok(accRow.chucVu === 'Bí thư Chi đoàn Ấp Tân Lập', 'Cấp 3 tự sinh chức vụ theo Ấp');
  await expectError(api.call('admin.account.create', {
    maDD: 'BT_AP09', hoTen: 'Trùng Mã', cap: 3, maAp: 'AP02'
  }, ad2.token), 'Chặn trùng mã định danh');
  await expectError(api.call('admin.account.create', {
    maDD: 'BT_AP10', hoTen: 'Thiếu Ấp', cap: 3
  }, ad2.token), 'Cấp 3/4 bắt buộc chọn Ấp');
  const accCt = await api.call('admin.account.create', {
    maDD: 'CT_XA2', hoTen: 'Phó Chủ tịch Hội', cap: 1
  }, ad2.token);
  ok(accCt.maDD === 'CT_XA2', 'Tạo tài khoản Cấp 1 không cần Ấp');
  const accCtRow = (await api.call('admin.account.list', { q: 'CT_XA2' }, ad2.token)).items[0];
  ok(accCtRow.maAp === '' && accCtRow.chucVu === 'Chủ Tịch', 'Cấp 1 không gắn Ấp, chức vụ Chủ Tịch');
  const accXa = await api.call('admin.account.create', {
    maDD: 'BT_XA2', hoTen: 'Bí thư Chi bộ 2', cap: 2, maAp: 'AP01'
  }, ad2.token);
  ok(accXa.maDD === 'BT_XA2', 'Tạo tài khoản Cấp 2');
  const accXaRow = (await api.call('admin.account.list', { q: 'BT_XA2' }, ad2.token)).items[0];
  ok(accXaRow.maAp === '', 'Cấp 2 không gắn Ấp dù payload có maAp');

  await api.call('admin.account.status', { maDD: 'BT_AP09', trangThai: 'Tạm khóa' }, ad2.token);
  const accLock = (await api.call('admin.account.list', { q: 'BT_AP09' }, ad2.token)).items[0];
  ok(accLock.trangThai === 'Tạm khóa', 'Khóa tài khoản');
  await api.call('admin.account.status', { maDD: 'BT_AP09', trangThai: 'Đang hoạt động' }, ad2.token);
  const pinR = await api.call('admin.account.resetPin', { maDD: 'BT_AP09' }, ad2.token);
  ok(/^\d{6}$/.test(pinR.pin), 'Cấp lại PIN 6 số');
  await expectError(api.call('admin.account.status', { maDD: 'ADMIN', trangThai: 'Tạm khóa' }, ad2.token), 'Không khóa được tài khoản Admin');
  const logs = await api.call('admin.logs', { q: 'Ấp', limit: 50 }, ad2.token);
  ok(logs.tong >= 2 && logs.items.length > 0, 'Nhật ký ghi thao tác quản trị');
  await expectError(api.call('admin.logs', {}, c2.token), 'Cấp 3 không xem được nhật ký hệ thống');

  console.log('\n[12] Admin toàn quyền nghiệp vụ & CRUD đoàn viên');
  const aDis = await api.call('attendance.list', {}, ad2.token);
  ok(aDis.items.length >= 12, 'Admin xem điểm danh toàn Xã');
  const aFee = await api.call('fee.summary', {}, ad2.token);
  ok(aFee.stats.length === 4, 'Admin xem Sổ quỹ toàn Xã');
  const aCard = await api.call('card.list', {}, ad2.token);
  ok(aCard.items.length >= 12, 'Admin thấy danh sách thẻ toàn Xã');
  const aUm = await api.call('uommam.list', {}, ad2.token);
  ok(aUm.items.length >= 12, 'Admin thấy hồ sơ Ươm mầm toàn Xã');
  const aPend = await api.call('auth.pendingResets', {}, ad2.token);
  ok(Array.isArray(aPend.items), 'Admin xem hàng chờ PIN');
  const aSes = await api.call('attendance.createSession', { tieuDe: 'Họp do Admin mở', maAp: 'AP03' }, ad2.token);
  ok(!!aSes.maPhien, 'Admin mở phiên điểm danh cho Ấp chỉ định');
  await api.call('attendance.close', { maPhien: aSes.maPhien }, ad2.token);
  const aDele = await api.call('auth.delegate', { maDD: 'BT_AP02', gio: 8 }, ad2.token);
  ok(!!aDele.den, 'Admin ủy quyền cho cán bộ bất kỳ Ấp');
  const aIssue = await api.call('card.issue', { maDD: 'DV07' }, ad2.token);
  ok(aIssue.tongDiem > 0, 'Admin cấp thẻ cho đoàn viên bất kỳ Ấp');

  await expectError(api.call('fee.addExpense', { soTien: 20000, noiDung: 'Thiếu Ấp' }, ad2.token), 'Admin ghi chi phải chọn Ấp');
  const aExp = await api.call('fee.addExpense', { soTien: 20000, noiDung: 'Admin ghi chi', maAp: 'AP02' }, ad2.token);
  ok(!!aExp.message, 'Admin ghi chi quỹ cho Ấp chỉ định');

  const aAdd = await api.call('member.add', { hoTen: 'Đoàn viên Admin tạo', dienThoai: '0911222333', ngaySinh: '02/02/2006', maAp: 'AP02' }, ad2.token);
  ok(aAdd.maDD === 'DV14', 'Admin thêm đoàn viên vào Ấp chỉ định');
  const aUpd = await api.call('member.update', {
    maDD: aAdd.maDD, hoTen: 'Đoàn viên Admin sửa', dienThoai: '0911222444',
    ngaySinh: '03/03/2006', maAp: 'AP03', ghiChu: 'Cập nhật bởi Admin'
  }, ad2.token);
  ok(!!aUpd.message, 'Admin cập nhật thông tin đoàn viên');
  const aList = await api.call('member.list', { maAp: 'AP03' }, ad2.token);
  const aRow = aList.items.filter(x => x.maDD === aAdd.maDD)[0];
  ok(aRow && aRow.hoTen === 'Đoàn viên Admin sửa' && aRow.dienThoai === '0911222444', 'Dữ liệu sửa được lưu đúng');
  const aDel = await api.call('member.delete', { maDD: aAdd.maDD }, ad2.token);
  ok(!!aDel.message, 'Admin xóa đoàn viên');
  const aGone = await api.call('member.list', {}, ad2.token);
  ok(!aGone.items.some(x => x.maDD === aAdd.maDD), 'Đoàn viên đã bị xóa khỏi danh sách');
  await expectError(api.call('member.delete', { maDD: 'BT_AP01' }, ad2.token), 'Không xóa tài khoản cán bộ qua màn hình đoàn viên');

  // --- Phân trang danh sách đoàn viên ---
  const pg1 = await api.call('member.list', { limit: 2, offset: 0 }, ad2.token);
  const pg2 = await api.call('member.list', { limit: 2, offset: 2 }, ad2.token);
  ok(pg1.items.length === 2 && pg1.tongSo >= 4 && pg1.conNua === true,
    'Phân trang: trang 1 có 2 đoàn viên và còn trang sau');
  ok(pg2.items.length > 0 && pg1.items[0].maDD !== pg2.items[0].maDD,
    'Phân trang: trang 2 trả đoàn viên khác trang 1');
  ok(pg1.tongSo === pg2.tongSo && pg1.items.length + pg2.items.length <= pg1.tongSo,
    'Phân trang: tổng số nhất quán, không trùng lặp');
  const pgAll = await api.call('member.list', {}, ad2.token);
  ok(pgAll.tongSo === pgAll.items.length && pgAll.conNua === false,
    'Không truyền limit: trả toàn bộ (tương thích cũ)');

  console.log('\n[13] Sức khỏe, báo cáo & nhắc việc (Gói D/E/F)');
  const health = await api.call('system.health', {}, ad2.token);
  ok(health.soSheet === 20 && health.phienBanSchema === '3', 'Sức khỏe: đủ 20 bảng, lược đồ v3');
  ok(health.kiemTra.length >= 7 && health.trangThai !== 'loi', 'Sức khỏe: đủ danh mục kiểm tra và không có lỗi');
  await expectError(api.call('system.health', {}, c1.token), 'Cấp 1 không xem được sức khỏe hệ thống');

  const rp = await api.call('report.summary', { tuNgay: '01/01/2026', denNgay: '31/12/2026' }, ad2.token);
  ok(rp.doanVien > 0 && rp.theoAp.length === 4, 'Báo cáo năm: có đoàn viên và đủ 4 Ấp');
  ok(rp.tuNgay === '01/01/2026' && rp.denNgay === '31/12/2026', 'Báo cáo giữ đúng khoảng thời gian');
  ok(rp.top.length > 0 && rp.top.length <= 5, 'Báo cáo có top 5 điểm rèn luyện');
  const rpAp = await api.call('report.summary', {
    tuNgay: '01/01/2026', denNgay: '31/12/2026', maAp: 'AP02'
  }, ad2.token);
  ok(rpAp.theoAp.length === 1 && rpAp.theoAp[0].maAp === 'AP02', 'Báo cáo lọc theo Chi đoàn Ấp');
  await expectError(api.call('report.summary', { tuNgay: '31/12/2026', denNgay: '01/01/2026' }, ad2.token),
    'Chặn khoảng thời gian đảo ngược');
  await expectError(api.call('report.summary', {}, c1.token), 'Cấp 1 không xuất báo cáo hệ thống');

  const ex = await api.call('report.export', { tuNgay: '01/01/2026', denNgay: '31/12/2026', loai: 'doanVien' }, ad2.token);
  ok(ex.tenFile.indexOf('.csv') > 0 && ex.mime.indexOf('text/csv') === 0, 'Xuất CSV đúng tên tệp và MIME');
  ok(ex.noiDung.charCodeAt(0) === 0xFEFF, 'CSV có BOM UTF-8 để Excel đọc tiếng Việt');
  ok(ex.noiDung.split('\r\n').length === ex.soDong + 1 && ex.soDong > 0, 'CSV có header + đúng số dòng dữ liệu');
  const exDD = await api.call('report.export', { tuNgay: '01/01/2026', denNgay: '31/12/2026', loai: 'diemDanh' }, ad2.token);
  ok(exDD.noiDung.indexOf('Mã đoàn viên') > 0 && exDD.noiDung.indexOf('Hình thức') > 0, 'CSV điểm danh có đủ cột nghiệp vụ');
  const exFee = await api.call('report.export', { tuNgay: '01/01/2026', denNgay: '31/12/2026', loai: 'doanPhi' }, ad2.token);
  ok(exFee.noiDung.indexOf('Mã giao dịch') > 0, 'CSV đoàn phí có mã giao dịch');
  const ex360 = await api.call('report.export', { tuNgay: '01/01/2026', denNgay: '31/12/2026', loai: '360' }, ad2.token);
  ok(ex360.noiDung.indexOf('Xếp loại') > 0, 'CSV tự đánh giá 360° có xếp loại');

  const pv = await api.call('admin.notify.preview', { loai: 'chuaDongPhi' }, ad2.token);
  ok(pv.soNguoi > 0 && pv.noiDungMau.indexOf('đoàn phí') > 0, 'Xem trước nhắc đoàn viên chưa đóng phí');
  const pvCb = await api.call('admin.notify.preview', { loai: 'canBo' }, ad2.token);
  ok(pvCb.soNguoi >= 5, 'Xem trước nhắc cán bộ Cấp 1–3');
  await expectError(api.call('admin.notify.preview', { loai: 'khongHopLe' }, ad2.token), 'Chặn loại nhắc việc không hợp lệ');

  const sent = await api.call('admin.notify.send', {
    loai: 'tatCa', kenh: 'inapp',
    tieuDe: 'Thông báo kiểm thử D/E/F',
    noiDung: 'Nội dung kiểm thử hệ thống nhắc việc.'
  }, ad2.token);
  ok(!!sent.maTB && sent.soNguoi > 0 && sent.trangThai === 'Đã phát hành', 'Gửi nhắc việc trong ứng dụng');
  const myNoti = await api.call('notify.my', {}, c3.token);
  ok(myNoti.items.some(x => x.maTB === sent.maTB), 'Đoàn viên nhận thông báo toàn Xã');
  ok(sent.zaloText.indexOf('Nội dung kiểm thử') === 0, 'Trả nội dung sẵn sàng đăng nhóm Zalo');

  const sentAp = await api.call('admin.notify.send', {
    loai: 'tatCa', maAp: 'AP02', kenh: 'email', emailNhan: 'test@example.com',
    tieuDe: 'Thông báo riêng Ấp Tân Lập', noiDung: 'Nội dung dành riêng Ấp Tân Lập.'
  }, ad2.token);
  ok(!!sentAp.maTB && /email/.test(sentAp.trangThai), 'Gửi nhắc việc qua email (mô phỏng)');
  const notiAp02 = await api.call('notify.my', {}, dv05.token);
  ok(notiAp02.items.some(x => x.maTB === sentAp.maTB), 'Đoàn viên Ấp Tân Lập nhận đúng thông báo Ấp mình');
  const notiAp01 = await api.call('notify.my', {}, c3.token);
  ok(!notiAp01.items.some(x => x.maTB === sentAp.maTB), 'Đoàn viên Ấp khác không thấy thông báo riêng');
  const listN = await api.call('admin.notify.list', {}, ad2.token);
  ok(listN.items.some(x => x.maTB === sent.maTB), 'Nhật ký nhắc việc lưu thông báo vừa gửi');
  await expectError(api.call('admin.notify.send', {
    loai: 'tatCa', kenh: 'inapp', tieuDe: '', noiDung: 'Thiếu tiêu đề'
  }, ad2.token), 'Chặn gửi nhắc việc thiếu tiêu đề');
  await expectError(api.call('admin.notify.list', {}, c1.token), 'Cấp 1 không xem được danh sách nhắc việc');

  let rateBlocked = false;
  for (let i = 0; i < 31; i++) {
    try {
      await api.call('auth.login', { maDD: 'RL_TEST_USER', pin: '000000' });
    } catch (e) {
      if (/quá nhiều lần/.test(e.message)) { rateBlocked = true; break; }
    }
  }
  ok(rateBlocked, 'Rate limit chặn sau 30 lần sai trong 10 phút');

  console.log('\n[14] Bảo mật nâng cao & toàn vẹn dữ liệu');
  // --- Khóa tạm thời sau 5 lần nhập sai ---
  const lockAdd = await api.call('member.add', {
    hoTen: 'Đoàn viên Khóa Thử', dienThoai: '0933444555', ngaySinh: '05/05/2004', maAp: 'AP01'
  }, c2.token);
  for (let i = 0; i < 5; i++) {
    await expectError(api.call('auth.login', { maDD: lockAdd.maDD, pin: '000001' }), 'Sai PIN lần ' + (i + 1));
  }
  await expectError(api.call('auth.login', { maDD: lockAdd.maDD, pin: '123456' }), 'Tài khoản bị khóa tạm 15 phút sau 5 lần sai');
  await expectError(api.call('auth.login', { maDD: 'KHONG_TON_TAI', pin: '123456' }), 'Không tiết lộ tài khoản có tồn tại hay không');
  const unlock = await api.call('admin.account.status', { maDD: lockAdd.maDD, trangThai: 'Đang hoạt động' }, ad2.token);
  ok(!!unlock.message, 'Admin mở khóa tài khoản đang bị khóa tạm');
  const afterUnlock = await api.call('auth.login', { maDD: lockAdd.maDD, pin: '123456' }, ad2.token);
  ok(afterUnlock.profile.batDoiPin === true, 'Tài khoản mới buộc đổi PIN ở lần đăng nhập đầu');

  // --- Đăng xuất thu hồi token ---
  const lv = await api.call('auth.login', { maDD: 'DV04', pin: '123456' });
  await api.call('auth.logout', {}, lv.token);
  await expectError(api.call('auth.me', {}, lv.token), 'Token cũ bị thu hồi sau khi đăng xuất');

  // --- Tự đổi PIN ---
  const cp = await api.call('auth.login', { maDD: 'DV06', pin: '123456' });
  const cpRes = await api.call('auth.changePin', {
    oldPin: '123456', newPin: '482915', confirmPin: '482915'
  }, cp.token);
  ok(!!cpRes.token && cpRes.token !== cp.token, 'Đổi PIN trả về token mới');
  await expectError(api.call('auth.me', {}, cp.token), 'Token cũ bị thu hồi sau khi đổi PIN');
  const cpAgain = await api.call('auth.login', { maDD: 'DV06', pin: '482915' });
  ok(cpAgain.profile.batDoiPin === false, 'Đăng nhập bằng PIN mới, hết buộc đổi PIN');
  await expectError(api.call('auth.changePin', { oldPin: '482915', newPin: '123456', confirmPin: '123456' }, cpAgain.token), 'Chặn PIN quá đơn giản');

  // --- Xóa mềm & khôi phục ---
  const softAdd = await api.call('member.add', {
    hoTen: 'Đoàn viên Xóa Mềm', dienThoai: '0933444666', ngaySinh: '06/06/2004', maAp: 'AP01'
  }, c2.token);
  await api.call('member.delete', { maDD: softAdd.maDD }, c2.token);
  const activeList = await api.call('admin.account.list', { q: softAdd.maDD }, ad2.token);
  ok(activeList.items.length === 0, 'Tài khoản đã xóa mềm không còn trong danh sách hoạt động');
  const trashList = await api.call('admin.account.list', { q: softAdd.maDD, daXoa: true }, ad2.token);
  ok(trashList.items.length === 1 && trashList.items[0].daXoa === true, 'Tài khoản xuất hiện trong thùng rác');
  await expectError(api.call('auth.login', { maDD: softAdd.maDD, pin: '123456' }), 'Tài khoản đã xóa mềm không đăng nhập được');
  const restored = await api.call('member.restore', { maDD: softAdd.maDD }, ad2.token);
  ok(!!restored.message, 'Admin khôi phục tài khoản đã xóa mềm');
  const activeAgain = await api.call('admin.account.list', { q: softAdd.maDD }, ad2.token);
  ok(activeAgain.items.length === 1, 'Tài khoản trở lại danh sách hoạt động sau khôi phục');

  // --- Sao lưu & đối soát ---
  const bk = await api.call('admin.backup.now', {}, ad2.token);
  ok(!!bk.ten, 'Tạo bản sao lưu thủ công');
  const bkList = await api.call('admin.backup.list', {}, ad2.token);
  ok(bkList.items.some(x => x.ten === bk.ten), 'Danh sách sao lưu có bản vừa tạo');
  const bkCheck = await api.call('admin.backup.verify', { id: bk.id }, ad2.token);
  ok(bkCheck.hopLe === true && bkCheck.soSheet === 20, 'Kiểm tra bản sao lưu: mở được, đủ 20 bảng');
  const bkRestore = await api.call('admin.backup.restoreCopy', {
    id: bk.id, xacNhan: 'PHUC HOI'
  }, ad2.token);
  ok(!!bkRestore.id && /KHÔNG bị thay đổi/.test(bkRestore.message), 'Phục hồi ra bản sao mới, không ghi đè dữ liệu');
  await expectError(api.call('admin.backup.restoreCopy', { id: bk.id, xacNhan: 'SAI' }, ad2.token), 'Chặn phục hồi khi xác nhận sai');
  await expectError(api.call('admin.backup.verify', { id: bk.id }, c1.token), 'Cấp 1 không được kiểm tra sao lưu');
  const rec = await api.call('admin.reconcile', {}, ad2.token);
  ok(rec.soTaiKhoan > 0 && rec.soLech === 0, 'Đối soát điểm: toàn bộ điểm khớp sổ điểm');
  await expectError(api.call('admin.backup.now', {}, c1.token), 'Cấp 1 không được tự sao lưu hệ thống');
  await expectError(api.call('member.restore', { maDD: 'DV01' }, c2.token), 'Cấp 2 không được khôi phục thùng rác');

  // --- Đồng bộ cấu hình realtime ---
  const metaBefore = await api.call('meta.config', {});
  ok(metaBefore.phienBan >= 1, 'Meta công khai trả về phiên bản cấu hình');
  const oldVer = metaBefore.phienBan;
  await api.call('admin.config.save', {
    items: [{ khoa: 'TEN_XA', giaTri: 'Xã Tân Hòa (Live)' }]
  }, ad2.token);
  const metaAfter = await api.call('meta.config', {});
  ok(metaAfter.phienBan > oldVer, 'Lưu cấu hình tăng phiên bản đồng bộ');
  const meAfter = await api.call('auth.me', {}, ct.token);
  ok(meAfter.phienBan === metaAfter.phienBan, 'Phiên Cấp 1 nhận phiên bản cấu hình mới');
  ok(meAfter.config.tenXa === 'Xã Tân Hòa (Live)', 'Phiên Cấp 1 nhận tên Xã mới mà không cần đăng nhập lại');

  console.log('\n──────── KẾT QUẢ: ' + pass + ' đạt / ' + fail + ' lỗi ────────\n');
  process.exit(fail ? 1 : 0);
})();
