const clear = require('clear')
const figlet = require('figlet')
const chalk = require('chalk')
const minimist = require('minimist')

const readline = require('readline')
const rl = readline.createInterface(process.stdin, process.stdout)

const mineBlocks = require('./lib/util/mineBlocks')

const fs = require('fs')

let configPath = process.argv[2]

let os, taskSubmitter

function setup(configPath) {
  (async () => {
    os = await require('./kernel')(configPath)
    taskSubmitter = require('../basic-client/taskSubmitter')(os.web3)
    //console.log("Truebit OS has been initialized with config at " + configPath)
  })()
}

setup(configPath)

function skipHelper(n) {
  (async () => {
    await mineBlocks(os.web3, n)
  })()
}

function printBar() {
  let i = 0
  let output = ""
  let len = process.stdout.columns
  while(i < len) {
    output += "-"
    i++
  }
  console.log(chalk.magenta(output))
}

clear()
console.log(
  chalk.green(
    figlet.textSync('Truebit:', { horizontalLayout: 'full' })
  )
)

console.log(
  chalk.blue(
    figlet.textSync('task solve verify')
  )
)
console.log()

console.log("Enter `help` to see the list of commands.")

printBar()

function helpHelper(command) {

  const commands = {

    "start": [
      "begins a Truebit process. Possible commands are `task`, `solve`, or `verify`",
      "options:",
      " -a specifies the account to use"
    ].join("\n"),

    "config": "creates a default config.json file, or reloads the existing config file",
    "networks": "lists the available networks in the currently loaded config",
    "accounts": "lists the available accounts on the network. Requires a running session.",
    "balance": "shows the current balance of an account. \n options: \n -a specifies the account number",

    "task": [
      "Creates a new task on the incentive layer.",
      "options:",
      " -a specifies the 'account' number to use",
      " -d specifies the 'minimum deposit'",
      " -t specifies the file path to the task json data"
    ].join("\n"),

    "help": "outputs the list of commands. Takes a command as argument to get more info.",
    "quit": "closes the Truebit client terminal session",
    "q": "synonym for `quit`",
  }

  if (command) {
    if(command in commands) {
      console.log(command + " -- " + commands[command])
    } else {
      console.log(command + " is not a valid command.")
    }
  } else {
    console.log("Enter `help` [command] for more info. To get started take a look at the `start` command (Ex: `help start`). Possible commands: \n" +  Object.keys(commands).join("\n") )
  }
}

function networksHelper() {
  Object.keys(os.config.networks).forEach((net) => { console.log(net) })
}

function argsParser(tokens) {
  let newTokens = tokens.slice(1)
  let args = []
  for(i = 0; i < newTokens.length; i++) {
    if(newTokens[i].includes("-")) {
      args.push([newTokens[i], newTokens[i+1]].join(" "))
    }
  }
  return minimist(args)
}


let sessions = {}

async function taskGiver(options) {
  if(options['a']) {
    const account = os.accounts[options['a'].trim()]

    if(options['t']) {
      fs.readFile(options['t'].trim(), (err, data) => {
        if (err) {
          throw err
        } else {
          let taskData = JSON.parse(data)
          taskData["from"] = account
          taskData["reward"] = os.web3.utils.toWei(taskData.reward, 'ether')
          taskSubmitter.submitTask(taskData)
        }
      })
    } else {
      throw "No task file specified. Make sure to use the `-t` flag."
    }
  } else {
    throw "account not specified. Make sure to use the `-a` flag."
  }
}

function addToSession(account, command, network, cb) {
  if(!sessions[account]) {
    sessions[account] = {}
  }
  if(sessions[account][command]) {
    throw command + " for " + account + " already running."
  } else {
    let session = {}
    session[command] = network
    sessions[account] = session
    cb()
  }
}

function startHelper(command, options) {
  if(options['a']) {
    const account = os.accounts[options['a'].trim()]
    switch(command) {
      case "task":
        //addToSession(account, command, "development", () => {
          os.taskGiver.init(os.web3, account, os.logger)
          console.log("Task Giver initialized")
        //})
        break
      case "solve":
        //addToSession(account, command, "development", () => {
          os.solver.init(os.web3, account)
          console.log("Solver initialized")
        //})
        break
      case "verify":
        os.verifier.init(os.web3, account)
        break
      default:
        throw command + " not available"
    }
  } else {
    throw "account not specified. Make sure to use the `-a` flag."
  }
}

async function exec(line) {
  let tokens = line.split(" ")
  let command = tokens[0]
  switch(command) {
    case "q":
      rl.close()
      break
    case "quit":
      rl.close()
      break
    case "help":
      helpHelper(tokens[1])
      break
    case "config":
      configHelper()
      break
    case "networks":
      networksHelper()
      break
    case "accounts":
      console.log(os.accounts)
      break
    case "balance":
      let args = argsParser(tokens)
      if(!args['a']) {
        throw 'no account number specified. Use `-a` to specify which account balance you want to see'
      } else {
        console.log(await os.web3.eth.getBalance(session.accounts[args['a'].trim()]))
      }
      break
    case "start":
      startHelper(tokens[1], argsParser(tokens))
      break
    case "task":
      taskGiver(argsParser(tokens))
      console.log("Task submitted")
      break
    case "skip":
      skipHelper(tokens[1])
    case "view":
      //start visualizer
      break
    case "estimate":
      //estimate cost of file using specified vm
      break
    default:
      console.log(command + " is not a valid command. Try running `help` to see the list of valid commands.")
  }
  console.log()
  rl.prompt()
}

rl.setPrompt('> ')
rl.prompt()

rl
.on('line', exec)
.on('close',function() {
  console.log("Goodbye!")
  process.exit(0)
})

process.on('uncaughtException', function(e) {
	console.log()
  console.log(chalk.red(e))
  rl.prompt()
})