'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Readable } = require('node:stream')
const { gunzipSync, inflateRawSync } = require('node:zlib')
const DeflateFacility = require('../')

async function facility (t) {
  const fac = new DeflateFacility({}, {}, { env: 'test' })
  await new Promise((resolve, reject) => fac.start(err => err ? reject(err) : resolve()))
  t.after(() => new Promise(resolve => fac.stop(resolve)))
  return fac
}

test('gzip buffers round-trip and compression can be disabled', async t => {
  const fac = await facility(t)
  const data = Buffer.from('compression compatibility on Node 22')
  assert.deepEqual(gunzipSync(await fac.createBuffGzip(Readable.from([data]))), data)
  assert.deepEqual(await fac.createBuffGzip(Readable.from([data]), false), data)
})

test('ZIP buffers contain the requested file name and deflated payload', async t => {
  const fac = await facility(t)
  const data = Buffer.from('archive payload '.repeat(20))
  const [result] = fac.createBuffZip([{ stream: Readable.from([data]), data: { name: 'payload.txt' } }])
  const zip = await result
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  assert.equal(zip.readUInt16LE(8), 8)
  const nameLength = zip.readUInt16LE(26)
  assert.equal(zip.subarray(30, 30 + nameLength).toString(), 'payload.txt')
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  assert(central > 0)
  const start = 30 + nameLength + zip.readUInt16LE(28)
  const size = zip.readUInt32LE(central + 20)
  assert.deepEqual(inflateRawSync(zip.subarray(start, start + size)), data)
})

test('disabled ZIP compression returns each original stream separately', async t => {
  const fac = await facility(t)
  const values = [Buffer.from('one'), Buffer.from('two')]
  const result = await Promise.all(fac.createBuffZip(values.map(value => ({ stream: Readable.from([value]) })), false))
  assert.deepEqual(result, values)
})

test('buffering propagates input stream failures', async t => {
  const fac = await facility(t)
  const stream = new Readable({ read () { this.destroy(new Error('source failed')) } })
  await assert.rejects(fac.streamToBuffer(stream), /source failed/)
})

test('returned ZIP archives support globbing files', async t => {
  const { mkdtemp, writeFile, rm } = require('node:fs/promises')
  const { tmpdir } = require('node:os')
  const { join } = require('node:path')
  const root = await mkdtemp(join(tmpdir(), 'deflate-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'match.txt'), 'matching file')
  await writeFile(join(root, 'skip.log'), 'excluded file')
  const fac = await facility(t)
  const archive = fac.createZip()
  const result = fac.streamToBuffer(archive)
  archive.glob('*.txt', { cwd: root })
  await archive.finalize()
  const zip = await result
  assert(zip.includes(Buffer.from('match.txt')))
  assert(!zip.includes(Buffer.from('skip.log')))
})
