#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '..');

class CodebaseContextServer {
  constructor() {
    this.server = new Server(
      {
        name: 'music-library-codebase',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_file',
          description: 'Analyze a specific file and extract its context, dependencies, and purpose',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to the file to analyze (relative to workspace root)',
              },
            },
            required: ['filePath'],
          },
        },
        {
          name: 'search_codebase',
          description: 'Search for files, functions, or patterns in the codebase',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query (can be file pattern, function name, or text)',
              },
              type: {
                type: 'string',
                enum: ['files', 'content', 'functions', 'imports'],
                description: 'Type of search to perform',
                default: 'content',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_project_structure',
          description: 'Get the overall project structure and architecture overview',
          inputSchema: {
            type: 'object',
            properties: {
              depth: {
                type: 'number',
                description: 'Directory depth to traverse (default: 3)',
                default: 3,
              },
            },
          },
        },
        {
          name: 'get_dependencies',
          description: 'Get project dependencies and their purposes',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['all', 'production', 'development'],
                description: 'Type of dependencies to return',
                default: 'all',
              },
            },
          },
        },
        {
          name: 'get_api_routes',
          description: 'Get all API routes and their handlers in the application',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_database_schema',
          description: 'Get database schema and models information',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_file':
            return await this.analyzeFile(args.filePath);
          case 'search_codebase':
            return await this.searchCodebase(args.query, args.type || 'content');
          case 'get_project_structure':
            return await this.getProjectStructure(args.depth || 3);
          case 'get_dependencies':
            return await this.getDependencies(args.type || 'all');
          case 'get_api_routes':
            return await this.getApiRoutes();
          case 'get_database_schema':
            return await this.getDatabaseSchema();
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error.message}`);
      }
    });
  }

  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'codebase://project-overview',
          mimeType: 'text/markdown',
          name: 'Project Overview',
          description: 'High-level overview of the music library project',
        },
        {
          uri: 'codebase://architecture',
          mimeType: 'text/markdown',
          name: 'Architecture',
          description: 'System architecture and component relationships',
        },
        {
          uri: 'codebase://tech-stack',
          mimeType: 'application/json',
          name: 'Technology Stack',
          description: 'Complete technology stack and dependencies',
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      switch (uri) {
        case 'codebase://project-overview':
          return {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: await this.generateProjectOverview(),
              },
            ],
          };
        case 'codebase://architecture':
          return {
            contents: [
              {
                uri,
                mimeType: 'text/markdown',
                text: await this.generateArchitectureDoc(),
              },
            ],
          };
        case 'codebase://tech-stack':
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(await this.getTechStack(), null, 2),
              },
            ],
          };
        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
      }
    });
  }

  async analyzeFile(filePath) {
    const fullPath = path.resolve(WORKSPACE_ROOT, filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);
      const ext = path.extname(filePath);
      
      // Extract imports/dependencies
      const imports = this.extractImports(content);
      
      // Detect file type and purpose
      const fileType = this.detectFileType(filePath, content);
      const purpose = this.detectFilePurpose(filePath, content);
      
      // Extract key functions/exports
      const exports = this.extractExports(content, ext);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              filePath,
              fileType,
              purpose,
              size: stats.size,
              lastModified: stats.mtime,
              imports,
              exports,
              linesOfCode: content.split('\n').length,
              summary: this.generateFileSummary(filePath, content, fileType, purpose),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InvalidRequest, `Could not analyze file: ${error.message}`);
    }
  }

  async searchCodebase(query, type) {
    const results = [];
    
    try {
      switch (type) {
        case 'files':
          const files = await glob(query, { cwd: WORKSPACE_ROOT, ignore: ['node_modules/**', '.git/**'] });
          results.push(...files.map(file => ({ type: 'file', path: file })));
          break;
          
        case 'content':
          const contentFiles = await glob('**/*.{js,jsx,ts,tsx,py,md}', { 
            cwd: WORKSPACE_ROOT, 
            ignore: ['node_modules/**', '.git/**'] 
          });
          
          for (const file of contentFiles.slice(0, 50)) { // Limit for performance
            try {
              const content = await fs.readFile(path.resolve(WORKSPACE_ROOT, file), 'utf-8');
              if (content.toLowerCase().includes(query.toLowerCase())) {
                const lines = content.split('\n');
                const matchingLines = lines
                  .map((line, index) => ({ line: line.trim(), number: index + 1 }))
                  .filter(({ line }) => line.toLowerCase().includes(query.toLowerCase()))
                  .slice(0, 3); // First 3 matches per file
                
                results.push({
                  type: 'content_match',
                  file,
                  matches: matchingLines,
                });
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
          break;
          
        case 'functions':
          const jsFiles = await glob('**/*.{js,jsx,ts,tsx}', { 
            cwd: WORKSPACE_ROOT, 
            ignore: ['node_modules/**', '.git/**'] 
          });
          
          for (const file of jsFiles) {
            try {
              const content = await fs.readFile(path.resolve(WORKSPACE_ROOT, file), 'utf-8');
              const functions = this.extractFunctions(content);
              const matchingFunctions = functions.filter(fn => 
                fn.name.toLowerCase().includes(query.toLowerCase())
              );
              
              if (matchingFunctions.length > 0) {
                results.push({
                  type: 'function_match',
                  file,
                  functions: matchingFunctions,
                });
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
          break;
          
        case 'imports':
          const importFiles = await glob('**/*.{js,jsx,ts,tsx}', { 
            cwd: WORKSPACE_ROOT, 
            ignore: ['node_modules/**', '.git/**'] 
          });
          
          for (const file of importFiles) {
            try {
              const content = await fs.readFile(path.resolve(WORKSPACE_ROOT, file), 'utf-8');
              const imports = this.extractImports(content);
              const matchingImports = imports.filter(imp => 
                imp.toLowerCase().includes(query.toLowerCase())
              );
              
              if (matchingImports.length > 0) {
                results.push({
                  type: 'import_match',
                  file,
                  imports: matchingImports,
                });
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
          break;
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              query,
              type,
              resultCount: results.length,
              results: results.slice(0, 20), // Limit results
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Search failed: ${error.message}`);
    }
  }

  async getProjectStructure(depth) {
    try {
      const structure = await this.buildDirectoryTree(WORKSPACE_ROOT, depth);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              projectRoot: WORKSPACE_ROOT,
              structure,
              summary: await this.generateStructureSummary(),
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get project structure: ${error.message}`);
    }
  }

  async getDependencies(type) {
    try {
      const packageJsonPath = path.resolve(WORKSPACE_ROOT, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      let deps = {};
      
      if (type === 'all' || type === 'production') {
        deps.production = packageJson.dependencies || {};
      }
      
      if (type === 'all' || type === 'development') {
        deps.development = packageJson.devDependencies || {};
      }
      
      // Add dependency analysis
      const analysis = await this.analyzeDependencies(deps);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              type,
              dependencies: deps,
              analysis,
              totalCount: Object.keys(deps.production || {}).length + Object.keys(deps.development || {}).length,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get dependencies: ${error.message}`);
    }
  }

  async getApiRoutes() {
    try {
      const routes = [];
      
      // Look for React Router routes
      const routeFiles = await glob('app/routes/**/*.{js,jsx,ts,tsx}', { cwd: WORKSPACE_ROOT });
      
      for (const file of routeFiles) {
        try {
          const content = await fs.readFile(path.resolve(WORKSPACE_ROOT, file), 'utf-8');
          const routeInfo = this.extractRouteInfo(file, content);
          if (routeInfo) {
            routes.push(routeInfo);
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              totalRoutes: routes.length,
              routes,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get API routes: ${error.message}`);
    }
  }

  async getDatabaseSchema() {
    try {
      const schemaPath = path.resolve(WORKSPACE_ROOT, 'prisma/schema.prisma');
      const schema = await fs.readFile(schemaPath, 'utf-8');
      
      const models = this.extractPrismaModels(schema);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              schemaFile: 'prisma/schema.prisma',
              models,
              modelCount: models.length,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, `Failed to get database schema: ${error.message}`);
    }
  }

  // Helper methods
  extractImports(content) {
    const imports = [];
    const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g;
    let match;
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    return [...new Set(imports)]; // Remove duplicates
  }

  extractExports(content, ext) {
    const exports = [];
    
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      // Export function declarations
      const exportFunctionRegex = /export\s+(async\s+)?function\s+(\w+)/g;
      let match;
      while ((match = exportFunctionRegex.exec(content)) !== null) {
        exports.push({ type: 'function', name: match[2] });
      }
      
      // Export const declarations
      const exportConstRegex = /export\s+const\s+(\w+)/g;
      while ((match = exportConstRegex.exec(content)) !== null) {
        exports.push({ type: 'const', name: match[1] });
      }
      
      // Default exports
      if (content.includes('export default')) {
        exports.push({ type: 'default', name: 'default' });
      }
    }
    
    return exports;
  }

  extractFunctions(content) {
    const functions = [];
    
    // Function declarations
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      functions.push({ name: match[1], type: 'declaration' });
    }
    
    // Arrow functions
    const arrowFunctionRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      functions.push({ name: match[1], type: 'arrow' });
    }
    
    return functions;
  }

  detectFileType(filePath, content) {
    const ext = path.extname(filePath);
    const dir = path.dirname(filePath);
    
    if (dir.includes('routes')) return 'route';
    if (dir.includes('components')) return 'component';
    if (dir.includes('utils')) return 'utility';
    if (dir.includes('types')) return 'types';
    if (filePath.includes('test') || filePath.includes('spec')) return 'test';
    if (filePath.includes('config')) return 'configuration';
    if (ext === '.prisma') return 'database_schema';
    if (filePath.includes('server')) return 'server';
    
    return 'module';
  }

  detectFilePurpose(filePath, content) {
    const fileName = path.basename(filePath);
    
    if (fileName.includes('layout')) return 'Layout component';
    if (fileName.includes('error')) return 'Error handling';
    if (fileName.includes('loading')) return 'Loading state';
    if (fileName.includes('modal')) return 'Modal component';
    if (fileName.includes('form')) return 'Form component';
    if (fileName.includes('auth')) return 'Authentication';
    if (fileName.includes('api')) return 'API integration';
    if (fileName.includes('db') || fileName.includes('database')) return 'Database operations';
    if (content.includes('prisma')) return 'Database operations';
    if (content.includes('fetch') || content.includes('axios')) return 'HTTP client';
    
    return 'General module';
  }

  generateFileSummary(filePath, content, fileType, purpose) {
    const lines = content.split('\n').length;
    const imports = this.extractImports(content).length;
    
    return `${fileType} file (${purpose}) with ${lines} lines of code and ${imports} imports. Located at ${filePath}.`;
  }

  async buildDirectoryTree(dirPath, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return null;
    
    try {
      const items = await fs.readdir(dirPath);
      const tree = {};
      
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue;
        
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          const subtree = await this.buildDirectoryTree(itemPath, maxDepth, currentDepth + 1);
          if (subtree) {
            tree[item] = subtree;
          } else {
            tree[item] = '[directory]';
          }
        } else {
          tree[item] = '[file]';
        }
      }
      
      return tree;
    } catch (error) {
      return null;
    }
  }

  async generateProjectOverview() {
    const packageJson = JSON.parse(await fs.readFile(path.resolve(WORKSPACE_ROOT, 'package.json'), 'utf-8'));
    const readme = await fs.readFile(path.resolve(WORKSPACE_ROOT, 'README.md'), 'utf-8').catch(() => '');
    
    return `# ${packageJson.name || 'Music Library Project'}

## Description
${packageJson.description || 'A music library application built with the Epic Stack'}

## Technology Stack
- **Framework**: React Router v7 (Remix-style)
- **Runtime**: Node.js ${packageJson.engines?.node || '22'}
- **Database**: Prisma ORM
- **Styling**: Tailwind CSS
- **Testing**: Playwright, Vitest
- **Deployment**: Fly.io

## Key Features
${readme.includes('YouTube') ? '- YouTube playlist integration' : ''}
- User authentication and management
- Music library management
- Modern React components with Radix UI
- Full-stack TypeScript application

## Project Structure
- \`app/\` - Main application code (routes, components, utils)
- \`prisma/\` - Database schema and migrations
- \`tests/\` - Test files and fixtures
- \`server/\` - Server configuration
- \`scripts/\` - Build and utility scripts

${readme}
`;
  }

  async generateArchitectureDoc() {
    return `# Architecture Overview

## Application Architecture
This is a full-stack web application built with React Router v7 (Remix-style architecture).

### Frontend
- **React Router v7**: File-based routing with server-side rendering
- **React 19**: Latest React with concurrent features
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework

### Backend
- **Express.js**: Web server framework
- **Prisma**: Type-safe database ORM
- **Node.js**: Server runtime

### Database
- **SQLite**: Development database
- **Prisma**: ORM with type safety

### Authentication
- **Remix Auth**: Authentication framework
- **Session management**: Secure session handling

### Deployment
- **Fly.io**: Production deployment platform
- **LiteFS**: Distributed SQLite for production

### Testing
- **Playwright**: End-to-end testing
- **Vitest**: Unit and integration testing
- **MSW**: API mocking

## Data Flow
1. User requests hit the Express server
2. React Router handles routing and SSR
3. Route loaders fetch data via Prisma
4. Components render with server data
5. Client-side hydration enables interactivity
`;
  }

  async getTechStack() {
    const packageJson = JSON.parse(await fs.readFile(path.resolve(WORKSPACE_ROOT, 'package.json'), 'utf-8'));
    
    return {
      runtime: 'Node.js',
      framework: 'React Router v7',
      frontend: {
        react: packageJson.dependencies?.react,
        'react-router': packageJson.dependencies?.['react-router'],
        'tailwindcss': packageJson.devDependencies?.tailwindcss,
      },
      backend: {
        express: packageJson.dependencies?.express,
        prisma: packageJson.dependencies?.prisma,
      },
      testing: {
        playwright: packageJson.devDependencies?.['@playwright/test'],
        vitest: packageJson.devDependencies?.vitest,
      },
      deployment: 'Fly.io',
      database: 'SQLite with Prisma ORM',
    };
  }

  async generateStructureSummary() {
    return {
      type: 'Full-stack web application',
      architecture: 'React Router v7 (Remix-style)',
      keyDirectories: {
        'app/': 'Main application code',
        'app/routes/': 'File-based routing',
        'app/components/': 'Reusable React components',
        'app/utils/': 'Utility functions',
        'prisma/': 'Database schema and migrations',
        'tests/': 'Test files',
        'server/': 'Server configuration',
      },
    };
  }

  async analyzeDependencies(deps) {
    const categories = {
      ui: ['@radix-ui', 'tailwindcss', 'class-variance-authority', 'clsx'],
      routing: ['react-router', '@react-router'],
      database: ['prisma', '@prisma'],
      auth: ['remix-auth', '@simplewebauthn'],
      testing: ['playwright', 'vitest', '@testing-library'],
      build: ['vite', '@vitejs', 'typescript'],
      utilities: ['date-fns', 'zod', 'bcryptjs'],
    };
    
    const analysis = {};
    
    for (const [category, keywords] of Object.entries(categories)) {
      analysis[category] = [];
      
      for (const depType of ['production', 'development']) {
        if (deps[depType]) {
          for (const [depName] of Object.entries(deps[depType])) {
            if (keywords.some(keyword => depName.includes(keyword))) {
              analysis[category].push(depName);
            }
          }
        }
      }
    }
    
    return analysis;
  }

  extractRouteInfo(filePath, content) {
    const routePath = filePath.replace('app/routes/', '').replace(/\.(js|jsx|ts|tsx)$/, '');
    
    // Check for loader/action exports
    const hasLoader = content.includes('export async function loader') || content.includes('export const loader');
    const hasAction = content.includes('export async function action') || content.includes('export const action');
    const hasDefault = content.includes('export default');
    
    return {
      path: routePath,
      file: filePath,
      hasLoader,
      hasAction,
      hasComponent: hasDefault,
      type: hasLoader || hasAction ? 'data_route' : 'component_route',
    };
  }

  extractPrismaModels(schema) {
    const models = [];
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let match;
    
    while ((match = modelRegex.exec(schema)) !== null) {
      const modelName = match[1];
      const modelBody = match[2];
      
      // Extract fields
      const fields = [];
      const fieldRegex = /(\w+)\s+(\w+)(?:\?)?(?:\s+@[^\n]*)?/g;
      let fieldMatch;
      
      while ((fieldMatch = fieldRegex.exec(modelBody)) !== null) {
        fields.push({
          name: fieldMatch[1],
          type: fieldMatch[2],
        });
      }
      
      models.push({
        name: modelName,
        fields,
      });
    }
    
    return models;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Music Library MCP Server running on stdio');
  }
}

const server = new CodebaseContextServer();
server.run().catch(console.error);