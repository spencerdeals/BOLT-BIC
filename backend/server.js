// backend/server.js - SDL Enhanced Import Calculator with AI Learning
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import our enhanced modules
const ApifyScraper = require('./apifyScraper');
const UPCItemDB = require('./upcitemdb');
const learningSystem = require('./learningSystem');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize services
const apifyScraper = new ApifyScraper(process.env.APIFY_API_KEY);
const upcItemDB = new UPCItemDB(process.env.UPCITEMDB_API_KEY);

console.log('🔄 Initializing AI Learning System...');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      apify: apifyScraper.isAvailable(),
      scrapingBee: !!process.env.SCRAPINGBEE_API_KEY,
      upcItemDB: !!process.env.UPCITEMDB_API_KEY,
      aiLearning: true
    }
  });
});

// Detect retailer from URL
function detectRetailer(url) {
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
    if (domain.includes('overstock.com')) return 'Overstock';
    if (domain.includes('cb2.com')) return 'CB2';
    if (domain.includes('crateandbarrel.com')) return 'Crate & Barrel';
    if (domain.includes('westelm.com')) return 'West Elm';
    if (domain.includes('potterybarn.com')) return 'Pottery Barn';
    return 'Unknown Retailer';
  } catch (e) {
    return 'Unknown Retailer';
  }
}

// Enhanced ScrapingBee with retailer-specific selectors
async function scrapeWithScrapingBee(url) {
  const retailer = detectRetailer(url);
  console.log(`🐝 ScrapingBee: Scraping ${retailer} product...`);
  
  try {
    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: process.env.SCRAPINGBEE_API_KEY,
        url: url,
        render_js: 'true',
        premium_proxy: 'true',
        country_code: 'us'
      },
      timeout: 30000
    });

    const html = response.data;
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    let productData = {
      name: null,
      price: null,
      image: null,
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };

    // Retailer-specific extraction
    switch(retailer) {
      case 'Amazon':
        productData = extractAmazonData($);
        break;
      case 'Walmart':
        productData = extractWalmartData($);
        break;
      case 'Wayfair':
        productData = extractWayfairData($);
        break;
      case 'Target':
        productData = extractTargetData($);
        break;
      case 'Best Buy':
        productData = extractBestBuyData($);
        break;
      case 'Home Depot':
        productData = extractHomeDepotData($);
        break;
      default:
        productData = extractGenericData($);
        break;
    }

    console.log(`✅ ScrapingBee extracted: ${productData.name?.substring(0, 50)}...`);
    return productData;

  } catch (error) {
    console.error(`❌ ScrapingBee failed for ${retailer}:`, error.message);
    throw error;
  }
}

// Amazon-specific extraction
function extractAmazonData($) {
  const selectors = {
    name: [
      '#productTitle',
      '.product-title',
      'h1.a-size-large',
      '[data-automation-id="product-title"]'
    ],
    price: [
      '.a-price-whole',
      '.a-offscreen',
      '.a-price .a-offscreen',
      '.a-price-current .a-offscreen',
      '.a-price-range .a-offscreen'
    ],
    image: [
      '#landingImage',
      '.a-dynamic-image',
      '#imgBlkFront',
      '.a-image-wrapper img'
    ]
  };

  return extractWithSelectors($, selectors, 'Amazon');
}

// Walmart-specific extraction
function extractWalmartData($) {
  const selectors = {
    name: [
      'h1[data-automation-id="product-title"]',
      'h1.prod-ProductTitle',
      'h1[itemprop="name"]',
      '.prod-ProductTitle',
      'h1'
    ],
    price: [
      'span[itemprop="price"]',
      '.price-now',
      '.price-current',
      '[data-automation-id="product-price"]',
      '.price-display',
      '.price-group .price-display'
    ],
    image: [
      'img.hover-zoom-hero-image',
      '.prod-hero-image img',
      '.prod-ProductImage img',
      '[data-testid="hero-image-container"] img',
      '.hero-image img'
    ]
  };

  return extractWithSelectors($, selectors, 'Walmart');
}

