// backend/tursoDatabase.js - Turso Cloud Database Integration
const { createClient } = require('@libsql/client');

class TursoDatabase {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.initializeClient();
  }

  async initializeClient() {
    try {
      const authToken = process.env.TURSO_AUTH_TOKEN;
      const databaseUrl = process.env.TURSO_DATABASE_URL;

      if (!authToken || !databaseUrl) {
        console.log('⚠️ Turso credentials not found, using JSON fallback');
        return;
      }

      
      this.client = createClient({
        url: databaseUrl,
        authToken: authToken,
      });

      // Test connection and create tables
      await this.initializeTables();
      this.enabled = true;
      console.log('✅ Turso database connected successfully');

    } catch (error) {
      console.log('⚠️ Turso connection failed, using JSON fallback:', error.message);
      this.enabled = false;
    }
  }

  async initializeTables() {
    if (!this.client) return;

    const tables = [
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        name TEXT,
        retailer TEXT,
        category TEXT,
        price REAL,
        weight REAL,
        length REAL,
        width REAL,
        height REAL,
        image TEXT,
        scrape_method TEXT,
        confidence REAL,
        times_seen INTEGER DEFAULT 1,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS category_patterns (
        category TEXT PRIMARY KEY,
        avg_weight REAL,
        avg_length REAL,
        avg_width REAL,
        avg_height REAL,
        min_weight REAL,
        max_weight REAL,
        min_price REAL,
        max_price REAL,
        sample_count INTEGER
      )`,
      
      `CREATE TABLE IF NOT EXISTS retailer_patterns (
        retailer TEXT PRIMARY KEY,
        success_rate REAL,
        best_method TEXT,
        total_attempts INTEGER,
        successful_scrapes INTEGER
      )`,
      
      `CREATE TABLE IF NOT EXISTS scraping_failures (
        id INTEGER PRIMARY KEY,
        url TEXT,
        retailer TEXT,
        missing_name INTEGER,
        missing_price INTEGER,
        missing_image INTEGER,
        missing_dimensions INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS api_performance (
        id INTEGER PRIMARY KEY,
        api_name TEXT,
        success_rate REAL,
        avg_response_time REAL,
        total_requests INTEGER,
        successful_requests INTEGER,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const table of tables) {
      await this.client.execute(table);
    }
  }

  isEnabled() {
    return this.enabled && this.client !== null;
  }

  async getKnownProduct(url) {
    if (!this.isEnabled()) return null;

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.client.execute({
        sql: `SELECT * FROM products WHERE url = ? AND last_updated > ? AND confidence > 0.7 ORDER BY times_seen DESC LIMIT 1`,
        args: [url, thirtyDaysAgo.toISOString()]
      });

      if (result.rows.length > 0) {
        const product = result.rows[0];
        
        // Update times_seen and confidence
        await this.client.execute({
          sql: `UPDATE products SET times_seen = times_seen + 1, confidence = MIN(1.0, confidence + 0.05) WHERE url = ?`,
          args: [url]
        });

        return {
          ...product,
          dimensions: {
            length: product.length,
            width: product.width,
            height: product.height
          }
        };
      }
      return null;
    } catch (error) {
      console.error('Turso getKnownProduct error:', error);
      return null;
    }
  }

  async saveProduct(product) {
    if (!this.isEnabled()) return;

    try {
      const { url, name, retailer, category, price, weight, dimensions, image, scrapingMethod } = product;
      
      let confidence = 0.3;
      if (name && name !== 'Unknown Product') confidence += 0.2;
      if (price) confidence += 0.2;
      if (dimensions && dimensions.length > 0) confidence += 0.2;
      if (weight) confidence += 0.1;

      await this.client.execute({
        sql: `INSERT OR REPLACE INTO products 
              (url, name, retailer, category, price, weight, length, width, height, image, scrape_method, confidence, times_seen, last_updated)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
                      COALESCE((SELECT times_seen + 1 FROM products WHERE url = ?), 1), 
                      CURRENT_TIMESTAMP)`,
        args: [
          url, name, retailer, category, price, weight,
          dimensions?.length || 0, dimensions?.width || 0, dimensions?.height || 0,
          image, scrapingMethod, confidence, url
        ]
      });

      // Update category patterns
      await this.updateCategoryPatterns(category, dimensions, weight, price);
      
      // Update retailer success
      await this.updateRetailerSuccess(retailer, scrapingMethod, confidence > 0.5);

    } catch (error) {
      console.error('Turso saveProduct error:', error);
    }
  }

  async updateCategoryPatterns(category, dimensions, weight, price) {
    if (!this.isEnabled() || !category) return;

    try {
      const existing = await this.client.execute({
        sql: `SELECT * FROM category_patterns WHERE category = ?`,
        args: [category]
      });

      if (existing.rows.length === 0) {
        await this.client.execute({
          sql: `INSERT INTO category_patterns 
                (category, avg_weight, avg_length, avg_width, avg_height, min_weight, max_weight, min_price, max_price, sample_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          args: [
            category,
            weight || 0,
            dimensions?.length || 0,
            dimensions?.width || 0,
            dimensions?.height || 0,
            weight || 0,
            weight || 999999,
            price || 0,
            price || 999999
          ]
        });
      } else {
        const pattern = existing.rows[0];
        const count = pattern.sample_count;
        const newCount = count + 1;

        await this.client.execute({
          sql: `UPDATE category_patterns SET
                avg_weight = ((avg_weight * ?) + ?) / ?,
                avg_length = ((avg_length * ?) + ?) / ?,
                avg_width = ((avg_width * ?) + ?) / ?,
                avg_height = ((avg_height * ?) + ?) / ?,
                min_weight = MIN(min_weight, ?),
                max_weight = MAX(max_weight, ?),
                min_price = MIN(min_price, ?),
                max_price = MAX(max_price, ?),
                sample_count = ?
                WHERE category = ?`,
          args: [
            count, weight || pattern.avg_weight, newCount,
            count, dimensions?.length || pattern.avg_length, newCount,
            count, dimensions?.width || pattern.avg_width, newCount,
            count, dimensions?.height || pattern.avg_height, newCount,
            weight || pattern.min_weight,
            weight || pattern.max_weight,
            price || pattern.min_price,
            price || pattern.max_price,
            newCount,
            category
          ]
        });
      }
    } catch (error) {
      console.error('Turso updateCategoryPatterns error:', error);
    }
  }

  async updateRetailerSuccess(retailer, method, wasSuccessful) {
    if (!this.isEnabled()) return;

    try {
      const existing = await this.client.execute({
        sql: `SELECT * FROM retailer_patterns WHERE retailer = ?`,
        args: [retailer]
      });

      if (existing.rows.length === 0) {
        await this.client.execute({
          sql: `INSERT INTO retailer_patterns (retailer, success_rate, best_method, total_attempts, successful_scrapes)
                VALUES (?, ?, ?, 1, ?)`,
          args: [retailer, wasSuccessful ? 100 : 0, method, wasSuccessful ? 1 : 0]
        });
      } else {
        const pattern = existing.rows[0];
        const newTotal = pattern.total_attempts + 1;
        const newSuccess = pattern.successful_scrapes + (wasSuccessful ? 1 : 0);
        const newRate = (newSuccess / newTotal) * 100;

        await this.client.execute({
          sql: `UPDATE retailer_patterns SET
                success_rate = ?,
                best_method = ?,
                total_attempts = ?,
                successful_scrapes = ?
                WHERE retailer = ?`,
          args: [newRate, wasSuccessful ? method : pattern.best_method, newTotal, newSuccess, retailer]
        });
      }
    } catch (error) {
      console.error('Turso updateRetailerSuccess error:', error);
    }
  }

  async getSmartEstimation(category, productName, retailer) {
    if (!this.isEnabled()) return null;

    try {
      // Get similar products
      const similarProducts = await this.client.execute({
        sql: `SELECT * FROM products WHERE category = ? AND retailer = ? AND confidence > 0.6 
              ORDER BY times_seen DESC LIMIT 10`,
        args: [category, retailer]
      });

      if (similarProducts.rows.length > 3) {
        const products = similarProducts.rows;
        const avgDimensions = {
          length: this.calculateSmartAverage(products.map(p => p.length)),
          width: this.calculateSmartAverage(products.map(p => p.width)),
          height: this.calculateSmartAverage(products.map(p => p.height))
        };
        const avgWeight = this.calculateSmartAverage(products.map(p => p.weight));

        return {
          dimensions: avgDimensions,
          weight: avgWeight,
          confidence: Math.min(0.9, 0.5 + (products.length * 0.05)),
          source: 'turso_similar_products'
        };
      }

      // Fall back to category patterns
      const pattern = await this.client.execute({
        sql: `SELECT * FROM category_patterns WHERE category = ? AND sample_count > 5`,
        args: [category]
      });

      if (pattern.rows.length > 0) {
        const p = pattern.rows[0];
        return {
          dimensions: {
            length: p.avg_length,
            width: p.avg_width,
            height: p.avg_height
          },
          weight: p.avg_weight,
          confidence: Math.min(0.7, 0.3 + (p.sample_count * 0.02)),
          source: 'turso_category_patterns'
        };
      }

      return null;
    } catch (error) {
      console.error('Turso getSmartEstimation error:', error);
      return null;
    }
  }

  calculateSmartAverage(numbers) {
    const filtered = numbers.filter(n => n && n > 0);
    if (filtered.length === 0) return 0;
    
    if (filtered.length > 5) {
      filtered.sort((a, b) => a - b);
      const cutoff = Math.floor(filtered.length * 0.2);
      const trimmed = filtered.slice(cutoff, -cutoff || undefined);
      return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    }
    
    return filtered.reduce((a, b) => a + b, 0) / filtered.length;
  }

  async recordScrapingResult(url, retailer, productData, scrapingMethod) {
    if (!this.isEnabled()) return;

    try {
      const missing = {
        name: !productData.name || productData.name === 'Unknown Product' || productData.name.includes('Product from'),
        price: !productData.price,
        image: !productData.image || productData.image.includes('placehold'),
        dimensions: !productData.dimensions
      };

      if (missing.name || missing.price || missing.image || missing.dimensions) {
        await this.client.execute({
          sql: `INSERT INTO scraping_failures (url, retailer, missing_name, missing_price, missing_image, missing_dimensions)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            url, retailer,
            missing.name ? 1 : 0,
            missing.price ? 1 : 0,
            missing.image ? 1 : 0,
            missing.dimensions ? 1 : 0
          ]
        });
      }
    } catch (error) {
      console.error('Turso recordScrapingResult error:', error);
    }
  }

  async updateAPIPerformance(apiName, wasSuccessful, responseTime) {
    if (!this.isEnabled()) return;

    try {
      const existing = await this.client.execute({
        sql: `SELECT * FROM api_performance WHERE api_name = ?`,
        args: [apiName]
      });

      if (existing.rows.length === 0) {
        await this.client.execute({
          sql: `INSERT INTO api_performance (api_name, success_rate, avg_response_time, total_requests, successful_requests)
                VALUES (?, ?, ?, 1, ?)`,
          args: [apiName, wasSuccessful ? 100 : 0, responseTime, wasSuccessful ? 1 : 0]
        });
      } else {
        const perf = existing.rows[0];
        const newTotal = perf.total_requests + 1;
        const newSuccess = perf.successful_requests + (wasSuccessful ? 1 : 0);
        const newRate = (newSuccess / newTotal) * 100;
        const newAvgTime = ((perf.avg_response_time * perf.total_requests) + responseTime) / newTotal;

        await this.client.execute({
          sql: `UPDATE api_performance SET
                success_rate = ?,
                avg_response_time = ?,
                total_requests = ?,
                successful_requests = ?,
                last_updated = CURRENT_TIMESTAMP
                WHERE api_name = ?`,
          args: [newRate, newAvgTime, newTotal, newSuccess, apiName]
        });
      }
    } catch (error) {
      console.error('Turso updateAPIPerformance error:', error);
    }
  }

  async getAPIPerformance() {
    if (!this.isEnabled()) return [];

    try {
      const result = await this.client.execute({
        sql: `SELECT * FROM api_performance ORDER BY success_rate DESC, avg_response_time ASC`
      });
      return result.rows;
    } catch (error) {
      console.error('Turso getAPIPerformance error:', error);
      return [];
    }
  }
}

module.exports = TursoDatabase;
