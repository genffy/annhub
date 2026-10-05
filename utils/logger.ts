/**
 * a simple logger with production-mode suppression
 */
export class Logger {
  private static prefix = '[AnnHub]'
  private static get isProduction(): boolean {
    try {
      return import.meta.env.MODE === 'production'
    } catch {
      return false
    }
  }

  static info(message: string, ...args: any[]): void {
    if (this.isProduction) return
    console.log(`${this.prefix} [INFO]`, message, ...args)
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`${this.prefix} [WARN]`, message, ...args)
  }

  static error(message: string, ...args: any[]): void {
    console.error(`${this.prefix} [ERROR]`, message, ...args)
  }

  static debug(message: string, ...args: any[]): void {
    if (this.isProduction) return
    console.debug(`${this.prefix} [DEBUG]`, message, ...args)
  }
}
