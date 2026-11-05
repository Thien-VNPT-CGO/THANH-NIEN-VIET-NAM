# Chi đoàn số 6.0 — Xã Tân Hòa

Nền tảng web quản lý Đoàn viên theo mô hình **Google Sheets + Google Apps Script**, lấy cảm hứng từ đề án *“Đổi mới phương thức tập hợp, đoàn kết thanh niên”* của Chi đoàn Xã Tân Hòa.

Toàn bộ hệ thống chạy trên hạ tầng Google (không cần máy chủ riêng), giao diện một trang (SPA) tối ưu cho điện thoại; dữ liệu được tải theo phiên và tự đồng bộ khi có kết nối.

---

## 1. Tổng quan

| Hạng mục | Giá trị |
|---|---|
| Tên hệ thống | Hệ sinh thái Chi đoàn số 6.0 |
| Đơn vị | Xã Tân Hòa — 11 Ấp: Tân Xuân (AP01), Nghĩa Chí (AP02), Dương Hòa (AP03), Hòa Bình (AP04), Hiệp Trị (AP05), Xóm Gò (AP06), Vạn Thành (AP07), Thạnh Hòa (AP08), Dương Phú (AP09), Lò Gạch (AP10), Ruộng Cạn (AP11) |
| Nền tảng | Google Sheets (CSDL) + Google Apps Script (API) + HTML/CSS/JS (giao diện) |
| Xác thực | Mã định danh / SĐT + **PIN 6 số** (C1–C4); tài khoản **ADMIN** dùng mật khẩu chữ, phiên đăng nhập 12 giờ |
| Phân quyền | 5 cấp: **C0 Quản trị hệ thống** · **C1 Chủ tịch Ủy Ban Hội LHTN Việt Nam Xã** · **C2 Bí thư Chi bộ Xã** · **C3 Bí thư Chi đoàn Ấp** · **C4 Đoàn viên Ấp** |
| Mục tiêu điểm/năm | 300 điểm |
| Đoàn phí | 24.000đ/Đoàn viên/năm (thanh toán VietQR) |

---

## 2. Bảy phân hệ chức năng

| # | Phân hệ | Chức năng chính |
|---|---|---|
| 1 | **Điểm danh QR động** | Bí thư Chi đoàn Ấp mở phiên; mã QR đổi token mỗi **60 giây**; Đoàn viên quét bằng camera hoặc nhập token tay. Chống điểm danh trùng và chống quét ảnh chụp màn hình. |
| 2 | **Ươm mầm Đỏ** | Đề cử → thẩm định → phê duyệt Đoàn viên ưu tú giới thiệu Đảng. Điều kiện: có thẻ Đoàn, ≥ 300 điểm/năm, xếp loại 360° “Hoàn thành tốt” trở lên. |
| 3 | **Đoàn phí VietQR & Sổ quỹ** | Sinh mã VietQR đúng cú pháp `DOANPHI <Ấp> <MãĐV>`; Bí thư Chi đoàn Ấp hoặc cấp Xã xác nhận giao dịch; mọi khoản thu/chi hiển thị công khai trong sổ quỹ. |
| 4 | **Thẻ Đoàn viên số & E-Cert** | Thẻ điện tử có QR định danh và đầy đủ 8 trường: Họ và tên, Ngày sinh, Chức vụ, Ngày vào Đoàn, Nơi vào Đoàn, Nơi cấp thẻ, Ngày sinh hoạt đoàn, Số thẻ Đoàn viên; tự đánh giá **360°** 5 tiêu chí, cấp giấy chứng nhận số (E-Cert) có chữ ký HMAC. |
| 5 | **SOS & Bản đồ tình nguyện** | Gửi phản ánh/SOS kèm GPS; Bí thư Chi đoàn Ấp hoặc cấp Xã chuyển thành nhiệm vụ; Đoàn viên check-in nhiệm vụ bằng GPS. |
| 6 | **Trợ lý AI & Soạn văn bản** | Bot Zalo (rule-based, chạy nội bộ trên Sheets) tra cứu điểm, cảnh báo vắng, hướng dẫn đoàn phí; sinh kịch bản điều hành họp và biên bản giới thiệu Đảng. |
| 7 | **Đấu trường Quiz & Bảng xếp hạng** | Ngân hàng câu hỏi nghị quyết; trả lời đúng +15 điểm; bảng xếp hạng cá nhân và theo Ấp. |

---

## 3. Phân quyền 5 cấp

| Cấp | Vai trò | Quyền hạn chính |
|---|---|---|
| **C0** | Quản trị hệ thống (`ADMIN`) | Siêu quản trị toàn hệ thống: **toàn quyền xem, thêm, sửa, xóa** dữ liệu ở cả 8 tab nghiệp vụ (Tổng quan, Điểm danh, Ươm mầm Đỏ, Đoàn phí, Thẻ, SOS, Học tập & AI, Quản trị) cùng tab **Hệ thống**. Quản lý danh mục **Ấp/Chi đoàn Ấp**, thông tin đơn vị cấp Xã, cấu hình điểm – đoàn phí – VietQR, tài khoản và nhật ký; được duyệt Ươm mầm Đỏ, cấp PIN, cấp thẻ, mở phiên điểm danh và ghi chi quỹ cho bất kỳ Ấp. |
| **C1** | Chủ tịch Ủy Ban Hội LHTN Việt Nam Xã | Toàn quyền nghiệp vụ dưới Admin: xem toàn Xã, **phê duyệt Ươm mầm Đỏ**, **cấp lại PIN tập trung**, quản trị nhân sự, cấp thẻ, xác nhận/ghi chi mọi sổ quỹ, mở phiên điểm danh cho bất kỳ Ấp. |
| **C2** | Bí thư Chi bộ Xã | Cùng phạm vi Xã như C1: duyệt Ươm mầm Đỏ, cấp lại PIN, xem và xác nhận mọi sổ quỹ, cấp thẻ, mở phiên điểm danh toàn Xã. |
| **C3** | Bí thư Chi đoàn Ấp | Trong phạm vi Ấp: mở/đóng phiên điểm danh, **thêm/sửa/xóa hồ sơ đoàn viên**, **đề cử** Ươm mầm Đỏ, xác nhận đoàn phí, tích hợp thẻ, quản lý nhiệm vụ SOS, ủy quyền 24h. **Không** được duyệt Ươm mầm, không cấp PIN, không xem hàng chờ PIN. |
| **C4** | Đoàn viên Ấp | Quét QR điểm danh, đóng phí, xem thẻ/E-Cert, tự đánh giá 360°, gửi SOS, làm quiz, trò chuyện với trợ lý AI. Không có tab Quản trị. |

