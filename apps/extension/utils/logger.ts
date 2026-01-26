
/**
 * a simple logger
 */
export class Logger {
    private static prefix = '[Translation Extension]'

    static info(message: string, ...args: any[]): void {
        console.log(`${this.prefix} [INFO]`, message, ...args)
    }

    static warn(message: string, ...args: any[]): void {
        console.warn(`${this.prefix} [WARN]`, message, ...args)
    }

    static error(message: string, ...args: any[]): void {
        console.error(`${this.prefix} [ERROR]`, message, ...args)
    }

    static debug(message: string, ...args: any[]): void {
        if (process.env.NODE_ENV === 'development') {
            console.debug(`${this.prefix} [DEBUG]`, message, ...args)
        }
    }
}
// error handling tools
export const errorUtils = {
    // create a standard error object
    create: (type: string, message: string, details?: any) => {
        const error = new Error(message)
        error.name = type
        if (details) (error as any).details = details
        return error
    },

    // log the error
    log: (error: Error, context?: string): void => {
        console.error(`[ANN Error]${context ? ` ${context}:` : ''}`, error)
    },

    // get a user-friendly error message
    getUserMessage: (error: Error): string => {
        switch (error.name) {
            case 'NetworkError':
                return 'Network connection failed, please check your network settings'
            case 'PermissionError':
                return 'Permission denied, please check your extension permissions'
            case 'ValidationError':
                return 'Invalid input data, please check your input content'
            default:
                return 'Operation failed, please try again later'
        }
    }
}