// Wayfair-specific extraction
function extractWayfairData($) {
  const selectors = {
    name: [
      'h1.pl-Heading',
      '[data-testid="product-title"]',
      '.ProductDetailInfoBlock h1',
      '.pl-ProductDetails h1',
      'h1'
    ],
    price: [
      '.SFPrice',
      '[data-testid="product-price"]',
      '.BasePriceBlock',
      '.pl-PriceBlock .NotranslatePrice',
      '.price-block .price',
      '.ProductPricing .price'
    ],
    image: [
      '.ProductDetailImageThumbnail img',
      '.ImageComponent img',
      '.pl-ProductImageCarousel img',
      '[data-testid="product-image"] img',
      '.product-image img'
    ]
  };

  return extractWithSelectors($, selectors, 'Wayfair');
}

// Target-specific extraction
function extractTargetData($) {
  const selectors = {
    name: [
      'h1[data-test="product-title"]',
      'h1.Heading__StyledHeading',
      '.ProductTitle h1',
      '[data-testid="product-title"]',
      'h1'
    ],
    price: [
      '[data-test="product-price"]',
      '.styles__CurrentPrice',
      '.Price__StyledPrice',
      '[data-testid="product-price"]',
      '.price'
    ],
    image: [
      '[data-test="product-image"] img',
      '.styles__ImageWrapper img',
      '.ProductImages img',
      '.HeroImage img',
      '.product-image img'
    ]
  };

  return extractWithSelectors($, selectors, 'Target');
}

// Best Buy-specific extraction
function extractBestBuyData($) {
  const selectors = {
    name: [
      '.sku-title h1',
      'h1.heading-5',
      '.product-title h1',
      '[data-testid="product-title"]',
      'h1'
    ],
    price: [
      '.priceView-customer-price span',
      '.pricing-price__regular-price',
      '.sr-only:contains("current price")',
      '[data-testid="customer-price"]',
      '.price'
    ],
    image: [
      '.primary-image img',
      '.shop-media-gallery img',
      '.product-image img',
      '[data-testid="product-image"] img',
      '.hero-image img'
    ]
  };

  return extractWithSelectors($, selectors, 'Best Buy');
}

// Home Depot-specific extraction
function extractHomeDepotData($) {
  const selectors = {
    name: [
      'h1.product-details__title',
      'h1[data-testid="product-title"]',
      '.product-title h1',
      '.product-details h1',
      'h1'
    ],
    price: [
      '.price-format__main-price',
      '[data-testid="product-price"]',
      '.price-detailed',
      '.price-format__range',
      '.price'
    ],
    image: [
      '.mediagallery__mainimage img',
      '.product-image img',
      '[data-testid="product-image"] img',
      '.media-gallery img',
      '.hero-image img'
    ]
  };

  return extractWithSelectors($, selectors, 'Home Depot');
}

// Generic extraction for unknown retailers
function extractGenericData($) {
  const selectors = {
    name: [
      'h1',
      '.product-title',
      '.product-name',
      '[itemprop="name"]',
      '.title',
      '.product-info h1'
    ],
    price: [
      '.price',
      '.product-price',
      '[itemprop="price"]',
      '.current-price',
      '.sale-price',
      '[data-price]'
    ],
    image: [
      '.product-image img',
      '.main-image img',
      '.hero-image img',
      '[itemprop="image"]',
      'img[alt*="product"]',
      'picture img'
    ]
  };

  return extractWithSelectors($, selectors, 'Generic');
}

