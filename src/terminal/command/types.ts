export interface CommandOptions {
  args: string[]
  env: { [key: string]: any }
  preopens?: { [key: string]: string }
  module?: WebAssembly.Module
  callback?: Function
}
