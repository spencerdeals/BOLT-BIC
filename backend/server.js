// backend/server.js - Enhanced SDL Import Calculator with AI Learning
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Import our enhanced scraping system
const ApifyScraper = require('./apifyScraper');
const UPCItemDB = require('./upcitemdb');
const learningSystem = require('./learningSystem');

// Initialize scrapers
const apifyScraper = new ApifyScraper(process.env.APIFY_API_KEY);
const upcItemDB = new UPCItemDB(process.env.UPCITEMDB_API_KEY);

const app = express();
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      apify: apifyScraper.isAvailable(),
      upcItemDB: upcItemDB.enabled,
      learningSystem: true
    },
    uptime: process.uptime()
  };
  
  res.status(200).json(status);
});

// In-memory storage for pending orders (replace with database in production)
const pendingOrders = new Map();

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

// Categorize product based on name and URL
function categorizeProduct(name, url) {
  const text = (name + ' ' + url).toLowerCase();
  
  // Furniture categories
  if (text.match(/\b(sofa|couch|chair|table|desk|bed|mattress|dresser|cabinet|bookshelf|nightstand)\b/)) {
    return 'Furniture';
  }
  
  // Electronics
  if (text.match(/\b(tv|television|laptop|computer|phone|tablet|headphones|speaker|camera|gaming)\b/)) {
    return 'Electronics';
  }
  
  // Home & Garden
  if (text.match(/\b(lamp|lighting|rug|curtain|pillow|blanket|decor|plant|garden|outdoor)\b/)) {
    return 'Home & Garden';
  }
  
  // Appliances
  if (text.match(/\b(refrigerator|washer|dryer|dishwasher|microwave|oven|blender|vacuum)\b/)) {
    return 'Appliances';
  }
  
  // Clothing & Accessories
  if (text.match(/\b(shirt|pants|dress|shoes|jacket|bag|watch|jewelry|clothing|apparel)\b/)) {
    return 'Clothing & Accessories';
  }
  
  // Sports & Outdoors
  if (text.match(/\b(bike|bicycle|fitness|exercise|sports|camping|hiking|fishing)\b/)) {
    return 'Sports & Outdoors';
  }
  
  // Books & Media
  if (text.match(/\b(book|dvd|cd|vinyl|magazine|media)\b/)) {
    return 'Books & Media';
  }
  
  // Toys & Games
  if (text.match(/\b(toy|game|puzzle|doll|action figure|board game|video game)\b/)) {
    return 'Toys & Games';
  }
  
  // Health & Beauty
  if (text.match(/\b(skincare|makeup|shampoo|perfume|vitamin|supplement|health|beauty)\b/)) {
    return 'Health & Beauty';
  }
  
  // Tools & Hardware
  if (text.match(/\b(tool|drill|hammer|screwdriver|hardware|automotive|repair)\b/)) {
    return 'Tools & Hardware';
  }
  
  return 'General Merchandise';
}

// Calculate shipping cost based on category, weight, and dimensions
function calculateShippingCost(category, weight, dimensions, price) {
  let baseCost = 15; // Base ocean freight cost
  
  // Category-based adjustments
  const categoryMultipliers = {
    'Furniture': 2.5,
    'Appliances': 2.0,
    'Electronics': 1.2,
    'Sports & Outdoors': 1.8,
    'Tools & Hardware': 1.5,
    'Home & Garden': 1.3,
    'General Merchandise': 1.0,
    'Clothing & Accessories': 0.8,
    'Books & Media': 0.7,
    'Toys & Games': 1.1,
    'Health & Beauty': 0.9
  };
  
  baseCost *= (categoryMultipliers[category] || 1.0);
  
  // Weight-based cost (if available)
  if (weight && weight > 0) {
    if (weight > 50) baseCost += 25; // Heavy items
    else if (weight > 20) baseCost += 15; // Medium items
    else if (weight > 5) baseCost += 5; // Light items
  }
  
  // Size-based cost (if dimensions available)
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    const volume = dimensions.length * dimensions.width * dimensions.height;
    if (volume > 10000) baseCost += 30; // Very large items
    else if (volume > 5000) baseCost += 20; // Large items
    else if (volume > 1000) baseCost += 10; // Medium items
  }
  
  // Price-based adjustment (higher value items cost more to ship safely)
  if (price && price > 0) {
    if (price > 1000) baseCost += 20;
    else if (price > 500) baseCost += 10;
    else if (price > 100) baseCost += 5;
  }
  
  return Math.round(baseCost);
}

