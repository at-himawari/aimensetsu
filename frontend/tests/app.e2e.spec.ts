import { expect, test, type Page } from "@playwright/test";


async function demoLogin(page: Page) {
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/api/auth/demo-login") && response.status() === 200,
  );
  await page.getByRole("button", { name: "無料体験を始める" }).click();
  await loginResponse;
  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
}


test("ログインから振り返りまで進める", async ({ page }) => {
  await page.goto("/");

  await demoLogin(page);
  await page.getByRole("button", { name: "今すぐ面接練習を始める" }).click();
  await expect(page.getByRole("heading", { name: "面接練習" })).toBeVisible();

  await page.getByRole("button", { name: "面接を終了する" }).click();
  await expect(page.getByText("振り返り")).toBeVisible();
  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("menuitem", { name: "振り返り・履歴" }).click();
  await expect(page.getByRole("heading", { name: "履歴" })).toBeVisible();
});

test("RESUME をアップロードしてそのまま面接へ進める", async ({ page }) => {
  await page.goto("/");

  await demoLogin(page);
  await page.getByRole("button", { name: "経歴書を管理する" }).click();

  await page.getByLabel("PDF を追加").setInputFiles({
    name: "portfolio.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 mock"),
  });

  await expect(page.getByRole("button", { name: "portfolio.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "面接を始める" }).click();
  await expect(page.getByRole("heading", { name: "面接練習" })).toBeVisible();
});

test("履歴詳細を開いて削除できる", async ({ page }) => {
  await page.goto("/");

  await demoLogin(page);
  await page.getByRole("button", { name: "すべて見る" }).click();
  await page.getByRole("button", { name: "2026-04-24 Backend Engineer 模擬面接" }).click();

  await expect(page.getByRole("heading", { name: "履歴" })).toBeVisible();
  await expect(page.getByText("表示中: 2 件")).toBeVisible();
  await expect(page.getByRole("heading", { name: "2026-04-24 Backend Engineer 模擬面接" })).toBeVisible();
  await expect(page.getByText("振り返りコメント")).toBeVisible();
  await expect(page.getByText("良かった点")).toBeVisible();
  await expect(page.getByText("具体例を交えて説明できていた")).toBeVisible();

  await page.getByRole("button", { name: "履歴を削除" }).click();

  await expect(page.getByRole("heading", { name: "履歴" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2026-04-24 Backend Engineer 模擬面接" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "2026-04-23 自己紹介集中練習" })).toBeVisible();
});

test("課金で購入すると残高へ反映される", async ({ page }) => {
  await page.goto("/");

  await demoLogin(page);
  await expect(page.getByText("残クレジット: 30分")).toBeVisible();
  await page.getByRole("button", { name: "追加購入する" }).click();

  await expect(page.getByText("課金")).toBeVisible();
  await expect(page.getByText("現在残高: 30分")).toBeVisible();
  await page.getByRole("button", { name: "30分を追加購入する" }).click();
  await expect(page.getByText("現在残高: 60分")).toBeVisible();

  await page.getByRole("button", { name: "ホームへ戻る" }).click();
  await expect(page.getByText("残クレジット: 60分")).toBeVisible();
});
