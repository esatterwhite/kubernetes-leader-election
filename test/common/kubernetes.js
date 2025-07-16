'use strict'

const {KubeConfig} = require('@kubernetes/client-node')

module.exports = {
  clusterInfo
, clusterHost
, clusterPort
}

function clusterInfo(ctx) {
  const config = new KubeConfig()
  config.loadFromDefault()

  const current_context = ctx || config.currentContext
  const context = config.contexts.find((item) => {
    return current_context === item.name
  })

  const cluster = config.clusters.find((item) => {
    return item.name === context.cluster
  })

  const addr = new URL(cluster.server)

  return {
    kubernetes_host: addr.hostname
  , kubernetes_port: addr.port
  }
}

function clusterHost(ctx) {
  const {kubernetes_host} = clusterInfo(ctx)
  return kubernetes_host
}

function clusterPort(ctx) {
  const {kubernetes_port} = clusterInfo(ctx)
  return kubernetes_port
}
