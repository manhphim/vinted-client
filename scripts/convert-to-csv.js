const fs = require('fs');
const path = require('path');

// Fields to extract from each item
const csvFields = [
  'id',
  'title',
  'brand_title',
  'description',
  'status',
  'size_title',
  'url',
  'color',
  'photo.url',
  'photo.dominant_color',
  'user.login',
  'user.profile_url',
  'favourite_count',
  'view_count',
  'interested',
  'location',
  'price',
  'service_fee.amount',
  'total_item_price.amount',
  'total_item_price.currency_code',
  'shipping',
  'uploaded_timestamp'
];

// Helper to safely get nested object values
const getNestedValue = (obj, path) => {
  return path
    .split('.')
    .reduce(
      (current, key) =>
        current && current[key] !== undefined ? current[key] : '',
      obj
    );
};

// Convert array of items to CSV rows
const convertToCSV = (items) => {
  // CSV header
  const header = csvFields.join(',');

  // Convert each item to CSV row
  const rows = items.map((item) => {
    return csvFields
      .map((field) => {
        const value = getNestedValue(item, field);
        // Escape commas and quotes in values
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  return [header, ...rows].join('\n');
};

const processCatalogFiles = async (processedCatalogsDir, outputDir) => {
  // Get all processed catalog files
  const catalogFiles = fs
    .readdirSync(processedCatalogsDir)
    .filter((f) => f.match(/^catalog_\d+_processed\.json$/));

  // Process each catalog file
  for (const file of catalogFiles) {
    const catalogId = file.match(/^catalog_(\d+)_processed\.json$/)[1];
    console.log(`Processing catalog ${catalogId}...`);

    const filePath = path.join(processedCatalogsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const items = JSON.parse(content);

    if (items.length > 0) {
      // Convert to CSV
      const csv = convertToCSV(items);

      // Write catalog-specific CSV file
      const outputPath = path.join(
        outputDir,
        `vinted_items_catalog_${catalogId}.csv`
      );
      fs.writeFileSync(outputPath, csv, 'utf8');

      console.log(`Converted ${items.length} items to CSV: ${outputPath}`);
    } else {
      console.log(`No items found in catalog ${catalogId}`);
    }
  }
};

const main = async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  
  // Get all date folders (e.g., 28-02, 04-03)
  const dateFolders = fs.readdirSync(dataDir)
    .filter(folder => {
      const folderPath = path.join(dataDir, folder);
      return fs.statSync(folderPath).isDirectory() && 
             /^\d{2}-\d{2}$/.test(folder); // Match date format like "28-02"
    });
  
  if (dateFolders.length === 0) {
    console.log('No date folders found. Processing root data directory...');
    const processedCatalogsDir = path.join(dataDir, 'processed_catalogs');
    if (fs.existsSync(processedCatalogsDir)) {
      await processCatalogFiles(processedCatalogsDir, dataDir);
    } else {
      console.log('No processed_catalogs directory found.');
    }
    return;
  }
  
  // Process each date folder
  for (const dateFolder of dateFolders) {
    console.log(`\nProcessing data for date: ${dateFolder}`);
    const dateFolderPath = path.join(dataDir, dateFolder);
    const processedCatalogsDir = path.join(dateFolderPath, 'processed_catalogs');
    
    if (fs.existsSync(processedCatalogsDir)) {
      await processCatalogFiles(processedCatalogsDir, dateFolderPath);
    } else {
      console.log(`No processed_catalogs directory found in ${dateFolder}.`);
    }
  }

  console.log('\nAll date folders processed!');
};

main().catch(console.error);
