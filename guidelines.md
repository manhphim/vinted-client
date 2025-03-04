# Vinted Data Collection Documentation

This document outlines how we collect data from Vinted using our custom scraping solution.

## Overview

Our data collection process consists of two main phases:

1. Fetching catalog data from Vinted
2. Processing and extracting detailed information from individual item pages

## Setup Requirements

- Node.js environment
- Local proxy server running on port 3000
- Required dependencies: axios, cheerio, playwright, fs, path

## Data Collection Process

### Phase 1: Catalog Data Collection

We fetch catalog data by category using the Vinted API through our local proxy:

```javascript
async function fetchCatalogData(catalogId, searchParams = {}) {
  // Makes paginated requests to the Vinted catalog API: https://www.vinted.nl/api/v2/catalog/items (how do we know the API: by observing network tab in browser)
  // Saves raw catalog data to JSON files
}
```

The script fetches multiple pages of catalog data for each category (Men's Clothing, Women's Shoes, etc.) and stores the raw results in JSON format.

### Phase 2: Detailed Item Processing

For each item found in the catalog data:

```javascript
async function processRawCatalogData(catalogId) {
  // Reads the raw catalog data
  // For each item, visits the individual product page
  // Extracts detailed information using scrapeItemPage()
  // Combines catalog data with detailed product information
  // Saves the enriched data
}
```

The `scrapeItemPage()` function uses Playwright to render the page and Cheerio to extract structured data from the HTML.

## Output

Data is organized in date-stamped folders (e.g., `data/28-02/`) containing:

- Raw catalog data (`raw_catalogs/catalog_[ID]_raw.json`)
- Summary files (`raw_catalogs/catalog_[ID]_summary.json`)
- Processed detailed data (`processed_catalogs/catalog_[ID]_processed.json`)

## Usage

Run the script with optional search parameters:

```bash
node scripts/fetch-and-extract-vinted-data.js
```

## Limitations

- Rate limiting: The script includes delays between requests to avoid being blocked
- Headless browser: Some product details require JavaScript rendering
- Data structure changes: Vinted may change their HTML structure, requiring selector updates
