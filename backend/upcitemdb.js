// backend/upcitemdb.js - UPC Item Database Integration for Product Lookup
const axios = require('axios');

class UPCItemDB {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.upcitemdb.com/prod/trial';
    this.enabled = !!apiKey;
    
    if (this.enabled) {
      console.log('✅ UPCitemdb initialized');
    } else {
      console.log('⚠️ UPCitemdb disabled - no API key provided');
    }
  }

  
  isAvailable() {
    return this.enabled;
  }

  async searchByName(productName) {
    if (!this.enabled) return null;
    
    try {
      console.log(`🔍 UPCitemdb: Searching for "${productName.substring(0, 50)}..."`);
      
      const response = await axios.get(`${this.baseURL}/search`, {
        params: {
          s: productName,
          match_mode: '0', // Best match
          type: 'product'
        },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.items && response.data.items.length > 0) {
        const item = response.data.items[0]; // Get best match
        console.log(`✅ UPCitemdb found: ${item.title || 'Unknown'}`);
        
        return {
          name: item.title,
          brand: item.brand,
          upc: item.upc,
          dimensions: this.extractDimensions(item),
          weight: this.extractWeight(item),
          image: item.images?.[0],
          description: item.description,
          category: item.category
        };
      }
      
      console.log('❌ UPCitemdb: No results found');
      return null;
      
    } catch (error) {
      console.error('❌ UPCitemdb search failed:', error.message);
      return null;
    }
  }

  async searchByUPC(upc) {
    if (!this.enabled) return null;
    
    try {
      console.log(`🔍 UPCitemdb: Looking up UPC ${upc}`);
      
      const response = await axios.get(`${this.baseURL}/lookup`, {
        params: {
          upc: upc
        },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.items && response.data.items.length > 0) {
        const item = response.data.items[0];
        console.log(`✅ UPCitemdb found by UPC: ${item.title || 'Unknown'}`);
        
        return {
          name: item.title,
          brand: item.brand,
          upc: item.upc,
          dimensions: this.extractDimensions(item),
          weight: this.extractWeight(item),
          image: item.images?.[0],
          description: item.description,
          category: item.category
        };
      }
      
      console.log('❌ UPCitemdb: No UPC results found');
      return null;
      
    } catch (error) {
      console.error('❌ UPCitemdb UPC lookup failed:', error.message);
      return null;
    }
  }

  extractDimensions(item) {
    // Check if item has dimension field
    if (item.dimension) {
      // Parse dimension string like "10 x 8 x 2 inches"
      const match = item.dimension.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/i);
      if (match) {
        return {
          length: parseFloat(match[1]),
          width: parseFloat(match[2]),
          height: parseFloat(match[3])
        };
      }
    }
    
    // Check individual dimension fields
    if (item.length && item.width && item.height) {
      return {
        length: parseFloat(item.length),
        width: parseFloat(item.width),
        height: parseFloat(item.height)
      };
    }
    
    // Check for size field
    if (item.size) {
      const sizeMatch = item.size.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/i);
      if (sizeMatch) {
        return {
          length: parseFloat(sizeMatch[1]),
          width: parseFloat(sizeMatch[2]),
          height: parseFloat(sizeMatch[3])
        };
      }
    }
    
    return null;
  }

  extractWeight(item) {
    if (item.weight) {
      // If it's already a number
      if (typeof item.weight === 'number') {
        return item.weight;
      }
      
      // Parse weight string
      const match = item.weight.match(/(\d+\.?\d*)\s*(lb|pound|kg|g|oz)?/i);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = (match[2] || 'lb').toLowerCase();
        
        // Convert to pounds
        switch(unit) {
          case 'kg': 
          case 'kilogram':
          case 'kilograms':
            return value * 2.205;
          case 'g': 
          case 'gram':
          case 'grams':
            return value * 0.00220462;
          case 'oz': 
          case 'ounce':
          case 'ounces':
            return value * 0.0625;
          default: 
            return value; // assume pounds
        }
      }
    }
    
    // Check for shipping weight
    if (item.shipping_weight) {
      return this.parseWeight(item.shipping_weight);
    }
    
    return null;
  }

  parseWeight(weightStr) {
    if (typeof weightStr === 'number') return weightStr;
    if (typeof weightStr !== 'string') return null;

    const patterns = [
      { regex: /(\d+\.?\d*)\s*(?:pounds?|lbs?)/i, multiplier: 1 },
      { regex: /(\d+\.?\d*)\s*(?:kilograms?|kgs?)/i, multiplier: 2.205 },
      { regex: /(\d+\.?\d*)\s*(?:grams?|g)\b/i, multiplier: 0.00220462 },
      { regex: /(\d+\.?\d*)\s*(?:ounces?|oz)/i, multiplier: 0.0625 }
    ];

    for (const { regex, multiplier } of patterns) {
      const match = weightStr.match(regex);
      if (match) {
        const weight = parseFloat(match[1]) * multiplier;
        if (weight > 0 && weight < 1000) {
          return Math.round(weight * 10) / 10;
        }
      }
    }

    return null;
  }

  // Enhanced search that tries multiple approaches
  async enhancedSearch(productName, upc = null) {
    if (!this.enabled) return null;

    try {
      let result = null;

      // Try UPC lookup first if available
      if (upc) {
        result = await this.searchByUPC(upc);
        if (result) return result;
      }

      // Try name search
      result = await this.searchByName(productName);
      if (result) return result;

      // Try simplified name search (remove brand names, etc.)
      const simplifiedName = this.simplifyProductName(productName);
      if (simplifiedName !== productName) {
        result = await this.searchByName(simplifiedName);
        if (result) return result;
      }

      return null;

    } catch (error) {
      console.error('❌ Enhanced search failed:', error.message);
      return null;
    }
  }

  simplifyProductName(name) {
    if (!name) return '';

    // Remove common brand indicators and extra words
    let simplified = name
      .replace(/\b(by|from|brand|inc|corp|ltd|llc)\b/gi, '')
      .replace(/\b(amazon|wayfair|target|walmart|best buy|home depot)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Take first 5 words max
    const words = simplified.split(' ');
    if (words.length > 5) {
      simplified = words.slice(0, 5).join(' ');
    }

    return simplified;
  }

  // Get API usage stats
  async getUsageStats() {
    if (!this.enabled) return null;

    try {
      const response = await axios.get(`${this.baseURL}/usage`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      console.error('❌ Failed to get UPCitemdb usage stats:', error.message);
      return null;
    }
  }
}

module.exports = UPCItemDB;
