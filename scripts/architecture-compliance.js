#!/usr/bin/env node

/**
 * Architecture Compliance Checker
 * 
 * This script validates that the codebase follows architectural decisions
 * and maintains consistency across the project.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  projectRoot: process.cwd(),
  rules: [
    'primaryDirectoryStructure',
    'deprecatedDirectoryUsage',
    'sharedTypesUsage',
    'importConventions',
    'fileNamingConventions',
    'componentStructure',
    'apiVersioning',
    'errorHandlingPatterns',
    'testingPatterns',
    'documentationSync'
  ],
  severity: {
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
  }
};

class ArchitectureCompliance {
  constructor() {
    this.violations = [];
    this.stats = {
      errors: 0,
      warnings: 0,
      info: 0,
      totalFiles: 0,
      checkedFiles: 0
    };
  }

  /**
   * Run all compliance checks
   */
  async runChecks() {
    console.log('🏗️  Starting Architecture Compliance Check...\n');

    for (const rule of CONFIG.rules) {
      console.log(`📋 Checking: ${rule}...`);
      try {
        await this[rule]();
        console.log(`✅ ${rule} - Passed\n`);
      } catch (error) {
        console.log(`❌ ${rule} - Failed: ${error.message}\n`);
      }
    }

    this.generateReport();
  }

  /**
   * Check primary directory structure compliance
   */
  primaryDirectoryStructure() {
    const requiredDirectories = [
      'web-app',           // Primary frontend
      'api',               // Primary backend
      'shared-types',      // Shared type definitions
      '.github/workflows'  // CI/CD
    ];

    const expectedStructure = {
      'web-app': ['src', 'public', 'tests', 'package.json'],
      'api': ['app', 'migrations', 'tests', 'requirements.txt', 'main.py'],
      'shared-types': ['src', 'package.json', 'tsconfig.json']
    };

    // Check required directories exist
    for (const dir of requiredDirectories) {
      const dirPath = path.join(CONFIG.projectRoot, dir);
      if (!fs.existsSync(dirPath)) {
        this.addViolation(
          CONFIG.severity.ERROR,
          'PRIMARY_DIRECTORY_MISSING',
          `Required directory missing: ${dir}`,
          dirPath
        );
      }
    }

    // Check directory structure
    for (const [dir, expectedContents] of Object.entries(expectedStructure)) {
      const dirPath = path.join(CONFIG.projectRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      for (const expectedItem of expectedContents) {
        const itemPath = path.join(dirPath, expectedItem);
        if (!fs.existsSync(itemPath)) {
          this.addViolation(
            CONFIG.severity.WARNING,
            'EXPECTED_STRUCTURE_MISSING',
            `Expected ${expectedItem} in ${dir}`,
            itemPath
          );
        }
      }
    }
  }

  /**
   * Check deprecated directory usage
   */
  deprecatedDirectoryUsage() {
    const deprecatedDirectories = ['backend', 'frontend'];
    const checkDirectories = ['web-app', 'api', 'shared-types'];

    // Check for imports/references to deprecated directories
    for (const checkDir of checkDirectories) {
      const dirPath = path.join(CONFIG.projectRoot, checkDir);
      if (!fs.existsSync(dirPath)) continue;

      const files = this.getAllFiles(dirPath, ['.ts', '.tsx', '.js', '.jsx', '.py']);
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const deprecatedDir of deprecatedDirectories) {
          // Check for relative imports to deprecated directories
          const relativePaths = [
            `../backend/`,
            `../../backend/`,
            `../frontend/`,
            `../../frontend/`
          ];

          for (const relativePath of relativePaths) {
            if (content.includes(relativePath)) {
              this.addViolation(
                CONFIG.severity.ERROR,
                'DEPRECATED_DIRECTORY_IMPORT',
                `File imports from deprecated directory: ${relativePath}`,
                file
              );
            }
          }
        }
      }
    }

    // Check if deprecated directories have new modifications
    for (const deprecatedDir of deprecatedDirectories) {
      const dirPath = path.join(CONFIG.projectRoot, deprecatedDir);
      if (!fs.existsSync(dirPath)) continue;

      try {
        // Check git for recent changes (last 30 days)
        const recentChanges = execSync(
          `git log --since="30 days ago" --name-only --pretty=format: -- ${deprecatedDir}`,
          { cwd: CONFIG.projectRoot, encoding: 'utf8' }
        ).trim();

        if (recentChanges) {
          this.addViolation(
            CONFIG.severity.WARNING,
            'DEPRECATED_DIRECTORY_MODIFICATION',
            `Deprecated directory ${deprecatedDir} has recent modifications`,
            dirPath
          );
        }
      } catch (error) {
        // Git command failed, skip this check
      }
    }
  }

  /**
   * Check shared types usage
   */
  sharedTypesUsage() {
    const sourceDirectories = ['web-app/src', 'api/app'];
    const sharedTypesPath = path.join(CONFIG.projectRoot, 'shared-types');
    
    if (!fs.existsSync(sharedTypesPath)) {
      this.addViolation(
        CONFIG.severity.ERROR,
        'SHARED_TYPES_MISSING',
        'Shared types package not found',
        sharedTypesPath
      );
      return;
    }

    // Check for duplicate type definitions
    const commonTypePatterns = [
      /interface User\s*{/g,
      /interface Meeting\s*{/g,
      /interface AuthToken\s*{/g,
      /type ApiResponse\s*=/g,
      /enum ErrorCode\s*{/g
    ];

    const duplicateTypes = new Map();

    for (const sourceDir of sourceDirectories) {
      const dirPath = path.join(CONFIG.projectRoot, sourceDir);
      if (!fs.existsSync(dirPath)) continue;

      const files = this.getAllFiles(dirPath, ['.ts', '.tsx']);
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        
        for (const pattern of commonTypePatterns) {
          const matches = content.match(pattern);
          if (matches) {
            const typeName = matches[0];
            if (!duplicateTypes.has(typeName)) {
              duplicateTypes.set(typeName, []);
            }
            duplicateTypes.get(typeName).push(file);
          }
        }
      }
    }

    // Report duplicates
    for (const [typeName, files] of duplicateTypes) {
      if (files.length > 1) {
        this.addViolation(
          CONFIG.severity.WARNING,
          'DUPLICATE_TYPE_DEFINITION',
          `Type ${typeName} defined in multiple files: ${files.join(', ')}`,
          files[0]
        );
      }
    }

    // Check for shared-types imports
    for (const sourceDir of sourceDirectories) {
      const dirPath = path.join(CONFIG.projectRoot, sourceDir);
      if (!fs.existsSync(dirPath)) continue;

      const files = this.getAllFiles(dirPath, ['.ts', '.tsx']);
      let hasSharedTypesImport = false;

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes('@meetingly/shared-types')) {
          hasSharedTypesImport = true;
          break;
        }
      }

      if (!hasSharedTypesImport) {
        this.addViolation(
          CONFIG.severity.INFO,
          'NO_SHARED_TYPES_USAGE',
          `Directory ${sourceDir} doesn't import shared types`,
          dirPath
        );
      }
    }
  }

  /**
   * Check import conventions
   */
  importConventions() {
    const directories = ['web-app/src', 'shared-types/src'];
    
    for (const dir of directories) {
      const dirPath = path.join(CONFIG.projectRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = this.getAllFiles(dirPath, ['.ts', '.tsx']);
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Check import formatting
          if (line.startsWith('import ')) {
            // Check for single quotes
            if (line.includes('"') && !line.includes("'")) {
              this.addViolation(
                CONFIG.severity.INFO,
                'IMPORT_QUOTE_STYLE',
                `Use single quotes for imports at line ${i + 1}`,
                file
              );
            }
            
            // Check for trailing semicolon
            if (!line.endsWith(';')) {
              this.addViolation(
                CONFIG.severity.INFO,
                'IMPORT_SEMICOLON',
                `Missing semicolon in import at line ${i + 1}`,
                file
              );
            }
          }
        }
      }
    }
  }

  /**
   * Check file naming conventions
   */
  fileNamingConventions() {
    const conventions = {
      'web-app/src/components': {
        pattern: /^[A-Z][a-zA-Z0-9]*\.tsx?$/,
        description: 'PascalCase for components'
      },
      'web-app/src/pages': {
        pattern: /^[a-z][a-zA-Z0-9-]*\.tsx?$/,
        description: 'kebab-case for pages'
      },
      'web-app/src/lib': {
        pattern: /^[a-z][a-zA-Z0-9]*\.ts$/,
        description: 'camelCase for utilities'
      },
      'api/app/models': {
        pattern: /^[a-z][a-z_]*\.py$/,
        description: 'snake_case for Python files'
      }
    };

    for (const [dir, convention] of Object.entries(conventions)) {
      const dirPath = path.join(CONFIG.projectRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isFile() && !convention.pattern.test(file)) {
          this.addViolation(
            CONFIG.severity.WARNING,
            'FILE_NAMING_CONVENTION',
            `File ${file} doesn't follow ${convention.description}`,
            filePath
          );
        }
      }
    }
  }

  /**
   * Check component structure
   */
  componentStructure() {
    const componentDirs = ['web-app/src/components'];
    
    for (const dir of componentDirs) {
      const dirPath = path.join(CONFIG.projectRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      const componentFiles = this.getAllFiles(dirPath, ['.tsx']);
      
      for (const file of componentFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const fileName = path.basename(file, '.tsx');
        
        // Check for default export
        if (!content.includes(`export default`) && !content.includes(`export { ${fileName} }`)) {
          this.addViolation(
            CONFIG.severity.WARNING,
            'COMPONENT_EXPORT',
            `Component ${fileName} should have a default export`,
            file
          );
        }
        
        // Check for TypeScript interface/type for props
        if (content.includes('props:') && !content.includes('interface') && !content.includes('type')) {
          this.addViolation(
            CONFIG.severity.INFO,
            'COMPONENT_PROPS_TYPE',
            `Component ${fileName} should define props interface/type`,
            file
          );
        }
      }
    }
  }

  /**
   * Check API versioning compliance
   */
  apiVersioning() {
    const apiDir = path.join(CONFIG.projectRoot, 'api/app/api');
    if (!fs.existsSync(apiDir)) return;

    // Check for version directories
    const expectedVersions = ['v1', 'v2'];
    const versionDirs = fs.readdirSync(apiDir).filter(item => {
      const itemPath = path.join(apiDir, item);
      return fs.statSync(itemPath).isDirectory();
    });

    // Check if routes are properly versioned
    const routeFiles = this.getAllFiles(apiDir, ['.py']);
    
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check for hardcoded version strings in routes
      const hardcodedVersions = content.match(/@router\.(get|post|put|delete)\(['"]\/v\d+/g);
      if (hardcodedVersions) {
        this.addViolation(
          CONFIG.severity.INFO,
          'API_VERSION_HARDCODED',
          `Hardcoded API version found in routes`,
          file
        );
      }
    }
  }

  /**
   * Check error handling patterns
   */
  errorHandlingPatterns() {
    const directories = ['web-app/src', 'api/app'];
    
    for (const dir of directories) {
      const dirPath = path.join(CONFIG.projectRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = this.getAllFiles(dirPath, ['.ts', '.tsx', '.py']);
      
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for unhandled promises
        const asyncCalls = content.match(/(?:await\s+)?(?:fetch|axios|api\.)\w*\([^)]*\)/g);
        if (asyncCalls) {
          const hasTryCatch = content.includes('try') && content.includes('catch');
          const hasErrorHandling = content.includes('.catch(') || content.includes('onError');
          
          if (!hasTryCatch && !hasErrorHandling) {
            this.addViolation(
              CONFIG.severity.WARNING,
              'MISSING_ERROR_HANDLING',
              `File contains async calls without error handling`,
              file
            );
          }
        }
      }
    }
  }

  /**
   * Check testing patterns
   */
  testingPatterns() {
    const testDirectories = ['web-app/tests', 'web-app/src/**/__tests__', 'api/tests'];
    
    for (const testDir of testDirectories) {
      const dirPath = path.join(CONFIG.projectRoot, testDir);
      if (!fs.existsSync(dirPath)) continue;

      const testFiles = this.getAllFiles(dirPath, ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.py']);
      
      for (const file of testFiles) {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for test structure
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          if (!content.includes('describe(') && !content.includes('test(') && !content.includes('it(')) {
            this.addViolation(
              CONFIG.severity.WARNING,
              'TEST_STRUCTURE',
              `Test file should use describe/test/it structure`,
              file
            );
          }
        }
        
        if (file.endsWith('.py')) {
          if (!content.includes('def test_') && !content.includes('class Test')) {
            this.addViolation(
              CONFIG.severity.WARNING,
              'PYTHON_TEST_STRUCTURE',
              `Python test file should follow test_ naming or Test class structure`,
              file
            );
          }
        }
      }
    }
  }

  /**
   * Check documentation synchronization
   */
  documentationSync() {
    const architectureDoc = path.join(CONFIG.projectRoot, 'ARCHITECTURE_DECISIONS.md');
    const apiDoc = path.join(CONFIG.projectRoot, 'API_DOCUMENTATION.md');
    const setupDoc = path.join(CONFIG.projectRoot, 'SETUP_GUIDE.md');
    
    const requiredDocs = [architectureDoc, apiDoc, setupDoc];
    
    for (const doc of requiredDocs) {
      if (!fs.existsSync(doc)) {
        this.addViolation(
          CONFIG.severity.ERROR,
          'MISSING_DOCUMENTATION',
          `Required documentation missing: ${path.basename(doc)}`,
          doc
        );
        continue;
      }
      
      // Check if documentation is recent
      const stat = fs.statSync(doc);
      const daysSinceModified = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceModified > 90) {
        this.addViolation(
          CONFIG.severity.INFO,
          'STALE_DOCUMENTATION',
          `Documentation ${path.basename(doc)} hasn't been updated in ${Math.round(daysSinceModified)} days`,
          doc
        );
      }
    }
  }

  /**
   * Add a violation to the list
   */
  addViolation(severity, code, message, file) {
    this.violations.push({
      severity,
      code,
      message,
      file: path.relative(CONFIG.projectRoot, file || ''),
      timestamp: new Date().toISOString()
    });

    this.stats[severity === CONFIG.severity.ERROR ? 'errors' : 
                 severity === CONFIG.severity.WARNING ? 'warnings' : 'info']++;
  }

  /**
   * Get all files with specific extensions
   */
  getAllFiles(dir, extensions) {
    let files = [];
    
    if (!fs.existsSync(dir)) return files;
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        files = files.concat(this.getAllFiles(fullPath, extensions));
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.some(e => item.endsWith(e))) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Generate compliance report
   */
  generateReport() {
    console.log('\n📊 Architecture Compliance Report');
    console.log('═'.repeat(50));
    
    // Summary
    console.log(`\n📈 Summary:`);
    console.log(`   Errors: ${this.stats.errors}`);
    console.log(`   Warnings: ${this.stats.warnings}`);
    console.log(`   Info: ${this.stats.info}`);
    console.log(`   Total Issues: ${this.violations.length}`);
    
    // Violations by severity
    const violationsBySeverity = this.violations.reduce((acc, v) => {
      if (!acc[v.severity]) acc[v.severity] = [];
      acc[v.severity].push(v);
      return acc;
    }, {});
    
    for (const [severity, violations] of Object.entries(violationsBySeverity)) {
      console.log(`\n${severity.toUpperCase()} (${violations.length}):`);
      for (const violation of violations) {
        console.log(`   ${violation.code}: ${violation.message}`);
        if (violation.file) {
          console.log(`   📁 ${violation.file}`);
        }
        console.log('');
      }
    }
    
    // Overall status
    const hasErrors = this.stats.errors > 0;
    const hasWarnings = this.stats.warnings > 0;
    
    console.log('\n🎯 Overall Status:');
    if (hasErrors) {
      console.log('❌ FAILED - Architecture compliance issues found');
      process.exit(1);
    } else if (hasWarnings) {
      console.log('⚠️  PASSED WITH WARNINGS - Consider addressing warnings');
    } else {
      console.log('✅ PASSED - Architecture is compliant');
    }
    
    // Generate JSON report
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      violations: this.violations,
      status: hasErrors ? 'failed' : hasWarnings ? 'passed-with-warnings' : 'passed'
    };
    
    fs.writeFileSync(
      path.join(CONFIG.projectRoot, 'architecture-compliance-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log('\n📄 Report saved to: architecture-compliance-report.json');
  }
}

// Run compliance check
const checker = new ArchitectureCompliance();
checker.runChecks().catch(error => {
  console.error('❌ Compliance check failed:', error);
  process.exit(1);
});