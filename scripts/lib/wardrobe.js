const axios = require('axios');
const { config } = require('./config');
const { chromium } = require('playwright');
const fs = require('fs/promises');
const path = require('path');
const { ensureOutputDir } = require('./utils');
const { scrapeItemPage, scrapeUserProfile } = require('./scraper');

// Add this new function to process wardrobe items
async function processWardrobeItems(browser, userId, wardrobeItems) {
  const processedItems = [];
  const userProfileInfo = await scrapeUserProfile(browser, userId);

  for (const item of wardrobeItems) {
    const url = item.url || `https://www.vinted.nl${item.path}`;
    console.log(`Processing item ${url} from wardrobe of user ${userId}...`);

    const detailedInfo = await scrapeItemPage(browser, url);

    // enrich processed items with user profile info
    if (detailedInfo) {
      const processedItem = {
        category_id: item.category_id || '',
        listing_url: url,
        listing_id: item.id,
        listing_name: detailedInfo.title,
        listing_description: detailedInfo.description,
        price: parseFloat(detailedInfo.price?.replace('€', '').trim()) || 0,
        price_tax: parseFloat(item.service_fee.amount), // Will be calculated if available
        total_price: parseFloat(item.total_item_price.amount),
        brand: detailedInfo.brand,
        size: detailedInfo.size,
        condition: detailedInfo.condition,
        colour: detailedInfo.color,
        views: detailedInfo.views,
        favorite: detailedInfo.interested
          ? parseInt(detailedInfo.interested)
          : 0,
        upload_time: detailedInfo.uploaded,
        payment_option: detailedInfo.paymentOptions?.join(', ') || '',
        processed_at: new Date().toISOString(),
        ...userProfileInfo,
      };

      processedItems.push(processedItem);
    }

    // Add delay between items
    await new Promise((resolve) =>
      setTimeout(resolve, Math.random() * 200 + 100)
    );
  }

  return processedItems;
}

