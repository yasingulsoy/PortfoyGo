import { expect, test } from '@playwright/test';

test('(e) liderlik tablosu: Sezon sekmesi görünür', async ({ page }) => {
  await page.goto('/leaderboard');

  await expect(page.getByRole('heading', { level: 1, name: 'Liderlik tablosu' })).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Sıralama türü' });
  const seasonTab = tabs.getByRole('tab', { name: 'Sezon' });
  await seasonTab.click();
  await expect(seasonTab).toHaveAttribute('aria-selected', 'true');

  // Sezon panosu: aktif sezon sıralaması ya da (yoksa) boş durum mesajı
  await expect(
    page
      .getByRole('heading', { name: /Sezon sıralaması/ })
      .or(page.getByText('Şu an aktif sezon yok'))
      .or(page.getByText('Henüz sıralama yok'))
      .first(),
  ).toBeVisible();

  // Diğer sekmeler de çalışır
  await tabs.getByRole('tab', { name: 'Tüm zamanlar' }).click();
  await expect(tabs.getByRole('tab', { name: 'Tüm zamanlar' })).toHaveAttribute('aria-selected', 'true');
});
