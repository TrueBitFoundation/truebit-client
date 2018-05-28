let tasks = {}
let games = {}

const depositsHelper = require('./depositsHelper')
const util = require('ethereumjs-util')
const waitForBlock = require('./util/waitForBlock')
const toTaskData = require('./util/toTaskData')
const merkleTree = require('./util/merkleTree')
const sha3 = require('ethereumjs-util').sha3

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
				message: `solver initialized.`
			  });

			let [incentiveLayer, disputeResolutionLayer, computationLayer] = await setup(web3.currentProvider)

			const taskCreatedEvent = incentiveLayer.TaskCreated()

			taskCreatedEvent.watch(async (err, result) => {
					if (result) {
						let taskID = result.args.taskID.toNumber()
						let taskMinDeposit = result.args.minDeposit.toNumber()

						let taskData = toTaskData(await incentiveLayer.getTaskData.call(taskID))

						try {

							let blockNumber = await web3.eth.getBlockNumber()

							if (!(blockNumber > taskData.intervals[0] + taskData.taskCreationBlockNumber)) {

								await depositsHelper(web3, incentiveLayer, account, taskMinDeposit)

								let tx = await incentiveLayer.registerForTask(taskID, {from: account, gas: 100000})

								tasks[taskID] = taskData
	
								let program = web3.utils.hexToBytes(taskData.taskData).map((n) => {
									return util.bufferToHex(util.setLengthLeft(n, 32))
								})
	
								let output = await computationLayer.runSteps.call(program, taskData.numSteps)
	
								let solution = output[0][1]
	
								tx = await incentiveLayer.commitSolution(taskID, solution, {from: account})
	
								waitForBlock(web3, taskData.intervals[2] + taskData.taskCreationBlockNumber, async () => {
									if (!tasks[taskID]["challenged"]) {
										await incentiveLayer.finalizeTask(taskID, {from: account})
									}
								})
							}

						} catch (e) {
							console.error(e)
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

						let taskData = toTaskData(await incentiveLayer.getTaskData.call(games[gameId].taskID))

						let program = web3.utils.hexToBytes(taskData.taskData).map((n) => {
							return util.bufferToHex(util.setLengthLeft(n, 32))
						})

						let hashes = program.map(e => sha3(e))

						mtree = new merkleTree.MerkleTree(hashes, true)
						root = mtree.getRoot()
						games[gameId]["merkle-tree"] = mtree
						games[gameId]["merkle-root"] = root
						games[gameId]["hashes"] = hashes
					}
				}
      })
      
      const newQueryEvent = disputeResolutionLayer.NewQuery()

      newQueryEvent.watch(async (err, result) => {
        if (result) {
          let gameId = result.args.gameId
          let stepNumber = result.args.stepNumber

					if (games[gameId]) {
						const gameData =  toGameData(await disputeResultionLayer.gameData.call(gameId))

            let taskData = toTaskData(await incentiveLayer.getTaskData.call(games[gameId].taskID))
            
            if (gameData.low + 1 != gameData.high) {
              let program = web3.utils.hexToBytes(taskData.taskData).map((n) => {
                return util.bufferToHex(util.setLengthLeft(n, 32))
              })
    
              let output = await computationLayer.runSteps.call(program, gameData.med)
    
              const result = await api.getResult(session.input, medStep)
              let solutionHash = output[1]
    
              if (solutionHash == game.medHash) {
                // we agree with their state; look in the right half
                await disputeResolutionLayer.query(gameId, calculateMidpoint(gameData.med, gameData.high), {from: account})
              } else {
                // we disagree with their state; look in the left half.
                await disputeResolutionLayer.query(gameId, calculateMidpoint(gameData.low, gameData.med), {from: account})
              }
  
							//start timeout watcher
							waitForBlock(web3, taskData.intervals[2] + taskData.taskCreationBlockNumber, async () => {
								if (!tasks[taskID]["challenged"]) {
									await incentiveLayer.finalizeTask(taskID, {from: account})
								}
							})
							
            } else {
							const gameData =  toGameData(await disputeResultionLayer.gameData.call(gameId))

							const game = games[gameId]

							let lowStepState = await computationLayer.runSteps.call(game["program"], gameData.low)[0]

							let highStepIndex = game.high - 1

							let highStepState = await computationLayer.runStep.call(lowStepState, game.high, game["program"][highStepIndex])
					
							let proof = game["merkle-tree"].getProofOrdered(game["hashes"][highStepIndex], game.high)
							const newProof = '0x' + proof.map(e => e.toString('hex')).join('')

							await basicVerificationGame.performStepVerification(gameId, lowStepState, highStepState, newProof, {from: account})
            }
					}
        }
      })

			return () => {
				try {
          taskCreatedEvent.stopWatching()
          verificationCommittedEvent.stopWatching()
          newQueryEvent.stopWatching()
				} catch (e) {
					//console.log("Events stopped watching ungracefully")
				}
			}
		}
	}