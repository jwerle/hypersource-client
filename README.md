hypersource-client
==================

Simple client to talk to HyperSource endpoints

## Installation

```sh
$ npm install hypersource-client
```

## Usage

The hypersource client can be used from the command line are directly in
module code.

### Command Line

The following will send an input `hyper{core,drive,db,trie}` or `DAT`
archive to an point and output the response into `output-directory/`.

```sh
$ hsurl ws://endpoint.com -i /path/to/hyper{core,drive,db,trie} -o output-directory
```

### Programmatic

```js
const hypercore = require('hypercore')
const hsurl = require('hypersource-client')
const ram = require('random-access-memory')

const host = `ws://domain.com`
const req = hypercore(ram, key, opts)
const client = hsurl(req, host).connnect(onconnect)

// append buffer to request feed
req.append('hello')

function onconnect(err, res) {
  res.head(console.log)
}
```

## Example

Below is an example of a
[hypersource](https://github.com/jwerle/hypersource) server that echos
a [hyperdrive](https://github.com/mafintosh/hyperdrive) back to the
client and the exits.

```js
const hypersource = require('hypersource')
const hyperdrive = require('hyperdrive')
const mirror = require('mirror-folder')
const hsurl = require('hypersource-client')
const pump = require('pump')
const path = require('path')
const ram = require('random-access-memory')

const registry = hyperdrive(ram)
const bundle = hyperdrive(ram)
const server = hypersource({ registry }, onrequest)

server.listen(3000, onlistening)

function onrequest(req, res) {
  const source = hyperdrive(ram, req.key, req)
  const echo = hyperdrive(ram, res.key, res)

  source.replicate(req).once('handshake', onhandshake)

  function onhandshake() {
    source.once('update', onupdate)
  }

  function onupdate() {
    const src = { fs: source, name: '/' }
    const dst = { fs: echo, name: '/' }
    mirror(src, dst, onmirror)
  }

  function onmirror(err) {
    if (err) {
      console.error('ERR', err)
      res.close()
    } else {
      echo.replicate(res)
    }
  }
}

function onlistening(err) {
  if (err) {
    throw err
  }

  bundle.ready(() => {
    bundle.writeFile('hello.txt', 'hello world', onwrite)
  })
}

function onwrite(err) {
  if (err) {
    throw err
  }

  const client = hsurl(bundle, 'ws://localhost:3000')
  client.connect(onconnect)
}

function onconnect(err, res, req, socket) {
  if (err) {
    console.error('ERR', err)
  } else {
    res.once('update', () => {
      const index = res.createReadStream('hello.txt')

      index.on('error', (err) => {
        console.error('ERR', err)
      })

      index.on('end', () => {
        server.close()
        registry.close()
        process.nextTick(process.exit, 0)
      })

      index.pipe(process.stdout)
    })
  }
}
```

## API

### `client = require('hypersource-client')(hyperObject, opts)`

Create a client request with a hypercore or `hyper*` like object (`hypercore`,
`hyperdrive`, `hypertrie`, `hyperdb`, etc...) where `opts` can be a
`string` that represents the WebSocket endpoint to connect to or an
object that may look like:

```js

{
  endpoint: String, // the WebSocket endpoint to connect to (eg: ws://domain.com
  timeout: Number, // A timeout in milliseconds for the underlying hypercore protocol stream. Defaults to '30000'
  discovery: Object | Boolean, // Options passed directly to
'hyperdiscovery'. Set to 'false' to disable
}
```

```js
const client = require('hypersource-client')(feed, 'wss://domain.com')
```

#### DAT Network

The client will join the DAT network for a given `hyper*` object and
attempt to replicate it with the network. This is useful if the input
request `hyper*` object lives somewhere else.

#### `client.connect(callback)`

Connect to WebSocket server and send request calling
`callback(err, res, req, socket)` upon success or failure where:

* `err` is a possible error that could have occurred while connecting.
  (Default: `null`)
* `res` is a `hyper*` like object that is equivalent in type to the
  input `hyper*` object. If you give the client a `hypercore`, you get
  back a `hypercore` as a response object. The same can be said about
  `hyperdrive`, etc
* `req` is the input `hyper*` object given as request input
* `socket` is the underlying WebSocket backing this connection

```js
client.connect((err, res) => {
  if (err) {
    // handle error
  } else {
    res.update(() => { // asumes hypercore given
      res.head(console.log)
    })
  }
})
```

#### `client.close(callback)`

Closes the client and the underlying resources.

```js
client.close((err) => {
  if (err) {
    // handle error while closing client
  }
})
```

#### `client.destroy([err])`

Destroys the client with an optional `err`.

#### `client.on('error', err)`

Emitted when an error occurs.

#### `client.on('peer', peer)`

Emitted when a peer is discovered from
[hyperdiscovery](https://github.com/karissa/hyperdiscovery).

## Command Line API

```
usage: hsurl [-hDV] [options] <endpoint>
where options can be:

  -i, --input     Path to storage for input feed
  -o, --output    Path to storage for output feed
  -f, --force     Force actions like overwriting a file or directory
  -k, --key       Public key for storage feed
  -t, --type      The feed type (eg: hypercore|hyperdrive|hypertrie...) (Default: 'hypercore')
  -h, --help      Show this message
  -D, --debug     Enable debug output (DEBUG="hypersource-client")
  -V, --version   Show program version
      --sparse    Treat input as sparse input
      --latest    Treat input (and output) latest (only for hyperdrive|DAT)
      --stdin     Read request from stdin
      --stdout    Output response to stdout
      --encoding  Set input encoding (--stdout) (Default: 'binary')
      --utf8      Alias for '--enoding=utf8'

```

## License

MIT
