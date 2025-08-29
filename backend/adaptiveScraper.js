// backend/adaptiveScraper.js - Adaptive Scraper using ScrapingBee
const axios = require('axios');
const cheerio = require('cheerio');

class AdaptiveScraper {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://app.scrapingbee.com/api/v1/';
    this.enabled = !!apiKey;
    
    if (this.enabled) {
      console.log('✅ ScrapingBee adaptive scraper initialized');
    } else {
      console.log('⚠️ ScrapingBee disabled - no API key provided');
    }
  }

  isAvailable() {
    return this.enabled;
  }

  async scrapeProduct(url) {
    if (!this.enabled) {
      throw new Error('ScrapingBee not configured');
    }

    const retailer = this.detectRetailer(url);
    console.log(`🔄 ScrapingBee scraping ${retailer} product...`);

    try {
      const response = await axios.get(this.baseURL, {
        params: {
          api_key: this.apiKey,
          url: url,
          render_js: 'true',
          premium_proxy: 'true',
          country_code: 'us'
        },
        timeout: 30000
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = response.data;
      const $ = cheerio.load(html);

      // Parse based on retailer
      let productData;
      switch(retailer) {
        case 'Amazon':
          productData = this.parseAmazon($, url);
          break;
        case 'Wayfair':
          productData = this.parseWayfair($, url);
          break;
        case 'Target':
          productData = this.parseTarget($, url);
          break;
        case 'Walmart':
          productData = this.parseWalmart($, url);
          break;
        case 'Best Buy':
          productData = this.parseBestBuy($, url);
          break;
        case 'Home Depot':
          productData = this.parseHomeDepot($, url);
          break;
        default:
          productData = this.parseGeneric($, url);
          break;
      }

      console.log('✅ ScrapingBee scrape successful');
      return productData;

    } catch (error) {
      console.error('❌ ScrapingBee scrape failed:', error.message);
      throw error;
    }
  }

  detectRetailer(url) {
    try {
      const domain = new URL(url).hostname.toLowerCase();
      if (domain.includes('amazon.com')) return 'Amazon';
      if (domain.includes('wayfair.com')) return 'Wayfair';
      if (domain.includes('target.com')) return 'Target';
      if (domain.includes('bestbuy.com')) return 'Best Buy';
      if (domain.includes('walmart.com')) return 'Walmart';
      if (domain.includes('homedepot.com')) return 'Home Depot';
      if (domain.includes('lowes.com')) return 'Lowes';
      if (domain.includes('costco.com')) return 'Costco';
      if (domain.includes('macys.com')) return 'Macys';
      if (domain.includes('ikea.com')) return 'IKEA';
      return 'Unknown Retailer';
    } catch (e) {
      return 'Unknown Retailer';
    }
  }

  parseAmazon($, url) {
    const result = {
      url,
      retailer: 'Amazon',
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Product name
    const titleSelectors = [
      '#productTitle',
      'h1.a-size-large',
      '[data-feature-name="title"] h1',
      '.product-title'
    ];
    
    for (const selector of titleSelectors) {
      const title = $(selector).first().text().trim();
      if (title) {
        result.name = title;
        break;
      }
    }

    // Price
    const priceSelectors = [
      '.a-price-whole',
      '.a-price .a-offscreen',
      '[data-testid="price"] .a-price',
      '.a-price-current',
      '#price_inside_buybox'
    ];

    for (const selector of priceSelectors) {
      const priceText = $(selector).first().text().trim();
      if (priceText) {
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        if (priceMatch) {
          result.price = parseFloat(priceMatch[0].replace(',', ''));
          break;
        }
      }
    }

    // Image
    const imageSelectors = [
      '#landingImage',
      '[data-old-hires]',
      '.a-dynamic-image',
      '#main-image'
    ];

    for (const selector of imageSelectors) {
      const img = $(selector).first();
      const src = img.attr('src') || img.attr('data-old-hires') || img.attr('data-src');
      if (src && !src.includes('transparent-pixel')) {
        result.image = src;
        break;
      }
    }

    // Extract dimensions and weight from feature bullets
    const features = $('#feature-bullets ul li, .a-unordered-list .a-list-item').text();
    result.dimensions = this.extractDimensions(features);
    result.weight = this.extractWeight(features);

    // Brand
    const brandSelectors = [
      '#bylineInfo',
      '.po-brand .po-break-word',
      '[data-feature-name="bylineInfo"]'
    ];

    for (const selector of brandSelectors) {
      const brand = $(selector).first().text().trim();
      if (brand && !brand.toLowerCase().includes('visit')) {
        result.brand = brand.replace(/^by\s+/i, '');
        break;
      }
    }

    return result;
  }

  parseWayfair($, url) {
    const result = {
      url,
      retailer: 'Wayfair',
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Product name
    result.name = $('h1[data-testid="product-title"], h1.pl-Heading').first().text().trim();

    // Price
    const priceText = $('.SFPrice, [data-testid="product-price"]').first().text().trim();
    if (priceText) {
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[0].replace(',', ''));
      }
    }

    // Image
    const img = $('.ProductDetailImageThumbnail img, .ImageComponent img').first();
    result.image = img.attr('src') || img.attr('data-src');

    // Specifications
    const specs = $('.Specifications, .ProductDetailSpecifications').text();
    result.dimensions = this.extractDimensions(specs);
    result.weight = this.extractWeight(specs);

    // Brand
    result.brand = $('[data-testid="product-brand"]').first().text().trim();

    return result;
  }

  parseTarget($, url) {
    const result = {
      url,
      retailer: 'Target',
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Product name
    result.name = $('h1[data-test="product-title"], h1.Heading__StyledHeading').first().text().trim();

    // Price
    const priceText = $('[data-test="product-price"], .styles__CurrentPrice').first().text().trim();
    if (priceText) {
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[0].replace(',', ''));
      }
    }

    // Image
    const img = $('[data-test="product-image"] img, .styles__ImageWrapper img').first();
    result.image = img.attr('src') || img.attr('data-src');

    // Specifications
    const specs = $('[data-test="item-details-specifications"]').text();
    result.dimensions = this.extractDimensions(specs);
    result.weight = this.extractWeight(specs);

    return result;
  }

  parseWalmart($, url) {
    const result = {
      url,
      retailer: 'Walmart',
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Product name
    result.name = $('h1[itemprop="name"], h1.prod-ProductTitle').first().text().trim();

    // Price
    const priceText = $('span[itemprop="price"], .price-now').first().text().trim();
    if (priceText) {
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[0].replace(',', ''));
      }
    }

    // Image
    const img = $('img.hover-zoom-hero-image, .prod-hero-image img').first();
    result.image = img.attr('src') || img.attr('data-src');

    // Specifications
    const specs = $('.product-specifications').text();
    result.dimensions = this.extractDimensions(specs);
    result.weight = this.extractWeight(specs);

    // Brand
    result.brand = $('.prod-brandName').first().text().trim();

    return result;
  }

  parseBestBuy($, url) {
    const result = {
      url,
      retailer: 'Best Buy',
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Product name
    result.name = $('.sku-title h1, h1.heading-5').first().text().trim();

    // Price
    const priceText = $('.priceView-customer-price span, .pricing-price__regular-price').first().text().trim();
    if (priceText) {
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[0].replace(',', ''));
      }
    }

    // Image
    const img = $('.primary-image img, .shop-media-gallery img').first();
    result.image = img.attr('src') || img.attr('data-src');

    // Specifications
    const specs = $('.specs-table').text();
    result.dimensions = this.extractDimensions(specs);
    result.weight = this.extractWeight(specs);

    // Brand
    result.brand = $('.product-brand a').first().text().trim();

    return result;
  }

  parseHomeDepot($, url) {
    const result = {
      url,
      retailer: 'Home Depot',
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Product name
    result.name = $('h1.product-details__title, h1[data-testid="product-title"]').first().text().trim();

    // Price
    const priceText = $('.price-format__main-price, [data-testid="product-price"]').first().text().trim();
    if (priceText) {
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[0].replace(',', ''));
      }
    }

    // Image
    const img = $('.mediagallery__mainimage img, .product-image img').first();
    result.image = img.attr('src') || img.attr('data-src');

    // Specifications
    const specs = $('.specifications__table, .specs-table').text();
    result.dimensions = this.extractDimensions(specs);
    result.weight = this.extractWeight(specs);

    // Brand
    result.brand = $('.product-details__brand').first().text().trim();

    return result;
  }

  parseGeneric($, url) {
    const result = {
      url,
      retailer: this.detectRetailer(url),
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Generic selectors for product name
    const titleSelectors = [
      'h1',
      '.product-title',
      '[data-testid="product-title"]',
      '.product-name',
      '.pdp-title'
    ];

    for (const selector of titleSelectors) {
      const title = $(selector).first().text().trim();
      if (title && title.length > 5) {
        result.name = title;
        break;
      }
    }

    // Generic selectors for price
    const priceSelectors = [
      '.price',
      '.product-price',
      '[data-testid="product-price"]',
      '.current-price',
      '.sale-price'
    ];

    for (const selector of priceSelectors) {
      const priceText = $(selector).first().text().trim();
      if (priceText) {
        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
        if (priceMatch) {
          result.price = parseFloat(priceMatch[0].replace(',', ''));
          break;
        }
      }
    }

    // Generic selectors for image
    const imageSelectors = [
      '.product-image img',
      '.primary-image img',
      '.gallery-image img',
      'img[alt*="product"]'
    ];

    for (const selector of imageSelectors) {
      const img = $(selector).first();
      const src = img.attr('src') || img.attr('data-src');
      if (src && !src.includes('placeholder') && !src.includes('loading')) {
        result.image = src;
        break;
      }
    }

    // Try to extract dimensions and weight from page text
    const pageText = $('body').text();
    result.dimensions = this.extractDimensions(pageText);
    result.weight = this.extractWeight(pageText);

    return result;
  }

  extractDimensions(text) {
    if (!text) return null;

    const patterns = [
      /(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)\s*[x×]\s*(\d+\.?\d*)\s*(?:inches|in|")?/i,
      /(\d+\.?\d*)"?\s*[WL]\s*[x×]\s*(\d+\.?\d*)"?\s*[DW]\s*[x×]\s*(\d+\.?\d*)"?\s*[HT]/i,
      /L:\s*(\d+\.?\d*).*W:\s*(\d+\.?\d*).*H:\s*(\d+\.?\d*)/i,
      /Length:\s*(\d+\.?\d*).*Width:\s*(\d+\.?\d*).*Height:\s*(\d+\.?\d*)/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const length = parseFloat(match[1]);
        const width = parseFloat(match[2]);
        const height = parseFloat(match[3]);
        
        // Validate dimensions are reasonable
        if (length > 0 && width > 0 && height > 0 && 
            length < 200 && width < 200 && height < 200) {
          return { length, width, height };
        }
      }
    }

    return null;
  }

  extractWeight(text) {
    if (!text) return null;

    const patterns = [
      { regex: /(\d+\.?\d*)\s*(?:pounds?|lbs?)/i, multiplier: 1 },
      { regex: /(\d+\.?\d*)\s*(?:kilograms?|kgs?)/i, multiplier: 2.205 },
      { regex: /(\d+\.?\d*)\s*(?:grams?|g)\b/i, multiplier: 0.00220462 },
      { regex: /(\d+\.?\d*)\s*(?:ounces?|oz)/i, multiplier: 0.0625 }
    ];

    for (const { regex, multiplier } of patterns) {
      const match = text.match(regex);
      if (match) {
        const weight = parseFloat(match[1]) * multiplier;
        // Validate weight is reasonable (between 0.1 and 500 pounds)
        if (weight > 0.1 && weight < 500) {
          return Math.round(weight * 10) / 10;
        }
      }
    }

    return null;
  }
}

module.exports = AdaptiveScraper;