**Quy tắc ủy quyền 24h:** Bí thư Chi đoàn Ấp (C3) có thể ủy quyền cho cán bộ/đoàn viên cùng Ấp trong tối đa 24 giờ (`auth.delegate`). Hết hạn, quyền tự động thu hồi.

**Nhãn đơn vị hiển thị:** topbar, hồ sơ và thẻ luôn dùng tên đầy đủ — C0: `Cấp 0 · Quản trị hệ thống · Toàn hệ thống`; C1: `Cấp 1 · Ủy Ban Hội LHTN Việt Nam Xã Tân Hòa · Chủ Tịch`; C2: `Cấp 2 · Bí thư Chi bộ Xã · Chi bộ Xã Tân Hòa`; C3/C4: `Cấp 3/4 · … · Chi đoàn Ấp …` (ví dụ `Chi đoàn Ấp Tân Xuân`). Tên Xã lấy từ cấu hình `TEN_XA`.

### Trung tâm điều hành Cấp 0

Tài khoản `ADMIN` thấy đủ 9 tab: 8 tab nghiệp vụ (giao diện dùng chung với C1–C4 nhưng phạm vi dữ liệu là toàn Xã) và tab **Hệ thống**, gồm 5 phân khu:

| Phân khu | Chức năng |
|---|---|
| **Đơn vị** | Sửa thông tin Xã (tên đơn vị, Chủ tịch Ủy ban Hội LHTN Việt Nam Xã, Bí thư Chi bộ Xã, điện thoại, địa chỉ, email, ngày thành lập); thêm/đổi tên/xóa Ấp và gán Bí thư Chi đoàn Ấp. |
| **Cấu hình** | Điều chỉnh mức điểm thưởng, mục tiêu điểm/năm, đoàn phí chuẩn và thông tin VietQR. Thay đổi có hiệu lực ngay toàn hệ thống. |
| **Tài khoản** | Tìm kiếm, tạo tài khoản C1–C4, **sửa hồ sơ** (họ tên, SĐT, ngày sinh, ghi chú) của mọi tài khoản — gồm Chủ tịch Hội LHTN Xã (C1) và Bí thư Chi bộ Xã (C2), khóa/mở khóa, cấp lại PIN và **khôi phục tài khoản trong thùng rác**. Đổi tên C1/C2 tự đồng bộ thông tin tương ứng ở tab **Đơn vị**. Không thể khóa tài khoản `ADMIN`, Chủ tịch Hội LHTN Xã cuối cùng hoặc Bí thư Chi bộ Xã cuối cùng đang hoạt động. |
| **Sao lưu** | Xem lịch sử bản sao lưu Drive (giữ 30 bản), bấm **Sao lưu ngay** và chạy **Đối soát điểm** giữa điểm hiện tại với sổ `Diem_Log`. |
| **Nhật ký** | Tra cứu audit log toàn hệ thống theo người thực hiện, hành động hoặc chi tiết. |

Tại tab **Quản trị**, Admin thấy đồng thời hàng chờ cấp lại PIN, khối ủy quyền 24 giờ, danh sách đoàn viên toàn Xã kèm nút **Sửa / Xóa** và hồ sơ Ươm mầm Đỏ chờ phê duyệt. Form thêm hoặc sửa đoàn viên và form ghi chi quỹ đều có bộ chọn Chi đoàn Ấp khi thao tác ở phạm vi Xã.

---

## 4. Thang điểm rèn luyện

| Hoạt động | Điểm |
|---|---:|
| Điểm danh sinh hoạt **trực tiếp** | +10 |
| Điểm danh sinh hoạt **Hybrid** | +8 |
| Kết nối lại qua **Zalo** | +5 |
| Được duyệt **nguồn Đảng** (Ươm mầm Đỏ) | +25 |
| Đóng **đủ đoàn phí năm** | +10 |
| **Tích hợp thẻ** Đoàn viên số | +20 |
| Hoàn thành **tự đánh giá 360°** | +10 |
| Gửi phản ánh **SOS** | +10 |
| **Check-in GPS** nhiệm vụ tình nguyện | +15 |
| Trả lời **Quiz đúng** | +15/câu |

Điểm được ghi vào sheet `Diem_Log` để kiểm toán, đồng thời cộng dồn vào `DM_CanBo.Diem`.

---

## 5. Kiến trúc & cấu trúc thư mục

