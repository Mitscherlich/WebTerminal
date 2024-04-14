import type { CommandOptions } from './command'
import type { FsContainer } from './fs'

export async function hello(options: any, fs: FsContainer) {
  return 'Hello World!'
}

export async function github() {
  return 'https://github.com/Mitscherlich/WebTerminal'
}

async function clear({ tty }: CommandOptions) {
  tty?.clearTty()
}

export { clear, clear as cls }

async function dir(_, { fs }: FsContainer) {
  // TODO
}
