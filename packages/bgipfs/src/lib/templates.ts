/* eslint-disable no-await-in-loop */
import {promises as fs} from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class TemplateManager {
  private backupDir: string
  private templateDir: string
  private workingDir: string

  constructor(workingDir = '.') {
    this.templateDir = path.join(__dirname, '../../templates')
    this.workingDir = workingDir
    this.backupDir = path.join(this.workingDir, 'config-backup')
  }

  async copyAllTemplates(force = false): Promise<void> {
    try {
      const files = await fs.readdir(this.templateDir)
      const rl = await this.createReadlineInterface()

      let needsAction = false

      // First pass - check status of all files
      for (const file of files) {
        const sourcePath = path.join(this.templateDir, file)
        const targetPath = path.join(this.workingDir, file)

        try {
          await fs.access(targetPath)
          const identical = await this.compareFiles(sourcePath, targetPath)
          if (identical) {
            console.log(`✓ ${file}: up to date`)
          } else {
            console.log(`❗ ${file}: exists but has local modifications`)
            needsAction = true
          }
        } catch {
          console.log(`⨯ ${file}: missing`)
          needsAction = true
        }
      }

      if (!needsAction) {
        console.log('\nAll template files are up to date!')
        rl.close()
        return
      }

      // Second pass - handle required changes
      console.log('\nProcessing required changes...')
      for (const file of files) {
        await this.handleTemplateFile(file, rl, force)
      }

      rl.close()
    } catch (error) {
      throw new Error(`Failed to copy templates: ${(error as Error).message}`)
    }
  }

  private async backupFile(sourcePath: string, filename: string): Promise<void> {
    await fs.mkdir(this.backupDir, {recursive: true})
    const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-')
    const backupPath = path.join(this.backupDir, `${filename}.${timestamp}`)
    await fs.copyFile(sourcePath, backupPath)
  }

  private async compareFiles(path1: string, path2: string): Promise<boolean> {
    try {
      const content1 = await fs.readFile(path1, 'utf8')
      const content2 = await fs.readFile(path2, 'utf8')
      return content1 === content2
    } catch {
      return false
    }
  }

  private async confirmOverwrite(file: string, rl: readline.Interface): Promise<boolean> {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${file} has local changes. Do you want to overwrite? (y/N) `, resolve)
    })
    return answer.toLowerCase() === 'y'
  }

  private async createReadlineInterface() {
    return readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }

  private async handleTemplateFile(file: string, rl: readline.Interface, force: boolean): Promise<void> {
    const sourcePath = path.join(this.templateDir, file)
    const targetPath = path.join(this.workingDir, file)

    try {
      await fs.access(targetPath)
      if (await this.compareFiles(sourcePath, targetPath)) {
        console.log(`Skipping ${file} as it is identical`)
        return // Skip if files are identical
      }

      if (!force && !(await this.confirmOverwrite(file, rl))) {
        return
      }

      await this.backupFile(targetPath, file)
      console.log(`Backed up ${file} to ${this.backupDir}`)
    } catch {
      // File doesn't exist, continue to copy
    }

    await fs.copyFile(sourcePath, targetPath)
  }
}
