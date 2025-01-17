#!/usr/bin/env -S node --trace-deprecation --no-warnings=DEP0180 --loader ts-node/esm --disable-warning=ExperimentalWarning

// eslint-disable-next-line n/shebang
import {execute} from '@oclif/core'

await execute({development: true, dir: import.meta.url})
