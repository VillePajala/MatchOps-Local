#!/usr/bin/env node

import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const outputPath = path.join(projectRoot, 'public', 'logos', 'match_ops_local_logo_white.png');

async function generateWhiteLogo() {
  try {
    // Create an SVG with white text
    const svgText = `
      <svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
        <style>
          .title {
            fill: white;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: bold;
            font-size: 72px;
          }
        </style>
        <text x="300" y="120" text-anchor="middle" class="title">Match</text>
        <text x="300" y="210" text-anchor="middle" class="title">Ops</text>
        <text x="300" y="300" text-anchor="middle" class="title">Local</text>
      </svg>
    `;

    // Convert SVG to PNG with transparency
    await sharp(Buffer.from(svgText))
      .png()
      .toFile(outputPath);

    console.log('✅ Generated white logo:', outputPath);

  } catch (error) {
    console.error('❌ Error generating white logo:', error.message);
    process.exit(1);
  }
}

generateWhiteLogo();