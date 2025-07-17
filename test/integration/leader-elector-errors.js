'use strict'

const {once} = require('node:events')
const {setTimeout: sleep} = require('node:timers/promises')
const {test} = require('tap')
const {Chain} = require('../common/bootstrap.js')

test('elector', async (t) => {
  const chain = new Chain()
  t.test('error cases', async (t) => {
    t.test('createLease()', async () => {
      const {elector} = await chain
        .environment()
        .log()
        .elector({
          identity: '!template:"error-cases-create-lease-{{!random}}"'
        , lease_name: '!template:"error-cases-create-lease-{{!random}}"'
        , auto_close: false
        , wait_for_election: false
        , renew_interval_ms: 5000
        , lease_udration_sec: 10
        , log: '#log'
        })
        .execute()

      const createNamespacedLease = elector.client.createNamespacedLease
      t.teardown(() => {
        elector.stop()
      })

      elector.client.createNamespacedLease = async function() {
        await sleep(10)
        elector.client.createNamespacedLease = createNamespacedLease
        throw new Error('broke: unable create lease')
      }

      elector.start()
      const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
      t.resolves(evt, 'elector retries if lease creation failes')
    })

    t.test('getLease()', async (t) => {
      const {elector} = await chain
        .environment()
        .log()
        .elector({
          identity: '!template:"error-cases-get-lease-{{!random}}"'
        , lease_name: '!template:"error-cases-get-lease-{{!random}}"'
        , auto_close: false
        , wait_for_election: false
        , renew_interval_ms: 5000
        , lease_udration_sec: 10
        , log: '#log'
        })
        .execute()

      const getLease = elector.getLease
      t.teardown(() => {
        elector.stop()
      })

      elector.getLease = async function() {
        elector.getLease = getLease
        await sleep(100)
        throw new Error('broke: unable to connect')
      }

      const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
      t.resolves(evt, 'elector retries during leader election')
      elector.start()
    })

    t.test('renewLease()', async (t) => {
      const {elector} = await chain
        .environment()
        .log()
        .elector({
          identity: '!template:"error-cases-renew-lease-{{!random}}"'
        , lease_name: '!template:"error-cases-renew-lease-{{!random}}"'
        , auto_close: false
        , wait_for_election: true
        , renew_interval_ms: 1000
        , lease_udration_sec: 10
        , log: '#log'
        })
        .execute()

      const replaceNamespacedLease = elector.client.replaceNamespacedLease
      t.teardown(() => {
        elector.stop()
        elector.client.replaceNamespacedLease = replaceNamespacedLease
      })

      elector.start()
      await once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
      t.ok(elector.current_leader, 'elector is the current leader')

      elector.client.replaceNamespacedLease = async function() {
        await sleep(1)
        throw new Error('broke: try again later')
      }

      const evt = once(elector, elector.EVENTS.LEADERSHIP_LOST)
      await t.resolves(
        evt
      , 'leadership_lost event fired when lease cannot be updated due to error'
      )
      t.notOk(elector.current_leader, 'elector is not the leader')
    })
  })
})
