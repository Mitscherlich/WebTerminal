# WebTerminal

Full feature terminal for web.

## Quick start

1. clone this repo

```shell
$ git clone https://github.com/Mitscherlich/WebTerminal.git
```

2. install dependencies

```shell
$ cd WebTerminal && pnpm i && pnpm bootstrap
```

3. run dev server

```shell
$ pnpm dev
```

## TODOs

- [ ] support custom commands (maybe command register api?)
- [ ] fix unbuild and made it work with vite

## Credits

- [xterm.js](https://github.com/xtermjs/xterm.js)
- [wasmer-js](https://github.com/wasmerio/wasmer-js)
  - based on `@wasm/terminal` at `0.x` branch, with update-to-date `xterm.js` and `memfs` package instead.

## License

[MIT](LICENSE)

---

Made with ❤️ by [Mitscherlich](https://github.com/mitscherlich)
