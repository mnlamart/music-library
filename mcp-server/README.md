# Music Library MCP Server

This MCP (Model Context Protocol) server provides AI agents with comprehensive context about the music library codebase.

## Features

### Tools
- **analyze_file**: Analyze any file for dependencies, purpose, and structure
- **search_codebase**: Search for files, content, functions, or imports
- **get_project_structure**: Get directory tree and architecture overview
- **get_dependencies**: Analyze project dependencies by category
- **get_api_routes**: Extract all React Router routes and handlers
- **get_database_schema**: Parse Prisma schema and models

### Resources
- **Project Overview**: High-level project description and features
- **Architecture**: System architecture and technology stack
- **Tech Stack**: Complete dependency analysis

## Installation

1. Install dependencies:
```bash
cd mcp-server
npm install
```

2. Configure in your MCP client (Claude Desktop, etc.):

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "music-library-codebase": {
      "command": "node",
      "args": ["/path/to/your/workspace/mcp-server/index.js"],
      "env": {}
    }
  }
}
```

### OpenAI GPT Configuration

For OpenAI agents, you can use this server via:

1. **Direct integration**: Use the MCP SDK in your OpenAI application
2. **HTTP wrapper**: Create an HTTP API wrapper (see below)
3. **Context injection**: Use the generated documentation directly

## Usage Examples

Once connected, you can ask the AI agent:

- "Analyze the app/routes/youtube/playlists.tsx file"
- "Search for all files that use Prisma"
- "Show me the project structure"
- "What are the main dependencies and their purposes?"
- "List all API routes in the application"
- "Explain the database schema"

## HTTP API Wrapper (Optional)

If you need HTTP access instead of MCP, you can create a simple Express wrapper:

```javascript
import express from 'express';
import { CodebaseContextServer } from './index.js';

const app = express();
const mcpServer = new CodebaseContextServer();

app.get('/api/analyze/:filePath', async (req, res) => {
  const result = await mcpServer.analyzeFile(req.params.filePath);
  res.json(result);
});

app.listen(3001, () => {
  console.log('Codebase API running on http://localhost:3001');
});
```

## Development

Run in development mode:
```bash
npm run dev
```

The server will restart automatically when files change.