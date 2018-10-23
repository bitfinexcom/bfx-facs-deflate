'use strict'

const zlib = require('zlib')
const archiver = require('archiver')
const { pick } = require('lodash')
const async = require('async')
const Base = require('bfx-facs-base')

class DeflateFacility extends Base {
  constructor (caller, opts, ctx) {
    super(caller, opts, ctx)

    this.name = 'deflate'
    this._hasConf = false

    this.init()
  }

  _start (cb) {
    async.series([
      next => {
        super._start(next)
      },
      next => {
        this.params = pick(
          { ...this.opts },
          [
            'flush',
            'finishFlush',
            'chunkSize',
            'windowBits',
            'level',
            'memLevel',
            'strategy',
            'dictionary',
            'info'
          ]
        )

        next()
      }
    ], cb)
  }

  streamToBuffer (stream) {
    const bufs = []

    return new Promise((resolve, reject) => {
      stream.on('data', (data) => {
        bufs.push(data)
      })
      stream.once('end', () => {
        resolve(Buffer.concat(bufs))
      })
      stream.once('error', err => {
        reject(err)
      })
    })
  }

  createGzip (readStream, params = {}) {
    const gzip = zlib.createGzip({
      ...this.params,
      ...params
    })

    return readStream.pipe(gzip)
  }

  createZip (readStreams = [], params = {}) {
    const _params = {
      ...params,
      zlib: {
        level: 9,
        ...this.params,
        ...(params.zlib || {})

      }
    }
    const archive = archiver('zip', _params)

    let count = 1

    readStreams.forEach((
      {
        stream,
        data = { name: `file_${count}` }
      }
    ) => {
      archive.append(
        stream,
        pick(
          { ...data },
          [
            'name',
            'date',
            'mode',
            'prefix',
            'stats',
            'store'
          ]
        )
      )

      count += 1
    })

    return archive
  }

  createBuffGzip (
    readStream,
    isGzipOn = true,
    params = {}
  ) {
    const stream = isGzipOn
      ? this.createGzip(readStream, params)
      : readStream

    return this.streamToBuffer(stream)
  }

  createBuffZip (
    readStreams = [],
    isZipOn = true,
    params = {}
  ) {
    if (isZipOn) {
      const archive = this.createZip(readStreams, params)
      const promise = this.streamToBuffer(archive)

      archive.finalize()

      return [promise]
    } else {
      return readStreams.map(({ stream }) => {
        return this.streamToBuffer(stream)
      })
    }
  }

  _stop (cb) {
    super._stop(cb)
  }
}

module.exports = DeflateFacility