```
.
├── apps-script/              # Dán trực tiếp vào Google Apps Script
│   ├── Code.gs               # doGet + bảng định tuyến api(action, payload, token)
│   ├── Services.gs           # Toàn bộ nghiệp vụ 7 phân hệ + kiểm tra quyền
│   ├── Setup.gs              # Khởi tạo 19 sheet, dữ liệu mẫu, migration, trigger sao lưu
│   ├── Utils.gs              # Sheet cache/khóa, HMAC/token, băm PIN, cộng điểm nguyên tử
│   ├── Index.html            # Giao diện đã đóng gói (CSS + JS + jsQR + qrcode-generator inline)
│   └── appsscript.json       # Manifest + OAuth scope
├── web/                      # Mã nguồn giao diện (phát triển)
│   ├── index.html
│   ├── styles.css
│   ├── mock-api.js           # Backend mô phỏng bằng localStorage (chạy offline)
│   ├── vendor/
│   │   ├── jsqr.min.js       # Thư viện quét QR tự lưu trữ (không dùng CDN)
│   │   └── qrcode.js         # Thư viện tạo QR tự lưu trữ (MIT, không gửi dữ liệu ra ngoài)
│   └── js/
│       ├── core.js           # Trạng thái, API layer, đăng nhập, buộc đổi PIN/mật khẩu, đồng bộ cấu hình realtime
│       ├── views.js          # Tổng quan, Điểm danh, Ươm mầm, Đoàn phí
│       ├── views2.js         # Thẻ, SOS/Bản đồ, Học tập/Quiz/AI, Quản trị
│       ├── system.js         # Trung tâm điều hành Cấp 0 (đơn vị, cấu hình, tài khoản, sao lưu, nhật ký)
│       └── actions.js        # Xử lý sự kiện, form, QR live, camera, modal
├── tests/
│   ├── api.test.js           # 181 kiểm thử hợp đồng API (Node)
│   ├── parity.test.js        # 10 kiểm thử đối chiếu route Code.gs ↔ mock-api.js
│   └── ui.test.js            # 113 kiểm thử giao diện (jsdom)
├── tools/
│   └── check-gas.js          # Kiểm tra cú pháp GAS, manifest, tham chiếu và bundle
├── .github/workflows/ci.yml  # CI: npm ci → npm run check → npm test
├── build.js                  # Gộp web/ → apps-script/Index.html
├── package.json              # Lệnh build/check/ci/test/preview
├── .gitignore
└── README.md
```

**Luồng dữ liệu:** `Index.html` → `google.script.run.api(action, payload, token)` → `Code.gs` → `Services.gs` → Google Sheets.

---

## 6. Triển khai lên Google Apps Script

### Bước 1 — Tạo bảng tính
1. Tạo Google Sheets mới, đặt tên *“Chi đoàn số 6.0 — Xã Tân Hòa”*.
2. Mở **Tiện ích mở rộng → Apps Script**.

### Bước 2 — Nạp mã nguồn
1. Trong Apps Script, tạo lần lượt các file script: `Utils.gs`, `Setup.gs`, `Services.gs`, `Code.gs` và dán nội dung tương ứng trong thư mục `apps-script/`.
2. Tạo file HTML mới tên **`Index`** (không có đuôi `.html`), dán toàn bộ nội dung `apps-script/Index.html`.
3. Mở **Cài đặt dự án**, bật *“Hiển thị tệp kê khai appsscript.json”*, rồi dán nội dung `apps-script/appsscript.json`.

### Bước 3 — Khởi tạo dữ liệu
1. Chọn hàm `setup` trong thanh công cụ và bấm **Chạy**.
2. Cấp quyền truy cập khi Google hỏi (Sheets + Drive + Trigger).
3. Kiểm tra bảng tính đã có đủ **19 sheet** và dữ liệu mẫu; `setup()` tự tạo trigger sao lưu hằng ngày.

> **Tài khoản quản trị:** `setup()` tự tạo tài khoản **`ADMIN`** với mật khẩu mặc định **`ThanhnienvietnamXTH`**. Lần đăng nhập đầu bắt buộc đổi mật khẩu. Nếu quên mật khẩu, chạy hàm **`resetAdminPassword()`** trong Apps Script để khôi phục về mặc định (và buộc đổi lại ở lần đăng nhập tới).
>
> **Nâng cấp từ phiên bản cũ:** chạy lại `setup()` — hệ thống tự bổ sung các cột mới (Ngày vào Đoàn, Nơi vào Đoàn, Ngày sinh hoạt đoàn, Nơi cấp thẻ, `MatKhauHash`, `BatDoiMatKhau`, `PINHash`, `BatDoiPin`, `SoLanSai`, `KhoaDen`, `TokenVersion`, `DaXoa`, `NgayXoa`, `NguoiXoa`, `DiemNen`) vào cuối hàng tiêu đề mà không làm mất dữ liệu hiện có. Đồng thời `ensureRolesV2_()` nâng cấp **một lần** mô hình phân quyền cũ lên C0–C4 (C1 cũ → C2, C2 cũ → C3, C3 cũ → C4) và bổ sung tài khoản C1 `CT_HOILHTN`; dấu `CauHinh.PHIEN_BAN_PHAN_QUYEN` bảo đảm không dịch cấp lần thứ hai. Mã PIN chữ thô cũ được băm lại ngay khi người dùng đăng nhập thành công lần đầu.
>
> Muốn xóa sạch và nạp lại dữ liệu demo: chạy `resetDemo()`.

### Bước 4 — Triển khai Web App
1. **Triển khai → Triển khai mới → Loại: Ứng dụng web**.
2. *Thực thi dưới danh nghĩa:* **Tôi** (chủ sở hữu bảng tính).
3. *Ai có quyền truy cập:* **Bất kỳ ai**.
4. Bấm **Triển khai**, sao chép URL và mở trên điện thoại/máy tính.

