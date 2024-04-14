import { FsContainer } from './fs'
import { Terminal } from './terminal'
import * as BUILTIN_COMMANDS from './terminal-builtin-commands'

import processWorkerUrl from './worker/process.worker?url'

import './index.css'

class WebTerminal {
  private terminal: Terminal
  private terminalFs: FsContainer

  async fetchCommand({ args, env }: {
    args: Array<string>
    env?: { [key: string]: string }
  }) {
    return (BUILTIN_COMMANDS as any)[args[0]]
  }

  constructor() {
    this.terminalFs = new FsContainer()
    this.terminal = new Terminal({
      fetchCommand: this.fetchCommand,
      fs: this.terminalFs,
      processWorkerUrl,
    })
  }

  open(container: HTMLElement) {
    this.terminal.open(container)
    requestAnimationFrame(() => {
      this.terminal.fit()
      this.terminal.focus()
    })
  }
}

export default function WebTerminalComponent() {
  window.terminal = new WebTerminal()

  return <div id="web-terminal" ref={el => window.terminal.open(el)} />
}
