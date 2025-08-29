// backend/server.js - SDL Enhanced Import Calculator with AI Learning
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import our modules
const ApifyScraper = require('./apifyScraper');
const UPCItemDB = require('./upcitemdb');
const learningSystem = require('./learningSystem');

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize services
const apifyScraper = new ApifyScraper(process.env.APIFY_API_KEY);
const upcItemDB = new UPCItemDB(process.env.UPCITEMDB_API_KEY);

// Test mode flag
const TEST_MODE = process.env.TEST_MODE === 'true';

// In-memory storage for pending orders (in production, use Redis or database)
const pendingOrders = new Map();

console.log('\n🚀 SDL ENHANCED IMPORT CALCULATOR STARTING...\n');

// Service status check
console.log('📋 SERVICE STATUS:');
console.log(`   ${apifyScraper.isAvailable() ? '✅' : '❌'} Apify: ${apifyScraper.isAvailable() ? 'Active' : 'Disabled'}`);
console.log(`   ${upcItemDB.enabled ? '✅' : '❌'} UPCitemdb: ${upcItemDB.enabled ? 'Active' : 'Disabled'}`);
console.log(`   ✅ ScrapingBee: Active (Fallback)`);
console.log(`   ✅ AI Learning: Active`);

// Get AI insights on startup
learningSystem.getInsights();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      apify: apifyScraper.isAvailable(),
      upcitemdb: upcItemDB.enabled,
      scrapingbee: !!process.env.SCRAPINGBEE_API_KEY,
      learning: true
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

// Categorize product based on name and URL
function categorizeProduct(name, url) {
  const text = (name + ' ' + url).toLowerCase();
  
  // Furniture categories
  if (text.match(/\b(chair|sofa|couch|table|desk|bed|mattress|dresser|cabinet|bookshelf|nightstand|ottoman|bench|stool)\b/)) {
    return 'Furniture';
  }
  
  // Home & Garden
  if (text.match(/\b(lamp|light|lighting|curtain|rug|carpet|pillow|cushion|blanket|throw|vase|plant|garden|outdoor)\b/)) {
    return 'Home & Garden';
  }
  
  // Electronics
  if (text.match(/\b(tv|television|computer|laptop|phone|tablet|speaker|headphone|camera|gaming|xbox|playstation|nintendo)\b/)) {
    return 'Electronics';
  }
  
  // Kitchen & Dining
  if (text.match(/\b(kitchen|dining|cookware|appliance|blender|mixer|coffee|microwave|refrigerator|dishwasher)\b/)) {
    return 'Kitchen & Dining';
  }
  
  // Clothing & Accessories
  if (text.match(/\b(shirt|pants|dress|shoes|jacket|coat|hat|bag|watch|jewelry|clothing|apparel)\b/)) {
    return 'Clothing & Accessories';
  }
  
  // Sports & Outdoors
  if (text.match(/\b(sport|fitness|exercise|bike|bicycle|camping|hiking|fishing|golf|tennis|basketball)\b/)) {
    return 'Sports & Outdoors';
  }
  
  // Tools & Hardware
  if (text.match(/\b(tool|drill|hammer|saw|wrench|hardware|construction|repair|maintenance)\b/)) {
    return 'Tools & Hardware';
  }
  
  // Beauty & Personal Care
  if (text.match(/\b(beauty|cosmetic|skincare|shampoo|soap|perfume|makeup|personal care)\b/)) {
    return 'Beauty & Personal Care';
  }
  
  // Books & Media
  if (text.match(/\b(book|dvd|cd|music|movie|game|media|magazine)\b/)) {
    return 'Books & Media';
  }
  
  // Toys & Games
  if (text.match(/\b(toy|game|puzzle|doll|action figure|lego|board game|kids|children)\b/)) {
    return 'Toys & Games';
  }
  
  return 'General Merchandise';
}

// Calculate shipping cost based on category, weight, and price
function calculateShippingCost(category, weight, price, dimensions) {
  let baseCost = 15; // Base ocean freight cost
  
  // Category-based adjustments
  const categoryMultipliers = {
    'Furniture': 2.5,
    'Electronics': 1.8,
    'Home & Garden': 1.5,
    'Kitchen & Dining': 1.7,
    'Sports & Outdoors': 2.0,
    'Tools & Hardware': 1.6,
    'General Merchandise': 1.0,
    'Clothing & Accessories': 0.8,
    'Beauty & Personal Care': 0.7,
    'Books & Media': 0.9,
    'Toys & Games': 1.2
  };
  
  const multiplier = categoryMultipliers[category] || 1.0;
  baseCost *= multiplier;
  
  // Weight-based calculation (if available)
  if (weight && weight > 0) {
    baseCost += weight * 2.5; // $2.50 per pound
  } else {
    // Estimate weight from price and category if not available
    const estimatedWeight = Math.max(1, price * 0.02 * multiplier);
    baseCost += estimatedWeight * 2.5;
  }
  
  // Dimensional weight consideration
  if (dimensions && dimensions.length && dimensions.width && dimensions.height) {
    const dimWeight = (dimensions.length * dimensions.width * dimensions.height) / 166; // Standard dim weight divisor
    if (dimWeight > weight) {
      baseCost += (dimWeight - weight) * 1.5; // Additional cost for bulky items
    }
  }
  
  // Price-based adjustment (higher value items cost more to ship safely)
  if (price > 100) {
    baseCost += Math.min(price * 0.05, 50); // Max $50 additional for high-value items
  }
  
  return Math.round(baseCost * 100) / 100; // Round to 2 decimal places
}

