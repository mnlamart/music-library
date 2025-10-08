import { json, type LoaderFunctionArgs } from 'react-router'
import fs from 'fs/promises'
import path from 'path'

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const filePath = url.searchParams.get('file')
  
  if (!filePath) {
    return json({ error: 'File path is required' }, { status: 400 })
  }
  
  try {
    const fullPath = path.resolve(process.cwd(), filePath)
    
    // Security check - ensure file is within project
    if (!fullPath.startsWith(process.cwd())) {
      return json({ error: 'Invalid file path' }, { status: 403 })
    }
    
    const content = await fs.readFile(fullPath, 'utf-8')
    const stats = await fs.stat(fullPath)
    
    // Analyze file
    const analysis = {
      filePath,
      size: stats.size,
      lastModified: stats.mtime,
      linesOfCode: content.split('\n').length,
      imports: extractImports(content),
      exports: extractExports(content),
      functions: extractFunctions(content),
      fileType: detectFileType(filePath, content),
      purpose: detectFilePurpose(filePath, content),
    }
    
    return json(analysis)
  } catch (error) {
    return json({ error: 'Failed to analyze file' }, { status: 500 })
  }
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const importRegex = /import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/g
  let match
  
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }
  
  return [...new Set(imports)]
}

function extractExports(content: string): Array<{ type: string; name: string }> {
  const exports: Array<{ type: string; name: string }> = []
  
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

function extractFunctions(content: string): Array<{ name: string; type: string }> {
  const functions: Array<{ name: string; type: string }> = []
  
  // Function declarations
  const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g
  let match
  while ((match = functionRegex.exec(content)) !== null) {
    functions.push({ name: match[1], type: 'declaration' })
  }
  
  // Arrow functions
  const arrowFunctionRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g
  while ((match = arrowFunctionRegex.exec(content)) !== null) {
    functions.push({ name: match[1], type: 'arrow' })
  }
  
  return functions
}

function detectFileType(filePath: string, content: string): string {
  const ext = path.extname(filePath)
  const dir = path.dirname(filePath)
  
  if (dir.includes('routes')) return 'route'
  if (dir.includes('components')) return 'component'
  if (dir.includes('utils')) return 'utility'
  if (dir.includes('types')) return 'types'
  if (filePath.includes('test') || filePath.includes('spec')) return 'test'
  if (filePath.includes('config')) return 'configuration'
  if (ext === '.prisma') return 'database_schema'
  if (filePath.includes('server')) return 'server'
  
  return 'module'
}

function detectFilePurpose(filePath: string, content: string): string {
  const fileName = path.basename(filePath)
  
  if (fileName.includes('layout')) return 'Layout component'
  if (fileName.includes('error')) return 'Error handling'
  if (fileName.includes('loading')) return 'Loading state'
  if (fileName.includes('modal')) return 'Modal component'
  if (fileName.includes('form')) return 'Form component'
  if (fileName.includes('auth')) return 'Authentication'
  if (fileName.includes('api')) return 'API integration'
  if (fileName.includes('db') || fileName.includes('database')) return 'Database operations'
  if (content.includes('prisma')) return 'Database operations'
  if (content.includes('fetch') || content.includes('axios')) return 'HTTP client'
  
  return 'General module'
}