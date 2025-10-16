#!/usr/bin/env node

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const pwaIconSizes = [192, 512];
const faviconSizes = [16, 32];
const inputLogo = join(projectRoot, 'public/logos/app-logo-yellow.png');
const outputDir = join(projectRoot, 'public/icons');
const backgroundColor = '#4f46e5'; // indigo-600 - app theme color

async function generateIcons() {
  console.log('Generating PWA icons from app-logo-yellow.png with blue background...');

  // Generate PWA icons with padding to prevent overflow/zoom appearance
  for (const size of pwaIconSizes) {
    const outputPath = join(outputDir, `icon-${size}x${size}.png`);
    // Add 15% padding around the logo for better appearance on phone home screens
    const paddingPercent = 0.15;
    const logoSize = Math.round(size * (1 - paddingPercent * 2));
    const padding = Math.round((size - logoSize) / 2);

    try {
      // Create background
      const background = await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: backgroundColor
        }
      }).png().toBuffer();

      // Load and resize logo
      const logo = await sharp(inputLogo)
        .resize(logoSize, logoSize, {
          fit: 'inside',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();

      // Composite logo on background
      await sharp(background)
        .composite([{
          input: logo,
          top: padding,
          left: padding
        }])
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated ${size}x${size} icon (with ${paddingPercent * 100}% padding)`);
    } catch (error) {
      console.error(`✗ Failed to generate ${size}x${size} icon:`, error);
      throw error;
    }
  }

  // Generate favicons
  for (const size of faviconSizes) {
    const outputPath = join(outputDir, `favicon-${size}x${size}.png`);
    const padding = size === 16 ? 2 : 5;
    const logoSize = size - (padding * 2);

    try {
      // Create background
      const background = await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: backgroundColor
        }
      }).png().toBuffer();

      // Load and resize logo
      const logo = await sharp(inputLogo)
        .resize(logoSize, logoSize, {
          fit: 'inside',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .toBuffer();

      // Composite logo on background
      await sharp(background)
        .composite([{
          input: logo,
          top: padding,
          left: padding
        }])
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated ${size}x${size} favicon`);
    } catch (error) {
      console.error(`✗ Failed to generate ${size}x${size} favicon:`, error);
      throw error;
    }
  }

  // Also generate apple-touch-icon (180x180)
  const appleTouchIconPath = join(outputDir, 'apple-touch-icon.png');
  const appleIconSize = 180;
  const applePadding = 28;
  const appleLogoSize = appleIconSize - (applePadding * 2);

  try {
    // Create background
    const background = await sharp({
      create: {
        width: appleIconSize,
        height: appleIconSize,
        channels: 4,
        background: backgroundColor
      }
    }).png().toBuffer();

    // Load and resize logo
    const logo = await sharp(inputLogo)
      .resize(appleLogoSize, appleLogoSize, {
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();

    // Composite logo on background
    await sharp(background)
      .composite([{
        input: logo,
        top: applePadding,
        left: applePadding
      }])
      .png()
      .toFile(appleTouchIconPath);

    console.log('✓ Generated apple-touch-icon.png');
  } catch (error) {
    console.error('✗ Failed to generate apple-touch-icon.png:', error);
    throw error;
  }

  console.log('\nPWA icons with yellow logo on blue background generated successfully!');
}

generateIcons().catch(error => {
  console.error('Icon generation failed:', error);
  process.exit(1);
});
