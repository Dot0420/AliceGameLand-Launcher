const fs = require('fs')
const path = require('path')
const remote = require('@electron/remote')

const PLATFORM_DIRECTORY = 'windows-x64'

function getRuntimeRoot() {
    const base = remote.app.isPackaged ? process.resourcesPath : remote.app.getAppPath()
    return path.join(base, 'runtime', PLATFORM_DIRECTORY)
}

function getExecutable() {
    if(process.platform !== 'win32' || process.arch !== 'x64') {
        return null
    }
    const executable = path.join(getRuntimeRoot(), 'bin', 'javaw.exe')
    return fs.existsSync(executable) ? executable : null
}

module.exports = {
    getExecutable,
    getRuntimeRoot
}
