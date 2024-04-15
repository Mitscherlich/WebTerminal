import type { FsContainer } from '../fs'
import type { CommandOptions } from './types'

export abstract class BaseCommand {
  options: CommandOptions

  constructor(options: CommandOptions) {
    this.options = options
  }

  abstract run(fs: FsContainer): Promise<any>
}
