import type { IBuffer, Terminal } from '@xterm/xterm'
import type { ActiveCharPrompt, ActivePrompt } from '../shell'
import { countLines, offsetToColRow } from './utils'

export class TTY {
  private termSize: {
    cols: number
    rows: number
  }

  private firstInit = true
  private promptPrefix: string
  private continuationPromptPrefix: string
  private cursor: number
  private input: string

  constructor(private xterm: Terminal) {
    this.termSize = {
      cols: this.xterm.cols,
      rows: this.xterm.rows,
    }
    this.promptPrefix = ''
    this.continuationPromptPrefix = ''
    this.input = ''
    this.cursor = 0
  }

  /**
   * Function to return a deconstructed readPromise
   */
  private getAsyncRead() {
    let readResolve
    let readReject
    const readPromise = new Promise((resolve, reject) => {
      readResolve = (response: string) => {
        this.promptPrefix = ''
        this.continuationPromptPrefix = ''
        resolve(response)
      }
      readReject = reject
    })

    return {
      promise: readPromise,
      resolve: readResolve,
      reject: readReject,
    }
  }

  /**
   * Return a promise that will resolve when the user has completed
   * typing a single line
   */
  read(
    promptPrefix: string,
    continuationPromptPrefix = '> ',
  ): ActivePrompt {
    if (promptPrefix.length > 0)
      this.print(promptPrefix)

    this.firstInit = true
    this.promptPrefix = promptPrefix
    this.continuationPromptPrefix = continuationPromptPrefix
    this.input = ''
    this.cursor = 0

    return {
      promptPrefix,
      continuationPromptPrefix,
      ...this.getAsyncRead(),
    }
  }

  /**
   * Return a promise that will be resolved when the user types a single
   * character.
   *
   * This can be active in addition to `.read()` and will be resolved in
   * priority before it.
   */
  readChar(promptPrefix: string): ActiveCharPrompt {
    if (promptPrefix.length > 0)
      this.print(promptPrefix)

    return {
      promptPrefix,
      ...this.getAsyncRead(),
    }
  }

  /**
   * Prints a message and changes line
   */
  println(message: string) {
    this.print(`${message}\n`)
  }

  /**
   * Prints a message and properly handles new-lines
   */
  print(message: string, sync?: boolean) {
    const normInput = message.replace(/[\r\n]+/g, '\n').replace(/\n/g, '\r\n')
    if (sync) {
      // We write it synchronously via hacking a bit on xterm
      // @ts-expect-error private field not in typings
      this.xterm._core.writeSync(normInput)
      // FIXME: This is a hack, but it doesn't works
      // this.xterm._core._renderService._renderer._value._runOperation(renderer =>
      //   renderer.onGridChanged(0, this.xterm.rows - 1),
      // )
    }
    else {
      this.xterm.write(normInput)
    }
  }

  /**
   * Prints a list of items using a wide-format
   */
  printWide(items: Array<string>, padding = 2) {
    if (items.length === 0)
      return this.println('')

    // Compute item sizes and matrix row/cols
    const itemWidth
      = items.reduce((width, item) => Math.max(width, item.length), 0) + padding
    const wideCols = Math.floor(this.termSize.cols / itemWidth)
    const wideRows = Math.ceil(items.length / wideCols)

    // Print matrix
    let i = 0
    for (let row = 0; row < wideRows; ++row) {
      let rowStr = ''

      // Prepare columns
      for (let col = 0; col < wideCols; ++col) {
        if (i < items.length) {
          let item = items[i++]
          item += ' '.repeat(itemWidth - item.length)
          rowStr += item
        }
      }
      this.println(rowStr)
    }
  }

  /**
   * Prints a status message on the current line. Meant to be used with clearStatus()
   */
  printStatus(message: string, sync?: boolean) {
    // Save the cursor position
    this.print('\u001B[s', sync)
    this.print(message, sync)
  }

  /**
   * Clears the current status on the line, meant to be run after printStatus
   */
  clearStatus(sync?: boolean) {
    // Restore the cursor position
    this.print('\u001B[u', sync)
    // Clear from cursor to end of screen
    this.print('\u001B[1000D', sync)
    this.print('\u001B[0J', sync)
  }

  /**
   * Apply prompts to the given input
   */
  applyPrompts(input: string): string {
    return (
      this.promptPrefix
      + input.replace(/\n/g, `\n${this.continuationPromptPrefix}`)
    )
  }

  /**
   * Advances the `offset` as required in order to accompany the prompt
   * additions to the input.
   */
  applyPromptOffset(input: string, offset: number): number {
    const newInput = this.applyPrompts(input.substr(0, offset))
    return newInput.length
  }

  /**
   * Clears the current prompt
   *
   * This function will erase all the lines that display the current prompt
   * and move the cursor in the beginning of the first line of the prompt.
   */
  clearInput() {
    const currentPrompt = this.applyPrompts(this.input)

    // Get the overall number of lines to clear
    const allRows = countLines(currentPrompt, this.termSize.cols)

    // Get the line we are currently in
    const promptCursor = this.applyPromptOffset(this.input, this.cursor)
    const { row } = offsetToColRow(
      currentPrompt,
      promptCursor,
      this.termSize.cols,
    )

    // First move on the last line
    const moveRows = allRows - row - 1
    for (let i = 0; i < moveRows; ++i) this.xterm.write('\x1B[E')

    // Clear current input line(s)
    this.xterm.write('\r\x1B[K')
    for (let i = 1; i < allRows; ++i) this.xterm.write('\x1B[F\x1B[K')
  }

