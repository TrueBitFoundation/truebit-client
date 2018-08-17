const depositsHelper = require('./depositsHelper')
const fs = require('fs')
const contract = require('./contractHelper')
const toTaskInfo = require('./util/toTaskInfo')
const toSolutionInfo = require('./util/toSolutionInfo')
const midpoint = require('./util/midpoint')
const toIndices = require('./util/toIndices')
const waitForBlock = require('./util/waitForBlock')
const setupVM = require('./util/setupVM')
const assert = require('assert')

const merkleComputer = require(__dirname+ "/webasm-solidity/merkle-computer")('./../wasm-client/ocaml-offchain/interpreter/wasm')

const wasmClientConfig = JSON.parse(fs.readFileSync(__dirname + "/webasm-solidity/export/development.json"))

function setup(httpProvider) {
    return (async () => {
	incentiveLayer = await contract(httpProvider, wasmClientConfig['tasks'])
	fileSystem = await contract(httpProvider, wasmClientConfig['filesystem'])
	disputeResolutionLayer = await contract(httpProvider, wasmClientConfig['interactive'])
	return [incentiveLayer, fileSystem, disputeResolutionLayer]
    })()
}

function getLeaf(lst, loc) {
    if (loc % 2 == 1) return lst[1]
    else return lst[0]
}

function parseId(str) {
    var res = ""
    for (var i = 0; i < str.length; i++) res = (str.charCodeAt(i)-65).toString(16) + res
    return "0x" + res;
}

function parseData(lst, size) {
    var res = []
    lst.forEach(function (v) {
        for (var i = 1; i <= 32; i++) {
            res.push(parseInt(v.substr(i*2, 2), 16))
        }
    })
    res.length = size
    return Buffer.from(res)
}

function arrange(arr) {
    var res = []
    var acc = ""
    arr.forEach(function (b) { acc += b; if (acc.length == 64) { res.push("0x"+acc); acc = "" } })
    if (acc != "") res.push("0x"+acc)
    return res
}

let tasks = {}
let games = {}

