const axios = require('axios');
const {FavoriteTech, News} = require('./models/index')
const {timeout} = require('./crawler')
require('dotenv').config();
const request = require('request');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const iconv = new Iconv('CP949', 'utf-8//translit//ignore');

module.exports = { news : async () => {
    try{
    console.log("news 호출!!")
    const favoriteTech = await FavoriteTech.findAll({attributes: ['id','title']});
    //console.log(favoriteTech[0].title);
    await News.destroy({where : {}, truncate: true});
    for(var index in favoriteTech){
    // timeout(1000);
    // console.log("-------검색어------")
    // //console.log(favoriteTech[index].title);
    // const naverArray = await axios.get(`https://openapi.naver.com/v1/search/news.json?query=${favoriteTech[index].title}&display=3&sort=sim`,{
    // headers : {
    //     'X-Naver-Client-Id': process.env.NAVER_ID,
    //     'X-Naver-Client-Secret': process.env.NAVER_SECRET,
    //     'content-type':'application/x-www-form-urlencoded',
    //     "Access-Control-Allow-Origin": "*",
    //     "Access-Control-Allow-Credentials": "true"
    // }
    // })
    // //console.log(naverArray)
    // await Promise.all(
    //     naverArray.data.items.map(news => 
    //       News.create({
    //         title: news.title,
    //         url: news.link,
    //         provider: 'naver',
    //         favoriteTechId: favoriteTech[index].id
    //       })
    //     )
    // )
    timeout(1000);
    const hackerArray = await axios.get(`http://hn.algolia.com/api/v1/search_by_date?query=${favoriteTech[index].title}&tags=story&restrictSearchableAttributes=url`,{
    headers : {
        'X-Naver-Client-Id': process.env.NAVER_ID,
        'X-Naver-Client-Secret': process.env.NAVER_SECRET,
        'content-type':'application/x-www-form-urlencoded',
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": "true"
    }
    })
    let hackerArrayThree = []
    const length = hackerArray.data.hits.length < 3 ? hackerArray.data.hits.length : 3
    for(var i=0;i<length;i++){
        hackerArrayThree.push(hackerArray.data.hits[i]);
    }

    await Promise.all(
        hackerArrayThree.map(news => 
          News.create({
            title: news.title,
            url: news.url,
            provider: 'hacker',
            favoriteTechId: favoriteTech[index].id
          })
        )
    )
    let url = 'https://www.google.co.kr/search?q='+favoriteTech[index].title+'&tbm=nws';
    const browser = await puppeteer.launch({headless:false});
    const page = await browser.newPage();
    await page.goto(url);
    await timeout(10000);
    const html = await page.content();
    const $ = cheerio.load(html);
    const temp = $('#res');
    const newsArray = $(temp[temp.length-1]).find('.g').find('.gG0TJc');
    for(var i=0;i<3;i++){
        await News.create({
            title: $(newsArray[i]).find('.l.lLrAF').text(),
            url: $(newsArray[i]).find('.l.lLrAF').attr('href'),
            provider: 'google',
            favoriteTechId: favoriteTech[index].id
          })
    }
    await browser.close();
    
    }
    console.log("------뉴스 종료------")
    }catch(err){
        console.log(err);
    }
}
}
