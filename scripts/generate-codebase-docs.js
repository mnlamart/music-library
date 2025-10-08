#!/usr/bin/env node

/**
 * Comprehensive Codebase Documentation Generator
 * 
 * This script generates detailed documentation about the codebase structure,
 * dependencies, and architecture for AI agents to understand the project.
 * 
 * Usage:
 *   npm run generate-docs
 *   node scripts/generate-codebase-docs.js
 * 
 * Output:
 *   - docs/codebase-overview.md
 *   - docs/api-reference.md
 *   - docs/component-library.md
 *   - docs/database-schema.md
 *   - docs/architecture.md
 */

import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DOCS_DIR = path.resolve(PROJECT_ROOT, 'docs')

class CodebaseDocumentationGenerator {
  constructor() {
    this.packageJson = null
    this.prismaSchema = null
  }

  async generate() {
    console.log('🚀 Generating comprehensive codebase documentation...')
    
    // Ensure docs directory exists
    await fs.mkdir(DOCS_DIR, { recursive: true })
    
    // Load project metadata
    await this.loadProjectMetadata()
    
    // Generate all documentation files
    await Promise.all([
      this.generateCodebaseOverview(),
      this.generateApiReference(),
      this.generateComponentLibrary(),
      this.generateDatabaseSchema(),
      this.generateArchitecture(),
      this.generateContextPrompts(),
    ])
    
    console.log('✅ Documentation generated successfully!')
    console.log(`📁 Documentation available in: ${DOCS_DIR}`)
  }

  async loadProjectMetadata() {
    // Load package.json
    const packageJsonPath = path.resolve(PROJECT_ROOT, 'package.json')
    this.packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // Load Prisma schema if exists
    try {
      const schemaPath = path.resolve(PROJECT_ROOT, 'prisma/schema.prisma')
      this.prismaSchema = await fs.readFile(schemaPath, 'utf-8')
    } catch {
      this.prismaSchema = null
    }
  }

  async generateCodebaseOverview() {
    console.log('📝 Generating codebase overview...')
    
    const overview = `# Codebase Overview

## Project Information
- **Name**: ${this.packageJson.name}
- **Version**: ${this.packageJson.version}
- **Description**: ${this.packageJson.description}
- **Node Version**: ${this.packageJson.engines?.node || 'Not specified'}

## Technology Stack

### Frontend
${await this.analyzeFrontendStack()}

### Backend
${await this.analyzeBackendStack()}

### Database
${await this.analyzeDatabaseStack()}

### Development Tools
${await this.analyzeDevTools()}

## Project Structure

\`\`\`
${await this.generateDirectoryTree()}
\`\`\`

## Key Directories

${await this.analyzeKeyDirectories()}

## Dependencies Analysis

### Production Dependencies (${Object.keys(this.packageJson.dependencies || {}).length})
${this.formatDependencies(this.packageJson.dependencies)}

### Development Dependencies (${Object.keys(this.packageJson.devDependencies || {}).length})
${this.formatDependencies(this.packageJson.devDependencies)}

## Scripts
${this.formatScripts()}

## File Statistics
${await this.generateFileStatistics()}
`

    await fs.writeFile(path.resolve(DOCS_DIR, 'codebase-overview.md'), overview)
  }

  async generateApiReference() {
    console.log('🔗 Generating API reference...')
    
    const routes = await this.analyzeRoutes()
    const apiEndpoints = await this.analyzeApiEndpoints()
    
    const apiRef = `# API Reference

## Routes Overview
Total Routes: ${routes.length}

${routes.map(route => `
### ${route.path}
- **File**: \`${route.file}\`
- **Type**: ${route.type}
- **Has Loader**: ${route.hasLoader ? '✅' : '❌'}
- **Has Action**: ${route.hasAction ? '✅' : '❌'}
- **Has Component**: ${route.hasComponent ? '✅' : '❌'}
${route.methods ? `- **Methods**: ${route.methods.join(', ')}` : ''}
`).join('\n')}

## API Endpoints