// Enhanced scraping with multiple fallbacks and AI learning
async function scrapeProductWithAI(url) {
  const retailer = detectRetailer(url);
  console.log(`\n🔍 Scraping ${retailer} product: ${url.substring(0, 60)}...`);
  
  try {
    // Check if we've seen this product before (AI learning)
    const knownProduct = await learningSystem.getKnownProduct(url);
    if (knownProduct) {
      console.log(`   🧠 AI: Found cached product data (confidence: ${(knownProduct.confidence * 100).toFixed(1)}%)`);
      return {
        url,
        name: knownProduct.name,
        price: knownProduct.price,
        image: knownProduct.image,
        retailer: knownProduct.retailer,
        category: knownProduct.category,
        dimensions: knownProduct.dimensions,
        weight: knownProduct.weight,
        shippingCost: calculateShippingCost(knownProduct.category, knownProduct.weight, knownProduct.dimensions, knownProduct.price),
        scrapingMethod: 'ai_cache'
      };
    }

    let productData = null;
    let scrapingMethod = 'unknown';

    // Try Apify first (most advanced)
    if (apifyScraper.isAvailable()) {
      try {
        console.log(`   🤖 Trying Apify for ${retailer}...`);
        productData = await apifyScraper.scrapeProduct(url);
        scrapingMethod = 'apify';
        console.log(`   ✅ Apify success for ${retailer}`);
      } catch (error) {
        console.log(`   ❌ Apify failed for ${retailer}: ${error.message}`);
      }
    }

    // Fallback to ScrapingBee if Apify failed
    if (!productData) {
      try {
        console.log(`   🐝 Trying ScrapingBee fallback...`);
        productData = await scrapeWithScrapingBee(url);
        scrapingMethod = 'scrapingbee';
        console.log(`   ✅ ScrapingBee success`);
      } catch (error) {
        console.log(`   ❌ ScrapingBee failed: ${error.message}`);
      }
    }

    // If we still don't have good data, try UPC lookup
    if (!productData || !productData.name || productData.name === 'Unknown Product') {
      if (upcItemDB.enabled && productData?.name) {
        try {
          console.log(`   🔍 Trying UPC lookup...`);
          const upcData = await upcItemDB.searchByName(productData.name);
          if (upcData) {
            productData = { ...productData, ...upcData };
            scrapingMethod += '_upc';
            console.log(`   ✅ UPC lookup enhanced data`);
          }
        } catch (error) {
          console.log(`   ❌ UPC lookup failed: ${error.message}`);
        }
      }
    }

    // If we still don't have data, create basic fallback
    if (!productData) {
      console.log(`   ⚠️ All scraping failed, creating fallback product`);
      productData = {
        name: `Product from ${retailer}`,
        price: null,
        image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
        dimensions: null,
        weight: null,
        brand: null,
        inStock: true
      };
      scrapingMethod = 'fallback';
    }

    // Enhance with our categorization and shipping calculation
    const category = categorizeProduct(productData.name, url);
    const shippingCost = calculateShippingCost(category, productData.weight, productData.dimensions, productData.price);

    // Try to get AI estimation if we're missing key data
    if (!productData.dimensions || !productData.weight) {
      const aiEstimation = await learningSystem.getSmartEstimation(category, productData.name, retailer);
      if (aiEstimation) {
        console.log(`   🤖 AI: Using smart estimation (confidence: ${(aiEstimation.confidence * 100).toFixed(1)}%)`);
        if (!productData.dimensions && aiEstimation.dimensions) {
          productData.dimensions = aiEstimation.dimensions;
        }
        if (!productData.weight && aiEstimation.weight) {
          productData.weight = aiEstimation.weight;
        }
      }
    }

    const finalProduct = {
      url,
      name: productData.name,
      price: productData.price,
      image: productData.image,
      retailer,
      category,
      dimensions: productData.dimensions,
      weight: productData.weight,
      shippingCost,
      scrapingMethod
    };

    // Save to AI learning system
    await learningSystem.saveProduct(finalProduct);
    await learningSystem.recordScrapingResult(url, retailer, productData, scrapingMethod);

    console.log(`   📦 Final product: ${finalProduct.name?.substring(0, 50)}... | $${finalProduct.shippingCost} shipping`);
    return finalProduct;

  } catch (error) {
    console.error(`   💥 Complete scraping failure for ${url}:`, error.message);
    
    // Return absolute fallback
    return {
      url,
      name: `Product from ${retailer}`,
      price: null,
      image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
      retailer,
      category: 'General Merchandise',
      dimensions: null,
      weight: null,
      shippingCost: 25,
      scrapingMethod: 'error_fallback'
    };
  }
}

