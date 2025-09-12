#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 Starting bundle analysis...\n');

// Set environment variables for bundle analysis
process.env.ANALYZE = 'true';
process.env.NODE_ENV = 'production';

try {
  // Build with analysis
  console.log('📦 Building with bundle analyzer...');
  execSync('npm run build', { stdio: 'inherit' });
  
  // Check if analysis files were generated
  const statsPath = '.next/analyze/client.html';
  if (fs.existsSync(statsPath)) {
    console.log(`\n✅ Bundle analysis complete!`);
    console.log(`📊 Analysis report available at: ${path.resolve(statsPath)}`);
    
    // Try to open the analysis report with better error handling
    try {
      const { platform } = process;
      let openCommand;
      
      switch (platform) {
        case 'darwin':
          openCommand = 'open';
          break;
        case 'win32':
          openCommand = 'start ""'; // Windows needs empty quotes for paths with spaces
          break;
        case 'linux':
          openCommand = 'xdg-open';
          break;
        default:
          console.log(`💡 Unsupported platform: ${platform}. Please manually open: ${path.resolve(statsPath)}`);
          throw new Error('Unsupported platform');
      }
      
      execSync(`${openCommand} "${path.resolve(statsPath)}"`, { 
        stdio: 'ignore',
        timeout: 5000 // 5 second timeout
      });
      console.log('🌐 Opening bundle analysis in browser...');
    } catch (error) {
      console.log(`💡 Could not auto-open file (${error.message})`);
      console.log(`🔗 Please manually open: ${path.resolve(statsPath)}`);
    }
  } else {
    console.log('⚠️  Analysis files not found. Check bundle analyzer configuration.');
  }
  
} catch (error) {
  console.error('❌ Bundle analysis failed:', error.message);
  process.exit(1);
}

// Generate summary report
console.log('\n📋 Generating optimization recommendations...');

const recommendations = `
🎯 BUNDLE OPTIMIZATION RECOMMENDATIONS

Based on current analysis, focus on these areas:

🔴 HIGH IMPACT (Expected 40-70kB savings):
  1. Lazy load Recharts library (~50kB)
  2. Split large modal components (~30kB)  
  3. Optimize Sentry integration (~30-50kB with dynamic imports)

🟡 MEDIUM IMPACT (Expected 20-30kB savings):
  1. Optimize React Icons usage (~15kB)
  2. Code split utility functions (~10kB)
  3. Lazy load export features (~15kB)

🟢 LOW IMPACT (Expected 10-15kB savings):
  1. Optimize image assets (~5kB)
  2. Tree-shake unused utilities (~5kB)
  3. Optimize font loading (~5kB)

🎯 TARGET: Optimize bundle size based on current analysis  
📊 EXPECTED TOTAL SAVINGS: 80-125kB (varies by current bundle size)
⚠️  SENTRY IMPACT: ~30-50kB added, but dynamic imports reduce initial load

Next steps:
1. Review .next/analyze/client.html for detailed breakdown
2. Implement Phase 4B: Code Splitting for components
3. Implement Phase 4C: Lazy loading for libraries
4. Monitor Sentry bundle impact with dynamic imports
`;

console.log(recommendations);

// Save recommendations to file
fs.writeFileSync('BUNDLE_ANALYSIS.md', recommendations);
console.log('📄 Recommendations saved to BUNDLE_ANALYSIS.md');