${apiEndpoints.map(endpoint => `
### ${endpoint.method} ${endpoint.path}
- **File**: \`${endpoint.file}\`
- **Purpose**: ${endpoint.purpose}
- **Parameters**: ${endpoint.parameters.join(', ') || 'None'}
`).join('\n')}

## Route Patterns

### File-based Routing
This project uses React Router v7 file-based routing:

- \`app/routes/\` - Route definitions
- \`_layout.tsx\` - Layout routes
- \`_index.tsx\` - Index routes
- \`$param.tsx\` - Dynamic parameters
- \`api+/\` - API routes

### Route Types
1. **Component Routes**: Render UI components
2. **Data Routes**: Include loaders/actions for data fetching
3. **API Routes**: JSON endpoints for external consumption
4. **Layout Routes**: Shared layouts for nested routes
`

    await fs.writeFile(path.resolve(DOCS_DIR, 'api-reference.md'), apiRef)
  }

  async generateComponentLibrary() {
    console.log('🧩 Generating component library...')
    
    const components = await this.analyzeComponents()
    
    const componentLib = `# Component Library

## Overview
Total Components: ${components.length}

## Component Categories

${this.categorizeComponents(components)}

## Component Details

${components.map(component => `
### ${component.name}
- **File**: \`${component.file}\`
- **Type**: ${component.type}
- **Exports**: ${component.exports.map(exp => exp.name).join(', ')}
- **Dependencies**: ${component.imports.slice(0, 5).join(', ')}${component.imports.length > 5 ? '...' : ''}
- **Purpose**: ${component.purpose}
`).join('\n')}

## UI Component System

### Radix UI Integration
${this.analyzeRadixUsage()}

### Styling System
${this.analyzeStylingSystem()}

## Component Patterns
${this.analyzeComponentPatterns()}
`

    await fs.writeFile(path.resolve(DOCS_DIR, 'component-library.md'), componentLib)
  }

  async generateDatabaseSchema() {
    if (!this.prismaSchema) {
      console.log('⚠️  No Prisma schema found, skipping database documentation')
      return
    }
    
    console.log('🗄️  Generating database schema documentation...')
    
    const models = this.parsePrismaModels()
    
    const schemaDoc = `# Database Schema

## Overview
Database: SQLite with Prisma ORM
Models: ${models.length}

## Models

${models.map(model => `
### ${model.name}
${model.fields.map(field => `- **${field.name}**: ${field.type}${field.optional ? '?' : ''} ${field.attributes.join(' ')}`).join('\n')}

${model.relations.length > 0 ? `**Relations:**\n${model.relations.map(rel => `- ${rel}`).join('\n')}` : ''}
`).join('\n')}

## Relationships
${this.analyzeModelRelationships(models)}

## Migrations
${await this.analyzeMigrations()}

## Seed Data
${await this.analyzeSeedData()}
`

    await fs.writeFile(path.resolve(DOCS_DIR, 'database-schema.md'), schemaDoc)
  }

  async generateArchitecture() {
    console.log('🏗️  Generating architecture documentation...')
    
    const architecture = `# System Architecture

## Application Architecture
This is a full-stack web application built with React Router v7 (Remix-style architecture).

## Technology Stack Overview

### Frontend Layer
- **Framework**: React Router v7 with file-based routing
- **UI Library**: React 19 with Radix UI primitives
- **Styling**: Tailwind CSS utility-first framework
- **State Management**: React state + URL state via React Router
- **Type Safety**: TypeScript throughout

### Backend Layer
- **Server**: Express.js with React Router integration
- **Database**: SQLite with Prisma ORM
- **Authentication**: Remix Auth with session management
- **File Storage**: Local filesystem (development)

### Infrastructure Layer
- **Deployment**: Fly.io with LiteFS for distributed SQLite
- **Build Tool**: Vite for fast development and optimized builds
- **Testing**: Playwright (E2E) + Vitest (unit/integration)
- **Code Quality**: ESLint + Prettier + TypeScript

## Data Flow

### Request Lifecycle
1. **Client Request**: Browser sends request to server
2. **Routing**: React Router matches route and loads data
3. **Data Loading**: Route loaders fetch data via Prisma
4. **Server Rendering**: React components render on server
5. **Hydration**: Client-side JavaScript takes over
6. **Interactions**: Client-side navigation and updates