// ScrapingBee fallback function
async function scrapeWithScrapingBee(url) {
  const axios = require('axios');
  
  if (!process.env.SCRAPINGBEE_API_KEY) {
    throw new Error('ScrapingBee API key not configured');
  }

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

  const cheerio = require('cheerio');
  const $ = cheerio.load(response.data);

  // Generic selectors that work across many sites
  const titleSelectors = [
    'h1',
    '[data-testid="product-title"]',
    '.product-title',
    '#productTitle',
    '[itemprop="name"]',
    '.product-name'
  ];

  const imageSelectors = [
    'img.mainImage',
    '[data-testid="product-image"] img',
    '.product-photo img',
    '#landingImage',
    '[itemprop="image"]',
    '.primary-image img'
  ];

  let name = null;
  let image = null;

  // Try to find product name
  for (const selector of titleSelectors) {
    const element = $(selector).first();
    if (element.length && element.text().trim()) {
      name = element.text().trim();
      break;
    }
  }

  // Try to find product image
  for (const selector of imageSelectors) {
    const element = $(selector).first();
    if (element.length) {
      image = element.attr('src') || element.attr('data-src');
      if (image) break;
    }
  }

  return {
    name: name || 'Unknown Product',
    price: null, // ScrapingBee doesn't extract price reliably
    image: image || 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
    dimensions: null,
    weight: null,
    brand: null,
    inStock: true
  };
}

// API Routes
app.post('/api/scrape', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    console.log(`\n🚀 Starting enhanced scrape for ${urls.length} products...`);
    
    const products = [];
    
    // Process URLs with some concurrency but not too much to avoid rate limits
    const batchSize = 3;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(url => scrapeProductWithAI(url));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          products.push(result.value);
        } else {
          console.error(`Failed to scrape ${batch[index]}:`, result.reason);
          // Add fallback product
          products.push({
            url: batch[index],
            name: 'Product (Scraping Failed)',
            price: null,
            image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
            retailer: detectRetailer(batch[index]),
            category: 'General Merchandise',
            dimensions: null,
            weight: null,
            shippingCost: 25,
            scrapingMethod: 'failed'
          });
        }
      });
      
      // Small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`\n✅ Scraping complete! ${products.length} products processed`);
    
    // Get AI insights
    const insights = await learningSystem.getInsights();
    
    res.json({ 
      products,
      insights,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Failed to scrape products' });
  }
});

// Store pending order
app.post('/api/store-pending-order', (req, res) => {
  try {
    const orderData = req.body;
    const orderId = Date.now().toString();
    
    pendingOrders.set(orderId, {
      ...orderData,
      createdAt: new Date().toISOString()
    });
    
    // Clean up old orders (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [id, order] of pendingOrders.entries()) {
      if (new Date(order.createdAt).getTime() < oneHourAgo) {
        pendingOrders.delete(id);
      }
    }
    
    res.json({ orderId });
  } catch (error) {
    console.error('Error storing pending order:', error);
    res.status(500).json({ error: 'Failed to store order' });
  }
});

// Get pending order
app.get('/api/get-pending-order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const order = pendingOrders.get(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error getting pending order:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// AI Learning insights endpoint
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
    console.error('Error getting insights:', error);
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
app.listen(PORT, HOST, async () => {
  console.log('\n🚀 SDL ENHANCED IMPORT CALCULATOR STARTING...\n');
  
  // Initialize and show status
  console.log('📊 SCRAPING SERVICES STATUS:');
  console.log(`   ${apifyScraper.isAvailable() ? '✅' : '❌'} Apify: ${apifyScraper.isAvailable() ? 'Active' : 'Disabled'}`);
  console.log(`   ${upcItemDB.enabled ? '✅' : '❌'} UPCitemdb: ${upcItemDB.enabled ? 'Active' : 'Disabled'}`);
  console.log(`   ✅ ScrapingBee: Active (fallback)`);
  console.log(`   ✅ AI Learning: Active`);
  
  // Get AI insights on startup
  try {
    const insights = await learningSystem.getInsights();
    if (insights.totalProducts > 0) {
      console.log(`\n🧠 AI LEARNING STATUS:`);
      console.log(`   Products learned: ${insights.totalProducts}`);
      console.log(`   Average confidence: ${(insights.avgConfidence * 100).toFixed(1)}%`);
      console.log(`   Categories tracked: ${insights.categories?.length || 0}`);
    }
  } catch (error) {
    console.log('   ⚠️ AI insights unavailable');
  }
  
  console.log(`\n🌐 Server running on http://${HOST}:${PORT}`);
  console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🧪 Test Mode: ${process.env.NODE_ENV !== 'production' ? 'ENABLED' : 'DISABLED'}`);
  console.log('\n🎯 Ready for product scraping!\n');
});