// Modify fetchWardrobeData to include detailed processing
async function fetchWardrobeData(catalogIds, searchParams = {}, userId) {
  let page = 1;
  let totalItems = 0;
  const allItems = [];
  let browser = null;

  try {
    browser = await chromium.launch({ headless: true });

    for (const catalogId of catalogIds) {
      while (page <= config.maxPages) {
        console.log(`Fetching page ${page} for catalog ${catalogId}...`);
        try {
          const response = await axios.get('/vinted/wardrobe', {
            baseURL: config.baseURL,
            params: {
              ...config.defaultParams,
              ...searchParams,
              catalog_ids: catalogId,
              page,
              time: Math.floor(Date.now() / 1000),
              userId: userId,
            },
          });

          const { items: rawItems } = response.data;
          rawItems.forEach((item) => {
            item.category_id = catalogId;
          });
          if (!rawItems || rawItems.length === 0) {
            console.log('No more items found. Moving to next catalog...');
            page = 1;
            break;
          }

          // Add raw items to allItems before processing
          allItems.push(...rawItems);
          totalItems += rawItems.length;

          // Add delay between requests
          await new Promise((resolve) =>
            setTimeout(resolve, config.delayBetweenRequests)
          );

          page++;
        } catch (error) {
          console.error(
            `Error fetching page ${page} for catalog ${catalogId}:`,
            error
          );
          if (
            error.response?.status === 429 ||
            error.response?.status === 403
          ) {
            console.log('Rate limited. Waiting for a longer period...');
            await new Promise((resolve) => setTimeout(resolve, 10000));
            continue;
          }
          break;
        }
      }
    }

    // Save raw wardrobe data
    const rawOutputDir = await ensureOutputDir('raw_wardrobe');
    await fs.writeFile(
      path.join(rawOutputDir, `wardrobe_${userId}_raw.json`),
      JSON.stringify(allItems, null, 2)
    );

    // Save raw summary
    const rawSummary = {
      totalItems,
      totalPages: page - 1,
      timestamp: new Date().toISOString(),
      searchParams,
    };

    await fs.writeFile(
      path.join(rawOutputDir, `wardrobe_${userId}_summary.json`),
      JSON.stringify(rawSummary, null, 2)
    );

    // Now process the items for detailed info
    const processedItems = await processWardrobeItems(
      browser,
      userId,
      allItems
    );

    // Save processed wardrobe data
    const processedOutputDir = await ensureOutputDir('processed_wardrobe');
    await fs.writeFile(
      path.join(processedOutputDir, `wardrobe_${userId}_processed.json`),
      JSON.stringify(processedItems, null, 2)
    );

    // Save processed summary with user profile info
    const processedSummary = {
      userId,
      totalItems: processedItems.length,
      totalPages: page - 1,
      timestamp: new Date().toISOString(),
      searchParams,
    };

    await fs.writeFile(
      path.join(processedOutputDir, `wardrobe_${userId}_summary.json`),
      JSON.stringify(processedSummary, null, 2)
    );

    return true;
  } catch (error) {
    console.error(`Error processing wardrobe for user ${userId}:`, error);
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

// Add this function to merge all processed wardrobe data
async function mergeWardrobeData() {
  try {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateTimestamp = `${day}-${month}`;

    const timestampDir = path.join(
      __dirname,
      '..',
      '..',
      config.outputDir,
      dateTimestamp
    );
    const processedDir = path.join(timestampDir, 'processed_wardrobe');

    const allItems = [];
    const files = await fs.readdir(processedDir);

    for (const file of files) {
      if (file.endsWith('_processed.json')) {
        const filePath = path.join(processedDir, file);
        const items = JSON.parse(await fs.readFile(filePath, 'utf8'));
        allItems.push(...items);
      }
    }

    // Save merged dataset
    const outputPath = path.join(timestampDir, 'final_dataset.json');
    await fs.writeFile(outputPath, JSON.stringify(allItems, null, 2));

    console.log(
      `\nMerged ${allItems.length} items into final dataset: ${outputPath}`
    );
    return true;
  } catch (error) {
    console.error('Error merging wardrobe data:', error.message);
    return false;
  }
}

async function fetchUserItemFacets(userId) {
  let totalItems = 0;
  const allItems = [];

  try {
    const response = await axios.get('/vinted/item_facets', {
      baseURL: config.baseURL,
      params: {
        userId: userId,
      },
    });

    const { catalogs: rawItems } = response.data;
    rawItems.forEach((item) => {
      allItems.push(item.id);
    });

    totalItems += allItems.length;

    // Add delay between requests
    await new Promise((resolve) =>
      setTimeout(resolve, config.delayBetweenRequests)
    );
  } catch (error) {
    console.error(`Error fetching item facets:`, error);
    if (error.response?.status === 429 || error.response?.status === 403) {
      console.log('Rate limited. Waiting for a longer period...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  return allItems;
}

// Add this function to merge all processed wardrobe data
async function mergeWardrobeData(paramDay = null, paramMonth = null) {
  try {
    const now = new Date();
    const day =
      paramDay.padStart(2, '0') || String(now.getDate()).padStart(2, '0');
    const month =
      paramMonth.padStart(2, '0') ||
      String(now.getMonth() + 1).padStart(2, '0');
    const dateTimestamp = `${day}-${month}`;

    const timestampDir = path.join(
      __dirname,
      '..',
      '..',
      config.outputDir,
      dateTimestamp
    );
    const processedDir = path.join(timestampDir, 'processed_wardrobe');

    const allItems = [];
    const files = await fs.readdir(processedDir);

    for (const file of files) {
      if (file.endsWith('_processed.json')) {
        const filePath = path.join(processedDir, file);
        const items = JSON.parse(await fs.readFile(filePath, 'utf8'));
        allItems.push(...items);
      }
    }

    // Save merged dataset
    const outputPath = path.join(timestampDir, 'final_dataset.json');
    await fs.writeFile(outputPath, JSON.stringify(allItems, null, 2));

    console.log(
      `\nMerged ${allItems.length} items into final dataset: ${outputPath}`
    );
    return true;
  } catch (error) {
    console.error('Error merging wardrobe data:', error.message);
    return false;
  }
}

module.exports = {
  processWardrobeItems,
  fetchWardrobeData,
  mergeWardrobeData,
  fetchUserItemFacets,
};