> Sau mỗi lần sửa mã, tạo **bản triển khai mới** (hoặc *Quản lý bản triển khai → Chỉnh sửa → Phiên bản mới*).

---

## 7. Chạy thử cục bộ (không cần Google)

Giao diện có sẵn backend mô phỏng `web/mock-api.js` dùng `localStorage`, cho phép trải nghiệm toàn bộ luồng nghiệp vụ ngay trên máy.

```bash
npm install          # cài jsdom cho bộ kiểm thử giao diện

# Cách 1: mở trực tiếp web/index.html
# Cách 2 (khuyến nghị): chạy HTTP server tĩnh
npm run preview      # http://localhost:3000
# hoặc
python -m http.server 8080 --directory web
```

Sau đó mở `http://localhost:3000` (hoặc `http://localhost:8080`).

> Camera quét QR cần `https://` hoặc `localhost`. Khi không có camera, dùng ô **nhập token thủ công**. Dữ liệu demo lưu tại khóa `cd6_db_v3` trong localStorage — xóa khóa này để reset.
>
> Màn hình đăng nhập có 5 chip trải nghiệm C0–C4 **chỉ trong chế độ xem trước cục bộ**; chip **ADMIN** tự điền mật khẩu mặc định `ThanhnienvietnamXTH` và sẽ yêu cầu đổi mật khẩu ngay sau đó.

### Đóng gói lại giao diện

```bash
node build.js
# → apps-script/Index.html (CSS + JS + jsQR + qrcode-generator inline, tự loại bỏ mock-api)
```

Thư viện quét QR nằm tại `web/vendor/jsqr.min.js` (jsQR 1.4.0, tự lưu trữ) và thư viện **tạo** QR tại `web/vendor/qrcode.js` (`qrcode-generator` 2.0.4, MIT, hỗ trợ UTF-8) — cả hai được nhúng inline khi đóng gói, không phụ thuộc CDN hay dịch vụ ngoài. Chạy `npm run check` sau khi build để xác nhận bundle không còn `<script src>` bên ngoài và không gọi `api.qrserver.com`.

Yêu cầu: Node.js ≥ 18.

---

## 8. Tài khoản demo

Mật khẩu/PIN chung cho tài khoản nghiệp vụ: **`123456`**

| Mã định danh | Họ tên | Cấp | Ấp | Điểm |
|---|---|---|---:|---:|
| `ADMIN` | Quản trị viên hệ thống | C0 · Quản trị hệ thống | — | 0 |
| `CT_HOILHTN` | Lê Văn Bình | C1 · Chủ tịch Hội LHTN Xã | — | 0 |
| `BT_CHIBO_XA` | Nguyễn Văn Hòa | C2 · Bí thư Chi bộ Xã | — | 0 |
| `BT_AP01` | Lê Huỳnh Ngọc Hằng | C3 · Bí thư Chi đoàn Ấp | Tân Xuân | 0 |
| `BT_AP02` | Nguyễn Kim Chi | C3 · Bí thư Chi đoàn Ấp | Nghĩa Chí | 0 |
| `BT_AP03` | Lê Thị Cẩm Kha | C3 · Bí thư Chi đoàn Ấp | Dương Hòa | 0 |
| `BT_AP04` | Nguyễn Thanh Thiên | C3 · Bí thư Chi đoàn Ấp | Hòa Bình | 0 |
| `BT_AP05` | Huỳnh Hải Vy | C3 · Bí thư Chi đoàn Ấp | Hiệp Trị | 0 |
| `BT_AP06` | Huỳnh Nguyễn Thảo Hiền | C3 · Bí thư Chi đoàn Ấp | Xóm Gò | 0 |
| `BT_AP07` | Phan Nguyên Kha | C3 · Bí thư Chi đoàn Ấp | Vạn Thành | 0 |
| `BT_AP08` | Từ Nguyễn Quốc Tiến | C3 · Bí thư Chi đoàn Ấp | Thạnh Hòa | 0 |
| `BT_AP09` | Đặng Nhật Khánh Vy | C3 · Bí thư Chi đoàn Ấp | Dương Phú | 0 |
| `BT_AP10` | Lê Hoàng Nhân | C3 · Bí thư Chi đoàn Ấp | Lò Gạch | 0 |
| `BT_AP11` | Lê Thị Bích Hồng | C3 · Bí thư Chi đoàn Ấp | Ruộng Cạn | 0 |
| `DV01` | Võ Minh Khoa | C4 · Đoàn viên Ấp | Tân Xuân | 340 |
| `DV02` | Nguyễn Thị Thu Hà | C4 · Đoàn viên Ấp | Tân Xuân | 285 |
| `DV05` | Đặng Quốc Huy | C4 · Đoàn viên Ấp | Nghĩa Chí | 310 |

Ngoài ra có `DV03`, `DV04`, `DV06`… với điểm thấp hơn để thử luồng cảnh báo.

### Logo Chi đoàn Ấp

Mỗi Chi đoàn Ấp dùng đúng logo của mình. Logo hiển thị ở **topbar** khi đăng nhập, **thẻ Đoàn viên điện tử**, **danh sách Chi đoàn Ấp** và **danh sách tài khoản** ở tab Quản trị. Ảnh gốc nằm trong `image/logo/`; bản thumbnail 192×192 dùng cho ứng dụng nằm trong `web/assets/ap-logo/` và được nhúng tự động vào `apps-script/Index.html` khi build.

