const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const { chromium } = require('playwright');

const catalogIds = [
  // 2050, // Men Clothing
  // 1231, // Men Shoes
  // 82, // Men Accessories
  // 139, // Men Grooming
  // 4, // Women Clothing
  // 16, // Women Shoes
  19, // Women Bags
  1187, // Women Accessories
  146, // Women Beauty;
];

// Helper function to map catalog IDs to category names
function getCategoryName(catalogId) {
  switch (catalogId) {
    case 2050:
      return 'Men - Clothing';
    case 1231:
      return 'Men - Shoes';
    case 82:
      return 'Men - Accessories';
    case 139:
      return 'Men - Grooming';
    case 4:
      return 'Women - Clothing';
    case 16:
      return 'Women - Shoes';
    case 19:
      return 'Women - Bags';
    case 1187:
      return 'Women - Accessories';
    case 146:
      return 'Women - Beauty';
    default:
      return 'Unknown';
  }
}

// Configuration
const config = {
  baseURL: 'http://localhost:3000',
  outputDir: 'data',
  defaultParams: {
    per_page: 96,
    catalog_from: '0',
  },
  maxRetries: 3,
  delayBetweenRequests: Math.random() * 5000 + 1000, // Random delay between 1-6 seconds
  maxPages: 10, // Limit the number of pages to fetch
};

// Utility function to ensure output directory exists
async function ensureOutputDir(dirName) {
  // Create a date timestamp in DD-MM format
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateTimestamp = `${day}-${month}`;
  
  // Create the path with the date timestamp folder first
  const timestampDir = path.join(__dirname, '..', config.outputDir, dateTimestamp);
  const outputPath = path.join(timestampDir, dirName);
  
  try {
    // First ensure the date timestamp directory exists
    await fs.access(timestampDir);
  } catch {
    await fs.mkdir(timestampDir, { recursive: true });
  }
  
  try {
    // Then ensure the specific output directory exists
    await fs.access(outputPath);
  } catch {
    await fs.mkdir(outputPath, { recursive: true });
  }
  
  return outputPath;
}

// Phase 1: Fetch catalog data
async function fetchCatalogData(catalogId, searchParams = {}) {
  let page = 1;
  let totalItems = 0;
  const allItems = [];

  try {
    while (page <= config.maxPages) {
      console.log(`Fetching page ${page} for catalog ${catalogId}...`);

      try {
        const response = await axios.get('/vinted/catalog', {
          baseURL: config.baseURL,
          params: {
            ...config.defaultParams,
            ...searchParams,
            catalog_ids: catalogId.toString(),
            page,
            time: Math.floor(Date.now() / 1000),
          },
        });

        const { items: rawItems } = response.data;
        if (!rawItems || rawItems.length === 0) {
          console.log(`No more items to fetch for catalog ${catalogId}.`);
          break;
        }

        // Add category information to each item based on catalog ID
        const items = rawItems.map((item) => ({
          ...item,
          category: getCategoryName(catalogId),
        }));

        allItems.push(...items);
        totalItems += items.length;

        // Add delay between requests
        await new Promise((resolve) =>
          setTimeout(resolve, config.delayBetweenRequests)
        );

        page++;
      } catch (error) {
        console.error(
          `Error fetching page ${page} for catalog ${catalogId}:`,
          error.message
        );
        if (error.response?.status === 429 || error.response?.status === 403) {
          console.log('Rate limited. Waiting for a longer period...');
          await new Promise((resolve) => setTimeout(resolve, 10000));
          continue;
        }
        break;
      }
    }

    // Save catalog data
    const rawOutputDir = await ensureOutputDir('raw_catalogs');
    await fs.writeFile(
      path.join(rawOutputDir, `catalog_${catalogId}_raw.json`),
      JSON.stringify(allItems, null, 2)
    );

    // Save summary
    const summary = {
      catalogId,
      totalItems,
      totalPages: page - 1,
      timestamp: new Date().toISOString(),
      searchParams,
    };

    await fs.writeFile(
      path.join(rawOutputDir, `catalog_${catalogId}_summary.json`),
      JSON.stringify(summary, null, 2)
    );

    console.log(`\nFetch completed for catalog ${catalogId}!`);
    console.log(`Total items fetched: ${totalItems}`);
    console.log(`Total pages processed: ${page - 1}`);

    return true;
  } catch (error) {
    console.error(`Fatal error for catalog ${catalogId}:`, error.message);
    return false;
  }
}

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

