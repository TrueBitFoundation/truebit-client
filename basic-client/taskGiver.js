let tasks = {}

const depositsHelper = require('./depositsHelper')
const waitForBlock = require('./util/waitForBlock')
const fs = require('fs')
const toTaskData = require('./util/toTaskData')
const contract = require('./contractHelper')

function toSolution(data) {
	return {
		solution: data[0],
		finalized: data[1]
	}
}

const ilConfig = JSON.parse(fs.readFileSync(__dirname + "/incentive-layer/export/development.json"))

function setup(httpProvider) {
	return (async () => {
		incentiveLayer = await contract(httpProvider, ilConfig['TaskExchange'])
		return incentiveLayer
	})()
}

module.exports = {
		init: async (web3, account, logger) => {

			logger.log({
				level: 'info',
				message: `giver initialized.`
			  });

			let incentiveLayer = await setup(web3.currentProvider)

			const taskCreatedEvent = incentiveLayer.TaskCreated()
	
			taskCreatedEvent.watch(async (err, result) => {
				if (result) {
					if (account.toLowerCase() == result.args.creator) {
						let taskID = result.args.taskID.toNumber()
						let taskData = toTaskData(await incentiveLayer.getTaskData.call(taskID))
						taskData["state"] = "register"
						tasks[taskID] = taskData

						waitForBlock(web3, taskData.intervals[0] + taskData.taskCreationBlockNumber, async () => {
							if(tasks[taskID]["state"] == "register") {
								try {
									await incentiveLayer.timeout(taskID, {from: account})
								} catch(e) {
									//handle error
									console.error(e)
								}
							}
						})
						
					}
				}
			})

			const solverSelectedEvent = incentiveLayer.SolverSelected()

			solverSelectedEvent.watch(async (err, result) => {
				if (result) {
					const taskID = result.args.taskID.toNumber()

					if (tasks[taskID]) {
						let taskData = toTaskData(await incentiveLayer.getTaskData.call(taskID))
						tasks[taskID]["state"] = "selected"

						waitForBlock(web3, taskData.intervals[1] + taskData.taskCreationBlockNumber, async () => {
							if(tasks[taskID]["state"] == "selected") {
								try {
									await incentiveLayer.timeout(taskID, {from: account})
								} catch(e) {
									//handle error
									console.error(e)
								}
							}
						})

					}

				}
			})

			const solutionCommittedEvent = incentiveLayer.SolutionCommitted()

			solutionCommittedEvent.watch(async (err, result) => {
				if (result) {
					const taskID = result.args.taskID.toNumber()
					if (tasks[taskID]) {

						let taskData = toTaskData(await incentiveLayer.getTaskData.call(taskID))

						tasks[taskID]["state"] = "solved"

						//fire off timeout to wait for finalization
						//should make this recursive in case of verification game
						waitForBlock(web3, taskData.intervals[2] + taskData.taskCreationBlockNumber, async () => {
							
							if(tasks[taskID]["state"] == "solved") {
								try {

									const solution = toSolution(await incentiveLayer.getSolution.call(taskID))
									solution["data"] = web3.utils.hexToBytes(taskData.taskData)

									if (solution.finalized) {
										fs.writeFile("solutions/" + taskID + ".json", JSON.stringify(solution), (err) => { if (err) console.log(err)})
										await incentiveLayer.unbondDeposit(taskID, {from: account})
									}

								} catch(e) {
									//handle error
									console.error(e)
								}
							}
						})

					}
				}
			})

			return () => {
				try {
					taskCreatedEvent.stopWatching()
					solverSelectedEvent.stopWatching()
					solutionCommittedEvent.stopWatching()
				} catch (e) {
					//console.log("Events stopped watching ungracefully")
				}
			}
		},
	
		getTasks: () => {
			return tasks
		}
	}