| Mã | Chi đoàn Ấp | Tệp logo |
|---|---|---|
| AP01 | Tân Xuân | `ap01.jpg` |
| AP02 | Nghĩa Chí | `ap02.jpg` |
| AP03 | Dương Hòa | `ap03.jpg` |
| AP04 | Hòa Bình | `ap04.jpg` |
| AP05 | Hiệp Trị | `ap05.jpg` |
| AP06 | Xóm Gò | `ap06.jpg` |
| AP07 | Vạn Thành | `ap07.jpg` |
| AP08 | Thạnh Hòa | `ap08.jpg` |
| AP09 | Dương Phú | `ap09.jpg` |
| AP10 | Lò Gạch | `ap10.jpg` |
| AP11 | Ruộng Cạn | `ap11.jpg` |

> Thư mục `image/logo/` còn 3 logo của Ấp **Thanh Nhung 1**, **Thanh Nhung 2** và **Hòa Thơm** — chưa gán vì danh sách tài khoản Bí thư hiện tại không có 3 Ấp này.

> **Tài khoản quản trị:** `ADMIN` / `ThanhnienvietnamXTH` — không dùng PIN. Lần đăng nhập đầu tiên hệ thống bắt buộc đổi mật khẩu; trên bản xem trước cục bộ, dữ liệu admin được lưu trong cùng `localStorage`.

> `DV01` đủ điều kiện Ươm mầm Đỏ và **chưa đóng đoàn phí** — thuận tiện demo luồng VietQR.

---

## 9. Cơ sở dữ liệu (19 sheet)

| Nhóm | Sheet | Nội dung |
|---|---|---|
| Cấu hình | `CauHinh` | Tham số hệ thống (tên xã, năm, mục tiêu điểm, ngân hàng VietQR…), `PHIEN_BAN_CAU_HINH` cho đồng bộ realtime |
| Danh mục | `DM_Ap`, `DM_CanBo` | 11 Ấp; hồ sơ cán bộ/Đoàn viên (PIN băm, điểm, điểm nền, thẻ, ủy quyền, khóa đăng nhập, `TokenVersion`, xóa mềm, `MatKhauHash` cho ADMIN) |
| Điểm danh | `QR_Phien`, `DiemDanh` | Phiên điểm danh, token QR, lịch sử quét |
| Ươm mầm Đỏ | `UomMamDo` | Đề cử, tiêu chí, trạng thái duyệt |
| Tài chính | `DoanPhi`, `Quy_ThuChi` | Giao dịch đoàn phí, sổ thu–chi công khai |
| Thẻ & chứng nhận | `TheDoanVien`, `TuDanhGia360`, `ECert` | Thẻ số, điểm 360°, giấy chứng nhận |
| Tình nguyện | `SOS`, `NhiemVu` | Phản ánh/SOS, nhiệm vụ và check-in GPS |
| Học tập | `Quiz`, `Quiz_KetQua` | Câu hỏi, kết quả và bảng xếp hạng |
| Vận hành | `PIN_Reset`, `Diem_Log`, `Log`, `VanBan` | Yêu cầu cấp lại PIN, nhật ký điểm, audit log, văn bản soạn tự động |

Bảng tính được tạo hoàn toàn bằng `setup()` — không cần tạo tay.

**Toàn vẹn dữ liệu:**
- `DM_CanBo.Diem` là điểm hiện tại; `DiemNen` là điểm nền, `Diem_Log` là sổ điểm. Công thức đối soát: `Diem = DiemNen + SUM(Diem_Log)`. Mọi thay đổi điểm đi qua `award_()` trong `withLock_()` để tránh ghi đè khi nhiều người thao tác đồng thời.
- Xóa đoàn viên là **xóa mềm**: `DaXoa = TRUE`, giữ nguyên điểm danh, đoàn phí, điểm và chứng nhận; C0 khôi phục từ **Hệ thống → Tài khoản → Thùng rác**.
- Sao lưu hằng ngày bằng bản sao trên Google Drive (giữ 30 bản gần nhất), ngoài 19 sheet nghiệp vụ.
- `CauHinh.PHIEN_BAN_CAU_HINH` là bộ đếm phiên bản cấu hình: mỗi thao tác quản trị làm thay đổi cấu hình/đơn vị/tài khoản sẽ tăng bộ đếm, giúp mọi phiên đang mở biết cần đồng bộ lại.

---

## 10. Bảo mật & toàn vẹn dữ liệu

