import * as xterm from '@xterm/xterm'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from '@xterm/addon-fit'
import { TTY } from './tty'
import { Shell } from './shell'
import { type Options, TerminalConfig } from './terminal-config'

const MOBILE_KEYBOARD_EVENTS = ['click', 'tap']

export class Terminal {
  private xterm: xterm.Terminal
  private container: HTMLElement | undefined
  private webLinksAddon: WebLinksAddon
  private fitAddon: FitAddon

  private config: TerminalConfig
  private tty: TTY
  private shell: Shell

  private isOpen: boolean
  private pendingPrintOnOpen: string

  constructor(config?: Options) {
    this.config = new TerminalConfig(config)

    this.xterm = new xterm.Terminal()

    this.xterm.onResize(this.handleTermResize)
    this.xterm.onKey((keyEvent: { key: string; domEvent: KeyboardEvent }) => {
      // Fix for iOS Keyboard Jumping on space
      if (keyEvent.key === ' ') {
        keyEvent.domEvent.preventDefault()
        // keyEvent.domEvent.stopPropagation()
        return false
      }
    })

    // Set up our container
    this.container = undefined

    // Load our addons
    this.webLinksAddon = new WebLinksAddon()
    this.fitAddon = new FitAddon()
    this.xterm.loadAddon(this.fitAddon)
    this.xterm.loadAddon(this.webLinksAddon)

    // Create our Shell and tty
    this.tty = new TTY(this.xterm)
    this.shell = new Shell(this.config, this.tty)

    this.xterm.onData(this.shell.handleTermData)

    this.isOpen = false
    this.pendingPrintOnOpen = ''
  }

  open(container: HTMLElement) {
    // Remove any current event listeners
    const focusHandler = this.focus.bind(this)
    if (this.container !== undefined) {
      MOBILE_KEYBOARD_EVENTS.forEach((eventName) => {
        this.container?.removeEventListener(eventName, focusHandler)
      })
    }

    this.container = container

    this.xterm.open(container)
    // this.xterm.loadAddon(new WebglAddon());
    this.isOpen = true
    setTimeout(() => {
      // Fix for Mobile Browsers and their virtual keyboards
      if (this.container !== undefined) {
        MOBILE_KEYBOARD_EVENTS.forEach((eventName) => {
          this.container?.addEventListener(eventName, focusHandler)
        })
      }

      if (this.pendingPrintOnOpen) {
        this.tty.print(`${this.pendingPrintOnOpen}\n`)
        this.pendingPrintOnOpen = ''
      }

      this.shell.prompt()
    })
  }

  fit() {
    this.fitAddon.fit()
  }

  focus() {
    // this.xterm.blur();
    this.xterm.focus()
    // this.xterm.scrollToBottom();

    // To fix iOS keyboard, scroll to the cursor in the terminal
    this.scrollToCursor()
  }

  scrollToCursor() {
    if (!this.container)
      return

    // We don't need cursorX, since we want to start at the beginning of the terminal.
    const cursorY = this.tty.getBuffer().cursorY
    const size = this.tty.getSize()

    const containerBoundingClientRect = this.container.getBoundingClientRect()

    // Find how much to scroll because of our cursor
    const cursorOffsetY
      = (cursorY / size.rows) * containerBoundingClientRect.height

    let scrollX = containerBoundingClientRect.left
    let scrollY = containerBoundingClientRect.top + cursorOffsetY + 10

    if (scrollX < 0)
      scrollX = 0

    if (scrollY > document.body.scrollHeight)
      scrollY = document.body.scrollHeight

    window.scrollTo(scrollX, scrollY)
  }

  print(message: string, sync?: boolean) {
    // For some reason, double new lines are not respected. Thus, fixing that here
    message = message.replace(/\n\n/g, '\n \n')

    if (!this.isOpen) {
      if (this.pendingPrintOnOpen)
        this.pendingPrintOnOpen += message
      else
        this.pendingPrintOnOpen = message

      return
    }

    if (this.shell.isPrompting) {
      // Cancel the current prompt and restart
      this.shell.printAndRestartPrompt(() => {
        this.tty.print(`${message}\n`, sync)
        return undefined
      })
      return
    }

    this.tty.print(message, sync)
  }

  runCommand(line: string) {
    if (this.shell.isPrompting) {
      this.tty.setInput(line)
      this.shell.handleReadComplete()
    }
  }

  destroy() {
    this.xterm.dispose()
  }

  onPaste(data: string) {
    this.tty.print(data)
  }

  /**
   * Handle terminal resize
   *
   * This function clears the prompt using the previous configuration,
   * updates the cached terminal size information and then re-renders the
   * input. This leads (most of the times) into a better formatted input.
   */
  handleTermResize = (data: { rows: number; cols: number }) => {
    const { rows, cols } = data
    this.tty.clearInput()
    this.tty.setTermSize(cols, rows)
    this.tty.setInput(this.tty.getInput(), true)
  }
}
