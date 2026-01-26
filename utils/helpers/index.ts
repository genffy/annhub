import { nanoid } from 'nanoid'
import CryptoJS from "crypto-js"

export const generateId = (prefix?: string): string => {
    const id = nanoid(12)
    return prefix ? `${prefix}_${id}` : id
}


export const debounce = <T extends (...args: any[]) => any>(
    func: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let timeoutId: NodeJS.Timeout

    return (...args: Parameters<T>) => {
        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => func(...args), delay)
    }
}


export const throttle = <T extends (...args: any[]) => any>(
    func: T,
    delay: number
): ((...args: Parameters<T>) => void) => {
    let lastCall = 0

    return (...args: Parameters<T>) => {
        const now = Date.now()
        if (now - lastCall >= delay) {
            lastCall = now
            func(...args)
        }
    }
}

export function hash(text: string): string {
    return CryptoJS.MD5(text.trim()).toString()
}