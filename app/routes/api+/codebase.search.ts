import { json, type LoaderFunctionArgs } from 'react-router'
import { glob } from 'glob'
import fs from 'fs/promises'
import path from 'path'

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const query = url.searchParams.get('q')
  const type = url.searchParams.get('type') || 'content'
  
  if (!query) {
    return json({ error: 'Search query is required' }, { status: 400 })
  }
  
  try {
    const results = await searchCodebase(query, type)
    return json({
      query,
      type,
      resultCount: results.length,
      results: results.slice(0, 20), // Limit results
    })
  } catch (error) {
    return json({ error: 'Search failed' }, { status: 500 })
  }
}

async function searchCodebase(query: string, type: string) {
  const results: any[] = []
  const projectRoot = process.cwd()
  
  switch (type) {
    case 'files':
      const files = await glob(query, { 
        cwd: projectRoot, 
        ignore: ['node_modules/**', '.git/**'] 
      })
      results.push(...files.map(file => ({ type: 'file', path: file })))
      break
      
    case 'content':
      const contentFiles = await glob('**/*.{js,jsx,ts,tsx,py,md}', { 
        cwd: projectRoot, 
        ignore: ['node_modules/**', '.git/**'] 
      })
      
      for (const file of contentFiles.slice(0, 50)) { // Limit for performance
        try {
          const content = await fs.readFile(path.resolve(projectRoot, file), 'utf-8')
          if (content.toLowerCase().includes(query.toLowerCase())) {
            const lines = content.split('\n')
            const matchingLines = lines
              .map((line, index) => ({ line: line.trim(), number: index + 1 }))
              .filter(({ line }) => line.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 3) // First 3 matches per file
            
            results.push({
              type: 'content_match',
              file,
              matches: matchingLines,
            })
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
      break
      
    case 'functions':
      const jsFiles = await glob('**/*.{js,jsx,ts,tsx}', { 
        cwd: projectRoot, 
        ignore: ['node_modules/**', '.git/**'] 
      })
      
      for (const file of jsFiles) {
        try {
          const content = await fs.readFile(path.resolve(projectRoot, file), 'utf-8')
          const functions = extractFunctions(content)
          const matchingFunctions = functions.filter(fn => 
            fn.name.toLowerCase().includes(query.toLowerCase())
          )
          
          if (matchingFunctions.length > 0) {
            results.push({
              type: 'function_match',
              file,
              functions: matchingFunctions,
            })
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
      break
  }
  
  return results
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