const Crawler = require('crawler');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const util = require('util');
const {Company,Hire,Category,HireTech} = require('./models/index');
const {Op} = require('sequelize');


function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const companyCrawlerQueue = async (array) => {
  try{
  var linkTotal = [];

  for(var i=0;i<array.length;i++){
    var {linkArray, count} = await companyCrawler(array[i],1);
    
    for(var index in linkArray){
      linkTotal.push(linkArray[index]);
    }
    
    for(var j=2; j<count+1;j++){
      var {linkArray} = await companyCrawler(array[i], j);
      for(var index in linkArray){
        linkTotal.push(linkArray[index]);
      }
    }
  }
  return Promise.resolve(linkTotal);
}catch(err){
console.log(err)
}
}

//기업 크롤러
async function companyCrawler(keyword,pageNum){
  try{
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://www.rocketpunch.com/jobs?keywords='+keyword+'&page='+pageNum);
  await timeout(10000);
  //await page.screenshot({path: 'example.png'});
  const html = await page.content();
  const $ = await cheerio.load(html);
  const logo = await $('#search-results').find('#company-list').find('.company.item').find('.ui.logo').find('img');
  const company = await $('#search-results').find('#company-list').find('.company.item').find('.content');
  const companyName = await $(company).find('.header.name');
  const companyLink = $('#search-results').find('#company-list').find('.company.item').find('.logo.image').find('a');
  const companyDescription = await $(company).find('.description');
  const hireTitleLink = await $('#search-results').find('#company-list').find('.company.item').find('.content').find('.nowrap.job-title.primary.link');
  const companyCategory = $('#search-results').find('#company-list').find('.company.item').find('.nowrap.meta');
  const pageNumArray = $('.tablet.computer.large.screen.widescreen.only').find('a');
  console.log(`-------------------${keyword} 검색 결과---------------------`)
  //회사 이름
  let companyNameArray = [];
  for(var i=0;i<companyName.length;i++){
    const companyNameValueTemp = $(companyName[i]).text().replace(/[\r\n]/g,'');
    const companyNameValue = companyNameValueTemp.trim().replace('          ','');;
    companyNameArray.push(companyNameValue);
  }
  //회사 설명
  let companyDescriptionArray = [];
  for(var i=0;i<companyDescription.length;i++){
    companyDescriptionArray.push($(companyDescription[i]).text());
  }
  //회사 로고
  let logoArray = [];
  for(var i=0;i<logo.length;i++){
    logoArray.push($(logo[i]).attr('src'));
  }
  //산업 분야
  let companyCategoryArray = [];
  for(var i=0;i<companyCategory.length;i++){
    let cleanCategory = $(companyCategory[i]).text().replace(/[(0-9)]/gi,"");
    cleanCategory = cleanCategory.replace(/\n/g,"");
    cleanCategory = cleanCategory.split("∙");

    const category = cleanCategory.map(data => {
      return data.replace(/ /gi,"");
    })
    companyCategoryArray.push(category);
  }
  //기업 링크
  let companyLinkArray = [];
  for(var i=0;i<companyLink.length;i++){
    const companyLinkResult = 'https://www.rocketpunch.com'+$(companyLink[i]).attr('href');
    companyLinkArray.push(companyLinkResult);
  }

  //채용 링크들
  let linkArray = [];
  for(var i=0;i<hireTitleLink.length;i++){
    const hireTitleLinkResult = 'https://www.rocketpunch.com'+$(hireTitleLink[i]).attr('href');
    linkArray.push(hireTitleLinkResult);
  }

  // console.log("---회사명---")
  // console.log(companyNameArray)
  // console.log("---회사설명---")
  // console.log(companyDescriptionArray)
  // console.log("---회사로고---")
  // console.log(logoArray);
  // console.log("---산업분야---")
  // console.log(companyCategoryArray)
  // console.log("---기업링크---")
  // console.log(companyLinkArray);


  // Company Hook 생성

  await Company.addHook('beforeUpdate','companyCrawler',(company,options)=>{
    const oldCompany = company._previousDataValues;
    const newCompany = company.dataValues;
    if(oldCompany.brand != newCompany.brand || oldCompany.logo != newCompany.logo 
      || oldCompany.url != newCompany.url || oldCompany.intro != newCompany.intro){
        newCompany.status = 'update'
      }
  })

  for(var i=0;i<companyNameArray.length; i++){
    const exCompany = await Company.find({where: {brand: companyNameArray[i], provider: 'rocketpunch'}});
    if(!exCompany){ // 기업이 없는 경우 생성
    const company = await Company.create({
      brand: companyNameArray[i],
      logo: logoArray[i],
      companyUrl: companyLinkArray[i],
      intro: companyDescriptionArray[i],
      status: 'new',
      provider: 'rocketpunch'
    })
  
    const result = await Promise.all(
      companyCategoryArray[i].map(category => 
        Category.findOrCreate({
          where: {title: category}
        })
      )
    )
   
    await company.addCategories(result.map(r => r[0]));
  
    }else{ // 기업이 있는 경우 업데이트
      const company = await Company.update({
        logo: logoArray[i],
        companyUrl: companyLinkArray[i],
        intro: companyDescriptionArray[i],
        status: null
      },{
        where: { brand: companyNameArray[i], provider: 'rocketpunch'}, individualHooks: true, plain: true
      })
      
      const result = await Promise.all(
        companyCategoryArray[i].map(category => 
          Category.findOrCreate({
            where: {title: category}
          })
        )
      )
    
      const updatedCompany = await Company.find({where: {brand: companyNameArray[i], provider: 'rocketpunch'}});
      //관계 수정
      await updatedCompany.setCategories(result.map(r => r[0]));
    }
  }
  
  const count = parseInt($(pageNumArray[pageNumArray.length-1]).text());
  await browser.close();

  await Company.removeHook('beforeUpdate','companyCrawler')
  return {linkArray, count};
}catch(err){
  console.log(err);
}
}


