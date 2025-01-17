import {promises as fs} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class TemplateManager {
  private templateDir: string
  private workingDir: string

  constructor(workingDir = '.') {
    this.templateDir = path.join(__dirname, '../../templates')
    this.workingDir = workingDir
  }

  async copyAllTemplates(force = false): Promise<void> {
    try {
      const files = await fs.readdir(this.templateDir)
      await Promise.all(
        files.map(async (file) => {
          const sourcePath = path.join(this.templateDir, file)
          const targetPath = path.join(this.workingDir, file)

          // Skip if file exists and not forcing
          if (!force) {
            try {
              await fs.access(targetPath)
              return
            } catch {}
          }

          await fs.copyFile(sourcePath, targetPath)
        }),
      )
    } catch (error) {
      throw new Error(`Failed to copy templates: ${(error as Error).message}`)
    }
  }
}
