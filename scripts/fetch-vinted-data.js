const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
 
const catalogIds = [
  5, // Men All
  2050, // Men Clothing
  1904, // Women All
  4, // Women Clothing
];

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
async function ensureOutputDir(catalogId) {
  const outputPath = path.join(__dirname, '..', config.outputDir, `catalog_${catalogId}`);
  try {
    await fs.access(outputPath);
  } catch {
    await fs.mkdir(outputPath, { recursive: true });
  }
  return outputPath;
}

// Utility function to save data to file
async function saveToFile(data, page, catalogId) {
  const outputPath = await ensureOutputDir(catalogId);
  const filename = `vinted_items_page_${page}_${Date.now()}.json`;
  await fs.writeFile(
    path.join(outputPath, filename),
    JSON.stringify(data, null, 2)
  );
  console.log(`✓ Saved page ${page} for catalog ${catalogId} to ${filename}`);
}

// Main fetching function
async function fetchVintedData(catalogId, searchParams = {}) {
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

        const { items } = response.data;
        if (!items || items.length === 0) {
          console.log(`No more items to fetch for catalog ${catalogId}.`);
          break;
        }

        totalItems += items.length;
        allItems.push(...items);

        // Save each page's data individually
        await saveToFile(items, page, catalogId);

        // Add delay between requests
        await new Promise((resolve) =>
          setTimeout(resolve, config.delayBetweenRequests)
        );

        page++;
      } catch (error) {
        console.error(`Error fetching page ${page} for catalog ${catalogId}:`, error.message);
        if (error.response?.status === 429 || error.response?.status === 403) {
          console.log('Rate limited. Waiting for a longer period...');
          await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
          continue;
        }
        break;
      }
    }

    console.log(`\nFetch completed for catalog ${catalogId}!`);
    console.log(`Total items fetched: ${totalItems}`);
    console.log(`Total pages processed: ${page - 1}`);

    // Save summary file
    const summary = {
      catalogId,
      totalItems,
      totalPages: page - 1,
      timestamp: new Date().toISOString(),
      searchParams,
    };

    const outputPath = await ensureOutputDir(catalogId);
    await fs.writeFile(
      path.join(outputPath, 'fetch_summary.json'),
      JSON.stringify(summary, null, 2)
    );
  } catch (error) {
    console.error(`Fatal error for catalog ${catalogId}:`, error.message);
    return false;
  }
  return true;
}

// Execute the script for each catalog ID
async function main() {
  const searchParams = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  
  for (const catalogId of catalogIds) {
    console.log(`\nProcessing catalog ID: ${catalogId}`);
    const success = await fetchVintedData(catalogId, searchParams);
    if (!success) {
      console.error(`Failed to process catalog ${catalogId}, moving to next...`);
    }
    // Add delay between catalogs to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('\nAll catalogs processed!');
}

main().catch(console.error);
