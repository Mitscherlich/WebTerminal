import type { TTY } from '../tty'

export interface CommandOptions {
  args: string[]
  env: { [key: string]: string }
  preopens?: { [key: string]: string }
  tty?: TTY
  module?: WebAssembly.Module
  callback?: Function
}
