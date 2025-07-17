'use strict'

const {setTimeout: sleep} = require('node:timers/promises')
const os = require('node:os')
const {EventEmitter} = require('node:events')
const logger = require('abstract-logging')
const {
  CoordinationV1Api
, KubeConfig
, V1MicroTime
, Watch
} = require('@kubernetes/client-node')
const {EVENTS} = require('./constants.js')

logger.child = function() {
  return this
}

/**
 * Handles managing and watching a lease object allowing only 1 instance to be the leader
 * instance of the same idenity to be the leader
 * @class Elector
 * @inherits {require('events').EventEmitter}
 */
class Elector extends EventEmitter {
  log = logger
  client = null
  watch = null
  api_path = null
  #current_leader = false
  #shutting_down = false
  #LEADER_IDENTITY = null
  #SERVICE_HOST = null
  #lease_name = null
  #namespace = null

  /**
   * creates a new elector instance
   * @param {boolean} [auto_close=true] If true, the elector will try to stop itself when the `SIGINT` and `SIGTERM` signals are sent to the process
   * @param {string} [identity] A **unique** name for the elector used to claim leadership. THe name of the kubernetes pod is generally safe
   * @param {string} [lease_name=nodejs-leader-election] The name of the kubernetes lease the electors will manage
   * @param {require('abstract-logging')} log A logger instance that implements the interface. pino is recommended.
   * @param {string} [namespace=default] The namespace the elector should be constrained to
   * @param {number] [lease_duration_sec=20] The amount of time assigned to the active lease. After which it is considered expired and the election process will start again
   * @param {number} [renew_interval_ms=10000] The frequency at which the leader will attempt to renew its lease
   * @param {boolean} [wait_for_leadership=false] If `true`, when the start() method is called, the elector will wait for a leader to be elected.
   **/
  constructor({
    auto_close = true
  , identity = `elector-${os.hostname()}-${process.pid}`
  , lease_duration_sec = 20 // 2 * (this.renew_interval_ms / 1000)
  , lease_name = 'nodejs-leader-election'
  , log = logger
  , namespace = 'default'
  , renew_interval_ms = 10000
  , wait_for_leadership = false
  } = {}) {
    super()
    this.#SERVICE_HOST = process.env.KUBERNETES_SERVICE_HOST

    this.#LEADER_IDENTITY = identity
    this.#lease_name = lease_name
    this.#namespace = namespace
    this.renew_interval_ms = renew_interval_ms
    this.lease_duration_sec = lease_duration_sec
    this.wait_for_leadership = wait_for_leadership
    this.log = log?.child?.({
      module: 'kubernetes-leader-election'
    , identity: this.#LEADER_IDENTITY
    , lease: this.#lease_name
    })

    this.api_path = `/apis/coordination.k8s.io/v1/namespaces/${this.#namespace}/leases`
    if (!this.#SERVICE_HOST) return

    const kube_config = new KubeConfig()
    kube_config.loadFromDefault()
    this.client = kube_config.makeApiClient(CoordinationV1Api)
    this.watch = new Watch(kube_config)

    /* c8 ignore next 4 */
    if (auto_close) {
      process.once('SIGINT', this.stop.bind(this))
      process.once('SIGTERM', this.stop.bind(this))
    }
  }

  static get EVENTS() {
    return EVENTS
  }

  get EVENTS() {
    return EVENTS
  }

  get current_leader() {
    return this.#current_leader
  }

  get lease_name() {
    return this.#lease_name
  }

  get identity() {
    return this.#LEADER_IDENTITY
  }

  get namespace() {
    return this.#namespace
  }

  async acquireLease(lease) {
    lease.spec.holderIdentity = this.#LEADER_IDENTITY
    lease.spec.leaseDurationSeconds = this.lease_duration_sec
    lease.spec.acquireTime = new V1MicroTime(new Date())
    lease.spec.renewTime = new V1MicroTime(new Date())

    try {
      const body = await this.client.replaceNamespacedLease({
        name: this.#lease_name
      , namespace: this.#namespace
      , body: lease
      })

      this.log.debug('successfully acquired lease')
      return body
    } catch (err) {
      this.log.error(err, 'error while acquiring lease: %s', err.message)
      throw err
    }
  }

  /**
   * Starts the lease acquisition and election process
   * @async
   **/
  async start() {
    if (!this.#SERVICE_HOST) {
      this.#current_leader = true

      /**
       * Emitted when the elector instance claims ownership of a lease
       * @event Elector#leadership_acquired
       * @type {object}
       * @property {string} lease Then name of the lease the elector owns
       **/
      setImmediate(() => {
        this.emit(EVENTS.LEADERSHIP_ACQUIRED, {
          lease: this.#lease_name
        })
      })
      return
    }

    this.watchLease()
    if (this.wait_for_leadership) {
      await this.runLeaderElection()
      return
    }

    this.runLeaderElection().catch((err) => {
      this.log.error(err, 'Leader election failed: %s', err.message)
    })
  }

  async runLeaderElection() {
    // attempt to become leader
    await this.tryToBecomeLeader()

    // if not successful try a couple more times
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.#current_leader) break

      // wait 1/2 the lease duration
      await sleep(this.lease_duration_sec * 500)

      // try again
      await this.tryToBecomeLeader()
    }
  }

