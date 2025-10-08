#!/usr/bin/env node

/**
 * OpenAI Agent Context Generator
 * 
 * This script generates context specifically optimized for OpenAI agents
 * to understand your codebase structure, patterns, and architecture.
 * 
 * Usage:
 *   npm run openai-context
 *   node scripts/generate-openai-context.js
 * 
 * Output:
 *   - Generates context.json for programmatic access
 *   - Generates context-prompt.txt for direct use
 *   - Creates embeddings-ready documentation
 */

import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

class OpenAIContextGenerator {
  constructor() {
    this.context = {
      project: {},
      architecture: {},
      codebase: {},
      patterns: {},
      apis: {},
      components: {},
      database: {},
      deployment: {},
    }
  }

  async generate() {
    console.log('🤖 Generating OpenAI agent context...')
    
    await this.analyzeProject()
    await this.analyzeArchitecture()
    await this.analyzeCodebase()
    await this.analyzePatterns()
    await this.analyzeApis()
    await this.analyzeComponents()
    await this.analyzeDatabase()
    await this.analyzeDeployment()
    
    await this.generateOutputs()
    
    console.log('✅ OpenAI context generated successfully!')
  }

  async analyzeProject() {
    const packageJson = JSON.parse(await fs.readFile(path.resolve(PROJECT_ROOT, 'package.json'), 'utf-8'))
    const readme = await fs.readFile(path.resolve(PROJECT_ROOT, 'README.md'), 'utf-8').catch(() => '')
    
    this.context.project = {
      name: packageJson.name,
      description: packageJson.description,
      version: packageJson.version,
      type: 'Full-stack web application',
      framework: 'React Router v7 (Remix-style)',
      language: 'TypeScript',
      features: this.extractFeatures(readme),
      keywords: ['music', 'library', 'youtube', 'playlists', 'react', 'typescript'],
    }
  }

  async analyzeArchitecture() {
    this.context.architecture = {
      pattern: 'Full-stack React Router v7 application',
      rendering: 'Server-side rendering with client hydration',
      routing: 'File-based routing with loaders and actions',
      state: 'Server state via loaders, client state via React',
      styling: 'Tailwind CSS with Radix UI components',
      database: 'SQLite with Prisma ORM',
      authentication: 'Session-based with Remix Auth',
      deployment: 'Fly.io with LiteFS for distributed SQLite',
      
      layers: {
        frontend: {
          framework: 'React Router v7',
          ui: 'React 19 + Radix UI',
          styling: 'Tailwind CSS',
          state: 'React state + URL state',
          typescript: 'Full type safety',
        },
        backend: {
          server: 'Express.js',
          database: 'Prisma + SQLite',
          auth: 'Remix Auth',
          api: 'React Router actions/loaders',
        },
        infrastructure: {
          build: 'Vite',
          testing: 'Playwright + Vitest',
          deployment: 'Fly.io',
          storage: 'LiteFS',
        },
      },
    }
  }

  async analyzeCodebase() {
    const files = await glob('**/*.{js,jsx,ts,tsx}', {
      cwd: PROJECT_ROOT,
      ignore: ['node_modules/**', '.git/**', 'build/**']
    })
    
    const structure = await this.analyzeFileStructure()
    const dependencies = await this.analyzeDependencies()
    
    this.context.codebase = {
      totalFiles: files.length,
      structure,
      dependencies,
      conventions: {
        naming: 'kebab-case for files, PascalCase for components',
        imports: 'Absolute imports with # prefix for app code',
        exports: 'Named exports preferred, default for components',
        types: 'TypeScript interfaces and types in separate files',
      },
      patterns: {
        routes: 'File-based routing in app/routes/',
        components: 'Reusable components in app/components/',
        utils: 'Utility functions in app/utils/',
        types: 'Type definitions in app/types/',
      },
    }
  }

