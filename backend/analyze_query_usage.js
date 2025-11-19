#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVICES_DIR = path.join(__dirname, 'app', 'services');

class QueryUsageAnalyzer {
  constructor() {
    this.problematicFiles = [];
  }

  async analyzeAllFiles() {
    console.log('🔍 PRECISE QUERY USAGE ANALYSIS');
    console.log('================================\n');

    const files = await fs.readdir(SERVICES_DIR);
    const serviceFiles = files.filter(file => file.endsWith('.js'));

    for (const file of serviceFiles) {
      await this.analyzeFile(file);
    }

    this.printDetailedReport();
  }

  async analyzeFile(filename) {
    const filePath = path.join(SERVICES_DIR, filename);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');
      
      const problematicLines = [];
      
      lines.forEach((line, index) => {
        if (line.includes('await query(') && !line.includes('getClient()')) {
          problematicLines.push({
            lineNumber: index + 1,
            content: line.trim(),
            context: this.getContext(lines, index)
          });
        }
      });

      if (problematicLines.length > 0) {
        this.problematicFiles.push({
          filename,
          problematicLines,
          filePath
        });
      }

    } catch (error) {
      console.log(`💥 Error analyzing ${filename}: ${error.message}`);
    }
  }

  getContext(lines, currentIndex, contextLines = 3) {
    const start = Math.max(0, currentIndex - contextLines);
    const end = Math.min(lines.length - 1, currentIndex + contextLines);
    
    const context = [];
    for (let i = start; i <= end; i++) {
      const prefix = i === currentIndex ? '❌ ' : '   ';
      context.push(`${prefix}${i + 1}: ${lines[i].trim()}`);
    }
    
    return context.join('\n');
  }

  printDetailedReport() {
    console.log('\n📋 DETAILED ANALYSIS REPORT');
    console.log('===========================\n');

    if (this.problematicFiles.length === 0) {
      console.log('🎉 No problematic query() usage found!');
      return;
    }

    this.problematicFiles.forEach(file => {
      console.log(`📄 ${file.filename} - ${file.problematicLines.length} problematic lines:`);
      console.log('─'.repeat(80));
      
      file.problematicLines.forEach(problem => {
        console.log(`\nLine ${problem.lineNumber}:`);
        console.log(problem.context);
        console.log('─'.repeat(40));
      });
      
      console.log('\n');
    });

    console.log('🎯 QUICK FIX COMMANDS:');
    console.log('======================');
    this.problematicFiles.forEach(file => {
      console.log(`\n# Fix ${file.filename}:`);
      console.log(`vim +${file.problematicLines[0].lineNumber} ${file.filePath}`);
    });
  }
}

// Run the analyzer
async function main() {
  const analyzer = new QueryUsageAnalyzer();
  await analyzer.analyzeAllFiles();
}

main().catch(console.error);
