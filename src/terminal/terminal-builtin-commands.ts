import type { CommandOptions } from './command'
import { MAIN_TITLE } from './constants'
import type { FsContainer } from './fs'

export function welcome() {
  return MAIN_TITLE
}

export async function github() {
  return 'https://github.com/Mitscherlich/WebTerminal'
}

async function clear({ env }: CommandOptions) {
  env.tty?.clearTty()
}

export { clear, clear as cls }

function dir(_: CommandOptions, fs: FsContainer) {
  return new Promise((resolve, reject) => {
    fs.fs.readdir(fs.volume.root.getPath(), (err, files) => {
      if (err)
        return reject(err)

      resolve(files?.join('\t'))
    })
  })
}

export { dir, dir as ls }
