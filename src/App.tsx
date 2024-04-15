import { onCleanup } from 'solid-js'

import { FsContainer, Terminal } from '@web-terminal/sdk'
import * as COMMANDS from './commands'
import { MAIN_TITLE } from './constants'
import processWorkerUrl from './worker/process.worker?url'

import './terminal.css'

class WebTerminal {
  private terminal: Terminal
  private terminalFs: FsContainer

  async fetchCommand({ args }: {
    args: Array<string>
    env?: { [key: string]: string }
  }) {
    return (COMMANDS as any)[args[0]]
  }

  constructor() {
    this.terminalFs = new FsContainer()
    this.terminal = new Terminal({
      fetchCommand: this.fetchCommand,
      fs: this.terminalFs,
      processWorkerUrl,
      cursorBlink: true,
    })
  }

  open(container: HTMLElement) {
    this.terminal.open(container)
    requestAnimationFrame(() => {
      this.terminal.fit()
      this.terminal.focus()
    })
    this.terminal.print(MAIN_TITLE)
  }

  dispose() {
    this.terminal.destroy()
  }
}

export default function App() {
  const terminal = new WebTerminal()
  onCleanup(() => {
    terminal.dispose()
  })
  return <div id="web-terminal" ref={el => terminal.open(el)} />
}
