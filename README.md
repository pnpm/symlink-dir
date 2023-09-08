# symlink-dir

> Cross-platform directory symlinking

<!--@shields('npm')-->
[![npm version](https://img.shields.io/npm/v/symlink-dir.svg)](https://www.npmjs.com/package/symlink-dir)
<!--/@-->

* Always uses "junctions" on Windows. Even though support for "symbolic links" was added in Vista+, users by default lack permission to create them
* Any file or directory, that has the destination name, is renamed before creating the link

## Installation

```sh
pnpm add symlink-dir
```

## CLI Usage

Lets suppose you'd like to self-require your package. You can link it to its own `node_modules`:

```sh
# from -> to
symlink-dir . node_modules/my-package
```

## API Usage

<!--@example('./example.js')-->
```js
'use strict'
const symlinkDir = require('symlink-dir')
const path = require('path')

symlinkDir('src', 'node_modules/src')
  .then(result => {
    console.log(result)
    //> { reused: false }

    return symlinkDir('src', 'node_modules/src')
  })
  .then(result => {
    console.log(result)
    //> { reused: true }
  })
  .catch(err => console.error(err))
```
<!--/@-->

## API

### `symlinkDir(target, path, opts?): Promise<{ reused: boolean, warn?: string }>`
### `symlinkDir.sync(target, path, opts?): { reused: boolean, warn?: string }`

Creates the link called `path` pointing to `target`.

Options:

* `overwrite` - *boolean* - is `true` by default. When `false`, existing files at dest are not overwritten.

Result:

* `reused` - *boolean* - is `true` if the symlink already existed pointing to the `target`.
* `warn` - *string* - any issues that happened during linking (it does mean a failure).

## License

[MIT](./LICENSE) © [Zoltan Kochan](https://www.kochan.io)
