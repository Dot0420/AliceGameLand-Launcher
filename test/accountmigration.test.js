const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { backupAndKeepMicrosoftAccounts } = require('../app/assets/js/accountmigration')

function migrateFixture(t, config){
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'alice-account-migration-'))
    t.after(() => {
        assert.ok(directory.startsWith(path.join(os.tmpdir(), 'alice-account-migration-')))
        fs.rmSync(directory, { recursive: true, force: true })
    })
    const configPath = path.join(directory, 'config.json')
    const original = JSON.stringify(config)
    fs.writeFileSync(configPath, original)
    return { directory, configPath, original, result: backupAndKeepMicrosoftAccounts(config, configPath) }
}

test('Microsoft-only settings keep the selected account without a backup', t => {
    const config = {
        selectedAccount: 'ms',
        authenticationDatabase: { ms: { type: 'microsoft', uuid: 'ms' } },
        selectedServer: 'AliceDiamond-26.2'
    }
    const { directory, result } = migrateFixture(t, config)
    assert.equal(result.removedCount, 0)
    assert.equal(result.config.selectedAccount, 'ms')
    assert.equal(result.config.selectedServer, config.selectedServer)
    assert.deepEqual(fs.readdirSync(directory), ['config.json'])
})

test('Mojang-only settings are backed up and require Microsoft sign-in', t => {
    const config = {
        selectedAccount: 'old',
        authenticationDatabase: { old: { type: 'mojang', uuid: 'old', accessToken: 'legacy-token' } },
        selectedServer: 'AliceDiamond-26.2',
        modConfigurations: [{ id: 'kept' }]
    }
    const { configPath, original, result } = migrateFixture(t, config)
    assert.equal(result.removedCount, 1)
    assert.equal(result.config.selectedAccount, null)
    assert.deepEqual(result.config.authenticationDatabase, {})
    assert.deepEqual(result.config.modConfigurations, config.modConfigurations)
    assert.equal(fs.readFileSync(result.backupPath, 'utf8'), original)
    assert.equal(fs.readFileSync(configPath, 'utf8'), original)
})

test('Mixed settings preserve Microsoft and select it after removing Mojang', t => {
    const microsoftAccount = {
        type: 'microsoft',
        uuid: 'ms',
        accessToken: 'minecraft-token',
        microsoft: { refresh_token: 'refresh-token' }
    }
    const config = {
        selectedAccount: 'old',
        authenticationDatabase: {
            old: { type: 'mojang', uuid: 'old' },
            ms: microsoftAccount
        },
        selectedServer: 'AliceDiamond-26.2',
        modConfigurations: [{ id: 'kept' }],
        settings: { game: { resWidth: 1280 } }
    }
    const { directory, configPath, original, result } = migrateFixture(t, config)
    assert.equal(result.removedCount, 1)
    assert.equal(result.config.selectedAccount, 'ms')
    assert.deepEqual(result.config.authenticationDatabase, { ms: microsoftAccount })
    assert.equal(result.config.selectedServer, config.selectedServer)
    assert.deepEqual(result.config.modConfigurations, config.modConfigurations)
    assert.deepEqual(result.config.settings, config.settings)
    assert.equal(fs.readFileSync(result.backupPath, 'utf8'), original)
    fs.writeFileSync(configPath, JSON.stringify(result.config))
    assert.equal(backupAndKeepMicrosoftAccounts(result.config, configPath).removedCount, 0)
    assert.equal(fs.readdirSync(directory).length, 2)
})
