import chalk from 'chalk';

export class Logger {
  static info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  static success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  static error(message: string, error?: any): void {
    console.error(chalk.red('✗'), message);
    if (error) {
      if (error instanceof Error) {
        console.error(chalk.red(error.stack || error.message));
      } else if (typeof error === 'object') {
        console.error(chalk.red(JSON.stringify(error, null, 2)));
      } else {
        console.error(chalk.red(String(error)));
      }
    }
  }

  static warning(message: string): void {
    console.log(chalk.yellow('⚠'), message);
  }

  static debug(message: string, data?: any): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛'), message);
      if (data) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }

  static section(title: string): void {
    console.log('\n' + chalk.bold.cyan('━'.repeat(50)));
    console.log(chalk.bold.cyan(title));
    console.log(chalk.bold.cyan('━'.repeat(50)) + '\n');
  }
}