### Authentication Flow
${await this.analyzeAuthFlow()}

### Database Operations
${this.analyzeDatabaseOperations()}

## File Organization

### Route-based Architecture
\`\`\`
app/
├── routes/           # File-based routing
│   ├── _layout.tsx   # Root layout
│   ├── _index.tsx    # Home page
│   ├── api+/         # API endpoints
│   └── ...           # Feature routes
├── components/       # Reusable UI components
├── utils/           # Utility functions
└── types/           # TypeScript definitions
\`\`\`

### Component Architecture
${this.analyzeComponentArchitecture()}

## Security Considerations
${this.analyzeSecurityFeatures()}

## Performance Optimizations
${this.analyzePerformanceFeatures()}
`

    await fs.writeFile(path.resolve(DOCS_DIR, 'architecture.md'), architecture)
  }

  async generateContextPrompts() {
    console.log('🤖 Generating AI context prompts...')
    
    const contextPrompts = `# AI Context Prompts

## Quick Context Prompt

Use this prompt when asking AI agents about this codebase:

\`\`\`
This is a music library web application built with:
- React Router v7 (file-based routing, SSR)
- React 19 + TypeScript
- Tailwind CSS + Radix UI
- Prisma ORM + SQLite
- Playwright + Vitest testing
- Deployed on Fly.io

Key features:
- YouTube playlist integration
- User authentication
- Music library management
- Modern React patterns

Project structure:
- app/routes/ - File-based routing
- app/components/ - Reusable UI components  
- prisma/ - Database schema
- tests/ - Test files

Please analyze the codebase with this context in mind.
\`\`\`

## Detailed Context for Complex Tasks

For complex development tasks, use this comprehensive prompt:

\`\`\`
CODEBASE CONTEXT:

Project: ${this.packageJson.name}
Type: Full-stack web application
Architecture: React Router v7 (Remix-style)

TECHNOLOGY STACK:
${await this.generateTechStackSummary()}

KEY DIRECTORIES:
${await this.generateDirectorySummary()}

IMPORTANT PATTERNS:
${await this.generatePatternSummary()}

CURRENT FEATURES:
${await this.generateFeatureSummary()}

Please provide solutions that align with the existing architecture and patterns.
\`\`\`

## File-Specific Context

When working with specific files, use the Context7 system:

1. Run: \`npm run generate-prompt <file-path>\`
2. Use the generated Context7 prompt
3. This will fetch relevant documentation for all detected libraries

## API Context for External Agents

For external AI agents accessing via API:

\`\`\`
GET /api/codebase/overview - Project overview
GET /api/codebase/analyze?file=<path> - Analyze specific file
GET /api/codebase/search?q=<query>&type=<type> - Search codebase
\`\`\`

## MCP Server Context

For MCP-compatible agents:
- Use the MCP server in \`mcp-server/\`
- Provides tools for file analysis, search, and project overview
- See \`mcp-server/README.md\` for setup instructions
`

    await fs.writeFile(path.resolve(DOCS_DIR, 'ai-context-prompts.md'), contextPrompts)
  }

  // Helper methods for analysis
  async analyzeFrontendStack() {
    const deps = this.packageJson.dependencies || {}
    const devDeps = this.packageJson.devDependencies || {}
    const allDeps = { ...deps, ...devDeps }
    
    const frontend = []
    if (allDeps['react-router']) frontend.push('- **Framework**: React Router v7')
    if (allDeps['react']) frontend.push('- **UI Library**: React 19')
    if (allDeps['typescript']) frontend.push('- **Language**: TypeScript')
    if (allDeps['tailwindcss']) frontend.push('- **Styling**: Tailwind CSS')
    if (Object.keys(allDeps).some(dep => dep.startsWith('@radix-ui'))) {
      frontend.push('- **Components**: Radix UI primitives')
    }
    
    return frontend.join('\n')
  }

  async analyzeBackendStack() {
    const deps = this.packageJson.dependencies || {}
    
    const backend = []
    if (deps['express']) backend.push('- **Server**: Express.js')
    if (deps['prisma']) backend.push('- **Database**: Prisma ORM')
    if (deps['remix-auth']) backend.push('- **Authentication**: Remix Auth')
    
    return backend.join('\n')
  }

  async analyzeDatabaseStack() {
    if (!this.prismaSchema) return '- No database configuration found'
    
    const database = []
    if (this.prismaSchema.includes('sqlite')) database.push('- **Database**: SQLite')
    if (this.prismaSchema.includes('postgresql')) database.push('- **Database**: PostgreSQL')
    database.push('- **ORM**: Prisma')
    
    return database.join('\n')
  }

  async analyzeDevTools() {
    const devDeps = this.packageJson.devDependencies || {}
    
    const tools = []
    if (devDeps['@playwright/test']) tools.push('- **E2E Testing**: Playwright')
    if (devDeps['vitest']) tools.push('- **Unit Testing**: Vitest')
    if (devDeps['eslint']) tools.push('- **Linting**: ESLint')
    if (devDeps['prettier']) tools.push('- **Formatting**: Prettier')
    if (devDeps['vite']) tools.push('- **Build Tool**: Vite')
    
    return tools.join('\n')
  }

  async generateDirectoryTree() {
    const tree = await this.buildDirectoryTree(PROJECT_ROOT, 2)
    return this.formatDirectoryTree(tree)
  }

  async buildDirectoryTree(dirPath, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return {}
    
    try {
      const items = await fs.readdir(dirPath)
      const tree = {}
      
      for (const item of items.slice(0, 10)) { // Limit items
        if (item.startsWith('.') || item === 'node_modules') continue
        
        const itemPath = path.join(dirPath, item)
        const stats = await fs.stat(itemPath)
        
        if (stats.isDirectory()) {
          const subtree = await this.buildDirectoryTree(itemPath, maxDepth, currentDepth + 1)
          tree[item] = subtree
        } else {
          tree[item] = null // File
        }
      }
      
      return tree
    } catch {
      return {}
    }
  }

  formatDirectoryTree(tree, indent = '') {
    let result = ''
    
    for (const [name, subtree] of Object.entries(tree)) {
      result += `${indent}${name}${subtree === null ? '' : '/'}\n`
      
      if (subtree && typeof subtree === 'object') {
        result += this.formatDirectoryTree(subtree, indent + '  ')
      }
    }
    
    return result
  }

  async analyzeKeyDirectories() {
    const directories = [
      { name: 'app/', purpose: 'Main application code (routes, components, utils)' },
      { name: 'app/routes/', purpose: 'File-based routing with loaders and actions' },
      { name: 'app/components/', purpose: 'Reusable React components' },
      { name: 'app/utils/', purpose: 'Utility functions and helpers' },
      { name: 'prisma/', purpose: 'Database schema, migrations, and seed data' },
      { name: 'tests/', purpose: 'Test files and test utilities' },
      { name: 'server/', purpose: 'Server configuration and setup' },
      { name: 'scripts/', purpose: 'Build scripts and automation tools' },
    ]
    
    return directories.map(dir => `- **${dir.name}**: ${dir.purpose}`).join('\n')
  }

  formatDependencies(deps) {
    if (!deps) return 'None'
    
    return Object.entries(deps)
      .map(([name, version]) => `- ${name}@${version}`)
      .join('\n')
  }

  formatScripts() {
    const scripts = this.packageJson.scripts || {}
    
    return Object.entries(scripts)
      .map(([name, command]) => `- **${name}**: \`${command}\``)
      .join('\n')
  }

  async generateFileStatistics() {
    try {
      const files = await glob('**/*.{js,jsx,ts,tsx,css,md,json}', {
        cwd: PROJECT_ROOT,
        ignore: ['node_modules/**', '.git/**', 'build/**']
      })
      
      const stats = {
        total: files.length,
        typescript: files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx')).length,
        react: files.filter(f => f.endsWith('.jsx') || f.endsWith('.tsx')).length,
        styles: files.filter(f => f.endsWith('.css')).length,
        config: files.filter(f => f.endsWith('.json')).length,
        docs: files.filter(f => f.endsWith('.md')).length,
      }
      
      return `
- **Total Files**: ${stats.total}
- **TypeScript Files**: ${stats.typescript}
- **React Components**: ${stats.react}
- **Style Files**: ${stats.styles}
- **Config Files**: ${stats.config}
- **Documentation**: ${stats.docs}
`
    } catch {
      return 'Unable to calculate file statistics'
    }
  }

  async analyzeRoutes() {
    try {
      const routeFiles = await glob('app/routes/**/*.{js,jsx,ts,tsx}', { cwd: PROJECT_ROOT })
      
      const routes = []
      
      for (const file of routeFiles) {
        const content = await fs.readFile(path.resolve(PROJECT_ROOT, file), 'utf-8')
        const routePath = file.replace('app/routes/', '').replace(/\.(js|jsx|ts|tsx)$/, '')
        
        routes.push({
          path: routePath,
          file,
          hasLoader: content.includes('export async function loader') || content.includes('export const loader'),
          hasAction: content.includes('export async function action') || content.includes('export const action'),
          hasComponent: content.includes('export default'),
          type: this.determineRouteType(file, content),
        })
      }
      
      return routes
    } catch {
      return []
    }
  }

  determineRouteType(file, content) {
    if (file.includes('api+/')) return 'API Route'
    if (file.includes('_layout')) return 'Layout Route'
    if (file.includes('_index')) return 'Index Route'
    if (content.includes('loader') || content.includes('action')) return 'Data Route'
    return 'Component Route'
  }

  async analyzeApiEndpoints() {
    try {
      const apiFiles = await glob('app/routes/api+/**/*.{js,jsx,ts,tsx}', { cwd: PROJECT_ROOT })
      
      const endpoints = []
      
      for (const file of apiFiles) {
        const content = await fs.readFile(path.resolve(PROJECT_ROOT, file), 'utf-8')
        const endpointPath = file.replace('app/routes/api+/', '').replace(/\.(js|jsx|ts|tsx)$/, '')
        
        const methods = []
        if (content.includes('export async function loader') || content.includes('export const loader')) methods.push('GET')
        if (content.includes('export async function action') || content.includes('export const action')) methods.push('POST')
        
        endpoints.push({
          path: `/api/${endpointPath}`,
          file,
          methods,
          purpose: this.extractApiPurpose(content),
          parameters: this.extractApiParameters(content),
        })
      }
      
      return endpoints
    } catch {
      return []
    }
  }

  extractApiPurpose(content) {
    // Simple heuristic to determine API purpose
    if (content.includes('analyze')) return 'File analysis'
    if (content.includes('search')) return 'Codebase search'
    if (content.includes('overview')) return 'Project overview'
    return 'General API endpoint'
  }

  extractApiParameters(content) {
    const params = []
    
    // Look for URL search params
    if (content.includes('searchParams.get')) {
      const matches = content.match(/searchParams\.get\(['"`]([^'"`]+)['"`]\)/g)
      if (matches) {
        params.push(...matches.map(match => match.match(/['"`]([^'"`]+)['"`]/)[1]))
      }
    }
    
    return params
  }

  async analyzeComponents() {
    try {
      const componentFiles = await glob('app/components/**/*.{js,jsx,ts,tsx}', { cwd: PROJECT_ROOT })
      
      const components = []
      
      for (const file of componentFiles) {
        const content = await fs.readFile(path.resolve(PROJECT_ROOT, file), 'utf-8')
        const name = path.basename(file, path.extname(file))
        
        components.push({
          name,
          file,
          type: this.determineComponentType(file, content),
          exports: this.extractExports(content),
          imports: this.extractImports(content),
          purpose: this.determineComponentPurpose(name, content),
        })
      }
      
      return components
    } catch {
      return []
    }
  }

  determineComponentType(file, content) {
    if (file.includes('ui/')) return 'UI Component'
    if (content.includes('forwardRef')) return 'Forwarded Ref Component'
    if (content.includes('useState') || content.includes('useEffect')) return 'Stateful Component'
    return 'Component'
  }

  determineComponentPurpose(name, content) {
    if (name.toLowerCase().includes('form')) return 'Form component'
    if (name.toLowerCase().includes('modal')) return 'Modal component'
    if (name.toLowerCase().includes('button')) return 'Button component'
    if (name.toLowerCase().includes('input')) return 'Input component'
    if (content.includes('children')) return 'Layout/wrapper component'
    return 'UI component'
  }

  extractExports(content) {
    const exports = []
    
    // Export function declarations
    const exportFunctionRegex = /export\s+(async\s+)?function\s+(\w+)/g
    let match
    while ((match = exportFunctionRegex.exec(content)) !== null) {
      exports.push({ type: 'function', name: match[2] })
    }
    
    // Export const declarations
    const exportConstRegex = /export\s+const\s+(\w+)/g
    while ((match = exportConstRegex.exec(content)) !== null) {
      exports.push({ type: 'const', name: match[1] })
    }
    
    // Default exports
    if (content.includes('export default')) {
      exports.push({ type: 'default', name: 'default' })
    }
    
    return exports
  }

  extractImports(content) {
    const imports = []
    const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g
    let match
    
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1])
    }
    
    return [...new Set(imports)]
  }

  categorizeComponents(components) {
    const categories = {
      'UI Components': components.filter(c => c.type === 'UI Component'),
      'Form Components': components.filter(c => c.purpose.includes('Form')),
      'Layout Components': components.filter(c => c.purpose.includes('Layout')),
      'Other Components': components.filter(c => !c.type.includes('UI') && !c.purpose.includes('Form') && !c.purpose.includes('Layout')),
    }
    
    return Object.entries(categories)
      .map(([category, comps]) => `### ${category} (${comps.length})\n${comps.map(c => `- ${c.name}`).join('\n')}`)
      .join('\n\n')
  }

  analyzeRadixUsage() {
    const deps = { ...this.packageJson.dependencies, ...this.packageJson.devDependencies }
    const radixDeps = Object.keys(deps).filter(dep => dep.startsWith('@radix-ui'))
    
    return `
This project uses Radix UI for accessible component primitives:

${radixDeps.map(dep => `- ${dep}`).join('\n')}

Radix provides unstyled, accessible components that are styled with Tailwind CSS.
`
  }

  analyzeStylingSystem() {
    return `
**Tailwind CSS**: Utility-first CSS framework
- Configuration in \`tailwind.config.js\`
- Custom styles in \`app/styles/tailwind.css\`
- Component variants using \`class-variance-authority\`
- Utility functions with \`clsx\` and \`tailwind-merge\`
`
  }

  analyzeComponentPatterns() {
    return `
**Common Patterns:**
1. **Compound Components**: Using Radix UI patterns
2. **Forwarded Refs**: For proper ref handling
3. **Variant Props**: Using CVA for component variants
4. **Composition**: Building complex UIs from simple components
5. **TypeScript**: Full type safety with proper prop interfaces
`
  }

  parsePrismaModels() {
    if (!this.prismaSchema) return []
    
    const models = []
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g
    let match
    
    while ((match = modelRegex.exec(this.prismaSchema)) !== null) {
      const modelName = match[1]
      const modelBody = match[2]
      
      const fields = []
      const relations = []
      
      const fieldLines = modelBody.split('\n').filter(line => line.trim())
      
      for (const line of fieldLines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('//')) continue
        
        const fieldMatch = trimmed.match(/(\w+)\s+(\w+)(\?)?(.*)/)
        if (fieldMatch) {
          const [, name, type, optional, attributes] = fieldMatch
          
          fields.push({
            name,
            type,
            optional: !!optional,
            attributes: attributes.trim().split(/\s+/).filter(Boolean),
          })
          
          // Check for relations
          if (attributes.includes('@relation')) {
            relations.push(`${name} -> ${type}`)
          }
        }
      }
      
      models.push({ name: modelName, fields, relations })
    }
    
    return models
  }

  analyzeModelRelationships(models) {
    const relationships = []
    
    for (const model of models) {
      for (const relation of model.relations) {
        relationships.push(`- ${model.name}: ${relation}`)
      }
    }
    
    return relationships.join('\n') || 'No explicit relationships defined'
  }

  async analyzeMigrations() {
    try {
      const migrationFiles = await glob('prisma/migrations/**/*.sql', { cwd: PROJECT_ROOT })
      return `
**Migration Files**: ${migrationFiles.length}
**Latest Migrations**: ${migrationFiles.slice(-3).map(f => path.basename(f)).join(', ')}
`
    } catch {
      return 'No migrations found'
    }
  }

  async analyzeSeedData() {
    try {
      const seedFile = path.resolve(PROJECT_ROOT, 'prisma/seed.ts')
      await fs.access(seedFile)
      return 'Seed file available at `prisma/seed.ts`'
    } catch {
      return 'No seed file found'
    }
  }

  async analyzeAuthFlow() {
    const deps = this.packageJson.dependencies || {}
    
    if (deps['remix-auth']) {
      return `
**Authentication System**: Remix Auth
1. User submits credentials via form action
2. Remix Auth validates credentials
3. Session is created and stored
4. User is redirected with session cookie
5. Protected routes check session via loader
`
    }
    
    return 'No authentication system detected'
  }

  analyzeDatabaseOperations() {
    return `
**Prisma Operations**:
1. **Queries**: Using Prisma Client in route loaders
2. **Mutations**: Using Prisma Client in route actions  
3. **Transactions**: Atomic operations when needed
4. **Type Safety**: Full TypeScript integration
`
  }

  analyzeComponentArchitecture() {
    return `
**Component Hierarchy**:
- **Pages**: Route components in \`app/routes/\`
- **Layouts**: Shared layouts for route groups
- **Components**: Reusable UI in \`app/components/\`
- **UI Primitives**: Base components in \`app/components/ui/\`

**State Management**:
- **Server State**: Via React Router loaders
- **Client State**: React useState/useReducer
- **URL State**: React Router params/search
- **Form State**: React Router actions
`
  }

  analyzeSecurityFeatures() {
    const deps = this.packageJson.dependencies || {}
    
    const features = []
    if (deps['bcryptjs']) features.push('- Password hashing with bcrypt')
    if (deps['@oslojs/crypto']) features.push('- Cryptographic utilities')
    if (deps['remix-auth']) features.push('- Session-based authentication')
    if (deps['@epic-web/totp']) features.push('- Two-factor authentication support')
    
    return features.join('\n') || 'Basic security measures in place'
  }

  analyzePerformanceFeatures() {
    const deps = { ...this.packageJson.dependencies, ...this.packageJson.devDependencies }
    
    const features = []
    if (deps['vite']) features.push('- Fast development with Vite HMR')
    if (deps['@epic-web/cachified']) features.push('- Response caching with cachified')
    features.push('- Server-side rendering for fast initial loads')
    features.push('- Code splitting via React Router')
    features.push('- Optimized builds with Vite')
    
    return features.join('\n')
  }

  async generateTechStackSummary() {
    return `
Frontend: React Router v7, React 19, TypeScript, Tailwind CSS, Radix UI
Backend: Express.js, Prisma ORM, SQLite, Remix Auth
Testing: Playwright (E2E), Vitest (Unit), MSW (Mocking)
Build: Vite, TypeScript, ESLint, Prettier
Deploy: Fly.io, LiteFS
`
  }

  async generateDirectorySummary() {
    return `
app/routes/ - File-based routing (pages, API endpoints, layouts)
app/components/ - Reusable React components and UI primitives  
app/utils/ - Utility functions and server-side helpers
prisma/ - Database schema, migrations, seed data
tests/ - E2E and unit tests with fixtures
server/ - Express server configuration
`
  }

  async generatePatternSummary() {
    return `
- File-based routing with loaders/actions for data
- Server-side rendering with client hydration
- Type-safe database operations with Prisma
- Accessible UI components with Radix + Tailwind
- Session-based authentication with Remix Auth
- Comprehensive testing with Playwright + Vitest
`
  }

  async generateFeatureSummary() {
    return `
- YouTube playlist integration with OAuth
- User authentication and session management
- Music library management and organization
- Responsive design with modern UI components
- Full-stack TypeScript with type safety
- Comprehensive test coverage
`
  }
}

// Main execution
async function main() {
  const generator = new CodebaseDocumentationGenerator()
  await generator.generate()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { CodebaseDocumentationGenerator }