// Enhanced scraping with multiple fallbacks and AI learning
async function scrapeProductData(url) {
  const retailer = detectRetailer(url);
  console.log(`\n🔍 Scraping: ${retailer}`);
  console.log(`   URL: ${url.substring(0, 80)}...`);
  
  // Check if we've seen this product before (AI Learning)
  const knownProduct = await learningSystem.getKnownProduct(url);
  if (knownProduct) {
    console.log(`   🤖 AI: Found cached product data (confidence: ${(knownProduct.confidence * 100).toFixed(1)}%)`);
    return {
      url,
      name: knownProduct.name,
      price: knownProduct.price,
      image: knownProduct.image,
      retailer,
      category: knownProduct.category,
      weight: knownProduct.weight,
      dimensions: knownProduct.dimensions,
      shippingCost: calculateShippingCost(knownProduct.category, knownProduct.weight, knownProduct.price, knownProduct.dimensions),
      inStock: knownProduct.inStock,
      scrapingMethod: 'ai_cache'
    };
  }
  
  let productData = null;
  let scrapingMethod = 'unknown';
  
  // Try Apify first (if available)
  if (apifyScraper.isAvailable()) {
    try {
      console.log(`   🔄 Trying Apify scraper...`);
      productData = await apifyScraper.scrapeProduct(url);
      scrapingMethod = 'apify';
      console.log(`   ✅ Apify successful`);
    } catch (error) {
      console.log(`   ❌ Apify failed: ${error.message}`);
    }
  }
  
  // Fallback to ScrapingBee if Apify failed
  if (!productData && process.env.SCRAPINGBEE_API_KEY) {
    try {
      console.log(`   🔄 Trying ScrapingBee fallback...`);
      const axios = require('axios');
      
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
      
      if (response.data) {
        const cheerio = require('cheerio');
        const $ = cheerio.load(response.data);
        
        // Generic selectors for common e-commerce sites
        const titleSelectors = [
          'h1', 
          '[data-testid="product-title"]',
          '.product-title',
          '#productTitle',
          '[itemprop="name"]',
          '.product-name',
          '.product-info h1',
          '.pdp-title'
        ];
        
        const priceSelectors = [
          '[data-testid="product-price"]',
          '.price-now',
          '.price',
          '[itemprop="price"]',
          '.product-price',
          '.current-price',
          'span.wux-price-display',
          '.pdp-price'
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
        let price = null;
        let image = null;
        
        // Extract name
        for (const selector of titleSelectors) {
          const element = $(selector).first();
          if (element.length && element.text().trim()) {
            name = element.text().trim();
            break;
          }
        }
        
        // Extract price
        for (const selector of priceSelectors) {
          const element = $(selector).first();
          if (element.length && element.text().trim()) {
            const priceText = element.text().trim();
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            if (priceMatch) {
              price = parseFloat(priceMatch[0].replace(',', ''));
              break;
            }
          }
        }
        
        // Extract image
        for (const selector of imageSelectors) {
          const element = $(selector).first();
          if (element.length) {
            image = element.attr('src') || element.attr('data-src');
            if (image) break;
          }
        }
        
        if (name) {
          productData = {
            name: name,
            price: price,
            image: image,
            dimensions: null,
            weight: null,
            brand: null,
            category: null,
            inStock: true
          };
          scrapingMethod = 'scrapingbee';
          console.log(`   ✅ ScrapingBee successful`);
        }
      }
    } catch (error) {
      console.log(`   ❌ ScrapingBee failed: ${error.message}`);
    }
  }
  
  // If still no data, try UPCitemdb as last resort
  if (!productData && upcItemDB.enabled) {
    try {
      console.log(`   🔄 Trying UPCitemdb search...`);
      // Extract potential product name from URL for search
      const urlParts = url.split('/');
      const searchTerm = urlParts.find(part => part.length > 10 && part.includes('-'))?.replace(/-/g, ' ') || 'product';
      
      const upcData = await upcItemDB.searchByName(searchTerm);
      if (upcData) {
        productData = {
          name: upcData.name,
          price: null, // UPC doesn't provide current prices
          image: upcData.image,
          dimensions: upcData.dimensions,
          weight: upcData.weight,
          brand: upcData.brand,
          category: null,
          inStock: true
        };
        scrapingMethod = 'upcitemdb';
        console.log(`   ✅ UPCitemdb successful`);
      }
    } catch (error) {
      console.log(`   ❌ UPCitemdb failed: ${error.message}`);
    }
  }
  
  // If all scraping failed, create fallback data
  if (!productData) {
    console.log(`   ⚠️ All scraping methods failed, using fallback data`);
    productData = {
      name: `Product from ${retailer}`,
      price: null,
      image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL+Import',
      dimensions: null,
      weight: null,
      brand: null,
      category: null,
      inStock: true
    };
    scrapingMethod = 'fallback';
  }
  
  // Enhance data with our intelligence
  const category = productData.category || categorizeProduct(productData.name, url);
  const estimatedPrice = productData.price || 50; // Default estimate if no price found
  
  // Get AI-enhanced estimation if available
  const aiEstimation = await learningSystem.getSmartEstimation(category, productData.name, retailer);
  if (aiEstimation && !productData.dimensions) {
    console.log(`   🤖 AI: Enhanced with ${aiEstimation.source} (confidence: ${(aiEstimation.confidence * 100).toFixed(1)}%)`);
    productData.dimensions = aiEstimation.dimensions;
    productData.weight = aiEstimation.weight;
  }
  
  const result = {
    url,
    name: productData.name,
    price: productData.price,
    image: productData.image,
    retailer,
    category,
    weight: productData.weight,
    dimensions: productData.dimensions,
    shippingCost: calculateShippingCost(category, productData.weight, estimatedPrice, productData.dimensions),
    inStock: productData.inStock,
    scrapingMethod
  };
  
  // Save to learning system for future use
  await learningSystem.saveProduct({
    url,
    name: result.name,
    retailer,
    category,
    price: result.price,
    weight: result.weight,
    dimensions: result.dimensions,
    image: result.image,
    scrapingMethod
  });
  
  // Record scraping performance
  await learningSystem.recordScrapingResult(url, retailer, result, scrapingMethod);
  
  console.log(`   📦 Final result: ${result.name.substring(0, 50)}... | $${result.shippingCost} shipping`);
  
  return result;
}

// Main scraping endpoint
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
    
    // In test mode, return mock data
    if (TEST_MODE) {
      console.log('🧪 TEST MODE: Returning mock data');
      const mockProducts = urls.map((url, index) => ({
        url,
        name: `Test Product ${index + 1}`,
        price: 99.99,
        image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=Test',
        retailer: detectRetailer(url),
        category: 'General Merchandise',
        weight: 2.5,
        dimensions: { length: 12, width: 8, height: 4 },
        shippingCost: 25.50,
        inStock: true,
        scrapingMethod: 'test_mode'
      }));
      
      return res.json({ products: mockProducts });
    }
    
    // Process URLs concurrently with a limit
    const results = [];
    const batchSize = 3; // Process 3 at a time to avoid overwhelming services
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(url => scrapeProductData(url));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Failed to scrape ${batch[index]}:`, result.reason);
          // Add fallback data for failed scrapes
          results.push({
            url: batch[index],
            name: `Product from ${detectRetailer(batch[index])}`,
            price: null,
            image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
            retailer: detectRetailer(batch[index]),
            category: 'General Merchandise',
            weight: null,
            dimensions: null,
            shippingCost: 20,
            inStock: true,
            scrapingMethod: 'error_fallback'
          });
        }
      });
      
      // Small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ SCRAPING COMPLETE: ${results.length} products processed\n`);
    
    res.json({ products: results });
    
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ error: 'Failed to scrape products' });
  }
});

