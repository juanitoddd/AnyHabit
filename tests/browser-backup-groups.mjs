import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.ANYHABIT_URL || 'http://127.0.0.1:5173';
const DOWNLOADS = new URL('./.downloads', import.meta.url).pathname;
fs.mkdirSync(DOWNLOADS, { recursive: true });

const RUN_ID = Date.now().toString(36);
const USERNAME = `restorer_${RUN_ID}`;
const TRACKER_NAME = `Backup Subject ${RUN_ID}`;
const DESCRIPTION = `Written for run ${RUN_ID}`;
const EMAIL = `${USERNAME}@example.com`;

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
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

const signIn = async (identifier, password) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Email or username').fill(identifier);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: /Enter Workspace/i }).click();
  await page.waitForSelector('.app-sidebar button:has-text("Settings")', { timeout: 10000 });
};

try {
  console.log('\n[1] Export a backup');
  await signIn('owner@anyhabit.local', 'e2e-password');

  // Seed a tracker this run owns outright. Relying on another suite's leftovers
  // meant the assertions depended on whatever earlier runs had left behind.
  await page.locator('.home-page button:has-text("Create Tracker")').click();
  await page.waitForSelector('#tracker-name');
  await page.fill('#tracker-name', TRACKER_NAME);
  await page.fill('#tracker-description', DESCRIPTION);
  await page.fill('#tracker-unit', 'Cups');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('text=Tracker created', { timeout: 10000 });
  await page.waitForSelector(`h1:has-text("${TRACKER_NAME}")`, { timeout: 10000 });

  // Give it a journal entry so the backup has something to carry.
  await page.fill('#journal-content', 'Entry written before the backup.');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await page.waitForSelector('text=Journal entry saved', { timeout: 10000 });

  await page.locator('.app-sidebar button:has-text("Home")').click();
  await page.waitForSelector('text=Add Widget', { timeout: 10000 });

  await page.locator('.app-sidebar button:has-text("Export data")').click();
  await page.waitForSelector('text=Export your data');
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.getByRole('dialog').getByRole('button', { name: /^Export$/ }).click();
  const download = await downloadPromise;
  const backupPath = `${DOWNLOADS}/backup.json`;
  await download.saveAs(backupPath);
  check('backup downloaded', fs.existsSync(backupPath));

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  check('backup declares the restorable format', backup.format === 'anyhabit-backup', backup.format);
  check('backup contains the tracker', backup.trackers?.some((t) => t.name === TRACKER_NAME));
  check('backup carries journals', backup.trackers?.some((t) => (t.journals || []).length > 0));
  await page.waitForSelector('text=Export downloaded', { timeout: 5000 });

  console.log('\n[2] Restore into a brand new account');
  await page.locator('.app-sidebar button:has-text("Settings")').click();
  await page.waitForSelector('text=Log out');
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForSelector('text=Private by default');

  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.getByPlaceholder('Your display name').fill(USERNAME);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByPlaceholder('••••••••').fill('a-strong-password');
  await page.getByRole('button', { name: /Create Workspace/i }).click();
  await page.waitForSelector('.app-sidebar button:has-text("Settings")', { timeout: 10000 });
  check('new account created', true);

  await page.locator('.app-sidebar button:has-text("Restore backup")').click();
  await page.waitForSelector('text=Restore from a backup');
  await page.setInputFiles('input[aria-label="Backup file"]', backupPath);
  await page.getByRole('button', { name: /Preview import/i }).click();
  await page.waitForSelector('text=nothing has been changed yet', { timeout: 10000 });
  check('dry-run preview shown before writing', true);

  const previewText = await page.getByRole('dialog').textContent();
  check('preview reports new trackers', /New trackers/.test(previewText || ''));

  await page.getByRole('dialog').getByRole('button', { name: /^Import$/ }).click();
  await page.waitForSelector('text=/Restored .* tracker/', { timeout: 15000 });
  check('import completed with a summary', true);

  await page.waitForTimeout(800);
  check(
    'restored tracker appears in the sidebar',
    await page.locator(`button:has-text("${TRACKER_NAME}")`).first().isVisible()
  );

  console.log('\n[3] Restored data is intact');
  await page.locator(`button:has-text("${TRACKER_NAME}")`).first().click();
  await page.waitForSelector(`h1:has-text("${TRACKER_NAME}")`, { timeout: 10000 });
  check('description restored', await page.locator(`text=${DESCRIPTION}`).first().isVisible());
  check(
    'journal entry restored',
    await page.locator('text=Entry written before the backup.').first().isVisible()
  );

  console.log('\n[4] Group lifecycle');
  await page.locator('.app-sidebar button:has-text("Groups")').last().click();
  await page.waitForSelector('text=Share trackers with family');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.fill('#group-name', 'Household');
  await page.getByRole('button', { name: /Create group/i }).click();
  await page.waitForSelector('text=/Group "Household" created/', { timeout: 10000 });
  check('group created', true);

  await page.waitForSelector('text=Household');
  check('owner crown shown', await page.locator('[aria-label="You own this group"]').isVisible());

  await page.getByRole('button', { name: /^Rename Household$/ }).click();
  await page.fill('input[aria-label="Group name"]', 'Family');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector('text=Group renamed', { timeout: 10000 });
  check('group renamed', await page.locator('text=Family').first().isVisible());

  const codeBefore = await page.locator('code').first().textContent();
  await page.getByRole('button', { name: 'Generate a new join code' }).click();
  await page.waitForSelector('text=Generate a new join code?');
  await page.getByRole('dialog').last().getByRole('button', { name: 'Generate new code' }).click();
  await page.waitForSelector('text=New join code generated', { timeout: 10000 });
  const codeAfter = await page.locator('code').first().textContent();
  check('join code rotated', codeBefore !== codeAfter, `${codeBefore} -> ${codeAfter}`);

  await page.getByRole('button', { name: /Delete group/i }).click();
  await page.waitForSelector('text=Delete Family?');
  check('destructive delete asks for the group name', await page.locator('text=/Type .* to confirm/').isVisible());
  const confirmDialog = page.getByRole('dialog').last();
  await confirmDialog.locator('input[type="text"]').last().fill('Family');
  await confirmDialog.getByRole('button', { name: 'Delete group' }).click();
  await page.waitForSelector('text=Group deleted', { timeout: 10000 });
  check('group deleted after typing its name', true);
  await page.keyboard.press('Escape');

  console.log('\n[5] Archive keeps history');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Archive$/ }).click();
  await page.waitForSelector('text=/Tracker archived/', { timeout: 10000 });
  check('tracker archived', true);
  check('archive badge shown', await page.locator('text=Archived').first().isVisible());
  check(
    'sidebar offers to show archived trackers',
    await page.locator('button:has-text("Show archived")').isVisible()
  );
  await page.getByRole('button', { name: /^Restore$/ }).click();
  await page.waitForSelector('text=Tracker restored', { timeout: 10000 });
  check('tracker restored from the archive', true);

  console.log('\n[6] Change password, then sign in with it');
  await page.locator('.app-sidebar button:has-text("Settings")').click();
  await page.waitForSelector('#current-password');
  await page.fill('#current-password', 'a-strong-password');
  await page.fill('#new-password', 'an-even-better-password');
  await page.fill('#confirm-password', 'mismatched-password');
  check(
    'mismatch is flagged before submitting',
    await page.locator('text=These passwords do not match.').isVisible()
  );
  await page.fill('#confirm-password', 'an-even-better-password');
  await page.getByRole('button', { name: /Update password/i }).click();
  await page.waitForSelector('text=Password updated', { timeout: 10000 });
  check('password changed', true);

  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForSelector('text=Private by default');
  await signIn(USERNAME, 'an-even-better-password');
  check('signed in with the new password', true);
} catch (error) {
  failures.push(`EXCEPTION: ${error.message}`);
  console.log(`\n  EXCEPTION: ${error.message}`);
  await page.screenshot({ path: new URL('./failure2.png', import.meta.url).pathname });
}

const realErrors = consoleErrors.filter((t) => !t.includes('Failed to load resource') && !t.includes('401'));
console.log(`\n[7] Console clean? ${realErrors.length} error(s)`);
realErrors.slice(0, 8).forEach((t) => console.log(`      ${t.slice(0, 200)}`));
check('no unexpected console errors', realErrors.length === 0, `${realErrors.length} found`);

await browser.close();

console.log('\n' + '='.repeat(60));
if (failures.length) {
  console.log(`${failures.length} CHECK(S) FAILED:`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('ALL BACKUP / GROUP / ACCOUNT CHECKS PASSED');