// Helper function to extract data using selectors
function extractWithSelectors($, selectors, retailerName) {
  const result = {
    name: null,
    price: null,
    image: null,
    dimensions: null,
    weight: null,
    brand: null,
    category: null,
    inStock: true
  };

  // Extract name
  for (const selector of selectors.name) {
    const element = $(selector).first();
    if (element.length && element.text().trim()) {
      result.name = element.text().trim();
      console.log(`   🎯 ${retailerName} name found with: ${selector}`);
      break;
    }
  }

  // Extract price
  for (const selector of selectors.price) {
    const element = $(selector).first();
    if (element.length) {
      const priceText = element.text().trim();
      const priceMatch = priceText.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[0].replace(',', ''));
        console.log(`   💰 ${retailerName} price found with: ${selector} = $${result.price}`);
        break;
      }
    }
  }

  // Extract image
  for (const selector of selectors.image) {
    const element = $(selector).first();
    if (element.length) {
      const src = element.attr('src') || element.attr('data-src') || element.attr('data-lazy-src');
      if (src && !src.includes('placeholder') && !src.includes('loading') && src.length > 10) {
        result.image = src.startsWith('//') ? 'https:' + src : src;
        console.log(`   🖼️ ${retailerName} image found with: ${selector}`);
        break;
      }
    }
  }

  // Set fallback values
  if (!result.name) {
    result.name = 'Product from ' + ($('title').text().split('|')[0].trim() || retailerName);
  }
  if (!result.image) {
    result.image = 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL';
  }

  console.log(`   📦 ${retailerName} final: ${result.name?.substring(0, 30)}... | $${result.price || 'N/A'} | ${result.image ? 'Has image' : 'No image'}`);
  return result;
}

// Main scraping function with proper fallback system
async function scrapeProductData(url) {
  const retailer = detectRetailer(url);
  console.log(`\n🔍 Scraping: ${retailer}`);
  console.log(`   URL: ${url.substring(0, 80)}...`);

  // Check AI learning system first
  try {
    const knownProduct = await learningSystem.getKnownProduct(url);
    if (knownProduct) {
      console.log(`   🤖 AI: Found cached product with ${(knownProduct.confidence * 100).toFixed(1)}% confidence`);
      return {
        ...knownProduct,
        url,
        retailer,
        scrapingMethod: 'ai_cache'
      };
    }
  } catch (error) {
    console.log('   ⚠️ AI cache check failed, proceeding with scraping');
  }

  let productData = null;
  let scrapingMethod = null;

  // Try Apify first (if available)
  if (apifyScraper.isAvailable()) {
    try {
      console.log(`   🔄 Trying Apify first...`);
      productData = await apifyScraper.scrapeProduct(url);
      scrapingMethod = 'apify';
      console.log(`   ✅ Apify successful`);
    } catch (error) {
      console.log(`   ❌ Apify failed: ${error.message}`);
    }
  }

  // Fallback to ScrapingBee if Apify failed or unavailable
  if (!productData && process.env.SCRAPINGBEE_API_KEY) {
    try {
      console.log(`   🔄 Falling back to ScrapingBee...`);
      productData = await scrapeWithScrapingBee(url);
      scrapingMethod = 'scrapingbee';
      console.log(`   ✅ ScrapingBee successful`);
    } catch (error) {
      console.log(`   ❌ ScrapingBee also failed: ${error.message}`);
    }
  }

  // Final fallback - create basic product info
  if (!productData) {
    console.log(`   ⚠️ All scraping methods failed, using fallback data`);
    productData = {
      name: `Product from ${retailer}`,
      price: null,
      image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
      dimensions: null,
      weight: null,
      brand: null,
      category: 'General Merchandise',
      inStock: true
    };
    scrapingMethod = 'fallback';
  }

  // Enhance with category and shipping cost estimation
  const category = determineCategory(productData.name, retailer);
  const shippingCost = estimateShippingCost(category, productData.price, productData.weight, productData.dimensions);

  const finalProduct = {
    ...productData,
    url,
    retailer,
    category,
    shippingCost,
    scrapingMethod
  };

  // Try to get AI estimation if we're missing key data
  if (!finalProduct.dimensions || !finalProduct.weight) {
    try {
      const aiEstimation = await learningSystem.getSmartEstimation(category, finalProduct.name, retailer);
      if (aiEstimation) {
        console.log(`   🤖 AI: Enhanced with ${aiEstimation.source} (${(aiEstimation.confidence * 100).toFixed(1)}% confidence)`);
        if (!finalProduct.dimensions && aiEstimation.dimensions) {
          finalProduct.dimensions = aiEstimation.dimensions;
        }
        if (!finalProduct.weight && aiEstimation.weight) {
          finalProduct.weight = aiEstimation.weight;
        }
        // Recalculate shipping with AI data
        finalProduct.shippingCost = estimateShippingCost(category, finalProduct.price, finalProduct.weight, finalProduct.dimensions);
      }
    } catch (error) {
      console.log('   ⚠️ AI estimation failed');
    }
  }

  // Save to learning system for future use
  try {
    await learningSystem.saveProduct(finalProduct);
    await learningSystem.recordScrapingResult(url, retailer, finalProduct, scrapingMethod);
  } catch (error) {
    console.log('   ⚠️ Failed to save to learning system');
  }

  console.log(`   📦 Final: ${finalProduct.name?.substring(0, 40)}... | $${finalProduct.shippingCost} shipping`);
  return finalProduct;
}

