#!/usr/bin/env node

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const sourceImage = path.join(projectRoot, 'public', 'logos', 'match_ops_local_logo.png');
const faviconPath = path.join(projectRoot, 'public', 'favicon.ico');

async function createFavicon() {
  try {
    console.log('🔧 Creating proper favicon.ico...');
    
    // Create a proper ICO file by generating a 32x32 PNG and saving as .ico
    await sharp(sourceImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(faviconPath);
    
    console.log('✅ favicon.ico created successfully');
    
    // Also create a backup PNG version
    const faviconPngPath = path.join(projectRoot, 'public', 'favicon.png');
    await sharp(sourceImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(faviconPngPath);
    
    console.log('✅ favicon.png created as backup');
    
  } catch (error) {
    console.error('❌ Error creating favicon:', error.message);
    process.exit(1);
  }
}

createFavicon();