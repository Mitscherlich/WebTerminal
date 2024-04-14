import type { FsContainer } from '../fs'

import { IO_DEVICES_CONSTANTS } from './constants'

// Add isomorphic support for TextDecoder
let TextDecoder: any
if (typeof window === 'object') {
  TextDecoder = window.TextDecoder
}
else if (typeof self === 'object') {
  TextDecoder = self.TextDecoder
}
else if (typeof require === 'function') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  TextDecoder = require('util').TextDecoder
}

export class IoDevices {
  fs: FsContainer
  fdFrameBuffer: number
  fdWindowSize: number
  fdBufferIndexDisplay: number
  fdInput: number

  windowSizeCallback: Function
  bufferIndexDisplayCallback: Function
  inputCallback: Function

  constructor(fs: FsContainer) {
    this.fs = fs

    // Add our files to the wasmFs
    this.fs.volume.mkdirSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.PATH,
      { recursive: true },
    )
    this.fs.volume.writeFileSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.FRAME_BUFFER,
      '',
    )
    this.fs.volume.writeFileSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.VIRTUAL_SIZE,
      '',
    )
    this.fs.volume.writeFileSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.DRAW,
      '',
    )
    this.fs.volume.writeFileSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.INPUT,
      '',
    )

    this.windowSizeCallback = () => {}
    this.bufferIndexDisplayCallback = () => {}
    this.inputCallback = () => new Uint8Array()

    // Open our directories and get their file descriptors
    this.fdFrameBuffer = this.fs.volume.openSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.FRAME_BUFFER,
      'w+',
    )
    this.fdBufferIndexDisplay = this.fs.volume.openSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.DRAW,
      'w+',
    )
    this.fdWindowSize = this.fs.fs.openSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.VIRTUAL_SIZE,
      'w+',
    )
    this.fdInput = this.fs.volume.openSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.INPUT,
      'w+',
    )

    // Set up our read / write handlers
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this
    const originalInputRead = this.fs.volume.fds[this.fdInput].node.read
    this.fs.volume.fds[this.fdInput].node.read = function (...args) {
      // Write the input buffer
      const inputBuffer = context.inputCallback()
      context.fs.volume.writeFileSync(
        IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.INPUT,
        inputBuffer,
      )

      // Read the input
      const response = originalInputRead.apply(
        context.fs.volume.fds[context.fdInput].node,
        args,
      )

      // Return the response from the read
      return response
    }
    const originalWindowSizeWrite = this.fs.volume.fds[this.fdWindowSize]
      .node.write
    this.fs.volume.fds[this.fdWindowSize].node.write = function (...args) {
      const response = originalWindowSizeWrite.apply(
        context.fs.volume.fds[context.fdWindowSize].node,
        args,
      )
      context.windowSizeCallback()
      return response
    }
    const originalBufferIndexDisplayWrite = this.fs.volume.fds[
      this.fdBufferIndexDisplay
    ].node.write
    this.fs.volume.fds[this.fdBufferIndexDisplay].node.write = function (...args) {
      const response = originalBufferIndexDisplayWrite.apply(
        context.fs.volume.fds[context.fdBufferIndexDisplay].node,
        args,
      )
      context.bufferIndexDisplayCallback()
      return response
    }
  }

  getFrameBuffer(): Uint8Array {
    const buffer: Uint8Array = this.fs.fs.readFileSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.FRAME_BUFFER,
    ) as Uint8Array
    return buffer
  }

  getWindowSize(): Array<number> {
    const windowSizeBuffer = this.fs.fs.readFileSync(
      IO_DEVICES_CONSTANTS.FILE_PATH.DEVICE_FRAMEBUFFER_ZERO.VIRTUAL_SIZE,
    )
    if (windowSizeBuffer.length > 0) {
      const windowSize = new TextDecoder('utf-8').decode(
        windowSizeBuffer as any,
      )
      const splitWindowSize = windowSize.split('x')
      return [
        parseInt(splitWindowSize[0], 10),
        parseInt(splitWindowSize[1], 10),
      ]
    }
    else {
      return [0, 0]
    }
  }

  setWindowSizeCallback(windowSizeCallback: Function): void {
    this.windowSizeCallback = windowSizeCallback
  }

  setBufferIndexDisplayCallback(bufferIndexDisplayCallback: Function): void {
    this.bufferIndexDisplayCallback = bufferIndexDisplayCallback
  }

  setInputCallback(inputCallback: Function): void {
    this.inputCallback = inputCallback
  }
}

export { IO_DEVICES_CONSTANTS } from './constants'