//채용 크롤러
async function hireCrawler(url){

  let validHire = [];
  //Hire Hook 생성
  await Hire.addHook('beforeUpdate','hireCrawler',(hire,options)=>{
    const oldHire = hire._previousDataValues;
    const newHire = hire.dataValues;
    const oldHireDeadLine = oldHire.deadLine ? oldHire.deadLine.toString() : null;
    const newHireDeadLine = newHire.deadLine ? newHire.deadLine.toString() : null;
    if(oldHire.importantInfo != newHire.importantInfo || oldHire.detailInfo != newHire.detailInfo || 
      oldHire.hireImage != newHire.hireImage || oldHire.address != newHire.address || 
      oldHire.experience != newHire.experience || oldHire.salary != newHire.salary || 
      oldHire.hireUrl != newHire.hireUrl || oldHireDeadLine != newHireDeadLine){
        newHire.status = 'update'
      }
  })

  try{
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url);
    await timeout(6000);
    //await page.screenshot({path: 'example.png'});
    const html = await page.content();
    const $ = await cheerio.load(html);
    const companyName = $('.job-company').find('.company-name').find('a').text();
      const hireTitle = $('.nowrap.job-title').text();
      const hireImportantInfo = $('.duty.loading').text().replace('더 보기','');
      const hireDetailInfo = $('#job-content').find('#content-plain').attr('value');
      const hireImage = $('.job-image').find('img').attr('src');
      const temp = $('.row').find('.ui.job-infoset-content.items')
      const itemTemp = $(temp[0]).find('.item');
      const title = $(itemTemp).find('.title');
      const content = $(itemTemp).find('.content');
      const hireTechArray = $('.job-specialties').find('.ui.circular.basic.label');
      let address;
      let experience;
      let salary;
      let deadLine;
      let hireTech = [];
      for(var i=0;i<title.length;i++){
        if($(title[i]).text() === '경력 여부'){
          experience = $(content[i]).text().replace(/\s/g,'');
        }else if($(title[i]).text() === '연봉'){
          salary = $(content[i]).text().replace(/\s/g,'');
        }else if($(title[i]).text() === '마감일'){
          const date = $(content[i]).text().replace(/\s/g,'');
          if(date === '수시채용'){
            deadLine = undefined;
          }else{
            deadLine = new Date(date);
            deadLine.setHours(deadLine.getHours()-9);
          }
        }else if($(title[i]).text() === '지역'){
          //address = $(content[i]).text().replace(/\s/g,'');
          address = $(content[i]).text();
          if(address==="" || address=== " "){
            address = undefined;
          }
        }
      }
      for(var i=0;i<hireTechArray.length;i++){
        hireTech.push($(hireTechArray[i]).text());
      }
      // console.log(`--------------${companyName}----------------`)
      // console.log("채용타이틀: ",hireTitle);
      // console.log("주요업무: ",hireImportantInfo);
      // console.log("채용상세: ",hireDetailInfo);
      // console.log("채용공고: ",hireImage);
      // console.log("지역: ",address);
      // console.log("경력: ",experience);
      // console.log("연봉: ",salary);
      // console.log("마감일: ",deadLine);
      // console.log("요구기술스택: ",hireTech);
      console.log(companyName);
      const company = await Company.find({where: {brand: companyName, provider: 'rocketpunch'}});
      
      const exHire = await company.getHires({where : {title: hireTitle, provider: 'rocketpunch'}});
      
      if(exHire.length===0){ //채용이 없는 경우
        const hire = await Hire.create({
          title: hireTitle,
          importantInfo: hireImportantInfo,
          detailInfo: hireDetailInfo,
          hireImage: hireImage,
          address: address,
          experience: experience,
          salary: salary,
          deadLine: deadLine,
          provider: 'rocketpunch',
          hireUrl: url,
          status: 'new'
        })
        
        const result = await Promise.all(
          hireTech.map(tech => 
            HireTech.findOrCreate({
              where: { title: tech }
            })
          )
        )
        await hire.addHireTeches(result.map(r => r[0]));
        await company.addHires(hire);
      }else{ //채용이 있는 경우
        const hire = await Hire.update({
          importantInfo: hireImportantInfo,
          detailInfo: hireDetailInfo,
          hireImage: hireImage,
          address: address,
          experience: experience,
          salary: salary,
          deadLine: deadLine,
          hireUrl: url,
          status: null
        },{where: {title: hireTitle, provider: 'rocketpunch'},individualHooks: true, plain: true})

        const result = await Promise.all(
          hireTech.map(tech => 
            HireTech.findOrCreate({
              where: {title: tech}
            })
          )
        )

        const updatedHire = await Hire.findOne({where: {companyId: company.id, title: hireTitle, provider: 'rocketpunch'}});
        await updatedHire.setHireTeches(result.map(r => r[0]));
       
      }

      await Hire.findAll();

      await Hire.removeHook('beforeUpdate','hireCrawler');
      await browser.close();
  }catch(err){
    console.log(err);
  }
}

