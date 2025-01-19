import {IpfsUploaderConfig} from 'ipfs-uploader'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'

const CONFIG_FILENAME = 'ipfs-upload.config.json'

export const ConfigManager = {
  async readConfig(configPath?: string): Promise<IpfsUploaderConfig> {
    try {
      const targetPath = configPath || join(process.cwd(), CONFIG_FILENAME)
      const configContent = await readFile(targetPath, 'utf8')
      return JSON.parse(configContent)
    } catch {
      throw new Error('Failed to read config file. Run "bgipfs upload config init" first.')
    }
  },
}
