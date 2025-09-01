// server.js - SDL Enhanced Import Calculator with AI Learning
const express = require('express');
const cors = require('cors');
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
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize services
const apifyScraper = new ApifyScraper(process.env.APIFY_API_KEY);
const upcItemDB = new UPCItemDB(process.env.UPCITEMDB_API_KEY);

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY || '7Z45R9U0PVA9SCI5P4R6RACA0PZUVSWDGNXCZ0OV0EXA17FAVC0PANLM6FAFDDO1PE7MRSZX4JT3SDIG';
const TEST_MODE = process.env.TEST_MODE === 'true';
const pendingOrders = new Map();

console.log('\n🚀 SDL ENHANCED IMPORT CALCULATOR STARTING...\n');

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

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SDL Import Calculator API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      scrape: 'POST /api/scrape',
      updatePrice: 'POST /api/update-price',
      insights: '/api/insights'
    }
  });
});

function detectRetailer(url) {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    if (domain.includes('amazon.com')) return 'Amazon';
    if (domain.includes('wayfair.com')) return 'Wayfair';
    if (domain.includes('target.com')) return 'Target';
    if (domain.includes('bestbuy.com')) return 'Best Buy';
    if (domain.includes('walmart.com')) return 'Walmart';
    if (domain.includes('homedepot.com')) return 'Home Depot';
    return 'Unknown Retailer';
  } catch (e) {
    return 'Unknown Retailer';
  }
}

function categorizeProduct(name, url) {
  const text = (name + ' ' + url).toLowerCase();
  
  if (text.match(/\b(chair|sofa|couch|table|desk|bed|mattress|dresser|cabinet)\b/)) {
    return 'Furniture';
  }
  if (text.match(/\b(lamp|light|lighting|curtain|rug|carpet|pillow|cushion)\b/)) {
    return 'Home & Garden';
  }
  if (text.match(/\b(tv|television|computer|laptop|phone|tablet|speaker|headphone)\b/)) {
    return 'Electronics';
  }
  
  return 'General Merchandise';
}

function calculateShippingCost(category, weight, price, dimensions) {
  let baseCost = 15;
  
  const categoryMultipliers = {
    'Furniture': 2.5,
    'Electronics': 1.8,
    'Home & Garden': 1.5,
    'General Merchandise': 1.0
  };
  
  const multiplier = categoryMultipliers[category] || 1.0;
  baseCost *= multiplier;
  
  if (weight && weight > 0) {
    baseCost += weight * 2.5;
  } else {
    const estimatedWeight = Math.max(1, price * 0.02 * multiplier);
    baseCost += estimatedWeight * 2.5;
  }
  
  if (price > 100) {
    baseCost += Math.min(price * 0.05, 50);
  }
  
  return Math.round(baseCost * 100) / 100;
}

function calculateLandedPrice(productPrice, shippingCost) {
  const subtotal = productPrice + shippingCost;
  const margin = subtotal * 0.25;
  const landedPrice = subtotal + margin;
  
  return {
    productPrice,
    shippingCost,
    subtotal,
    margin,
    landedPrice: Math.round(landedPrice * 100) / 100
  };
}

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
          "brand": "Product brand"
        })
      },
      timeout: 30000
    });
    
    if (response.status === 200 && response.data) {
      const extractedData = response.data;
      console.log(`   ✅ ScrapingBee AI successful`);
      
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
        inStock: true,
        scrapingMethod: 'scrapingbee_ai',
        confidence: price ? 0.9 : 0.6
      };
    }
    
    return null;
  } catch (error) {
    console.log(`   ❌ ScrapingBee AI failed: ${error.message}`);
    return null;
  }
}

async function scrapeProductData(url) {
  const retailer = detectRetailer(url);
  console.log(`\n🔍 Scraping: ${retailer}`);
  
  let productData = null;
  let scrapingMethod = 'unknown';
  
  // Try ScrapingBee AI first
  productData = await scrapeWithScrapingBeeAI(url);
  if (productData) {
    scrapingMethod = 'scrapingbee_ai';
  }
  
  // Fallback to Apify if available
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
  
  // If all failed, create fallback data
  if (!productData) {
    console.log(`   ⚠️ All scraping methods failed, using fallback data`);
    productData = {
      name: `Product from ${retailer}`,
      price: null,
      image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL+Import',
      inStock: true,
      scrapingMethod: 'fallback'
    };
    scrapingMethod = 'fallback';
  }
  
  const category = categorizeProduct(productData.name, url);
  const estimatedPrice = productData.price || 50;
  
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
    needsPriceConfirmation: !productData.price || scrapingMethod === 'fallback'
  };
  
  // Save to learning system
  learningSystem.saveProduct({
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
  
  learningSystem.recordScrapingResult(url, retailer, result, scrapingMethod);
  
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
    
    // Process URLs
    const results = [];
    const batchSize = 3;
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(url => scrapeProductData(url));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Failed to scrape ${batch[index]}:`, result.reason);
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

// Update product price endpoint
app.post('/api/update-price', async (req, res) => {
  try {
    const { url, newPrice, confirmed } = req.body;
    
    if (!url || newPrice === undefined) {
      return res.status(400).json({ error: 'URL and new price are required' });
    }
    
    const retailer = detectRetailer(url);
    const category = 'General Merchandise';
    const shippingCost = calculateShippingCost(category, null, newPrice, null);
    const landedPricing = calculateLandedPrice(newPrice, shippingCost);
    
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
    
    pendingOrders.set(orderId, {
      ...orderData,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
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

// Clean up expired orders periodically
setInterval(() => {
  const now = new Date();
  for (const [orderId, orderData] of pendingOrders.entries()) {
    if (now > orderData.expiresAt) {
      pendingOrders.delete(orderId);
    }
  }
}, 15 * 60 * 1000);

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test Mode: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
});
