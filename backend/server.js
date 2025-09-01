// backend/server.js - SDL Enhanced Import Calculator with AI Learning
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
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

// ScrapingBee API Key (using your friend's working key as fallback)
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY || '7Z45R9U0PVA9SCI5P4R6RACA0PZUVSWDGNXCZ0OV0EXA17FAVC0PANLM6FAFDDO1PE7MRSZX4JT3SDIG';

// Test mode flag
const TEST_MODE = process.env.TEST_MODE === 'true';

// In-memory storage for pending orders (in production, use Redis or database)
const pendingOrders = new Map();

console.log('\n🚀 SDL ENHANCED IMPORT CALCULATOR STARTING...\n');

// Service status check
console.log('📋 SERVICE STATUS:');
console.log(`   ✅ ScrapingBee AI: Active (Primary)`);
console.log(`   ${apifyScraper.isAvailable() ? '✅' : '❌'} Apify: ${apifyScraper.isAvailable() ? 'Active' : 'Disabled'}`);
console.log(`   ${upcItemDB.enabled ? '✅' : '❌'} UPCitemdb: ${upcItemDB.enabled ? 'Active' : 'Disabled'}`);
console.log(`   ✅ AI Learning: Active`);

// Get AI insights on startup
learningSystem.getInsights();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    services: {
      scrapingbee: !!SCRAPINGBEE_API_KEY,
      apify: apifyScraper.isAvailable(),
      upcitemdb: upcItemDB.enabled,
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

// Calculate our margin and final landed price
function calculateLandedPrice(productPrice, shippingCost) {
  const subtotal = productPrice + shippingCost;
  const margin = subtotal * 0.25; // 25% margin
  const landedPrice = subtotal + margin;
  
  return {
    productPrice,
    shippingCost,
    subtotal,
    margin,
    landedPrice: Math.round(landedPrice * 100) / 100
  };
}

// Enhanced ScrapingBee AI extraction (based on your friend's successful approach)
async function scrapeWithScrapingBeeAI(url) {
  try {
    console.log(`   🔄 Trying ScrapingBee AI extraction...`);
    
    const response = await axios.get('https://app.scrapingbee.com/api/v1', {
      params: {
        api_key: SCRAPINGBEE_API_KEY,
        url: url,
        premium_proxy: 'true',
        country_code: 'us',
        ai_extract_rules: JSON.stringify({
          "product_name": "Product name or title",
          "price": "Product price in USD",
          "image_url": "Main product image URL",
          "availability": "In stock status",
          "brand": "Product brand",
          "description": "Product description"
        })
      },
      timeout: 30000
    });
    
    if (response.status === 200 && response.data) {
      const extractedData = response.data;
      console.log(`   ✅ ScrapingBee AI successful`);
      console.log(`   📊 Extracted:`, extractedData);
      
      // Parse the price from the extracted data
      let price = null;
      if (extractedData.price) {
        const priceMatch = extractedData.price.toString().match(/[\d,]+\.?\d*/);
        if (priceMatch) {
          price = parseFloat(priceMatch[0].replace(',', ''));
        }
      }
      
      return {
        name: extractedData.product_name || 'Product Name Not Found',
        price: price,
        image: extractedData.image_url,
        brand: extractedData.brand,
        inStock: extractedData.availability ? !extractedData.availability.toLowerCase().includes('out') : true,
        description: extractedData.description,
        scrapingMethod: 'scrapingbee_ai',
        confidence: price ? 0.9 : 0.6 // High confidence if we got a price
      };
    }
    
    return null;
  } catch (error) {
    console.log(`   ❌ ScrapingBee AI failed: ${error.message}`);
    return null;
  }
}

// Enhanced scraping with multiple fallbacks and AI learning
async function scrapeProductData(url) {
  const retailer = detectRetailer(url);
  console.log(`\n🔍 Scraping: ${retailer}`);
  console.log(`   URL: ${url.substring(0, 80)}...`);
  
  // Check if we've seen this product before (AI Learning)
  const knownProduct = await learningSystem.getKnownProduct(url);
  if (knownProduct && knownProduct.confidence > 0.8) {
    console.log(`   🤖 AI: Found cached product data (confidence: ${(knownProduct.confidence * 100).toFixed(1)}%)`);
    const landedPricing = calculateLandedPrice(knownProduct.price, calculateShippingCost(knownProduct.category, knownProduct.weight, knownProduct.price, knownProduct.dimensions));
    
    return {
      url,
      name: knownProduct.name,
      price: knownProduct.price,
      image: knownProduct.image,
      retailer,
      category: knownProduct.category,
      weight: knownProduct.weight,
      dimensions: knownProduct.dimensions,
      shippingCost: landedPricing.shippingCost,
      landedPricing,
      inStock: knownProduct.inStock,
      scrapingMethod: 'ai_cache',
      needsPriceConfirmation: false // Cached data is already confirmed
    };
  }
  
  let productData = null;
  let scrapingMethod = 'unknown';
  
  // Try ScrapingBee AI first (your friend's successful approach)
  productData = await scrapeWithScrapingBeeAI(url);
  if (productData) {
    scrapingMethod = 'scrapingbee_ai';
  }
  
  // Fallback to Apify if ScrapingBee AI failed
  if (!productData && apifyScraper.isAvailable()) {
    try {
      console.log(`   🔄 Trying Apify scraper...`);
      productData = await apifyScraper.scrapeProduct(url);
      scrapingMethod = 'apify';
      console.log(`   ✅ Apify successful`);
    } catch (error) {
      console.log(`   ❌ Apify failed: ${error.message}`);
    }
  }
  
  // If still no data, try UPCitemdb as last resort
  if (!productData && upcItemDB.enabled) {
    try {
      console.log(`   🔄 Trying UPCitemdb search...`);
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
          inStock: true,
          scrapingMethod: 'upcitemdb'
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
      inStock: true,
      scrapingMethod: 'fallback'
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
  
  const shippingCost = calculateShippingCost(category, productData.weight, estimatedPrice, productData.dimensions);
  const landedPricing = calculateLandedPrice(estimatedPrice, shippingCost);
  
  const result = {
    url,
    name: productData.name,
    price: productData.price,
    image: productData.image,
    retailer,
    category,
    weight: productData.weight,
    dimensions: productData.dimensions,
    shippingCost,
    landedPricing,
    inStock: productData.inStock,
    scrapingMethod,
    needsPriceConfirmation: !productData.price || scrapingMethod === 'fallback' // Need confirmation if no price or fallback
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
  
  console.log(`   📦 Final result: ${result.name.substring(0, 50)}... | $${result.landedPricing.landedPrice} landed`);
  
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
      const mockProducts = urls.map((url, index) => {
        const mockPrice = 99.99;
        const mockShipping = 25.50;
        const landedPricing = calculateLandedPrice(mockPrice, mockShipping);
        
        return {
          url,
          name: `Test Product ${index + 1}`,
          price: mockPrice,
          image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=Test',
          retailer: detectRetailer(url),
          category: 'General Merchandise',
          weight: 2.5,
          dimensions: { length: 12, width: 8, height: 4 },
          shippingCost: mockShipping,
          landedPricing,
          inStock: true,
          scrapingMethod: 'test_mode',
          needsPriceConfirmation: false
        };
      });
      
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
          const fallbackPrice = 50;
          const fallbackShipping = 20;
          const landedPricing = calculateLandedPrice(fallbackPrice, fallbackShipping);
          
          results.push({
            url: batch[index],
            name: `Product from ${detectRetailer(batch[index])}`,
            price: null,
            image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
            retailer: detectRetailer(batch[index]),
            category: 'General Merchandise',
            weight: null,
            dimensions: null,
            shippingCost: fallbackShipping,
            landedPricing,
            inStock: true,
            scrapingMethod: 'error_fallback',
            needsPriceConfirmation: true
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

// Update product price endpoint (for price confirmation)
app.post('/api/update-price', async (req, res) => {
  try {
    const { url, newPrice, confirmed } = req.body;
    
    if (!url || newPrice === undefined) {
      return res.status(400).json({ error: 'URL and new price are required' });
    }
    
    // Recalculate shipping and landed pricing with new price
    const retailer = detectRetailer(url);
    const category = 'General Merchandise'; // You might want to store this
    const shippingCost = calculateShippingCost(category, null, newPrice, null);
    const landedPricing = calculateLandedPrice(newPrice, shippingCost);
    
    // If confirmed, save to learning system
    if (confirmed) {
      await learningSystem.saveProduct({
        url,
        price: newPrice,
        retailer,
        category,
        confirmed: true,
        updatedAt: new Date()
      });
    }
    
    res.json({
      success: true,
      shippingCost,
      landedPricing
    });
    
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Failed to update price' });
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

// Fixed port binding for Railway
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test Mode: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});