const hireCrawlerQueue = async (array) => {
  try{
    for(var index in array){
      await hireCrawler(array[index]);
    }

    await Hire.addHook('afterFind','hireCrawler',(array,options)=>{
      for(var i=0; i< array.length; i++){
        const today = new Date();
        console.log("오늘날짜(월): ",today.getMonth()+1);
        console.log("오늘날짜(일): ",today.getDate());
        console.log(today);
        console.log(array[i].dataValues.updatedAt);
        console.log(array[i].dataValues.deadLine);
        
        if(array[i].dataValues.provider === 'rocketpunch'){
        const btMsUpdate = today.getTime() - array[i].dataValues.updatedAt.getTime();
        const btDayUpdate = btMsUpdate / (1000*60*60*24);
        if(btDayUpdate >= 1){
          array[i].dataValues.status = 'end';
        }
        console.log("업데이트 경과일: ",btDayUpdate);
        }
        if(array[i].dataValues.deadLine){
        const btMsDeadLine = today.getTime() - array[i].dataValues.deadLine.getTime();
        const btDayDeadLine = btMsDeadLine / (1000*60*60*24);
        if(btDayDeadLine >= 1){
          array[i].dataValues.status = 'end';
        }
        console.log("마감일 경과일: ",btDayDeadLine)
        }
      }
    })
    await Hire.findAll();
    await Hire.removeHook('afterFind','hireCrawler');
    console.log("---------------------")
    console.log("------완 료--------")
    console.log("----------------------")
}catch(err){
console.log(err)
}
}


module.exports = {companyCrawlerQueue, hireCrawlerQueue, timeout};
