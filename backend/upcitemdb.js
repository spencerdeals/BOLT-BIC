// upcitemdb.js - UPC Item Database Integration
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
          match_mode: '0',
          type: 'product'
        },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.items && response.data.items.length > 0) {
        const item = response.data.items[0];
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

  extractDimensions(item) {
    if (item.dimension) {
      const match = item.dimension.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/i);
      if (match) {
        return {
          length: parseFloat(match[1]),
          width: parseFloat(match[2]),
          height: parseFloat(match[3])
        };
      }
    }
    
    if (item.length && item.width && item.height) {
      return {
        length: parseFloat(item.length),
        width: parseFloat(item.width),
        height: parseFloat(item.height)
      };
    }
    
    return null;
  }

  extractWeight(item) {
    if (item.weight) {
      if (typeof item.weight === 'number') {
        return item.weight;
      }
      
      const match = item.weight.match(/(\d+\.?\d*)\s*(lb|pound|kg|g|oz)?/i);
      if (match) {
        const value = parseFloat(match[1]);
        const unit = (match[2] || 'lb').toLowerCase();
        
        switch(unit) {
          case 'kg': 
            return value * 2.205;
          case 'g': 
            return value * 0.00220462;
          case 'oz': 
            return value * 0.0625;
          default: 
            return value;
        }
      }
    }
    
    return null;
  }
}

module.exports = UPCItemDB;
