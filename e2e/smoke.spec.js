/* Smoke E2E — đăng nhập, điều hướng, báo cáo, nhắc việc, sức khỏe và bản đồ. */
'use strict';

const { test, expect } = require('@playwright/test');

async function login(page, maDD, pin) {
  await page.goto('/');
  await page.locator('form[data-form="login"] [name="maDD"]').fill(maDD);
  await page.locator('form[data-form="login"] [name="pin"]').fill(pin);
  await page.locator('form[data-form="login"] button[type="submit"]').click();
  await expect(page.locator('.topbar')).toBeVisible();
}

async function goNav(page, view) {
  await page.locator('.nav-item[data-view="' + view + '"]').click();
  await expect(page.locator('#screen .card').first()).toBeVisible();
}

test.describe('Chi đoàn số 6.0 — smoke', function () {
  test('Cấp 1: tổng quan, thông báo và bản đồ Leaflet', async function ({ page }) {
    await login(page, 'CT_HOILHTN', '123456');
    await expect(page.locator('.topbar')).toContainText('Cấp 1');
    await expect(page.locator('.nav-item')).toHaveCount(8);
    await expect(page.locator('#screen')).toContainText('Thông báo mới');
    await expect(page.locator('#screen')).toContainText('Lịch sinh hoạt');

    await goNav(page, 'sos');
    await expect(page.locator('#sos-map')).toBeVisible();
    await expect(page.locator('#sos-map')).toHaveClass(/leaflet-container/);
    await expect(page.locator('#sos-map .leaflet-control-attribution')).toContainText('OpenStreetMap');
  });

  test('Cấp 4: thẻ đoàn viên và điểm danh thủ công', async function ({ page }) {
    await login(page, 'DV01', '123456');
    await expect(page.locator('.nav-item')).toHaveCount(7);
    await goNav(page, 'card');
    await expect(page.locator('.e-card')).toBeVisible();
    await goNav(page, 'attendance');
    await expect(page.locator('form[data-form="scan"]')).toBeVisible();
  });

  test('Cấp 0: sức khỏe, báo cáo CSV, nhắc việc', async function ({ page }) {
    await login(page, 'ADMIN', 'ThanhnienvietnamXTH');

    const pwForm = page.locator('form[data-form="change-password"]');
    await expect(pwForm).toBeVisible();
    await pwForm.locator('[name="oldPassword"]').fill('ThanhnienvietnamXTH');
    await pwForm.locator('[name="newPassword"]').fill('E2eMatKhau2026');
    await pwForm.locator('[name="confirmPassword"]').fill('E2eMatKhau2026');
    await pwForm.locator('button[type="submit"]').click();
    await expect(page.locator('.system-console')).toBeVisible();
    await expect(page.locator('.sys-tab')).toHaveCount(8);

    await page.locator('.sys-tab[data-tab="sucKhoe"]').click();
    await expect(page.locator('#screen')).toContainText('Sức khỏe hệ thống');
    await expect(page.locator('#screen')).toContainText('Hệ thống khỏe');
    await expect(page.locator('#screen')).toContainText('Phiên bản lược đồ');

    await page.locator('.sys-tab[data-tab="baoCao"]').click();
    await expect(page.locator('form[data-sys-form="report-filter"]')).toBeVisible();
    await expect(page.locator('#screen')).toContainText('Tổng hợp theo Chi đoàn Ấp');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-sys-act="report-export"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^CD6_.*\.csv$/);

    await page.locator('.sys-tab[data-tab="nhacViec"]').click();
    await expect(page.locator('form[data-sys-form="notify-send"]')).toBeVisible();
    const notifyForm = page.locator('form[data-sys-form="notify-send"]');
    await notifyForm.locator('[name="tieuDe"]').fill('Nhắc việc kiểm thử E2E');
    await notifyForm.locator('[name="noiDung"]').fill('Nội dung nhắc việc được tạo bởi Playwright.');
    await page.locator('[data-sys-act="notify-preview"]').click();
    await expect(page.locator('.modal-card')).toContainText('Xem trước người nhận');
    await page.locator('.modal-close').click();
    await notifyForm.locator('button[type="submit"]').click();
    await expect(page.locator('.modal-card')).toContainText('Đã phát hành nhắc việc');
    await page.locator('.modal-close').click();
    await expect(page.locator('#screen')).toContainText('Nhắc việc kiểm thử E2E');
  });
});
