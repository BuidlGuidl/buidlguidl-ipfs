import {execa} from 'execa'

// Note: Original bash CLI required Bash 4.0+ for associative arrays
// This is no longer relevant for the TypeScript implementation

export type PackageManager = 'apt-get' | 'brew' | 'yum' | undefined

export async function detectPackageManager(): Promise<PackageManager> {
  const packageManagers = ['apt-get', 'brew', 'yum'] as const
  const results = await Promise.all(
    packageManagers.map(async (pm) => {
      try {
        await execa('which', [pm])
        return pm
      } catch {}
    }),
  )
  return results.find((pm) => pm !== undefined)
}

export async function commandExists(command: string): Promise<boolean> {
  try {
    await execa('which', [command])
    return true
  } catch {
    return false
  }
}

export async function installDockerUbuntu(): Promise<void> {
  const commands = [
    // Add Docker's official GPG key
    ['apt-get', ['update']],
    ['apt-get', ['install', '-y', 'ca-certificates', 'curl']],
    ['install', ['-m', '0755', '-d', '/etc/apt/keyrings']],
    ['curl', ['-fsSL', 'https://download.docker.com/linux/ubuntu/gpg', '-o', '/etc/apt/keyrings/docker.asc']],
    ['chmod', ['a+r', '/etc/apt/keyrings/docker.asc']],
    // Add the repository to Apt sources
    [
      'sh',
      [
        '-c',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null',
      ],
    ],
    // Add repository and install Docker
    ['apt-get', ['update']],
    [
      'apt-get',
      ['install', '-y', 'docker-ce', 'docker-ce-cli', 'containerd.io', 'docker-buildx-plugin', 'docker-compose-plugin'],
    ],
    // Create docker group and add user
    ['sh', ['-c', 'usermod -aG docker $USER']],
  ] as const

  for (const [cmd, args] of commands) {
    // eslint-disable-next-line no-await-in-loop
    await execa('sudo', [cmd, ...args])
  }
}

export async function isUbuntu(): Promise<boolean> {
  try {
    const {stdout} = await execa('cat', ['/etc/os-release'])
    return stdout.toLowerCase().includes('ubuntu')
  } catch {
    return false
  }
}

export async function installIpfsClusterCtl(): Promise<void> {
  // Download latest version from GitHub
  const {stdout: release} = await execa('curl', [
    '-s',
    'https://api.github.com/repos/ipfs-cluster/ipfs-cluster/releases/latest',
  ])
  const version = JSON.parse(release).tag_name
  const arch = process.arch === 'x64' ? 'amd64' : process.arch
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'

  const downloadUrl = `https://dist.ipfs.tech/ipfs-cluster-ctl/${version}/ipfs-cluster-ctl_${version}_${platform}-${arch}.tar.gz`

  const commands = [
    ['curl', ['-L', downloadUrl, '-o', '/tmp/ipfs-cluster-ctl.tar.gz']],
    ['tar', ['-xzf', '/tmp/ipfs-cluster-ctl.tar.gz', '-C', '/tmp']],
    ['install', ['/tmp/ipfs-cluster-ctl/ipfs-cluster-ctl', '/usr/local/bin/ipfs-cluster-ctl']],
    ['rm', ['-rf', '/tmp/ipfs-cluster-ctl', '/tmp/ipfs-cluster-ctl.tar.gz']],
  ] as const

  for (const [cmd, args] of commands) {
    // eslint-disable-next-line no-await-in-loop
    await execa('sudo', [cmd, ...args])
  }
}

export async function checkDocker(): Promise<void> {
  try {
    await execa('docker', ['ps'])
  } catch (error: unknown) {
    if ((error as Error).message?.includes('permission denied') || (error as string).includes('permission denied')) {
      throw new Error(
        'Docker permission denied. Please run "newgrp docker" or close and reopen your terminal to apply group changes.',
      )
    }

    throw error
  }
}

export async function checkRunningContainers(): Promise<string[]> {
  try {
    await checkDocker()
    const {stdout} = await execa('docker', ['ps', '--format', '{{.Names}}'])
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}
