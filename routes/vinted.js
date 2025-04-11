var express = require('express');
var router = express.Router();
const axios = require('axios');
const puppeteer = require('puppeteer'); 
const UserAgent = require('user-agents');

const userAgent = new UserAgent();

// Utility function for random delay
const getRandomDelay = () => Math.floor(Math.random() * (2000 - 500 + 1) + 500);

// Utility function for exponential backoff
const getBackoffDelay = (retryCount) =>
  Math.min(1000 * Math.pow(2, retryCount), 10000);

// Request queue implementation
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(requestFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ requestFn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    const { requestFn, resolve, reject } = this.queue.shift();
    try {
      await new Promise((r) => setTimeout(r, getRandomDelay()));
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.process();
    }
  }
}

const requestQueue = new RequestQueue();

// Add this function to extract the access token from Vinted website
async function refreshAccessToken() {
  console.log('Refreshing access token...');
  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
    );

    // Navigate to Vinted
    await page.goto('https://www.vinted.nl', { waitUntil: 'networkidle2' });

    // Get all cookies
    const cookies = await browser.cookies();

    // Find the access_token_web cookie
    const accessTokenCookie = cookies.find(
      (cookie) => cookie.name === 'access_token_web'
    );

    if (!accessTokenCookie) {
      throw new Error('Could not find access_token_web cookie');
    }

    console.log('Access token refreshed successfully');
    return accessTokenCookie.value;
  } catch (error) {
    console.error('Error refreshing access token:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

// Add a variable to store the current token
let currentAccessToken =
  'eyJraWQiOiJFNTdZZHJ1SHBsQWp1MmNObzFEb3JIM2oyN0J1NS1zX09QNVB3UGlobjVNIiwiYWxnIjoiUFMyNTYifQ.eyJhcHBfaWQiOjQsImNsaWVudF9pZCI6IndlYiIsImF1ZCI6ImZyLmNvcmUuYXBpIiwiaXNzIjoidmludGVkLWlhbS1zZXJ2aWNlIiwiaWF0IjoxNzQzOTQ5MDc1LCJzaWQiOiI4ZDUxYjlmOC0xNzQzNDM4MzUyIiwic2NvcGUiOiJwdWJsaWMiLCJleHAiOjE3NDM5NTYyNzUsInB1cnBvc2UiOiJhY2Nlc3MifQ.GPg1VW8isSjKTkeiyRdITrkf2mtFLE-XMoE88q8NNjo8u-0bjMPOHf1cUfXyhGY8U2SHDwBsGb_q7ulh-EEGboDdiuE442Q36JqTS6ttoP8D1thg4ojGpTvFOYnLi91aa5sgl_vqXGYA8DzkpXa_JQWZWi7goJdsb6E_33h7xUct-_CO7HPM71onlCcSnlzTGIEgqSj0Fg8lryEf-M6G7Oatt6FPOmOw2XbiSMtnEK44_hoTvWxUzZD41fRtgH8ecxqlyRpe-yQQD-EDNz9J1zIO_62Kr5bi98GV5T9lR0JwHBsGh7ds8hM_VMPJ7FR0CXlb7H8SK9TVPdgNNEh9Tg';

// Function to get headers with the current token
function getHeaders(req) {
  const agent = userAgent.random();
  return {
    priority: 'u=1, i',
    'sec-gpc': '1',
    'User-Agent': agent,
    'x-anon-id':
      req.headers['x-anon-id'] || 'de68c4da-bdc7-4ec0-98c9-e7a899fa7ffa',
    'x-csrf-token':
      req.headers['x-csrf-token'] || '75f6c9fa-dc8e-4e52-a000-e09dd4084b3e',
    'x-money-object': 'true',
    Cookie: `access_token_web=${currentAccessToken}`,
  };
}

/* GET catalog items */
router.get('/catalog', async function (req, res, next) {
  const maxRetries = 3;
  let retryCount = 0;
  let tokenRefreshed = false;

  const makeRequest = async () => {
    try {
      const response = await axios({
        method: 'get',
        url: 'https://www.vinted.nl/api/v2/catalog/items',
        params: {
          page: req.query.page || 1,
          per_page: req.query.per_page || 96,
          time: Math.floor(Date.now() / 1000),
          search_text: req.query.search_text || '',
          catalog_ids: req.query.catalog_ids || '5',
          catalog_from: req.query.catalog_from || '0',
          size_ids: req.query.size_ids || '',
          brand_ids: req.query.brand_ids || '',
          status_ids: req.query.status_ids || '',
          color_ids: req.query.color_ids || '',
          patterns_ids: req.query.patterns_ids || '',
          material_ids: req.query.material_ids || '',
        },
        headers: getHeaders(req),
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        // Handle rate limiting
        if (error.response.status === 429 || error.response.status === 403) {
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = getBackoffDelay(retryCount);
            await new Promise((r) => setTimeout(r, delay));
            return makeRequest();
          }
        } else if (error.response.status === 401) {
          // Handle unauthorized - refresh token if not already tried
          if (!tokenRefreshed) {
            tokenRefreshed = true;
            try {
              currentAccessToken = await refreshAccessToken();
              console.log('Token refreshed, retrying request...');
              return makeRequest();
            } catch (refreshError) {
              console.error('Failed to refresh token:', refreshError.message);
            }
          }
        }
      }

      throw error;
    }
  };

  try {
    const data = await requestQueue.add(makeRequest);
    res.json(data);
  } catch (error) {
    console.log(error);
    console.error('Error fetching from Vinted API:', error.message);
    next(error);
  }
});

router.get('/wardrobe', async function (req, res, next) {
  const maxRetries = 3;
  let retryCount = 0;
  let tokenRefreshed = false;

  const makeRequest = async () => {
    try {
      const response = await axios({
        method: 'get',
        url: `https://www.vinted.nl/api/v2/wardrobe/${req.query.userId}/items`,
        params: {
          page: req.query.page || 1,
          per_page: req.query.per_page || 96,
          time: Math.floor(Date.now() / 1000),
          search_text: req.query.search_text || '',
          catalog_ids: req.query.catalog_ids || '5',
          catalog_from: req.query.catalog_from || '0',
          size_ids: req.query.size_ids || '',
          brand_ids: req.query.brand_ids || '',
          status_ids: req.query.status_ids || '',
          color_ids: req.query.color_ids || '',
          patterns_ids: req.query.patterns_ids || '',
          material_ids: req.query.material_ids || '',
          order: req.query.order || 'relevance',
        },
        headers: getHeaders(req),
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        // Handle rate limiting
        if (error.response.status === 429 || error.response.status === 403) {
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = getBackoffDelay(retryCount);
            await new Promise((r) => setTimeout(r, delay));
            return makeRequest();
          }
        } else if (error.response.status === 401) {
          // Handle unauthorized - refresh token if not already tried
          if (!tokenRefreshed) {
            tokenRefreshed = true;
            try {
              currentAccessToken = await refreshAccessToken();
              console.log('Token refreshed, retrying request...');
              return makeRequest();
            } catch (refreshError) {
              console.error('Failed to refresh token:', refreshError.message);
            }
          }
        }
      }

      throw error;
    }
  };

  try {
    const data = await requestQueue.add(makeRequest);
    res.json(data);
  } catch (error) {
    console.log(error);
    console.error('Error fetching from Vinted API:', error.message);
    next(error);
  }
});

router.get('/item_facets', async function (req, res, next) {
  const maxRetries = 3;
  let retryCount = 0;
  let tokenRefreshed = false;

  const makeRequest = async () => {
    try {
      const response = await axios({
        method: 'get',
        url: `https://www.vinted.nl/api/v2/users/${req.query.userId}/item_facets`,
        headers: getHeaders(req),
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        // Handle rate limiting
        if (error.response.status === 429 || error.response.status === 403) {
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = getBackoffDelay(retryCount);
            await new Promise((r) => setTimeout(r, delay));
            return makeRequest();
          }
        } else if (error.response.status === 401) {
          // Handle unauthorized - refresh token if not already tried
          if (!tokenRefreshed) {
            tokenRefreshed = true;
            try {
              currentAccessToken = await refreshAccessToken();
              console.log('Token refreshed, retrying request...');
              return makeRequest();
            } catch (refreshError) {
              console.error('Failed to refresh token:', refreshError.message);
            }
          }
        }
      }
      throw error;
    }
  };

  try {
    const data = await requestQueue.add(makeRequest);
    res.json(data);
  } catch (error) {
    console.log(error);
    console.error('Error fetching from Vinted API:', error.message);
    next(error);
  }
});
module.exports = router;
