import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, cp, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const JAVA_VERSION = '25.0.4.1+1'
const JAVA_ARCHIVE = 'OpenJDK25U-jdk_x64_windows_hotspot_25.0.4.1_1.zip'
const JAVA_SHA256 = '00c847d804f4a78e9f04f2683faf14fed898535b177b7fc704486cb0284e9283'
const JAVA_URL = `https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.4.1%2B1/${JAVA_ARCHIVE}`

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const cacheDir = path.join(projectDir, '.runtime-cache')
const archivePath = path.join(cacheDir, JAVA_ARCHIVE)
const extractionDir = path.join(cacheDir, 'extracted')
const runtimeDir = path.join(projectDir, 'runtime', 'windows-x64')

async function exists(target) {
    try {
        await access(target)
        return true
    } catch {
        return false
    }
}

async function sha256(target) {
    const hash = createHash('sha256')
    const file = createReadStream(target)
    for await (const chunk of file) {
        hash.update(chunk)
    }
    return hash.digest('hex')
}

async function downloadArchive() {
    await mkdir(cacheDir, { recursive: true })
    const temporaryPath = `${archivePath}.download`
    await rm(temporaryPath, { force: true })

    console.log(`Downloading Temurin JDK ${JAVA_VERSION}...`)
    const response = await fetch(JAVA_URL, { redirect: 'follow' })
    if (!response.ok || response.body == null) {
        throw new Error(`Temurin download failed: HTTP ${response.status}`)
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath))

    const actual = await sha256(temporaryPath)
    if (actual !== JAVA_SHA256) {
        await rm(temporaryPath, { force: true })
        throw new Error(`Temurin checksum mismatch: expected ${JAVA_SHA256}, received ${actual}`)
    }
    await rm(archivePath, { force: true })
    await rename(temporaryPath, archivePath)
}

async function ensureArchive() {
    if (await exists(archivePath)) {
        const actual = await sha256(archivePath)
        if (actual === JAVA_SHA256) {
            console.log('Using the verified cached Temurin archive.')
            return
        }
        console.warn('Cached Temurin archive checksum mismatch; downloading it again.')
        await rm(archivePath, { force: true })
    }
    await downloadArchive()
}

async function locateExtractedJdk() {
    const entries = await readdir(extractionDir, { withFileTypes: true })
    const candidates = []
    for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(extractionDir, entry.name)
        if (await exists(path.join(candidate, 'bin', 'javaw.exe'))) {
            candidates.push(candidate)
        }
    }
    if (candidates.length !== 1) {
        throw new Error(`Expected one extracted JDK directory, found ${candidates.length}.`)
    }
    return candidates[0]
}

async function prepareRuntime() {
    await ensureArchive()
    await rm(extractionDir, { recursive: true, force: true })
    await mkdir(extractionDir, { recursive: true })
    new AdmZip(archivePath).extractAllTo(extractionDir, true)

    const extractedJdk = await locateExtractedJdk()
    const java = path.join(extractedJdk, 'bin', 'java.exe')
    const result = spawnSync(java, ['-version'], { encoding: 'utf8' })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (result.status !== 0 || !/version "25[."]/.test(output)) {
        throw new Error(`Bundled Java validation failed:\n${output}`)
    }

    await rm(runtimeDir, { recursive: true, force: true })
    await cp(extractedJdk, runtimeDir, { recursive: true })
    await rm(extractionDir, { recursive: true, force: true })
    console.log(`Temurin JDK ${JAVA_VERSION} runtime prepared at ${runtimeDir}`)
}

await prepareRuntime()
