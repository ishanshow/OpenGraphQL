#!/bin/bash
# Setup script for Claude Desktop MCP configuration

echo "========================================"
echo "Claude Desktop MCP Setup Helper"
echo "========================================"
echo ""

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
SOURCE_CONFIG="$(dirname "$0")/../generated/claude-desktop-config.json"

# Check if Claude Desktop is installed
if [ ! -d "/Applications/Claude.app" ]; then
    echo "⚠️  Claude Desktop is not installed"
    echo ""
    echo "Please download and install from:"
    echo "https://claude.ai/download"
    echo ""
    echo "After installation:"
    echo "1. Run Claude Desktop once to create config directory"
    echo "2. Run this script again"
    exit 1
fi

echo "✓ Claude Desktop is installed"
echo ""

# Create config directory if it doesn't exist
if [ ! -d "$CONFIG_DIR" ]; then
    echo "Creating Claude config directory..."
    mkdir -p "$CONFIG_DIR"
    echo "✓ Created: $CONFIG_DIR"
else
    echo "✓ Config directory exists: $CONFIG_DIR"
fi

echo ""

# Check if source config exists
if [ ! -f "$SOURCE_CONFIG" ]; then
    echo "⚠️  Generated config not found: $SOURCE_CONFIG"
    echo ""
    echo "Please run first:"
    echo "  npm run generate"
    exit 1
fi

echo "✓ Found generated config: $SOURCE_CONFIG"
echo ""

# Backup existing config if it exists
if [ -f "$CONFIG_FILE" ]; then
    BACKUP_FILE="$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
    echo "Backing up existing config to:"
    echo "  $BACKUP_FILE"
    cp "$CONFIG_FILE" "$BACKUP_FILE"
    echo ""
fi

# Copy the config
echo "Installing MCP configuration..."
cp "$SOURCE_CONFIG" "$CONFIG_FILE"

echo "✓ Configuration installed successfully!"
echo ""
echo "Configuration details:"
cat "$CONFIG_FILE"
echo ""
echo "========================================"
echo "Next Steps:"
echo "========================================"
echo "1. Restart Claude Desktop"
echo "2. Start your GraphQL server:"
echo "     npm run serve"
echo "3. Start the MCP server:"
echo "     npm run mcp:start"
echo "4. Open Claude Desktop and try querying your GraphQL data!"
echo ""
echo "The MCP server name in Claude will be: graphql-mongodb"
echo ""
