/* global Peer */
'use strict'

class Node {
  constructor (selfId, ...neighborsIds) {
    let key = 'ovfams42kz2awcdi'
    this.CMD = 'propagate'
    this.selfId = selfId
    this._neighborsIds = neighborsIds
    this._peer = new Peer(selfId, { key: key, secure: true })
    this._value = ~~(Math.random() * 1e3)
    this._initiator = null
    this._connections = new Map(
      neighborsIds.map(peerId => [peerId, {
        inbound: null,
        outbound: null,
        resp: null,
        respHandler: () => {}
      }])
    )

    this._peer.on('connection', conn => {
      let peerId = conn.peer
      let connObj = this._connections.get(peerId)
      connObj.inbound = conn

      conn.on('data', data => {
        console.log(`${peerId} >>> msg: ${data} >>> ${this.selfId}`)

        if (data === this.CMD) {
          if (this._initiator === null) {
            this._initiator = peerId
            setTimeout(() => this.propagate(peerId))
          } else {
            connObj.outbound.send(String(Infinity))
          }
        } else {
          connObj.respHandler(data)
        }
      })
    })

    this._peer.on('error', console.error)

    this._promiseReady = new Promise(resolve => this._peer.on('open', resolve))
    this._promiseConnected = undefined
    this.ready(() => console.log(`Node ${selfId} (value: ${this._value}) ready!`))
  }

  ready (func_) {
    this._promiseReady.then(() => func_())
  }

  connected (func_) {
    this._promiseConnected.then(() => func_())
  }

  connect () {
    this._promiseConnected = new Promise(resolve => {
      this._neighborsIds.forEach(peerId => {
        this._connections.get(peerId).outbound = this._peer.connect(peerId, { serialization: 'none' })
      })

      ;[...this._connections.values()]
        .map(val => val.outbound)
        .reduce((chain, conn) => {
          return chain.then(() => {
            return new Promise((resolve, reject) => conn.on('open', resolve))
          })
        }, Promise.resolve()).then(resolve)
    })
  }

  propagate (initiator) {
    let initiatorObj = null
    let filtered = []

    ;[...this._connections.values()]
      .forEach(connObj =>
        (connObj.outbound.peer !== initiator)
        ? filtered.push(connObj)
        : (initiatorObj = connObj)
      )

    filtered.forEach(connObj => {
      connObj.respHandler = (data) => {
        connObj.resp = data
      }
    })
    filtered.forEach(connObj => connObj.outbound.send(this.CMD))

    if (initiatorObj === null) {
      initiatorObj = {
        outbound: {
          send: totalMin => {
            console.log('=========================================')
            console.log(`The total minimum is equal to ${totalMin}`)
            document.getElementById('result').innerHTML = `<b>The total minimum is equal to ${totalMin}</b>`
          }
        }
      }
    }

    filtered
      .reduce((chain, connObj) => {
        return chain.then(curMin => {
          return new Promise(resolve => {
            if (connObj.resp !== null) {
              return resolve(Math.min(curMin, Number(connObj.resp)))
            }

            connObj.respHandler = respMin => {
              resolve(Math.min(curMin, Number(respMin)))
            }
          })
        })
      }, Promise.resolve(this._value)).then(nodeMin => {
        initiatorObj.outbound.send(String(nodeMin))
      })
  }
}

if (!Node) { throw Error(Node) }
