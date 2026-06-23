import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[ERROR] ${msg.text()}`);
    } else {
      console.log(`[LOG] ${msg.text()}`);
    }
  });
  page.on('pageerror', error => console.log(`[PAGE ERROR] ${error.message}\n${error.stack}`));

  await page.goto('https://127.0.0.1/provision/master');

  // We can just evaluate JS to trigger handleLaunchMock directly if we can't click
  // But wait, it's a React component so we can't just call it from window.
  // Let's click the side panel icons!
  await page.evaluate(() => {
    // Click the 3rd step (Warewulf Server)
    const steps = document.querySelectorAll('div[class*="stepItem"]');
    if (steps.length >= 3) {
      steps[2].click();
    }
  });

  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const launchBtn = btns.find(b => b.textContent.includes('Launch Provisioning'));
    if (launchBtn) {
      launchBtn.click();
    }
  });
  
  console.log("Clicked Launch Provisioning. Waiting for deployment to finish...");
  await page.waitForTimeout(20000); // Wait 20 seconds for mock logs to finish
  
  const content = await page.content();
  console.log("HTML Content contains 'Provisioning Successful!': ", content.includes('Provisioning Successful!'));
  
  await browser.close();
})();
