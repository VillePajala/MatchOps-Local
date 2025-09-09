#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Security audit script for MatchOps
 * Checks for secret exposure, environment misconfigurations, and security best practices
 */

console.log('🔒 Running security audit...\n');

// Configuration
const SECURITY_REPORT_FILE = 'security-audit-report.json';

/**
 * Check for hardcoded secrets in codebase
 */
function scanForHardcodedSecrets() {
  console.log('🔍 Scanning for hardcoded secrets...');
  
  const secretPatterns = [
    { name: 'OpenAI API Keys', pattern: /sk-[a-zA-Z0-9-_]{20,}/ },
    { name: 'Generic API Keys', pattern: /api[_-]?key[\s]*[:=][\s]*['"][a-zA-Z0-9]{16,}['"]/ },
    { name: 'AWS Access Keys', pattern: /AKIA[0-9A-Z]{16}/ },
    { name: 'GitHub Tokens', pattern: /gh[psr]_[a-zA-Z0-9]{36}/ },
    { name: 'Slack Tokens', pattern: /xox[bpars]-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+/ },
    { name: 'Stripe Keys', pattern: /sk_live_[a-zA-Z0-9]{24}/ },
    { name: 'Database URLs', pattern: /(mongodb|mysql|postgres):\/\/[^\s]*/ },
    { name: 'JWT Secrets', pattern: /jwt[_-]?secret[\s]*[:=][\s]*['"][^'"]{16,}['"]/ },
    { name: 'Private Keys', pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/ },
  ];

  const results = [];
  const filesToCheck = [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'src/**/*.jsx',
    '*.js',
    '*.ts',
    '*.json',
    '!node_modules/**',
    '!.next/**',
    '!coverage/**',
  ];

  for (const pattern of secretPatterns) {
    try {
      // Use grep to search for patterns
      const grepCommand = `grep -r -n -E "${pattern.pattern.source}" ${filesToCheck.join(' ')} 2>/dev/null || true`;
      const output = execSync(grepCommand, { encoding: 'utf8' });
      
      if (output.trim()) {
        results.push({
          type: pattern.name,
          findings: output.trim().split('\n').map(line => {
            const [file, lineNum, content] = line.split(':', 3);
            return {
              file: file?.trim(),
              line: parseInt(lineNum),
              content: content?.trim().substring(0, 100) + (content?.length > 100 ? '...' : ''),
            };
          }),
        });
      }
    } catch (error) {
      // Grep returns non-zero exit code when no matches found, which is expected
      if (!error.message.includes('Command failed')) {
        console.warn(`Warning: Could not scan for ${pattern.name}:`, error.message);
      }
    }
  }

  return results;
}

/**
 * Check environment variable security
 */
function auditEnvironmentVariables() {
  console.log('🔍 Auditing environment variable security...');
  
  const issues = [];
  
  // Check for common secret patterns in environment variable names
  const envKeys = Object.keys(process.env);
  
  for (const key of envKeys) {
    const value = process.env[key];
    if (!value) continue;
    
    // Check for potentially exposed secrets
    if (key.startsWith('NEXT_PUBLIC_')) {
      // Check for secret patterns in public environment variables
      const secretPatterns = [
        { pattern: /sk-[a-zA-Z0-9-_]{20,}/, name: 'OpenAI API Key' },
        { pattern: /^[a-f0-9]{32,64}$/, name: 'Long Hash/Token' },
        { pattern: /xoxb-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+/, name: 'Slack Bot Token' },
        { pattern: /gh[psr]_[a-zA-Z0-9]{36}/, name: 'GitHub Token' },
        { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
        { pattern: /AIza[0-9A-Za-z\\-_]{35}/, name: 'Google API Key' },
      ];
      
      for (const { pattern, name } of secretPatterns) {
        if (pattern.test(value)) {
          issues.push({
            severity: 'CRITICAL',
            type: 'SECRET_EXPOSED',
            message: `Potential ${name} exposed in client-side environment variable: ${key}`,
            variable: key,
            recommendation: `Move ${key} to server-side only (remove NEXT_PUBLIC_ prefix)`,
          });
        }
      }
      
      // Check for suspiciously long values
      if (value.length > 50 && !/^https?:\/\//.test(value) && !key.includes('DSN')) {
        issues.push({
          severity: 'WARNING',
          type: 'SUSPICIOUS_LENGTH',
          message: `Suspiciously long value in client-exposed variable: ${key} (${value.length} chars)`,
          variable: key,
          recommendation: 'Verify this is not a secret that should be server-side only',
        });
      }
    }
    
    // Check for common secret variable names that should be server-side only
    const serverOnlyPatterns = [
      /.*_SECRET$/,
      /.*_TOKEN$/,
      /.*_KEY$/,
      /.*_PASSWORD$/,
      /.*_AUTH$/,
    ];
    
    for (const pattern of serverOnlyPatterns) {
      if (pattern.test(key) && key.startsWith('NEXT_PUBLIC_')) {
        issues.push({
          severity: 'CRITICAL',
          type: 'SECRET_MISCONFIGURATION',
          message: `Secret variable ${key} incorrectly exposed to client`,
          variable: key,
          recommendation: `Remove NEXT_PUBLIC_ prefix to make ${key} server-side only`,
        });
      }
    }
  }
  
  return issues;
}

/**
 * Check build output for secret exposure
 */
function auditBuildOutput() {
  console.log('🔍 Auditing build output for secret exposure...');
  
  const issues = [];
  const buildPath = '.next';
  
  if (!fs.existsSync(buildPath)) {
    return [{
      severity: 'INFO',
      type: 'BUILD_NOT_FOUND',
      message: 'Build output not found - run npm run build first for complete audit',
      recommendation: 'Run npm run build before security audit',
    }];
  }
  
  try {
    // Check for environment variables in client bundles
    const clientBundlePath = path.join(buildPath, 'static');
    if (fs.existsSync(clientBundlePath)) {
      // Search for potential secrets in client bundles
      const searchCommand = `find ${clientBundlePath} -name "*.js" -type f -exec grep -l "sk-\\|AKIA\\|xoxb-\\|ghp_" {} \\; 2>/dev/null || true`;
      const suspiciousFiles = execSync(searchCommand, { encoding: 'utf8' }).trim();
      
      if (suspiciousFiles) {
        suspiciousFiles.split('\n').filter(Boolean).forEach(file => {
          issues.push({
            severity: 'CRITICAL',
            type: 'SECRET_IN_BUNDLE',
            message: `Potential secret found in client bundle: ${file}`,
            file: file,
            recommendation: 'Remove secrets from client-side code and use server-side APIs',
          });
        });
      }
    }
  } catch (error) {
    issues.push({
      severity: 'WARNING',
      type: 'AUDIT_ERROR',
      message: `Could not audit build output: ${error.message}`,
      recommendation: 'Manually inspect build output for secrets',
    });
  }
  
  return issues;
}

/**
 * Check package dependencies for known vulnerabilities
 */
function auditDependencies() {
  console.log('🔍 Running npm audit...');
  
  try {
    // Run npm audit and capture output
    const auditOutput = execSync('npm audit --audit-level=moderate --json', { encoding: 'utf8' });
    const auditData = JSON.parse(auditOutput);
    
    const issues = [];
    
    if (auditData.vulnerabilities) {
      const vulnCount = Object.keys(auditData.vulnerabilities).length;
      if (vulnCount > 0) {
        issues.push({
          severity: 'WARNING',
          type: 'DEPENDENCY_VULNERABILITIES',
          message: `Found ${vulnCount} dependency vulnerabilities`,
          recommendation: 'Run npm audit fix to address vulnerabilities',
          details: auditData.vulnerabilities,
        });
      }
    }
    
    return issues;
  } catch (error) {
    return [{
      severity: 'WARNING',
      type: 'AUDIT_FAILED',
      message: `npm audit failed: ${error.message}`,
      recommendation: 'Run npm audit manually to check for vulnerabilities',
    }];
  }
}

/**
 * Generate security report
 */
function generateSecurityReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    summary: {
      critical: results.filter(r => r.severity === 'CRITICAL').length,
      warning: results.filter(r => r.severity === 'WARNING').length,
      info: results.filter(r => r.severity === 'INFO').length,
      total: results.length,
    },
    results: results,
  };
  
  // Save report
  fs.writeFileSync(SECURITY_REPORT_FILE, JSON.stringify(report, null, 2));
  
  return report;
}

/**
 * Main execution
 */
async function main() {
  try {
    const allIssues = [];
    
    // Run all security checks
    const hardcodedSecrets = scanForHardcodedSecrets();
    const envIssues = auditEnvironmentVariables();
    const buildIssues = auditBuildOutput();
    const depIssues = auditDependencies();
    
    // Flatten results
    hardcodedSecrets.forEach(finding => {
      finding.findings.forEach(item => {
        allIssues.push({
          severity: 'CRITICAL',
          type: 'HARDCODED_SECRET',
          message: `Potential ${finding.type} found in code`,
          file: item.file,
          line: item.line,
          content: item.content,
          recommendation: 'Remove hardcoded secrets and use environment variables',
        });
      });
    });
    
    allIssues.push(...envIssues);
    allIssues.push(...buildIssues);
    allIssues.push(...depIssues);
    
    // Generate report
    const report = generateSecurityReport(allIssues);
    
    // Display results
    console.log('\\n📊 Security Audit Results:');
    console.log(`   Critical Issues: ${report.summary.critical}`);
    console.log(`   Warnings: ${report.summary.warning}`);
    console.log(`   Info: ${report.summary.info}`);
    console.log(`   Total: ${report.summary.total}\\n`);
    
    // Display critical issues
    const criticalIssues = allIssues.filter(issue => issue.severity === 'CRITICAL');
    if (criticalIssues.length > 0) {
      console.log('🚨 Critical Security Issues:');
      criticalIssues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.message}`);
        if (issue.file) console.log(`      File: ${issue.file}${issue.line ? `:${issue.line}` : ''}`);
        console.log(`      Recommendation: ${issue.recommendation}\\n`);
      });
    }
    
    // Display warnings
    const warnings = allIssues.filter(issue => issue.severity === 'WARNING');
    if (warnings.length > 0) {
      console.log('⚠️  Security Warnings:');
      warnings.slice(0, 5).forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue.message}`);
        console.log(`      Recommendation: ${issue.recommendation}\\n`);
      });
      if (warnings.length > 5) {
        console.log(`   ... and ${warnings.length - 5} more warnings\\n`);
      }
    }
    
    console.log(`📄 Full report saved to ${SECURITY_REPORT_FILE}`);
    
    // Exit with error code if critical issues found
    if (report.summary.critical > 0) {
      console.error('❌ Critical security issues found!');
      if (process.env.CI) {
        process.exit(1);
      }
    } else {
      console.log('✅ No critical security issues found');
    }
    
  } catch (error) {
    console.error('❌ Security audit failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);