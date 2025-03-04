const cheerio = require('cheerio');

// Mock console.error
console.error = jest.fn();

// Import the function to test
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

      switch (testId) {
        case 'item-status':
          const statusValue = $item
            .find('.web_ui__Cell__body')
            .first()
            .text()
            .trim();
          if (statusValue) {
            productInfo.status = statusValue;
          } else {
            productInfo.status = 'Active';
          }

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

describe('extractProductInfo', () => {
  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Date for consistent testing of timestamp calculations
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2023-01-01T12:00:00Z'));
  });

  // Restore original Date after tests
  afterEach(() => {
    jest.useRealTimers();
  });

  test('should extract all product information when all elements are present', async () => {
    const url = 'https://www.vinted.nl/items/5911866792-luisterboek-superjuffie';
    let context = null;
    let page = null;
    let html = '';
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

      html = await page.content();

    } catch (error) {
      console.error(`Error processing item ${url}:`, error.message);
    } finally {
      if (page) await page.close();
      if (context) await context.close();
    }
    const $ = cheerio.load(html);
    const result = await extractProductInfo($);

    // Expected date calculation for "2 days ago"
    const expectedDate = new Date('2023-01-01T12:00:00Z');
    expectedDate.setDate(expectedDate.getDate() - 2);

    // Verify all extracted fields
    expect(result).toEqual({
      title: 'Test Product Title',
      description: 'This is a test product description',
      price: '€25.99',
      brand: 'Nike',
      size: 'M',
      condition: 'Good condition',
      color: 'Black',
      location: 'Amsterdam, Netherlands',
      views: 123,
      interested: '5 people',
      uploaded: '2 days ago',
      uploaded_timestamp: expectedDate.toISOString(),
      paymentOptions: ['Credit Card', 'PayPal'],
      shipping: '€3.99',
      status: 'Sold',
    });
      
  });

  test('should handle missing elements gracefully', async () => {
    // Create a minimal HTML structure with only some elements
    const html = `
      <div data-testid="item-page-summary-plugin">
        <div class="web_ui__Text__title">Minimal Product</div>
      </div>
      <div itemprop="description">Minimal description</div>
    `;

    const $ = cheerio.load(html);
    const result = await extractProductInfo($);

    // Verify that missing fields have default values
    expect(result).toEqual({
      title: 'Minimal Product',
      description: 'Minimal description',
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
    });
  });

  test('should use fallback price when primary price element is missing', async () => {
    // HTML with fallback price but no primary price element
    const html = `
      <div data-testid="item-page-summary-plugin">
        <div class="web_ui__Text__title">Product with Fallback Price</div>
      </div>
      <div itemprop="description">Description</div>
      <div class="product-price__value">€19.99</div>
    `;

    const $ = cheerio.load(html);
    const result = await extractProductInfo($);

    expect(result.price).toBe('€19.99');
  });

  test('should handle various relative time formats for upload date', async () => {
    // Test cases for different time formats
    const testCases = [
      { input: 'a minute ago', expected: -1, unit: 'minute' },
      { input: 'an hour ago', expected: -1, unit: 'hour' },
      { input: '5 minutes ago', expected: -5, unit: 'minute' },
      { input: '3 hours ago', expected: -3, unit: 'hour' },
      { input: '1 day ago', expected: -1, unit: 'day' },
      { input: '2 weeks ago', expected: -14, unit: 'day' },
      { input: '1 month ago', expected: -1, unit: 'month' },
      { input: '2 years ago', expected: -2, unit: 'year' },
    ];

    for (const { input, expected, unit } of testCases) {
      const html = `
        <div data-testid="item-page-summary-plugin">
          <div class="web_ui__Text__title">Time Test</div>
        </div>
        <div itemprop="description">Description</div>
        <div data-testid="item-attributes-upload_date">
          <span class="web_ui__Text__bold">${input}</span>
        </div>
      `;

      const $ = cheerio.load(html);
      const result = await extractProductInfo($);

      // Calculate expected date
      const baseDate = new Date('2023-01-01T12:00:00Z');
      const expectedDate = new Date(baseDate);
      
      switch (unit) {
        case 'minute':
          expectedDate.setMinutes(baseDate.getMinutes() + expected);
          break;
        case 'hour':
          expectedDate.setHours(baseDate.getHours() + expected);
          break;
        case 'day':
          expectedDate.setDate(baseDate.getDate() + expected);
          break;
        case 'month':
          expectedDate.setMonth(baseDate.getMonth() + expected);
          break;
        case 'year':
          expectedDate.setFullYear(baseDate.getFullYear() + expected);
          break;
      }

      expect(result.uploaded).toBe(input);
      expect(result.uploaded_timestamp).toBe(expectedDate.toISOString());
    }
  });

  test('should handle invalid upload date format gracefully', async () => {
    const html = `
      <div data-testid="item-page-summary-plugin">
        <div class="web_ui__Text__title">Invalid Time Test</div>
      </div>
      <div itemprop="description">Description</div>
      <div data-testid="item-attributes-upload_date">
        <span class="web_ui__Text__bold">Invalid time format</span>
      </div>
    `;

    const $ = cheerio.load(html);
    const result = await extractProductInfo($);

    expect(result.uploaded).toBe('Invalid time format');
    expect(result.uploaded_timestamp).toBeNull();
  });

  test('should handle errors gracefully', async () => {
    // Create a mock $ function that throws an error
    const $ = () => {
      throw new Error('Test error');
    };
    
    // Add necessary methods to make the function run
    $.find = jest.fn().mockReturnThis();
    $.first = jest.fn().mockReturnThis();
    $.text = jest.fn().mockReturnValue('');
    $.trim = jest.fn().mockReturnValue('');
    $.attr = jest.fn().mockReturnValue('');
    $.each = jest.fn();
    
    const result = await extractProductInfo($);

    // Verify error was logged
    expect(console.error).toHaveBeenCalledWith(
      'Error extracting product info:',
      expect.any(Error)
    );

    // Verify default empty object is returned
    expect(result).toEqual({
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
    });
  });

  test('should handle item-status correctly', async () => {
    const html = `
      <div data-testid="item-page-summary-plugin">
        <div class="web_ui__Text__title">Status Test</div>
      </div>
      <div itemprop="description">Description</div>
      <div data-testid="item-status">
        <div class="web_ui__Cell__body">Reserved</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const result = await extractProductInfo($);

    expect(result.status).toBe('Reserved');
  });

  test('should set default status to Active when status value is empty', async () => {
    const html = `
      <div data-testid="item-page-summary-plugin">
        <div class="web_ui__Text__title">Default Status Test</div>
      </div>
      <div itemprop="description">Description</div>
      <div data-testid="item-status">
        <div class="web_ui__Cell__body"></div>
      </div>
    `;

    const $ = cheerio.load(html);
    const result = await extractProductInfo($);

    expect(result.status).toBe('Active');
  });
});