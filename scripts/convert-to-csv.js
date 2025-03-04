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

const main = async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const processedCatalogsDir = path.join(dataDir, 'processed_catalogs');

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
        dataDir,
        `vinted_items_catalog_${catalogId}.csv`
      );
      fs.writeFileSync(outputPath, csv, 'utf8');

      console.log(`Converted ${items.length} items to CSV: ${outputPath}`);
    } else {
      console.log(`No items found in catalog ${catalogId}`);
    }
  }

  console.log('All catalogs processed!');
};

main().catch(console.error);
