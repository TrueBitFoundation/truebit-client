const assert = require('assert')

const timeout = require('../os/lib/util/timeout')

const BigNumber = require('bignumber.js')

const mineBlocks = require('../os/lib/util/mineBlocks')

const fs = require('fs')

const logger = require('../os/logger')
const contract = require('../wasm-client/contractHelper')
var truffle_contract = require("truffle-contract");

const merkleComputer = require('../wasm-client/webasm-solidity/merkle-computer')()

const wasmClientConfig = JSON.parse(fs.readFileSync("./wasm-client/webasm-solidity/export/development.json"))

let os

const config = JSON.parse(fs.readFileSync("./wasm-client/config.json"))
const info = JSON.parse(fs.readFileSync("./scrypt-data/info.json"))
const ipfs = require('ipfs-api')(config.ipfs.host, '5001', {protocol: 'http'})
const fileSystem = merkleComputer.fileSystem(ipfs)

function arrange(arr) {
    var res = []
    var acc = ""
    arr.forEach(function (b) { acc += b; if (acc.length == 64) { res.push("0x"+acc); acc = "" } })
    if (acc != "") res.push("0x"+acc)
    console.log(res)
    return res
}

function stringToBytes(str) {
    return "0x" + Buffer.from(str).toString("hex")
}

let account
let web3


before(async () => {
    os = await require('../os/kernel')("./wasm-client/config.json")
    account = os.accounts[0]
    
    web3 = os.web3
})

describe('Truebit OS WASM Scrypt test', async function() {
    this.timeout(60000)

    it('should have a logger', () => {
	assert(os.logger)
    })

    it('should have a web3', () => {
	assert(os.web3)
    })

    it('should have a solver', () => {
    	assert(os.solver)
    })
    
    let tbFilesystem
    
    async function createFile(fname, buf) {
        var nonce = await web3.eth.getTransactionCount(config.base)
        var arr = []
        for (var i = 0; i < buf.length; i++) {
            if (buf[i] > 15) arr.push(buf[i].toString(16))
            else arr.push("0" + buf[i].toString(16))
        }
        console.log("Nonce", nonce, {arr:arrange(arr)})
        var tx = await filesystem.createFileWithContents(fname, nonce, arrange(arr), buf.length, {from:account})
        var id = await filesystem.calcId.call(nonce, {from:account})
        return id
    }

    describe('Normal task lifecycle', async () => {
	let killSolver

	let taskID
	
	let originalBalance

	let storageAddress, initStateHash, bundleID

	before(async () => {
        tbFilesystem = await contract(web3.currentProvider, wasmClientConfig['filesystem'])
	    killSolver = await os.solver.init(os.web3, os.accounts[1], os.logger, fileSystem)
	})

	after(() => {
	    killSolver()
	})

	it('should upload task code', async () => {
        let codeBuf = fs.readFileSync("./scrypt-data/task.wasm")
        let ipfsHash = (await fileSystem.upload(codeBuf, "task.wasm"))[0].hash
        
        assert.equal(ipfsHash, info.ipfshash)
    })
    
    let scrypt_contract
    let scrypt_result

	it('should deploy test contract', async () => {
        let config = JSON.parse(fs.readFileSync("./wasm-client/webasm-solidity/config.json"))
        let MyContract = truffle_contract({
            abi: JSON.parse(fs.readFileSync("./scrypt-data/compiled/Scrypt.abi")),
            unlinked_binary: fs.readFileSync("./scrypt-data/compiled/Scrypt.bin"),
        })
        MyContract.setProvider(web3.currentProvider)

        scrypt_contract = await MyContract.new(config.tasks, config.fs, info.ipfshash, info.codehash, {from:account, gas:2000000})
        let result_event = scrypt_contract.GotFiles()
        result_event.watch(async (err, result) => {
            console.log("got event, file ID", result.args.files[0])
            let empty = data => { }
            result_event.stopWatching(empty)
            let fileid = result.args.files[0]
            var lst = await tbFilesystem.getData(fileid)
            console.log("got stuff", lst)
            scrypt_result = lst[0]
        })
    })
    
	it('should submit task', async () => {
        scrypt_contract.submitData("testing", {from:account, gas:2000000})
    })

	it('wait for task', async () => {

	    await timeout(15000)
	    await mineBlocks(os.web3, 110)
	    await timeout(5000)
        
        assert.equal(scrypt_result, '0x78b512d6425a6fe9e45baf14603bfce1c875a6962db18cc12ecf4292dbd51da6')
        
	})
    
    })
})
