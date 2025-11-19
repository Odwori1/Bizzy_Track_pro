#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVICES_DIR = path.join(__dirname, 'app', 'services');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Patterns to identify and fix
const PROBLEMATIC_PATTERNS = [
  /const result = await query\(/g,
  /await query\(/g,
  /query\(['"`]/g
];

// Fixed pattern template
const FIXED_PATTERN = `const client = await getClient();
try {
  const result = await client.query(`;

const FINALLY_BLOCK = `
} catch (error) {
  throw error;
} finally {
  client.release();
}`;

class DatabaseTimeoutFixer {
  constructor() {
    this.fixedFiles = [];
    this.skippedFiles = [];
    this.errorFiles = [];
  }

  async initialize() {
    console.log('🔧 DATABASE TIMEOUT FIXER - SYSTEM WIDE FIX');
    console.log('============================================\n');
    
    // Create backup directory
    try {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log('✅ Backup directory created');
    } catch (error) {
      console.log('⚠️  Backup directory already exists');
    }
  }

  async analyzeServiceFiles() {
    console.log('\n📊 ANALYZING SERVICE FILES...');
    console.log('=============================\n');

    const files = await fs.readdir(SERVICES_DIR);
    const serviceFiles = files.filter(file => file.endsWith('.js'));

    for (const file of serviceFiles) {
      const filePath = path.join(SERVICES_DIR, file);
      await this.analyzeFile(file, filePath);
    }

    this.printAnalysisReport();
  }

  async analyzeFile(filename, filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      
      // Check if file already uses proper pattern
      if (content.includes('const client = await getClient()') && 
          content.includes('client.release()')) {
        console.log(`✅ ${filename} - Already uses proper connection pattern`);
        this.skippedFiles.push(filename);
        return;
      }

      // Count problematic patterns
      let problemCount = 0;
      for (const pattern of PROBLEMATIC_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) problemCount += matches.length;
      }

      if (problemCount > 0) {
        console.log(`❌ ${filename} - ${problemCount} problematic query() calls found`);
        this.fixedFiles.push({ filename, problemCount, filePath });
      } else {
        console.log(`✅ ${filename} - No problematic patterns found`);
        this.skippedFiles.push(filename);
      }

    } catch (error) {
      console.log(`💥 ${filename} - Error analyzing: ${error.message}`);
      this.errorFiles.push(filename);
    }
  }

  printAnalysisReport() {
    console.log('\n📈 ANALYSIS REPORT');
    console.log('==================');
    console.log(`✅ Proper files: ${this.skippedFiles.length}`);
    console.log(`❌ Files needing fix: ${this.fixedFiles.length}`);
    console.log(`💥 Error files: ${this.errorFiles.length}`);
    
    if (this.fixedFiles.length > 0) {
      console.log('\n📋 FILES TO FIX:');
      this.fixedFiles.forEach(file => {
        console.log(`   - ${file.filename} (${file.problemCount} issues)`);
      });
    }
  }

  async fixProblematicFiles() {
    if (this.fixedFiles.length === 0) {
      console.log('\n🎉 No files need fixing! All services use proper connection pattern.');
      return;
    }

    console.log('\n🔧 FIXING PROBLEMATIC FILES...');
    console.log('==============================\n');

    for (const fileInfo of this.fixedFiles) {
      await this.fixFile(fileInfo);
    }

    this.printFixReport();
  }

  async fixFile(fileInfo) {
    try {
      const { filename, filePath } = fileInfo;
      
      // Create backup
      const backupPath = path.join(BACKUP_DIR, `${filename}.backup`);
      const originalContent = await fs.readFile(filePath, 'utf8');
      await fs.writeFile(backupPath, originalContent);
      
      let fixedContent = originalContent;
      let fixCount = 0;

      // Fix 1: Replace direct query() calls with client pattern
      fixedContent = fixedContent.replace(
        /const result = await query\(/g,
        FIXED_PATTERN
      );

      // Fix 2: Replace other query patterns
      fixedContent = fixedContent.replace(
        /await query\((['"`])/g,
        `const client = await getClient();\n  try {\n    const result = await client.query($1`
      );

      // Fix 3: Add finally blocks to methods that need them
      fixedContent = this.addFinallyBlocks(fixedContent);

      // Count fixes
      const originalQueries = (originalContent.match(/await query\(/g) || []).length;
      const fixedQueries = (fixedContent.match(/await client\.query\(/g) || []).length;
      fixCount = originalQueries - fixedQueries;

      await fs.writeFile(filePath, fixedContent);
      
      console.log(`✅ ${filename} - Fixed ${fixCount} query calls`);
      fileInfo.fixCount = fixCount;

    } catch (error) {
      console.log(`💥 ${fileInfo.filename} - Fix failed: ${error.message}`);
      fileInfo.fixError = error.message;
    }
  }

  addFinallyBlocks(content) {
    // This is a simplified version - manual review will be needed for complex cases
    const methodPattern = /static async (\w+)\([^)]*\) {/g;
    
    let fixedContent = content;
    let match;
    
    while ((match = methodPattern.exec(content)) !== null) {
      const methodName = match[1];
      const methodStart = match.index;
      
      // Find the method end (simplified approach)
      const methodBody = content.substring(methodStart);
      const braceStack = [];
      let methodEnd = methodStart;
      
      for (let i = 0; i < methodBody.length; i++) {
        if (methodBody[i] === '{') braceStack.push('{');
        if (methodBody[i] === '}') braceStack.pop();
        
        if (braceStack.length === 0) {
          methodEnd = methodStart + i + 1;
          break;
        }
      }
      
      const methodContent = content.substring(methodStart, methodEnd);
      
      // Check if method uses getClient but missing finally
      if (methodContent.includes('const client = await getClient()') && 
          !methodContent.includes('client.release()')) {
        
        // Add finally block before the closing brace
        const fixedMethod = methodContent.replace(/\}$/, `} finally {\n    client.release();\n  }`);
        fixedContent = fixedContent.replace(methodContent, fixedMethod);
      }
    }
    
    return fixedContent;
  }

  printFixReport() {
    console.log('\n📊 FIXING COMPLETE');
    console.log('==================');
    
    const successfulFixes = this.fixedFiles.filter(f => !f.fixError);
    const failedFixes = this.fixedFiles.filter(f => f.fixError);
    
    console.log(`✅ Successfully fixed: ${successfulFixes.length} files`);
    console.log(`💥 Failed to fix: ${failedFixes.length} files`);
    
    if (successfulFixes.length > 0) {
      console.log('\n📋 SUCCESSFULLY FIXED FILES:');
      successfulFixes.forEach(file => {
        console.log(`   - ${file.filename} (${file.fixCount} fixes)`);
      });
    }
    
    if (failedFixes.length > 0) {
      console.log('\n❌ FAILED FILES (NEED MANUAL FIX):');
      failedFixes.forEach(file => {
        console.log(`   - ${file.filename}: ${file.fixError}`);
      });
    }
    
    console.log(`\n💾 Backups saved to: ${BACKUP_DIR}`);
  }

  async generateManualFixInstructions() {
    console.log('\n📝 MANUAL FIX INSTRUCTIONS');
    console.log('==========================');
    console.log(`
For files that couldn't be automatically fixed, follow this pattern:

BEFORE (PROBLEMATIC):
    const result = await query('SELECT * FROM table WHERE id = $1', [id]);

AFTER (FIXED):
    const client = await getClient();
    try {
        const result = await client.query('SELECT * FROM table WHERE id = $1', [id]);
        return result.rows;
    } catch (error) {
        throw error;
    } finally {
        client.release();
    }

CRITICAL RULES:
1. ALWAYS use getClient() instead of query()
2. ALWAYS wrap in try/catch/finally
3. ALWAYS call client.release() in finally block
4. Use transactions (BEGIN/COMMIT/ROLLBACK) for multiple operations
    `);
  }
}

// Main execution
async function main() {
  const fixer = new DatabaseTimeoutFixer();
  
  try {
    await fixer.initialize();
    await fixer.analyzeServiceFiles();
    await fixer.fixProblematicFiles();
    await fixer.generateManualFixInstructions();
    
    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Restart the server: npm run dev');
    console.log('2. Test critical endpoints (jobs, customers, services)');
    console.log('3. Verify no more timeout errors in logs');
    console.log('4. Check frontend functionality');
    
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

// Run the script
main();
