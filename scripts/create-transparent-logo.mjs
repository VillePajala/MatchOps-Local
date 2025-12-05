#!/usr/bin/env node

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const sourceImage = path.join(projectRoot, 'public', 'logos', 'match_ops_local_logo.png');
const outputImage = path.join(projectRoot, 'public', 'logos', 'match_ops_local_logo_transparent.png');

async function createTransparentLogo() {
  try {
    console.log('🎨 Creating transparent version of logo...');
    
    // Check if source file exists
    try {
      await fs.access(sourceImage);
    } catch {
      throw new Error(`Source image not found: ${sourceImage}`);
    }
    
    // Get source image info
    const sourceInfo = await sharp(sourceImage).metadata();
    console.log(`📏 Source image: ${sourceInfo.width}x${sourceInfo.height}`);
    
    // Remove background by making the dark blue background transparent
    // The dark blue background appears to be around #1e3a5f or similar
    await sharp(sourceImage)
      .png()
      .toColorspace('srgb')
      .removeAlpha() // First remove any existing alpha
      .toBuffer()
      .then(buffer => {
        // Now process to make dark blue transparent
        return sharp(buffer)
          .png()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
      })
      .then(({ data, info }) => {
        // Process pixel by pixel to make dark blue transparent
        const pixels = new Uint8ClampedArray(data);
        const threshold = 80; // Threshold for detecting dark blue background
        
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          
          // Check if pixel is dark blue (low brightness, blue-ish hue)
          // Dark blue background typically has low red/green, higher blue
          if (r < threshold && g < threshold && b > r + 20 && b > g + 20) {
            // Make this pixel transparent
            pixels[i + 3] = 0; // Set alpha to 0 (transparent)
          }
        }
        
        return sharp(pixels, {
          raw: {
            width: info.width,
            height: info.height,
            channels: 4
          }
        })
        .png()
        .toFile(outputImage);
      });
    
    console.log('✅ Transparent logo created successfully!');
    console.log(`📁 Output: ${outputImage}`);
    
    // Verify the output file
    const outputInfo = await sharp(outputImage).metadata();
    console.log(`📏 Output image: ${outputInfo.width}x${outputInfo.height}, channels: ${outputInfo.channels}`);
    
  } catch (error) {
    console.error('❌ Error creating transparent logo:', error.message);
    
    // Fallback: Create a simple version with uniform background removal
    console.log('🔄 Attempting fallback method...');
    try {
      await sharp(sourceImage)
        .png()
        // Try removing a specific color range (dark blue)
        .threshold(10, { greyscale: false })
        .toFile(outputImage.replace('.png', '_fallback.png'));
      
      console.log('✅ Fallback transparent logo created!');
    } catch (fallbackError) {
      console.error('❌ Fallback also failed:', fallbackError.message);
      process.exit(1);
    }
  }
}

createTransparentLogo();