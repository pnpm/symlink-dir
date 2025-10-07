# symlink-dir

> Cross-platform directory symlinking

<!--@shields('npm')-->
[![npm version](https://img.shields.io/npm/v/symlink-dir.svg)](https://www.npmjs.com/package/symlink-dir)
<!--/@-->

* Uses "junctions" on Windows if "symbolic links" is disallowed. Even though support for "symbolic links" was added in Vista+, users by default lack permission to create them
  * **⚠️ Windows Junction Warning**: On Windows, this library will create a junction even if the target is not a directory. However, Windows junctions can only point to directories, so creating a junction to a file will result in a broken, non-functioning junction. This library does not check if the target exists or is a directory. If there's a chance that the target is a file, either check it yourself before calling `symlink-dir` or set `noJunction` to `true` to prevent creating a broken junction.
* If you prefer symbolic links in Windows, [turn on the Developer Mode](https://learn.microsoft.com/windows/apps/get-started/enable-your-device-for-development#activate-developer-mode)
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
* `noJunction` - *boolean* - is `false` by default. When `true`, forces creation of real symbolic links and never falls back to junctions on Windows. If symbolic links cannot be created (e.g., insufficient permissions), an error will be thrown instead of falling back to junctions.

Result:

* `reused` - *boolean* - is `true` if the symlink already existed pointing to the `target`.
* `warn` - *string* - any issues that happened during linking (it does mean a failure).

## License

[MIT](./LICENSE) © [Zoltan Kochan](https://www.kochan.io)