  async analyzePatterns() {
    this.context.patterns = {
      routing: {
        type: 'File-based routing',
        location: 'app/routes/',
        conventions: {
          '_layout.tsx': 'Layout routes for nested routing',
          '_index.tsx': 'Index routes for directory roots',
          '$param.tsx': 'Dynamic route parameters',
          'api+/': 'API endpoints returning JSON',
        },
        dataLoading: 'Loaders for GET requests, actions for mutations',
      },
      
      components: {
        structure: 'Compound components with Radix UI',
        styling: 'Tailwind classes with CVA variants',
        props: 'TypeScript interfaces for prop definitions',
        refs: 'forwardRef for proper ref handling',
      },
      
      state: {
        server: 'React Router loaders provide server state',
        client: 'useState/useReducer for local state',
        url: 'Search params and route params for URL state',
        forms: 'React Router actions for form submissions',
      },
      
      error: {
        boundaries: 'Error boundaries for component errors',
        validation: 'Zod schemas for runtime validation',
        types: 'TypeScript for compile-time safety',
      },
    }
  }

  async analyzeApis() {
    const apiRoutes = await glob('app/routes/api+/**/*.{js,jsx,ts,tsx}', { cwd: PROJECT_ROOT })
    const regularRoutes = await glob('app/routes/**/!(api+)*.{js,jsx,ts,tsx}', { cwd: PROJECT_ROOT })
    
    const apis = []
    
    // Analyze API routes
    for (const route of apiRoutes) {
      const content = await fs.readFile(path.resolve(PROJECT_ROOT, route), 'utf-8')
      const endpoint = route.replace('app/routes/api+/', '').replace(/\.(js|jsx|ts|tsx)$/, '')
      
      apis.push({
        path: `/api/${endpoint}`,
        file: route,
        methods: this.extractHttpMethods(content),
        purpose: this.extractApiPurpose(content, endpoint),
        parameters: this.extractParameters(content),
      })
    }
    
    // Analyze regular routes with loaders/actions
    const dataRoutes = []
    for (const route of regularRoutes) {
      const content = await fs.readFile(path.resolve(PROJECT_ROOT, route), 'utf-8')
      const routePath = route.replace('app/routes/', '').replace(/\.(js|jsx|ts|tsx)$/, '')
      
      if (content.includes('loader') || content.includes('action')) {
        dataRoutes.push({
          path: `/${routePath}`,
          file: route,
          hasLoader: content.includes('loader'),
          hasAction: content.includes('action'),
          purpose: this.extractRoutePurpose(routePath, content),
        })
      }
    }
    
    this.context.apis = {
      endpoints: apis,
      dataRoutes,
      conventions: {
        'GET requests': 'Use loader functions',
        'POST/PUT/DELETE': 'Use action functions',
        'JSON APIs': 'Place in api+/ directory',
        'Error handling': 'Return Response objects with status codes',
      },
    }
  }

  async analyzeComponents() {
    const componentFiles = await glob('app/components/**/*.{js,jsx,ts,tsx}', { cwd: PROJECT_ROOT })
    
    const components = []
    const categories = {
      ui: [],
      forms: [],
      layout: [],
      business: [],
    }
    
    for (const file of componentFiles) {
      const content = await fs.readFile(path.resolve(PROJECT_ROOT, file), 'utf-8')
      const name = path.basename(file, path.extname(file))
      
      const component = {
        name,
        file,
        type: this.determineComponentType(file, content),
        props: this.extractComponentProps(content),
        dependencies: this.extractImports(content).filter(imp => !imp.startsWith('.')),
        purpose: this.determineComponentPurpose(name, content),
      }
      
      components.push(component)
      
      // Categorize
      if (file.includes('ui/')) categories.ui.push(component)
      else if (name.toLowerCase().includes('form')) categories.forms.push(component)
      else if (name.toLowerCase().includes('layout')) categories.layout.push(component)
      else categories.business.push(component)
    }
    
    this.context.components = {
      total: components.length,
      categories,
      patterns: {
        'UI Components': 'Built with Radix UI primitives + Tailwind',
        'Form Components': 'Use React Router actions for submission',
        'Layout Components': 'Provide structure and navigation',
        'Business Components': 'Domain-specific functionality',
      },
      conventions: {
        naming: 'PascalCase for component names',
        files: 'kebab-case for file names',
        props: 'TypeScript interfaces for prop types',
        styling: 'Tailwind classes with CVA for variants',
      },
    }
  }

