import { chromium } from 'playwright';

const BASE = process.env.ANYHABIT_URL || 'http://127.0.0.1:5173';
const failures = [];
const consoleErrors = [];

function check(label, ok, detail = '') {
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures.push(`${label} ${detail}`.trim());
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

try {
  console.log('\n[1] Sign in');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Email or username').fill('owner@anyhabit.local');
  await page.getByPlaceholder('••••••••').fill('e2e-password');
  await page.getByRole('button', { name: /Enter Workspace/i }).click();
  await page.waitForSelector('text=Home', { timeout: 10000 });
  check('signed in and reached the dashboard', true);

  console.log('\n[2] Create a tracker with the new fields');
  await page.getByRole('button', { name: 'Create Tracker' }).click();
  await page.waitForSelector('#tracker-name');

  // Typed one key at a time on purpose. `fill()` sets the value in one shot and
  // would not have caught the dialog stealing focus back on every keystroke.
  await page.locator('#tracker-name').click();
  await page.locator('#tracker-name').pressSequentially('Quit Coffee', { delay: 15 });
  check(
    'focus stays in the name field while typing',
    await page.evaluate(() => document.activeElement?.id) === 'tracker-name',
    `focus was on: ${await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName)}`
  );
  check(
    'every typed character arrived',
    (await page.inputValue('#tracker-name')) === 'Quit Coffee',
    await page.inputValue('#tracker-name')
  );

  await page.locator('#tracker-description').click();
  await page.locator('#tracker-description').pressSequentially('Sleeping better', { delay: 15 });
  check(
    'focus stays in the description field while typing',
    await page.evaluate(() => document.activeElement?.id) === 'tracker-description',
    `focus was on: ${await page.evaluate(() => document.activeElement?.id || 'unknown')}`
  );
  check(
    'description received every character',
    (await page.inputValue('#tracker-description')) === 'Sleeping better',
    await page.inputValue('#tracker-description')
  );
  // Back-date the start, which was impossible before.
  await page.fill('#tracker-start', '2026-06-01');
  await page.fill('#tracker-unit', 'Cups');
  await page.getByRole('button', { name: 'Emerald' }).click();
  const amountInput = page.locator('fieldset input[aria-label="Amount"]');
  await amountInput.fill('3');
  const impactAmount = page.locator('input[aria-label="Impact amount"]');
  await impactAmount.fill('4.5');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('text=Tracker created', { timeout: 10000 });
  check('tracker created (toast shown)', true);

  await page.waitForSelector('h1:has-text("Quit Coffee")', { timeout: 10000 });
  check('navigated to the new tracker', true);
  check(
    'description is displayed',
    await page.locator('text=Sleeping better').first().isVisible()
  );
  const startedText = await page.locator('text=/Started .*2026/').first().textContent();
  check('back-dated start date was kept', /Jun/.test(startedText || ''), startedText || '');

  console.log('\n[3] Stats render');
  check('avoided card present', await page.locator('text=Avoided').first().isVisible());
  check('streaks card present', await page.locator('text=Streaks').first().isVisible());
  check('saved card present', await page.locator('text=Saved').first().isVisible());
  const streakValue = await page.locator('text=Current').first().locator('..').locator('div').nth(1).textContent();
  check('streak counted from the back-dated start', Number(streakValue) > 30, `streak=${streakValue}`);

  console.log('\n[4] Log a relapse and confirm it resets the totals');
  const avoidedBefore = await page.locator('.text-4xl').first().textContent();
  await page.getByRole('button', { name: /Log relapse/i }).click();
  await page.waitForSelector('text=Log a relapse?', { timeout: 5000 });
  check('confirmation dialog appears instead of window.confirm', true);
  await page.getByRole('dialog').getByRole('button', { name: 'Log relapse', exact: true }).click();
  await page.waitForSelector('text=/Relapse logged/', { timeout: 10000 });
  await page.waitForTimeout(800);
  const avoidedAfter = await page.locator('.text-4xl').first().textContent();
  check(
    'avoided total reset after the relapse',
    parseFloat(avoidedAfter) < parseFloat(avoidedBefore),
    `${avoidedBefore} -> ${avoidedAfter}`
  );
  check(
    'lifetime total still shown',
    await page.locator('text=/since you first started/').first().isVisible()
  );
  check('relapse badge on the journal entry', await page.locator('text=Relapse').first().isVisible());

  console.log('\n[5] Export dialog opens (previously impossible)');
  await page.getByRole('button', { name: 'Export data' }).click();
  await page.waitForSelector('text=Export your data', { timeout: 5000 });
  check('export dialog opened', true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the dialog', !(await page.locator('text=Export your data').isVisible()));

  console.log('\n[6] Command palette');
  await page.keyboard.press('Control+k');
  await page.waitForSelector('input[aria-label="Search"]', { timeout: 5000 });
  await page.fill('input[aria-label="Search"]', 'coffee');
  await page.waitForTimeout(300);
  check('palette finds the tracker', await page.locator('button:has-text("Quit Coffee")').first().isVisible());
  await page.keyboard.press('Escape');

  console.log('\n[7] Settings: timezone and theme');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForSelector('text=Personalise AnyHabit', { timeout: 5000 });
  await page.getByRole('button', { name: /Preferences/ }).click();
  await page.waitForSelector('#timezone');
  await page.selectOption('#timezone', 'America/Los_Angeles');
  await page.waitForSelector('text=Preferences saved', { timeout: 10000 });
  check('timezone preference saved', true);

  await page.getByRole('button', { name: /^Dark/ }).click();
  await page.waitForTimeout(400);
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('theme-dark'));
  check('dark theme applied to <html>', isDark);

  await page.getByRole('button', { name: /^About/ }).click();
  await page.waitForSelector('text=Version', { timeout: 5000 });
  const reportedVersion = await (await fetch(`${BASE}/version`)).json();
  check(
    'about tab shows the server version',
    await page.locator(`text=${reportedVersion.version}`).first().isVisible(),
    reportedVersion.version
  );
  await page.keyboard.press('Escape');

  console.log('\n[8] Dark mode reaches the sign-in screen');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForSelector('text=Log out', { timeout: 5000 });
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForSelector('text=Private by default', { timeout: 10000 });
  const authBg = await page.evaluate(() => {
    const el = document.querySelector('.auth-screen');
    return el ? getComputedStyle(el).backgroundImage : '';
  });
  check('sign-in page uses the dark palette', authBg.includes('11, 18, 32') || authBg.includes('30, 41, 59'), authBg.slice(0, 80));

  console.log('\n[9] Errors are shown, not swallowed');
  await page.getByPlaceholder('Email or username').fill('owner@anyhabit.local');
  await page.getByPlaceholder('••••••••').fill('definitely-wrong');
  await page.getByRole('button', { name: /Enter Workspace/i }).click();
  await page.waitForTimeout(1200);
  const errorText = await page.locator('.text-rose-700, .text-rose-900').first().textContent();
  check('readable error, not raw JSON', !!errorText && !errorText.includes('{"detail"'), errorText || '(none)');
  check('error says what went wrong', /Invalid credentials/i.test(errorText || ''), errorText || '');
} catch (error) {
  failures.push(`EXCEPTION: ${error.message}`);
  console.log(`\n  EXCEPTION: ${error.message}`);
  await page.screenshot({ path: new URL('./failure.png', import.meta.url).pathname });
}

// React key/prop warnings and unhandled errors would show up here.
const realErrors = consoleErrors.filter(
  (text) => !text.includes('Failed to load resource') && !text.includes('401')
);
console.log(`\n[10] Console clean? ${realErrors.length} error(s)`);
realErrors.slice(0, 8).forEach((text) => console.log(`      ${text.slice(0, 200)}`));
check('no unexpected console errors', realErrors.length === 0, `${realErrors.length} found`);

await browser.close();

console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`${failures.length} CHECK(S) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('ALL BROWSER CHECKS PASSED');