// Category determination logic
function determineCategory(productName, retailer) {
  if (!productName) return 'General Merchandise';
  
  const name = productName.toLowerCase();
  
  // Electronics
  if (name.includes('laptop') || name.includes('computer') || name.includes('phone') || 
      name.includes('tablet') || name.includes('tv') || name.includes('monitor') ||
      name.includes('camera') || name.includes('headphone') || name.includes('speaker')) {
    return 'Electronics';
  }
  
  // Furniture
  if (name.includes('chair') || name.includes('table') || name.includes('desk') || 
      name.includes('sofa') || name.includes('bed') || name.includes('dresser') ||
      name.includes('cabinet') || name.includes('shelf') || name.includes('couch')) {
    return 'Furniture';
  }
  
  // Home & Garden
  if (name.includes('kitchen') || name.includes('bathroom') || name.includes('garden') || 
      name.includes('outdoor') || name.includes('patio') || name.includes('decor') ||
      name.includes('lamp') || name.includes('rug') || name.includes('curtain')) {
    return 'Home & Garden';
  }
  
  // Clothing
  if (name.includes('shirt') || name.includes('pants') || name.includes('dress') || 
      name.includes('shoes') || name.includes('jacket') || name.includes('clothing')) {
    return 'Clothing';
  }
  
  // Sports & Outdoors
  if (name.includes('bike') || name.includes('exercise') || name.includes('fitness') || 
      name.includes('sport') || name.includes('outdoor') || name.includes('camping')) {
    return 'Sports & Outdoors';
  }
  
  // Toys
  if (name.includes('toy') || name.includes('game') || name.includes('puzzle') || 
      name.includes('doll') || name.includes('lego') || name.includes('kids')) {
    return 'Toys';
  }
  
  // Books
  if (name.includes('book') || name.includes('novel') || name.includes('textbook')) {
    return 'Books';
  }
  
  // Beauty & Personal Care
  if (name.includes('makeup') || name.includes('skincare') || name.includes('shampoo') || 
      name.includes('perfume') || name.includes('beauty') || name.includes('cosmetic')) {
    return 'Beauty & Personal Care';
  }
  
  // Automotive
  if (name.includes('car') || name.includes('auto') || name.includes('tire') || 
      name.includes('motor') || name.includes('vehicle')) {
    return 'Automotive';
  }
  
  return 'General Merchandise';
}

// Enhanced shipping cost estimation
function estimateShippingCost(category, price, weight, dimensions) {
  let baseCost = 15; // Base ocean freight cost
  
  // Category-based adjustments
  const categoryMultipliers = {
    'Electronics': 1.2,
    'Furniture': 2.5,
    'Home & Garden': 1.8,
    'Sports & Outdoors': 1.5,
    'Automotive': 2.0,
    'Books': 0.8,
    'Clothing': 0.9,
    'Beauty & Personal Care': 0.7,
    'Toys': 1.1,
    'General Merchandise': 1.0
  };
  
  baseCost *= (categoryMultipliers[category] || 1.0);
  
  // Price-based adjustments
  if (price) {
    if (price > 500) baseCost *= 1.5;
    else if (price > 200) baseCost *= 1.3;
    else if (price > 100) baseCost *= 1.1;
    else if (price < 25) baseCost *= 0.8;
  }
  
  // Weight-based adjustments
  if (weight) {
    if (weight > 50) baseCost *= 2.0;
    else if (weight > 20) baseCost *= 1.5;
    else if (weight > 10) baseCost *= 1.2;
    else if (weight < 1) baseCost *= 0.7;
  }
  
  // Dimension-based adjustments (volume calculation)
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    const volume = dimensions.length * dimensions.width * dimensions.height;
    if (volume > 10000) baseCost *= 2.5; // Very large items
    else if (volume > 5000) baseCost *= 1.8;
    else if (volume > 1000) baseCost *= 1.3;
    else if (volume < 100) baseCost *= 0.8; // Small items
  }
  
  // Ensure minimum and maximum bounds
  baseCost = Math.max(8, Math.min(baseCost, 200));
  
  return Math.round(baseCost);
}