  async analyzeDatabase() {
    try {
      const schemaPath = path.resolve(PROJECT_ROOT, 'prisma/schema.prisma')
      const schema = await fs.readFile(schemaPath, 'utf-8')
      
      const models = this.extractPrismaModels(schema)
      
      this.context.database = {
        orm: 'Prisma',
        database: 'SQLite (development), LiteFS (production)',
        models: models.map(m => ({
          name: m.name,
          fields: m.fields.length,
          relations: m.relations,
        })),
        patterns: {
          queries: 'Use Prisma Client in route loaders',
          mutations: 'Use Prisma Client in route actions',
          transactions: 'Wrap related operations in transactions',
          types: 'Generated TypeScript types from schema',
        },
        conventions: {
          naming: 'PascalCase for model names',
          fields: 'camelCase for field names',
          relations: 'Explicit @relation attributes',
          ids: 'Use cuid2 for unique identifiers',
        },
      }
    } catch {
      this.context.database = {
        orm: 'Prisma',
        status: 'Schema not found or not accessible',
      }
    }
  }

  async analyzeDeployment() {
    try {
      const flyToml = await fs.readFile(path.resolve(PROJECT_ROOT, 'fly.toml'), 'utf-8')
      
      this.context.deployment = {
        platform: 'Fly.io',
        database: 'LiteFS for distributed SQLite',
        regions: this.extractFlyRegions(flyToml),
        features: [
          'Zero-downtime deployments',
          'Automatic SSL certificates',
          'Global edge locations',
          'Health checks and monitoring',
        ],
        configuration: {
          'Build': 'Docker-based builds',
          'Database': 'LiteFS for SQLite replication',
          'Static Assets': 'Served by Express',
          'Environment': 'Production environment variables',
        },
      }
    } catch {
      this.context.deployment = {
        platform: 'Fly.io',
        status: 'Configuration not found',
      }
    }
  }

  async generateOutputs() {
    // Generate JSON context for programmatic access
    await fs.writeFile(
      path.resolve(PROJECT_ROOT, 'context.json'),
      JSON.stringify(this.context, null, 2)
    )
    
    // Generate human-readable prompt
    const prompt = this.generateContextPrompt()
    await fs.writeFile(
      path.resolve(PROJECT_ROOT, 'context-prompt.txt'),
      prompt
    )
    
    // Generate embeddings-ready documentation
    const embeddings = this.generateEmbeddingsDoc()
    await fs.writeFile(
      path.resolve(PROJECT_ROOT, 'context-embeddings.md'),
      embeddings
    )
    
    console.log('📄 Generated files:')
    console.log('  - context.json (programmatic access)')
    console.log('  - context-prompt.txt (direct use in prompts)')
    console.log('  - context-embeddings.md (for embeddings/RAG)')
  }

  generateContextPrompt() {
    return `# Codebase Context for AI Agents

## Project Overview
**Name**: ${this.context.project.name}
**Type**: ${this.context.project.type}
**Framework**: ${this.context.project.framework}
**Language**: ${this.context.project.language}

**Description**: ${this.context.project.description}

**Key Features**: ${this.context.project.features.join(', ')}

## Architecture
**Pattern**: ${this.context.architecture.pattern}
**Rendering**: ${this.context.architecture.rendering}
**Routing**: ${this.context.architecture.routing}
**State Management**: ${this.context.architecture.state}
**Styling**: ${this.context.architecture.styling}
**Database**: ${this.context.architecture.database}
**Authentication**: ${this.context.architecture.authentication}

## Technology Stack
**Frontend**: ${this.context.architecture.layers.frontend.framework}, ${this.context.architecture.layers.frontend.ui}, ${this.context.architecture.layers.frontend.styling}
**Backend**: ${this.context.architecture.layers.backend.server}, ${this.context.architecture.layers.backend.database}
**Infrastructure**: ${this.context.architecture.layers.infrastructure.build}, ${this.context.architecture.layers.infrastructure.testing}

## File Structure
\`\`\`
${this.formatFileStructure()}
\`\`\`

## Key Patterns
**Routing**: ${this.context.patterns.routing.type} in ${this.context.patterns.routing.location}
**Components**: ${this.context.patterns.components.structure}
**State**: ${this.context.patterns.state.server}
**Styling**: ${this.context.patterns.components.styling}

## API Endpoints
${this.context.apis.endpoints.map(api => `- ${api.methods.join('/')} ${api.path} - ${api.purpose}`).join('\n')}

## Database Models
${this.context.database.models ? this.context.database.models.map(m => `- ${m.name} (${m.fields} fields)`).join('\n') : 'No models found'}

## Development Guidelines
1. Use TypeScript for all new code
2. Follow file-based routing conventions
3. Use Prisma for database operations
4. Style with Tailwind CSS and Radix UI
5. Test with Playwright (E2E) and Vitest (unit)
6. Follow existing naming conventions

## When Working on This Codebase:
- Routes go in \`app/routes/\` with loaders for data, actions for mutations
- Components go in \`app/components/\` with TypeScript interfaces
- Use Prisma Client for database operations
- Style with Tailwind classes and CVA for variants
- Follow React Router v7 patterns for data loading
- Use Remix Auth for authentication flows

This is a modern, full-stack TypeScript application. Always maintain type safety and follow the established patterns.`
  }

