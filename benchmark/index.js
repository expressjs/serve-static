const EventEmitter = require('events')
const cp = require('child_process')
const path = require('path')

const targets = [
  path.resolve(__dirname, 'targets/simple.js'),
  path.resolve(__dirname, 'targets/static-cache.js')
]

class AutocannonBench extends EventEmitter {
  constructor (options) {
    super(options)
    this.options = options || {}
  }

  run (options) {
    const exectuable = path.resolve(__dirname, '../node_modules/autocannon/autocannon.js')

    const args = [
      '-d',
      this.options.duration || options.duration, // sec
      '-c',
      this.options.connections || options.connections,
      // '-j',
      // '-n',
      `http://127.0.0.1:${this.options.port || options.port}${this.options.path || options.path || ''}`
    ]

    return cp.spawnSync(exectuable, args, { stdio: 'inherit' })
  }
}

function runBench (target, cb) {
  let hasCalled = false

  const bench = new AutocannonBench()
  const child = cp.spawn(process.argv[0], [target], { stdio: [0, 1, 2, 'ipc'] })

  child.on('message', (msg) => {
    if (msg === 'ready') {
      bench.run({ duration: 100, connections: 10, port: 3000 })
      child.kill()
    }
  })

  child.on('error', (err) => {
    if (hasCalled) return
    hasCalled = true

    cb(err)
  })

  child.on('close', () => {
    if (hasCalled) return
    hasCalled = true

    cb(null)
  })
}

function run (targets, index = 0) {
  console.log('Running benchmark:')
  console.log(targets[index])
  console.log('\n')

  runBench(targets[index], (err) => {
    if (err) throw err

    if (++index >= targets.length) return

    console.log('\n')
    run(targets, index)
  })
}

run(targets)
