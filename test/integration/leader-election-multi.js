'use strict'

const {once} = require('node:events')
const {setTimeout: sleep} = require('node:timers/promises')
const util = require('node:util')
const {test} = require('tap')
const {Chain} = require('../common/bootstrap.js')

test('elector - multi instance', async (t) => {
  t.test('manual failover', async (t) => {
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
      , identity: '!template:"election-test-multi-{{!incr}}"'
      , wait_for_leadership: false
      }, 'elector_one')
      .elector({
        auto_close: false
      , log: '#log'
      , lease_name: '#lease_name'
      , identity: '!template:"election-test-multi-{{!incr}}"'
      , wait_for_leadership: true
      }, 'elector_two')
      .execute()

    t.teardown(() => {
      return Promise.all([
        elector_one.stop()
      , elector_two.stop()
      ])
    })

    t.comment(util.format('kubernetes host: %s', environment.kubernetes_host))
    t.comment(util.format('kubernetes port: %s', environment.kubernetes_port))

    t.test('initial election', async (t) => {
      await elector_two.start()
      elector_one.start()
      await sleep(1000)
      t.notOk(elector_one.current_leader, 'elector_one not elected as leader')
      t.ok(elector_two.current_leader, 'elector_two elected as leader')
    })

    t.test('leader loss (manual stop)', async (t) => {
      const event = once(elector_one, elector_one.EVENTS.LEADERSHIP_ACQUIRED)
      elector_two.stop()
      // do not await for this to complete
      // rather wait for the follower to be elected
      t.resolves(event, 'remaining elector acquires leadership')
    })
  })

  t.test('implicit failover', async (t) => {
    const {
      elector_one
    , elector_two // expect to be the leader
    , lease_name
    } = await new Chain()
      .set('lease_name', '!template:"election-test-multi-implicit-{{!random}}"')
      .environment()
      .log()
      .elector({
        auto_close: false
      , log: '#log'
      , lease_name: '#lease_name'
      , identity: '!template:"election-test-multi-implicit-{{!incr}}"'
      , wait_for_leadership: false
      , lease_duration_sec: 10
      , renew_interval_ms: 5000
      }, 'elector_one')
      .elector({
        auto_close: false
      , log: '#log'
      , lease_name: '#lease_name'
      , identity: '!template:"election-test-multi-implicit-{{!incr}}"'
      , wait_for_leadership: true
      , lease_duration_sec: 10
      , renew_interval_ms: 5000
      }, 'elector_two')
      .execute()

    t.teardown(() => {
      return Promise.all([
        elector_one.stop()
      , elector_two.stop()
      ])
    })

    await elector_two.start()
    await elector_one.start()

    {
      const lease = await elector_two.getLease()
      t.match(lease.metadata.name, elector_two.lease_name, 'found correct lease')
    }

    // if a lease goes missing it should be re-created
    // and leadership election continues
    elector_two.client.deleteNamespacedLease({
      name: lease_name
    , namespace: 'default'
    })

    await t.resolves(Promise.race([
      once(elector_one, elector_one.EVENTS.LEADERSHIP_ACQUIRED)
    , once(elector_two, elector_two.EVENTS.LEADERSHIP_ACQUIRED)
    ]), 'new leader elected')

    {
      const lease = await elector_two.getLease()
      t.match(lease.metadata.name, elector_two.lease_name, 'correct lease recreated')
    }
  })

  t.test('forced failover', async (t) => {
    const {
      elector_one
    , elector_two // expect to be the leader
    , lease_name
    } = await new Chain()
      .set('lease_name', '!template:"election-test-multi-forced-{{!random}}"')
      .environment()
      .log()
      .elector({
        auto_close: false
      , log: '#log'
      , lease_name: '#lease_name'
      , identity: '!template:"election-test-multi-forced-{{!incr}}"'
      , wait_for_leadership: false
      , lease_duration_sec: 10
      , renew_interval_ms: 5000
      }, 'elector_one')
      .elector({
        auto_close: false
      , log: '#log'
      , lease_name: '#lease_name'
      , identity: '!template:"election-test-multi-forced-{{!incr}}"'
      , wait_for_leadership: true
      , lease_duration_sec: 10
      , renew_interval_ms: 5000
      }, 'elector_two')
      .execute()

    t.teardown(() => {
      return Promise.all([
        elector_one.stop()
      , elector_two.stop()
      ])
    })

    await elector_two.start()
    await elector_one.start()
    t.ok(elector_two.current_leader, 'elector_two.current_leader')

    {
      const lease = await elector_two.getLease()
      t.match(lease.metadata.name, elector_two.lease_name, 'found correct lease')

      // manually set the lease identity to a different elector identity
      lease.spec.holderIdentity = elector_one.identity
      await elector_one.client.replaceNamespacedLease({
        name: lease_name
      , namespace: 'default'
      , body: lease
      })
    }

    await t.resolves(Promise.all([
      once(elector_one, elector_one.EVENTS.LEADERSHIP_ACQUIRED)
    , once(elector_two, elector_two.EVENTS.LEADERSHIP_LOST)
    ]), 'leadership resolved to elector_one')

    t.same(elector_one.current_leader, true, 'elector_one.current_leader=true')
    t.same(elector_two.current_leader, false, 'elector_two.current_leader=true')
  })
})
