/**
 * Logger - Configurable logging utility
 */

export interface LoggerOptions {
  verbose: boolean;
  prefix?: string;
}

export class Logger {
  private readonly prefix: string;

  constructor(private readonly options: LoggerOptions) {
    this.prefix = options.prefix || '[kilo-refactor]';
  }

  info(message: string): void {
    console.log(`${this.prefix} ${message}`);
  }

  warn(message: string): void {
    console.warn(`${this.prefix} ⚠ ${message}`);
  }

  error(message: string): void {
    console.error(`${this.prefix} ✗ ${message}`);
  }

  debug(message: string): void {
    if (this.options.verbose) {
      console.debug(`${this.prefix} [debug] ${message}`);
    }
  }

  success(message: string): void {
    console.log(`${this.prefix} ✓ ${message}`);
  }

  progress(current: number, total: number, message: string): void {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    process.stdout.write(`\r${this.prefix} [${bar}] ${percent}% ${message}`);
    if (current === total) {
      process.stdout.write('\n');
    }
  }
}
