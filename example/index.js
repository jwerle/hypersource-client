const hypersource = require('hypersource')
const hyperdrive = require('hyperdrive')
const mirror = require('mirror-folder')
const hsurl = require('../')
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