// Phase 2: Process items from raw catalog data
async function processRawCatalogData(catalogId) {
  let browser = null;
  const combinedItems = [];
  let totalProcessed = 0;

  try {
    // Read raw catalog data
    const rawOutputDir = await ensureOutputDir('raw_catalogs');
    const rawDataPath = path.join(
      rawOutputDir,
      `catalog_${catalogId}_raw.json`
    );
    const rawItems = JSON.parse(await fs.readFile(rawDataPath, 'utf8'));

    console.log(
      `Processing ${rawItems.length} items from catalog ${catalogId}...`
    );

    // Launch browser
    browser = await chromium.launch({
      headless: true,
    });

    // Process each item
    for (const item of rawItems) {
      const url = item.url || `https://www.vinted.nl${item.path}`;

      // Use the new function to scrape the item page
      const detailedInfo = await scrapeItemPage(browser, url);

      if (detailedInfo) {
        const combinedItem = {
          ...item,
          ...detailedInfo,
          catalog_id: catalogId,
          processed_at: new Date().toISOString(),
        };

        combinedItems.push(combinedItem);
        totalProcessed++;

        const itemId = url.split('/').pop().split('-')[0];
        console.log(`✓ Processed item ${itemId}`);
      }

      // Add delay between items
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 2000 + 1000)
      );
    }

    // Save processed data
    const processedOutputDir = await ensureOutputDir('processed_catalogs');
    await fs.writeFile(
      path.join(processedOutputDir, `catalog_${catalogId}_processed.json`),
      JSON.stringify(combinedItems, null, 2)
    );

    console.log(`\nProcessing completed for catalog ${catalogId}!`);
    console.log(`Total items processed: ${totalProcessed}`);

    return true;
  } catch (error) {
    console.error(
      `Fatal error processing catalog ${catalogId}:`,
      error.message
    );
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

// Main execution function
async function main() {
  const searchParams = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  let failedToFetch = [];
  // Phase 1: Fetch all catalog data
  console.log('Phase 1: Fetching catalog data...');
  for (const catalogId of catalogIds) {
    console.log(`\nFetching catalog ID: ${catalogId}`);
    const success = await fetchCatalogData(catalogId, searchParams);
    if (!success) {
      console.error(`Failed to fetch catalog ${catalogId}, moving to next...`);
    }
    failedToFetch.push(catalogId)
    // Add delay between catalogs
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  while (failedToFetch.length > 0) {
    console.log(`\nRetrying failed catalogs: ${failedToFetch.join(', ')}`);
    for (const catalogId of failedToFetch) {
      console.log(`\nFetching catalog ID: ${catalogId}`);
      const success = await fetchCatalogData(catalogId, searchParams);
      if (success) {
        console.log(`✓ Successfully fetched catalog ${catalogId}`);
        failedToFetch = failedToFetch.filter((id) => id !== catalogId);
      } else {
        console.error(
          `Failed to fetch catalog ${catalogId}, moving to next...`
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Phase 2: Process items from raw catalog data
  console.log('\nPhase 2: Processing items from raw catalog data...');
  let totalItemsProcessed = 0;
  let failedToProcess = [];
  for (const catalogId of catalogIds) {
    console.log(
      `\nTotal items processed across all catalogs: ${totalItemsProcessed}`
    );
    console.log(`\nProcessing catalog ID: ${catalogId}`);
    const success = await processRawCatalogData(catalogId);
    if (!success) {
      console.error(
        `Failed to process catalog ${catalogId}, moving to next...`
      );
      failedToProcess.push(catalogId);
    }
    // Add delay between catalogs
    totalItemsProcessed += success ? 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  // Retry failed catalogs
  while (failedToProcess.length !== 0) {
    console.log(`\nRetrying failed catalogs: ${failedToProcess.join(', ')}`);

    for (const catalogId of failedToProcess) {
      console.log(`\nProcessing catalog ID: ${catalogId}`);
      const success = await processRawCatalogData(catalogId);
      if (!success) {
        console.error(
          `Failed to process catalog ${catalogId}, moving to next...`
        );
      } else {
        totalItemsProcessed += success ? 1 : 0;
      }
      // Add delay between catalogs
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log('\nAll catalogs processed!');
}

// Execute the script
main().catch(console.error);
