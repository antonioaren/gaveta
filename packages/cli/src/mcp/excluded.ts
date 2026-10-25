/** Commands that must not be exposed as MCP tools (stdio transport or long-running). */
export const MCP_EXCLUDED_COMMANDS = new Set(['mcp', 'serve']);
