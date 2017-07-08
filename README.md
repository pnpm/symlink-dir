# symlink-dir

> Cross-platform directory symlinking

<!--@shields('npm', 'travis', 'appveyor')-->
[![npm version](https://img.shields.io/npm/v/symlink-dir.svg)](https://www.npmjs.com/package/symlink-dir) [![Build Status](https://img.shields.io/travis/zkochan/symlink-dir/master.svg)](https://travis-ci.org/zkochan/symlink-dir) [![Build Status on Windows](https://img.shields.io/appveyor/ci/zkochan/symlink-dir/master.svg)](https://ci.appveyor.com/project/zkochan/symlink-dir/branch/master)
<!--/@-->

Always uses "junctions" on Windows. Even though support for "symbolic links" was added in Vista+, users by default
lack permission to create them

## Installation

```sh
npm i -S symlink-dir
```

## CLI Usage

Lets suppose you'd like to self-require your package. You can link it to its own node_modules:

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

### `symlinkDir(src, dest): Promise<{reused: boolean}>`

Creates a symlink in `dest` that points to `src`. Returns an object that contains a boolean property called `reused`.
`reused` is `true` if the symlink already existed pointing to the `src`.

## License

[MIT](./LICENSE) © [Zoltan Kochan](http://kochan.io)
