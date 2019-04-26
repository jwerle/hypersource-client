const { EventEmitter } = require('events')
const hyperdiscovery = require('hyperdiscovery')
const WebSocket = require('simple-websocket')
const thunky = require('thunky')
const pump = require('pump')
const ram = require('random-access-memory')
const url = require('url')

const DEFAULT_TIMEOUT = 30000
const noop = () => void 0

class Client extends EventEmitter {
  constructor(request, opts) {
    if (!opts || 'object' !== typeof opts) {
      opts = {}
    }

    super()

    this.connecting = false
    this.destroyed = false
    this.connected = false
    this.endpoint = opts.endpoint
    this.response = null
    this.request = request
    this.Factory = request.constructor
    this.timeout = opts.timeout
    this.socket = null
    this.stream = null
    this.type = this.Factory.name.toLowerCase()
    this.key = null
    this.url = null

    this.onconnect = this.onconnect.bind(this)
    this.onclose = this.onclose.bind(this)
    this.onerror = this.onerror.bind(this)

    if ('number' !== typeof this.timeout) {
      this.timeout = DEFAULT_TIMEOUT
    }

    this.setMaxListeners(0)
    this.ready = thunky((ready) => {
      request.ready(() => {
        const pathname = `/${request.key.toString('hex')}`

        this.discovery = hyperdiscovery(request)
        this.key = request.key
        this.url = String(new url.URL(pathname, this.endpoint))

        this.discovery.setMaxListeners(0)
        this.discovery._swarm.setMaxListeners(0)
        this.discovery.on('error', (err) => {
          this.emit('error', err)
        })


        this.discovery.on('peer', (peer) => {
          this.emit('peer', peer)
        })

        ready()
      })
    })
  }

  onclose() {
    if (this.stream) {
      if ('function' === typeof this.stream.finalize) {
        this.stream.finalize()
      }
    }

    if (this.response) {
      if ('function' === typeof this.response.close) {
        this.response.close()
      } else if (Array.isArray(this.response.feeds)) {
        for (const feed of this.response.feeds) {
          feed.close()
        }
      }
    }

    if (this.request) {
      if ('function' === typeof this.request.close) {
        this.request.close()
      } else if (Array.isArray(this.request.feeds)) {
        for (const feed of this.request.feeds) {
          feed.close()
        }
      }
    }

    if (this.discovery) {
      if ('function' === typeof this.discovery.close) {
        this.discovery.close()
      }
    }

    this.connecting = false
    this.connected = false
    this.destroyed = true
    this.discovery = null
    this.response = null
    this.request = null
    this.socket = null
    this.stream = null
    this.ready = thunky(noop) // will never resolve
    this.key = null
    this.url = null

    this.emit('close')
  }

  onerror(err) {
    this.emit('error', err)
  }

  onconnect() {
    if (this.destroyed) {
      return
    }

    this.connecting = false
    this.connected = true
    this.stream = this.request.replicate({
      timeout: this.timeout,
      live: true,
    })

    this.stream.once('handshake', () => {
      this.emit('handshake', this.stream)

      this.response = new this.Factory(ram, this.stream.remoteUserData)
      this.response.replicate({
        timeout: this.timeout,
        stream: this.stream,
        live: true,
      })

      this.stream.once('close', () => {
        this.close()
      })

      this.response.ready(() => {
        this.emit('connect',
          this.response,
          this.request,
          this.socket,
          this.stream)
      })
    })

    pump(this.stream, this.socket, this.stream, (err) => {
      if (err) {
        this.emit('error', err)
      }
    })
  }

  connect(callback) {
    if ('function' !== typeof callback) {
      callback = (err) => err && this.emit('error', err)
    }

    this.ready(() => {
      if (this.connecting) {
        const err = new Error('Client is already connecting')
        return process.nextTick(callback, err)
      }

      if (this.connected) {
        const err = new Error('Client is already connected')
        return process.nextTick(callback, err)
      }

      if (this.destroyed) {
        const err = new Error('Client is destroyed')
        return process.nextTick(callback, err)
      }

      this.connecting = true
      this.connected = false
      this.socket = new WebSocket(this.url)

      this.socket.on('connect', this.onconnect)
      this.socket.on('close', this.onclose)
      this.socket.on('error', this.onerror)

      this.socket.once('connect', () => {
        this.once('connect', onconnect)
      })
    })

    return this

    function onconnect(req, res, socket, stream) {
      callback(null, req, res, socket, stream)
    }
  }

  close(callback) {
    if ('function' === typeof callback) {
      this.once('close', callback)
    }

    this.stream.finalize()
    this.destroy()
  }

  destroy(err) {
    if (this.socket) {
      this.socket.destroy(err)
    } else {
      this.emit('error', err)
    }
  }
}

function createClient(request, opts) {
  if ('string' === typeof opts) {
    opts = { endpoint: opts }
  }

  return new Client(request, opts)
}

module.exports = Object.assign(createClient, {
  Client
})
