import * as Comlink from 'comlink'

// @ts-expect-error shell-parse is not typed
import parse from 'shell-parse'
import type { TTY } from '../tty'
import { IoDeviceWindow } from '../io-devices-window'
import type { CommandOptions } from '../command/types'
import type { TerminalConfig } from '../terminal-config'
import { isFunction } from '../utils'
import { Process } from '../process'

let processWorkerBlobUrl: string | undefined

export class CommandRunner {
  commandOptionsForProcessesToRun: Array<any>
  spawnedProcessObjects: Array<any>
  spawnedProcesses: number
  pipedStdinDataForNextProcess: Uint8Array
  isRunning: boolean
  supportsSharedArrayBuffer: boolean

  commandString: string

  commandStartReadCallback: Function
  commandEndCallback: Function

  constructor(
    private terminalConfig: TerminalConfig,
    commandString: string,
    commandStartReadCallback: Function,
    commandEndCallback: Function,
    private tty?: TTY,
  ) {
    this.commandString = commandString
    this.commandStartReadCallback = commandStartReadCallback
    this.commandEndCallback = commandEndCallback

    this.commandOptionsForProcessesToRun = []
    this.spawnedProcessObjects = []
    this.spawnedProcesses = 0
    this.pipedStdinDataForNextProcess = new Uint8Array()
    this.isRunning = false
    this.supportsSharedArrayBuffer = (window as any).SharedArrayBuffer && (window as any).Atomics
  }

  async runCommand() {
    // First, let's parse the string into a bash AST
    const commandAst = parse(this.commandString)
    try {
      if (commandAst.length > 1)
        throw new Error('Only one command permitted')

      if (commandAst[0].type !== 'command')
        throw new Error('Only commands allowed')

      // Translate our AST into Command Options
      this.commandOptionsForProcessesToRun = await this._getCommandOptionsFromAST(
        commandAst[0],
        this.terminalConfig,
        this.tty,
      )
    }
    catch (e: any) {
      if (this.tty) {
        this.tty.print('\r\n')
        this.tty.print(`wasm shell: parse error (${e.toString()})\r\n`)
      }
      console.error(e)
      this.commandEndCallback()
      return
    }

    this.isRunning = true

    // Spawn the first process
    await this._tryToSpawnProcess(0)
  }

  kill() {
    if (!this.isRunning)
      return

    this.spawnedProcessObjects.forEach((processObject) => {
      if (processObject.worker)
        processObject.worker.terminate()

      if (processObject.ioDeviceWindow)
        processObject.ioDeviceWindow.close()
    })

    this.commandOptionsForProcessesToRun = []
    this.spawnedProcessObjects = []
    this.isRunning = false

    this.commandEndCallback()
  }

  _addStdinToSharedStdin(data: Uint8Array, processObjectIndex: number) {
    // Pass along the stdin to the shared object

    if (!this.spawnedProcessObjects[processObjectIndex])
      return

    const sharedStdin = this.spawnedProcessObjects[processObjectIndex]
      .sharedStdin
    let startingIndex = 1
    if (sharedStdin[0] > 0)
      startingIndex = sharedStdin[0]

    data.forEach((value, index) => {
      sharedStdin[startingIndex + index] = value
    })

    sharedStdin[0] = startingIndex + data.length - 1

    Atomics.notify(sharedStdin, 0, 1)
  }

  async _tryToSpawnProcess(commandOptionIndex: number) {
    if (
      commandOptionIndex + 1 > this.spawnedProcesses
      && this.spawnedProcessObjects.length < 2
      && commandOptionIndex < this.commandOptionsForProcessesToRun.length
    ) {
      this.spawnedProcesses++
      await this._spawnProcess(commandOptionIndex)
    }
  }

  async _spawnProcess(commandOptionIndex: number) {
    let spawnedProcessObject

    // Check if it is a Wasm command, that can be placed into a worker.
    if (
      this.commandOptionsForProcessesToRun[commandOptionIndex].module
      && this.supportsSharedArrayBuffer
    ) {
      spawnedProcessObject = await this._spawnProcessAsWorker(
        commandOptionIndex,
      )
    }
    else {
      spawnedProcessObject = await this._spawnProcessAsService(
        commandOptionIndex,
      )
    }

    // Record this process as spawned
    this.spawnedProcessObjects.push(spawnedProcessObject)

    // Start the process
    spawnedProcessObject.process.start(
      this.pipedStdinDataForNextProcess.length > 0
        ? this.pipedStdinDataForNextProcess
        : undefined,
    )

    // Remove the piped stdin if we passed it
    if (this.pipedStdinDataForNextProcess.length > 0)
      this.pipedStdinDataForNextProcess = new Uint8Array()

    // Try to spawn the next process, if we haven't already
    let isNextCallbackCommand = false
    if (this.commandOptionsForProcessesToRun.length > commandOptionIndex + 1) {
      isNextCallbackCommand
        = this.commandOptionsForProcessesToRun[commandOptionIndex + 1]
          .callback !== undefined
    }
    if (this.supportsSharedArrayBuffer && !isNextCallbackCommand)
      this._tryToSpawnProcess(commandOptionIndex + 1)
  }