  generateEmbeddingsDoc() {
    return `# ${this.context.project.name} - Codebase Documentation

## Overview
${this.context.project.description}

This is a ${this.context.project.type} built with ${this.context.project.framework} and ${this.context.project.language}.

## Architecture
The application follows a ${this.context.architecture.pattern} with ${this.context.architecture.rendering}.

Key architectural decisions:
- ${this.context.architecture.routing}
- ${this.context.architecture.state}
- ${this.context.architecture.styling}
- ${this.context.architecture.database}

## Technology Stack
Frontend technologies: ${Object.values(this.context.architecture.layers.frontend).join(', ')}
Backend technologies: ${Object.values(this.context.architecture.layers.backend).join(', ')}
Infrastructure: ${Object.values(this.context.architecture.layers.infrastructure).join(', ')}

## File Organization
The codebase is organized with the following structure:
${this.formatFileStructure()}

## Routing System
${this.context.patterns.routing.type} located in ${this.context.patterns.routing.location}.

Routing conventions:
${Object.entries(this.context.patterns.routing.conventions).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

## Component System
${this.context.patterns.components.structure} with ${this.context.patterns.components.styling}.

Component categories:
${Object.entries(this.context.components.categories).map(([category, components]) => `- ${category}: ${components.length} components`).join('\n')}

## API Design
The application provides ${this.context.apis.endpoints.length} API endpoints and ${this.context.apis.dataRoutes.length} data routes.

API conventions:
${Object.entries(this.context.apis.conventions).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

## Database Schema
${this.context.database.orm} ORM with ${this.context.database.database}.

${this.context.database.models ? `Database models: ${this.context.database.models.map(m => m.name).join(', ')}` : 'No database models found'}

## Development Patterns
State management: ${this.context.patterns.state.server}
Error handling: ${this.context.patterns.error.boundaries}
Styling approach: ${this.context.patterns.components.styling}

## Key Features
${this.context.project.features.join('\n')}

## Deployment
Platform: ${this.context.deployment.platform}
${this.context.deployment.database ? `Database: ${this.context.deployment.database}` : ''}

This documentation provides comprehensive context for understanding and working with the codebase.`
  }

  // Helper methods
  extractFeatures(readme) {
    const features = []
    if (readme.toLowerCase().includes('youtube')) features.push('YouTube playlist integration')
    if (readme.toLowerCase().includes('auth')) features.push('User authentication')
    if (readme.toLowerCase().includes('music')) features.push('Music library management')
    if (readme.toLowerCase().includes('playlist')) features.push('Playlist management')
    return features
  }

  async analyzeFileStructure() {
    const structure = {}
    
    try {
      const items = await fs.readdir(PROJECT_ROOT)
      
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue
        
        const itemPath = path.join(PROJECT_ROOT, item)
        const stats = await fs.stat(itemPath)
        
        if (stats.isDirectory() && ['app', 'prisma', 'tests', 'server', 'scripts'].includes(item)) {
          const subItems = await fs.readdir(itemPath).catch(() => [])
          structure[item] = {
            type: 'directory',
            items: subItems.filter(sub => !sub.startsWith('.')).length,
          }
        }
      }
    } catch (error) {
      // Handle error
    }
    