- **PIN 6 số băm một chiều:** PIN của C1–C4 lưu dạng `PINHash` (HMAC-SHA256 có muối theo `MaDD`), không lưu chữ thô. Dữ liệu cũ có `PIN` chữ thô được tự động nâng cấp sau lần đăng nhập thành công đầu tiên.
- **Buộc đổi PIN lần đầu:** tài khoản mới hoặc sau khi cấp lại PIN có `BatDoiPin = TRUE`; giao diện chặn mọi thao tác cho đến khi người dùng đổi PIN. Người dùng cũng có thể tự đổi PIN bất cứ lúc nào từ thanh trên cùng.
- **Khóa đăng nhập tạm thời:** C1–C4 nhập sai **5 lần** → khóa **15 phút** (`SoLanSai`, `KhoaDen`). Riêng **ADMIN không bị khóa cứng toàn hệ thống**: nếu khóa theo tài khoản, bất kỳ ai biết mã `ADMIN` cũng có thể khóa quản trị viên từ xa (DoS). Mọi lần sai vẫn được ghi nhật ký, đăng nhập đúng xóa bộ đếm. C0 mở khóa tài khoản C1–C4 bằng nút **Mở khóa** trong Hệ thống → Tài khoản.
- **Mật khẩu quản trị C0** lưu dạng băm HMAC-SHA256 (`DM_CanBo.MatKhauHash`), bắt buộc đổi ở lần đăng nhập đầu (`BatDoiMatKhau`). Khôi phục khẩn cấp bằng `resetAdminPassword()` chạy trực tiếp trong Apps Script.
- **Token có phiên bản, thu hồi được:** token ký HMAC-SHA256, hết hạn sau **12 giờ** và mang `TokenVersion`. Đăng xuất, đổi PIN/mật khẩu, khóa tài khoản, cấp lại PIN hoặc xóa mềm đều tăng phiên bản → toàn bộ token cũ mất hiệu lực ngay. `auth.logout` thu hồi phiên trên mọi thiết bị.
- **Cấp lại PIN tập trung, không lộ PIN:** Đoàn viên gửi yêu cầu → C1/C2 duyệt; PIN mới chỉ sinh tại thời điểm duyệt, lưu dạng băm và chỉ hiển thị **một lần** cho người cấp. Yêu cầu không tồn tại vẫn trả lời trung tính để chống dò tài khoản.
- **Khóa ghi & cộng điểm nguyên tử:** các route làm thay đổi dữ liệu chạy trong `withLock_()`; `award_()` đọc–tính–ghi điểm trong cùng khóa. Tab **Sao lưu** có nút **Đối soát điểm** để phát hiện và sửa lệch giữa `Diem` và sổ `Diem_Log`.
- **Xóa mềm & khôi phục:** C1–C3 chuyển đoàn viên vào thùng rác thay vì xóa vĩnh viễn; chỉ C0 khôi phục. Lịch sử điểm danh/đoàn phí/điểm được giữ để kiểm toán.
- **Sao lưu & phục hồi an toàn:** trigger hằng ngày tạo bản sao bảng tính trên Drive, giữ tối đa 30 bản. C0 có thể **Sao lưu ngay**, **Kiểm tra** (mở được, đủ 19 sheet) và **Phục hồi** — hệ thống tạo một bảng tính **mới** trong thư mục `CD6_Restore`, **không ghi đè** dữ liệu đang chạy; quản trị viên kiểm tra rồi mới chuyển đổi thủ công.
- **Đồng bộ cấu hình realtime:** `CauHinh.PHIEN_BAN_CAU_HINH` tăng mỗi khi C0 lưu cấu hình, đơn vị hoặc tài khoản. `meta.config`, `auth.login` và `auth.me` đều trả về `phienBan`; client kiểm tra `auth.me` mỗi **30 giây** khi tab đang hiển thị, ngay khi quay lại tab (`focus`/`visibilitychange`) và sau mỗi thao tác quản trị. Khi phát hiện phiên bản mới, giao diện cập nhật tại chỗ (topbar, tên đơn vị, mức điểm, quyền, thông tin tài khoản) mà **không cần tải lại trang**. Nếu đang mở biểu mẫu, phiên QR hoặc camera, thay đổi được hoãn lại (`pendingSync`) và áp dụng ngay sau khi đóng.
- **QR động:** token 10 ký tự = `HMAC(MaPhien:slot)` rút gọn, đổi mỗi **60 giây**; ảnh chụp màn hình cũ bị từ chối với thông báo *“Mã QR đã hết hiệu lực”*.
- **Siêu quyền C0 có kiểm soát:** mọi route `admin.*` vẫn qua `assertAdmin_`; C0 bỏ qua giới hạn cấp C1–C3 để thao tác nghiệp vụ toàn Xã nhưng vẫn không thể bị khóa và không vượt qua kiểm tra riêng của quản trị.
- **Chữ ký số E-Cert** và mã xác thực thẻ dùng HMAC, có thể đối chiếu lại trên hệ thống.
- **Ủy quyền có thời hạn:** tối đa 24 giờ, tự động thu hồi.
- **Kiểm tra quyền ở server:** mọi thao tác xác thực cấp + phạm vi Ấp trong `Services.gs`, không tin tưởng phía client.
- **QR tự lưu trữ, không lộ dữ liệu:** cả **tạo** QR (`web/vendor/qrcode.js` — `qrcode-generator` 2.0.4, MIT, UTF-8) và **quét** QR (`web/vendor/jsqr.min.js`) đều chạy trên máy người dùng, được nhúng inline khi đóng gói. Token điểm danh, mã thẻ và E-Cert không còn gửi qua `api.qrserver.com` hay bất kỳ dịch vụ ngoài nào. `npm run check` chặn build nếu phát hiện phụ thuộc QR bên ngoài.
- **Phân trang danh sách lớn:** `member.list` nhận `limit`/`offset` (tối đa 200) và trả `tongSo`, `conNua`; tab Quản trị hiển thị 50 đoàn viên mỗi trang với nút **Xem thêm**. Khi không truyền `limit`, API vẫn trả toàn bộ để tương thích với các màn hình cũ.
- **Ngoại tuyến (PWA-lite):** GAS không phục vụ được service worker/manifest tĩnh, nên hệ thống không giả lập offline đầy đủ. Khi mất mạng, giao diện hiện thanh cảnh báo, giữ dữ liệu đã tải để xem và tạm khóa thao tác ghi; phiên đăng nhập được giữ và có nút **Thử kết nối lại** thay vì đăng xuất. Muốn offline thật cần tách bản host tĩnh (xem mục giới hạn).
- **Gia cố giao diện:** `doGet` dùng `XFrameOptionsMode.DEFAULT`; thư viện quét/tạo QR được **tự lưu trữ** và nhúng inline khi đóng gói, không tải mã từ CDN; chip tài khoản demo chỉ hiển thị ở chế độ xem trước cục bộ.
- Dữ liệu Đoàn viên **không gửi ra dịch vụ AI bên ngoài**; trợ lý AI chạy theo kịch bản rule-based ngay trên Sheets.

---

## 11. Kiểm thử

