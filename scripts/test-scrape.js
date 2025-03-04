import { chromium } from 'playwright';
import * as cheerio from 'cheerio';

// Extract detailed product information
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
    uploaded_timestamp: null,
    paymentOptions: [],
    shipping: '',
    status: '',
  };

  try {
    const status = $('[data-testid="item-status"] .web_ui__Cell__body')
      .first()
      .text()
      .trim();
    if (status) {
      productInfo.status = status;
    } else {
      productInfo.status = 'Active';
    }
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
    if (locationElement.length) {
      productInfo.location = locationElement.text().trim();
    }

    // Get all detail items using data-testid
    const detailItems = $('[data-testid^="item-attributes-"]');

    // Process each detail item
    detailItems.each((_, item) => {
      const $item = $(item);
      const value = $item.find('.web_ui__Text__bold').first().text().trim();
      const testId = $item.attr('data-testid');
      console.log('testId', testId);


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
        case 'item-attributes-view_count':
          productInfo.views = parseInt(value) || 0;
          break;
        case 'item-attributes-interested':
          productInfo.interested = value;
          break;
        case 'item-attributes-upload_date':
          productInfo.uploaded = value;
          // Calculate exact upload timestamp from relative time
          const relativeTime = value.toLowerCase();
          const now = new Date();
          let uploadTime = new Date(now);

          const timeMatch = relativeTime.match(
            /(?:an?\s+|\d+\s+)(minute|hour|day|week|month|year)s?\s+ago/
          );
          if (timeMatch) {
            const [_, unit] = timeMatch;
            const num =
              relativeTime.startsWith('a') || relativeTime.startsWith('an')
                ? 1
                : parseInt(relativeTime);

            switch (unit) {
              case 'minute':
                uploadTime.setMinutes(now.getMinutes() - num);
                break;
              case 'hour':
                uploadTime.setHours(now.getHours() - num);
                break;
              case 'day':
                uploadTime.setDate(now.getDate() - num);
                break;
              case 'week':
                uploadTime.setDate(now.getDate() - num * 7);
                break;
              case 'month':
                uploadTime.setMonth(now.getMonth() - num);
                break;
              case 'year':
                uploadTime.setFullYear(now.getFullYear() - num);
                break;
            }
            productInfo.uploaded_timestamp = uploadTime.toISOString();
          }
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

// New function to scrape a single item page
async function scrapeItemPage(browser, url) {
  let context = null;
  let page = null;
  let detailedInfo = null;

  try {
    context = await browser.newContext();
    page = await context.newPage();

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    await context.addCookies([
      {
        name: 'locale',
        value: 'en',
        domain: '.vinted.nl',
        path: '/',
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });

    console.log(`Scraping ${url}...`);
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const html = await page.content();
    const $ = cheerio.load(html);
    detailedInfo = await extractProductInfo($);
  } catch (error) {
    console.error(`Error processing item ${url}:`, error.message);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
  }

  return detailedInfo;
}

async function main() {
  const url = 'https://www.vinted.nl/items/5911866792-luisterboek-superjuffie';
  const browser = await chromium.launch({ headless: true });

  try {
    const item = await scrapeItemPage(browser, url);
    console.log(item);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
