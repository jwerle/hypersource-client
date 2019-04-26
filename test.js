const hypersource = require('hypersource')
const hyperdrive = require('hyperdrive')
const hypertrie = require('hypertrie')
const hypercore = require('hypercore')
const hyperdb = require('hyperdb')
const through = require('through2')
const crypto = require('crypto')
const mirror = require('mirror-folder')
const hsurl = require('./')
const pump = require('pump')
const test = require('tape')
const ram = require('random-access-memory')

function replicate(src, dst, cb) {
  const alice = src.replicate()
  const bob = dst.replicate()
  return pump(alice, bob, alice, cb)
}

test('hsurl(hypercore)', (t) => {
  t.plan(1)

  const feed = hypercore(ram)
  const server = hypersource((req, res) => {
    const source = hypercore(ram, req.key, req)
    const echo = hypercore(ram, res.key, res)

    source.replicate(req)
    source.update(() => {
      pump(
        source.createReadStream(),
        echo.createWriteStream(),
        () => echo.replicate(res)
      )
    })
  })

  server.listen(0, '127.0.0.1', (err) => {
    if (err) {
      throw err
    }

    const { port } = server.address()
    const message = Buffer.from('hello')

    feed.append(message, () => {
      const client = hsurl(feed, `ws://127.0.0.1:${port}`).connect((err, res) => {
        res.update(() => {
          res.head((err, buf) => {
            t.ok(
              0 === Buffer.compare(buf, message),
              'does echo message over hypercore'
            )
            server.close()
            client.close()
          })
        })
      })
    })
  })
})

test('hsurl(hyperdrive)', (t) => {
  t.plan(1)

  const drive = hyperdrive(ram)
  const server = hypersource((req, res) => {
    const source = hyperdrive(ram, req.key, req)
    const echo = hyperdrive(ram, res.key, res)

    source.replicate(req)

    source.on('update', () => {
      mirror(
        { fs: source, name: '/' },
        { fs: echo, name: '/' },
        () => echo.replicate(res)
      )
    })
  })

  server.listen(0, '127.0.0.1', (err) => {
    if (err) {
      throw err
    }

    const { port } = server.address()
    const message = Buffer.from('hello')

    drive.writeFile('message', message, (err) => {
      const client = hsurl(drive, `ws://127.0.0.1:${port}`).connect((err, res) => {
        res.readFile('message', (err, buf) => {
          t.ok(
            0 === Buffer.compare(buf, message),
            'does echo message over hyperdrive'
          )
          server.close()
          client.close()
        })
      })
    })
  })
})

test('hsurl(hypertrie)', (t) => {
  t.plan(1)

  const trie = hypertrie(ram)
  const server = hypersource((req, res) => {
    const source = hypertrie(ram, req.key, req)
    const echo = hypertrie(ram, res.key, res)

    source.replicate(req)
    source.feed.update(() => {
      pump(
        source.feed.createReadStream(),
        echo.feed.createWriteStream(),
        () => echo.replicate(res)
      )
    })
  })

  server.listen(0, '127.0.0.1', (err) => {
    if (err) {
      throw err
    }

    const { port } = server.address()
    const message = Buffer.from('hello')

    trie.ready(() => {
      trie.put('message', message, (err) => {
        const client = hsurl(trie, `ws://127.0.0.1:${port}`).connect((err, res) => {
          res.feed.update(() => {
            res.get('message', (err, node) => {
              t.ok(
                0 === Buffer.compare(node.value, message),
                'does echo message over hypertrie'
              )
              server.close()
              client.close()
            })
          })
        })
      })
    })
  })
})

test('hsurl(hyperdb)', (t) => {
  t.plan(1)

  const db = hyperdb(ram)
  const server = hypersource((req, res) => {
    const source = hyperdb(ram, req.key)
    const echo = hyperdb(ram, res.key, { secretKey: res.secretKey})

    source.replicate(req).once('handshake', () => {

      pump(
        source.createReadStream(),
        through.obj(ontransform),
        echo.createWriteStream(),
        () => echo.replicate(res)
      )
    })

    function ontransform(node, _, done) {
      return done(null, Object.assign(node, { type: 'put' }))
    }
  })

  server.listen(0, '127.0.0.1', (err) => {
    if (err) {
      throw err
    }

    const { port } = server.address()
    const messages = Array(5).fill(0).map(() => crypto.randomBytes(32))
    const batch = messages.map((buffer, i) => ({
      value: buffer,
      type: 'put',
      key: String(i),
    }))

    db.ready(() => {
      db.batch(batch, (err) => {
        const client = hsurl(db, `ws://127.0.0.1:${port}`).connect((err, res) => {
          res.list((err, nodes) => {
            const values = nodes.sort(sort).map((n) => n[0].value)
            t.ok(
              0 === Buffer.compare(
                Buffer.concat(messages),
                Buffer.concat(values),
              )
            )

            client.close()
            server.close()
          })

          function sort(a, b) {
            const i = parseInt(a[0].key)
            const j = parseInt(b[0].key)
            return i === j ? 0 : i < j ? -1 : 1
          }
        })
      })
    })
  })
})
