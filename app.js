const express = require('express');
const path = require('path');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv').config();
const app = express();
const util = require('util');
const {sequelize} = require('./models/index');
const {User,} = require('./models/index');
const cron = require('node-cron');
const {news} = require('./news');
const {companyCrawlerQueue, hireCrawlerQueue} = require('./crawler');
sequelize.sync()
app.set('port', process.env.PORT);
app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
const redis = require('redis');
const startCrawler = async () => {
  const client = await redis.createClient({
    host: process.env.REDIS_HOST,
    no_ready_check: true,
    auth_pass: process.env.REDIS_PASSWORD,
    port: process.env.REDIS_PORT
  });
  const linkTotal = await companyCrawlerQueue(['Node.js','Amazone AWS','Python','React.js','Redux','MySQl','Javascript','CSS3','Bootstrap','Git','Redis','jQuery','MongoDB','HTML5','es6','react-native','Swift','WebSocket','Sass','django']);
  await hireCrawlerQueue(linkTotal);
  await client.flushall((err,succeed)=>{
    if(err){
      console.log(err)
    }else{
    console.log("-------------------------")
    console.log("------redis flushed------")
    console.log("flushed redis!!")
    }
  });
}

//startCrawler();

cron.schedule('00 1 * * *',()=>{
  startCrawler();
})

cron.schedule('30 1 * * *',()=>{
  news();
})

// startCrawler();
// news()
const insertUser = async ()=>{
await User.findOrCreate({
  where:{
  snsId: 'test',
  email: 'test@gmail.com',
  nick: 'testUser',
  profile: 'asdfasdf',
  blog: 'test@blog.com',
  github: 'test@github.com',
  phone: '010-0000-0000',
  provider: 'kakao',
  photo: 'dsfisgfdg'
  }
})
}

// insertUser();
startCrawler();
news();
app.use((req, res, next) => {
    const err = new Error('Not Found')
    err.status = 404
    next(err)
  })
  
  app.use((err, req, res) => {
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {}
    res.status(err.status || 500)
    res.render('error')
    console.log(err);
  })
  
  app.listen(app.get('port'), () => {
    console.log(`${app.get('port')} 포트에서 서버 실행`)
  })
