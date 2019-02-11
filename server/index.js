const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const http = require('http')
const Router = require('koa-router')
const Kafka = require('node-rdkafka')
const util = require('util')

function getUser(event) {
  const PAGE_ID = process.env.FB_PAGE_ID

  if (event.sender.id === PAGE_ID) {
    return event.recipient.id
  }
  else if (event.recipient.id === PAGE_ID){
    return event.sender.id
  }
  else {
    throw new Error('Non Existent User!')
  }
}


const producer = new Kafka.Producer({
  'metadata.broker.list': 'spinaltap-kafka:9092',
  'retry.backoff.ms': 200,
  'message.send.max.retries': 10,
  'socket.keepalive.enable': true,
  'queue.buffering.max.messages': 100000,
  'queue.buffering.max.ms': 1000,
  'batch.num.messages': 1000000
}, {}, {
  topic: 'chat-events'
});

producer.connect()

producer.on('event.error', err => {
  console.error('Error from producer');
  console.error(err);
})

const producerReady = new Promise((resolve, reject) => {
  producer.on('ready', () => {
    console.log('producer ready')
    resolve()
  })
})



const verifyToken = ctx => {
  if (ctx.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    ctx.body = ctx.query['hub.challenge']
    ctx.status = 200
  } else {
    ctx.body = 'invalid verify token'
    ctx.status = 401
  }
}

const handleEvents = async (ctx) => {
  await producerReady

  for (entry of ctx.request.body.entry) {
    try {
      console.log('+++ EVENT: ', util.inspect(entry, null, 8))
      const event = entry.messaging[0]
      const data = Buffer.from(JSON.stringify(event))
      producer.produce('chat-events', null, data, getUser(event))

    } catch (error) {
      console.error('[ERR] handleEvents: ', error)
    }
  }
  ctx.status = 200
}

const router = new Router()
router.get('/webhooks', verifyToken)

router.get('/hello', ctx => {
  ctx.body = 'not a world'
  ctx.status = 200

})
router.post('/webhooks', handleEvents)

const app = new Koa()
app
  .use(bodyParser())
  .use(router.routes())
  .use(router.allowedMethods())

http.createServer(app.callback()).listen(process.env.PORT || 8080)
