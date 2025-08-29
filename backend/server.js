// backend/server.js - SDL Import Calculator TEST Server
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import our scraping modules
const ApifyScraper = require('./apifyScraper');
const AdaptiveScraper = require('./adaptiveScraper');
const learningSystem = require('./learningSystem');

const app = express();
const PORT = process.env.PORT || 8080;

// Test mode configuration
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';

console.log('🚀 Starting SDL Import Calculator Server...');
console.log(`📊 Test Mode: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
console.log(`🌐 Port: ${PORT}`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: TEST_MODE ? 1000 : 100, // More requests in test mode
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Initialize scrapers
const apifyScraper = new ApifyScraper(process.env.APIFY_API_KEY);
const adaptiveScraper = new AdaptiveScraper(process.env.SCRAPINGBEE_API_KEY);

// In-memory storage for test orders
const testOrders = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    testMode: TEST_MODE,
    version: '1.0.0-test'
  });
});

// Main scraping endpoint
app.post('/api/scrape', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    if (urls.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 URLs allowed' });
    }

    console.log(`\n🔄 Processing ${urls.length} URLs in ${TEST_MODE ? 'TEST' : 'PRODUCTION'} mode...`);

    const products = [];
    const errors = [];

    // Process each URL
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`\n📦 Processing ${i + 1}/${urls.length}: ${url.substring(0, 80)}...`);

      try {
        let productData = null;

        // Check learning system first
        const knownProduct = await learningSystem.getKnownProduct(url);
        if (knownProduct && !TEST_MODE) {
          console.log('   🧠 Found in learning system');
          productData = knownProduct;
        } else {
          // Try scraping methods in order of preference
          const methods = [
            { name: 'Apify', scraper: apifyScraper },
            { name: 'Adaptive', scraper: adaptiveScraper }
          ];

          for (const method of methods) {
            if (method.scraper.isAvailable && method.scraper.isAvailable()) {
              try {
                console.log(`   🔄 Trying ${method.name}...`);
                productData = await method.scraper.scrapeProduct(url);
                
                if (productData && productData.name) {
                  console.log(`   ✅ ${method.name} successful`);
                  productData.scrapingMethod = method.name;
                  break;
                }
              } catch (error) {
                console.log(`   ❌ ${method.name} failed: ${error.message}`);
                continue;
              }
            }
          }
        }

        // If no scraping worked, create fallback product
        if (!productData || !productData.name) {
          console.log('   🔄 Creating fallback product...');
          productData = createFallbackProduct(url);
        }

        // Enhance with shipping cost estimation
        productData = await enhanceWithShippingCost(productData);
        
        // Add to products array
        products.push(productData);

        // Save to learning system (skip in test mode)
        if (!TEST_MODE && productData.scrapingMethod) {
          await learningSystem.saveProduct(productData);
          await learningSystem.recordScrapingResult(url, productData.retailer, productData, productData.scrapingMethod);
        }

      } catch (error) {
        console.error(`   ❌ Error processing ${url}:`, error.message);
        errors.push({ url, error: error.message });
        
        // Add fallback product even on error
        products.push(createFallbackProduct(url));
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`\n✅ Completed in ${processingTime}ms`);
    console.log(`📊 Success: ${products.length}, Errors: ${errors.length}`);

    // Get AI insights (skip in test mode)
    if (!TEST_MODE) {
      await learningSystem.getInsights();
    }

    res.json({
      success: true,
      products,
      errors,
      processingTime,
      testMode: TEST_MODE,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Scraping endpoint error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      testMode: TEST_MODE,
      timestamp: new Date().toISOString()
    });
  }
});

// Store pending test order
app.post('/api/store-pending-order', async (req, res) => {
  try {
    const orderData = req.body;
    const orderId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store in memory for test mode
    testOrders.set(orderId, {
      ...orderData,
      createdAt: new Date().toISOString(),
      status: 'pending'
    });

    console.log(`📝 Stored test order: ${orderId}`);
    
    res.json({ 
      success: true, 
      orderId,
      testMode: TEST_MODE
    });
  } catch (error) {
    console.error('❌ Store order error:', error);
    res.status(500).json({ error: 'Failed to store order' });
  }
});

// Get pending test order
app.get('/api/get-pending-order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderData = testOrders.get(orderId);
    
    if (!orderData) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      success: true,
      order: orderData,
      testMode: TEST_MODE
    });
  } catch (error) {
    console.error('❌ Get order error:', error);
    res.status(500).json({ error: 'Failed to retrieve order' });
  }
});

// Test endpoint for Shopify integration simulation
app.post('/apps/instant-import/create-draft-order', async (req, res) => {
  try {
    const orderData = req.body;
    
    if (TEST_MODE) {
      // Simulate draft order creation
      const draftOrderNumber = `TEST-${Date.now()}`;
      
      console.log(`🧪 TEST: Simulating draft order creation`);
      console.log(`📋 Order Number: ${draftOrderNumber}`);
      console.log(`💰 Total: $${orderData.totals?.grandTotal?.toFixed(2) || '0.00'}`);
      console.log(`📦 Products: ${orderData.products?.length || 0}`);
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      res.json({
        success: true,
        draftOrderNumber,
        testMode: true,
        message: 'Test draft order created successfully'
      });
    } else {
      // In production, this would integrate with Shopify
      res.status(501).json({ 
        error: 'Shopify integration not implemented in this version',
        testMode: false
      });
    }
  } catch (error) {
    console.error('❌ Draft order error:', error);
    res.status(500).json({ error: 'Failed to create draft order' });
  }
});

// Test insights endpoint
app.get('/api/test-insights', async (req, res) => {
  try {
    const insights = {
      testMode: TEST_MODE,
      testOrders: testOrders.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };

    if (!TEST_MODE) {
      const aiInsights = await learningSystem.getInsights();
      insights.ai = aiInsights;
    }

    res.json(insights);
  } catch (error) {
    console.error('❌ Insights error:', error);
    res.status(500).json({ error: 'Failed to get insights' });
  }
});

// Helper Functions
function createFallbackProduct(url) {
  const retailer = detectRetailer(url);
  const category = guessCategory(url);
  
  return {
    url,
    name: `Product from ${retailer}`,
    retailer,
    category,
    price: null,
    image: 'https://placehold.co/300x300/7CB342/FFFFFF/png?text=SDL',
    dimensions: null,
    weight: null,
    inStock: true,
    scrapingMethod: 'fallback',
    shippingCost: estimateShippingCost(category, null, null)
  };
}

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
    return 'Unknown Retailer';
  } catch (e) {
    return 'Unknown Retailer';
  }
}

function guessCategory(url) {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('furniture') || urlLower.includes('chair') || urlLower.includes('table')) return 'Furniture';
  if (urlLower.includes('electronic') || urlLower.includes('tv') || urlLower.includes('computer')) return 'Electronics';
  if (urlLower.includes('clothing') || urlLower.includes('shirt') || urlLower.includes('dress')) return 'Clothing';
  if (urlLower.includes('home') || urlLower.includes('kitchen') || urlLower.includes('decor')) return 'Home & Garden';
  if (urlLower.includes('toy') || urlLower.includes('game')) return 'Toys & Games';
  if (urlLower.includes('book')) return 'Books';
  if (urlLower.includes('sport') || urlLower.includes('fitness')) return 'Sports & Outdoors';
  return 'General';
}

async function enhanceWithShippingCost(product) {
  // Get AI estimation if available
  if (!TEST_MODE) {
    try {
      const aiEstimation = await learningSystem.getSmartEstimation(
        product.category, 
        product.name, 
        product.retailer
      );
      
      if (aiEstimation) {
        console.log(`   🤖 AI estimation: ${aiEstimation.source}`);
        if (!product.dimensions && aiEstimation.dimensions) {
          product.dimensions = aiEstimation.dimensions;
        }
        if (!product.weight && aiEstimation.weight) {
          product.weight = aiEstimation.weight;
        }
      }
    } catch (error) {
      console.log('   ⚠️ AI estimation failed:', error.message);
    }
  }

  // Calculate shipping cost
  product.shippingCost = estimateShippingCost(
    product.category,
    product.dimensions,
    product.weight
  );

  return product;
}

function estimateShippingCost(category, dimensions, weight) {
  // Base rates by category
  const categoryRates = {
    'Furniture': 45,
    'Electronics': 25,
    'Home & Garden': 20,
    'Clothing': 15,
    'Books': 12,
    'Toys & Games': 18,
    'Sports & Outdoors': 30,
    'General': 20
  };

  let baseCost = categoryRates[category] || 20;

  // Adjust for dimensions
  if (dimensions) {
    const volume = (dimensions.length || 12) * (dimensions.width || 12) * (dimensions.height || 12);
    const cubicFeet = volume / 1728; // Convert cubic inches to cubic feet
    
    if (cubicFeet > 5) baseCost += Math.floor(cubicFeet - 5) * 8;
    if (cubicFeet > 15) baseCost += Math.floor(cubicFeet - 15) * 5;
  }

  // Adjust for weight
  if (weight) {
    if (weight > 10) baseCost += Math.floor(weight - 10) * 2;
    if (weight > 50) baseCost += Math.floor(weight - 50) * 1;
  }

  // Add some randomness for realism in test mode
  if (TEST_MODE) {
    baseCost += Math.floor(Math.random() * 10) - 5;
  }

  return Math.max(10, Math.round(baseCost));
}

// Cleanup test orders periodically (every hour)
if (TEST_MODE) {
  setInterval(() => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleaned = 0;
    
    for (const [orderId, order] of testOrders.entries()) {
      if (new Date(order.createdAt) < oneHourAgo) {
        testOrders.delete(orderId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} old test orders`);
    }
  }, 60 * 60 * 1000); // Run every hour
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SDL Import Calculator Server running!`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
  console.log(`🧪 Test Mode: ${TEST_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`⚡ Ready to process import calculations!\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
