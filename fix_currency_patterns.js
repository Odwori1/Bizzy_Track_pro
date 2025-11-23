#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const FRONTEND_SRC = path.join(process.cwd(), 'frontend/src');
const BACKUP_EXTENSION = '.backup';

// Patterns to find and replace
const PATTERNS = [
  {
    name: 'currencySymbol variable usage with concatenation',
    find: /\{currencySymbol\}(\s*)\{([^}]+)\}/g,
    replace: '{formatCurrency($2)}'
  },
  {
    name: 'currencySymbol with manual string concatenation',
    find: /currencySymbol\s*\+\s*([^;\n]+)/g,
    replace: 'formatCurrency($1)'
  },
  {
    name: 'template literal with currencySymbol',
    find: /\`\s*\$\{\s*currencySymbol\s*\}\s*([^`]+)\`/g,
    replace: 'formatCurrency($1)'
  }
];

// Helper function to read all TypeScript/JavaScript files
function getAllSourceFiles(dir) {
  let files = [];
  
  function traverse(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and other non-source directories
        if (!item.includes('node_modules') && !item.includes('.git')) {
          traverse(fullPath);
        }
      } else if (item.endsWith('.tsx') || item.endsWith('.ts') || item.endsWith('.jsx') || item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

// Check if file imports useBusinessCurrency
function importsCurrencyHook(content) {
  return content.includes('useBusinessCurrency') || content.includes("from '@/hooks/useBusinessCurrency'");
}

// Dry run - show what would be changed
function dryRun() {
  console.log('🔍 DRY RUN - Checking for currency pattern issues...\n');
  
  const files = getAllSourceFiles(FRONTEND_SRC);
  let totalChanges = 0;
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Only check files that use the currency hook
    if (!importsCurrencyHook(content)) {
      continue;
    }
    
    let fileChanges = 0;
    let issues = [];
    
    for (const pattern of PATTERNS) {
      const matches = [...content.matchAll(pattern.find)];
      if (matches.length > 0) {
        matches.forEach(match => {
          issues.push({
            pattern: pattern.name,
            line: content.substring(0, match.index).split('\n').length,
            original: match[0],
            replacement: match[0].replace(pattern.find, pattern.replace)
          });
          fileChanges++;
        });
      }
    }
    
    if (issues.length > 0) {
      console.log(`📄 ${path.relative(process.cwd(), file)}`);
      console.log(`   Found ${issues.length} issue(s):`);
      
      issues.forEach(issue => {
        console.log(`   └─ Line ${issue.line}: ${issue.pattern}`);
        console.log(`      Before: ${issue.original}`);
        console.log(`      After:  ${issue.replacement}`);
        console.log('');
      });
      
      totalChanges += fileChanges;
    }
  }
  
  console.log(`📊 Summary: Found ${totalChanges} currency pattern issues across ${files.length} files`);
  return totalChanges;
}

// Apply fixes
function applyFixes() {
  console.log('🔧 Applying currency pattern fixes...\n');
  
  const files = getAllSourceFiles(FRONTEND_SRC);
  let totalChanges = 0;
  let modifiedFiles = [];
  
  for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    const originalContent = content;
    
    // Only process files that use the currency hook
    if (!importsCurrencyHook(content)) {
      continue;
    }
    
    let fileChanges = 0;
    
    for (const pattern of PATTERNS) {
      const newContent = content.replace(pattern.find, pattern.replace);
      if (newContent !== content) {
        fileChanges++;
        content = newContent;
      }
    }
    
    if (fileChanges > 0) {
      // Create backup
      const backupFile = file + BACKUP_EXTENSION;
      fs.writeFileSync(backupFile, originalContent);
      
      // Write fixed content
      fs.writeFileSync(file, content);
      
      console.log(`✅ Fixed ${fileChanges} issue(s) in ${path.relative(process.cwd(), file)}`);
      modifiedFiles.push(file);
      totalChanges += fileChanges;
    }
  }
  
  console.log(`\n📊 Applied ${totalChanges} fixes across ${modifiedFiles.length} files`);
  console.log(`💾 Backups created with ${BACKUP_EXTENSION} extension`);
  
  return { totalChanges, modifiedFiles };
}

// Verify imports have formatCurrency
function verifyImports() {
  console.log('\n🔍 Verifying useBusinessCurrency imports...\n');
  
  const files = getAllSourceFiles(FRONTEND_SRC);
  let importIssues = [];
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Check if file uses currencySymbol but doesn't destructure formatCurrency
    if (content.includes('currencySymbol') && content.includes('useBusinessCurrency')) {
      const importMatch = content.match(/const\s*{\s*([^}]+)\s*}\s*=\s*useBusinessCurrency/);
      if (importMatch && !importMatch[1].includes('formatCurrency')) {
        importIssues.push({
          file,
          currentDestructure: importMatch[1],
          line: content.substring(0, importMatch.index).split('\n').length
        });
      }
    }
  }
  
  if (importIssues.length > 0) {
    console.log('⚠️  Found import issues:');
    importIssues.forEach(issue => {
      console.log(`   ${path.relative(process.cwd(), issue.file)}:${issue.line}`);
      console.log(`   Current: const { ${issue.currentDestructure} } = useBusinessCurrency`);
      console.log(`   Should be: const { formatCurrency${issue.currentDestructure.includes('currencySymbol') ? ', currencySymbol' : ''} } = useBusinessCurrency`);
      console.log('');
    });
  } else {
    console.log('✅ All useBusinessCurrency imports look good!');
  }
  
  return importIssues;
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'dry-run';
  
  try {
    switch (command) {
      case 'dry-run':
        console.log('🚀 Currency Pattern Fixer - Dry Run Mode\n');
        dryRun();
        verifyImports();
        console.log('\n💡 Run with "apply" to actually make changes');
        break;
        
      case 'apply':
        console.log('🚀 Currency Pattern Fixer - Apply Mode\n');
        const changes = dryRun();
        if (changes > 0) {
          console.log('\n--- APPLYING FIXES ---\n');
          applyFixes();
          verifyImports();
        } else {
          console.log('✅ No changes needed!');
        }
        break;
        
      case 'verify':
        verifyImports();
        break;
        
      default:
        console.log('Usage:');
        console.log('  node fix_currency_patterns.js dry-run  # Show what would be changed');
        console.log('  node fix_currency_patterns.js apply    # Apply the changes');
        console.log('  node fix_currency_patterns.js verify   # Verify imports only');
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
