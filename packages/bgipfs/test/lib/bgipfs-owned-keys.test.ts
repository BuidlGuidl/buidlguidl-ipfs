import {expect} from 'chai'

import {getBgipfsIpfsConfigPolicy} from '../../src/lib/bgipfs-owned-keys.js'

describe('bgipfs-owned-keys', () => {
  it('uses legacy Reprovider keys for repo versions before 18', () => {
    const policy = getBgipfsIpfsConfigPolicy(
      {
        Reprovider: {
          Strategy: 'all',
        },
      },
      17,
    )

    expect(policy).to.deep.equal({
      ownedKeys: {
        'Reprovider.Strategy': 'roots',
        'Routing.AcceleratedDHTClient': true,
        'Routing.Type': 'dht',
      },
      removedKeys: [],
    })
  })

  it('uses current Provide keys and removes Reprovider for repo version 18+', () => {
    const policy = getBgipfsIpfsConfigPolicy(
      {
        Reprovider: {
          Strategy: 'roots',
        },
      },
      18,
    )

    expect(policy).to.deep.equal({
      ownedKeys: {
        'Provide.Strategy': 'roots',
        'Routing.AcceleratedDHTClient': true,
        'Routing.Type': 'dht',
      },
      removedKeys: ['Reprovider'],
    })
  })

  it('falls back to config shape when repo version is unavailable', () => {
    expect(
      getBgipfsIpfsConfigPolicy({
        Reprovider: {
          Strategy: 'all',
        },
      }),
    ).to.deep.equal({
      ownedKeys: {
        'Reprovider.Strategy': 'roots',
        'Routing.AcceleratedDHTClient': true,
        'Routing.Type': 'dht',
      },
      removedKeys: [],
    })

    expect(
      getBgipfsIpfsConfigPolicy({
        Provide: {
          Strategy: 'all',
        },
      }),
    ).to.deep.equal({
      ownedKeys: {
        'Provide.Strategy': 'roots',
        'Routing.AcceleratedDHTClient': true,
        'Routing.Type': 'dht',
      },
      removedKeys: ['Reprovider'],
    })
  })
})
