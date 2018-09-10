const assert = require('assert')
const timeout = require('../os/lib/util/timeout')
const BigNumber = require('bignumber.js')
const mineBlocks = require('../os/lib/util/mineBlocks')
const fs = require('fs')
const logger = require('../os/logger')

const contractsConfig = JSON.parse(fs.readFileSync("./wasm-client/contracts.json"))

const merkleComputer = require('../wasm-client/merkle-computer')()

let os, taskSubmitter

const config = JSON.parse(fs.readFileSync("./wasm-client/config.json"))
const info = JSON.parse(fs.readFileSync("./scrypt-data/info.json"))
const ipfs = require('ipfs-api')(config.ipfs.host, '5001', {protocol: 'http'})
const fileSystem = merkleComputer.fileSystem(ipfs)

before(async () => {
    os = await require('../os/kernel')("./wasm-client/config.json")
})

describe('Truebit OS WASM Scrypt test', async function() {
    this.timeout(600000)

    it('should have a logger', () => {
	assert(os.logger)
    })

    it('should have a web3', () => {
	assert(os.web3)
    })

    it('should have a solver', () => {
    	assert(os.solver)
    })
    
    describe('Normal task lifecycle', async () => {
	let killSolver, killTaskGiver

	let taskID
	
	let originalBalance

	let storageAddress, initStateHash, bundleID

	before(async () => {
	    taskSubmitter = await require('../wasm-client/taskSubmitter')(os.web3, os.logger, fileSystem)
            killTaskGiver = await os.taskGiver.init(os.web3, os.accounts[0], os.logger)
	    killSolver = await os.solver.init(os.web3, os.accounts[1], os.logger, fileSystem)
	})

	after(() => {
	    killTaskGiver()
	    killSolver()
	})

	it('should submit task', async () => {
	    let exampleTask = JSON.parse(fs.readFileSync("testWasmScrypt.json"))

	    //simulate cli by adding account and translating reward
	    exampleTask["from"] = os.accounts[0]
	    exampleTask["reward"] = os.web3.utils.toWei(exampleTask.reward, 'ether')
	    await taskSubmitter.submitTask(exampleTask)

	    await timeout(5000)
	    await mineBlocks(os.web3, 110)
	    await timeout(5000)
	    await mineBlocks(os.web3, 110)
	    await timeout(5000)
	})

	// it('should upload task code', async () => {
        //     let codeBuf = fs.readFileSync("./scrypt-data/task.wasm")
        //     let ipfsHash = (await fileSystem.upload(codeBuf, "task.wasm"))[0].hash
            
        //     assert.equal(ipfsHash, info.ipfshash)
	// })
	
	// let scrypt_contract
	// let scrypt_result

	// it('should deploy test contract', async () => {
        //     let MyContract = truffle_contract({
	// 	abi: JSON.parse(fs.readFileSync("./scrypt-data/compiled/Scrypt.abi")),
	// 	unlinked_binary: fs.readFileSync("./scrypt-data/compiled/Scrypt.bin"),
        //     })
        //     MyContract.setProvider(web3.currentProvider)

        //     scrypt_contract = await MyContract.new(contractsConfig.incentiveLayer.address, contractsConfig.tru.address, contractsConfig.fileSystem.address, info.ipfshash, info.codehash, {from:account, gas:2000000})
        //     let result_event = scrypt_contract.GotFiles()
        //     result_event.watch(async (err, result) => {
	// 	console.log("got event, file ID", result.args.files[0])
	// 	result_event.stopWatching(data => {})
	// 	let fileid = result.args.files[0]
	// 	var lst = await tbFilesystem.getData(fileid)
	// 	console.log("got stuff", lst)
	// 	scrypt_result = lst[0]
        //     })
        //     tru.transfer(scrypt_contract.address, "100000000000", {from:account, gas:200000})
	// })
	
	// it('should submit task', async () => {
        //     scrypt_contract.submitData("testing", {from:account, gas:2000000})
	// })

	// it('wait for task', async () => {

	//     await timeout(15000)
	//     await mineBlocks(os.web3, 110)
	//     await timeout(5000)
	//     await mineBlocks(os.web3, 110)
	//     await timeout(5000)
            
	//     await mineBlocks(os.web3, 110)
	//     await timeout(5000)
            
        //     assert.equal(scrypt_result, '0x78b512d6425a6fe9e45baf14603bfce1c875a6962db18cc12ecf4292dbd51da6')
            
	// })
    })
})
