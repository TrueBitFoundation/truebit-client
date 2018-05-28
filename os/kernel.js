const fs = require('fs')

const Web3 = require('web3')

const logger = require('./logger')

function requireHelper(cb) {
	try {
		return cb()
	} catch (e) {
		return undefined
	}
}

module.exports = async (configPath) => {
	const config = JSON.parse(fs.readFileSync(configPath))

	const httpProvider = new Web3.providers.HttpProvider(config["http-url"])
	const web3 = new Web3(httpProvider)
	const accounts = await web3.eth.getAccounts()

	return {
		taskGiver: requireHelper(() => { return require(config["task-giver"]) }),
		solver: requireHelper(() => { return require(config["solver"]) }),
		verifier: requireHelper(() => { return require(config["verifier"]) }),
		web3: web3,
		accounts: accounts,
		logger: logger
	}

}