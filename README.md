# symlink-dir

[![Greenkeeper badge](https://badges.greenkeeper.io/zkochan/symlink-dir.svg)](https://greenkeeper.io/)

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
const symlinkDir = require('symlink-dir').default
const path = require('path')
const cwd = process.cwd()

symlinkDir(path.join(cwd, 'src'), path.join(cwd, 'node_modules/src'))
```
<!--/@-->

## License

[MIT](./LICENSE) © [Zoltan Kochan](http://kochan.io)