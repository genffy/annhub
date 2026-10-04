import { nanoid } from 'nanoid'
import CryptoJS from 'crypto-js'

export const generateId = (prefix?: string): string => {
  const id = nanoid(12)
  return prefix ? `${prefix}_${id}` : id
}

export function hash(text: string): string {
  return CryptoJS.MD5(text.trim()).toString()
}