// Store pending order endpoint
app.post('/api/store-pending-order', (req, res) => {
  try {
    const orderData = req.body;
    const orderId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    // Store order data temporarily (expires in 1 hour)
    pendingOrders.set(orderId, {
      ...orderData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });
    
    console.log(`📝 Stored pending order: ${orderId}`);
    
    res.json({ orderId });
  } catch (error) {
    console.error('Error storing pending order:', error);
    res.status(500).json({ error: 'Failed to store order' });
  }
});

// Get pending order endpoint
app.get('/api/get-pending-order/:orderId', (req, res) => {
  try {
    const { orderId } = req.params;
    const orderData = pendingOrders.get(orderId);
    
    if (!orderData) {
      return res.status(404).json({ error: 'Order not found or expired' });
    }
    
    // Check if order has expired
    if (new Date() > orderData.expiresAt) {
      pendingOrders.delete(orderId);
      return res.status(404).json({ error: 'Order has expired' });
    }
    
    res.json(orderData);
  } catch (error) {
    console.error('Error retrieving pending order:', error);
    res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

// AI insights endpoint
app.get('/api/insights', async (req, res) => {
  try {
    const insights = await learningSystem.getInsights();
    res.json(insights);
  } catch (error) {
    console.error('Error getting insights:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Clean up expired orders periodically
setInterval(() => {
  const now = new Date();
  for (const [orderId, orderData] of pendingOrders.entries()) {
    if (now > orderData.expiresAt) {
      pendingOrders.delete(orderId);
    }
  }
}, 15 * 60 * 1000); // Clean up every 15 minutes

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test Mode: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
});
