'use strict'

const {once} = require('events')
const {test} = require('tap')
const {Chain} = require('../common/bootstrap.js')

test('elector - single instance', async (t) => {
  const {elector} = await new Chain()
    .environment()
    .elector({
      auto_close: false
    , lease_name: '!template:"election-test-single-{{!random}}"'
    , leader_identity: '!template:"election-test-single-{{!pid}}"'
    })
    .execute()

  t.teardown(() => {
    return elector.shutdown()
  })

  t.test('clean shutdown', async (t) => {
    const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
    elector.bootstrap()
    await t.resolves(evt)
    t.ok(elector.current_leader, 'elector is current leader')
  })
})
