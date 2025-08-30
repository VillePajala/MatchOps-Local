#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Flatten a nested JSON object into dot-notation keys
 * @param {Object} obj - JSON object to flatten
 * @param {string} prefix - Current prefix for nested keys
 * @returns {Object} Flattened object with dot-notation keys
 */
function flattenJson(obj, prefix = '') {
  const result = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenJson(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

/**
 * Unflatten a dot-notation object back to nested structure
 * @param {Object} flatObj - Flattened object with dot-notation keys
 * @returns {Object} Nested object structure
 */
function unflattenJson(flatObj) {
  const result = {};
  
  for (const [key, value] of Object.entries(flatObj)) {
    const keys = key.split('.');
    let current = result;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }
  
  return result;
}

/**
 * Find and remove duplicate keys, keeping the first occurrence
 * @param {Object} flatObj - Flattened object
 * @returns {Object} Object with duplicates removed and report
 */
function removeDuplicates(flatObj) {
  const seen = new Set();
  const cleaned = {};
  const duplicates = [];
  
  for (const [key, value] of Object.entries(flatObj)) {
    if (seen.has(key)) {
      duplicates.push({ key, value });
      console.log(`Removing duplicate key: ${key} = "${value}"`);
    } else {
      seen.add(key);
      cleaned[key] = value;
    }
  }
  
  return { cleaned, duplicates };
}

/**
 * Process a locale file to remove duplicates
 * @param {string} filePath - Path to the JSON locale file
 * @returns {Object} Processing results
 */
function processLocaleFile(filePath) {
  try {
    console.log(`\nProcessing: ${filePath}`);
    
    const content = fs.readFileSync(filePath, 'utf8');
    const jsonData = JSON.parse(content);
    
    // Flatten the JSON
    const flattened = flattenJson(jsonData);
    
    console.log(`Total keys found: ${Object.keys(flattened).length}`);
    
    // Remove duplicates
    const { cleaned, duplicates } = removeDuplicates(flattened);
    
    console.log(`Unique keys after deduplication: ${Object.keys(cleaned).length}`);
    console.log(`Duplicates removed: ${duplicates.length}`);
    
    // Reconstruct nested structure
    const reconstructed = unflattenJson(cleaned);
    
    // Write back to file with proper formatting
    const newContent = JSON.stringify(reconstructed, null, 2);
    fs.writeFileSync(filePath, newContent + '\\n');
    
    return {
      originalCount: Object.keys(flattened).length,
      uniqueCount: Object.keys(cleaned).length,
      duplicatesCount: duplicates.length,
      duplicates
    };
    
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return null;
  }
}

// Main execution
function main() {
  const localesDir = path.join(__dirname, '..', 'public', 'locales');
  const results = {};
  
  console.log('🧹 De-duplicating i18n keys...');
  
  // Process EN locale
  const enPath = path.join(localesDir, 'en', 'common.json');
  if (fs.existsSync(enPath)) {
    results.en = processLocaleFile(enPath);
  }
  
  // Process FI locale  
  const fiPath = path.join(localesDir, 'fi', 'common.json');
  if (fs.existsSync(fiPath)) {
    results.fi = processLocaleFile(fiPath);
  }
  
  console.log('\\n📊 Summary:');
  for (const [locale, result] of Object.entries(results)) {
    if (result) {
      console.log(`${locale.toUpperCase()}: ${result.originalCount} → ${result.uniqueCount} keys (${result.duplicatesCount} duplicates removed)`);
    }
  }
  
  console.log('\\n✅ De-duplication complete! Run `npm run generate:i18n-types` to regenerate types.');
}

if (require.main === module) {
  main();
}