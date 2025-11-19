import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';

export interface MCPServerOptions {
  configPath: string;
  endpoint?: string;
  autoStart?: boolean;
  port?: number;
}

export class MCPServerManager {
  private process: ChildProcess | null = null;
  private configPath: string;
  private endpoint: string;

  constructor(options: MCPServerOptions) {
    this.configPath = options.configPath;
    this.endpoint = options.endpoint || 'http://localhost:4000/';
  }

  /**
   * Start the MCP GraphQL Server
   */
  async start(): Promise<void> {
    if (this.process) {
      Logger.warning('MCP server is already running');
      return;
    }

    try {
      Logger.info('Starting MCP GraphQL Server...');

      // Load environment from .env.mcp file if it exists
      const envPath = this.configPath.replace('mcp-config.yaml', '.env.mcp');
      let mcpEnv = { ...process.env };

      try {
        const envContent = await fs.readFile(envPath, 'utf8');

        // Parse .env file
        envContent.split('\n').forEach(line => {
          const match = line.match(/^([^#][^=]+)=(.*)$/);
          if (match) {
            mcpEnv[match[1].trim()] = match[2].trim();
          }
        });
        Logger.info(`Loaded MCP config from: ${envPath}`);
      } catch {
        // If .env.mcp doesn't exist, use defaults
        mcpEnv['ENDPOINT'] = this.endpoint;
        mcpEnv['ALLOW_MUTATIONS'] = 'false';
        Logger.info('Using default MCP configuration');
      }

      this.process = spawn('npx', ['-y', 'mcp-graphql'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: mcpEnv
      });

      // Handle stdout
      this.process.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        if (message) {
          Logger.info(`[MCP] ${message}`);
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message && !message.includes('warning')) {
          Logger.warning(`[MCP] ${message}`);
        }
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          Logger.error(`MCP server exited with code ${code}`);
        }
        this.process = null;
      });

      // Handle errors
      this.process.on('error', (error) => {
        Logger.error('Failed to start MCP server', error);
        this.process = null;
      });

      // Wait a bit to see if it starts successfully
      await this.waitForStartup();

      Logger.success(`MCP GraphQL server started`);
      Logger.info(`GraphQL Endpoint: ${mcpEnv['ENDPOINT']}`);

    } catch (error) {
      Logger.error('Failed to start MCP server', error);
      throw error;
    }
  }

  /**
   * Stop the MCP GraphQL Server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    return new Promise((resolve) => {
      if (!this.process) {
        resolve();
        return;
      }

      Logger.info('Stopping MCP server...');

      this.process.on('exit', () => {
        this.process = null;
        Logger.success('MCP server stopped');
        resolve();
      });

      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
          this.process = null;
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * Check if MCP server is running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Restart the MCP server (useful when config changes)
   */
  async restart(): Promise<void> {
    Logger.info('Restarting MCP server...');
    await this.stop();
    await this.start();
  }

  /**
   * Wait for server to start up
   */
  private async waitForStartup(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Don't reject, just continue
      }, 2000);

      if (this.process) {
        this.process.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      }
    });
  }

  /**
   * Get server status information
   */
  getStatus(): { running: boolean; endpoint: string; configPath: string } {
    return {
      running: this.isRunning(),
      endpoint: this.endpoint,
      configPath: this.configPath
    };
  }
}
