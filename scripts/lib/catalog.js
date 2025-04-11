const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');
const { config, getCategoryName } = require('./config');
const { ensureOutputDir } = require('./utils');
const { scrapeItemPage } = require('./scraper');

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
    console.log('error', error);
    console.error(`Fatal error for catalog ${catalogId}:`, error.message);
    return false;
  }
}

// async function processRawCatalogData(catalogId) {
//   let browser = null;
//   const combinedItems = [];
//   let totalProcessed = 0;

//   try {
//     // Read raw catalog data
//     const rawOutputDir = await ensureOutputDir('raw_catalogs');
//     const rawDataPath = path.join(
//       rawOutputDir,
//       `catalog_${catalogId}_raw.json`
//     );
//     const rawItems = JSON.parse(await fs.readFile(rawDataPath, 'utf8'));

//     console.log(
//       `Processing ${rawItems.length} items from catalog ${catalogId}...`
//     );

//     // Launch browser
//     browser = await chromium.launch({
//       headless: true,
//     });

//     // Process each item
//     for (const item of rawItems) {
//       const url = item.url || `https://www.vinted.nl${item.path}`;

//       // Use the new function to scrape the item page
//       const detailedInfo = await scrapeItemPage(browser, url);

//       if (detailedInfo) {
//         const combinedItem = {
//           ...item,
//           ...detailedInfo,
//           catalog_id: catalogId,
//           processed_at: new Date().toISOString(),
//         };

//         combinedItems.push(combinedItem);
//         totalProcessed++;

//         const itemId = url.split('/').pop().split('-')[0];
//         console.log(`✓ Processed item ${itemId}`);
//       }

//       // Add delay between items
//       await new Promise((resolve) =>
//         setTimeout(resolve, Math.random() * 2000 + 1000)
//       );
//     }

//     // Save processed data
//     const processedOutputDir = await ensureOutputDir('processed_catalogs');
//     await fs.writeFile(
//       path.join(processedOutputDir, `catalog_${catalogId}_processed.json`),
//       JSON.stringify(combinedItems, null, 2)
//     );

//     console.log(`\nProcessing completed for catalog ${catalogId}!`);
//     console.log(`Total items processed: ${totalProcessed}`);

//     return true;
//   } catch (error) {
//     console.error(
//       `Fatal error processing catalog ${catalogId}:`,
//       error.message
//     );
//     return false;
//   } finally {
//     if (browser) await browser.close();
//   }
// }

async function processWardrobeData(userId) {
  let browser = null;
  const combinedItems = [];
  let totalProcessed = 0;

  try {
    // Read raw wardrobe data
    const rawOutputDir = await ensureOutputDir('raw_wardrobe');
    const rawDataPath = path.join(rawOutputDir, `wardrobe_${userId}_raw.json`);
    const rawItems = JSON.parse(await fs.readFile(rawDataPath, 'utf8'));

    console.log(
      `Processing ${rawItems.length} items from wardrobe of user ${userId}...`
    );

    // Launch browser
    browser = await chromium.launch({
      headless: true,
    });

    // Process each item
    for (const item of rawItems) {
      const url = item.url || `https://www.vinted.nl${item.path}`;

      // Use the scrapeItemPage function to get detailed info
      const detailedInfo = await scrapeItemPage(browser, url);

      if (detailedInfo) {
        const combinedItem = {
          ...item,
          ...detailedInfo,
          user_id: userId,
          processed_at: new Date().toISOString(),
        };

        combinedItems.push(combinedItem);
        totalProcessed++;

        const itemId = url.split('/').pop().split('-')[0];
        console.log(`✓ Processed item ${itemId} from user ${userId}`);
      }

      // Add delay between items
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 200 + 100)
      );
    }

    // Save processed data
    const processedOutputDir = await ensureOutputDir('processed_wardrobe');
    await fs.writeFile(
      path.join(processedOutputDir, `wardrobe_${userId}_processed.json`),
      JSON.stringify(combinedItems, null, 2)
    );

    console.log(`\nProcessing completed for user ${userId}'s wardrobe!`);
    console.log(`Total items processed: ${totalProcessed}`);

    return true;
  } catch (error) {
    console.error(
      `Fatal error processing wardrobe for user ${userId}:`,
      error
    );
    return false;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  fetchCatalogData,
  processWardrobeData,
};
