import { copyFile, rm } from 'node:fs/promises'

await copyFile(new URL('../dist/app.html', import.meta.url), new URL('../dist/index.html', import.meta.url))
await rm(new URL('../dist/app.html', import.meta.url))
