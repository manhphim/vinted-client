var express = require('express');
var router = express.Router();
const axios = require('axios');

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

/* GET catalog items */
router.get('/catalog', async function (req, res, next) {
  const maxRetries = 3;
  let retryCount = 0;

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
        headers: {
          priority: 'u=1, i',
          'sec-gpc': '1',
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36 Edg/133.0.0.0',
          'x-anon-id':
            req.headers['x-anon-id'] || 'de68c4da-bdc7-4ec0-98c9-e7a899fa7ffa',
          'x-csrf-token':
            req.headers['x-csrf-token'] ||
            '75f6c9fa-dc8e-4e52-a000-e09dd4084b3e',
          'x-money-object': 'true',
          Cookie: `access_token_web=eyJraWQiOiJFNTdZZHJ1SHBsQWp1MmNObzFEb3JIM2oyN0J1NS1zX09QNVB3UGlobjVNIiwiYWxnIjoiUFMyNTYifQ.eyJhcHBfaWQiOjQsImNsaWVudF9pZCI6IndlYiIsImF1ZCI6ImZyLmNvcmUuYXBpIiwiaXNzIjoidmludGVkLWlhbS1zZXJ2aWNlIiwiaWF0IjoxNzQyNDU5MzM4LCJzaWQiOiJjMzg2MGY2Ny0xNzQyMzM1ODc3Iiwic2NvcGUiOiJwdWJsaWMiLCJleHAiOjE3NDI0NjY1MzgsInB1cnBvc2UiOiJhY2Nlc3MifQ.UoMviPF0lWQpzovjRu6dhibV7f20qGhhAPGK3sEypouf3VE16Vn8nyArS6CvTsD0epWX9F6ZcVj5arXpNmbGbkaBorHtdqAoZK5N0Hc2Tz2iodhjdmWDjWpAxVak9-lNEmNGGYMSmG64dr91DgNtXaNq6JPl2hczFSrJdrBX31IwAbzCbfcl8LOKK_KmRtOR9yZ599E6surEs_RqOW2r1aohCirijPb7IMnSAToShu9Z5OXtC8Mj_KbXdwxfKfcZXeo63dxVg-ZuS1isnexxpuQQeRimECEXxaDfhNHXhFcYlBEROYbAc1q2cWdsujMHU9kI_N2Ggn0oGXCvWaITXw`,
        },
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
