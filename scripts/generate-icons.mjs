#!/usr/bin/env node

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const sourceImage = path.join(projectRoot, 'public', 'logos', 'match_ops_local_logo.png');
const iconsDir = path.join(projectRoot, 'public', 'icons');

// Icon sizes we need to generate
const iconSizes = [
  { size: 192, name: 'icon-192x192.png' },
  { size: 512, name: 'icon-512x512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 32, name: 'favicon-32x32.png' },
  { size: 16, name: 'favicon-16x16.png' },
];

async function generateIcons() {
  try {
    // Ensure icons directory exists
    await fs.mkdir(iconsDir, { recursive: true });
    
    console.log('📸 Processing logo:', sourceImage);
    
    // Check if source file exists
    try {
      await fs.access(sourceImage);
    } catch (error) {
      throw new Error(`Source image not found: ${sourceImage}`);
    }
    
    // Get source image info
    const sourceInfo = await sharp(sourceImage).metadata();
    console.log(`📏 Source image: ${sourceInfo.width}x${sourceInfo.height}`);
    
    // Generate each required size
    for (const { size, name } of iconSizes) {
      const outputPath = path.join(iconsDir, name);
      
      await sharp(sourceImage)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
        })
        .png()
        .toFile(outputPath);
      
      console.log(`✅ Generated: ${name} (${size}x${size})`);
    }
    
    // Generate favicon.ico (multi-size ICO file)
    const faviconPath = path.join(projectRoot, 'public', 'favicon.ico');
    
    // Create a 32x32 version for favicon.ico
    await sharp(sourceImage)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(faviconPath);
    
    console.log('✅ Generated: favicon.ico');
    
    console.log('\n🎉 All icons generated successfully!');
    console.log('\nGenerated files:');
    console.log('📁 public/icons/');
    for (const { name } of iconSizes) {
      console.log(`   - ${name}`);
    }
    console.log('📁 public/');
    console.log('   - favicon.ico');
    
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();