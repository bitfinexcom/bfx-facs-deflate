'use strict'

const assert = require('node:assert/strict')
const test = require('brittle')
const { PassThrough } = require('node:stream')
const DeflateFacility = require('../index')

const facility = Object.create(DeflateFacility.prototype)
facility.params = {}

test('createBuffZip rejects when a source stream errors', async () => {
  const source = new PassThrough()
  const sourceError = new Error('source failed')

  const [zip] = facility.createBuffZip([{ stream: source, data: { name: 'file' } }])
  source.emit('error', sourceError)

  await assert.rejects(
    Promise.race([
      zip,
      new Promise((_, reject) => setTimeout(() => reject(new Error('zip did not reject')), 100))
    ]),
    err => err === sourceError
  )
})

test('streamToBuffer removes its error listener after rejection', async () => {
  const source = new PassThrough()
  const buffered = facility.streamToBuffer(source)

  source.emit('error', new Error('first error'))
  await assert.rejects(buffered, /first error/)
  assert.throws(() => source.emit('error', new Error('later error')), /later error/)
})

test('createBuffZip rejects when finalization fails', async () => {
  const finalizeError = new Error('finalize failed')
  const archive = new PassThrough()
  archive.finalize = () => Promise.reject(finalizeError)
  const brokenFacility = Object.create(facility)
  brokenFacility.createZip = () => archive

  const [zip] = brokenFacility.createBuffZip()
  await assert.rejects(
    Promise.race([
      zip,
      new Promise((_, reject) => setTimeout(() => reject(new Error('zip did not reject')), 100))
    ]),
    err => err === finalizeError
  )
})

test('createBuffZip resolves an empty archive after finalization', async () => {
  const [zip] = facility.createBuffZip()
  const buffer = await Promise.race([
    zip,
    new Promise((_, reject) => setTimeout(() => reject(new Error('zip did not complete')), 100))
  ])

  assert.equal(buffer.subarray(0, 2).toString(), 'PK')
})
