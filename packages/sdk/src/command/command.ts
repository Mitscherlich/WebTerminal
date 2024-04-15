import type { FsContainer } from '../fs'
import { BaseCommand } from './base'
import type { CommandOptions } from './types'

export class Command extends BaseCommand {
  constructor(options: CommandOptions) {
    super(options)

    if (!options.module)
      throw new Error('Did not find a WebAssembly.Module for the WASI Command')
  }

  async run(_: FsContainer) {
    // const options = {
    //   preopens: {
    //     '.': '.',
    //     '/': '/',
    //     ...(this.options.preopens || {}),
    //   },
    //   env: this.options.env,
    //   args: this.options.args,
    //   bindings: {
    //     // ...WASI.defaultBindings,
    //     fs: fs.fs,
    //   },
    // }
    // const wasi = new WASI(options)
    // const wasmModule = this.options.module as WebAssembly.Module
    // const instance = await WebAssembly.instantiate(wasmModule, {
    //   ...wasi.getImports(wasmModule),
    // })
    // wasi.start(instance)
  }
}