    return structure
  }

  async analyzeDependencies() {
    const packageJson = JSON.parse(await fs.readFile(path.resolve(PROJECT_ROOT, 'package.json'), 'utf-8'))
    
    return {
      production: Object.keys(packageJson.dependencies || {}).length,
      development: Object.keys(packageJson.devDependencies || {}).length,
      key: this.extractKeyDependencies(packageJson),
    }
  }

  extractKeyDependencies(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
    const key = []
    
    if (deps['react-router']) key.push('React Router v7')
    if (deps['react']) key.push('React')
    if (deps['typescript']) key.push('TypeScript')
    if (deps['prisma']) key.push('Prisma')
    if (deps['tailwindcss']) key.push('Tailwind CSS')
    if (deps['@playwright/test']) key.push('Playwright')
    
    return key
  }

  extractHttpMethods(content) {
    const methods = []
    if (content.includes('export async function loader') || content.includes('export const loader')) methods.push('GET')
    if (content.includes('export async function action') || content.includes('export const action')) methods.push('POST')
    return methods
  }

  extractApiPurpose(content, endpoint) {
    if (endpoint.includes('analyze')) return 'File analysis'
    if (endpoint.includes('search')) return 'Codebase search'
    if (endpoint.includes('overview')) return 'Project overview'
    if (content.includes('prisma')) return 'Database operations'
    return 'API endpoint'
  }

  extractParameters(content) {
    const params = []
    const matches = content.match(/searchParams\.get\(['"`]([^'"`]+)['"`]\)/g)
    if (matches) {
      params.push(...matches.map(match => match.match(/['"`]([^'"`]+)['"`]/)[1]))
    }
    return params
  }

  extractRoutePurpose(routePath, content) {
    if (routePath.includes('auth')) return 'Authentication'
    if (routePath.includes('youtube')) return 'YouTube integration'
    if (routePath.includes('playlist')) return 'Playlist management'
    if (content.includes('prisma')) return 'Database operations'
    return 'Application route'
  }

  determineComponentType(file, content) {
    if (file.includes('ui/')) return 'UI Primitive'
    if (content.includes('forwardRef')) return 'Forwarded Component'
    if (content.includes('useState') || content.includes('useEffect')) return 'Stateful Component'
    return 'Component'
  }

  extractComponentProps(content) {
    const props = []
    const interfaceMatch = content.match(/interface\s+\w*Props\s*\{([^}]+)\}/)
    if (interfaceMatch) {
      const propsText = interfaceMatch[1]
      const propMatches = propsText.match(/(\w+)(?:\?)?\s*:/g)
      if (propMatches) {
        props.push(...propMatches.map(match => match.replace(/[?:]/g, '').trim()))
      }
    }
    return props
  }

  determineComponentPurpose(name, content) {
    if (name.toLowerCase().includes('form')) return 'Form handling'
    if (name.toLowerCase().includes('modal')) return 'Modal dialog'
    if (name.toLowerCase().includes('button')) return 'User interaction'
    if (name.toLowerCase().includes('input')) return 'Data input'
    if (content.includes('children')) return 'Layout/wrapper'
    return 'UI component'
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

  extractPrismaModels(schema) {
    const models = []
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g
    let match
    
    while ((match = modelRegex.exec(schema)) !== null) {
      const modelName = match[1]
      const modelBody = match[2]
      
      const fields = []
      const relations = []
      
      const fieldLines = modelBody.split('\n').filter(line => line.trim())
      
      for (const line of fieldLines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('//')) continue
        
        const fieldMatch = trimmed.match(/(\w+)\s+(\w+)/)
        if (fieldMatch) {
          fields.push(fieldMatch[1])
          
          if (trimmed.includes('@relation')) {
            relations.push(fieldMatch[2])
          }
        }
      }
      
      models.push({ name: modelName, fields, relations })
    }
    
    return models
  }

  extractFlyRegions(flyToml) {
    const regionMatch = flyToml.match(/primary_region\s*=\s*['"`]([^'"`]+)['"`]/)
    return regionMatch ? [regionMatch[1]] : ['unknown']
  }

  formatFileStructure() {
    const structure = this.context.codebase.structure
    return Object.entries(structure)
      .map(([name, info]) => `${name}/ (${info.items} items)`)
      .join('\n')
  }
}

// Main execution
async function main() {
  const generator = new OpenAIContextGenerator()
  await generator.generate()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { OpenAIContextGenerator }