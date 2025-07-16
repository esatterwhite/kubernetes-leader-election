'use strict'

const {setTimeout: sleep} = require('node:timers/promises')
const util = require('node:util')
const {test} = require('tap')
const {Chain} = require('../common/bootstrap.js')

test('elector - single instance', async (t) => {
  const {
    elector_one
  , elector_two // expect to be the leader
  , environment
  } = await new Chain()
    .set('lease_name', '!template:"election-test-multi-{{!random}}"')
    .environment()
    .log()
    .elector({
      auto_close: false
    , log: '#log'
    , lease_name: '#lease_name'
    , leader_identity: '!template:"election-test-multi-{{!incr}}"'
    , wait_for_leadership: false
    }, 'elector_one')
    .elector({
      auto_close: false
    , log: '#log'
    , lease_name: '#lease_name'
    , leader_identity: '!template:"election-test-multi-{{!incr}}"'
    , wait_for_leadership: true
    }, 'elector_two')
    .execute()

  t.teardown(() => {
    return Promise.all([
      elector_one.shutdown()
    , elector_two.shutdown()
    ])
  })

  t.comment(util.format('kubernetes host: %s', environment.kubernetes_host))
  t.comment(util.format('kubernetes port: %s', environment.kubernetes_port))

  await elector_two.bootstrap()
  elector_one.bootstrap()
  await sleep(1000)
  t.notOk(elector_one.current_leader, 'elector_one not elected as leader')
  t.ok(elector_two.current_leader, 'elector_two elected as leader')
})
