import type { CommandOptions, FsContainer } from '@web-terminal/sdk'

function clear({ env }: CommandOptions) {
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
