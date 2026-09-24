const fs = require('fs')
const path = require('path')

/** Keep only accounts supported by the current launcher without changing the input. */
exports.keepMicrosoftAccounts = function(config){
    const accounts = config.authenticationDatabase || {}
    const microsoftAccounts = Object.fromEntries(
        Object.entries(accounts).filter(([, account]) => account?.type === 'microsoft')
    )
    const removedCount = Object.keys(accounts).length - Object.keys(microsoftAccounts).length
    const selectedAccount = microsoftAccounts[config.selectedAccount]
        ? config.selectedAccount
        : Object.keys(microsoftAccounts)[0] || null
    const supportedConfig = { ...config }
    delete supportedConfig.clientToken

    return {
        config: {
            ...supportedConfig,
            authenticationDatabase: microsoftAccounts,
            selectedAccount
        },
        removedCount
    }
}

/** Back up the original settings once before a legacy account is removed. */
exports.backupAndKeepMicrosoftAccounts = function(config, configPath){
    const migrated = exports.keepMicrosoftAccounts(config)
    if(migrated.removedCount === 0) return migrated

    const backupPath = path.join(
        path.dirname(configPath),
        `config.pre-microsoft-only-${Date.now()}-${process.pid}.json`
    )
    fs.copyFileSync(configPath, backupPath, fs.constants.COPYFILE_EXCL)
    return { ...migrated, backupPath }
}
