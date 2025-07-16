'use strict'

const util = require('node:util')
const {once} = require('events')
const {test} = require('tap')
const {Chain} = require('../common/bootstrap.js')

test('elector - single instance', async (t) => {
  const {elector, environment} = await new Chain()
    .environment()
    .elector({
      auto_close: false
    , lease_name: '!template:"election-test-single-{{!random}}"'
    , leader_identity: '!template:"election-test-single-{{!pid}}"'
    , renew_interval_ms: 1000
    , lease_duration_sec: 500
    })
    .execute()

  t.teardown(() => {
    return elector.shutdown()
  })

  t.comment(util.format('kubernetes host: %s', environment.kubernetes_host))
  t.comment(util.format('kubernetes port: %s', environment.kubernetes_port))

  t.test('clean shutdown', async (t) => {
    const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
    elector.bootstrap()
    await t.resolves(evt)
    t.ok(elector.current_leader, 'elector is current leader')
  })
})
