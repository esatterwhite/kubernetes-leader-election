'use strict'

const {KubeConfig} = require('@kubernetes/client-node')

module.exports = environment

const DEFAULTS = {
  set_environment_variables: true
}

async function environment(opts = {}) {

  const config = this.lookup({
    ...DEFAULTS
  , ...opts
  })

  const kube_config = new KubeConfig()
  kube_config.loadFromDefault()

  const current_context = kube_config.currentContext
  const context = kube_config.contexts.find((item) => {
    return current_context === item.name
  })

  const cluster = kube_config.clusters.find((item) => {
    return item.name === context.cluster
  })

  const addr = new URL(cluster.server)

  if (config.set_environment_variables) {
    process.env.KUBERNETES_SERVICE_HOST = `${addr.hostname}`
    process.env.KUBERNETES_SERVICE_PORT = `${addr.port}`
  }

  return {
    kubernetes_host: addr.hostname
  , kubernetes_port: addr.port
  }
}
