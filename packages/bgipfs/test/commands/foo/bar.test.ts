import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('foo:bar', () => {
  it('runs foo:bar cmd', async () => {
    const {stdout} = await runCommand('foo:bar')
    expect(stdout).to.contain('hello world')
  })

  it('runs foo:bar --name oclif', async () => {
    const {stdout} = await runCommand('foo:bar --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
