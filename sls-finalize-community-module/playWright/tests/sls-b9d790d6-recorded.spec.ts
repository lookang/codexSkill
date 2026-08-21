import { test, expect } from '@playwright/test';

test.use({
  storageState: '.auth/sls-state.json',
  viewport: {
    height: 1000,
    width: 1440,
  },
});

test('recorded SLS Community Gallery workflow', async ({ page }) => {
  await page.goto(
    'https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/b9d790d6-8775-4fd7-bc11-7d86d2077fbe/section/105854425/activity/109477492?pageNo=1',
  );
  await expect(page, 'Refresh .auth/sls-state.json before running this test').not.toHaveURL(/\/login/);
  await page.locator('.left-menu-pin > .pin-control').click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('.divider-button').first().click();
  await page.goto(
    'https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/b9d790d6-8775-4fd7-bc11-7d86d2077fbe/section/105854427',
  );
});
