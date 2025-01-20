import {confirm} from '@inquirer/prompts'
import {Command} from '@oclif/core'
import chalk from 'chalk'

export abstract class BaseCommand extends Command {
  protected async confirm(message: string): Promise<boolean> {
    return confirm({
      default: false,
      message: chalk.yellow(message),
    })
  }

  protected logError(message: string, options?: {exit?: boolean}): void {
    const defaultOptions = {exit: true}
    const opts = {...defaultOptions, ...options}
    if (opts.exit) {
      this.error(chalk.red(message), {exit: 1})
    } else {
      this.error(chalk.red(message), {exit: false})
    }
  }

  protected logInfo(message: string): void {
    this.log(chalk.blue(`ℹ ${message}`))
  }

  protected logSuccess(message: string): void {
    this.log(chalk.green(`✓ ${message}`))
  }

  protected logWarning(message: string): void {
    this.warn(chalk.yellow(message))
  }
}