  /**
   * Clears the entire Tty
   *
   * This function will erase all the lines that display on the tty,
   * and move the cursor in the beginning of the first line of the prompt.
   */
  clearTty() {
    // Clear the screen
    this.xterm.write('\u001B[2J')
    // Set the cursor to 0, 0
    this.xterm.write('\u001B[0;0H')
    this.cursor = 0
  }

  /**
   * Function to return if it is the initial read
   */
  getFirstInit(): boolean {
    return this.firstInit
  }

  /**
   * Function to get the current Prompt prefix
   */
  getPromptPrefix(): string {
    return this.promptPrefix
  }

  /**
   * Function to get the current Continuation Prompt prefix
   */
  getContinuationPromptPrefix(): string {
    return this.continuationPromptPrefix
  }

  /**
   * Function to get the terminal size
   */
  getTermSize(): { rows: number; cols: number } {
    return this.termSize
  }

  /**
   * Function to get the current input in the line
   */
  getInput(): string {
    return this.input
  }

  /**
   * Function to get the current cursor
   */
  getCursor(): number {
    return this.cursor
  }

  /**
   * Function to get the size (columns and rows)
   */
  getSize(): { cols: number; rows: number } {
    return this.termSize
  }

  /**
   * Function to return the terminal buffer
   */
  getBuffer(): IBuffer {
    return this.xterm.buffer.active
  }

  /**
   * Replace input with the new input given
   *
   * This function clears all the lines that the current input occupies and
   * then replaces them with the new input.
   */
  setInput(newInput: string, shouldNotClearInput = false) {
    // Doing the programming anitpattern here,
    // because defaulting to true is the opposite of what
    // not passing a param means in JS
    if (!shouldNotClearInput)
      this.clearInput()

    // Write the new input lines, including the current prompt
    const newPrompt = this.applyPrompts(newInput)
    this.print(newPrompt)

    // Trim cursor overflow
    if (this.cursor > newInput.length)
      this.cursor = newInput.length

    // Move the cursor to the appropriate row/col
    const newCursor = this.applyPromptOffset(newInput, this.cursor)
    const newLines = countLines(newPrompt, this.termSize.cols)
    const { col, row } = offsetToColRow(
      newPrompt,
      newCursor,
      this.termSize.cols,
    )
    const moveUpRows = newLines - row - 1

    this.xterm.write('\r')
    for (let i = 0; i < moveUpRows; ++i) this.xterm.write('\x1B[F')
    for (let i = 0; i < col; ++i) this.xterm.write('\x1B[C')

    // Replace input
    this.input = newInput
  }

  /**
   * Set the new cursor position, as an offset on the input string
   *
   * This function:
   * - Calculates the previous and current
   */
  setCursor(newCursor: number) {
    if (newCursor < 0)
      newCursor = 0
    if (newCursor > this.input.length)
      newCursor = this.input.length
    this._writeCursorPosition(newCursor)
  }

  /**
   * Sets the direct cursor value. Should only be used in keystroke contexts
   */
  setCursorDirectly(newCursor: number) {
    this._writeCursorPosition(newCursor)
  }

  _writeCursorPosition(newCursor: number) {
    // Apply prompt formatting to get the visual status of the display
    const inputWithPrompt = this.applyPrompts(this.input)
    const inputLines = countLines(inputWithPrompt, this.termSize.cols)

    // Estimate previous cursor position
    const prevPromptOffset = this.applyPromptOffset(this.input, this.cursor)
    const { col: prevCol, row: prevRow } = offsetToColRow(
      inputWithPrompt,
      prevPromptOffset,
      this.termSize.cols,
    )

    // Estimate next cursor position
    const newPromptOffset = this.applyPromptOffset(this.input, newCursor)
    const { col: newCol, row: newRow } = offsetToColRow(
      inputWithPrompt,
      newPromptOffset,
      this.termSize.cols,
    )

    // Adjust vertically
    if (newRow > prevRow)
      for (let i = prevRow; i < newRow; ++i) this.xterm.write('\x1B[B')
    else
      for (let i = newRow; i < prevRow; ++i) this.xterm.write('\x1B[A')

    // Adjust horizontally
    if (newCol > prevCol)
      for (let i = prevCol; i < newCol; ++i) this.xterm.write('\x1B[C')
    else
      for (let i = newCol; i < prevCol; ++i) this.xterm.write('\x1B[D')

    // Set new offset
    this.cursor = newCursor
  }

  setTermSize(cols: number, rows: number) {
    this.termSize = { cols, rows }
  }

  setFirstInit(value: boolean) {
    this.firstInit = value
  }

  setPromptPrefix(value: string) {
    this.promptPrefix = value
  }

  setContinuationPromptPrefix(value: string) {
    this.continuationPromptPrefix = value
  }
}
