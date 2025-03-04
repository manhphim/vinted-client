const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

async function extractProductInfo($) {
  const productInfo = {
    title: '',
    description: '',
    price: '',
    brand: '',
    size: '',
    condition: '',
    color: '',
    location: '',
    views: 0,
    interested: '',
    uploaded: '',
    paymentOptions: [],
    shipping: '',
  };

  // Save HTML to file for debugging
  const debugDir = path.join(__dirname, '..', 'data', 'debug_html');
  await fs.mkdir(debugDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const debugHtmlPath = path.join(debugDir, `debug_${timestamp}.html`);
  await fs.writeFile(debugHtmlPath, $.html());
  console.log('Extracting product info... Debug HTML saved to:', debugHtmlPath);
  try {
    // Extract title using data-testid
    const titleElement = $(
      '[data-testid="item-page-summary-plugin"] .web_ui__Text__title'
    ).first();
    productInfo.title = titleElement.text().trim();

    // Extract description
    const descriptionElement = $('[itemprop="description"]');
    productInfo.description = descriptionElement.text().trim();

    // Extract price
    const priceElement = $(
      '[data-testid="item-price"] .web_ui__Text__subtitle'
    );
    if (priceElement.length) {
      productInfo.price = priceElement.text().trim();
    }

    // Extract location
    const locationElement = $(
      '[data-testid="item-attributes-location"] [itemprop="location"]'
    );

    // console.log(locationElement.html());
    if (locationElement.length) {
      productInfo.location = locationElement.text().trim();
    }
    // Get all detail items using data-testid
    const detailItems = $('[data-testid^="item-attributes-"]');

    // Process each detail item
    detailItems.each((_, item) => {
      const $item = $(item);
      // console.log('Debug item:', {
      //   testId: $item.attr('data-testid'),
      //   html: $item.html(),
      //   text: $item.text()
      // });
      const label = $item
        .find('.details-list__item-value')
        .first()
        .text()
        .trim()
        .toLowerCase();
      const value = $item.find('.web_ui__Text__bold').first().text().trim();

      // Map the data-testid to productInfo fields
      const testId = $item.attr('data-testid');
      switch (testId) {
        case 'item-attributes-brand':
          productInfo.brand = value;
          break;
        case 'item-attributes-size':
          productInfo.size = value;
          break;
        case 'item-attributes-status':
          productInfo.condition = value;
          break;
        case 'item-attributes-color':
          productInfo.color = value;
          break;
        // case 'item-attributes-location':
        //   productInfo.location = value;
        //   break;
        case 'item-attributes-view_count':
          productInfo.views = parseInt(value) || 0;
          break;
        case 'item-attributes-interested':
          productInfo.interested = value;
          break;
        case 'item-attributes-upload_date':
          productInfo.uploaded = value;
          break;
        case 'item-attributes-payment_methods':
          productInfo.paymentOptions = value.split(', ');
          break;
      }
    });

    // Extract shipping information
    const shippingElement = $('[data-testid="item-shipping-banner-price"]');
    if (shippingElement.length) {
      productInfo.shipping = shippingElement.text().trim();
    }

    // Fallback for price if not found using data-testid
    if (!productInfo.price) {
      const fallbackPriceElement = $('.product-price__value');
      if (fallbackPriceElement.length) {
        productInfo.price = fallbackPriceElement.text().trim();
      }
    }
  } catch (error) {
    console.error('Error extracting product info:', error);
  }

  return productInfo;
}

async function scrapeAndProcessItem(url) {
  let browser = null;

  try {
    browser = await chromium.launch({
      headless: true
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    await context.addCookies([{
      name: 'locale',
      value: 'en',
      domain: '.vinted.nl',
      path: '/'
    }]);

    await page.setViewportSize({ width: 1280, height: 800 });

    console.log(`Scraping ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const html = await page.content();
    const $ = cheerio.load(html);
    return await extractProductInfo($);
  } catch (error) {
    console.error(`Error scraping item from ${url}:`, error);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

async function getAllItemUrls() {
  const dataDir = path.join(__dirname, '..', 'data');
  const catalogDirs = await fs.readdir(dataDir);
  const itemUrls = new Set();

  for (const dir of catalogDirs) {
    if (dir.startsWith('catalog_')) {
      const catalogPath = path.join(dataDir, dir);
      const files = await fs.readdir(catalogPath);

      for (const file of files) {
        if (file.startsWith('vinted_items_page_') && file.endsWith('.json')) {
          const content = await fs.readFile(
            path.join(catalogPath, file),
            'utf8'
          );
          const items = JSON.parse(content);

          items.forEach((item) => {
            if (item.url) {
              itemUrls.add(item.url);
            } else if (item.path) {
              itemUrls.add(`https://www.vinted.nl${item.path}`);
            }
          });
        }
      }
    }
  }

  return Array.from(itemUrls);
}

async function processItems() {
  try {
    const outputDir = path.join(__dirname, '..', 'data', 'extracted_items');
    await fs.mkdir(outputDir, { recursive: true });

    const itemUrls = await getAllItemUrls();
    const urlsToProcess = itemUrls.slice(0, 10); // Only process first 10 URLs
    console.log(
      `Found ${itemUrls.length} total items, processing first ${urlsToProcess.length} items`
    );

    for (const url of urlsToProcess) {
      const itemId = url.split('/').pop().split('-')[0];
      const productInfo = await scrapeAndProcessItem(url);

      if (productInfo) {
        const outputPath = path.join(outputDir, `item_${itemId}.json`);
        await fs.writeFile(outputPath, JSON.stringify(productInfo, null, 2));
        console.log(`✓ Processed item ${itemId}`);

        // Add delay between requests to avoid rate limiting
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 2000 + 1000)
        );
      }
    }

    console.log('Test processing completed successfully!');
  } catch (error) {
    console.error('Error processing items:', error);
    process.exit(1);
  }
}

// Execute the script
processItems();