// API Routes
app.post('/api/scrape', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of URLs' });
    }

    if (urls.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 URLs allowed per request' });
    }

    console.log(`\n🚀 SCRAPING REQUEST: ${urls.length} URLs`);
    
    const products = [];
    const errors = [];

    // Process URLs with controlled concurrency
    const batchSize = 3;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(async (url) => {
        try {
          const product = await scrapeProductData(url);
          return product;
        } catch (error) {
          console.error(`❌ Failed to scrape ${url}:`, error.message);
          errors.push({ url, error: error.message });
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      products.push(...batchResults.filter(p => p !== null));
      
      // Small delay between batches to be respectful
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ SCRAPING COMPLETE: ${products.length}/${urls.length} successful`);
    
    // Get AI insights
    const insights = await learningSystem.getInsights();
    
    res.json({
      success: true,
      products,
      errors,
      summary: {
        total: urls.length,
        successful: products.length,
        failed: errors.length
      },
      aiInsights: insights
    });

  } catch (error) {
    console.error('❌ Scraping endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Store pending order endpoint
app.post('/api/store-pending-order', async (req, res) => {
  try {
    const orderData = req.body;
    const orderId = Date.now().toString();
    
    // In a real app, you'd store this in a database
    // For now, we'll just return the order ID
    console.log(`📝 Stored pending order ${orderId}`);
    
    res.json({ orderId });
  } catch (error) {
    console.error('❌ Store pending order error:', error);
    res.status(500).json({ error: 'Failed to store order' });
  }
});

// Get pending order endpoint
app.get('/api/get-pending-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // In a real app, you'd retrieve this from a database
    // For now, we'll return a placeholder
    console.log(`📖 Retrieved pending order ${orderId}`);
    
    res.json({ 
      orderId,
      message: 'Order data would be retrieved from database'
    });
  } catch (error) {
    console.error('❌ Get pending order error:', error);
    res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

// AI insights endpoint
app.get('/api/insights', async (req, res) => {
  try {
    const insights = await learningSystem.getInsights();
    const report = await learningSystem.getScrapingReport();
    
    res.json({
      insights,
      report,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Insights endpoint error:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/complete-order.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/complete-order.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 SDL ENHANCED IMPORT CALCULATOR STARTING...');
  
  // Service status
  console.log('📊 SCRAPING SERVICES STATUS:');
  console.log(`   ${apifyScraper.isAvailable() ? '✅' : '❌'} Apify: ${apifyScraper.isAvailable() ? 'Active (Primary)' : 'Disabled'}`);
  console.log(`   ${process.env.UPCITEMDB_API_KEY ? '✅' : '❌'} UPCitemdb: ${process.env.UPCITEMDB_API_KEY ? 'Active' : 'Disabled'}`);
  console.log(`   ${process.env.SCRAPINGBEE_API_KEY ? '✅' : '❌'} ScrapingBee: ${process.env.SCRAPINGBEE_API_KEY ? 'Active (Fallback)' : 'Disabled'}`);
  console.log(`   ✅ AI Learning: Active`);
  
  // Get initial insights
  learningSystem.getInsights();
  
  console.log(`🌐 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`🧪 Test Mode: ${process.env.NODE_ENV === 'development' ? 'ENABLED' : 'DISABLED'}`);
});