module.exports = {
    init: async (web3, account, logger, mcFileSystem) => {
	logger.log({
	    level: 'info',
	    message: `Solver initialized`
	})

	let [incentiveLayer, fileSystem, disputeResolutionLayer] = await setup(web3.currentProvider)

	const taskPostedEvent = incentiveLayer.Posted()
    
    async function loadMixedCode(fileid) {
        var hash = await fileSystem.getIPFSCode.call(fileid)
        console.log("code hash", hash, fileid)
        if (hash) {
            return (await mcFileSystem.download(hash, "task.wasm")).content
        }
        else {
			let wasmCode = await fileSystem.getCode.call(fileid)
			return Buffer.from(wasmCode.substr(2), "hex")
        }
    }
        
    async function loadFilesFromChain(id) {
        let lst = await fileSystem.getFiles.call(id)
        let res = []
        for (let i = 0; i < lst.length; i++) {
            let ipfs_hash = await fileSystem.getHash.call(lst[i])
            let name = await fileSystem.getName.call(lst[i])
            if (ipfs_hash) {
				let dataBuf = (await mcFileSystem.download(ipfsHash, name)).content
                res.push({name:name, dataBuf:dta.content})
            }
            else {
                let size = await fileSystem.getByteSize.call(lst[i])
                let data = await fileSystem.getData.call(lst[i])
                let buf = parseData(data, size)
                res.push({name:name, dataBuf:buf})
            }
        }
        return res
    }
        
    async function createFile(fname, buf) {
        var nonce = await web3.eth.getTransactionCount(account)
        var arr = []
        for (var i = 0; i < buf.length; i++) {
            if (buf[i] > 15) arr.push(buf[i].toString(16))
            else arr.push("0" + buf[i].toString(16))
        }
        // console.log("Nonce file", nonce, {arr:arr, buf:buf, arranged: arrange(arr)})
        var tx = await fileSystem.createFileWithContents(fname, nonce, arrange(arr), buf.length, {from: account, gas: 200000})
        var id = await fileSystem.calcId.call(nonce, {from: account, gas: 200000})
        var lst = await fileSystem.getData.call(id, {from: account, gas: 200000})
        console.log("Ensure upload", {data:lst})
        return id
    }

    function uploadIPFS(fname, buf) {
        return new Promise(function (cont,err) {
            ipfs.files.add([{content:buf, path:fname}], function (err, res) {
                cont(res[0])
            })
        })
    }

    async function createIPFSFile(fname, buf) {
        var hash = await uploadIPFS(fname, buf)
        var info = merkleComputer.merkleRoot(buf)
        var nonce = await web3.eth.getTransactionCount(base)
        logger.info("Adding ipfs file", {name:new_name, size:info.size, ipfs_hash:hash.hash, data:info.root, nonce:nonce})
        await fileSystem.addIPFSFile(new_name, info.size, hash.hash, info.root, nonce, {from: account, gas: 200000})
        var id = await fileSystem.calcId.call(nonce, {from: account, gas: 200000})
        return id
    }

    async function uploadOutputs(task_id, vm) {
        var lst = await incentiveLayer.getUploadNames.call(task_id)
        var types = await incentiveLayer.getUploadTypes.call(task_id)
        logger.info("Uploading", {names:lst, types:types})
        var proofs = await vm.fileProofs() // common.exec(config, ["-m", "-input-proofs", "-input2"])
        // var proofs = JSON.parse(proofs)
        logger.info("Uploading", {names:lst, types:types, proofs: proofs})
        for (var i = 0; i < lst.length; i++) {
            // find proof with correct hash
            console.log("Findind upload proof", {hash:lst[i], kind:types[i]})
            var hash = lst[i]
            var proof = proofs.find(el => getLeaf(el.name, el.loc) == hash)
            if (!proof) {
                logger.error("Cannot find proof for a file")
                continue
            }
            console.log("Found proof", proof)
            // upload the file to ipfs or blockchain
            var fname = proof.file.substr(0, proof.file.length-4)
            var buf = await vm.readFile(proof.file)
            var file_id
            if (parseInt(types[i]) == 1) file_id = await createIPFSFile(fname, buf)
            else {
                console.log("Create file", {fname:fname, data:buf})
                file_id = await createFile(fname, buf)
            }
            console.log("Uploading file", {id:file_id, fname:fname})
            console.log("result", await incentiveLayer.uploadFile.call(task_id, i, file_id, proof.name, proof.data, proof.loc, {from: account, gas: 1000000}))
            await incentiveLayer.uploadFile(task_id, i, file_id, proof.name, proof.data, proof.loc, {from: account, gas: 1000000})
        }
    }

    taskPostedEvent.watch(async (err, result) => {
	    if (result) {
		let taskID = result.args.id
		
		let minDeposit = result.args.deposit.toNumber()		

		let storageType = result.args.cs.toNumber()
		let storageAddress = result.args.stor
		let initStateHash = result.args.hash

		let solution, vm, interpreterArgs

		let solutionInfo = toSolutionInfo(await incentiveLayer.solutionInfo.call(taskID))

		if (solutionInfo.solver == '0x0000000000000000000000000000000000000000') {
		    await depositsHelper(web3, incentiveLayer, account, minDeposit)
		    logger.log({
			level: 'info',
			message: `Solving task ${taskID}`
		    })

		    if(storageType == merkleComputer.StorageType.BLOCKCHAIN) {
                console.log("storage address", storageAddress)
                if (storageAddress.substr(0,2) == "0x") {
                    let wasmCode = await fileSystem.getCode.call(storageAddress)

                    buf = Buffer.from(wasmCode.substr(2), "hex")

                    vm = await setupVM(
                        incentiveLayer,
                        merkleComputer,
                        taskID,
                        buf,
                        result.args.ct.toNumber(),
                        false
                    )
                }
                else {
                    let fileid = parseId(storageAddress)

                    let buf = await loadMixedCode(fileid)
                    let files = await loadFilesFromChain(fileid)

                    vm = await setupVM(
                        incentiveLayer,
                        merkleComputer,
                        taskID,
                        buf,
                        result.args.ct.toNumber(),
                        false,
                        files
                    )
                }
			
		    } else if(storageType == merkleComputer.StorageType.IPFS) {
			// download code file
			let codeIPFSHash = await fileSystem.getIPFSCode.call(storageAddress)
			
			let name = "task.wast"

			let codeBuf = (await mcFileSystem.download(codeIPFSHash, name)).content

			//download other files
			let fileIDs = await fileSystem.getFiles.call(storageAddress)

			let files = []

			if (fileIDs.length > 0) {
			    for(let i = 0; i < fileIDs.length; i++) {
				let fileID = fileIDs[i]
				let name = await fileSystem.getName.call(fileID)
				let ipfsHash = await fileSystem.getHash.call(fileID)
				let dataBuf = (await mcFileSystem.download(ipfsHash, name)).content
				files.push({
				    name: name,
				    dataBuf: dataBuf
				})				
			    }
			}
			
			vm = await setupVM(
			    incentiveLayer,
			    merkleComputer,
			    taskID,
			    codeBuf,
			    result.args.ct.toNumber(),
			    false,
			    files
			)
			
		    }

		    assert(vm != undefined, "vm is undefined")
		    
		    interpreterArgs = []
		    solution = await vm.executeWasmTask(interpreterArgs)

		    console.log(solution)
		    
		    try {
			
			await incentiveLayer.solveIO(
			    taskID,
			    solution.vm.code,
			    solution.vm.input_size,
			    solution.vm.input_name,
			    solution.vm.input_data,
			    {from: account, gas: 200000}
			)
            
			logger.log({
			    level: 'info',
			    message: `Submitted solution for task ${taskID} successfully`
			})
			
            await uploadOutputs(taskID, vm)
            
			logger.log({
			    level: 'info',
			    message: `Uploaded required files for ${taskID}`
			})
			

			tasks[taskID] = {
			    solution: solution,
			    vm: vm,
			    interpreterArgs: interpreterArgs
			}
            
            let currentBlockNumber = await web3.eth.getBlockNumber()

            waitForBlock(web3, currentBlockNumber + 105, async () => {
                
                if(await incentiveLayer.finalizeTask.call(taskID)) {
                    await incentiveLayer.finalizeTask(taskID, {from: account, gas:200000})
                    logger.log({
                        level: 'info',
                        message: `Task ${taskID} finalized`
                    })
                }
            })
			
		    } catch(e) {
			//TODO: Add logging unsuccessful submission attempt
			console.log(e)
		    }
		}
	    }
	})

	const startChallengeEvent = disputeResolutionLayer.StartChallenge()

	startChallengeEvent.watch(async (err, result) => {
	    if (result) {
		let solver = result.args.p
		let gameID = result.args.uniq
		if (solver.toLowerCase() == account.toLowerCase()) {

		    let taskID = (await disputeResolutionLayer.getTask.call(gameID)).toNumber()

		    logger.log({
			level: 'info',
			message: `Solution to task ${taskID} has been challenged`
		    })
		    
		    
		    //Initialize verification game
		    let vm = tasks[taskID].vm

		    let solution = tasks[taskID].solution

		    let initWasm = await vm.initializeWasmTask(tasks[taskID].interpreterArgs)

		    let lowStep = 0
		    let highStep = solution.steps + 1

		    games[gameID] = {
			lowStep: lowStep,
			highStep: highStep,
			taskID: taskID
		    }		    
		    
		    await disputeResolutionLayer.initialize(
			gameID,
			merkleComputer.getRoots(initWasm.vm),
			merkleComputer.getPointers(initWasm.vm),
			solution.steps + 1,
			merkleComputer.getRoots(solution.vm),
			merkleComputer.getPointers(solution.vm),
			{
			    from: account,
			    gas: 1000000
			}
		    )		    

		    logger.log({
			level: 'info',
			message: `Game ${gameID} has been initialized`
		    })

		    let indices = toIndices(await disputeResolutionLayer.getIndices.call(gameID))

		    //Post response to implied midpoint query
		    let stepNumber = midpoint(indices.low, indices.high)

		    let stateHash = await tasks[taskID].vm.getLocation(stepNumber, tasks[taskID].interpreterArgs)

		    await disputeResolutionLayer.report(gameID, indices.low, indices.high, [stateHash], {from: account})

		    logger.log({
			level: 'info',
			message: `Reported state hash for step: ${stepNumber} game: ${gameID} low: ${indices.low} high: ${indices.high}`
		    })

		    let currentBlockNumber = await web3.eth.getBlockNumber()
		    waitForBlock(web3, currentBlockNumber + 105, async () => {
			if(await disputeResolutionLayer.gameOver.call(gameID)) {
			    await disputeResolutionLayer.gameOver(gameID, {from: account})
			}
		    })
		    
		}
	    }
	})

	const queriedEvent = disputeResolutionLayer.Queried()

	queriedEvent.watch(async (err, result) => {
	    if (result) {
		let gameID = result.args.id
		let lowStep = result.args.idx1.toNumber()
		let highStep = result.args.idx2.toNumber()

		if(games[gameID]) {
		    
		    let taskID = games[gameID].taskID

		    logger.log({
			level: 'info',
			message: `Received query Task: ${taskID} Game: ${gameID}`
		    })
		    
		    if(lowStep + 1 != highStep) {
			let stepNumber = midpoint(lowStep, highStep)

			let stateHash = await tasks[taskID].vm.getLocation(stepNumber, tasks[taskID].interpreterArgs)

			await disputeResolutionLayer.report(gameID, lowStep, highStep, [stateHash], {from: account})
			
		    } else {
			//Final step -> post phases
			
			let lowStepState = await disputeResolutionLayer.getStateAt.call(gameID, lowStep)
			let highStepState = await disputeResolutionLayer.getStateAt.call(gameID, highStep)

			let states = (await tasks[taskID].vm.getStep(lowStep, tasks[taskID].interpreterArgs)).states

			await disputeResolutionLayer.postPhases(
			    gameID,
			    lowStep,
			    states,
			    {
				from: account,
				gas: 400000
			    }
			)

			logger.log({
			    level: 'info',
			    message: `Phases have been posted for game ${gameID}`
			})
			
		    }
		    
		    let currentBlockNumber = await web3.eth.getBlockNumber()	    
		    waitForBlock(web3, currentBlockNumber + 105, async () => {
			if(await disputeResolutionLayer.gameOver.call(gameID)) {
			    await disputeResolutionLayer.gameOver(gameID, {from: account})
			}
		    })
		    
		 }
	     }
	})

	const selectedPhaseEvent = disputeResolutionLayer.SelectedPhase()

	selectedPhaseEvent.watch(async (err, result) => {
	    if (result) {
		let gameID = result.args.id
		if (games[gameID]) {
		    let taskID = games[gameID].taskID
		    
		    let lowStep = result.args.idx1.toNumber()
		    let phase = result.args.phase.toNumber()

		    logger.log({
			level: 'info',
			message: `Phase ${phase} for game  ${gameID}`
		    })
		    

		    let stepResults = await tasks[taskID].vm.getStep(lowStep, tasks[taskID].interpreterArgs)

		    let phaseStep = merkleComputer.phaseTable[phase]

		    let proof = stepResults[phaseStep]

    		    let merkle = proof.location || []

    		    let merkle2 = []

		    if (proof.merkle) {
			merkle = proof.merkle.list || proof.merkle.list1 || []
			merkle2 = proof.merkle.list2 || []
		    }

    		    let m = proof.machine || {reg1:0, reg2:0, reg3:0, ireg:0, vm:"0x00", op:"0x00"}
		    let vm
		    if (typeof proof.vm != "object") {
			vm = {
			    code: "0x00",
			    stack:"0x00",
			    call_stack:"0x00",
			    calltable:"0x00",
			    globals : "0x00",
			    memory:"0x00",
			    calltypes:"0x00",
			    input_size:"0x00",
			    input_name:"0x00",
			    input_data:"0x00",
			    pc:0,
			    stack_ptr:0,
			    call_ptr:0,
			    memsize:0
			}
		    } else { vm = proof.vm }

		    if (phase == 6 && parseInt(m.op.substr(-12, 2), 16) == 16) {
			disputeResolutionLayer.callCustomJudge(
			    gameID,
			    lowStep,
			    m.op,
			    [m.reg1, m.reg2, m.reg3, m.ireg],
			    proof.merkle.result_state,
			    proof.merkle.result_size,
			    proof.merkle.list,
			    merkleComputer.getRoots(vm),
			    merkleComputer.getPointers(vm),
			    {from: account, gas: 500000}
			)

			//TODO
			//merkleComputer.getLeaf(proof.merkle.list, proof.merkle.location)
			//merkleComputer.storeHash(hash, proof.merkle.data)
		    } else {
    			await disputeResolutionLayer.callJudge(
    			    gameID,
    			    lowStep,
    			    phase,
    			    merkle,
    			    merkle2,
    			    m.vm,
    			    m.op,
    			    [m.reg1, m.reg2, m.reg3, m.ireg],
    			    merkleComputer.getRoots(vm),
    			    merkleComputer.getPointers(vm),
    			    {from: account, gas: 500000}
			)			
		    }
		    
		    logger.log({
			level: 'info',
			message: `Judge called for game ${gameID}`
		    })
		    
		}
	    }
	})

	return () => {
	    try {
		let empty = data => { }
		taskPostedEvent.stopWatching(empty)
		startChallengeEvent.stopWatching(empty)
		queriedEvent.stopWatching(empty)
		selectedPhaseEvent.stopWatching(empty)
	    } catch(e) {
	    }
	}
    }
}
