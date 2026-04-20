import { expect, test } from "@playwright/test";

test("opens the interview workspace", async ({ page }) => {
  await page.route("**/api/me/", async (route) => {
    await route.fulfill({
      json: { name: "面接 太郎", email: "demo@example.com", phoneNumber: "+810000000000", phoneVerified: true, requiresPhoneVerification: false, quotaMinutes: 30, blockPriceJpy: 300, blockMinutes: 30 },
    });
  });
  await page.route("**/api/sessions/", async (route) => {
    await route.fulfill({ json: { sessions: [] } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "次の回答を、一緒に磨く。" })).toBeVisible();
  await expect(page.getByText("30分追加")).toBeVisible();
});
