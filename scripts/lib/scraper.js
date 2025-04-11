const { chromium } = require('playwright');
const cheerio = require('cheerio');

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

// Function to scrape a user's profile page
async function scrapeUserProfile(browser, userId) {
  let context = null;
  let page = null;
  let profileInfo = null;

  try {
    context = await browser.newContext();
    page = await context.newPage();

    const url = `https://www.vinted.nl/member/${userId}`;
    console.log(`Scraping user profile: ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const html = await page.content();
    const $ = cheerio.load(html);
    profileInfo = await extractUserProfileInfo($);
  } catch (error) {
    console.error(`Error processing user profile ${userId}:`, error.message);
  } finally {
    if (page) await page.close();
    if (context) await context.close();
  }

  return profileInfo;
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

// Extract user profile information from the page
async function extractUserProfileInfo($) {
  const profileInfo = {
    username: '',
    rating: 0,
    reviewsCount: 0,
    location: '',
    followers: 0,
    following: 0,
    lastSeen: '',
    wardrobeQuantity: 0,
  };

  try {
    // Extract username
    const usernameElement = $('[data-testid="profile-username"]');
    if (usernameElement.length) {
      profileInfo.username = usernameElement.text().trim();
    }

    // Extract rating and reviews
    const ratingButton = $('[data-testid="rating-button"]');
    if (ratingButton.length) {
      // Extract rating from aria-label which contains rating information in Dutch or English
      const ratingDiv = ratingButton.find('.web_ui__Rating__rating');
      const ratingText = ratingDiv.attr('aria-label');
      if (ratingText) {
        // Match pattern for Dutch: "Lid is beoordeeld met een X.X. Maximaal aantal 5"
        // or English: "Member rated X out of 5"
        const ratingMatch =
          ratingText.match(/beoordeeld met een (\d+(?:\.\d+)?)/) ||
          ratingText.match(/rated (\d+(?:\.\d+)?) out of/);
        if (ratingMatch) {
          profileInfo.rating = parseFloat(ratingMatch[1]);
        }
      }

      // Extract reviews count
      const reviewsText = ratingButton
        .find('.web_ui__Text__body')
        .text()
        .trim();
      const reviewsMatch = reviewsText.match(/(\d+) reviews?/);
      if (reviewsMatch) {
        profileInfo.reviewsCount = parseInt(reviewsMatch[1]);
      }
    }

    // Extract location
    const locationCell = $('[data-testid="profile-location-info--content"]');
    if (locationCell.length) {
      profileInfo.location = locationCell.text().trim();
    }

    // Extract followers and following counts
    const socialInfo = $('.web_ui__Cell__body .u-flexbox.u-flex-wrap');
    if (socialInfo.length) {
      // Extract followers
      const followersLink = socialInfo.find('a[href*="/followers/"]');
      if (followersLink.length) {
        profileInfo.followers = parseInt(followersLink.text().trim()) || 0;
      }

      // Extract following
      const followingLink = socialInfo.find('a[href*="/following/"]');
      if (followingLink.length) {
        profileInfo.following = parseInt(followingLink.text().trim()) || 0;
      }
    }

    // Extract wardrobe quantity (number of items)
    const filterElement = $('[data-testid="closet-buyer-filters"]');
    if (filterElement.length) {
      // Get the sibling h2 element that contains the item count
      const itemCountElement = filterElement.parent().find('h2.web_ui__Text__title').first();
      if (itemCountElement.length) {
        const itemText = itemCountElement.text().trim();
        const quantityMatch = itemText.match(/(\d+)\s+artikelen?/); // in dutch
        if (quantityMatch) {
          profileInfo.wardrobeQuantity = parseInt(quantityMatch[1]);
        }
      }
    }

    const lastSeenCell = $('.web_ui__Cell__body div:contains("Last seen")');
    if (lastSeenCell.length) {
      const lastSeenText = lastSeenCell.find('span').attr('title');
      if (lastSeenText) {
        profileInfo.lastSeen = lastSeenText;
      }
    }
  } catch (error) {
    console.error('Error extracting user profile info:', error);
  }

  return profileInfo;
}

module.exports = {
  scrapeItemPage,
  scrapeUserProfile,
  extractProductInfo,
  extractUserProfileInfo,
};
