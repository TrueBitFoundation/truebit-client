const assert = require('assert')

const timeout = require('../os/lib/util/timeout')

const BigNumber = require('bignumber.js')

const mineBlocks = require('../os/lib/util/mineBlocks')

const fs = require('fs')

const logger = require('../os/logger')

const merkleComputer = require('../wasm-client/merkle-computer')()

const host = "localhost"
const ipfs = require('ipfs-api')(host, '5001', {protocol: 'http'})

const fileSystem = merkleComputer.fileSystem(ipfs)

let os, taskSubmitter

before(async () => {
    os = await require('../os/kernel')("./wasm-client/config.json")
})

describe('Truebit OS WASM Alphabet', async function() {
    this.timeout(60000)

    it('should have a logger', () => {
	assert(os.logger)
    })

    it('should have a web3', () => {
	assert(os.web3)
    })

    it('should have a task giver', () => {
	assert(os.taskGiver)
    })

    it('should have a solver', () => {
    	assert(os.solver)
    })

    // it('should have a verifier', () => {
    // 	assert(os.verifier)
    // })
    
    describe('Normal task lifecycle', async () => {
	let killTaskGiver
	let killSolver
	let killVerifier

	let taskID
	
	let originalBalance

	let storageAddress, initStateHash, bundleID
	

	before(async () => {
	    taskSubmitter = await require('../wasm-client/taskSubmitter')(os.web3, os.logger, fileSystem)
	    
	    killTaskGiver = await os.taskGiver.init(os.web3, os.accounts[0], os.logger)
	    killSolver = await os.solver.init(os.web3, os.accounts[1], os.logger, fileSystem)
	    originalBalance = new BigNumber(await os.web3.eth.getBalance(os.accounts[1]))

	})

	after(() => {
	    killTaskGiver()
	    killSolver()
	})

	it('should submit task', async () => {

	    let exampleTask = JSON.parse(fs.readFileSync("testWasmAlphabet.json"))
	    //simulate cli by adding from account and translate reward

	    exampleTask["from"] = os.accounts[0]
	    exampleTask["reward"] = os.web3.utils.toWei(exampleTask.reward, 'ether')

	    await taskSubmitter.submitTask(exampleTask)

	    await timeout(5000)
	    await mineBlocks(os.web3, 110)
	    await timeout(5000)
	    await mineBlocks(os.web3, 110)
	    await timeout(5000)
	    
	    let tasks = os.taskGiver.getTasks()
	    //taskID = Object.keys(tasks)[0]
	    assert(Object.keys(os.taskGiver.getTasks()))
	})
	
	// it('should have a higher balance', async () => {

	//     await mineBlocks(os.web3, 110)

	//     await timeout(5000)

	//     const newBalance = new BigNumber(await os.web3.eth.getBalance(os.accounts[1]))
	//     console.log(newBalance)
	//     console.log(originalBalance)
	//     assert(originalBalance.isLessThan(newBalance))
	// })
    })
})
