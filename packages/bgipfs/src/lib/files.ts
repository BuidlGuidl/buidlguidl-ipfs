import {promises as fs} from 'node:fs'

export const fileExists = async (filePath: string): Promise<boolean> =>
  fs
    .access(filePath)
    .then(() => true)
    .catch(() => false)

export const isPermissionError = (error: unknown): boolean => {
  const {code} = error as NodeJS.ErrnoException
  return code === 'EACCES' || code === 'EPERM'
}
