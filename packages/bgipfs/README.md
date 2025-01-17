bgipfs
=================

BuidlGuidl IPFS CLI


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/bgipfs.svg)](https://npmjs.org/package/bgipfs)
[![Downloads/week](https://img.shields.io/npm/dw/bgipfs.svg)](https://npmjs.org/package/bgipfs)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g bgipfs
$ bgipfs COMMAND
running command...
$ bgipfs (--version)
bgipfs/0.0.0 darwin-arm64 node-v20.6.1
$ bgipfs --help [COMMAND]
USAGE
  $ bgipfs COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`bgipfs hello PERSON`](#bgipfs-hello-person)
* [`bgipfs hello world`](#bgipfs-hello-world)
* [`bgipfs help [COMMAND]`](#bgipfs-help-command)
* [`bgipfs plugins`](#bgipfs-plugins)
* [`bgipfs plugins add PLUGIN`](#bgipfs-plugins-add-plugin)
* [`bgipfs plugins:inspect PLUGIN...`](#bgipfs-pluginsinspect-plugin)
* [`bgipfs plugins install PLUGIN`](#bgipfs-plugins-install-plugin)
* [`bgipfs plugins link PATH`](#bgipfs-plugins-link-path)
* [`bgipfs plugins remove [PLUGIN]`](#bgipfs-plugins-remove-plugin)
* [`bgipfs plugins reset`](#bgipfs-plugins-reset)
* [`bgipfs plugins uninstall [PLUGIN]`](#bgipfs-plugins-uninstall-plugin)
* [`bgipfs plugins unlink [PLUGIN]`](#bgipfs-plugins-unlink-plugin)
* [`bgipfs plugins update`](#bgipfs-plugins-update)

## `bgipfs hello PERSON`

Say hello

```
USAGE
  $ bgipfs hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ bgipfs hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/azf20/buidlguidl-ipfs/blob/v0.0.0/src/commands/hello/index.ts)_

## `bgipfs hello world`

Say hello world

```
USAGE
  $ bgipfs hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ bgipfs hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/azf20/buidlguidl-ipfs/blob/v0.0.0/src/commands/hello/world.ts)_

## `bgipfs help [COMMAND]`

Display help for bgipfs.

```
USAGE
  $ bgipfs help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for bgipfs.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.21/src/commands/help.ts)_

## `bgipfs plugins`

List installed plugins.

```
USAGE
  $ bgipfs plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ bgipfs plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/index.ts)_

## `bgipfs plugins add PLUGIN`

Installs a plugin into bgipfs.

```
USAGE
  $ bgipfs plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into bgipfs.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the BGIPFS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the BGIPFS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ bgipfs plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ bgipfs plugins add myplugin

  Install a plugin from a github url.

    $ bgipfs plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ bgipfs plugins add someuser/someplugin
```

## `bgipfs plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ bgipfs plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ bgipfs plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/inspect.ts)_

## `bgipfs plugins install PLUGIN`

Installs a plugin into bgipfs.

```
USAGE
  $ bgipfs plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into bgipfs.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the BGIPFS_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the BGIPFS_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ bgipfs plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ bgipfs plugins install myplugin

  Install a plugin from a github url.

    $ bgipfs plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ bgipfs plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/install.ts)_

## `bgipfs plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ bgipfs plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ bgipfs plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/link.ts)_

## `bgipfs plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ bgipfs plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ bgipfs plugins unlink
  $ bgipfs plugins remove

EXAMPLES
  $ bgipfs plugins remove myplugin
```

## `bgipfs plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ bgipfs plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/reset.ts)_

## `bgipfs plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ bgipfs plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ bgipfs plugins unlink
  $ bgipfs plugins remove

EXAMPLES
  $ bgipfs plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/uninstall.ts)_

## `bgipfs plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ bgipfs plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ bgipfs plugins unlink
  $ bgipfs plugins remove

EXAMPLES
  $ bgipfs plugins unlink myplugin
```

## `bgipfs plugins update`

Update installed plugins.

```
USAGE
  $ bgipfs plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.25/src/commands/plugins/update.ts)_
<!-- commandsstop -->
