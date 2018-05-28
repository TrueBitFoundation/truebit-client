let tasks = {}
let games = {}

function calculateMidpoint(low, high) {
	return Math.floor(low + ((high - low) / 2))
}

function toGameData(data) {
	return {
		low: data[0].toNumber(),
		med: data[1].toNumber(),
		high: data[2].toNumber(),
		medHash: data[3]
	}
}

const fs = require('fs')

const contract = require('./contractHelper')

function setup(httpProvider) {
	return (async () => {
		ilConfig = JSON.parse(fs.readFileSync(__dirname + "/incentive-layer/export/development.json"))
		incentiveLayer = await contract(httpProvider, ilConfig['TaskExchange'])
		drlConfig = JSON.parse(fs.readFileSync(__dirname + "/dispute-resolution-layer/export/development.json"))
		disputeResolutionLayer = await contract(httpProvider, drlConfig['BasicVerificationGame'])
		computationLayer = await contract(httpProvider, drlConfig['SimpleAdderVM'])
		return [incentiveLayer, disputeResolutionLayer, computationLayer]
	})()
}

module.exports = {
		init: async (web3, account, logger) => {

			logger.log({
				level: 'info',
				message: `verifier initialized.`
			  });

			let [incentiveLayer, disputeResolutionLayer, computationLayer] = await setup(web3.currentProvider)
			
			const solutionCommittedEvent = incentiveLayer.SolutionCommitted()

			solutionCommittedEvent.watch(async (err, result) => {
				if (result) {
					let taskID = result.args.taskID.toNumber()
					let taskMinDeposit = result.args.minDeposit.toNumber()
					let solution = result.args.solution
	
					let taskData = toTaskData(await incentiveLayer.getTaskData.call(taskID))
	
					let blockNumber = await web3.eth.getBlockNumber()
	
					if (!(blockNumber > taskData.intervals[0] + taskData.taskCreationBlockNumber)) {
						tasks[taskID] = taskData
		
						let program = web3.utils.hexToBytes(taskData.taskData).map((n) => {
							return util.bufferToHex(util.setLengthLeft(n, 32))
						})
	
						let output = await computationLayer.runSteps.call(program, taskData.numSteps)
	
						let mySolution = output[0][1]
	
						if(mySolution != solution) {
							await depositsHelper(web3, incentiveLayer, account, taskMinDeposit)
	
							await incentiveLayer.commitChallenge(taskID, {from: account})
						}
					}
				}
			})

			const verificationCommittedEvent = incentiveLayer.VerificationCommitted()

			verificationCommittedEvent.watch(async (err, result) => {
				if (result) {
					let taskID = result.args.taskID.toNumber()
					let gameId = result.args.gameId
					if(tasks[taskID]) {
						games[gameId] = {taskID: taskID}
						tasks[taskID]["gameId"] = gameId
					}
				}
			})

			const newGameEvent = disputeResolutionLayer.NewGame()

			newGameEvent.watch(async (err, result) => {
				if (result) {
					let gameId = result.args.gameId
					let solver = result.args.solver
					let verifier = result.args.verifier

					if(account.toLowerCase() == verifier) {
						games[gameId] = {ongoing: true}

						const gameData =  toGameData(await disputeResolutionLayer.gameData.call(gameId))

						const toQueryStep = calculateMidpoint(gameData.low, gameData.high)
						await disputeResolutionLayer.query(gameId, toQueryStep, {from: account})
						
					}
				}
			})

			const newResponseEvent = disputeResolutionLayer.NewResponse()

			newResponseEvent.watch(async (err, result) => {
				if (result) {
					let gameId = result.args.gameId
					let hash = result.args.hash

					if (games[gameId]) {
						const gameData =  toGameData(await disputeResolutionLayer.gameData.call(gameId))

						let taskData = toTaskData(await incentiveLayer.getTaskData.call(games[gameId].taskID))
	
						let program = web3.utils.hexToBytes(taskData.taskData).map((n) => {
							return util.bufferToHex(util.setLengthLeft(n, 32))
						})
	
						let output = await computationLayer.runSteps.call(program, gameData.med)
	
						let solutionHash = output[1]
	
						if (solutionHash == gameData.medHash) {
							// we agree with their state; look in the right half
							await disputeResolutionLayer.query(gameId, calculateMidpoint(gameData.med, gameData.high), {from: account})
						} else {
							// we disagree with their state; look in the left half.
							await disputeResolutionLayer.query(gameId, calculateMidpoint(gameData.low, gameData.med), {from: account})
						}

						//start timeout watcher
						
					}
				}
			})

			return () => {
				try {
					solutionCommittedEvent.stopWatching()
					newGameEvent.stopWatching()
					verificationCommittedEvent.stopWatching()
					newResponseEvent.stopWatching()
				} catch(e) {

				}
			}
		}
	}