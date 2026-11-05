/**
 * Code.gs — Điểm vào Web App: routing API + phục vụ giao diện.
 *
 * Triển khai:  Triển khai → Triển khai mới → Ứng dụng web
 *   - Thực thi dưới danh nghĩa: Tôi (chủ sở hữu bảng tính)
 *   - Ai có quyền truy cập: Bất kỳ ai
 */

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) || 'Index';
  var output = HtmlService.createHtmlOutputFromFile(page === 'Index' ? 'Index' : 'Index');
  return output
    .setTitle('Chi đoàn số 6.0 — Xã Tân Hòa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    // Không cho nhúng iframe bên thứ ba (giảm rủi ro clickjacking).
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * Hàm API duy nhất được gọi từ client qua google.script.run.
 * @param {string} action  Tên hành động (vd: "attendance.scan")
 * @param {object} payload Dữ liệu đầu vào
 * @param {string} token   Token phiên đăng nhập
 */
function api(action, payload, token) {
  payload = payload || {};
  try {
    // Nâng cấp lược đồ một lần cho mỗi phiên bản (không chạy lại trên mỗi request).
    try { ensureSchema_(); }
    catch (e) { Logger.log('Không nâng cấp được lược đồ: ' + (e && e.message ? e.message : e)); }
    // Đồng bộ danh mục 11 Chi đoàn Ấp + tài khoản Bí thư một lần (không chặn API nếu lỗi).
    try { ensureDanhMucApOnce_(); }
    catch (e) { Logger.log('Không đồng bộ được danh mục Chi đoàn Ấp: ' + (e && e.message ? e.message : e)); }
    // Bổ sung đoàn viên ngẫu nhiên một lần cho mỗi Ấp (mỗi Ấp đạt 5–15 người).
    try { ensureRandomMembersOnce_(); }
    catch (e) { Logger.log('Không bổ sung được đoàn viên ngẫu nhiên: ' + (e && e.message ? e.message : e)); }

    // -------- Nhóm công khai (không cần đăng nhập) --------
    if (action === 'auth.login') return ok_(withLock_(function () { return svc_login(payload); }));
    if (action === 'auth.requestPinReset') return ok_(svc_requestPinReset(payload));
    if (action === 'meta.config') return ok_(svc_metaConfig());

    // -------- Bắt buộc đăng nhập --------
    var user = readToken_(token);
    if (!user) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    if (!isActiveUser_(user)) throw new Error('Tài khoản đã bị tạm khóa hoặc đã xóa.');

    var routes = {
      'auth.me': function () { return { profile: publicProfile_(user), config: svc_metaConfig().config, phienBan: configVersion_() }; },
      'auth.logout': function () { return svc_logout(user); },
      'auth.changePin': function () { return svc_changePin(user, payload); },
      'auth.changePassword': function () { return svc_changePassword(user, payload); },
      'auth.pendingResets': function () { return svc_pendingResets(user); },
      'auth.approveReset': function () { return svc_approveReset(user, payload); },
      'auth.delegate': function () { return svc_delegate(user, payload); },

      'home.summary': function () { return svc_homeSummary(user); },
      'ap.list': function () { return svc_apList(user); },
      'member.list': function () { return svc_memberList(user, payload); },
      'member.add': function () { return svc_memberAdd(user, payload); },
      'member.update': function () { return svc_memberUpdate(user, payload); },
      'member.delete': function () { return svc_memberDelete(user, payload); },
      'member.restore': function () { return svc_memberRestore(user, payload); },

      'attendance.createSession': function () { return svc_createSession(user, payload); },
      'attendance.session': function () { return svc_session(user, payload); },
      'attendance.scan': function () { return svc_scan(user, payload); },
      'attendance.close': function () { return svc_closeSession(user, payload); },
      'attendance.list': function () { return svc_attendanceList(user, payload); },

      'uommam.list': function () { return svc_uomMamList(user, payload); },
      'uommam.nominate': function () { return svc_uomMamNominate(user, payload); },
      'uommam.approve': function () { return svc_uomMamApprove(user, payload); },
      'uommam.reject': function () { return svc_uomMamReject(user, payload); },

      'fee.summary': function () { return svc_feeSummary(user, payload); },
      'fee.my': function () { return svc_feeMy(user, payload); },
      'fee.pay': function () { return svc_feePay(user, payload); },
      'fee.confirm': function () { return svc_feeConfirm(user, payload); },
      'fee.addExpense': function () { return svc_feeAddExpense(user, payload); },

      'card.get': function () { return svc_cardGet(user, payload); },
      'card.list': function () { return svc_cardList(user, payload); },
      'card.issue': function () { return svc_cardIssue(user, payload); },
      'eval.submit': function () { return svc_evalSubmit(user, payload); },
      'cert.issue': function () { return svc_certIssue(user, payload); },

      'sos.list': function () { return svc_sosList(user, payload); },
      'sos.create': function () { return svc_sosCreate(user, payload); },
      'sos.toMission': function () { return svc_sosToMission(user, payload); },
      'mission.checkin': function () { return svc_missionCheckin(user, payload); },

      'quiz.list': function () { return svc_quizList(user); },
      'quiz.answer': function () { return svc_quizAnswer(user, payload); },
      'leaderboard': function () { return svc_leaderboard(user); },

      'bot.ask': function () { return svc_botAsk(user, payload); },
      'bot.script': function () { return svc_botScript(user, payload); },
      'bot.minutes': function () { return svc_botMinutes(user, payload); },

      /* -------- Quản trị hệ thống (Cấp 0) -------- */
      'admin.summary': function () { return svc_adminSummary(user); },
      'admin.ap.list': function () { return svc_adminApList(user); },
      'admin.ap.save': function () { return svc_adminApSave(user, payload); },
      'admin.ap.delete': function () { return svc_adminApDelete(user, payload); },
      'admin.config.list': function () { return svc_adminConfigList(user); },
      'admin.config.save': function () { return svc_adminConfigSave(user, payload); },
      'admin.account.list': function () { return svc_adminAccountList(user, payload); },
      'admin.account.create': function () { return svc_adminAccountCreate(user, payload); },
      'admin.account.update': function () { return svc_adminAccountUpdate(user, payload); },
      'admin.account.status': function () { return svc_adminAccountStatus(user, payload); },
      'admin.account.resetPin': function () { return svc_adminAccountResetPin(user, payload); },
      'admin.account.restore': function () { return svc_memberRestore(user, payload); },
      'admin.backup.list': function () { return svc_backupList(user); },
      'admin.backup.now': function () { return svc_backupNow(user); },
      'admin.backup.verify': function () { return svc_backupVerify(user, payload); },
      'admin.backup.restoreCopy': function () { return svc_backupRestoreCopy(user, payload); },
      'admin.reconcile': function () { return svc_reconcilePoints(user); },
      'admin.logs': function () { return svc_adminLogs(user, payload); },

      /* -------- Sức khỏe, báo cáo & nhắc việc -------- */
      'system.health': function () { return svc_health(user); },
      'report.summary': function () { return svc_reportSummary(user, payload); },
      'report.export': function () { return svc_reportExport(user, payload); },
      'notify.my': function () { return svc_notifyMy(user); },
      'admin.notify.list': function () { return svc_notifyList(user); },
      'admin.notify.preview': function () { return svc_notifyPreview(user, payload); },
      'admin.notify.send': function () { return svc_notifySend(user, payload); }
    };

    if (!routes[action]) throw new Error('Hành động không hợp lệ: ' + action);

    // Khóa ghi cho các thao tác nghiệp vụ có thể cộng điểm / đổi trạng thái.
    var MUTATING = {
      'auth.logout': 1, 'auth.changePin': 1, 'auth.changePassword': 1,
      'auth.approveReset': 1, 'auth.delegate': 1,
      'member.add': 1, 'member.update': 1, 'member.delete': 1, 'member.restore': 1,
      'attendance.createSession': 1, 'attendance.scan': 1, 'attendance.close': 1,
      'uommam.nominate': 1, 'uommam.approve': 1, 'uommam.reject': 1,
      'fee.pay': 1, 'fee.confirm': 1, 'fee.addExpense': 1,
      'card.issue': 1, 'eval.submit': 1, 'cert.issue': 1,
      'sos.create': 1, 'sos.toMission': 1, 'mission.checkin': 1,
      'quiz.answer': 1,
      'admin.ap.save': 1, 'admin.ap.delete': 1, 'admin.config.save': 1,
      'admin.account.create': 1, 'admin.account.update': 1, 'admin.account.status': 1,
      'admin.account.resetPin': 1, 'admin.account.restore': 1,
      'admin.backup.now': 1, 'admin.backup.restoreCopy': 1, 'admin.reconcile': 1,
      'admin.notify.send': 1
    };
    // Các thao tác làm thay đổi cấu hình/đơn vị/danh sách tài khoản:
    // tăng phiên bản để mọi phiên đang mở tự đồng bộ (không cần tải lại trang).
    var CONFIG_BUMP = {
      'member.add': 1, 'member.update': 1, 'member.delete': 1, 'member.restore': 1,
      'admin.ap.save': 1, 'admin.ap.delete': 1, 'admin.config.save': 1,
      'admin.account.create': 1, 'admin.account.update': 1,
      'admin.account.status': 1, 'admin.account.resetPin': 1, 'admin.account.restore': 1,
      'admin.reconcile': 1, 'admin.notify.send': 1
    };
    var data = MUTATING[action]
      ? withLock_(function () { return routes[action](); })
      : routes[action]();
    if (CONFIG_BUMP[action]) {
      try { bumpConfigVersion_(); }
      catch (e) { Logger.log('Không tăng được phiên bản cấu hình: ' + (e && e.message ? e.message : e)); }
    }
    return ok_(data);
  } catch (err) {
    return err_(err && err.message ? err.message : err);
  }
}

/** Cho phép nhúng file HTML/CSS/JS con (nếu tách nhỏ giao diện) */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Kiểm tra nhanh hệ thống sau khi cài đặt */
function kiemTraHeThong() {
  var report = [];
  report.push('Spreadsheet: ' + ss_().getName() + ' (' + ss_().getId() + ')');
  Object.keys(SCHEMA).forEach(function (name) {
    var count = rows_(name).length;
    report.push('  • ' + name + ': ' + count + ' dòng');
  });
  report.push('Đoàn viên: ' + rows_('DM_CanBo').filter(function (r) { return Number(r.Cap) === 4; }).length);
  return report.join('\n');
}
