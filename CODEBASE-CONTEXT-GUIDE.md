# 🤖 Giving AI Agents Context About Your Codebase

This guide shows you multiple ways to give OpenAI agents (and other AI systems) comprehensive context about your music library codebase.

## 🎯 Quick Start

### For Immediate Use
```bash
# Generate context for OpenAI agents
npm run openai-context

# This creates:
# - context.json (programmatic access)
# - context-prompt.txt (copy-paste into prompts)
# - context-embeddings.md (for RAG systems)
```

### For File-Specific Context
```bash
# Analyze a specific file with Context7
npm run generate-prompt app/routes/youtube/playlists.tsx

# This adds @context7 headers and generates prompts
```

## 🛠️ Available Solutions

### 1. **MCP Server** (Recommended for Claude Desktop/MCP clients)

**Location**: `mcp-server/`

**Setup**:
```bash
cd mcp-server
npm install
```

**Features**:
- Real-time file analysis
- Codebase search capabilities
- Project structure overview
- Database schema analysis
- API route discovery

**Usage**: Configure in Claude Desktop or other MCP clients

### 2. **HTTP API Endpoints** (For web-based AI agents)

**Endpoints**:
- `GET /api/codebase/overview` - Project overview
- `GET /api/codebase/analyze?file=<path>` - Analyze specific file
- `GET /api/codebase/search?q=<query>&type=<type>` - Search codebase

**Usage**:
```bash
npm run dev
curl "http://localhost:3000/api/codebase/overview"
```

### 3. **Context Generation Scripts** (For any AI agent)

**Scripts**:
```bash
npm run openai-context      # OpenAI-optimized context
npm run generate-docs       # Comprehensive documentation
npm run generate-prompt     # Context7 prompts for files
```

**Outputs**:
- `context.json` - Structured data for programmatic access
- `context-prompt.txt` - Human-readable prompt for direct use
- `docs/` - Comprehensive markdown documentation

### 4. **Enhanced Context7 System** (Already exists!)

Your existing Context7 system is already sophisticated:

```bash
# Analyze any file and generate Context7 prompts
npm run generate-prompt app/components/user-dropdown.tsx

# Add Context7 headers to files
npm run add-headers
```

## 📋 Context Information Provided

### Project Overview
- **Name**: music-library-5a00
- **Type**: Full-stack web application
- **Framework**: React Router v7 (Remix-style)
- **Language**: TypeScript
- **Features**: YouTube integration, authentication, music library management

### Technology Stack
- **Frontend**: React Router v7, React 19, TypeScript, Tailwind CSS, Radix UI
- **Backend**: Express.js, Prisma ORM, SQLite, Remix Auth
- **Testing**: Playwright (E2E), Vitest (Unit), MSW (Mocking)
- **Build**: Vite, TypeScript, ESLint, Prettier
- **Deploy**: Fly.io, LiteFS

### Architecture Patterns
- File-based routing with loaders/actions
- Server-side rendering with client hydration
- Type-safe database operations with Prisma
- Accessible UI components with Radix + Tailwind
- Session-based authentication

### File Structure
```
app/
├── routes/           # File-based routing
├── components/       # Reusable UI components
├── utils/           # Utility functions
└── types/           # TypeScript definitions
prisma/              # Database schema
tests/               # Test files
server/              # Server configuration
```

## 🚀 Usage Examples

### For OpenAI GPT Agents

**Option 1: Use generated context**
```bash
npm run openai-context
# Copy content from context-prompt.txt into your GPT prompt
```

**Option 2: Use HTTP API**
```javascript
// In your OpenAI agent code
const response = await fetch('http://localhost:3000/api/codebase/overview')
const context = await response.json()
// Use context in your prompts
```

**Option 3: Use MCP Server**
```javascript
// If your agent supports MCP
import { MCPClient } from '@modelcontextprotocol/sdk'
// Connect to the MCP server for real-time context
```

### For Other AI Systems

**Anthropic Claude**: Use the MCP server directly
**Google Gemini**: Use the generated context files
**Custom Agents**: Use the HTTP API or JSON context

## 🎯 Best Practices

### When to Use Each Method

1. **MCP Server**: Best for interactive development with Claude Desktop
2. **HTTP API**: Best for web-based agents or custom integrations
3. **Context Files**: Best for one-time analysis or documentation
4. **Context7**: Best for file-specific analysis and library documentation

### Prompt Engineering Tips

1. **Start with project context**: Always include the technology stack
2. **Be specific about patterns**: Mention React Router v7, Prisma patterns
3. **Include file structure**: Help AI understand where things belong
4. **Mention conventions**: TypeScript, Tailwind, file naming patterns

### Example Prompt Template

```
CONTEXT: This is a music library web application built with React Router v7, TypeScript, Prisma, and Tailwind CSS. It features YouTube playlist integration and follows modern React patterns.

ARCHITECTURE: File-based routing in app/routes/, reusable components in app/components/, Prisma for database operations, and Tailwind + Radix UI for styling.

TASK: [Your specific request here]

Please ensure your solution follows the existing patterns and conventions.
```

## 🔧 Customization

### Adding New Context Sources

1. **Extend MCP Server**: Add new tools in `mcp-server/index.js`
2. **Add API Endpoints**: Create new routes in `app/routes/api+/`
3. **Enhance Scripts**: Modify generation scripts for specific needs

### Integration Examples

```javascript
// Example: Custom OpenAI integration
import { readFileSync } from 'fs'

const context = JSON.parse(readFileSync('context.json', 'utf-8'))

const prompt = `
Given this codebase context:
${JSON.stringify(context, null, 2)}

Please help me: ${userRequest}
`

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: prompt }]
})
```

## 📚 Additional Resources

- **MCP Documentation**: See `mcp-server/README.md`
- **API Documentation**: See `docs/api-reference.md` (generated)
- **Architecture Guide**: See `docs/architecture.md` (generated)
- **Component Library**: See `docs/component-library.md` (generated)

## 🤝 Contributing

To add new context sources or improve existing ones:

1. Modify the appropriate script in `scripts/`
2. Add new MCP tools in `mcp-server/index.js`
3. Create new API endpoints in `app/routes/api+/`
4. Update this guide with new features

---

**Result**: You now have multiple robust ways to give any AI agent comprehensive context about your codebase! 🎉