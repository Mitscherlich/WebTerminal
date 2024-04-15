import assert from 'node:assert'
import type { CommandOptions } from './command'
import { FsContainer } from './fs'

// A Custom command is a function that takes in a stdin string, and an array of argument strings,
// And returns an stdout string, or undefined.
type CallbackCommand = (
  args: string[],
  stdin: string
) => Promise<string>

type FetchCommandFunction = (options: {
  args: Array<string>
  env?: { [key: string]: string }
}) => Promise<CallbackCommand | CommandOptions>

export interface Options {
  fetchCommand?: FetchCommandFunction
  fs?: FsContainer
  processWorkerUrl?: string
}

export class TerminalConfig {
  fetchCommand: FetchCommandFunction
  fs: FsContainer
  processWorkerUrl?: string

  constructor(config: Options = {}) {
    assert(!!config, 'You must provide a config for the Web terminal')
    assert(!!config.fetchCommand, 'You must provide a fetchCommand for the Web terminal config, to handle fetching commands to be run')

    if (!config.processWorkerUrl) {
      console.warn(
        'Note: It is HIGHLY reccomended you pass in the processWorkerUrl in the terminal config to create process workers. Without this, some wasi programs will not work.',
      )
    }

    this.fetchCommand = config.fetchCommand
    this.processWorkerUrl = config.processWorkerUrl
    this.fs = config.fs ?? new FsContainer()
  }
}
