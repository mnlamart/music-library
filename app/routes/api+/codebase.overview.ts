import { json } from 'react-router'
import fs from 'fs/promises'
import path from 'path'

export async function loader() {
  try {
    const projectRoot = process.cwd()
    
    // Read package.json
    const packageJsonPath = path.resolve(projectRoot, 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
    
    // Read README
    const readmePath = path.resolve(projectRoot, 'README.md')
    const readme = await fs.readFile(readmePath, 'utf-8').catch(() => '')
    
    // Analyze project structure
    const structure = await getProjectStructure(projectRoot)
    
    // Get tech stack
    const techStack = analyzeTechStack(packageJson)
    
    // Get route count
    const routeCount = await getRouteCount(projectRoot)
    
    const overview = {
      name: packageJson.name || 'Music Library Project',
      description: packageJson.description || 'A music library application built with the Epic Stack',
      version: packageJson.version,
      nodeVersion: packageJson.engines?.node,
      techStack,
      structure,
      routeCount,
      features: extractFeatures(readme),
      lastUpdated: new Date().toISOString(),
    }
    
    return json(overview)
  } catch (error) {
    return json({ error: 'Failed to generate overview' }, { status: 500 })
  }
}

async function getProjectStructure(projectRoot: string) {
  const structure: Record<string, any> = {}
  
  try {
    const items = await fs.readdir(projectRoot)
    
    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules') continue
      
      const itemPath = path.join(projectRoot, item)
      const stats = await fs.stat(itemPath)
      
      if (stats.isDirectory()) {
        // Get subdirectory info for key directories
        if (['app', 'prisma', 'tests', 'server'].includes(item)) {
          const subItems = await fs.readdir(itemPath).catch(() => [])
          structure[item] = {
            type: 'directory',
            itemCount: subItems.length,
            items: subItems.filter(sub => !sub.startsWith('.')).slice(0, 10), // First 10 items
          }
        } else {
          structure[item] = { type: 'directory' }
        }
      } else {
        structure[item] = { type: 'file', size: stats.size }
      }
    }
  } catch (error) {
    // Handle error
  }
  
  return structure
}

function analyzeTechStack(packageJson: any) {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  
  const categories = {
    frontend: {
      framework: getFramework(deps),
      ui: getUILibraries(deps),
      styling: getStylingLibraries(deps),
    },
    backend: {
      server: getServerLibraries(deps),
      database: getDatabaseLibraries(deps),
      auth: getAuthLibraries(deps),
    },
    development: {
      testing: getTestingLibraries(deps),
      build: getBuildTools(deps),
      linting: getLintingTools(deps),
    },
  }
  
  return categories
}

function getFramework(deps: Record<string, string>) {
  if (deps['react-router']) return 'React Router v7'
  if (deps['@remix-run/react']) return 'Remix'
  if (deps['next']) return 'Next.js'
  if (deps['react']) return 'React'
  return 'Unknown'
}

function getUILibraries(deps: Record<string, string>) {
  const uiLibs = []
  if (Object.keys(deps).some(dep => dep.startsWith('@radix-ui'))) uiLibs.push('Radix UI')
  if (deps['@headlessui/react']) uiLibs.push('Headless UI')
  if (deps['@mui/material']) uiLibs.push('Material-UI')
  return uiLibs
}

function getStylingLibraries(deps: Record<string, string>) {
  const styling = []
  if (deps['tailwindcss']) styling.push('Tailwind CSS')
  if (deps['styled-components']) styling.push('Styled Components')
  if (deps['@emotion/react']) styling.push('Emotion')
  return styling
}

function getServerLibraries(deps: Record<string, string>) {
  const server = []
  if (deps['express']) server.push('Express')
  if (deps['fastify']) server.push('Fastify')
  if (deps['koa']) server.push('Koa')
  return server
}

function getDatabaseLibraries(deps: Record<string, string>) {
  const db = []
  if (deps['prisma']) db.push('Prisma')
  if (deps['mongoose']) db.push('Mongoose')
  if (deps['sequelize']) db.push('Sequelize')
  if (deps['typeorm']) db.push('TypeORM')
  return db
}

function getAuthLibraries(deps: Record<string, string>) {
  const auth = []
  if (deps['remix-auth']) auth.push('Remix Auth')
  if (deps['next-auth']) auth.push('NextAuth')
  if (deps['passport']) auth.push('Passport')
  return auth
}

function getTestingLibraries(deps: Record<string, string>) {
  const testing = []
  if (deps['@playwright/test']) testing.push('Playwright')
  if (deps['vitest']) testing.push('Vitest')
  if (deps['jest']) testing.push('Jest')
  if (Object.keys(deps).some(dep => dep.startsWith('@testing-library'))) testing.push('Testing Library')
  return testing
}

function getBuildTools(deps: Record<string, string>) {
  const build = []
  if (deps['vite']) build.push('Vite')
  if (deps['webpack']) build.push('Webpack')
  if (deps['rollup']) build.push('Rollup')
  if (deps['typescript']) build.push('TypeScript')
  return build
}

function getLintingTools(deps: Record<string, string>) {
  const linting = []
  if (deps['eslint']) linting.push('ESLint')
  if (deps['prettier']) linting.push('Prettier')
  return linting
}

async function getRouteCount(projectRoot: string) {
  try {
    const { glob } = await import('glob')
    const routeFiles = await glob('app/routes/**/*.{js,jsx,ts,tsx}', { cwd: projectRoot })
    return routeFiles.length
  } catch {
    return 0
  }
}

function extractFeatures(readme: string) {
  const features = []
  
  if (readme.toLowerCase().includes('youtube')) features.push('YouTube Integration')
  if (readme.toLowerCase().includes('playlist')) features.push('Playlist Management')
  if (readme.toLowerCase().includes('auth')) features.push('Authentication')
  if (readme.toLowerCase().includes('oauth')) features.push('OAuth Integration')
  if (readme.toLowerCase().includes('api')) features.push('API Integration')
  if (readme.toLowerCase().includes('database')) features.push('Database Management')
  
  return features
}