| Bộ test | Phạm vi | Kết quả |
|---|---|---|
| `tests/api.test.js` (Node) | 13 nhóm nghiệp vụ backend: đăng nhập C1–C4, QR, Ươm mầm, đoàn phí, thẻ, SOS, quiz, AI, quản trị, bảo mật, **quản trị hệ thống C0**, **cập nhật hồ sơ Chủ tịch Hội LHTN Xã & Bí thư Chi bộ Xã**, **Admin toàn quyền nghiệp vụ & CRUD đoàn viên**, **phân trang danh sách đoàn viên**, **khóa đăng nhập, thu hồi token, buộc đổi PIN, xóa mềm/khôi phục, sao lưu/kiểm tra/phục hồi & đối soát điểm**, **chống khóa ADMIN từ xa**, **phiên bản cấu hình realtime** | **209/209 đạt** |
| `tests/parity.test.js` (Node) | Đối chiếu **64 hành động API** và **13 hành động bump cấu hình** giữa `Code.gs` và `mock-api.js`, bảo đảm mock không lệch backend thật | **10/10 đạt** |
| `tests/ui.test.js` (jsdom) | Đăng nhập C0–C4, nhãn đơn vị trên topbar, điều hướng tab, mở phiên QR, quét token, VietQR, E-Card, 360°, quiz, AI, SOS, **QR tạo cục bộ dạng data URL & UTF-8**, **buộc đổi mật khẩu/PIN & trung tâm điều hành 5 phân khu C0**, **sửa hồ sơ Chủ tịch / Bí thư Chi bộ Xã và đồng bộ Đơn vị**, **C0 mở đủ 9 tab, sửa/xóa mềm đoàn viên, chọn Ấp khi ghi chi, thùng rác, kiểm tra/phục hồi sao lưu**, **phân trang 50 + Xem thêm**, **cảnh báo ngoại tuyến**, **đồng bộ cấu hình realtime (topbar + hồ sơ)**, **logo đúng theo từng Chi đoàn Ấp (topbar, thẻ, danh sách Ấp, tài khoản)**, bắt lỗi JS | **126/126 đạt** |

Chạy lại sau khi sửa mã:

```bash
npm run check        # kiểm tra cú pháp GAS/web, manifest, tham chiếu và bundle
npm test             # parity + API + giao diện
npm run ci           # check + test (đúng như pipeline GitHub Actions)
npm run test:parity  # đối chiếu route Code.gs ↔ mock-api.js
npm run test:api     # chỉ kiểm thử API
npm run test:ui      # chỉ kiểm thử giao diện
npm run build        # đóng gói lại apps-script/Index.html
```

> Bộ kiểm thử giao diện dùng **jsdom** (cài qua `npm install`), không cần trình duyệt thật.
> CI tại `.github/workflows/ci.yml` chạy `npm ci → npm run check → npm test` trên Node 20 cho mọi push/PR.

---

## 12. Quy trình nghiệp vụ tiêu biểu

### Điểm danh QR động
1. C3 (Bí thư Chi đoàn Ấp) mở phiên cho Ấp mình — C0/C1/C2 có thể mở phiên cho bất kỳ Ấp → hệ thống sinh `MaPhien` + token 10 ký tự.
2. Giao diện tự sinh ảnh QR ngay trên máy (thư viện `qrcode-generator` nhúng sẵn) kèm đồng hồ đếm ngược 60 giây; hết hạn tự sinh token mới. Nội dung QR **không gửi ra dịch vụ bên thứ ba**.
3. C4 (Đoàn viên) quét QR bằng camera hoặc nhập tay → server kiểm tra token còn hiệu lực, chống trùng → cộng **+10** điểm.

### Đoàn phí VietQR
1. C4 bấm *Đóng đoàn phí* → sinh ảnh VietQR kèm nội dung `DOANPHI AP01 DV01`.
2. Giao dịch vào trạng thái *Chờ xác nhận*.
3. C3 xác nhận trong Ấp mình (C0/C1/C2 xác nhận được mọi Ấp) → cộng **+10** điểm, ghi sổ quỹ, hiển thị công khai.

### Ươm mầm Đỏ
1. C3 đề cử Đoàn viên đủ điều kiện trong Ấp (thẻ + ≥ 300 điểm + 360° từ “Hoàn thành tốt”).
2. **C1 (Chủ tịch Hội LHTN Xã) hoặc C2 (Bí thư Chi bộ Xã)** phê duyệt → cộng **+25** điểm, ghi nhận nguồn Đảng.

### Đăng nhập lần đầu & khóa tài khoản
1. Tài khoản mới (hoặc sau khi được cấp lại PIN) có PIN mặc định `123456` và **buộc đổi PIN** ngay khi đăng nhập.
2. Sai PIN/mật khẩu 5 lần → tài khoản bị tạm khóa 15 phút; C0 mở khóa trong Hệ thống → Tài khoản.
3. Đăng xuất hoặc đổi PIN/mật khẩu sẽ thu hồi toàn bộ phiên cũ trên mọi thiết bị.