  async _spawnProcessAsWorker(commandOptionIndex: number) {
    if (!this.terminalConfig.processWorkerUrl)
      throw new Error('Terminal Config missing the Process Worker URL')

    const processWorkerUrl = this.terminalConfig.processWorkerUrl
    /* ROLLUP_REPLACE_INLINE
    processWorkerUrl = processWorkerInlinedUrl;
    ROLLUP_REPLACE_INLINE */

    // Generate our process
    const workerBlobUrl = await this._getBlobUrlForProcessWorker(
      processWorkerUrl,
      this.tty,
    )
    const processWorker = new Worker(workerBlobUrl)
    const ProcessComlink: any = Comlink.wrap(processWorker)

    // Generate our shared buffer
    const sharedStdinBuffer = new SharedArrayBuffer(8192)

    // Get our filesystem state
    const fsJson = this.terminalConfig.fs.toJSON()

    // Create our Io Device Window
    const sharedIoDeviceInputBuffer = new SharedArrayBuffer(8192)
    const ioDeviceWindow = new IoDeviceWindow(sharedIoDeviceInputBuffer)

    const process: any = await new ProcessComlink(
      // Command Options
      this.commandOptionsForProcessesToRun[commandOptionIndex],
      // WasmFs File System JSON
      fsJson,
      // Data Callback
      Comlink.proxy(
        this._processDataCallback.bind(this, {
          commandOptionIndex,
          sync: false,
        }),
      ),
      // End Callback
      Comlink.proxy(
        this._processEndCallback.bind(this, {
          commandOptionIndex,
          processWorker,
        }),
      ),
      // Error Callback
      Comlink.proxy(
        this._processErrorCallback.bind(this, { commandOptionIndex }),
      ),
      // Io Device Window
      Comlink.proxy(ioDeviceWindow),
      // Shared Array Buffer for IoDevice Input
      sharedIoDeviceInputBuffer,
      // Shared Array Buffer for Stdin
      sharedStdinBuffer,
      // Stdin read callback
      Comlink.proxy(this._processStartStdinReadCallback.bind(this)),
    )

    // Initialize the shared Stdin.
    // Index 0 will be number of elements in buffer
    const sharedStdin = new Int32Array(sharedStdinBuffer)
    sharedStdin[0] = -1

    return {
      process,
      commandOptionIndex,
      ioDeviceWindow,
      worker: processWorker,
      sharedStdin,
    }
  }

  async _spawnProcessAsService(commandOptionIndex: number) {
    // Get our filesystem state
    const fsJson = this.terminalConfig.fs.toJSON()

    // Create our Io Device Window
    const ioDeviceWindow = new IoDeviceWindow()

    const process = new Process(
      // Command Options
      this.commandOptionsForProcessesToRun[commandOptionIndex],
      // WasmFs File System JSON
      fsJson,
      // Data Callback
      this._processDataCallback.bind(this, { commandOptionIndex, sync: true }),
      // End Callback
      this._processEndCallback.bind(this, { commandOptionIndex }),
      // Error Callback
      this._processErrorCallback.bind(this, { commandOptionIndex }),
      // Io Device Window
      ioDeviceWindow,
    )

    return {
      process,
      commandOptionIndex,
      ioDeviceWindow,
    }
  }

  _processDataCallback(
    { commandOptionIndex, sync }: { commandOptionIndex: number; sync: boolean },
    data: Uint8Array,
  ) {
    if (!this.isRunning)
      return

    if (commandOptionIndex < this.commandOptionsForProcessesToRun.length - 1) {
      // Pass along to the next spawned process
      if (
        // Ensure we can use shared array buffer,
        // And We have more than one proccess spawned,
        // And we are not the last spawned process we are trying to premptively write to
        // The last && fixes a race condition from:
        // https://github.com/wasmerio/wasmer-js/issues/160
        this.supportsSharedArrayBuffer
        && this.spawnedProcessObjects.length > 1
        && this.spawnedProcessObjects[this.spawnedProcessObjects.length - 1]
          .commandOptionIndex > commandOptionIndex
      ) {
        // Send the output to stdin since we are being piped
        this._addStdinToSharedStdin(data, 1)
      }
      else {
        const newPipedStdinData = new Uint8Array(
          data.length + this.pipedStdinDataForNextProcess.length,
        )
        newPipedStdinData.set(this.pipedStdinDataForNextProcess)
        newPipedStdinData.set(data, this.pipedStdinDataForNextProcess.length)
        this.pipedStdinDataForNextProcess = newPipedStdinData
      }
    }
    else {
      // Write the output to our terminal
      const dataString = new TextDecoder('utf-8').decode(data)
      if (this.tty)
        this.tty.print(dataString, sync)
    }
  }

