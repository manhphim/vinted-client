const { chromium } = require('playwright');

async function detectAccessToken() {
  const browser = await chromium.launch({
    headless: false, // Launch in visible mode
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Track request headers and look for access token
    page.on('request', async (request) => {
      const url = request.url();
      // Only process requests to Vinted domain
      if (url.startsWith('https://www.vinted.nl/')) {
        const cookies = await context.cookies();
        const accessTokenCookie = cookies.find(cookie => cookie.name === 'access_token_web');
        
        if (accessTokenCookie) {
          console.log('\n=== Access Token Found! ===');
          console.log('access_token_web:', accessTokenCookie.value);
          console.log('Domain:', accessTokenCookie.domain);
          console.log('Expires:', new Date(accessTokenCookie.expires * 1000).toISOString());
          console.log('======================\n');
        }
      }
    });

    // Navigate to the Vinted item URL
    console.log('Navigating to Vinted item page...');
    await page.goto('https://www.vinted.nl/catalog/5-men', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for potential requests to be made
    await page.waitForTimeout(5000);

    // Keep the browser open for manual inspection
    console.log('\nBrowser will stay open for manual inspection.');
    console.log('Press Ctrl+C to close the browser and exit.');

    // Wait indefinitely (until manual termination)
    await new Promise(() => {});
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Browser will be closed when the script is terminated
    process.on('SIGINT', async () => {
      console.log('\nClosing browser...');
      await browser.close();
      process.exit();
    });
  }
}

detectAccessToken().catch(console.error);
