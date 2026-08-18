const childProcess = require('child_process')
const fs = require('fs-extra')
const { LoggerUtil } = require('helios-core')
const { Type } = require('helios-distribution-types')
const path = require('path')

const ConfigManager = require('./configmanager')

const logger = LoggerUtil.getLogger('NeoForgeInstaller')

function getNeoForgeModule(server) {
    return server.modules.find(module => module.rawModule.type === Type.NeoForge) || null
}

function getPatchedClientPath(version) {
    return path.join(
        ConfigManager.getCommonDirectory(),
        'libraries',
        'net',
        'neoforged',
        'minecraft-client-patched',
        version,
        `minecraft-client-patched-${version}.jar`
    )
}

exports.ensureInstalled = async function(server) {
    const module = getNeoForgeModule(server)
    if(module == null) {
        return false
    }

    const version = module.getMavenComponents().version
    const patchedClient = getPatchedClientPath(version)
    if(await fs.pathExists(patchedClient) && (await fs.stat(patchedClient)).size > 0) {
        logger.info(`NeoForge ${version} client patch is already installed.`)
        return false
    }

    const java = ConfigManager.getJavaExecutable(server.rawServer.id)
    const commonDirectory = ConfigManager.getCommonDirectory()
    await fs.ensureDir(commonDirectory)
    const launcherProfiles = path.join(commonDirectory, 'launcher_profiles.json')
    if(!await fs.pathExists(launcherProfiles)) {
        await fs.writeJson(launcherProfiles, {
            profiles: {},
            settings: {},
            version: 3
        })
    }

    logger.info(`Installing the NeoForge ${version} client patch.`)
    await new Promise((resolve, reject) => {
        const installer = childProcess.spawn(java, [
            '-jar',
            module.getPath(),
            '--install-client',
            commonDirectory
        ], {
            cwd: commonDirectory,
            windowsHide: true
        })

        installer.stdout.setEncoding('utf8')
        installer.stderr.setEncoding('utf8')
        installer.stdout.on('data', data => logger.info(data.trim()))
        installer.stderr.on('data', data => logger.warn(data.trim()))
        installer.on('error', reject)
        installer.on('close', code => {
            if(code === 0 && fs.existsSync(patchedClient)) {
                resolve()
            } else {
                reject(new Error(`NeoForge installer exited with code ${code}.`))
            }
        })
    })

    logger.info(`NeoForge ${version} client patch installed successfully.`)
    return true
}

exports.getPatchedClientPath = getPatchedClientPath
