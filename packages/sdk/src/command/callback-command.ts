import type { FsContainer } from '../fs'
import { BaseCommand as Command } from './base'
import type { CommandOptions } from './types'

export class CallbackCommand extends Command {
  callback: Function
  stdoutCallback?: Function

  constructor(options: CommandOptions) {
    super(options)

    if (!options.callback)
      throw new Error('The Command Options provided are not for a Callback Command')

    this.callback = options.callback
  }

  async run(fs: FsContainer) {
    const output = await this.callback(this.options, fs)
    output && fs.fs.writeFileSync('/dev/stdout', new TextEncoder().encode(`${output}\n`))
  }
}
