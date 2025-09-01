// apifyScraper.js - Enhanced Apify Scraper for SDL Import Calculator
let ApifyClient;

try {
  const apifyModule = require('apify-client');
  ApifyClient = apifyModule.ApifyClient;
  console.log('✅ Apify client module loaded successfully');
} catch (error) {
  console.log('⚠️ Apify client not installed - Scraping will fallback to other methods');
  ApifyClient = null;
}

class ApifyScraper {
  constructor(apiKey) {
    this.enabled = false;
    this.client = null;

    if (!ApifyClient) {
      console.log('⚠️ Apify client library not available');
      return;
    }

    if (!apiKey) {
      console.log('⚠️ Apify API key not provided');
      return;
    }

    try {
      this.client = new ApifyClient({ token: apiKey });
      this.enabled = true;
      console.log('✅ Apify scraper initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Apify client:', error.message);
    }
  }

  isAvailable() {
    return this.enabled && this.client !== null;
  }

  async scrapeProduct(url) {
    if (!this.isAvailable()) {
      throw new Error('Apify not available or not configured');
    }

    console.log(`🔄 Apify scraping product...`);

    try {
      const run = await this.client.actor('apify/web-scraper').call({
        startUrls: [{ url: url }],
        pageFunction: `
          async function pageFunction(context) {
            const { $, request } = context;
            
            const titleSelectors = [
              'h1', 
              '[data-testid="product-title"]',
              '.product-title',
              '#productTitle',
              '[itemprop="name"]',
              '.product-name'
            ];
            
            const priceSelectors = [
              '[data-testid="product-price"]',
              '.price-now',
              '.price',
              '[itemprop="price"]',
              '.product-price',
              '.current-price'
            ];
            
            const imageSelectors = [
              'img.mainImage',
              '[data-testid="product-image"] img',
              '.product-photo img',
              '#landingImage',
              '[itemprop="image"]'
            ];
            
            function extractText(selectors) {
              for (const selector of selectors) {
                const element = $(selector).first();
                if (element.length) {
                  return element.text().trim();
                }
              }
              return null;
            }
            
            function extractImage(selectors) {
              for (const selector of selectors) {
                const element = $(selector).first();
                if (element.length) {
                  return element.attr('src') || element.attr('data-src');
                }
              }
              return null;
            }
            
            return {
              url: request.url,
              title: extractText(titleSelectors),
              price: extractText(priceSelectors),
              image: extractImage(imageSelectors)
            };
          }
        `,
        proxyConfiguration: {
          useApifyProxy: true
        },
        maxRequestsPerCrawl: 1
      });

      await this.client.run(run.id).waitForFinish({ waitSecs: 60 });
      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();
      
      if (!items || items.length === 0) {
        throw new Error('No data found');
      }

      const data = items[0];
      console.log('✅ Apify scrape successful');

      return this.parseData(data);

    } catch (error) {
      console.error('❌ Apify scrape failed:', error.message);
      throw error;
    }
  }

  parseData(data) {
    const result = {
      name: data.title || 'Unknown Product',
      price: null,
      image: data.image || null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    if (data.price) {
      const priceMatch = data.price.toString().match(/[\d,]+\.?\d*/);
      result.price = priceMatch ? parseFloat(priceMatch[0].replace(',', '')) : null;
    }

    return result;
  }
}

module.exports = ApifyScraper;
