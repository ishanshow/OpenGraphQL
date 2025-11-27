#!/bin/bash
# Setup script for Cursor MCP configuration

echo "========================================"
echo "Cursor MCP Setup Helper"
echo "========================================"
echo ""

# Check for Cursor configuration locations
CURSOR_CONFIG_DIRS=(
  "$HOME/.cursor"
  "$HOME/Library/Application Support/Cursor/User"
)

# Cursor checks both mcp.json and mcp_settings.json
CURSOR_MCP_FILES=("mcp.json" "mcp_settings.json")
SOURCE_CONFIG="$(dirname "$0")/../generated/cursor-mcp-config.json"

echo "Looking for Cursor configuration directory..."
echo ""

CURSOR_DIR=""
for dir in "${CURSOR_CONFIG_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    CURSOR_DIR="$dir"
    echo "✓ Found Cursor directory: $CURSOR_DIR"
    break
  fi
done

if [ -z "$CURSOR_DIR" ]; then
  echo "⚠️  Cursor configuration directory not found"
  echo ""
  echo "Expected locations:"
  for dir in "${CURSOR_CONFIG_DIRS[@]}"; do
    echo "  - $dir"
  done
  echo ""
  echo "Please ensure Cursor is installed and run it at least once."
  exit 1
fi

echo ""

# Create MCP settings files (both mcp.json and mcp_settings.json)
echo "Installing MCP configuration to both mcp.json and mcp_settings.json..."
echo ""

for MCP_FILE in "${CURSOR_MCP_FILES[@]}"; do
  MCP_CONFIG="$CURSOR_DIR/$MCP_FILE"

  if [ -f "$MCP_CONFIG" ]; then
    BACKUP_FILE="$MCP_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Backing up existing $MCP_FILE to:"
    echo "  $BACKUP_FILE"
    cp "$MCP_CONFIG" "$BACKUP_FILE"
  fi

  cp "$SOURCE_CONFIG" "$MCP_CONFIG"
  echo "✓ Installed: $MCP_CONFIG"
done

echo ""
echo "Configuration details:"
cat "$CURSOR_DIR/mcp.json"
echo ""
echo "========================================"
echo "Next Steps:"
echo "========================================"
echo "1. Restart Cursor"
echo "2. Start your GraphQL server:"
echo "     npm run serve"
echo "3. The MCP server will start automatically when Cursor needs it"
echo "4. In Cursor, you can now ask AI to query your GraphQL schema!"
echo ""
echo "Example prompts in Cursor:"
echo "  - 'Show me the GraphQL schema types'"
echo "  - 'Query all movies from the database'"
echo "  - 'What fields are available in the Movie type?'"
echo ""
