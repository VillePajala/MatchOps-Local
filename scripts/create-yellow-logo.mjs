import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Paths
const inputPath = join(projectRoot, 'public/logos/app-logo.png');
const outputPath = join(projectRoot, 'public/logos/app-logo-yellow.png');

// Helper function to convert RGB to HSL
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [h * 360, s * 100, l * 100];
}

// Helper function to convert HSL to RGB
function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Check if red color (hue 0-20 or 340-360, with decent saturation)
function isRedColor(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);

  // Red hue range: 0-20 or 340-360
  // Must have saturation > 30% and lightness > 15% (not too dark/gray)
  return (
    ((h >= 0 && h <= 25) || (h >= 335 && h <= 360)) &&
    s > 30 &&
    l > 15 &&
    l < 85 // Not too bright (not white)
  );
}

// Convert red to yellow while preserving saturation and lightness
function redToYellow(r, g, b) {
  const [, s, l] = rgbToHsl(r, g, b);

  // Yellow hue is around 50 degrees (yellow-400: #FBBF24)
  const yellowHue = 48;

  // Convert back to RGB with yellow hue
  return hslToRgb(yellowHue, s, l);
}

async function createYellowLogo() {
  try {
    console.log('🎨 Creating yellow version of logo...');
    console.log(`📂 Input: ${inputPath}`);
    console.log(`📂 Output: ${outputPath}`);

    // Load the image
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    console.log(`📐 Image size: ${metadata.width}x${metadata.height}`);

    // Get raw pixel data
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log('🔄 Processing pixels...');

    // Process each pixel
    let redPixelsReplaced = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Only process non-transparent pixels
      if (a > 0 && isRedColor(r, g, b)) {
        const [newR, newG, newB] = redToYellow(r, g, b);
        data[i] = newR;
        data[i + 1] = newG;
        data[i + 2] = newB;
        redPixelsReplaced++;
      }
    }

    console.log(`✨ Replaced ${redPixelsReplaced.toLocaleString()} red pixels with yellow`);

    // Create new image from modified data
    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
    .png()
    .toFile(outputPath);

    // Get file sizes
    const inputStats = fs.statSync(inputPath);
    const outputStats = fs.statSync(outputPath);

    console.log(`\n✅ Yellow logo created successfully!`);
    console.log(`📊 Original: ${(inputStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📊 Yellow: ${(outputStats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📍 Saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error creating yellow logo:', error);
    throw error;
  }
}

// Run the script
createYellowLogo();
