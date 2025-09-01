// learningSystem.js - AI Learning System for SDL Import Calculator
let Database;

try {
  const { createClient } = require('@libsql/client');
  Database = createClient;
  console.log('✅ Turso database client loaded');
} catch (error) {
  console.log('⚠️ Turso database not available - Learning system will use memory storage');
  Database = null;
}

class LearningSystem {
  constructor() {
    this.db = null;
    this.memoryStorage = {
      products: new Map(),
      scrapingResults: [],
      insights: {
        totalProducts: 0,
        totalScrapes: 0,
        successRate: 0,
        topRetailers: [],
        lastUpdated: new Date()
      }
    };

    this.initializeDatabase();
  }

  async initializeDatabase() {
    if (!Database) {
      console.log('📝 Learning system: Using memory storage');
      return;
    }

    try {
      const dbUrl = process.env.TURSO_DATABASE_URL;
      const authToken = process.env.TURSO_AUTH_TOKEN;

      if (!dbUrl || !authToken) {
        console.log('⚠️ Turso credentials not found - Using memory storage');
        return;
      }

      this.db = Database({
        url: dbUrl,
        authToken: authToken
      });

      await this.createTables();
      console.log('✅ Learning system: Database connected');

    } catch (error) {
      console.error('❌ Learning system: Database connection failed:', error.message);
      console.log('📝 Learning system: Falling back to memory storage');
    }
  }

  async createTables() {
    if (!this.db) return;

    try {
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT UNIQUE NOT NULL,
          name TEXT,
          retailer TEXT,
          category TEXT,
          price REAL,
          weight REAL,
          dimensions TEXT,
          image TEXT,
          scraping_method TEXT,
          confidence REAL DEFAULT 0.8,
          confirmed BOOLEAN DEFAULT FALSE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS scraping_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL,
          retailer TEXT,
          method TEXT,
          success BOOLEAN,
          price_found BOOLEAN,
          execution_time INTEGER,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ Learning system: Database tables ready');

    } catch (error) {
      console.error('❌ Learning system: Table creation failed:', error.message);
    }
  }

  async getKnownProduct(url) {
    if (this.db) {
      try {
        const result = await this.db.execute({
          sql: 'SELECT * FROM products WHERE url = ? ORDER BY updated_at DESC LIMIT 1',
          args: [url]
        });

        if (result.rows.length > 0) {
          const row = result.rows[0];
          return {
            name: row.name,
            price: row.price,
            retailer: row.retailer,
            category: row.category,
            weight: row.weight,
            dimensions: row.dimensions ? JSON.parse(row.dimensions) : null,
            image: row.image,
            confidence: row.confidence,
            inStock: true
          };
        }
      } catch (error) {
        console.error('❌ Learning system: Database query failed:', error.message);
      }
    }

    return this.memoryStorage.products.get(url) || null;
  }

  async saveProduct(productData) {
    const {
      url,
      name,
      retailer,
      category,
      price,
      weight,
      dimensions,
      image,
      scrapingMethod,
      confirmed = false
    } = productData;

    if (this.db) {
      try {
        await this.db.execute({
          sql: `
            INSERT OR REPLACE INTO products 
            (url, name, retailer, category, price, weight, dimensions, image, scraping_method, confirmed, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
          args: [
            url,
            name,
            retailer,
            category,
            price,
            weight,
            dimensions ? JSON.stringify(dimensions) : null,
            image,
            scrapingMethod,
            confirmed
          ]
        });

        console.log('💾 Learning system: Product saved to database');
        return true;

      } catch (error) {
        console.error('❌ Learning system: Database save failed:', error.message);
      }
    }

    this.memoryStorage.products.set(url, {
      name,
      retailer,
      category,
      price,
      weight,
      dimensions,
      image,
      scrapingMethod,
      confidence: confirmed ? 1.0 : 0.8,
      savedAt: new Date()
    });

    this.memoryStorage.insights.totalProducts = this.memoryStorage.products.size;
    console.log('💾 Learning system: Product saved to memory');
    return true;
  }

  async recordScrapingResult(url, retailer, result, method) {
    const success = !!(result && result.name);
    const priceFound = !!(result && result.price);

    if (this.db) {
      try {
        await this.db.execute({
          sql: `
            INSERT INTO scraping_results 
            (url, retailer, method, success, price_found, execution_time)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          args: [url, retailer, method, success, priceFound, Date.now()]
        });
      } catch (error) {
        console.error('❌ Learning system: Failed to record scraping result:', error.message);
      }
    }

    this.memoryStorage.scrapingResults.push({
      url,
      retailer,
      method,
      success,
      priceFound,
      timestamp: new Date()
    });

    if (this.memoryStorage.scrapingResults.length > 1000) {
      this.memoryStorage.scrapingResults = this.memoryStorage.scrapingResults.slice(-1000);
    }

    this.updateInsights();
    return true;
  }

  updateInsights() {
    this.memoryStorage.insights.totalScrapes = this.memoryStorage.scrapingResults.length;
    
    const successfulScrapes = this.memoryStorage.scrapingResults.filter(r => r.success).length;
    this.memoryStorage.insights.successRate = this.memoryStorage.scrapingResults.length > 0 
      ? (successfulScrapes / this.memoryStorage.scrapingResults.length * 100).toFixed(1)
      : 0;

    const retailerCounts = {};
    this.memoryStorage.scrapingResults.forEach(r => {
      retailerCounts[r.retailer] = (retailerCounts[r.retailer] || 0) + 1;
    });

    this.memoryStorage.insights.topRetailers = Object.entries(retailerCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([retailer, count]) => ({ retailer, count }));

    this.memoryStorage.insights.lastUpdated = new Date();
  }

  async getSmartEstimation(category, productName, retailer) {
    console.log(`🤖 Learning system: Getting smart estimation for ${category} from ${retailer}`);
    return null;
  }

  async getInsights() {
    let insights = { ...this.memoryStorage.insights };

    if (this.db) {
      try {
        const productCount = await this.db.execute('SELECT COUNT(*) as count FROM products');
        if (productCount.rows.length > 0) {
          insights.totalProducts = productCount.rows[0].count;
        }

        const scrapeCount = await this.db.execute('SELECT COUNT(*) as count FROM scraping_results');
        if (scrapeCount.rows.length > 0) {
          insights.totalScrapes = scrapeCount.rows[0].count;
        }

        const successCount = await this.db.execute('SELECT COUNT(*) as count FROM scraping_results WHERE success = 1');
        if (successCount.rows.length > 0 && insights.totalScrapes > 0) {
          insights.successRate = ((successCount.rows[0].count / insights.totalScrapes) * 100).toFixed(1);
        }

        console.log('📊 Learning system: Retrieved insights from database');

      } catch (error) {
        console.error('❌ Learning system: Failed to get database insights:', error.message);
      }
    }

    return insights;
  }
}

const learningSystem = new LearningSystem();
module.exports = learningSystem;
