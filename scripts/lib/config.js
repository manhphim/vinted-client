const config = {
  baseURL: 'http://localhost:3000',
  outputDir: 'data',
  defaultParams: {
    per_page: 96,
    catalog_from: '0',
  },
  maxRetries: 3,
  delayBetweenRequests: Math.random() * 200 + 100,
  maxPages: 10,
};

const catalogIds = [
  1206, // Men Outerwear
  1037, // Women Outerwear
];

function getCategoryName(catalogId) {
  switch (catalogId) {
    case 1037:
      return 'Women - Outerwear';
    case 1206:
      return 'Men - Outerwear';
    default:
      return 'Unknown';
  }
}

module.exports = {
  config,
  catalogIds,
  getCategoryName,
};