  async tryToBecomeLeader() {
    // if shutting down, don't try to become a leader
    if (this.#shutting_down) return
    try {
      let lease = await this.getLease()
      const lease_expired = this.leaseExpired(lease)
      const holder_identity = lease?.spec?.holderIdentity
      this.log.debug({lease_expired, holder_identity}, 'attempting to become leader')
      if (lease_expired || !lease?.spec?.holderIdentity) {
        this.log.debug('lease expired or not held. acquiring new lease')
        lease = await this.acquireLease(lease)
      }

      if (this.leaseOwner(lease)) return this.#becomeLeader()

    } catch (err) {
      this.log.error(err, 'error trying to become leader: %s', err.message)
    }
  }

  #becomeLeader() {
    this.#current_leader = true
    /**
     * Emitted when the elector instance claims ownership of a lease
     * @event Elector#leadership_acquired
     * @type {object}
     * @property {string} lease Then name of the lease the elector owns
     **/
    this.emit(EVENTS.LEADERSHIP_ACQUIRED, {lease: this.#lease_name})
    this.scheduleLeaseRenewal()
    this.log.debug('I am the leader')
  }

  async createLease() {

    try {
      const body = await this.client.createNamespacedLease({
        namespace: this.#namespace
      , body: {
          metadata: {
            name: this.#lease_name
          , namespace: this.#namespace
          }
        , spec: {
            holderIdentity: this.#LEADER_IDENTITY
          , leaseDurationSec: this.lease_duration_sec
          , acquireTime: new V1MicroTime(new Date())
          , renewTime: new V1MicroTime(new Date())
          }
        }
      })
      return body
    } catch (err) {
      this.log.error(err, 'failed to create lease: %s', err.message)
      throw err
    }
  }

  async getLease() {
    try {
      const body = await this.client.readNamespacedLease({
        name: this.#lease_name
      , namespace: this.#namespace
      })
      return body
    } catch (err) {
      if (err?.code === 404) {
        this.log.debug('lease not found, creating one.')
        return this.createLease()
      }

      throw err
    }
  }

  async handleLeaseDeletion() {
    if (this.#current_leader) return
    if (this.#shutting_down) return

    try {
      this.tryToBecomeLeader()
    } catch (err) {
      this.log.error(err, 'error while trying to become leader after lease deleteion')
    }
  }

  handleLeaseUpdate(lease) {
    if (this.#shutting_down) return
    if (this.leaseOwner(lease)) {
      if (!this.#current_leader) {
        setTimeout(() => {
          this.#becomeLeader()
        }, 2000)
      }
      this.scheduleLeaseRenewal()
    } else if (this.#current_leader) {
      this.loseLeadership()
    }
  }

  leaseExpired(lease) {
    const renew_time_ms = lease.spec.renewTime
      ? new Date(lease.spec.renewTime).getTime()
      : 0

    const lease_dur_sec = (lease.spec.leaseDurationSeconds || this.lease_duration_sec)
    const time_elapsed_ms = lease_dur_sec * 1000
    return Date.now() > renew_time_ms + time_elapsed_ms
  }

  leaseOwner(lease) {
    return lease.spec.holderIdentity === this.#LEADER_IDENTITY
  }

  loseLeadership() {
    if (!this.#current_leader) return

    this.#current_leader = false
    clearTimeout(this.lease_renewal_timeout)
    this.lease_renewal_timeout = null

    /**
     * Emitted when the elector instance loses ownership of a lease
     * @event Elector#leadership_lost
     * @type {object}
     * @property {string} lease Then name of the lease the elector previously owned
     **/
    this.emit(EVENTS.LEADERSHIP_LOST, {lease: this.#lease_name})
    this.log.debug('I am not the leader')
  }

  async releaseLease() {
    try {
      const lease = await this.getLease()
      if (!this.leaseOwner(lease)) return

      clearTimeout(this.lease_renewal_timeout)
      this.lease_renewal_timeout = null
      this.log.debug('releasing lease %s', this.#lease_name)

      lease.spec.holderIdentity = null
      lease.spec.renewTime = null
      await this.client.replaceNamespacedLease({
        name: this.#lease_name
      , namespace: this.#namespace
      , body: lease
      })
      this.log.debug('clear renew timeout')
      this.log.debug(`lease for ${this.#lease_name} release`)
    } catch (err) {
      this.log.error(err, 'failed to release lease')
    }
  }

  async renewLease() {
    try {
      const lease = await this.getLease()
      if (!this.leaseOwner(lease)) return this.loseLeadership()
      this.log.debug('renewing lease')

      lease.spec.renewTime = new V1MicroTime(new Date())
      const body = await this.client.replaceNamespacedLease({
        name: this.#lease_name
      , namespace: this.#namespace
      , body: lease
      })

      this.emit(EVENTS.LEASE_RENEWED, {
        lease: this.#lease_name
      , renew_time: lease.spec.renewTime.toISOString()
      })
      this.log.debug('successfully renewed lease')
      return body
    } catch (err) {
      this.log.error(err, 'error while renweing lease: %s', err.message)
      this.loseLeadership()
    }
  }

  scheduleLeaseRenewal() {
    clearTimeout(this.lease_renewal_timeout)

    this.lease_renewal_timeout = setTimeout(async () => {
      if (!this.#current_leader) return

      try {
        await this.renewLease()
      } catch (err) {
        this.log.error(err, 'Error while renewing lease %s', err.message)
      }
    }, this.renew_interval_ms)
  }

  /**
   * releases the lease resources and stops the kubernetes watcher if started
   * @async
   **/
  async stop() {
    if (this.#shutting_down) return

    this.#shutting_down = true
    this.watch_controller?.abort?.()
    this.log.debug('shutdown initiated')
    if (this.#current_leader) await this.releaseLease()
  }

  async watchLease() {

    try {
      this.watch_controller = await this.watch.watch(
        this.api_path
      , {}
      , (type, lease) => {
          // if the lease is not the one I care about - bail out
          if (lease?.metadata?.name !== this.#lease_name) return

          this.log.debug('watch event %s for lease: %s', type, this.#lease_name)

          switch (type) {
            case 'ADDED':
            case 'MODIFIED':
              setTimeout(this.handleLeaseUpdate.bind(this), 2000, lease).unref()
              break
            case 'DELETED':
              setTimeout(this.handleLeaseDeletion.bind(this), 2000, lease).unref()
              break
          }
        }
      , /* c8 ignore start */(err) => {
          if (err) {
            // if we are shutting down and the watcher was aborted - do nothing
            if (err.type === 'aborted' && this.#shutting_down) return
            this.log.error(err, 'watch for lease ended with error')
          }
          if (!err) this.log.debug('watch for leased gracefully closed')

          // restart the watch
          setTimeout(this.watchLease.bind(this), 5000).unref()
        } /* c8 ignore stop */
      )
    } catch (err) {
      this.log.error(err, 'Failed to start watch for lease: %s', err.message)
      this.log.error('trying again in 5 seconds')
      // Retry starting the watch after a delay
      setTimeout(this.watchLease.bind(this), 5000).unref()
    }
  }

}

module.exports = Elector