  _processEndCallback(
    endCallbackConfig: {
      commandOptionIndex: number
      processWorker?: Worker
    },
    wasmFsJson: any,
  ) {
    const { commandOptionIndex, processWorker } = endCallbackConfig

    if (processWorker) {
      // Terminate our worker
      processWorker.terminate()
    }

    // Sync our filesystem
    if (wasmFsJson)
      this.terminalConfig.fs.fromJSON(wasmFsJson)

    if (commandOptionIndex < this.commandOptionsForProcessesToRun.length - 1) {
      // Try to spawn the next process, if we haven't already
      this._tryToSpawnProcess(commandOptionIndex + 1)
    }
    else {
      // We are now done!
      // Call the passed end callback
      this.isRunning = false
      this.commandEndCallback()
    }

    // Remove ourself from the spawned workers
    this.spawnedProcessObjects.shift()
  }

  _processErrorCallback(
    errorCallbackConfig: { commandOptionIndex: number },
    error: string,
    wasmFsJson: any,
  ) {
    const { commandOptionIndex } = errorCallbackConfig

    console.error(
      `${this.commandOptionsForProcessesToRun[commandOptionIndex].args[0]}: ${error}`,
    )

    // Sync our filesystem
    if (wasmFsJson)
      this.terminalConfig.fs.fromJSON(wasmFsJson)

    // Kill the process
    this.kill()
    this.commandEndCallback()
  }

  _processStartStdinReadCallback() {
    this.commandStartReadCallback().then((stdin: string) => {
      const data = new TextEncoder().encode(`${stdin}\n`)
      this._addStdinToSharedStdin(data, 0)
    })
  }

  async _getBlobUrlForProcessWorker(
    processWorkerUrl: string,
    tty?: TTY,
  ) {
    if (processWorkerBlobUrl)
      return processWorkerBlobUrl

    if (tty) {
      tty.printStatus(
        '[INFO] Downloading the process Web Worker (This happens once)...',
      )
    }

    // Fetch the worker, but at least show the message for a short while
    const workerString = await Promise.all([
      fetch(processWorkerUrl).then(response => response.text()),
      new Promise(resolve => setTimeout(resolve, 500)),
    ]).then(responses => responses[0])

    if (tty)
      tty.clearStatus()

    // Create the worker blob and URL
    const workerBlob = new Blob([workerString as any])
    processWorkerBlobUrl = window.URL.createObjectURL(workerBlob)
    return processWorkerBlobUrl
  }

  async _getCommandOptionsFromAST(
    ast: any,
    terminalConfig: TerminalConfig,
    tty?: TTY,
  ): Promise<Array<CommandOptions>> {
    // The array of command options we are returning
    let commandOptions: Array<CommandOptions> = []

    const commandName = ast.command.value
    const commandArgs = ast.args.map((arg: any) => arg.value)
    const args = [commandName, ...commandArgs]

    const envEntries = Object.entries(ast.env).map(
      ([key, value]: [string, any]) => [key, value.value],
    )
    const env: any = {}

    // Manually doing Object.fromEntries for compatibility with Node 10
    envEntries.forEach(([key, value]) => {
      env[key] = value
    })

    if (tty) {
      const { rows, cols } = tty.getTermSize()
      env.LINES = rows
      env.COLUMNS = cols
      env.tty = tty
    }

    // Get other commands from the redirects
    const redirectTask = async () => {
      if (ast.redirects) {
        const astRedirect = ast.redirects[0]
        if (astRedirect && astRedirect.type === 'pipe') {
          const redirectedCommandOptions = await this._getCommandOptionsFromAST(
            astRedirect.command,
            terminalConfig,
            tty,
          )
          // Add the child options to our command options
          commandOptions = commandOptions.concat(redirectedCommandOptions)
        }
      }
    }

    // Add a Wasm module command
    await redirectTask()

    // Fetch the command
    tty?.printStatus(`[INFO] Fetching the command ${commandName} ...`)

    const response = await terminalConfig.fetchCommand({
      args,
      env,
    })
    tty?.clearStatus()

    if (response instanceof Uint8Array) {
      // Compile the Wasm Module
      const wasmModule = await WebAssembly.compile(response)

      commandOptions.unshift({
        args,
        env,
        module: wasmModule,
      })
    }
    else if (isFunction(response)) {
      commandOptions.unshift({
        args,
        env,
        callback: response,
      })
    }
    else {
      commandOptions.unshift(response as any)
    }

    return commandOptions
  }
}