### Quản trị đơn vị, dữ liệu & cấu hình (C0)
1. `ADMIN` đăng nhập bằng mật khẩu mặc định và đổi mật khẩu ở lần đầu.
2. Tab **Đơn vị**: cập nhật thông tin Xã, thêm Ấp mới (mã `AP…` tự tăng) hoặc gán Bí thư Chi đoàn Ấp.
3. Tab **Cấu hình**: điều chỉnh điểm thưởng, mục tiêu điểm, đoàn phí, VietQR → lưu và áp dụng ngay.
4. Tab **Tài khoản**: tạo tài khoản, **sửa hồ sơ Chủ tịch Hội LHTN Xã / Bí thư Chi bộ Xã** cùng mọi cấp (họ tên, SĐT, ngày sinh, ghi chú), khóa/mở khóa, cấp lại PIN, **xem thùng rác và khôi phục** tài khoản đã xóa mềm; tab **Nhật ký** tra cứu toàn bộ thao tác.
5. Tab **Sao lưu**: xem lịch sử bản sao lưu Drive, **Sao lưu ngay**, **Kiểm tra** (mở được, đủ 19 sheet) và **Phục hồi** an toàn ra bản sao mới; chạy **Đối soát điểm** để sửa lệch giữa điểm hiện tại và sổ `Diem_Log`.
6. **Toàn quyền nghiệp vụ:** Admin mở cả 8 tab còn lại với phạm vi toàn Xã — duyệt Ươm mầm Đỏ, cấp PIN, cấp thẻ, mở/đóng phiên điểm danh, ghi chi quỹ theo Ấp và **thêm/sửa/xóa mềm thông tin đoàn viên** trực tiếp trong tab Quản trị.

### Quy trình phục hồi sao lưu
1. Vào **Hệ thống → Sao lưu**, chọn bản gần nhất và bấm **Kiểm tra** để xác nhận mở được, đủ 19 sheet.
2. Bấm **Phục hồi**, nhập `PHUC HOI` để xác nhận. Hệ thống tạo bảng tính mới trong thư mục `CD6_Restore`; **dữ liệu đang chạy không bị thay đổi**.
3. Mở bản phục hồi, đối chiếu số liệu quan trọng (đoàn viên, điểm, đoàn phí, tài khoản).
4. Khi cần chuyển đổi chính thức, tạo bảng tính mới từ bản phục hồi rồi trỏ Apps Script/deployment sang, hoặc sao chép sheet thủ công ngoài giờ cao điểm. Luôn giữ bản sao lưu trước khi chuyển đổi.

### Đồng bộ cấu hình realtime
1. C0 lưu thay đổi ở tab **Đơn vị**, **Cấu hình** hoặc **Tài khoản** → backend tăng `CauHinh.PHIEN_BAN_CAU_HINH` trong cùng giao dịch.
2. Mọi phiên C1–C4 đang mở tự gọi `auth.me` theo chu kỳ **30 giây** (chỉ khi tab hiển thị), khi quay lại tab hoặc sau thao tác quản trị.
3. Khi `phienBan` thay đổi, giao diện cập nhật topbar, tên đơn vị, mức điểm, quyền hạn và hồ sơ tại chỗ, kèm thông báo *“Đã đồng bộ thay đổi mới từ quản trị”*.
4. Nếu người dùng đang mở biểu mẫu, phiên QR hoặc camera, hệ thống giữ trạng thái hiện tại và áp dụng thay đổi ngay khi đóng (`pendingSync`). Tài khoản bị khóa/xóa sẽ được đưa về màn hình đăng nhập ở lần kiểm tra kế tiếp.

### Tự đánh giá 360°
C4 chấm 5 tiêu chí (Chính trị, Đạo đức, Chuyên môn, Cống hiến, Kỷ luật) → hệ thống tính tổng, xếp loại và cộng **+10** điểm.

---

## 13. Hạn chế & lộ trình

**Hiện tại**
- Backend là Apps Script nên giới hạn thời gian thực thi (~6 phút/lần gọi) và quota hàng ngày của tài khoản Google.
- Đồng bộ cấu hình dùng **polling 30 giây** thay vì WebSocket (Apps Script không hỗ trợ kết nối thường trực); thay đổi hiển thị trong tối đa khoảng 30 giây hoặc ngay khi người dùng quay lại tab.
- Khóa đăng nhập C1–C4 được đếm theo tài khoản (không theo IP/thiết bị); đây là mức bảo vệ phù hợp với Web App công khai nhưng không thay thế WAF. ADMIN không bị khóa cứng để tránh bị khóa từ xa.
- Bản sao lưu dùng bản sao bảng tính trên Drive; chức năng phục hồi tạo **bản sao mới** để kiểm tra, chưa tự động ghi đè bảng tính đang chạy.
- Chưa có kiểm thử tích hợp trên môi trường Apps Script thật; `tests/parity.test.js` chỉ đối chiếu danh sách route/handler và bump giữa `Code.gs` với mock.
- **PWA/offline mới ở mức PWA-lite:** Google Apps Script không phục vụ tệp tĩnh nên không đăng ký được service worker/manifest; khi mất mạng chỉ xem được dữ liệu đã tải và thao tác ghi bị tạm khóa, chưa có hàng đợi ghi ngoại tuyến. Muốn cài như ứng dụng và dùng offline thật cần tách bản host tĩnh (ví dụ Cloudflare Pages/Firebase Hosting) trỏ tới cùng API.
- Trợ lý AI dùng kịch bản rule-based, chưa kết nối LLM.
- Bản đồ SOS hiển thị dạng sơ đồ tọa độ, chưa nhúng Google Maps/Leaflet.
- Chưa có thông báo đẩy (push) — cần tích hợp Zalo OA hoặc email.

**Đề xuất mở rộng**
- Tích hợp Zalo OA để nhắc lịch sinh hoạt và nhắc đóng phí.
- Nhúng bản đồ thật (Leaflet + OpenStreetMap) cho nhiệm vụ tình nguyện.
- Xuất báo cáo PDF/Excel định kỳ phục vụ Đại hội.
- Kết nối LLM có kiểm soát dữ liệu để nâng cấp trợ lý AI.

---

*Chi đoàn số 6.0 — Xã Tân Hòa · “Đổi mới phương thức tập hợp, đoàn kết thanh niên” · Năm 2026*
